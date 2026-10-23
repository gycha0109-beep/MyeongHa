import { createHash, generateKeyPairSync, sign, X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { createSajuSourceProofPostgresNonceClaimV1 } from '../apps/api/src/saju-source-proof-nonce-postgres-claim-v1.js';
import { createSajuHeldStagingPostgresAdmissionPortV2 } from '../apps/api/src/saju-held-staging-admission-postgres-v2.js';
import { canonicalSajuHeldStagingPermitApprovalBytesV2 } from '../apps/api/src/saju-held-staging-admission-signature-v2.js';
import { digestSajuHeldStagingTargetManifestV1 } from '../apps/api/src/saju-held-staging-target-manifest-v1.js';
import { digestSajuHeldStagingConnectionPlanV1 } from '../apps/api/src/saju-held-staging-connection-plan-v1.js';
import type { PostgresQueryResultV1, PostgresSubjectPoolV1 } from '../apps/api/src/postgres-subject-execution.js';
import { classifySajuBridgeCrossDbObservationV1 as classify, assessSajuBridgeCrossDbSnapshotRaceV1 as assessRace } from '../scripts/local/saju-bridge-cross-db-observation-v1.mjs';

type Peer = 'subject' | 'nonce' | 'admission';
type Evidence = { subject: string; nonce: string; permit: string };
const enabled = process.env.MYEONGHA_DOCKER_SAJU_CROSS_DB === '1';
const stage = process.env.SAJU_BRIDGE_LOCAL_RECOVERY_STAGE;
const ids = ['NONCE_ONLY', 'PERMIT_ONLY', 'REVOKED_WITH_NONCE'] as const;
type Case = typeof ids[number];
const permitIds: Record<Case, string> = {
  NONCE_ONLY: process.env.SAJU_BRIDGE_LOCAL_CROSS_DB_PERMIT_NONCE ?? '',
  PERMIT_ONLY: process.env.SAJU_BRIDGE_LOCAL_CROSS_DB_PERMIT_ADMISSION ?? '',
  REVOKED_WITH_NONCE: process.env.SAJU_BRIDGE_LOCAL_CROSS_DB_PERMIT_REVOKED ?? '',
};
const replayKeys: Record<Case, string> = {
  NONCE_ONLY: process.env.SAJU_BRIDGE_LOCAL_CROSS_DB_KEY_NONCE ?? '',
  PERMIT_ONLY: process.env.SAJU_BRIDGE_LOCAL_CROSS_DB_KEY_ADMISSION ?? '',
  REVOKED_WITH_NONCE: process.env.SAJU_BRIDGE_LOCAL_CROSS_DB_KEY_REVOKED ?? '',
};
const issued = Number(process.env.SAJU_BRIDGE_LOCAL_CROSS_DB_ISSUED_MS);
const expires = Number(process.env.SAJU_BRIDGE_LOCAL_CROSS_DB_EXPIRES_MS);
const ca = enabled ? {
  subject: readFileSync('/certs/subject/ca.crt', 'utf8'),
  nonce: readFileSync('/certs/nonce/ca.crt', 'utf8'),
  admission: readFileSync('/certs/admission/ca.crt', 'utf8'),
} : undefined;
const config: Record<Peer, readonly [string, string, string, string, string]> = {
  subject: ['subject-db', 'myeongha_saju_subject_local_verify', 'myeongha_runtime',
    'SAJU_BRIDGE_LOCAL_SUBJECT_LOGIN_PASSWORD', 'SAJU_BRIDGE_LOCAL_SUBJECT_DB_PASSWORD'],
  nonce: ['nonce-db', 'myeongha_saju_nonce_local_verify', 'myeongha_docker_nonce_login',
    'SAJU_BRIDGE_LOCAL_NONCE_LOGIN_PASSWORD', 'SAJU_BRIDGE_LOCAL_NONCE_DB_PASSWORD'],
  admission: ['admission-db', 'myeongha_saju_admission_local_verify',
    'myeongha_docker_admission_tls_probe',
    'SAJU_BRIDGE_LOCAL_ADMISSION_LOGIN_PASSWORD', 'SAJU_BRIDGE_LOCAL_ADMISSION_DB_PASSWORD'],
};
const pools: Pool[] = [];
function pg(peer: Peer, admin = false): Pool {
  if (!ca) throw new Error('No independent CA.');
  const x = config[peer];
  const p = new Pool({
    host: x[0], port: 5432, database: x[1],
    user: admin ? 'postgres' : x[2], password: process.env[admin ? x[4] : x[3]],
    ssl: { ca: ca[peer], rejectUnauthorized: true },
    max: 1, connectionTimeoutMillis: 1800, query_timeout: 15000,
    idleTimeoutMillis: 900, allowExitOnIdle: true,
  });
  p.on('error', () => { /* Actual peer outage is classified UNKNOWN. */ });
  pools.push(p);
  return p;
}
function guard() {
  if (!enabled || !['cross-seed', 'cross-verify', 'cross-outage-nonce',
    'cross-outage-admission', 'cross-outage-subject', 'cross-final',
    'cross-stability-before', 'cross-stability-mutate',
    'cross-stability-after', 'cross-stability-confirm'].includes(stage ?? '')
    || process.env.MYEONGHA_DOCKER_SAJU_TLS !== '1'
    || process.env.MYEONGHA_DOCKER_SAJU_PERMIT !== '1'
    || process.env.SAJU_BRIDGE_LOCAL_SUBJECT_DB !== config.subject[1]
    || process.env.SAJU_BRIDGE_LOCAL_NONCE_DB !== config.nonce[1]
    || !ca || new Set(Object.values(ca)).size !== 3
    || !ids.every(k => /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(permitIds[k]))
    || new Set(ids.map(k => permitIds[k])).size !== 3
    || !ids.every(k => /^[A-Za-z0-9_-]{32,128}$/u.test(replayKeys[k]))
    || new Set(ids.map(k => replayKeys[k])).size !== 3
    || !Number.isSafeInteger(issued) || !Number.isSafeInteger(expires)
    || issued >= Date.now() || expires <= Date.now()
    || expires - issued < 60000 || expires - issued > 480000
    || Object.values(config).some(x => [x[3], x[4]]
      .some(password => (process.env[password]?.length ?? 0) < 40))) {
    throw new Error('Refusing cross-DB test outside independent disposable TLS authority.');
  }
}
function port(p: Pool): PostgresSubjectPoolV1 {
  return {
    async connect() {
      const c = await p.connect();
      c.on('error', () => { /* Observed peer errors deny success. */ });
      return {
        async query<Row = Record<string, unknown>>(sql: string, args?: readonly unknown[]):
          Promise<PostgresQueryResultV1<Row>> {
          const r = await c.query(sql, args === undefined ? [] : [...args]);
          return { rows: r.rows as readonly Row[] };
        },
        release(error?: unknown) {
          c.release(error === undefined ? undefined
            : error instanceof Error ? error : new Error('Discard failed cross-DB session'));
        },
      };
    },
  };
}
function fingerprint(pem: string) {
  return new X509Certificate(pem).fingerprint256.replaceAll(':','').toLowerCase();
}
function signedPermit(id: string, p: PostgresSubjectPoolV1) {
  if (!ca) throw new Error('Missing synthetic CA.');
  const keys = generateKeyPairSync('ed25519');
  const manifest = {
    version: 'myeongha-saju-staging-target-v1',
    environmentId: 'myeongha-staging-docker-recovery',
    myeonghaCommitSha: 'a'.repeat(40), sajuCommitSha: 'b'.repeat(40),
    authProjectRef: 'abcdefghijklmnopqrst',
    authOrigin: 'https://abcdefghijklmnopqrst.supabase.co',
    subjectDbTargetId: 'staging-db:subject', nonceDbTargetId: 'staging-db:nonce',
    proofServiceOrigin: 'https://saju-proof.staging.example.com',
    proofIssuer: 'saju-preview', proofAudience: 'myeongha-staging',
    proofKeyId: 'docker-recovery-proof', proofTtlMs: 60000,
  };
  const bind = (targetId: string, loginRole: string, runtimeRole: string,
    tlsHostname: string, pem: string) => ({
    targetId, loginRole, runtimeRole, tlsHostname,
    caFingerprint256: fingerprint(pem), tlsMode: 'verify-full',
  });
  const plan = {
    version: 'myeongha-saju-staging-connection-plan-v1',
    manifestDigest: digestSajuHeldStagingTargetManifestV1(manifest),
    environmentId: manifest.environmentId,
    myeonghaCommitSha: manifest.myeonghaCommitSha,
    sajuCommitSha: manifest.sajuCommitSha,
    authProjectRef: manifest.authProjectRef, authOrigin: manifest.authOrigin,
    proofServiceOrigin: manifest.proofServiceOrigin,
    proofIssuer: manifest.proofIssuer, proofAudience: manifest.proofAudience,
    proofKeyId: manifest.proofKeyId,
    subjectDb: bind('staging-db:subject', 'myeongha_runtime',
      'myeongha_api_executor', 'subject.saju-bridge-ci.invalid', ca.subject),
    nonceDb: bind('staging-db:nonce', 'myeongha_docker_nonce_login',
      'myeongha_saju_proof_nonce_runtime', 'nonce.saju-bridge-ci.invalid', ca.nonce),
    admissionDb: bind('staging-db:admission', 'myeongha_docker_admission_tls_probe',
      'myeongha_saju_staging_admission_runtime',
      'admission.saju-bridge-ci.invalid', ca.admission),
  };
  const permit = {
    version: 'myeongha-saju-staging-admission-contract-v2',
    permitId: id, manifestDigest: digestSajuHeldStagingTargetManifestV1(manifest),
    connectionPlanDigest: digestSajuHeldStagingConnectionPlanV1(plan),
    environmentId: manifest.environmentId, myeonghaCommitSha: manifest.myeonghaCommitSha,
    sajuCommitSha: manifest.sajuCommitSha, approvedOperatorId: 'docker-recovery-test',
    issuedAtMs: issued, expiresAtMs: expires, consumedAtMs: null,
    status: 'ISSUED', approvalSignatureKeyId: 'docker-recovery-key',
  };
  return { permit, options: {
    manifest, approvedManifest: structuredClone(manifest),
    connectionPlan: plan, approvedConnectionPlan: structuredClone(plan),
    permit, approvalPublicKey: keys.publicKey,
    approvalSignature: sign(null, canonicalSajuHeldStagingPermitApprovalBytesV2(permit),
      keys.privateKey).toString('base64url'),
    expectedOperatorId: permit.approvedOperatorId,
    expectedApprovalKeyId: permit.approvalSignatureKeyId,
    nowMsFactory: () => Date.now(), pool: p,
  } };
}
function digest(key: string): string {
  return createHash('sha256').update('myeongha/saju/source-proof/nonce-replay/v1\0')
    .update(key).digest('hex');
}
const insert = [
  'insert into public.saju_staging_operator_admission_permits_v2',
  '(permit_id,manifest_digest,connection_plan_digest,environment_id,',
  'myeongha_commit_sha,saju_commit_sha,approved_operator_id,',
  'approval_signature_key_id,issued_at_ms,expires_at_ms,consumed_at_ms,status)',
  'values ($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9::bigint,$10::bigint,null,$11)',
].join(' ');
function params(permit: ReturnType<typeof signedPermit>['permit'], status: string) {
  return [permit.permitId, permit.manifestDigest, permit.connectionPlanDigest,
    permit.environmentId, permit.myeonghaCommitSha, permit.sajuCommitSha,
    permit.approvedOperatorId, permit.approvalSignatureKeyId,
    permit.issuedAtMs, permit.expiresAtMs, status];
}
// Every reconciliation read is its own explicitly READ ONLY transaction.
// The reads are NOT a serializable distributed snapshot across peers.
async function readOnly<Row extends Record<string, unknown>>(p: Pool, statement: string, values: unknown[]): Promise<Row[]> {
  const client = await p.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const r = await client.query<Row>(statement, values);
    await client.query('COMMIT');
    return r.rows;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* Broken peer stays UNKNOWN. */ }
    throw error;
  } finally {
    client.release();
  }
}
async function observe(c: Case, peers: Record<Peer, Pool>): Promise<Evidence> {
  let subject = 'UNKNOWN', nonce = 'UNKNOWN', permit = 'UNKNOWN';
  try {
    const rows = await readOnly<{ n: string }>(peers.subject,
      "select count(*)::text as n from public.subjects where id='8c320001-0000-4000-8000-000000000001'::uuid", []);
    subject = rows[0]?.n === '1' ? 'PRESENT' : rows[0]?.n === '0' ? 'MISSING' : 'UNKNOWN';
  } catch { /* No fallback to stale cached subject state. */ }
  try {
    const rows = await readOnly<{ n: string }>(peers.nonce,
      'select count(*)::text as n from public.saju_source_proof_nonce_claims where replay_key_digest=$1',
      [digest(replayKeys[c])]);
    nonce = rows[0]?.n === '1' ? 'CLAIMED' : rows[0]?.n === '0' ? 'ABSENT' : 'UNKNOWN';
  } catch { /* Read failure cannot establish nonce absence. */ }
  try {
    const rows = await readOnly<{ status: string; consumed: string | null }>(
      peers.admission,
      'select status, consumed_at_ms::text as consumed from public.saju_staging_operator_admission_permits_v2 where permit_id=$1::uuid',
      [permitIds[c]],
    );
    permit = rows.length === 0 ? 'MISSING'
      : rows.length !== 1 ? 'UNKNOWN'
        : rows[0]?.status === 'CONSUMED' && rows[0]?.consumed !== null ? 'CONSUMED'
          : ['ISSUED','REVOKED'].includes(rows[0]?.status ?? '')
            && rows[0]?.consumed === null ? rows[0]!.status : 'UNKNOWN';
  } catch { /* Read failure cannot establish permit absence. */ }
  return { subject, nonce, permit };
}
const expected = {
  NONCE_ONLY: { subject: 'PRESENT', nonce: 'CLAIMED', permit: 'ISSUED',
    classification: 'NONCE_ONLY_HOLD' },
  PERMIT_ONLY: { subject: 'PRESENT', nonce: 'ABSENT', permit: 'CONSUMED',
    classification: 'PERMIT_ONLY_HOLD' },
  REVOKED_WITH_NONCE: { subject: 'PRESENT', nonce: 'CLAIMED', permit: 'REVOKED',
    classification: 'REVOKED_WITH_NONCE_HOLD' },
} as const;

