import { X509Certificate, generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Pool, type PoolConfig } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createSajuHeldStagingPostgresAdmissionPortV2,
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
import type {
  PostgresQueryResultV1, PostgresSubjectPoolV1,
} from '../apps/api/src/postgres-subject-execution.js';

const enabled = process.env.MYEONGHA_LOCAL_TLS_ADMISSION_ENABLED === '1';
const db = 'myeongha_saju_admission_tls_verify';
const host = 'admission.saju-bridge-ci.invalid';
const login = 'myeongha_tls_admission_ci_login';
const permitTable = 'public.saju_staging_operator_admission_permits_v2';
const pem = (key: string) => enabled && process.env[key]
  ? readFileSync(process.env[key], 'utf8') : '';
const ca = pem('MYEONGHA_LOCAL_TLS_ADMISSION_CA_FILE');
const wrongCa = pem('MYEONGHA_LOCAL_TLS_ADMISSION_WRONG_CA_FILE');
const subjectCa = pem('MYEONGHA_LOCAL_TLS_SUBJECT_CA_FILE');
const nonceCa = pem('MYEONGHA_LOCAL_TLS_NONCE_CA_FILE');

const ssl = { ca, rejectUnauthorized: true };
const clientOptions: PoolConfig = {
  host, port: 5445, database: db, user: login,
  password: process.env.MYEONGHA_LOCAL_TLS_ADMISSION_PASSWORD,
  ssl, max: 4, connectionTimeoutMillis: 4000, idleTimeoutMillis: 1000,
};
const adminOptions: PoolConfig = {
  ...clientOptions, user: 'postgres',
  password: process.env.MYEONGHA_LOCAL_TLS_ADMISSION_ADMIN_PASSWORD,
};
const admission = enabled ? new Pool(clientOptions) : undefined;
const admin = enabled ? new Pool(adminOptions) : undefined;

function requireDisposable() {
  if (process.env.PGHOST !== '127.0.0.1'
    || process.env.PGPORT !== '5432'
    || process.env.PGDATABASE !== 'myeongha_saju_local_verify'
    || !process.env.MYEONGHA_LOCAL_TLS_ADMISSION_PASSWORD
    || !process.env.MYEONGHA_LOCAL_TLS_ADMISSION_ADMIN_PASSWORD
    || !process.env.MYEONGHA_LOCAL_TLS_ADMISSION_CA_FINGERPRINT
    || !process.env.MYEONGHA_LOCAL_TLS_ADMISSION_CA_FILE
    || !process.env.MYEONGHA_LOCAL_TLS_ADMISSION_WRONG_CA_FILE
    || !process.env.MYEONGHA_LOCAL_TLS_NONCE_CA_FILE
    || !process.env.MYEONGHA_LOCAL_TLS_SUBJECT_CA_FILE
    || !process.env.MYEONGHA_LOCAL_TLS_NONCE_CA_FINGERPRINT
    || !process.env.MYEONGHA_LOCAL_TLS_SUBJECT_CA_FINGERPRINT) {
    throw new Error('Admission TLS proof requires three disposable isolated PostgreSQL CA inputs.');
  }
}
function port(pool: Pool): PostgresSubjectPoolV1 {
  return {
    async connect() {
      const client = await pool.connect();
      return {
        async query<Row = Record<string, unknown>>(
          sql: string, values?: readonly unknown[],
        ): Promise<PostgresQueryResultV1<Row>> {
          const result = await client.query(sql, values === undefined ? [] : [...values]);
          return { rows: result.rows as readonly Row[] };
        },
        release(error?: unknown) {
          client.release(error === undefined ? undefined
            : error instanceof Error ? error : new Error('Discard isolated Admission TLS session'));
        },
      };
    },
  };
}

