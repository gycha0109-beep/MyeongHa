import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  createSajuHeldStagingPostgresAdmissionPortV1,
  canonicalSajuHeldStagingPermitApprovalBytesV1,
} from '../apps/api/src/saju-held-staging-admission-postgres-v1.js';
import { SAJU_HELD_STAGING_ADMISSION_CONTRACT_VERSION_V1 } from '../apps/api/src/saju-held-staging-admission-contract-v1.js';
import { SAJU_HELD_STAGING_TARGET_MANIFEST_VERSION_V1,
  digestSajuHeldStagingTargetManifestV1 } from '../apps/api/src/saju-held-staging-target-manifest-v1.js';
import type { PostgresSubjectPoolV1 } from '../apps/api/src/postgres-subject-execution.js';

const NOW = 1_800_000_000_000;
const keys = generateKeyPairSync('ed25519');

function fixture(overrides: { issue?: Record<string, unknown>, manifest?: Record<string, unknown>,
  unavailable?: string, returns?: 'wrong' | 'two', pool?: PostgresSubjectPoolV1 } = {}) {
  const manifest = {
    version: SAJU_HELD_STAGING_TARGET_MANIFEST_VERSION_V1,
    environmentId: 'myeongha-staging-admission-test',
    myeonghaCommitSha: 'a'.repeat(40), sajuCommitSha: 'b'.repeat(40),
    authProjectRef: 'abcdefghijklmnopqrst',
    authOrigin: 'https://abcdefghijklmnopqrst.supabase.co',
    subjectDbTargetId: 'staging-subject:login', nonceDbTargetId: 'staging-nonce:login',
    proofServiceOrigin: 'https://proof.staging.example.com',
    proofIssuer: 'saju-preview-service', proofAudience: 'myeongha-staging-api',
    proofKeyId: 'proof-key-v1', proofTtlMs: 60_000,
    ...overrides.manifest,
  };
  const permit = {
    version: SAJU_HELD_STAGING_ADMISSION_CONTRACT_VERSION_V1,
    permitId: '123e4567-e89b-42d3-a456-426614174000',
    manifestDigest: digestSajuHeldStagingTargetManifestV1(manifest),
    environmentId: manifest.environmentId,
    myeonghaCommitSha: manifest.myeonghaCommitSha,
    sajuCommitSha: manifest.sajuCommitSha,
    approvedOperatorId: 'separate-operator', issuedAtMs: NOW - 10_000,
    expiresAtMs: NOW + 60_000, consumedAtMs: null,
    status: 'ISSUED', approvalSignatureKeyId: 'approved-ed25519-01',
    ...overrides.issue,
  };
  const signature = sign(null, canonicalSajuHeldStagingPermitApprovalBytesV1(permit),
    keys.privateKey).toString('base64url');
  const sql: { text: string, args?: readonly unknown[] }[] = [];
  const claimed = new Set<string>();
  const release = vi.fn();
  const pool: PostgresSubjectPoolV1 = overrides.pool ?? {
    async connect() {
      if (overrides.unavailable === 'connect') throw Error('SECRET_CONNECT_FAILURE');
      return {
        async query<Row = Record<string, unknown>>(text: string, args?: readonly unknown[]) {
          sql.push({ text, args });
          if (overrides.unavailable === 'begin' && text === 'BEGIN') throw Error('SECRET_BEGIN');
          if (overrides.unavailable === 'role' && text.startsWith('SET LOCAL')) throw Error('SECRET_ROLE');
          if (overrides.unavailable === 'commit' && text === 'COMMIT') throw Error('SECRET_COMMIT');
          if (overrides.unavailable === 'rollback' && text === 'ROLLBACK') throw Error('SECRET_ROLLBACK');
          if (text.startsWith('update public.saju_staging_operator_admission_permits')) {
            if (overrides.unavailable === 'update') throw Error('SECRET_UPDATE');
            if (overrides.returns === 'two') return { rows: [
              { permitId: args?.[0] }, { permitId: args?.[0] },
            ] as Row[] };
            if (overrides.returns === 'wrong') return { rows: [
              { permitId: 'other-id' },
            ] as Row[] };
            const id = String(args?.[0]);
            if (claimed.has(id)) return { rows: [] };
            claimed.add(id);
            return { rows: [{ permitId: id }] as Row[] };
          }
          return { rows: [] };
        },
        release,
      };
    },
  };
  const options = {
    approvedManifest: manifest, manifest, permit,
    approvalSignature: signature,
    expectedOperatorId: 'separate-operator', expectedApprovalKeyId: 'approved-ed25519-01',
    approvalPublicKey: keys.publicKey, pool, nowMsFactory: () => NOW,
  };
  return { options, permit, manifest, sql, release, pool };
}

