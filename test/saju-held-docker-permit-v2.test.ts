import { X509Certificate, generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSajuHeldStagingPostgresAdmissionPortV2 } from '../apps/api/src/saju-held-staging-admission-postgres-v2.js';
import { canonicalSajuHeldStagingPermitApprovalBytesV2 } from '../apps/api/src/saju-held-staging-admission-signature-v2.js';
import { digestSajuHeldStagingTargetManifestV1 } from '../apps/api/src/saju-held-staging-target-manifest-v1.js';
import { digestSajuHeldStagingConnectionPlanV1 } from '../apps/api/src/saju-held-staging-connection-plan-v1.js';
import type { PostgresQueryResultV1, PostgresSubjectPoolV1 } from '../apps/api/src/postgres-subject-execution.js';

const enabled = process.env.MYEONGHA_DOCKER_SAJU_PERMIT === '1';
const database = 'myeongha_saju_admission_local_verify';
const host = 'admission-db';
const table = 'public.saju_staging_operator_admission_permits_v2';
const consumerName = 'myeongha_docker_admission_tls_probe';
const runtimeRole = 'myeongha_saju_staging_admission_runtime';
const ca = enabled ? {
  subject: readFileSync('/certs/subject/ca.crt', 'utf8'),
  nonce: readFileSync('/certs/nonce/ca.crt', 'utf8'),
  admission: readFileSync('/certs/admission/ca.crt', 'utf8'),
} : undefined;
const poolBase = {
  host, port: 5432, database,
  ssl: ca ? { ca: ca.admission, rejectUnauthorized: true } : undefined,
  max: 3, connectionTimeoutMillis: 5000,
};
const consumer = enabled ? new Pool({
  ...poolBase, user: consumerName,
  password: process.env.SAJU_BRIDGE_LOCAL_ADMISSION_LOGIN_PASSWORD,
}) : undefined;
const second = enabled ? new Pool({
  ...poolBase, user: consumerName,
  password: process.env.SAJU_BRIDGE_LOCAL_ADMISSION_LOGIN_PASSWORD,
}) : undefined;
const admin = enabled ? new Pool({
  ...poolBase, user: 'postgres',
  password: process.env.SAJU_BRIDGE_LOCAL_ADMISSION_DB_PASSWORD,
}) : undefined;

