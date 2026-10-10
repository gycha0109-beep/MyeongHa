import { X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Pool, type PoolConfig } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createNodePostgresSubjectPoolFromDriverV1,
  type NodePostgresDriverPoolV1,
} from '../apps/api/src/node-postgres-subject-pool.js';
import { readBoundCurrentBirthContextV1 } from '../apps/api/src/current-subject-saju-calculation-http.js';
import { bindCurrentSubjectSajuHeldProofV1 } from '../apps/api/src/saju-held-source-proof-revision-binding-v1.js';
import {
  createSajuHeldSourceProofHttpIssuePortV1,
  SAJU_HELD_SOURCE_PROOF_HTTP_PATH_V1,
  type SajuHeldSourceProofHttpFetchV1,
} from '../apps/api/src/saju-held-source-proof-http-client-v1.js';
import { createSajuSourceProofPostgresNonceClaimV1 } from '../apps/api/src/saju-source-proof-nonce-postgres-claim-v1.js';
import type { PostgresSubjectPoolV1, PostgresQueryResultV1 } from '../apps/api/src/postgres-subject-execution.js';

const enabled = process.env.MYEONGHA_LOCAL_TLS_SUBJECT_ENABLED === '1';
const subjectHost = 'subject.saju-bridge-ci.invalid';
const db = 'myeongha_saju_subject_tls_verify';
const subjectLogin = 'myeongha_runtime';
const owner = '8c310001-0000-4000-8000-000000000001';
const other = '8c310002-0000-4000-8000-000000000002';
const subjectId = '8c320001-0000-4000-8000-000000000001';
const revision = '8c340001-0000-4000-8000-000000000001';
const sourceOrigin = 'https://saju-proof-local-test.invalid';
const route = SAJU_HELD_SOURCE_PROOF_HTTP_PATH_V1;
const proofPort = Number(process.env.MYEONGHA_LOCAL_SAJU_PORT);
const pem = (key: string) => enabled && process.env[key]
  ? readFileSync(process.env[key], 'utf8') : '';
const ca = pem('MYEONGHA_LOCAL_TLS_SUBJECT_CA_FILE');
const wrongCa = pem('MYEONGHA_LOCAL_TLS_SUBJECT_WRONG_CA_FILE');
const nonceCa = pem('MYEONGHA_LOCAL_TLS_NONCE_CA_FILE');
const subjectOptions: PoolConfig = {
  host: subjectHost, port: 5444, database: db, user: subjectLogin,
  password: process.env.MYEONGHA_LOCAL_TLS_SUBJECT_PASSWORD,
  ssl: { ca, rejectUnauthorized: true },
  max: 1, connectionTimeoutMillis: 4000, idleTimeoutMillis: 1000,
};
const nonceOptions: PoolConfig = {
  host: 'nonce.saju-bridge-ci.invalid', port: 5443,
  database: 'myeongha_saju_nonce_tls_verify', user: 'myeongha_tls_nonce_ci_login',
  password: process.env.MYEONGHA_LOCAL_TLS_NONCE_PASSWORD,
  ssl: { ca: nonceCa, rejectUnauthorized: true },
  max: 2, connectionTimeoutMillis: 4000, idleTimeoutMillis: 1000,
};
const subjectPg = enabled ? new Pool(subjectOptions) : undefined;
const noncePg = enabled ? new Pool(nonceOptions) : undefined;

