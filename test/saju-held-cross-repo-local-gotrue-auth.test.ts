import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Pool, type PoolConfig } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { bindAuthenticatedMemberSajuHeldProofV1 } from '../apps/api/src/saju-held-authenticated-member-proof-v1.js';
import { createProductionRequestIdentityVerifierV1 } from '../apps/api/src/production-request-identity-verifier.js';
import {
  MYEONGHA_PRODUCTION_SUPABASE_ORIGIN,
  type ProductionUserDataRuntimeConfigV1,
} from '../apps/api/src/production-user-data-runtime-config.js';
import {
  createSajuHeldSourceProofHttpIssuePortV1,
  SAJU_HELD_SOURCE_PROOF_HTTP_PATH_V1,
  type SajuHeldSourceProofHttpFetchV1,
} from '../apps/api/src/saju-held-source-proof-http-client-v1.js';
import { createSajuSourceProofPostgresNonceClaimV1 } from '../apps/api/src/saju-source-proof-nonce-postgres-claim-v1.js';
import type { SupabaseMemberVerifierFetchV1 } from '../apps/api/src/supabase-member-identity-verifier.js';
import type { PostgresQueryResultV1, PostgresSubjectPoolV1 } from '../apps/api/src/postgres-subject-execution.js';

const enabled = process.env.MYEONGHA_LOCAL_GOTRUE_AUTH_DB === '1';
const AUTH = 'http://127.0.0.1:9999';
const SAJU_ORIGIN = 'https://saju-proof-local-test.invalid';
const SUBJECT_OWNER = '8c320001-0000-4000-8000-000000000001';
const SUBJECT_OTHER = '8c320002-0000-4000-8000-000000000002';
const BIRTH_PROFILE = '8c330001-0000-4000-8000-000000000001';
const REVISION_1 = '8c340001-0000-4000-8000-000000000001';
const PORT = Number(process.env.MYEONGHA_LOCAL_SAJU_PORT);
const API_KEY = 'sb_publishable_local_gotrue_auth_only';
const userDataConfig: ProductionUserDataRuntimeConfigV1 = {
  databaseUrl: 'postgresql://disposable:never-used@127.0.0.1:5432/not-used',
  databasePrincipal: 'disposable',
  databaseExecutionRole: 'myeongha_api_executor',
  supabaseOrigin: MYEONGHA_PRODUCTION_SUPABASE_ORIGIN,
  supabaseApiKey: API_KEY,
  guestFingerprintSecret: 'disposable-go-true-guest-fingerprint-secret-only',
};
interface CreatedUser {
  readonly id: string;
  readonly accessToken: string;
}
const pgConfig = {
  host: '127.0.0.1',
  port: 5432,
  user: 'postgres',
  database: 'myeongha_saju_local_verify',
  password: process.env.PGPASSWORD,
  max: 3,
  connectionTimeoutMillis: 5000,
};
const isolatedSubjectTls = enabled && process.env.MYEONGHA_LOCAL_TLS_SUBJECT_ENABLED === '1';
const isolatedNonceTls = enabled && process.env.MYEONGHA_LOCAL_TLS_NONCE_ENABLED === '1';
const readCiCa = (file: string | undefined) => file ? readFileSync(file, 'utf8') : '';
const subjectAdminConfig: PoolConfig = isolatedSubjectTls ? {
  host: 'subject.saju-bridge-ci.invalid', port: 5444,
  user: 'postgres', database: 'myeongha_saju_subject_tls_verify',
  password: process.env.MYEONGHA_LOCAL_TLS_SUBJECT_ADMIN_PASSWORD,
  ssl: {
    ca: readCiCa(process.env.MYEONGHA_LOCAL_TLS_SUBJECT_CA_FILE),
    rejectUnauthorized: true,
  },
  max: 3, connectionTimeoutMillis: 5000,
} : pgConfig;
const subjectRuntimeConfig: PoolConfig = {
  ...subjectAdminConfig,
  user: 'myeongha_runtime',
  password: process.env.MYEONGHA_LOCAL_TLS_SUBJECT_PASSWORD,
  max: 1,
};
const nonceRuntimeConfig: PoolConfig = isolatedNonceTls ? {
  host: 'nonce.saju-bridge-ci.invalid', port: 5443,
  user: 'myeongha_tls_nonce_ci_login',
  database: 'myeongha_saju_nonce_tls_verify',
  password: process.env.MYEONGHA_LOCAL_TLS_NONCE_PASSWORD,
  ssl: {
    ca: readCiCa(process.env.MYEONGHA_LOCAL_TLS_NONCE_CA_FILE),
    rejectUnauthorized: true,
  },
  max: 2, connectionTimeoutMillis: 5000,
} : pgConfig;
const ownerPool = enabled ? new Pool(subjectAdminConfig) : undefined;
const subjectRuntimePool = isolatedSubjectTls ? new Pool(subjectRuntimeConfig) : ownerPool;
const noncePool = enabled ? new Pool(nonceRuntimeConfig) : undefined;
let owner: CreatedUser;
let other: CreatedUser;

