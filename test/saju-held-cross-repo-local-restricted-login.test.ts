import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createNodePostgresSubjectPoolFromDriverV1,
  type NodePostgresDriverPoolV1,
  NodePostgresSubjectPoolErrorV1,
} from '../apps/api/src/node-postgres-subject-pool.js';
import type { PostgresQueryResultV1, PostgresSubjectPoolV1 } from '../apps/api/src/postgres-subject-execution.js';
import { bindCurrentSubjectSajuHeldProofV1 } from '../apps/api/src/saju-held-source-proof-revision-binding-v1.js';
import { readBoundCurrentBirthContextV1 } from '../apps/api/src/current-subject-saju-calculation-http.js';
import {
  createSajuHeldSourceProofHttpIssuePortV1,
  SAJU_HELD_SOURCE_PROOF_HTTP_PATH_V1,
  type SajuHeldSourceProofHttpFetchV1,
} from '../apps/api/src/saju-held-source-proof-http-client-v1.js';
import { createSajuSourceProofPostgresNonceClaimV1 } from '../apps/api/src/saju-source-proof-nonce-postgres-claim-v1.js';
import { verifySajuHeldSourceProofV1 } from '../apps/api/src/saju-held-source-proof-verifier-v1.js';

const enabled = process.env.MYEONGHA_LOCAL_RESTRICTED_DB === '1';
const sajuPort = Number(process.env.MYEONGHA_LOCAL_SAJU_PORT);
const dbHost = '127.0.0.1';
const dbName = 'myeongha_saju_local_verify';
const loginSubject = 'myeongha_runtime';
const loginNonce = 'myeongha_saju_nonce_ci_login';
const authOwner = '8c310001-0000-4000-8000-000000000001';
const authOther = '8c310002-0000-4000-8000-000000000002';
const subjectOwner = '8c320001-0000-4000-8000-000000000001';
const revision = '8c340001-0000-4000-8000-000000000001';
const origin = 'https://saju-proof-local-test.invalid';
const path = SAJU_HELD_SOURCE_PROOF_HTTP_PATH_V1;
const subjectPassword = process.env.MYEONGHA_LOCAL_SUBJECT_DB_PASSWORD;
const noncePassword = process.env.MYEONGHA_LOCAL_NONCE_DB_PASSWORD;
const makePgConfig = (user: string, password?: string) => ({
  host: dbHost, port: 5432, database: dbName, user, password,
  max: 2, connectionTimeoutMillis: 5000, idleTimeoutMillis: 1000,
});
const subjectPg = enabled ? new Pool(makePgConfig(loginSubject, subjectPassword)) : undefined;
const noncePg = enabled ? new Pool(makePgConfig(loginNonce, noncePassword)) : undefined;
const noncePgOther = enabled ? new Pool(makePgConfig(loginNonce, noncePassword)) : undefined;

function ensureDisposable() {
  if (process.env.PGHOST !== dbHost || process.env.PGPORT !== '5432'
    || process.env.PGDATABASE !== dbName
    || !subjectPassword || !noncePassword || subjectPassword === noncePassword
    || !Number.isSafeInteger(sajuPort) || sajuPort < 1 || sajuPort > 65535
    || !process.env.MYEONGHA_LOCAL_SAJU_BEARER
    || !process.env.MYEONGHA_LOCAL_SAJU_ISSUER
    || !process.env.MYEONGHA_LOCAL_SAJU_AUDIENCE
    || !process.env.MYEONGHA_LOCAL_SAJU_KEY_ID
    || !process.env.MYEONGHA_LOCAL_SAJU_HMAC_KEY) {
    throw new Error('Restricted PostgreSQL verification requires independent local-only credentials.');
  }
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
          client.release(error === undefined
            ? undefined
            : error instanceof Error ? error : new Error('Discard restricted PostgreSQL connection'));
        },
      };
    },
  };
}

const subject = enabled
  ? createNodePostgresSubjectPoolFromDriverV1({
    driverPool: driver(subjectPg!),
    expectedLoginPrincipal: loginSubject,
  })
  : undefined;

const fetchSaju: SajuHeldSourceProofHttpFetchV1 = (url, init) => {
  if (url !== origin + path || init.method !== 'POST'
    || init.redirect !== 'manual') throw new Error('Unexpected outbound Saju source route');
  return fetch('http://127.0.0.1:' + sajuPort + path, init);
};
function issuePort() {
  return createSajuHeldSourceProofHttpIssuePortV1({
    serviceOrigin: origin,
    serviceBearer: process.env.MYEONGHA_LOCAL_SAJU_BEARER!,
    fetchImpl: fetchSaju,
  });
}
function trust(pool = noncePg!) {
  return {
    trustedIssuer: process.env.MYEONGHA_LOCAL_SAJU_ISSUER!,
    expectedAudience: process.env.MYEONGHA_LOCAL_SAJU_AUDIENCE!,
    trustedKeyId: process.env.MYEONGHA_LOCAL_SAJU_KEY_ID!,
    keyBytes: Buffer.from(process.env.MYEONGHA_LOCAL_SAJU_HMAC_KEY!, 'base64'),
    claimNonceOnce: createSajuSourceProofPostgresNonceClaimV1({ pool: port(pool) }),
  };
}

