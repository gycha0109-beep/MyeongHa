import { X509Certificate, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Pool, type PoolConfig } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createNodePostgresSubjectPoolFromDriverV1,
  type NodePostgresDriverPoolV1,
} from '../apps/api/src/node-postgres-subject-pool.js';
import type { PostgresQueryResultV1, PostgresSubjectPoolV1 } from '../apps/api/src/postgres-subject-execution.js';
import { bindCurrentSubjectSajuHeldProofV1 } from '../apps/api/src/saju-held-source-proof-revision-binding-v1.js';
import {
  createSajuHeldSourceProofHttpIssuePortV1,
  SAJU_HELD_SOURCE_PROOF_HTTP_PATH_V1,
  type SajuHeldSourceProofHttpFetchV1,
} from '../apps/api/src/saju-held-source-proof-http-client-v1.js';
import { createSajuSourceProofPostgresNonceClaimV1 } from '../apps/api/src/saju-source-proof-nonce-postgres-claim-v1.js';
import { verifySajuHeldSourceProofV1 } from '../apps/api/src/saju-held-source-proof-verifier-v1.js';

const enabled = process.env.MYEONGHA_LOCAL_TLS_NONCE_ENABLED === '1';
const host = 'nonce.saju-bridge-ci.invalid';
const wrongHost = 'other.saju-bridge-ci.invalid';
const nonceLogin = 'myeongha_tls_nonce_ci_login';
const subjectLogin = 'myeongha_runtime';
const nonceDb = 'myeongha_saju_nonce_tls_verify';
const subjectDb = 'myeongha_saju_local_verify';
const noncePort = 5443;
const owner = '8c310001-0000-4000-8000-000000000001';
const ownedSubject = '8c320001-0000-4000-8000-000000000001';
const birthRevision = '8c340001-0000-4000-8000-000000000001';
const sajuPort = Number(process.env.MYEONGHA_LOCAL_SAJU_PORT);
const sajuOrigin = 'https://saju-proof-local-test.invalid';
const route = SAJU_HELD_SOURCE_PROOF_HTTP_PATH_V1;

function safeInput() {
  if (process.env.PGHOST !== '127.0.0.1'
    || process.env.PGPORT !== '5432'
    || process.env.PGDATABASE !== subjectDb
    || !process.env.MYEONGHA_LOCAL_SUBJECT_DB_PASSWORD
    || !process.env.MYEONGHA_LOCAL_TLS_NONCE_PASSWORD
    || !process.env.MYEONGHA_LOCAL_TLS_NONCE_CA_FILE
    || !process.env.MYEONGHA_LOCAL_TLS_NONCE_WRONG_CA_FILE
    || !process.env.MYEONGHA_LOCAL_TLS_NONCE_CA_FINGERPRINT
    || !Number.isSafeInteger(sajuPort) || sajuPort < 1 || sajuPort > 65535
    || !process.env.MYEONGHA_LOCAL_SAJU_BEARER
    || !process.env.MYEONGHA_LOCAL_SAJU_HMAC_KEY
    || !process.env.MYEONGHA_LOCAL_SAJU_ISSUER
    || !process.env.MYEONGHA_LOCAL_SAJU_AUDIENCE
    || !process.env.MYEONGHA_LOCAL_SAJU_KEY_ID) {
    throw new Error('Independent TLS Nonce experiment requires disposable certificates and restricted logins.');
  }
}

const ca = enabled && process.env.MYEONGHA_LOCAL_TLS_NONCE_CA_FILE
  ? readFileSync(process.env.MYEONGHA_LOCAL_TLS_NONCE_CA_FILE, 'utf8') : '';
const wrongCa = enabled && process.env.MYEONGHA_LOCAL_TLS_NONCE_WRONG_CA_FILE
  ? readFileSync(process.env.MYEONGHA_LOCAL_TLS_NONCE_WRONG_CA_FILE, 'utf8') : '';
const nonceOptions: PoolConfig = {
  host, port: noncePort, database: nonceDb, user: nonceLogin,
  password: process.env.MYEONGHA_LOCAL_TLS_NONCE_PASSWORD,
  ssl: { ca, rejectUnauthorized: true },
  max: 2, connectionTimeoutMillis: 4000, idleTimeoutMillis: 1000,
};
const tlsNonce = enabled ? new Pool(nonceOptions) : undefined;
const tlsNonceOther = enabled ? new Pool(nonceOptions) : undefined;
const subjectPg = enabled ? new Pool({
  host: '127.0.0.1', port: 5432, database: subjectDb, user: subjectLogin,
  password: process.env.MYEONGHA_LOCAL_SUBJECT_DB_PASSWORD,
  max: 2, connectionTimeoutMillis: 4000,
}) : undefined;

