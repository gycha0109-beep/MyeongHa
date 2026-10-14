import { createHash, generateKeyPairSync, sign, X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { createSajuHeldStagingPostgresAdmissionPortV2 } from '../apps/api/src/saju-held-staging-admission-postgres-v2.js';
import { canonicalSajuHeldStagingPermitApprovalBytesV2 } from '../apps/api/src/saju-held-staging-admission-signature-v2.js';
import { digestSajuHeldStagingTargetManifestV1 } from '../apps/api/src/saju-held-staging-target-manifest-v1.js';
import { digestSajuHeldStagingConnectionPlanV1 } from '../apps/api/src/saju-held-staging-connection-plan-v1.js';
import type { PostgresQueryResultV1, PostgresSubjectPoolV1 } from '../apps/api/src/postgres-subject-execution.js';

const enabled = process.env.MYEONGHA_DOCKER_SAJU_ADMISSION_COMMIT === '1';
const stage = process.env.SAJU_BRIDGE_LOCAL_RECOVERY_STAGE;
const targetId = process.env.SAJU_BRIDGE_LOCAL_ADMISSION_FAULT_PERMIT_ID ?? '';
const revokedId = process.env.SAJU_BRIDGE_LOCAL_ADMISSION_FAULT_REVOKED_ID ?? '';
const existingId = process.env.SAJU_BRIDGE_LOCAL_RECOVERY_PERMIT_ID ?? '';
const replayKey = process.env.SAJU_BRIDGE_LOCAL_RECOVERY_NONCE_KEY ?? '';
const issuedAt = Number(process.env.SAJU_BRIDGE_LOCAL_ADMISSION_FAULT_ISSUED_MS);
const expiresAt = Number(process.env.SAJU_BRIDGE_LOCAL_ADMISSION_FAULT_EXPIRES_MS);
const permitTable = 'public.saju_staging_operator_admission_permits_v2';
const ca = enabled ? {
  subject: readFileSync('/certs/subject/ca.crt', 'utf8'),
  nonce: readFileSync('/certs/nonce/ca.crt', 'utf8'),
  admission: readFileSync('/certs/admission/ca.crt', 'utf8'),
} : undefined;
const pools: Pool[] = [];
function pg(which: 'subject' | 'nonce' | 'admission', admin = false): Pool {
  if (!ca) throw new Error('Missing isolated admission recovery CA.');
  const users = {
    subject: ['subject-db', 'myeongha_saju_subject_local_verify', 'myeongha_runtime',
      'SAJU_BRIDGE_LOCAL_SUBJECT_LOGIN_PASSWORD', 'SAJU_BRIDGE_LOCAL_SUBJECT_DB_PASSWORD'],
    nonce: ['nonce-db', 'myeongha_saju_nonce_local_verify', 'myeongha_docker_nonce_login',
      'SAJU_BRIDGE_LOCAL_NONCE_LOGIN_PASSWORD', 'SAJU_BRIDGE_LOCAL_NONCE_DB_PASSWORD'],
    admission: ['admission-db', 'myeongha_saju_admission_local_verify',
      'myeongha_docker_admission_tls_probe',
      'SAJU_BRIDGE_LOCAL_ADMISSION_LOGIN_PASSWORD', 'SAJU_BRIDGE_LOCAL_ADMISSION_DB_PASSWORD'],
  } as const;
  const x = users[which];
  const p = new Pool({
    host: x[0], port: 5432, database: x[1],
    user: admin ? 'postgres' : x[2],
    password: process.env[admin ? x[4] : x[3]],
    ssl: { ca: ca[which], rejectUnauthorized: true }, max: 1,
    connectionTimeoutMillis: 1600, query_timeout: 40000,
    idleTimeoutMillis: 1000, allowExitOnIdle: true,
  });
  p.on('error', () => { /* Physical database kill yields asynchronous socket failures. */ });
  pools.push(p);
  return p;
}
function uuid(value: string) {
  return /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(value);
}
function guard() {
  if (!enabled || !['admission-fire', 'admission-verify'].includes(stage ?? '')
    || process.env.MYEONGHA_DOCKER_SAJU_TLS !== '1'
    || process.env.MYEONGHA_DOCKER_SAJU_PERMIT !== '1'
    || process.env.SAJU_BRIDGE_LOCAL_SUBJECT_DB !== 'myeongha_saju_subject_local_verify'
    || process.env.SAJU_BRIDGE_LOCAL_NONCE_DB !== 'myeongha_saju_nonce_local_verify'
    || !uuid(targetId) || !uuid(revokedId) || !uuid(existingId)
    || new Set([targetId, revokedId, existingId]).size !== 3
    || !/^[A-Za-z0-9_-]{32,128}$/u.test(replayKey)
    || !Number.isSafeInteger(issuedAt) || !Number.isSafeInteger(expiresAt)
    || issuedAt >= Date.now() || expiresAt <= Date.now()
    || expiresAt - issuedAt > 180000 || expiresAt - issuedAt < 60000
    || ['SAJU_BRIDGE_LOCAL_ADMISSION_LOGIN_PASSWORD',
      'SAJU_BRIDGE_LOCAL_ADMISSION_DB_PASSWORD',
      'SAJU_BRIDGE_LOCAL_NONCE_DB_PASSWORD',
      'SAJU_BRIDGE_LOCAL_SUBJECT_DB_PASSWORD'].some(k => (process.env[k]?.length ?? 0) < 40)
    || !ca || new Set(Object.values(ca)).size !== 3) {
    throw new Error('Refusing admission in-flight crash outside disposable isolated TLS matrix.');
  }
}
function port(p: Pool, onUpdate: () => void): PostgresSubjectPoolV1 {
  return {
    async connect() {
      const c = await p.connect();
      c.on('error', () => { /* Expected asynchronous transport error on physical crash. */ });
      return {
        async query<Row = Record<string, unknown>>(sql: string, args?: readonly unknown[]):
          Promise<PostgresQueryResultV1<Row>> {
          if (/^update public\.saju_staging_operator_admission_permits_v2/iu.test(sql)) onUpdate();
          const r = await c.query(sql, args === undefined ? [] : [...args]);
          return { rows: r.rows as readonly Row[] };
        },
        release(error?: unknown) {
          c.release(error === undefined ? undefined
            : error instanceof Error ? error : new Error('Discard interrupted admission session'));
        },
      };
    },
  };
}
function sha256(pem: string) {
  return new X509Certificate(pem).fingerprint256.replaceAll(':', '').toLowerCase();
}
function syntheticPermit(p: PostgresSubjectPoolV1) {
  if (!ca) throw new Error('Missing CA.');
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
  const bind = (target: string, role: string, runtime: string, hostname: string, pem: string) => ({
    targetId: target, loginRole: role, runtimeRole: runtime, tlsHostname: hostname,
    caFingerprint256: sha256(pem), tlsMode: 'verify-full',
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
    subjectDb: bind('staging-db:subject', 'myeongha_runtime', 'myeongha_api_executor',
      'subject.saju-bridge-ci.invalid', ca.subject),
    nonceDb: bind('staging-db:nonce', 'myeongha_docker_nonce_login',
      'myeongha_saju_proof_nonce_runtime', 'nonce.saju-bridge-ci.invalid', ca.nonce),
    admissionDb: bind('staging-db:admission', 'myeongha_docker_admission_tls_probe',
      'myeongha_saju_staging_admission_runtime',
      'admission.saju-bridge-ci.invalid', ca.admission),
  };
  const permit = {
    version: 'myeongha-saju-staging-admission-contract-v2',
    permitId: targetId,
    manifestDigest: digestSajuHeldStagingTargetManifestV1(manifest),
    connectionPlanDigest: digestSajuHeldStagingConnectionPlanV1(plan),
    environmentId: manifest.environmentId,
    myeonghaCommitSha: manifest.myeonghaCommitSha,
    sajuCommitSha: manifest.sajuCommitSha,
    approvedOperatorId: 'docker-recovery-test',
    issuedAtMs: issuedAt, expiresAtMs: expiresAt,
    consumedAtMs: null, status: 'ISSUED',
    approvalSignatureKeyId: 'docker-recovery-key',
  };
  return {
    permit,
    options: {
      manifest, approvedManifest: structuredClone(manifest),
      connectionPlan: plan, approvedConnectionPlan: structuredClone(plan),
      permit,
      approvalPublicKey: keys.publicKey,
      approvalSignature: sign(null, canonicalSajuHeldStagingPermitApprovalBytesV2(permit),
        keys.privateKey).toString('base64url'),
      expectedOperatorId: permit.approvedOperatorId,
      expectedApprovalKeyId: permit.approvalSignatureKeyId,
      nowMsFactory: () => Date.now(), pool: p,
    },
  };
}
const insert = [
  'insert into public.saju_staging_operator_admission_permits_v2',
  '(permit_id,manifest_digest,connection_plan_digest,environment_id,',
  'myeongha_commit_sha,saju_commit_sha,approved_operator_id,',
  'approval_signature_key_id,issued_at_ms,expires_at_ms,consumed_at_ms,status)',
  'values ($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9::bigint,$10::bigint,null,$11)',
].join(' ');
function args(permit: ReturnType<typeof syntheticPermit>['permit'], id: string, status: string) {
  return [id, permit.manifestDigest, permit.connectionPlanDigest, permit.environmentId,
    permit.myeonghaCommitSha, permit.sajuCommitSha, permit.approvedOperatorId,
    permit.approvalSignatureKeyId, permit.issuedAtMs, permit.expiresAtMs, status];
}
async function state(p: Pool, id: string) {
  const r = await p.query<{ status: string; consumed_at_ms: string | null }>(
    'select status, consumed_at_ms::text from ' + permitTable + ' where permit_id=$1::uuid', [id],
  );
  expect(r.rows).toHaveLength(1);
  return r.rows[0]!;
}

describe.skipIf(!enabled)('Phase 4C-2 actual Admission PostgreSQL interrupted COMMIT', () => {
  afterAll(async () => { await Promise.all(pools.map(p => p.end())); });
  it('denies interrupted permit success without retry or status promotion', async () => {
    guard();
    if (stage === 'admission-fire') {
      const admin = pg('admission', true);
      const limited = pg('admission');
      let updates = 0;
      const synthetic = syntheticPermit(port(limited, () => updates++));
      await admin.query(insert, args(synthetic.permit, targetId, 'ISSUED'));
      await admin.query(insert, args(synthetic.permit, revokedId, 'REVOKED'));
      expect(await state(admin, targetId)).toMatchObject({ status: 'ISSUED', consumed_at_ms: null });
      expect(await state(admin, revokedId)).toMatchObject({ status: 'REVOKED', consumed_at_ms: null });
      const once = createSajuHeldStagingPostgresAdmissionPortV2(synthetic.options);
      // Host observes COMMIT/PgSleep, then SIGKILLs ONLY admission-db.
      expect(await once.consumeAuthorizedAttemptOnce()).toBe(false);
      expect(await once.consumeAuthorizedAttemptOnce()).toBe(false);
      expect(updates).toBe(1);
      return;
    }

    const admin = pg('admission', true);
    // Delayed deferred trigger was executing *inside COMMIT* when DB died.
    // This exact scenario must roll back instead of spuriously CONSUMED.
    expect(await state(admin, targetId)).toMatchObject({ status: 'ISSUED', consumed_at_ms: null });
    expect(await state(admin, revokedId)).toMatchObject({ status: 'REVOKED', consumed_at_ms: null });
    const existing = await state(admin, existingId);
    expect(existing.status).toBe('CONSUMED');
    expect(existing.consumed_at_ms).not.toBeNull();
    // Subject / Nonce authoritative state from 4A must not be changed by
    // Admission-only crash. This is independence, NOT distributed recovery.
    const subjects = await pg('subject', true).query<{ id: string }>(
      "select id::text from public.subjects where id='8c320001-0000-4000-8000-000000000001'::uuid",
    );
    expect(subjects.rows).toHaveLength(1);
    const replayDigest = createHash('sha256')
      .update('myeongha/saju/source-proof/nonce-replay/v1\0').update(replayKey).digest('hex');
    const nonce = await pg('nonce', true).query<{ n: string }>(
      'select count(*)::text as n from public.saju_source_proof_nonce_claims where replay_key_digest=$1',
      [replayDigest],
    );
    expect(nonce.rows[0]?.n).toBe('1');
    console.log('[saju-bridge] Phase 4C-2 durable states: interrupted=ISSUED, revoked=REVOKED, preexisting=CONSUMED; nonce=1, subject=1, no replay.');
  }, 100000);
});
