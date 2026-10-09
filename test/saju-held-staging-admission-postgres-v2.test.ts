import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  createSajuHeldStagingPostgresAdmissionPortV2,
  SAJU_HELD_STAGING_CONSUME_SQL_V2,
} from '../apps/api/src/saju-held-staging-admission-postgres-v2.js';
import {
  canonicalSajuHeldStagingPermitApprovalBytesV2,
} from '../apps/api/src/saju-held-staging-admission-signature-v2.js';
import {
  digestSajuHeldStagingTargetManifestV1,
} from '../apps/api/src/saju-held-staging-target-manifest-v1.js';
import {
  digestSajuHeldStagingConnectionPlanV1,
} from '../apps/api/src/saju-held-staging-connection-plan-v1.js';
import type { PostgresSubjectPoolV1 } from '../apps/api/src/postgres-subject-execution.js';

const NOW = 1_800_000_000_000;
const keys = generateKeyPairSync('ed25519');
function fixture(settings: {fail?: string; returned?: 'wrong' | 'two' | 'empty'} = {}) {
  const manifest = {
    version: 'myeongha-saju-staging-target-v1',
    environmentId: 'myeongha-staging-v2-atomic',
    myeonghaCommitSha: 'a'.repeat(40), sajuCommitSha: 'b'.repeat(40),
    authProjectRef: 'abcdefghijklmnopqrst',
    authOrigin: 'https://abcdefghijklmnopqrst.supabase.co',
    subjectDbTargetId: 'staging-db:subject', nonceDbTargetId: 'staging-db:nonce',
    proofServiceOrigin: 'https://saju-proof.staging.example.com',
    proofIssuer: 'saju-preview', proofAudience: 'myeongha-staging', proofKeyId: 'hmac-key-v2',
    proofTtlMs: 60_000,
  };
  const mkDb = (targetId: string, loginRole: string, runtimeRole: string, host: string) => ({
    targetId, loginRole, runtimeRole,
    tlsHostname: host, caFingerprint256: 'a'.repeat(64), tlsMode: 'verify-full',
  });
  const plan = {
    version: 'myeongha-saju-staging-connection-plan-v1',
    manifestDigest: digestSajuHeldStagingTargetManifestV1(manifest),
    environmentId: manifest.environmentId,
    myeonghaCommitSha: manifest.myeonghaCommitSha, sajuCommitSha: manifest.sajuCommitSha,
    authProjectRef: manifest.authProjectRef, authOrigin: manifest.authOrigin,
    proofServiceOrigin: manifest.proofServiceOrigin, proofIssuer: manifest.proofIssuer,
    proofAudience: manifest.proofAudience, proofKeyId: manifest.proofKeyId,
    subjectDb: mkDb(manifest.subjectDbTargetId, 'subject_login_ci', 'myeongha_api_executor',
      'subject.staging.example.com'),
    nonceDb: mkDb(manifest.nonceDbTargetId, 'nonce_login_ci',
      'myeongha_saju_proof_nonce_runtime', 'nonce.staging.example.com'),
    admissionDb: mkDb('staging-db:admission', 'admission_login_ci',
      'myeongha_saju_staging_admission_runtime', 'admission.staging.example.com'),
  };
  const permit = {
    version: 'myeongha-saju-staging-admission-contract-v2',
    permitId: '123e4567-e89b-42d3-a456-426614174002',
    manifestDigest: digestSajuHeldStagingTargetManifestV1(manifest),
    connectionPlanDigest: digestSajuHeldStagingConnectionPlanV1(plan),
    environmentId: manifest.environmentId, myeonghaCommitSha: manifest.myeonghaCommitSha,
    sajuCommitSha: manifest.sajuCommitSha, approvedOperatorId: 'approved-operator-v2',
    issuedAtMs: NOW - 20_000, expiresAtMs: NOW + 60_000,
    consumedAtMs: null, status: 'ISSUED', approvalSignatureKeyId: 'approved-v2-key',
  };
  const sql: { text: string; values?: readonly unknown[] }[] = [];
  const claimed = new Set<string>();
  const release = vi.fn();
  const connect = vi.fn(async () => {
    if (settings.fail === 'connect') throw Error('SECRET_CONNECT');
    return {
      async query<Row = Record<string, unknown>>(text: string, values?: readonly unknown[]) {
        sql.push(values === undefined ? { text } : { text, values });
        if (settings.fail === 'begin' && text === 'BEGIN') throw Error('SECRET_BEGIN');
        if (settings.fail === 'role' && text.startsWith('SET LOCAL')) throw Error('SECRET_ROLE');
        if (['update', 'rollback'].includes(settings.fail ?? '') && text.startsWith('update public.')) throw Error('SECRET_UPDATE');
        if (settings.fail === 'commit' && text === 'COMMIT') throw Error('SECRET_COMMIT');
        if (settings.fail === 'rollback' && text === 'ROLLBACK') throw Error('SECRET_ROLLBACK');
        if (text.startsWith('update public.')) {
          if (settings.returned === 'two') return {rows: [
            {permitId: values?.[0]}, {permitId: values?.[0]},
          ] as Row[]};
          if (settings.returned === 'wrong') return {rows: [{permitId: 'rogue-id'}] as Row[]};
          if (settings.returned === 'empty') return {rows: [] as Row[]};
          const id = String(values?.[0]);
          if (claimed.has(id)) return { rows: [] as Row[] };
          claimed.add(id);
          return {rows: [{permitId: id}] as Row[]};
        }
        return {rows: [] as Row[]};
      },
      release,
    };
  });
  const pool: PostgresSubjectPoolV1 = {connect};
  const options = {
    manifest, approvedManifest: structuredClone(manifest),
    connectionPlan: plan, approvedConnectionPlan: structuredClone(plan),
    permit, approvalPublicKey: keys.publicKey,
    approvalSignature: sign(null, canonicalSajuHeldStagingPermitApprovalBytesV2(permit),
      keys.privateKey).toString('base64url'),
    expectedOperatorId: 'approved-operator-v2',
    expectedApprovalKeyId: 'approved-v2-key',
    nowMsFactory: () => NOW, pool,
  };
  return {options, sql, release, connect, permit, plan, manifest};
}