function safeInput() {
  if (process.env.PGHOST !== '127.0.0.1' || process.env.PGPORT !== '5432'
    || process.env.PGDATABASE !== 'myeongha_saju_local_verify'
    || !process.env.MYEONGHA_LOCAL_TLS_SUBJECT_PASSWORD
    || !process.env.MYEONGHA_LOCAL_TLS_NONCE_PASSWORD
    || !process.env.MYEONGHA_LOCAL_TLS_SUBJECT_CA_FINGERPRINT
    || !process.env.MYEONGHA_LOCAL_TLS_SUBJECT_CA_FILE
    || !process.env.MYEONGHA_LOCAL_TLS_SUBJECT_WRONG_CA_FILE
    || !process.env.MYEONGHA_LOCAL_TLS_NONCE_CA_FILE
    || !process.env.MYEONGHA_LOCAL_SAJU_BEARER
    || !process.env.MYEONGHA_LOCAL_SAJU_HMAC_KEY
    || !process.env.MYEONGHA_LOCAL_SAJU_ISSUER
    || !process.env.MYEONGHA_LOCAL_SAJU_AUDIENCE
    || !process.env.MYEONGHA_LOCAL_SAJU_KEY_ID
    || !Number.isSafeInteger(proofPort) || proofPort < 1 || proofPort > 65535
  ) throw new Error('Subject TLS suite requires isolated CI peer, roles, CA and loopback Saju.');
}

function driver(pool: Pool): NodePostgresDriverPoolV1 {
  return {
    async connect() {
      const client = await pool.connect();
      return {
        async query(sql, values) {
          const result = await client.query(sql, values === undefined ? [] : [...values]);
          return { rows: result.rows as readonly Record<string, unknown>[] };
        },
        release(error) { client.release(error); },
      };
    },
    async end() { await pool.end(); },
  };
}
function dbPort(pool: Pool): PostgresSubjectPoolV1 {
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
            : error instanceof Error ? error : new Error('Discard Subject TLS CI connection'));
        },
      };
    },
  };
}
const subject = enabled
  ? createNodePostgresSubjectPoolFromDriverV1({
    driverPool: driver(subjectPg!), expectedLoginPrincipal: subjectLogin,
  }) : undefined;
async function mustReject(config: PoolConfig) {
  const pool = new Pool({ ...subjectOptions, ...config, max: 1, connectionTimeoutMillis: 2500 });
  try { await expect(pool.query('select 1')).rejects.toThrow(); }
  finally { await pool.end(); }
}
const sajuFetch: SajuHeldSourceProofHttpFetchV1 = (url, init) => {
  if (url !== sourceOrigin + route || init.method !== 'POST' || init.redirect !== 'manual')
    throw new Error('Invalid Subject TLS suite source-proof destination.');
  return fetch('http://127.0.0.1:' + proofPort + route, init);
};