function guard(): void {
  if (!enabled || process.env.MYEONGHA_DOCKER_SAJU_TLS !== '1'
    || process.env.SAJU_BRIDGE_LOCAL_AUTH_URL !== 'http://gotrue:9999'
    || process.env.SAJU_BRIDGE_LOCAL_SUBJECT_HOST !== 'subject-db'
    || process.env.SAJU_BRIDGE_LOCAL_NONCE_HOST !== 'nonce-db'
    || process.env.SAJU_BRIDGE_LOCAL_SUBJECT_DB !== 'myeongha_saju_subject_local_verify'
    || process.env.SAJU_BRIDGE_LOCAL_NONCE_DB !== 'myeongha_saju_nonce_local_verify'
    || !ca || !process.env.SAJU_BRIDGE_LOCAL_ADMISSION_LOGIN_PASSWORD
    || process.env.SAJU_BRIDGE_LOCAL_ADMISSION_LOGIN_PASSWORD.length < 40
    || !process.env.SAJU_BRIDGE_LOCAL_ADMISSION_DB_PASSWORD
    || process.env.SAJU_BRIDGE_LOCAL_ADMISSION_DB_PASSWORD.length < 40) {
    throw new Error('Synthetic Permit V2 requires disposable isolated TLS Docker authority.');
  }
}
function port(pool: Pool): PostgresSubjectPoolV1 {
  return {
    async connect() {
      const connection = await pool.connect();
      return {
        async query<Row = Record<string, unknown>>(
          sql: string, values?: readonly unknown[],
        ): Promise<PostgresQueryResultV1<Row>> {
          const result = await connection.query(sql, values === undefined ? [] : [...values]);
          return { rows: result.rows as readonly Row[] };
        },
        release(error?: unknown) {
          connection.release(error === undefined ? undefined
            : error instanceof Error ? error : new Error('Discard disposable admission connection'));
        },
      };
    },
  };
}
function caFingerprint(pem: string): string {
  return new X509Certificate(pem).fingerprint256.replaceAll(':', '').toLowerCase();
}
function signedCase() {
  if (!ca) throw new Error('Missing disposable TLS CAs.');
  const keys = generateKeyPairSync('ed25519');
  const now = Date.now();
  const manifest = {
    version: 'myeongha-saju-staging-target-v1',
    environmentId: 'myeongha-staging-docker-synthetic',
    myeonghaCommitSha: 'a'.repeat(40),
    sajuCommitSha: 'b'.repeat(40),
    authProjectRef: 'abcdefghijklmnopqrst',
    authOrigin: 'https://abcdefghijklmnopqrst.supabase.co',
    subjectDbTargetId: 'staging-db:subject', nonceDbTargetId: 'staging-db:nonce',
    proofServiceOrigin: 'https://saju-proof.staging.example.com',
    proofIssuer: 'saju-preview', proofAudience: 'myeongha-staging',
    proofKeyId: 'synthetic-proof-key-v2', proofTtlMs: 60000,
  };
  const binding = (targetId: string, loginRole: string, role: string,
    hostname: string, fingerprint: string) => ({
    targetId, loginRole, runtimeRole: role,
    tlsHostname: hostname, caFingerprint256: fingerprint, tlsMode: 'verify-full',
  });
  // All targets below are SYNTHETIC signed metadata only; no operational
  // manifest, external origin or staging Attestor is contacted.
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
    subjectDb: binding('staging-db:subject', 'myeongha_runtime', 'myeongha_api_executor',
      'subject.saju-bridge-ci.invalid', caFingerprint(ca.subject)),
    nonceDb: binding('staging-db:nonce', 'myeongha_docker_nonce_login',
      'myeongha_saju_proof_nonce_runtime', 'nonce.saju-bridge-ci.invalid',
      caFingerprint(ca.nonce)),
    admissionDb: binding('staging-db:admission', consumerName, runtimeRole,
      'admission.saju-bridge-ci.invalid', caFingerprint(ca.admission)),
  };
  const permit = {
    version: 'myeongha-saju-staging-admission-contract-v2',
    permitId: randomUUID(),
    manifestDigest: digestSajuHeldStagingTargetManifestV1(manifest),
    connectionPlanDigest: digestSajuHeldStagingConnectionPlanV1(plan),
    environmentId: manifest.environmentId,
    myeonghaCommitSha: manifest.myeonghaCommitSha,
    sajuCommitSha: manifest.sajuCommitSha,
    approvedOperatorId: 'docker-synthetic-operator',
    issuedAtMs: now - 1000, expiresAtMs: now + 90000,
    consumedAtMs: null, status: 'ISSUED',
    approvalSignatureKeyId: 'docker-synthetic-key-v2',
  };
  const options = {
    manifest, approvedManifest: structuredClone(manifest),
    connectionPlan: plan, approvedConnectionPlan: structuredClone(plan),
    permit, approvalPublicKey: keys.publicKey,
    approvalSignature: sign(
      null, canonicalSajuHeldStagingPermitApprovalBytesV2(permit),
      keys.privateKey,
    ).toString('base64url'),
    expectedOperatorId: permit.approvedOperatorId,
    expectedApprovalKeyId: permit.approvalSignatureKeyId,
    nowMsFactory: () => Date.now(),
    pool: port(consumer!),
  };
  return { permit, plan, manifest, options };
}
async function seed(p: ReturnType<typeof signedCase>['permit']) {
  await admin!.query(
    'insert into ' + table + ' (permit_id,manifest_digest,connection_plan_digest,'
    + 'environment_id,myeongha_commit_sha,saju_commit_sha,approved_operator_id,'
    + 'approval_signature_key_id,issued_at_ms,expires_at_ms,consumed_at_ms,status) '
    + 'values ($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9::bigint,$10::bigint,null,$11)',
    [p.permitId, p.manifestDigest, p.connectionPlanDigest, p.environmentId,
      p.myeonghaCommitSha, p.sajuCommitSha, p.approvedOperatorId,
      p.approvalSignatureKeyId, p.issuedAtMs, p.expiresAtMs, p.status],
  );
}
async function state(id: string) {
  const result = await admin!.query<{ status: string; consumed_at_ms: string | null }>(
    'select status, consumed_at_ms::text from ' + table + ' where permit_id=$1::uuid', [id],
  );
  return result.rows[0];
}