function guard(): void {
  if (isolatedSubjectTls && (!isolatedNonceTls
    || !process.env.MYEONGHA_LOCAL_TLS_SUBJECT_ADMIN_PASSWORD
    || !process.env.MYEONGHA_LOCAL_TLS_SUBJECT_PASSWORD
    || !process.env.MYEONGHA_LOCAL_TLS_SUBJECT_CA_FILE
    || !process.env.MYEONGHA_LOCAL_TLS_NONCE_PASSWORD
    || !process.env.MYEONGHA_LOCAL_TLS_NONCE_CA_FILE)) {
    throw new Error('GoTrue dual TLS suites require disposable isolated TLS credentials.');
  }
  if (process.env.PGHOST !== '127.0.0.1'
    || process.env.PGPORT !== '5432'
    || process.env.PGDATABASE !== 'myeongha_saju_local_verify'
    || process.env.PGUSER !== 'postgres'
    || !process.env.PGPASSWORD
    || !Number.isSafeInteger(PORT) || PORT < 1 || PORT > 65535
    || !process.env.MYEONGHA_LOCAL_SAJU_BEARER
    || !process.env.MYEONGHA_LOCAL_SAJU_HMAC_KEY
    || !process.env.MYEONGHA_LOCAL_SAJU_ISSUER
    || !process.env.MYEONGHA_LOCAL_SAJU_AUDIENCE
    || !process.env.MYEONGHA_LOCAL_SAJU_KEY_ID) {
    throw new Error('Real local GoTrue integration refuses non-disposable inputs.');
  }
}
function poolPort(pool: Pool): PostgresSubjectPoolV1 {
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
            : error instanceof Error ? error : new Error('GoTrue CI client discard'));
        },
      };
    },
  };
}

async function signup(label: string, spoofSubject: string): Promise<CreatedUser> {
  const email = label + '-' + randomBytes(10).toString('hex') + '@example.invalid';
  const password = 'CI-Aa1-' + randomBytes(20).toString('base64url') + '!';
  const response = await fetch(AUTH + '/signup', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    redirect: 'manual',
    body: JSON.stringify({
      email, password,
      data: { subjectId: spoofSubject, auth_user_id: spoofSubject, is_admin: true },
    }),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error('Local GoTrue signup rejected synthetic account: HTTP ' + response.status);
  }
  const signupResult = await response.json() as {
    access_token?: unknown; user?: { id?: unknown };
  };
  let token = signupResult.access_token;
  if (typeof token !== 'string') {
    const grant = await fetch(AUTH + '/token?grant_type=password', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      redirect: 'manual', body: JSON.stringify({ email, password }),
    });
    if (!grant.ok) {
      await grant.body?.cancel();
      throw new Error('Local GoTrue password grant refused: HTTP ' + grant.status);
    }
    token = (await grant.json() as { access_token?: unknown }).access_token;
  }
  if (typeof token !== 'string'
    || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(token)) {
    throw new Error('GoTrue did not issue a signed Member JWT.');
  }
  const userResponse = await fetch(AUTH + '/user', {
    headers: { authorization: 'Bearer ' + token, apikey: API_KEY },
    redirect: 'manual',
  });
  if (!userResponse.ok) {
    await userResponse.body?.cancel();
    throw new Error('Local GoTrue rejected its own member JWT: HTTP ' + userResponse.status);
  }
  const user = await userResponse.json() as { id?: unknown };
  if (typeof user.id !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/iu.test(user.id)
    || (typeof signupResult.user?.id === 'string' && signupResult.user.id !== user.id)) {
    throw new Error('GoTrue Auth user identity is invalid or mismatched.');
  }
  return { id: user.id, accessToken: token };
}