describe('8C-2B-2C independent operator signed Postgres one-shot admission (synthetic)', () => {
  it('is inert at construction; validates the external signature before one conditional DB UPDATE', async () => {
    const f = fixture();
    const port = createSajuHeldStagingPostgresAdmissionPortV1(f.options);
    expect(f.sql).toHaveLength(0);
    expect(Object.isFrozen(port)).toBe(true);
    expect(await port.consumeAuthorizedAttemptOnce()).toBe(true);
    expect(await port.consumeAuthorizedAttemptOnce()).toBe(false);
    expect(f.sql.map(x => x.text.startsWith('update public.') ? 'UPDATE' : x.text))
      .toEqual(['BEGIN', 'SET LOCAL ROLE myeongha_saju_staging_admission_runtime',
        'UPDATE', 'COMMIT']);
    const update = f.sql.find(x => x.text.startsWith('update public.'));
    expect(update?.text).toContain('consumed_at_ms is null');
    expect(update?.text).toContain("status = 'ISSUED'");
    expect(update?.text).toContain('statement_timestamp()');
    expect(update?.text).toContain('returning permit_id::text as "permitId"');
    expect(update?.args).toEqual([
      f.permit.permitId, f.permit.manifestDigest, f.permit.environmentId,
      f.permit.myeonghaCommitSha, f.permit.sajuCommitSha, f.permit.approvedOperatorId,
      f.permit.approvalSignatureKeyId, f.permit.issuedAtMs, f.permit.expiresAtMs,
    ]);
    expect(f.release).toHaveBeenCalledOnce();
  });

  it('a different process instance cannot consume the same row twice', async () => {
    const f = fixture();
    const a = createSajuHeldStagingPostgresAdmissionPortV1(f.options);
    const b = createSajuHeldStagingPostgresAdmissionPortV1(f.options);
    expect(await Promise.all([a.consumeAuthorizedAttemptOnce(),
      b.consumeAuthorizedAttemptOnce()])).toEqual([true, false]);
    expect(f.sql.filter(x => x.text.startsWith('update public.'))).toHaveLength(2);
  });

  it('rejects unsigned/forged approvals before DB, with one-shot consumed on failure', async () => {
    const f = fixture();
    const port = createSajuHeldStagingPostgresAdmissionPortV1({
      ...f.options, approvalSignature: sign(null,
        Buffer.from('forged-data'), keys.privateKey).toString('base64url'),
    });
    expect(await port.consumeAuthorizedAttemptOnce()).toBe(false);
    expect(await port.consumeAuthorizedAttemptOnce()).toBe(false);
    expect(f.sql).toHaveLength(0);
  });

  it.each([
    ['expired', { expiresAtMs: NOW }],
    ['future-issued', { issuedAtMs: NOW + 1 }],
    ['wrong digest', { manifestDigest: 'f'.repeat(64) }],
    ['wrong operator', { approvedOperatorId: 'other-operator' }],
    ['revoked', { status: 'REVOKED' }],
    ['already consumed', { status: 'CONSUMED', consumedAtMs: NOW - 1 }],
  ])('blocks invalid signed permit %s', async (_label, change) => {
    const f = fixture({ issue: change });
    if (change.approvedOperatorId || change.status === 'REVOKED'
      || change.status === 'CONSUMED') {
      expect(() => createSajuHeldStagingPostgresAdmissionPortV1(f.options))
        .toThrow('Invalid isolated staging operator admission configuration.');
    } else {
      const port = createSajuHeldStagingPostgresAdmissionPortV1(f.options);
      expect(await port.consumeAuthorizedAttemptOnce()).toBe(false);
      expect(f.sql).toHaveLength(0);
    }
  });

  it.each([
    ['tampered signature', { approvalSignature: 'X'.repeat(86) }],
    ['wrong expected key', { expectedApprovalKeyId: 'new-key' }],
    ['non-Ed25519 key', { approvalPublicKey: generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey }],
    ['missing pool', { pool: undefined }],
  ])('rejects invalid admission config %s', (_name, bad) => {
    const f = fixture();
    if (bad.approvalSignature) {
      const port = createSajuHeldStagingPostgresAdmissionPortV1({
        ...f.options, ...bad,
      } as typeof f.options);
      expect(port.consumeAuthorizedAttemptOnce()).resolves.toBe(false);
    } else {
      expect(() => createSajuHeldStagingPostgresAdmissionPortV1({
        ...f.options, ...bad,
      } as typeof f.options)).toThrow(TypeError);
    }
  });

  it('blocks target drift between manifest and independently approved target', () => {
    const f = fixture();
    const changed = { ...f.manifest, sajuCommitSha: 'c'.repeat(40) };
    expect(() => createSajuHeldStagingPostgresAdmissionPortV1({
      ...f.options, approvedManifest: changed,
    })).toThrow(TypeError);
    expect(f.sql).toHaveLength(0);
  });

  it.each(['connect', 'begin', 'role', 'update', 'commit', 'rollback'] as const)(
    'fails closed without leaking secrets on %s', async unavailable => {
      const f = fixture({ unavailable });
      const result = await createSajuHeldStagingPostgresAdmissionPortV1(
        f.options).consumeAuthorizedAttemptOnce();
      expect(result).toBe(false);
      if (unavailable !== 'connect') expect(f.release).toHaveBeenCalledOnce();
      if (['role', 'update', 'commit'].includes(unavailable)) {
        expect(f.sql.map(x => x.text)).toContain('ROLLBACK');
      }
      expect(JSON.stringify(result)).not.toContain('SECRET_');
    },
  );

  it.each(['wrong', 'two'] as const)(
    'rejects malformed database cardinality/authority %s', async returns => {
      const f = fixture({ returns });
      expect(await createSajuHeldStagingPostgresAdmissionPortV1(
        f.options).consumeAuthorizedAttemptOnce()).toBe(false);
      expect(f.sql.map(x => x.text)).toContain('ROLLBACK');
    },
  );

  it('does not emit permit identity, origin, Subject or secrets as report', async () => {
    const f = fixture();
    const result = await createSajuHeldStagingPostgresAdmissionPortV1(
      f.options).consumeAuthorizedAttemptOnce();
    expect(result).toBe(true);
    expect(typeof result).toBe('boolean');
    expect(JSON.stringify(result)).not.toContain(f.permit.permitId);
    expect(JSON.stringify(result)).not.toContain(f.manifest.proofServiceOrigin);
  });
});