describe.skipIf(!enabled)('Docker-only synthetic signed Permit V2 over independent Admission TLS', () => {
  beforeAll(async () => {
    guard();
    const status = await consumer!.query<{
      db: string; login: string; ssl: boolean; role_member: boolean;
      issuer: boolean; revoker: boolean; separate_subject: boolean;
      separate_nonce: boolean; rls: boolean;
    }>(
      "select current_database()::text as db, session_user::text as login, ssl.ssl, "
      + "pg_has_role(current_user,'myeongha_saju_staging_admission_runtime','MEMBER') as role_member, "
      + "pg_has_role(current_user,'myeongha_saju_staging_admission_issuer','MEMBER') as issuer, "
      + "pg_has_role(current_user,'myeongha_saju_staging_admission_revoker','MEMBER') as revoker, "
      + "exists(select 1 from pg_roles where rolname='myeongha_api_executor') as separate_subject, "
      + "exists(select 1 from pg_roles where rolname='myeongha_saju_proof_nonce_runtime') as separate_nonce, "
      + "(select relrowsecurity and relforcerowsecurity from pg_class where oid="
      + "'public.saju_staging_operator_admission_permits_v2'::regclass) as rls "
      + "from pg_stat_ssl ssl where ssl.pid=pg_backend_pid()",
    );
    expect(status.rows[0]).toMatchObject({
      db: database, login: consumerName, ssl: true,
      role_member: true, issuer: false, revoker: false,
      separate_subject: false, separate_nonce: false, rls: true,
    });
    // No direct table access without the deliberately scoped SET LOCAL ROLE.
    await expect(consumer!.query('select status from ' + table)).rejects.toThrow();
  }, 30000);
  afterAll(async () => {
    await Promise.all([consumer?.end(), second?.end(), admin?.end()]);
  });

  it('signs a synthetic V2 permit and atomically consumes it once across independent sessions', async () => {
    const fixture = signedCase();
    await seed(fixture.permit);
    const first = createSajuHeldStagingPostgresAdmissionPortV2(fixture.options);
    const other = createSajuHeldStagingPostgresAdmissionPortV2({
      ...fixture.options, pool: port(second!),
    });
    const [a, b] = await Promise.all([
      first.consumeAuthorizedAttemptOnce(), other.consumeAuthorizedAttemptOnce(),
    ]);
    expect([a, b].sort()).toEqual([false, true]);
    expect(await first.consumeAuthorizedAttemptOnce()).toBe(false);
    expect(await other.consumeAuthorizedAttemptOnce()).toBe(false);
    expect(await state(fixture.permit.permitId)).toMatchObject({ status: 'CONSUMED' });
    // This operation is an isolated proof of DB semantics, not staging admission
    // and never calls Saju Runner or returns canExecute/canPublish/canSell.
  });

  it('rejects wrong signature, key, signed manifest and TLS plan drift without changing row', async () => {
    const f = signedCase();
    await seed(f.permit);
    const wrongKeys = generateKeyPairSync('ed25519');
    for (const altered of [
      { approvalPublicKey: wrongKeys.publicKey },
      { approvalSignature: sign(null, Buffer.from('forged'), wrongKeys.privateKey)
        .toString('base64url') },
      { approvedConnectionPlan: {
        ...f.plan, admissionDb: {
          ...f.plan.admissionDb, caFingerprint256: 'f'.repeat(64),
        },
      } },
      { approvedManifest: { ...f.manifest, environmentId: 'myeongha-staging-drift' } },
    ]) {
      expect(() => createSajuHeldStagingPostgresAdmissionPortV2({
        ...f.options, ...altered,
      })).toThrow(TypeError);
    }
    expect(await state(f.permit.permitId)).toMatchObject({
      status: 'ISSUED', consumed_at_ms: null,
    });
  });

  it('fails closed for revoked permit and for expired caller clock', async () => {
    const revoked = signedCase();
    await seed(revoked.permit);
    await admin!.query('update ' + table + " set status='REVOKED' where permit_id=$1::uuid",
      [revoked.permit.permitId]);
    expect(await createSajuHeldStagingPostgresAdmissionPortV2(
      revoked.options,
    ).consumeAuthorizedAttemptOnce()).toBe(false);
    expect(await state(revoked.permit.permitId)).toMatchObject({ status: 'REVOKED' });

    const expired = signedCase();
    await seed(expired.permit);
    const stale = createSajuHeldStagingPostgresAdmissionPortV2({
      ...expired.options, nowMsFactory: () => expired.permit.expiresAtMs,
    });
    expect(await stale.consumeAuthorizedAttemptOnce()).toBe(false);
    expect(await stale.consumeAuthorizedAttemptOnce()).toBe(false);
    expect(await state(expired.permit.permitId)).toMatchObject({
      status: 'ISSUED', consumed_at_ms: null,
    });
  });

  it('denies synthetic connection failure without retry or durable mutation', async () => {
    const f = signedCase();
    await seed(f.permit);
    let calls = 0;
    const broken: PostgresSubjectPoolV1 = {
      async connect() {
        calls++;
        throw new Error('SYNTHETIC_ADMISSION_CONNECT_FAILURE');
      },
    };
    const port = createSajuHeldStagingPostgresAdmissionPortV2({
      ...f.options, pool: broken,
    });
    expect(await port.consumeAuthorizedAttemptOnce()).toBe(false);
    expect(await port.consumeAuthorizedAttemptOnce()).toBe(false);
    expect(calls).toBe(1);
    expect(await state(f.permit.permitId)).toMatchObject({
      status: 'ISSUED', consumed_at_ms: null,
    });
  });
});