describe.skipIf(!enabled)('real restricted PostgreSQL network logins in Saju held source proof', () => {
  beforeAll(async () => {
    ensureDisposable();
    const statusQuery = [
      'select current_user::text as principal, session_user::text as session,',
      'current_database()::text as db,',
      '(select rolsuper from pg_roles where rolname=current_user) as is_super,',
      "pg_has_role(current_user, 'myeongha_api_executor', 'MEMBER') as can_exec,",
      "pg_has_role(current_user, 'myeongha_saju_proof_nonce_runtime', 'MEMBER') as can_nonce",
    ].join(' ');
    const [subjectStatus, nonceStatus] = await Promise.all([
      subjectPg!.query(statusQuery),
      noncePg!.query(statusQuery),
    ]);
    expect(subjectStatus.rows[0]).toMatchObject({
      principal: loginSubject, session: loginSubject, db: dbName,
      is_super: false, can_exec: true, can_nonce: false,
    });
    expect(nonceStatus.rows[0]).toMatchObject({
      principal: loginNonce, session: loginNonce, db: dbName,
      is_super: false, can_exec: false, can_nonce: true,
    });
  });

  afterAll(async () => {
    await Promise.all([subjectPg?.end(), noncePg?.end(), noncePgOther?.end()]);
  });

  it('allows only correct execution roles; login cannot inherit either table privilege', async () => {
    await expect(subjectPg!.query(
      'select replay_key_digest from public.saju_source_proof_nonce_claims',
    )).rejects.toThrow();
    await expect(noncePg!.query(
      'select birth_date from public.birth_profile_revisions limit 1',
    )).rejects.toThrow();
    await expect(subjectPg!.query(
      'select birth_date from public.birth_profile_revisions limit 1',
    )).rejects.toThrow();
    const subjectClient = await subjectPg!.connect();
    try {
      await subjectClient.query('BEGIN');
      await expect(subjectClient.query('SET LOCAL ROLE myeongha_saju_proof_nonce_runtime'))
        .rejects.toThrow();
      await subjectClient.query('ROLLBACK');
    } finally {
      subjectClient.release();
    }
    const nonceClient = await noncePg!.connect();
    try {
      await nonceClient.query('BEGIN');
      await expect(nonceClient.query('SET LOCAL ROLE myeongha_api_executor'))
        .rejects.toThrow();
      await nonceClient.query('ROLLBACK');
    } finally {
      nonceClient.release();
    }
  });

  it('reads real owner Birth under restricted login; other Member cannot inherit current Birth', async () => {
    const owner = await readBoundCurrentBirthContextV1({
      pool: subject!,
      verifiedEvidence: { kind: 'member', verifiedAuthUserId: authOwner },
    });
    expect(owner.resolvedSubject.subjectId).toBe(subjectOwner);
    expect(owner.profile?.currentRevision.revisionId).toBe(revision);
    const other = await readBoundCurrentBirthContextV1({
      pool: subject!,
      verifiedEvidence: { kind: 'member', verifiedAuthUserId: authOther },
    });
    expect(other.resolvedSubject.subjectId).not.toBe(subjectOwner);
    expect(other.profile).toBeNull();
  });

  it('real restricted Subject read -> real Saju HTTP -> restricted Nonce claim remains HELD', async () => {
    const issue = issuePort();
    const observed = vi.fn(issue.issuePreviewProof.bind(issue));
    const result = await bindCurrentSubjectSajuHeldProofV1({
      verifiedEvidence: { kind: 'member', verifiedAuthUserId: authOwner },
      pool: subject!,
      issuePort: { issuePreviewProof: observed },
      verifierTrust: trust(),
    });
    expect(observed).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      state: 'held',
      reason: 'source_transport_integrity_verified_only',
      sourceAuthority: 'NOT_EVALUATED', releaseAuthorization: 'NOT_EVALUATED',
      canExecute: false, canPublish: false, canSell: false,
      binding: { subjectId: subjectOwner, birthRevisionId: revision },
    });
    expect(JSON.stringify(result)).not.toContain(authOwner);
    expect(JSON.stringify(result)).not.toContain('2024-03-10');
  });

  it('restricted independent Nonce logins consume exactly once across distinct pools', async () => {
    const request = {
      birth: { calendarType: 'solar' as const, date: '2024-03-10',
        time: '12:00', sex: 'unspecified' as const },
      reading: { text: '전체 사주' },
    };
    const nonce = randomBytes(24).toString('base64url');
    const envelope = await issuePort().issuePreviewProof({ nonce, request });
    const context = { expectedNonce: nonce, expectedRequestBody: request, nowMs: Date.now() };
    const [first, second] = await Promise.all([
      verifySajuHeldSourceProofV1(envelope, trust(noncePg!), context),
      verifySajuHeldSourceProofV1(envelope, trust(noncePgOther!), context),
    ]);
    expect([first.state, second.state].sort()).toEqual(['blocked', 'held']);
    expect(first.canSell).toBe(false);
    expect(second.canSell).toBe(false);
  });

  it('rejects a misconfigured Subject pool principal before canonical Subject query', async () => {
    const bad = createNodePostgresSubjectPoolFromDriverV1({
      driverPool: driver(subjectPg!),
      expectedLoginPrincipal: loginNonce,
    });
    await expect(bad.connect()).rejects.toMatchObject({
      name: NodePostgresSubjectPoolErrorV1.name,
      code: 'PRINCIPAL_MISMATCH',
    });
  });
});