/** Test-only synthetic provisioning bridge between the two disposable DBs. */
async function mapGoTrueIdentity(user: CreatedUser, subjectId: string): Promise<void> {
  const connection = await ownerPool!.connect();
  try {
    await connection.query('BEGIN');
    await connection.query('insert into auth.users (id) values ($1::uuid)', [user.id]);
    const mapped = await connection.query(
      'update public.subjects set auth_user_id = $1::uuid where id = $2::uuid',
      [user.id, subjectId],
    );
    if (mapped.rowCount !== 1) throw new Error('Expected one temporary Subject mapping.');
    await connection.query('COMMIT');
  } catch (error) {
    await connection.query('ROLLBACK');
    throw error;
  } finally {
    connection.release();
  }
}
const authFetch: SupabaseMemberVerifierFetchV1 = async (upstream, init) => {
  if (String(upstream) !== MYEONGHA_PRODUCTION_SUPABASE_ORIGIN + '/auth/v1/user'
    || init?.method !== 'GET') throw new Error('Unexpected Member Auth destination.');
  // Local GoTrue uses /user directly, unlike Supabase's API gateway /auth/v1/user.
  return fetch(AUTH + '/user', { ...init, redirect: 'manual' });
};
const sajuFetch: SajuHeldSourceProofHttpFetchV1 = (upstream, init) => {
  if (upstream !== SAJU_ORIGIN + SAJU_HELD_SOURCE_PROOF_HTTP_PATH_V1
    || init.method !== 'POST' || init.redirect !== 'manual') {
    throw new Error('Unexpected source-proof HTTP destination.');
  }
  return fetch('http://127.0.0.1:' + PORT + SAJU_HELD_SOURCE_PROOF_HTTP_PATH_V1, init);
};
function request(token?: string): Request {
  return new Request('https://myeongha.invalid/api/internal/held/saju', {
    method: 'POST',
    headers: {
      ...(token === undefined ? {} : { Authorization: 'Bearer ' + token }),
      'X-Client-Subject-Id': SUBJECT_OTHER,
      'X-Client-Birth-Revision-Id': 'forged-by-request',
    },
  });
}
function input(token?: string) {
  return {
    request: request(token),
    identityEvidenceVerifier: createProductionRequestIdentityVerifierV1({
      config: userDataConfig, memberFetchImpl: authFetch,
    }),
    pool: poolPort(subjectRuntimePool!),
    issuePort: createSajuHeldSourceProofHttpIssuePortV1({
      serviceOrigin: SAJU_ORIGIN,
      serviceBearer: process.env.MYEONGHA_LOCAL_SAJU_BEARER!,
      fetchImpl: sajuFetch,
    }),
    verifierTrust: {
      trustedIssuer: process.env.MYEONGHA_LOCAL_SAJU_ISSUER!,
      expectedAudience: process.env.MYEONGHA_LOCAL_SAJU_AUDIENCE!,
      trustedKeyId: process.env.MYEONGHA_LOCAL_SAJU_KEY_ID!,
      keyBytes: Buffer.from(process.env.MYEONGHA_LOCAL_SAJU_HMAC_KEY!, 'base64'),
      claimNonceOnce: createSajuSourceProofPostgresNonceClaimV1({
        pool: poolPort(noncePool!),
      }),
    },
  };
}