describe('Phase 4C-3 cross-DB fail-closed classification', () => {
  it('never authorizes, retries, or compensates even with both peers durable', () => {
    for (const status of ['ISSUED', 'CONSUMED', 'REVOKED', 'MISSING', 'UNKNOWN']) {
      for (const nonce of ['CLAIMED', 'ABSENT', 'UNKNOWN']) {
        for (const subject of ['PRESENT', 'MISSING', 'UNKNOWN']) {
          const x = classify({ subject, nonce, permit: status });
          expect(x).toMatchObject({ decision: 'HOLD_MANUAL_REVIEW',
            canExecute: false, canPublish: false, canSell: false,
            automaticRetry: false, automaticCompensation: false });
          expect(Object.isFrozen(x)).toBe(true);
        }
      }
    }
    expect(classify({ subject: 'PRESENT', nonce: 'CLAIMED',
      permit: 'CONSUMED' }).classification).toBe('BOTH_DURABLE_UNVERIFIED_HOLD');
    expect(classify({ subject: 'PRESENT', nonce: 'ABSENT',
      permit: 'CONSUMED' }).classification).toBe('PERMIT_ONLY_HOLD');
  });
});

describe('Phase 4D cross-DB stale snapshot race HOLD', () => {
  it('never infers recovery permission from changed, unchanged or missing observations', () => {
    const before = {
      NONCE_ONLY: {subject:'PRESENT',nonce:'CLAIMED',permit:'ISSUED'},
      PERMIT_ONLY: {subject:'PRESENT',nonce:'ABSENT',permit:'CONSUMED'},
      REVOKED_WITH_NONCE: {subject:'PRESENT',nonce:'CLAIMED',permit:'REVOKED'},
    };
    const after = {
      NONCE_ONLY: {subject:'PRESENT',nonce:'CLAIMED',permit:'CONSUMED'},
      PERMIT_ONLY: {subject:'PRESENT',nonce:'CLAIMED',permit:'CONSUMED'},
      REVOKED_WITH_NONCE: {subject:'PRESENT',nonce:'CLAIMED',permit:'REVOKED'},
    };
    for (const [first, last, expected] of [
      [before, after, 'EVIDENCE_CHANGED_HOLD'],
      [after, after, 'UNCHANGED_UNVERIFIED_HOLD'],
      [before, before, 'UNCHANGED_UNVERIFIED_HOLD'],
      [before, { ...after, PERMIT_ONLY: {subject:'PRESENT',nonce:'UNKNOWN',permit:'CONSUMED'} }, 'UNKNOWN_HOLD'],
      [before, null, 'UNKNOWN_HOLD'],
      [before, { ...after, EXTRA: {} }, 'UNKNOWN_HOLD'],
    ] as const) {
      const result = assessRace(first, last);
      expect(result.classification).toBe(expected);
      expect(result).toMatchObject({decision:'HOLD_MANUAL_REVIEW',
        canExecute:false, canPublish:false, canSell:false,
        automaticRetry:false, automaticCompensation:false});
      expect(Object.isFrozen(result)).toBe(true);
    }
  });
});