function asDriver(pool: Pool): NodePostgresDriverPoolV1 {
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
const subject = enabled
  ? createNodePostgresSubjectPoolFromDriverV1({
    driverPool: asDriver(subjectPg!),
    expectedLoginPrincipal: subjectLogin,
  })
  : undefined;
function pgPort(pool: Pool): PostgresSubjectPoolV1 {
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
            : error instanceof Error ? error : new Error('Discard local TLS Nonce connection'));
        },
      };
    },
  };
}
function trust(pool = tlsNonce!) {
  return {
    trustedIssuer: process.env.MYEONGHA_LOCAL_SAJU_ISSUER!,
    expectedAudience: process.env.MYEONGHA_LOCAL_SAJU_AUDIENCE!,
    trustedKeyId: process.env.MYEONGHA_LOCAL_SAJU_KEY_ID!,
    keyBytes: Buffer.from(process.env.MYEONGHA_LOCAL_SAJU_HMAC_KEY!, 'base64'),
    claimNonceOnce: createSajuSourceProofPostgresNonceClaimV1({ pool: pgPort(pool) }),
  };
}
const localSajuFetch: SajuHeldSourceProofHttpFetchV1 = (url, init) => {
  if (url !== sajuOrigin + route || init.method !== 'POST' || init.redirect !== 'manual') {
    throw new Error('Invalid Saju TLS experiment destination.');
  }
  return fetch('http://127.0.0.1:' + sajuPort + route, init);
};
function issuer() {
  return createSajuHeldSourceProofHttpIssuePortV1({
    serviceOrigin: sajuOrigin,
    serviceBearer: process.env.MYEONGHA_LOCAL_SAJU_BEARER!,
    fetchImpl: localSajuFetch,
  });
}

async function shouldFail(config: PoolConfig) {
  const client = new Pool({ ...nonceOptions, ...config, max: 1, connectionTimeoutMillis: 2500 });
  try {
    await expect(client.query('select 1')).rejects.toThrow();
  } finally {
    await client.end();
  }
}

describe.skipIf(!enabled)(
  'real verified TLS hostname/CA to physically separate Nonce PostgreSQL with restricted login',
  () => {
    beforeAll(async () => {
      safeInput();
      const fingerprint = new X509Certificate(ca).fingerprint256.replaceAll(':', '').toLowerCase();
      expect(fingerprint).toBe(process.env.MYEONGHA_LOCAL_TLS_NONCE_CA_FINGERPRINT);
      expect(wrongCa).not.toBe(ca);
      const actual = await tlsNonce!.query<{
        database: string; principal: string; session: string;
        ssl: boolean; version: string; can_nonce: boolean; can_subject: boolean;
      }>(
        'select current_database()::text as database, current_user::text as principal, '
        + 'session_user::text as session, ssl.ssl, ssl.version, '
        + "pg_has_role(current_user,'myeongha_saju_proof_nonce_runtime','MEMBER') as can_nonce, "
        + "exists(select 1 from pg_roles where rolname='myeongha_api_executor') as can_subject "
        + 'from pg_stat_ssl ssl where ssl.pid=pg_backend_pid()',
      );
      expect(actual.rows[0]).toMatchObject({
        database: nonceDb, principal: nonceLogin, session: nonceLogin,
        ssl: true, can_nonce: true, can_subject: false,
      });
      expect(actual.rows[0]?.version).toMatch(/^TLSv1\.[23]$/u);
    });

    afterAll(async () => {
      await Promise.all([tlsNonce?.end(), tlsNonceOther?.end(), subjectPg?.end()]);
    });

    it('refuses incorrect CA, incorrect TLS hostname and a plaintext downgrade', async () => {
      await shouldFail({ ssl: { ca: wrongCa, rejectUnauthorized: true } });
      await shouldFail({ host: wrongHost });
      await shouldFail({ host: '127.0.0.1', ssl: false });
    });

    it('restricts network Nonce login to the nonce registry; cannot read Subject/Birth data', async () => {
      await expect(tlsNonce!.query('select replay_key_digest from public.saju_source_proof_nonce_claims'))
        .rejects.toThrow();
      await expect(tlsNonce!.query('select * from public.birth_profiles'))
        .rejects.toThrow();
      const client = await tlsNonce!.connect();
      try {
        await client.query('BEGIN');
        await expect(client.query('SET LOCAL ROLE myeongha_api_executor')).rejects.toThrow();
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
      // A Subject login from an entirely different cluster must not exist here.
      await shouldFail({ user: subjectLogin, password: process.env.MYEONGHA_LOCAL_SUBJECT_DB_PASSWORD });
    });

    it('checks a real signed Saju HTTP proof with restricted Subject and independent TLS Nonce', async () => {
      const issued = issuer();
      const observed = vi.fn(issued.issuePreviewProof.bind(issued));
      const result = await bindCurrentSubjectSajuHeldProofV1({
        verifiedEvidence: { kind: 'member', verifiedAuthUserId: owner },
        pool: subject!,
        issuePort: { issuePreviewProof: observed },
        verifierTrust: trust(),
      });
      expect(observed).toHaveBeenCalledOnce();
      expect(result).toMatchObject({
        state: 'held', reason: 'source_transport_integrity_verified_only',
        sourceAuthority: 'NOT_EVALUATED', releaseAuthorization: 'NOT_EVALUATED',
        canExecute: false, canPublish: false, canSell: false,
        binding: { subjectId: ownedSubject, birthRevisionId: birthRevision },
      });
    });

    it('uses a real PostgreSQL unique-index claim across two TLS connections and blocks replay', async () => {
      const request = {
        birth: { calendarType: 'solar' as const, date: '2024-03-10',
          time: '12:00', sex: 'unspecified' as const },
        reading: { text: '전체 사주' },
      };
      const nonce = randomBytes(24).toString('base64url');
      const envelope = await issuer().issuePreviewProof({ nonce, request });
      const context = { expectedNonce: nonce, expectedRequestBody: request, nowMs: Date.now() };
      const [first, second] = await Promise.all([
        verifySajuHeldSourceProofV1(envelope, trust(tlsNonce!), context),
        verifySajuHeldSourceProofV1(envelope, trust(tlsNonceOther!), context),
      ]);
      expect([first.state, second.state].sort()).toEqual(['blocked', 'held']);
      expect(first.canSell).toBe(false);
      expect(second.canSell).toBe(false);
    });
  },
);