describe('8C-2B-2D-3-02 dormant V2 PostgreSQL atomic consumer', () => {
  it('is inert at construction and consumes exactly once under V2-only row identity', async () => {
    const f = fixture();
    const port = createSajuHeldStagingPostgresAdmissionPortV2(f.options);
    expect(f.connect).not.toHaveBeenCalled();
    expect(Object.isFrozen(port)).toBe(true);
    expect(await port.consumeAuthorizedAttemptOnce()).toBe(true);
    expect(await port.consumeAuthorizedAttemptOnce()).toBe(false);
    expect(f.connect).toHaveBeenCalledOnce();
    expect(f.sql.map(x => x.text === SAJU_HELD_STAGING_CONSUME_SQL_V2
      ? 'UPDATE' : x.text)).toEqual([
        'BEGIN', 'SET LOCAL ROLE myeongha_saju_staging_admission_runtime',
        'UPDATE', 'COMMIT',
      ]);
    expect(SAJU_HELD_STAGING_CONSUME_SQL_V2).toContain('connection_plan_digest = $3::text');
    expect(SAJU_HELD_STAGING_CONSUME_SQL_V2).toContain('clock_timestamp()');
    expect(SAJU_HELD_STAGING_CONSUME_SQL_V2)
      .toContain('public.saju_staging_operator_admission_permits_v2');
    expect(SAJU_HELD_STAGING_CONSUME_SQL_V2)
      .not.toContain('update public.saju_staging_operator_admission_permits\n');
    expect(f.sql.find(x => x.text === SAJU_HELD_STAGING_CONSUME_SQL_V2)?.values).toEqual([
      f.permit.permitId, f.permit.manifestDigest, f.permit.connectionPlanDigest,
      f.permit.environmentId, f.permit.myeonghaCommitSha, f.permit.sajuCommitSha,
      f.permit.approvedOperatorId, f.permit.approvalSignatureKeyId,
      f.permit.issuedAtMs, f.permit.expiresAtMs,
    ]);
    expect(f.release).toHaveBeenCalledOnce();
  });

  it('multiple instances cannot consume the same shared row twice in synthetic pool', async () => {
    const f = fixture();
    const a = createSajuHeldStagingPostgresAdmissionPortV2(f.options);
    const b = createSajuHeldStagingPostgresAdmissionPortV2(f.options);
    expect(await Promise.all([a.consumeAuthorizedAttemptOnce(),
      b.consumeAuthorizedAttemptOnce()])).toEqual([true, false]);
    expect(f.sql.filter(x => x.text === SAJU_HELD_STAGING_CONSUME_SQL_V2)).toHaveLength(2);
  });

  it('rejects V1 signed permit and V2 plan mismatch before acquiring connection', () => {
    const f = fixture();
    for (const permit of [
      { ...f.permit, version: 'myeongha-saju-staging-admission-contract-v1' },
      { ...f.permit, connectionPlanDigest: 'f'.repeat(64) },
    ]) {
      expect(() => createSajuHeldStagingPostgresAdmissionPortV2({
        ...f.options, permit,
      })).toThrow('Invalid isolated staging V2 operator admission configuration.');
    }
    expect(f.connect).not.toHaveBeenCalled();
  });

  it('rejects forged signature and target/CA/role drift before any DB access', () => {
    const f = fixture();
    const variants = [
      { approvalSignature: sign(null, Buffer.from('forged'),
        keys.privateKey).toString('base64url') },
      { approvedConnectionPlan: { ...f.plan,
        admissionDb: { ...f.plan.admissionDb, caFingerprint256: 'f'.repeat(64) } } },
      { connectionPlan: { ...f.plan,
        admissionDb: { ...f.plan.admissionDb, loginRole: 'rogue_login' } } },
      { expectedApprovalKeyId: 'wrong-key' },
      { approvalPublicKey: generateKeyPairSync('ed25519').publicKey },
    ];
    for (const changed of variants) {
      expect(() => createSajuHeldStagingPostgresAdmissionPortV2({
        ...f.options, ...changed,
      })).toThrow(TypeError);
    }
    expect(f.connect).not.toHaveBeenCalled();
  });

  it.each([
    ['expired', (f: ReturnType<typeof fixture>) =>
      ({...f.options, nowMsFactory: () => f.permit.expiresAtMs})],
    ['future', (f: ReturnType<typeof fixture>) =>
      ({...f.options, nowMsFactory: () => f.permit.issuedAtMs - 1})],
    ['invalid clock', (f: ReturnType<typeof fixture>) =>
      ({...f.options, nowMsFactory: () => Number.NaN})],
  ])('blocks %s without DB access and consumes local attempt', async (_label, altered) => {
    const f = fixture();
    const port = createSajuHeldStagingPostgresAdmissionPortV2(altered(f));
    expect(await port.consumeAuthorizedAttemptOnce()).toBe(false);
    expect(await port.consumeAuthorizedAttemptOnce()).toBe(false);
    expect(f.connect).not.toHaveBeenCalled();
  });

  it.each(['connect', 'begin', 'role', 'update', 'commit', 'rollback'])(
    'fails closed on %s without retries or leaked errors', async fail => {
      const f = fixture({fail});
      const port = createSajuHeldStagingPostgresAdmissionPortV2(f.options);
      expect(await port.consumeAuthorizedAttemptOnce()).toBe(false);
      expect(await port.consumeAuthorizedAttemptOnce()).toBe(false);
      expect(f.connect).toHaveBeenCalledOnce();
      expect(JSON.stringify(await port.consumeAuthorizedAttemptOnce())).not.toContain('SECRET_');
      if (fail !== 'connect') expect(f.release).toHaveBeenCalledOnce();
      if (['role', 'update', 'commit'].includes(fail)) {
        expect(f.sql.map(x => x.text)).toContain('ROLLBACK');
      }
    },
  );

  it.each(['wrong', 'two', 'empty'] as const)(
    'rejects malformed or absent DB row: %s', async returned => {
      const f = fixture({returned});
      const port = createSajuHeldStagingPostgresAdmissionPortV2(f.options);
      expect(await port.consumeAuthorizedAttemptOnce()).toBe(false);
      const statements = f.sql.map(x => x.text);
      expect(statements).toContain(returned === 'empty' ? 'COMMIT' : 'ROLLBACK');
    },
  );

  it('pins input metadata so mutable caller values cannot rewrite DB predicate', async () => {
    const f = fixture();
    const port = createSajuHeldStagingPostgresAdmissionPortV2(f.options);
    f.permit.connectionPlanDigest = 'f'.repeat(64);
    f.plan.admissionDb.loginRole = 'rogue_login';
    expect(await port.consumeAuthorizedAttemptOnce()).toBe(true);
    expect(f.sql.find(x => x.text === SAJU_HELD_STAGING_CONSUME_SQL_V2)
      ?.values?.[2]).not.toBe(f.permit.connectionPlanDigest);
  });
});