describe.skipIf(!enabled)('Phase 4C-3 actual isolated PostgreSQL partial durable states', () => {
  afterAll(async () => { await Promise.all(pools.map(p => p.end())); });
  it('retains partial commits but never converts a cross-DB read into recovery permission', async () => {
    guard();
    const peers = {
      subject: pg('subject', true), nonce: pg('nonce', true),
      admission: pg('admission', true),
    };
    if (stage === 'cross-seed') {
      const nonceRuntime = port(pg('nonce'));
      const admissionRuntime = port(pg('admission'));
      const permits = Object.fromEntries(ids.map(id =>
        [id, signedPermit(permitIds[id], admissionRuntime)])) as
        Record<Case, ReturnType<typeof signedPermit>>;
      for (const id of ids) {
        await peers.admission.query(insert, params(permits[id].permit,
          id === 'REVOKED_WITH_NONCE' ? 'REVOKED' : 'ISSUED'));
      }
      const claim = createSajuSourceProofPostgresNonceClaimV1({ pool: nonceRuntime });
      const nonceExpiry = Date.now() + 120000;
      expect(await claim(replayKeys.NONCE_ONLY, nonceExpiry)).toBe(true);
      expect(await claim(replayKeys.REVOKED_WITH_NONCE, nonceExpiry)).toBe(true);
      const consume = createSajuHeldStagingPostgresAdmissionPortV2(permits.PERMIT_ONLY.options);
      expect(await consume.consumeAuthorizedAttemptOnce()).toBe(true);
      expect(await consume.consumeAuthorizedAttemptOnce()).toBe(false);
    }
    // Phase 4D mutations are deliberate, isolated fixture writes in a NEW
    // verifier process; NOT distributed compensation or an operational retry.
    if (stage === 'cross-stability-mutate') {
      const approval = signedPermit(permitIds.NONCE_ONLY, port(pg('admission')));
      const admitted = createSajuHeldStagingPostgresAdmissionPortV2(approval.options);
      expect(await admitted.consumeAuthorizedAttemptOnce()).toBe(true);
      expect(await admitted.consumeAuthorizedAttemptOnce()).toBe(false);
      const nonceRuntime = createSajuSourceProofPostgresNonceClaimV1({pool:port(pg('nonce'))});
      expect(await nonceRuntime(replayKeys.PERMIT_ONLY, Date.now() + 120000)).toBe(true);
      console.log('[saju-bridge] Phase 4D controlled independent signed Permit/Nonce changes COMMITTED; no compensation.');
    }
    const snapshots: Record<Case, Evidence> = {} as Record<Case, Evidence>;
    for (const id of ids) {
      const e = await observe(id, peers);
      snapshots[id] = e;
      const decision = classify(e);
      if (stage === 'cross-outage-nonce') {
        expect(e).toMatchObject({ subject: 'PRESENT', nonce: 'UNKNOWN',
          permit: expected[id].permit });
        expect(decision.classification).toBe('UNKNOWN_HOLD');
      } else if (stage === 'cross-outage-admission') {
        expect(e).toMatchObject({ subject: 'PRESENT', nonce: expected[id].nonce,
          permit: 'UNKNOWN' });
        expect(decision.classification).toBe('UNKNOWN_HOLD');
      } else if (stage === 'cross-outage-subject') {
        expect(e).toMatchObject({ subject: 'UNKNOWN', nonce: expected[id].nonce,
          permit: expected[id].permit });
        expect(decision.classification).toBe('UNKNOWN_HOLD');
      } else if (stage === 'cross-stability-mutate'
        || stage === 'cross-stability-after' || stage === 'cross-stability-confirm') {
        expect(e).toEqual({ subject:'PRESENT', nonce:'CLAIMED',
          permit:id === 'REVOKED_WITH_NONCE' ? 'REVOKED' : 'CONSUMED' });
        expect(decision.classification).toBe(id === 'REVOKED_WITH_NONCE'
          ? 'REVOKED_WITH_NONCE_HOLD' : 'BOTH_DURABLE_UNVERIFIED_HOLD');
      } else {
        expect(e).toEqual({ subject: expected[id].subject,
          nonce: expected[id].nonce, permit: expected[id].permit });
        expect(decision.classification).toBe(expected[id].classification);
      }
      expect(decision).toMatchObject({ decision: 'HOLD_MANUAL_REVIEW',
        canExecute: false, canPublish: false, canSell: false,
        automaticRetry: false, automaticCompensation: false });
    }
    if (['cross-stability-before', 'cross-stability-after',
      'cross-stability-confirm'].includes(stage ?? '')) {
      // Only semantic statuses, never replay keys, UUIDs or credentials.
      console.log('[saju-bridge] Phase 4D snapshot ' + stage + ': ' + JSON.stringify(snapshots));
    }
    if (stage === 'cross-seed') {
      console.log('[saju-bridge] Phase 4C-3 cross-seed evidence: three independent partial states HOLD.');
    }
    // No DML or retries in any observer stage. Repeat to detect hidden writes.
    if (stage === 'cross-verify' || stage === 'cross-final') {
      for (const id of ids) expect(await observe(id, peers)).toEqual(snapshots[id]);
      console.log('[saju-bridge] Phase 4C-3 durable cross-DB evidence: nonce-only=CLAIMED/ISSUED, permit-only=ABSENT/CONSUMED, revoked=CLAIMED/REVOKED; Subject PRESENT; all HOLD; no writes/retry.');
    } else if (stage?.startsWith('cross-outage-')) {
      console.log('[saju-bridge] Phase 4C-3 ' + stage + ': physical peer unreachable -> UNKNOWN_HOLD; no stale fallback.');
    }
  }, 90000);
});