function signedCase() {
  const keys = generateKeyPairSync('ed25519');
  const now = Date.now();
  const manifest = {
    version: 'myeongha-saju-staging-target-v1',
    environmentId: 'myeongha-staging-v2-atomic',
    myeonghaCommitSha: 'a'.repeat(40), sajuCommitSha: 'b'.repeat(40),
    authProjectRef: 'abcdefghijklmnopqrst',
    authOrigin: 'https://abcdefghijklmnopqrst.supabase.co',
    subjectDbTargetId: 'staging-db:subject', nonceDbTargetId: 'staging-db:nonce',
    proofServiceOrigin: 'https://saju-proof.staging.example.com',
    proofIssuer: 'saju-preview', proofAudience: 'myeongha-staging',
    proofKeyId: 'hmac-key-v2', proofTtlMs: 60000,
  };
  const binding = (targetId: string, loginRole: string, runtimeRole: string,
    tlsHostname: string, fingerprint: string) => ({
    targetId, loginRole, runtimeRole, tlsHostname,
    caFingerprint256: fingerprint, tlsMode: 'verify-full',
  });
  const plan = {
    version: 'myeongha-saju-staging-connection-plan-v1',
    manifestDigest: digestSajuHeldStagingTargetManifestV1(manifest),
    environmentId: manifest.environmentId,
    myeonghaCommitSha: manifest.myeonghaCommitSha,
    sajuCommitSha: manifest.sajuCommitSha,
    authProjectRef: manifest.authProjectRef, authOrigin: manifest.authOrigin,
    proofServiceOrigin: manifest.proofServiceOrigin, proofIssuer: manifest.proofIssuer,
    proofAudience: manifest.proofAudience, proofKeyId: manifest.proofKeyId,
    subjectDb: binding('staging-db:subject', 'myeongha_runtime',
      'myeongha_api_executor', 'subject.saju-bridge-ci.invalid',
      process.env.MYEONGHA_LOCAL_TLS_SUBJECT_CA_FINGERPRINT!),
    nonceDb: binding('staging-db:nonce', 'myeongha_tls_nonce_ci_login',
      'myeongha_saju_proof_nonce_runtime', 'nonce.saju-bridge-ci.invalid',
      process.env.MYEONGHA_LOCAL_TLS_NONCE_CA_FINGERPRINT!),
    admissionDb: binding('staging-db:admission', login,
      'myeongha_saju_staging_admission_runtime', host,
      process.env.MYEONGHA_LOCAL_TLS_ADMISSION_CA_FINGERPRINT!),
  };
  const permit = {
    version: 'myeongha-saju-staging-admission-contract-v2',
    permitId: randomUUID(),
    manifestDigest: digestSajuHeldStagingTargetManifestV1(manifest),
    connectionPlanDigest: digestSajuHeldStagingConnectionPlanV1(plan),
    environmentId: manifest.environmentId,
    myeonghaCommitSha: manifest.myeonghaCommitSha,
    sajuCommitSha: manifest.sajuCommitSha,
    approvedOperatorId: 'approved-operator-v2',
    issuedAtMs: now - 1000, expiresAtMs: now + 90000,
    consumedAtMs: null, status: 'ISSUED', approvalSignatureKeyId: 'ci-approved-v2-key',
  };
  const options = {
    manifest, approvedManifest: structuredClone(manifest),
    connectionPlan: plan, approvedConnectionPlan: structuredClone(plan),
    permit, approvalPublicKey: keys.publicKey,
    approvalSignature: sign(
      null, canonicalSajuHeldStagingPermitApprovalBytesV2(permit),
      keys.privateKey,
    ).toString('base64url'),
    expectedOperatorId: 'approved-operator-v2',
    expectedApprovalKeyId: 'ci-approved-v2-key',
    nowMsFactory: () => Date.now(),
    pool: port(admission!),
  };
  return { permit, options };
}