describe.skipIf(!enabled)('isolated Subject PostgreSQL verified TLS CA/host/role and reusable session', () => {
  beforeAll(async () => {
    safeInput();
    expect(new X509Certificate(ca).fingerprint256.replaceAll(':', '').toLowerCase())
      .toBe(process.env.MYEONGHA_LOCAL_TLS_SUBJECT_CA_FINGERPRINT);
    expect(wrongCa).not.toBe(ca);
    expect(nonceCa).not.toBe(ca);
    const status = await subjectPg!.query<{
      db: string; login: string; principal: string; ssl: boolean; version: string;
      superuser: boolean; can_exec: boolean; can_nonce: boolean;
    }>(`select current_database()::text as db, session_user::text as login,
      current_user::text as principal, ssl.ssl, ssl.version,
      (select rolsuper from pg_roles where rolname=current_user) as superuser,
      pg_has_role(current_user,'myeongha_api_executor','MEMBER') as can_exec,
      pg_has_role(current_user,'myeongha_saju_proof_nonce_runtime','MEMBER') as can_nonce
      from pg_stat_ssl ssl where ssl.pid=pg_backend_pid()`);
    expect(status.rows[0]).toMatchObject({
      db, login: subjectLogin, principal: subjectLogin, ssl: true,
      superuser: false, can_exec: true, can_nonce: false,
    });
    expect(status.rows[0]?.version).toMatch(/^TLSv1\.[23]$/u);
  });

  afterAll(async () => {
    await Promise.all([subjectPg?.end(), noncePg?.end()]);
  });

  it('rejects unknown CA, wrong DNS SAN hostname, and plaintext Subject clients', async () => {
    await mustReject({ ssl: { ca: wrongCa, rejectUnauthorized: true } });
    await mustReject({ host: 'other-subject.saju-bridge-ci.invalid' });
    await mustReject({ host: '127.0.0.1', ssl: false });
  });

  it('rejects cross-cluster credentials and direct Subject/Nonce table access', async () => {
    await mustReject({
      user: 'myeongha_tls_nonce_ci_login',
      password: process.env.MYEONGHA_LOCAL_TLS_NONCE_PASSWORD,
    });
    const badNonce = new Pool({
      ...nonceOptions, user: subjectLogin,
      password: process.env.MYEONGHA_LOCAL_TLS_SUBJECT_PASSWORD,
      max: 1,
    });
    try { await expect(badNonce.query('select 1')).rejects.toThrow(); }
    finally { await badNonce.end(); }
    await expect(subjectPg!.query('select birth_date from public.birth_profile_revisions'))
      .rejects.toThrow();
    await expect(subjectPg!.query('select replay_key_digest from public.saju_source_proof_nonce_claims'))
      .rejects.toThrow();
    const connection = await subjectPg!.connect();
    try {
      await connection.query('BEGIN');
      await expect(connection.query('SET LOCAL ROLE myeongha_saju_proof_nonce_runtime'))
        .rejects.toThrow();
      await connection.query('ROLLBACK');
    } finally { connection.release(); }
  });

  it('isolates two Member identities across repeated checkout of one TLS session', async () => {
    const first = await readBoundCurrentBirthContextV1({
      pool: subject!, verifiedEvidence: { kind: 'member', verifiedAuthUserId: owner },
    });
    expect(first.resolvedSubject.subjectId).toBe(subjectId);
    expect(first.profile?.currentRevision.revisionId).toBe(revision);
    await expect(readBoundCurrentBirthContextV1({
      pool: subject!, verifiedEvidence: { kind: 'member', verifiedAuthUserId: other },
    })).rejects.toMatchObject({ name: 'ApiCommandError', code: 'NOT_FOUND' });
    const again = await readBoundCurrentBirthContextV1({
      pool: subject!, verifiedEvidence: { kind: 'member', verifiedAuthUserId: owner },
    });
    expect(again.profile?.currentRevision.revisionId).toBe(revision);
    const recycled = await subjectPg!.query<{ principal: string; session: string }>(
      'select current_user::text as principal, session_user::text as session',
    );
    expect(recycled.rows[0]).toMatchObject({
      principal: subjectLogin, session: subjectLogin,
    });
  });

  it('keeps real Subject TLS -> Saju HTTP/HMAC -> separate Nonce TLS claim HELD', async () => {
    const issued = createSajuHeldSourceProofHttpIssuePortV1({
      serviceOrigin: sourceOrigin,
      serviceBearer: process.env.MYEONGHA_LOCAL_SAJU_BEARER!,
      fetchImpl: sajuFetch,
    });
    const observed = vi.fn(issued.issuePreviewProof.bind(issued));
    const result = await bindCurrentSubjectSajuHeldProofV1({
      verifiedEvidence: { kind: 'member', verifiedAuthUserId: owner },
      pool: subject!,
      issuePort: { issuePreviewProof: observed },
      verifierTrust: {
        trustedIssuer: process.env.MYEONGHA_LOCAL_SAJU_ISSUER!,
        expectedAudience: process.env.MYEONGHA_LOCAL_SAJU_AUDIENCE!,
        trustedKeyId: process.env.MYEONGHA_LOCAL_SAJU_KEY_ID!,
        keyBytes: Buffer.from(process.env.MYEONGHA_LOCAL_SAJU_HMAC_KEY!, 'base64'),
        claimNonceOnce: createSajuSourceProofPostgresNonceClaimV1({
          pool: dbPort(noncePg!),
        }),
      },
    });
    expect(observed).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      state: 'held', reason: 'source_transport_integrity_verified_only',
      sourceAuthority: 'NOT_EVALUATED', releaseAuthorization: 'NOT_EVALUATED',
      canExecute: false, canPublish: false, canSell: false,
      binding: { subjectId, birthRevisionId: revision },
    });
    expect(JSON.stringify(result)).not.toContain(owner);
    expect(JSON.stringify(result)).not.toContain('2024-03-10');
  });
});
