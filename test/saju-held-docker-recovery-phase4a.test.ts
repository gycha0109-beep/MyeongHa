import { createHash, generateKeyPairSync, sign, X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { createSajuHeldStagingPostgresAdmissionPortV2 } from '../apps/api/src/saju-held-staging-admission-postgres-v2.js';
import { canonicalSajuHeldStagingPermitApprovalBytesV2 } from '../apps/api/src/saju-held-staging-admission-signature-v2.js';
import { digestSajuHeldStagingTargetManifestV1 } from '../apps/api/src/saju-held-staging-target-manifest-v1.js';
import { digestSajuHeldStagingConnectionPlanV1 } from '../apps/api/src/saju-held-staging-connection-plan-v1.js';
import { createSajuSourceProofPostgresNonceClaimV1 } from '../apps/api/src/saju-source-proof-nonce-postgres-claim-v1.js';
import type { PostgresQueryResultV1, PostgresSubjectPoolV1 } from '../apps/api/src/postgres-subject-execution.js';

const enabled = process.env.MYEONGHA_DOCKER_SAJU_RECOVERY === '1';
const stage = process.env.SAJU_BRIDGE_LOCAL_RECOVERY_STAGE;
const permitId = process.env.SAJU_BRIDGE_LOCAL_RECOVERY_PERMIT_ID ?? '';
const replayKey = process.env.SAJU_BRIDGE_LOCAL_RECOVERY_NONCE_KEY ?? '';
const permitIssued = Number(process.env.SAJU_BRIDGE_LOCAL_RECOVERY_PERMIT_ISSUED_MS);
const permitExpiry = Number(process.env.SAJU_BRIDGE_LOCAL_RECOVERY_PERMIT_EXPIRES_MS);
const nonceExpiry = Number(process.env.SAJU_BRIDGE_LOCAL_RECOVERY_NONCE_EXPIRES_MS);
const subjectDB = 'myeongha_saju_subject_local_verify';
const nonceDB = 'myeongha_saju_nonce_local_verify';
const admissionDB = 'myeongha_saju_admission_local_verify';
const admissionTable = 'public.saju_staging_operator_admission_permits_v2';
const nonceTable = 'public.saju_source_proof_nonce_claims';
const ca = enabled ? {
  subject: readFileSync('/certs/subject/ca.crt', 'utf8'),
  nonce: readFileSync('/certs/nonce/ca.crt', 'utf8'),
  admission: readFileSync('/certs/admission/ca.crt', 'utf8'),
} : undefined;
type Target = 'subject' | 'nonce' | 'admission';
const params: Record<Target, readonly [string,string,string,string,string]> = {
  subject: ['subject-db', subjectDB, 'myeongha_runtime',
    'SAJU_BRIDGE_LOCAL_SUBJECT_LOGIN_PASSWORD','SAJU_BRIDGE_LOCAL_SUBJECT_DB_PASSWORD'],
  nonce: ['nonce-db', nonceDB, 'myeongha_docker_nonce_login',
    'SAJU_BRIDGE_LOCAL_NONCE_LOGIN_PASSWORD','SAJU_BRIDGE_LOCAL_NONCE_DB_PASSWORD'],
  admission: ['admission-db', admissionDB, 'myeongha_docker_admission_tls_probe',
    'SAJU_BRIDGE_LOCAL_ADMISSION_LOGIN_PASSWORD','SAJU_BRIDGE_LOCAL_ADMISSION_DB_PASSWORD'],
};
const pools: Pool[] = [];
function owned(target: Target, admin = false): Pool {
  const p = params[target];
  const result = new Pool({
    host: p[0], port: 5432, database: p[1], user: admin ? 'postgres' : p[2],
    password: process.env[admin ? p[4] : p[3]],
    ssl: ca ? { ca: ca[target], rejectUnauthorized: true } : false,
    max: 2, connectionTimeoutMillis: 1600, idleTimeoutMillis: 750,
  });
  pools.push(result);
  return result;
}
function guard() {
  if (!enabled || !['seed','outage-nonce','outage-subject','outage-admission','verify'].includes(stage ?? '')
    || process.env.MYEONGHA_DOCKER_SAJU_TLS !== '1'
    || process.env.MYEONGHA_DOCKER_SAJU_PERMIT !== '1'
    || process.env.SAJU_BRIDGE_LOCAL_SUBJECT_DB !== subjectDB
    || process.env.SAJU_BRIDGE_LOCAL_NONCE_DB !== nonceDB
    || !ca || new Set(Object.values(ca)).size !== 3
    || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(permitId)
    || !/^[A-Za-z0-9_-]{32,128}$/u.test(replayKey)
    || !Number.isSafeInteger(permitIssued) || !Number.isSafeInteger(permitExpiry)
    || !Number.isSafeInteger(nonceExpiry)
    || permitIssued >= Date.now() || permitExpiry <= Date.now()
    || permitExpiry - permitIssued > 900000
    || Object.values(params).some(p => [p[3],p[4]].some(k => (process.env[k]?.length ?? 0) < 40))) {
    throw new Error('Refusing recovery check outside disposable pinned Docker TLS matrix.');
  }
}
function port(p: Pool, injectLostAck = false): PostgresSubjectPoolV1 {
  return {
    async connect() {
      const c = await p.connect();
      let once = false;
      return {
        async query<Row = Record<string, unknown>>(sql: string, args?: readonly unknown[]):
          Promise<PostgresQueryResultV1<Row>> {
          const r = await c.query(sql, args === undefined ? [] : [...args]);
          // Explicitly SYNTHETIC lost acknowledgement AFTER actual successful DB COMMIT.
          // This does not claim a physical mid-commit network disconnection.
          if (injectLostAck && sql === 'COMMIT' && !once) {
            once = true;
            throw new Error('DISPOSABLE_COMMIT_ACK_UNKNOWN');
          }
          return { rows: r.rows as readonly Row[] };
        },
        release(error?: unknown) {
          c.release(error === undefined ? undefined
            : error instanceof Error ? error : new Error('Discard recovery connection'));
        },
      };
    },
  };
}
function digest() {
  return createHash('sha256').update('myeongha/saju/source-proof/nonce-replay/v1\0')
    .update(replayKey).digest('hex');
}
function fingerprint(pem: string) {
  return new X509Certificate(pem).fingerprint256.replaceAll(':','').toLowerCase();
}
function signedPermit(p: PostgresSubjectPoolV1) {
  if (!ca) throw new Error('No synthetic CAs.');
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
  const bind = (targetId: string, role: string, runtimeRole: string,
    hostname: string, caPem: string) => ({
    targetId, loginRole: role, runtimeRole, tlsHostname: hostname,
    caFingerprint256: fingerprint(caPem), tlsMode: 'verify-full',
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
    subjectDb: bind('staging-db:subject','myeongha_runtime','myeongha_api_executor',
      'subject.saju-bridge-ci.invalid',ca.subject),
    nonceDb: bind('staging-db:nonce','myeongha_docker_nonce_login',
      'myeongha_saju_proof_nonce_runtime','nonce.saju-bridge-ci.invalid',ca.nonce),
    admissionDb: bind('staging-db:admission','myeongha_docker_admission_tls_probe',
      'myeongha_saju_staging_admission_runtime','admission.saju-bridge-ci.invalid',ca.admission),
  };
  const permit = {
    version: 'myeongha-saju-staging-admission-contract-v2',permitId,
    manifestDigest: digestSajuHeldStagingTargetManifestV1(manifest),
    connectionPlanDigest: digestSajuHeldStagingConnectionPlanV1(plan),
    environmentId: manifest.environmentId,
    myeonghaCommitSha: manifest.myeonghaCommitSha,
    sajuCommitSha: manifest.sajuCommitSha,
    approvedOperatorId: 'docker-recovery-test',
    issuedAtMs: permitIssued, expiresAtMs: permitExpiry,
    consumedAtMs: null, status: 'ISSUED',approvalSignatureKeyId: 'docker-recovery-key',
  };
  return {
    permit,
    options: {
      manifest, approvedManifest: structuredClone(manifest),
      connectionPlan: plan, approvedConnectionPlan: structuredClone(plan),
      permit, approvalPublicKey: keys.publicKey,
      approvalSignature: sign(null,canonicalSajuHeldStagingPermitApprovalBytesV2(permit),
        keys.privateKey).toString('base64url'),
      expectedOperatorId: permit.approvedOperatorId,
      expectedApprovalKeyId: permit.approvalSignatureKeyId,
      nowMsFactory: () => Date.now(), pool: p,
    },
  };
}
async function permitStatus() {
  const r = await owned('admission',true).query<{status:string; consumed_at_ms:string|null}>(
    'select status, consumed_at_ms::text from ' + admissionTable + ' where permit_id=$1::uuid',
    [permitId],
  );
  return r.rows[0];
}
async function nonceCount() {
  const r = await owned('nonce',true).query<{c:string}>(
    'select count(*)::text as c from ' + nonceTable + ' where replay_key_digest=$1',
    [digest()],
  );
  return Number(r.rows[0]?.c);
}
describe.skipIf(!enabled)('real disposable PostgreSQL restart and synthetic commit-ACK uncertainty',() => {
  afterAll(async () => { await Promise.all(pools.map(p => p.end())); });
  it('fails closed during each named fault stage without operational promotion',async () => {
    guard();
    if (stage?.startsWith('outage-')) {
      const target = stage.slice('outage-'.length) as Target;
      await expect(owned(target).query('select 1')).rejects.toThrow();
      // This verifies a REAL unreachable TLS PostgreSQL peer; no in-process
      // fallback, automatic replay, or status upgrade is permitted.
      return;
    }
    if (stage === 'seed') {
      if (nonceExpiry <= Date.now() + 5000) throw new Error('Nonce expiry budget exhausted.');
      const nonceConsumer = createSajuSourceProofPostgresNonceClaimV1({
        pool: port(owned('nonce'),true),
      });
      expect(await nonceConsumer(replayKey,nonceExpiry)).toBe(false);
      expect(await nonceCount()).toBe(1);
      expect(await createSajuSourceProofPostgresNonceClaimV1({
        pool: port(owned('nonce')),
      })(replayKey,nonceExpiry)).toBe(false);

      const synthetic = signedPermit(port(owned('admission')));
      const x = synthetic.permit;
      await owned('admission',true).query(
        'insert into ' + admissionTable + ' (permit_id,manifest_digest,connection_plan_digest,'
        + 'environment_id,myeongha_commit_sha,saju_commit_sha,approved_operator_id,'
        + 'approval_signature_key_id,issued_at_ms,expires_at_ms,consumed_at_ms,status) '
        + 'values ($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9::bigint,$10::bigint,null,$11)',
        [x.permitId,x.manifestDigest,x.connectionPlanDigest,x.environmentId,
          x.myeonghaCommitSha,x.sajuCommitSha,x.approvedOperatorId,
          x.approvalSignatureKeyId,x.issuedAtMs,x.expiresAtMs,x.status],
      );
      const limited = createSajuHeldStagingPostgresAdmissionPortV2({
        ...synthetic.options, pool: port(owned('admission'),true),
      });
      expect(await limited.consumeAuthorizedAttemptOnce()).toBe(false);
      expect(await limited.consumeAuthorizedAttemptOnce()).toBe(false);
      expect(await permitStatus()).toMatchObject({status:'CONSUMED'});
      return;
    }
    if (stage === 'verify') {
      expect(await nonceCount()).toBe(1);
      expect(await permitStatus()).toMatchObject({status:'CONSUMED'});
      const subjects = await owned('subject',true).query<{id:string}>(
        "select id::text as id from public.subjects where id='8c320001-0000-4000-8000-000000000001'::uuid",
      );
      expect(subjects.rows).toHaveLength(1);
      if (Date.now() >= nonceExpiry) throw new Error('Nonce expired before replay probe: no valid anti-replay evidence.');
      expect(await createSajuSourceProofPostgresNonceClaimV1({
        pool: port(owned('nonce')),
      })(replayKey,nonceExpiry)).toBe(false);
      const p = signedPermit(port(owned('admission')));
      expect(await createSajuHeldStagingPostgresAdmissionPortV2(p.options)
        .consumeAuthorizedAttemptOnce()).toBe(false);
      return;
    }
    throw new Error('Unknown safe recovery stage.');
  }, 60000);
});