async function seed(f: ReturnType<typeof signedCase>) {
  const p = f.permit;
  await admin!.query(
    'insert into ' + permitTable + ' (permit_id,manifest_digest,connection_plan_digest,'
    + 'environment_id,myeongha_commit_sha,saju_commit_sha,approved_operator_id,'
    + 'approval_signature_key_id,issued_at_ms,expires_at_ms,consumed_at_ms,status) '
    + 'values ($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9::bigint,$10::bigint,null,$11)',
    [
      p.permitId, p.manifestDigest, p.connectionPlanDigest, p.environmentId,
      p.myeonghaCommitSha, p.sajuCommitSha, p.approvedOperatorId,
      p.approvalSignatureKeyId, p.issuedAtMs, p.expiresAtMs, p.status,
    ],
  );
}
async function status(permitId: string) {
  const result = await admin!.query<{ status: string }>(
    'select status from ' + permitTable + ' where permit_id=$1::uuid', [permitId],
  );
  return result.rows[0]?.status;
}
async function shouldReject(config: PoolConfig) {
  const pool = new Pool({
    ...clientOptions, ...config, max: 1, connectionTimeoutMillis: 2500,
  });
  try { await expect(pool.query('select 1')).rejects.toThrow(); }
  finally { await pool.end(); }
}