describe.skipIf(!enabled)('real local GoTrue /user -> MyeongHa member verifier -> Birth DB -> Saju HTTP proof', () => {
  beforeAll(async () => {
    guard();
    const database = await ownerPool!.query<{ name: string }>(
      'select current_database() as name',
    );
    expect(database.rows[0]?.name).toBe(
      isolatedSubjectTls ? 'myeongha_saju_subject_tls_verify' : 'myeongha_saju_local_verify',
    );
    if (isolatedSubjectTls) {
      const [subjectStatus, nonceStatus] = await Promise.all([
        subjectRuntimePool!.query(`select session_user::text as login,
          current_user::text as principal, ssl.ssl,
          pg_has_role(current_user,'myeongha_api_executor','MEMBER') as can_exec,
          pg_has_role(current_user,'myeongha_saju_proof_nonce_runtime','MEMBER') as can_nonce
          from pg_stat_ssl ssl where ssl.pid=pg_backend_pid()`),
        noncePool!.query(`select session_user::text as login,
          current_user::text as principal, ssl.ssl,
          exists(select 1 from pg_roles where rolname='myeongha_api_executor') as can_exec
          from pg_stat_ssl ssl where ssl.pid=pg_backend_pid()`),
      ]);
      expect(subjectStatus.rows[0]).toMatchObject({
        login: 'myeongha_runtime', principal: 'myeongha_runtime',
        ssl: true, can_exec: true, can_nonce: false,
      });
      expect(nonceStatus.rows[0]).toMatchObject({
        login: 'myeongha_tls_nonce_ci_login', principal: 'myeongha_tls_nonce_ci_login',
        ssl: true, can_exec: false,
      });
    }
    const health = await fetch(AUTH + '/health', { redirect: 'manual' });
    expect(health.ok).toBe(true);
    await health.body?.cancel();
    owner = await signup('owner', SUBJECT_OTHER);
    other = await signup('other', SUBJECT_OWNER);
    expect(owner.id).not.toBe(other.id);
    await mapGoTrueIdentity(owner, SUBJECT_OWNER);
    await mapGoTrueIdentity(other, SUBJECT_OTHER);
  }, 30000);

  afterAll(async () => {
    await Promise.all([ownerPool?.end(), noncePool?.end(),
      isolatedSubjectTls ? subjectRuntimePool?.end() : undefined]);
  });

  it('accepts real GoTrue member JWT through existing verifier, binding owned Birth to Saju Proof', async () => {
    const operation = input(owner.accessToken);
    const issued = vi.fn(operation.issuePort.issuePreviewProof.bind(operation.issuePort));
    const result = await bindAuthenticatedMemberSajuHeldProofV1({
      ...operation, issuePort: { issuePreviewProof: issued },
    });
    expect(issued).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      state: 'held', reason: 'source_transport_integrity_verified_only',
      sourceAuthority: 'NOT_EVALUATED', releaseAuthorization: 'NOT_EVALUATED',
      canExecute: false, canPublish: false, canSell: false,
      binding: {
        subjectId: SUBJECT_OWNER, birthProfileId: BIRTH_PROFILE,
        birthRevisionId: REVISION_1, birthRevisionNo: 1,
      },
    });
    expect(JSON.stringify(result)).not.toContain(owner.id);
    expect(JSON.stringify(result)).not.toContain(owner.accessToken);
    expect(JSON.stringify(result)).not.toContain('2024-03-10');
  });

  it('blocks another real GoTrue member with forged client fields and user_metadata', async () => {
    const operation = input(other.accessToken);
    const issued = vi.fn(operation.issuePort.issuePreviewProof.bind(operation.issuePort));
    const result = await bindAuthenticatedMemberSajuHeldProofV1({
      ...operation, issuePort: { issuePreviewProof: issued },
    });
    expect(result).toMatchObject({
      state: 'blocked', reason: 'birth_profile_unavailable',
      canExecute: false, canPublish: false, canSell: false,
    });
    expect(issued).not.toHaveBeenCalled();
    expect(result).not.toHaveProperty('binding');
  });

  it('rejects tampered GoTrue JWT and missing Auth before contacting Saju', async () => {
    const segments = owner.accessToken.split('.');
    const signature = segments[2]!;
    const wrongSignature = (signature[0] === 'A' ? 'B' : 'A') + signature.slice(1);
    const tampered = segments[0] + '.' + segments[1] + '.' + wrongSignature;
    for (const token of [tampered, undefined]) {
      const operation = input(token);
      const issued = vi.fn(operation.issuePort.issuePreviewProof.bind(operation.issuePort));
      const result = await bindAuthenticatedMemberSajuHeldProofV1({
        ...operation, issuePort: { issuePreviewProof: issued },
      });
      expect(result).toMatchObject({
        state: 'blocked', reason: 'member_auth_required',
        canExecute: false, canPublish: false, canSell: false,
      });
      expect(issued).not.toHaveBeenCalled();
    }
  });
});