describe.skipIf(!enabled)('independent Admission PostgreSQL TLS and signed Permit V2 under limited login', () => {
  beforeAll(async () => {
    requireDisposable();
    expect(new X509Certificate(ca).fingerprint256.replaceAll(':', '').toLowerCase())
      .toBe(process.env.MYEONGHA_LOCAL_TLS_ADMISSION_CA_FINGERPRINT);
    expect(new Set([ca, subjectCa, nonceCa]).size).toBe(3);
    expect(wrongCa).not.toBe(ca);
    const probe = await admission!.query<{
      db: string; principal: string; session: string; ssl: boolean;
      version: string; superuser: boolean; can_admit: boolean;
      has_birth: boolean; has_nonce: boolean;
    }>(
      "select current_database()::text as db, current_user::text as principal,"
      + " session_user::text as session, ssl.ssl, ssl.version,"
      + " (select rolsuper from pg_roles where rolname=current_user) as superuser,"
      + " pg_has_role(current_user,'myeongha_saju_staging_admission_runtime','MEMBER') as can_admit,"
      + " exists(select 1 from pg_roles where rolname='myeongha_api_executor') as has_birth,"
      + " exists(select 1 from pg_roles where rolname='myeongha_saju_proof_nonce_runtime') as has_nonce"
      + " from pg_stat_ssl ssl where ssl.pid=pg_backend_pid()",
    );
    expect(probe.rows[0]).toMatchObject({
      db, principal: login, session: login, ssl: true,
      superuser: false, can_admit: true, has_birth: false, has_nonce: false,
    });
    expect(probe.rows[0]?.version).toMatch(/^TLSv1\.[23]$/u);
  });

  afterAll(async () => { await Promise.all([admission?.end(), admin?.end()]); });

  it('blocks wrong CA, wrong hostname, plaintext, and Subject/Nonce login crossover', async () => {
    await shouldReject({ ssl: { ca: wrongCa, rejectUnauthorized: true } });
    await shouldReject({ host: 'other-admission.saju-bridge-ci.invalid' });
    await shouldReject({ host: '127.0.0.1', ssl: false });
    await shouldReject({
      user: 'myeongha_runtime', password: process.env.MYEONGHA_LOCAL_TLS_SUBJECT_PASSWORD,
    });
    await shouldReject({
      user: 'myeongha_tls_nonce_ci_login', password: process.env.MYEONGHA_LOCAL_TLS_NONCE_PASSWORD,
    });
  });

  it('denies direct Permit SELECT/INSERT and issuer/revoker/foreign SET ROLE', async () => {
    await expect(admission!.query('select permit_id from ' + permitTable)).rejects.toThrow();
    await expect(admission!.query('insert into ' + permitTable + '(permit_id) values ($1)',
      [randomUUID()])).rejects.toThrow();
    const client = await admission!.connect();
    try {
      for (const forbidden of [
        'myeongha_saju_staging_admission_issuer',
        'myeongha_saju_staging_admission_revoker',
        'myeongha_api_executor',
      ]) {
        await client.query('BEGIN');
        await expect(client.query('SET LOCAL ROLE ' + forbidden)).rejects.toThrow();
        await client.query('ROLLBACK');
      }
    } finally { client.release(); }
  });

  it('consumes a signed V2 Permit once with a real TLS login and keeps replay blocked', async () => {
    const f = signedCase();
    await seed(f);
    const operation = createSajuHeldStagingPostgresAdmissionPortV2(f.options);
    expect(await operation.consumeAuthorizedAttemptOnce()).toBe(true);
    expect(await operation.consumeAuthorizedAttemptOnce()).toBe(false);
    await expect(status(f.permit.permitId)).resolves.toBe('CONSUMED');
    const fresh = createSajuHeldStagingPostgresAdmissionPortV2(f.options);
    expect(await fresh.consumeAuthorizedAttemptOnce()).toBe(false);
  });

  it('allows at most one of two concurrent network TLS consumers', async () => {
    const f = signedCase();
    await seed(f);
    const a = createSajuHeldStagingPostgresAdmissionPortV2(f.options);
    const b = createSajuHeldStagingPostgresAdmissionPortV2(f.options);
    const result = await Promise.all([
      a.consumeAuthorizedAttemptOnce(), b.consumeAuthorizedAttemptOnce(),
    ]);
    expect(result.sort()).toEqual([false, true]);
    expect(await status(f.permit.permitId)).toBe('CONSUMED');
  });

  it('blocks a revoked Permit and never converts it into execution authority', async () => {
    const f = signedCase();
    await seed(f);
    await admin!.query('update ' + permitTable + " set status='REVOKED' where permit_id=$1::uuid",
      [f.permit.permitId]);
    expect(await createSajuHeldStagingPostgresAdmissionPortV2(f.options)
      .consumeAuthorizedAttemptOnce()).toBe(false);
    expect(await status(f.permit.permitId)).toBe('REVOKED');
  });

  it('rolls back an incomplete consume and forbids direct login role privileges', async () => {
    const f = signedCase();
    await seed(f);
    const connection = await admission!.connect();
    try {
      await connection.query('BEGIN');
      await connection.query('SET LOCAL ROLE myeongha_saju_staging_admission_runtime');
      const attempted = await connection.query(
        'update ' + permitTable + " set status='CONSUMED',"
        + " consumed_at_ms=floor(extract(epoch from clock_timestamp())*1000)::bigint"
        + " where permit_id=$1::uuid and status='ISSUED' returning permit_id::text",
        [f.permit.permitId],
      );
      expect(attempted.rows).toHaveLength(1);
      await connection.query('ROLLBACK');
    } finally { connection.release(); }
    expect(await status(f.permit.permitId)).toBe('ISSUED');
    expect(await createSajuHeldStagingPostgresAdmissionPortV2(f.options)
      .consumeAuthorizedAttemptOnce()).toBe(true);
  });

  it('fails closed on signed expiration, tampering and a disconnected DB', async () => {
    const f = signedCase();
    await seed(f);
    const expired = createSajuHeldStagingPostgresAdmissionPortV2({
      ...f.options, nowMsFactory: () => f.permit.expiresAtMs,
    });
    expect(await expired.consumeAuthorizedAttemptOnce()).toBe(false);
    expect(await status(f.permit.permitId)).toBe('ISSUED');
    expect(() => createSajuHeldStagingPostgresAdmissionPortV2({
      ...f.options,
      approvalSignature: 'invalid-operator-signature',
    })).toThrow();
    const disconnected = new Pool(clientOptions);
    await disconnected.end();
    const unavailable = createSajuHeldStagingPostgresAdmissionPortV2({
      ...f.options, pool: port(disconnected),
    });
    expect(await unavailable.consumeAuthorizedAttemptOnce()).toBe(false);
    expect(await status(f.permit.permitId)).toBe('ISSUED');
  });
});
