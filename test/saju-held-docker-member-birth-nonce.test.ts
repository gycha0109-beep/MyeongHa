import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { bindAuthenticatedMemberSajuHeldProofV1 } from '../apps/api/src/saju-held-authenticated-member-proof-v1.js';
import { createProductionRequestIdentityVerifierV1 } from '../apps/api/src/production-request-identity-verifier.js';
import {
  MYEONGHA_PRODUCTION_SUPABASE_ORIGIN,
  type ProductionUserDataRuntimeConfigV1,
} from '../apps/api/src/production-user-data-runtime-config.js';
import {
  createSajuHeldSourceProofHttpIssuePortV1, SAJU_HELD_SOURCE_PROOF_HTTP_PATH_V1,
  type SajuHeldSourceProofHttpFetchV1,
} from '../apps/api/src/saju-held-source-proof-http-client-v1.js';
import { createSajuSourceProofPostgresNonceClaimV1 } from '../apps/api/src/saju-source-proof-nonce-postgres-claim-v1.js';
import { verifySajuHeldSourceProofV1 } from '../apps/api/src/saju-held-source-proof-verifier-v1.js';
import { readBoundCurrentBirthContextV1 } from '../apps/api/src/current-subject-saju-calculation-http.js';
import { buildCurrentBirthSourceProofRehearsalRequestV1,
  SAJU_SOURCE_PROOF_GENERAL_NATAL_TEXT_V1,
} from '../apps/api/src/saju-source-proof-request-normalization-v1.js';
import type { SupabaseMemberVerifierFetchV1 } from '../apps/api/src/supabase-member-identity-verifier.js';
import type { PostgresQueryResultV1, PostgresSubjectPoolV1 } from '../apps/api/src/postgres-subject-execution.js';

const enabled = process.env.MYEONGHA_DOCKER_SAJU_BINDING === '1';
const tls = enabled && process.env.MYEONGHA_DOCKER_SAJU_TLS === '1';
const ca = tls ? {
  subject: readFileSync('/certs/subject/ca.crt', 'utf8'),
  nonce: readFileSync('/certs/nonce/ca.crt', 'utf8'),
  admission: readFileSync('/certs/admission/ca.crt', 'utf8'),
} : undefined;
const subjectSsl = ca ? { ssl: { ca: ca.subject, rejectUnauthorized: true } } : {};
const nonceSsl = ca ? { ssl: { ca: ca.nonce, rejectUnauthorized: true } } : {};
const admissionSsl = ca ? { ssl: { ca: ca.admission, rejectUnauthorized: true } } : {};
const AUTH = 'http://gotrue:9999';
const SAJU_ORIGIN = 'https://saju-proof-local-test.invalid';
const SUBJECT_OWNER = '8c320001-0000-4000-8000-000000000001';
const SUBJECT_OTHER = '8c320002-0000-4000-8000-000000000002';
const BIRTH_PROFILE = '8c330001-0000-4000-8000-000000000001';
const REVISION_1 = '8c340001-0000-4000-8000-000000000001';
const port = Number(process.env.SAJU_BRIDGE_DOCKER_SAJU_PORT);
const config: ProductionUserDataRuntimeConfigV1 = {
  databaseUrl: 'postgresql://disposable:never-used@127.0.0.1:5432/not-used',
  databasePrincipal: 'disposable',
  databaseExecutionRole: 'myeongha_api_executor',
  supabaseOrigin: MYEONGHA_PRODUCTION_SUPABASE_ORIGIN,
  supabaseApiKey: 'sb_publishable_local_docker_binding_only',
  guestFingerprintSecret: 'disposable-test-guest-fingerprint-only',
};
const subjectAdmin = enabled ? new Pool({
  host: 'subject-db', port: 5432,
  database: 'myeongha_saju_subject_local_verify',
  user: 'postgres', password: process.env.SAJU_BRIDGE_LOCAL_SUBJECT_DB_PASSWORD,
  ...subjectSsl,
  max: 2, connectionTimeoutMillis: 5000,
}) : undefined;
const subjectRuntime = enabled ? new Pool({
  host: 'subject-db', port: 5432,
  database: 'myeongha_saju_subject_local_verify',
  user: 'myeongha_runtime',
  password: process.env.SAJU_BRIDGE_LOCAL_SUBJECT_LOGIN_PASSWORD,
  ...subjectSsl,
  max: 2, connectionTimeoutMillis: 5000,
}) : undefined;
const nonceConfig = {
  host: 'nonce-db', port: 5432,
  database: 'myeongha_saju_nonce_local_verify',
  user: 'myeongha_docker_nonce_login',
  password: process.env.SAJU_BRIDGE_LOCAL_NONCE_LOGIN_PASSWORD,
  ...nonceSsl,
  max: 2, connectionTimeoutMillis: 5000,
};
const nonceA = enabled ? new Pool(nonceConfig) : undefined;
const nonceB = enabled ? new Pool(nonceConfig) : undefined;
const admission = tls ? new Pool({
  host: 'admission-db', port: 5432,
  database: 'myeongha_saju_admission_local_verify',
  user: 'myeongha_docker_admission_tls_probe',
  password: process.env.SAJU_BRIDGE_LOCAL_ADMISSION_LOGIN_PASSWORD,
  ...admissionSsl,
  max: 1, connectionTimeoutMillis: 5000,
}) : undefined;
interface Member { readonly id: string; readonly token: string }
let owner: Member;
let other: Member;

function guard() {
  if (process.env.MYEONGHA_DOCKER_SAJU_BINDING !== '1'
    || process.env.SAJU_BRIDGE_LOCAL_AUTH_URL !== AUTH
    || process.env.SAJU_BRIDGE_LOCAL_SUBJECT_HOST !== 'subject-db'
    || process.env.SAJU_BRIDGE_LOCAL_NONCE_HOST !== 'nonce-db'
    || process.env.SAJU_BRIDGE_LOCAL_SUBJECT_DB !== 'myeongha_saju_subject_local_verify'
    || process.env.SAJU_BRIDGE_LOCAL_NONCE_DB !== 'myeongha_saju_nonce_local_verify'
    || !Number.isInteger(port) || port < 1 || port > 65535
    || !process.env.SAJU_BRIDGE_DOCKER_SAJU_HMAC_KEY
    || !process.env.SAJU_BRIDGE_DOCKER_SAJU_BEARER
    || !process.env.SAJU_BRIDGE_DOCKER_SAJU_ISSUER
    || !process.env.SAJU_BRIDGE_DOCKER_SAJU_AUDIENCE
    || !process.env.SAJU_BRIDGE_DOCKER_SAJU_KEY_ID) {
    throw new Error('Binding suite refuses non-disposable network input.');
  }
}
function pgPort(pool: Pool): PostgresSubjectPoolV1 {
  return {
    async connect() {
      const c = await pool.connect();
      return {
        async query<Row = Record<string, unknown>>(sql: string, values?: readonly unknown[]):
          Promise<PostgresQueryResultV1<Row>> {
          const r = await c.query(sql, values === undefined ? [] : [...values]);
          return { rows: r.rows as readonly Row[] };
        },
        release(error?: unknown) {
          c.release(error === undefined ? undefined
            : error instanceof Error ? error : new Error('Dispose binding connection'));
        },
      };
    },
  };
}
async function signup(label: string, forgedSubject: string): Promise<Member> {
  const email = label + '-' + randomBytes(12).toString('hex') + '@example.invalid';
  const credential = 'CI-Aa1-' + randomBytes(18).toString('base64url') + '!';
  const response = await fetch(AUTH + '/signup', {
    method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: credential,
      data: { subjectId: forgedSubject, auth_user_id: forgedSubject, is_admin: true } }),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error('Synthetic GoTrue signup unavailable: ' + response.status);
  }
  const raw = await response.json() as { access_token?: unknown; user?: { id?: unknown } };
  let token = raw.access_token;
  if (typeof token !== 'string') {
    const grant = await fetch(AUTH + '/token?grant_type=password', {
      method: 'POST', redirect: 'manual',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: credential }),
    });
    if (!grant.ok) throw new Error('Synthetic GoTrue token exchange unavailable: ' + grant.status);
    token = (await grant.json() as { access_token?: unknown }).access_token;
  }
  if (typeof token !== 'string' || token.split('.').length !== 3) {
    throw new Error('Actual GoTrue JWT not issued.');
  }
  const userResponse = await fetch(AUTH + '/user', {
    redirect: 'manual', headers: { authorization: 'Bearer ' + token },
  });
  if (!userResponse.ok) throw new Error('Real GoTrue /user refused JWT.');
  const user = await userResponse.json() as { id?: unknown };
  if (typeof user.id !== 'string' || (raw.user?.id && raw.user.id !== user.id)) {
    throw new Error('GoTrue user identity mismatch.');
  }
  return { id: user.id, token };
}
async function mapSyntheticMember(user: Member, subjectId: string) {
  const c = await subjectAdmin!.connect();
  try {
    await c.query('BEGIN');
    await c.query('insert into auth.users (id) values ($1::uuid)', [user.id]);
    const r = await c.query('update public.subjects set auth_user_id=$1::uuid where id=$2::uuid',
      [user.id, subjectId]);
    if (r.rowCount !== 1) throw new Error('Synthetic Subject mapping missing.');
    await c.query('COMMIT');
  } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
}
const authFetch: SupabaseMemberVerifierFetchV1 = async (upstream, init) => {
  if (String(upstream) !== MYEONGHA_PRODUCTION_SUPABASE_ORIGIN + '/auth/v1/user'
    || init?.method !== 'GET') throw new Error('Unexpected member authority endpoint.');
  return fetch(AUTH + '/user', { ...init, redirect: 'manual' });
};
const sajuFetch: SajuHeldSourceProofHttpFetchV1 = (upstream, init) => {
  if (upstream !== SAJU_ORIGIN + SAJU_HELD_SOURCE_PROOF_HTTP_PATH_V1
    || init.method !== 'POST' || init.redirect !== 'manual') {
    throw new Error('Unexpected Saju proof endpoint.');
  }
  return fetch('http://127.0.0.1:' + port + SAJU_HELD_SOURCE_PROOF_HTTP_PATH_V1, init);
};
function issuer() {
  return createSajuHeldSourceProofHttpIssuePortV1({
    serviceOrigin: SAJU_ORIGIN,
    serviceBearer: process.env.SAJU_BRIDGE_DOCKER_SAJU_BEARER!,
    fetchImpl: sajuFetch,
  });
}
function trust(pool: Pool) {
  return {
    trustedIssuer: process.env.SAJU_BRIDGE_DOCKER_SAJU_ISSUER!,
    expectedAudience: process.env.SAJU_BRIDGE_DOCKER_SAJU_AUDIENCE!,
    trustedKeyId: process.env.SAJU_BRIDGE_DOCKER_SAJU_KEY_ID!,
    keyBytes: Buffer.from(process.env.SAJU_BRIDGE_DOCKER_SAJU_HMAC_KEY!, 'base64'),
    claimNonceOnce: createSajuSourceProofPostgresNonceClaimV1({ pool: pgPort(pool) }),
  };
}
function operation(token?: string) {
  const request = new Request('https://myeongha.invalid/api/internal/held/saju', {
    method: 'POST',
    headers: {
      ...(token ? { authorization: 'Bearer ' + token } : {}),
      'X-Client-Subject-Id': SUBJECT_OTHER,
      'X-Client-Birth-Revision-Id': 'forged-by-client',
    },
  });
  return {
    request,
    identityEvidenceVerifier: createProductionRequestIdentityVerifierV1({
      config, memberFetchImpl: authFetch,
    }),
    pool: pgPort(subjectRuntime!),
    issuePort: issuer(),
    verifierTrust: trust(nonceA!),
  };
}
describe.skipIf(!enabled)('Windows-compatible isolated Docker GoTrue→Subject/Birth→Saju→Nonce', () => {
  beforeAll(async () => {
    guard();
    const [subject, nonce] = await Promise.all([
      subjectRuntime!.query<{
        db: string; login: string; can_exec: boolean; can_nonce: boolean;
      }>("select current_database()::text as db, session_user::text as login, "
        + "pg_has_role(current_user,'myeongha_api_executor','MEMBER') as can_exec, "
        + "pg_has_role(current_user,'myeongha_saju_proof_nonce_runtime','MEMBER') as can_nonce"),
      nonceA!.query<{
        db: string; login: string; can_nonce: boolean; can_subject: boolean;
      }>("select current_database()::text as db, session_user::text as login, "
        + "pg_has_role(current_user,'myeongha_saju_proof_nonce_runtime','MEMBER') as can_nonce, "
        + "exists(select 1 from pg_roles where rolname='myeongha_api_executor') as can_subject"),
    ]);
    expect(subject.rows[0]).toMatchObject({
      db: 'myeongha_saju_subject_local_verify', login: 'myeongha_runtime',
      can_exec: true, can_nonce: false,
    });
    expect(nonce.rows[0]).toMatchObject({
      db: 'myeongha_saju_nonce_local_verify', login: 'myeongha_docker_nonce_login',
      can_nonce: true, can_subject: false,
    });
    await expect(nonceA!.query('select * from public.birth_profiles')).rejects.toThrow();
    await expect(nonceA!.query('select retained_until from public.saju_source_proof_nonce_claims'))
      .rejects.toThrow();
    const health = await fetch(AUTH + '/health');
    expect(health.ok).toBe(true);
    await health.body?.cancel();
    owner = await signup('owner', SUBJECT_OTHER);
    other = await signup('other', SUBJECT_OWNER);
    await mapSyntheticMember(owner, SUBJECT_OWNER);
    await mapSyntheticMember(other, SUBJECT_OTHER);
  }, 60_000);
  afterAll(async () => {
    await Promise.all([subjectAdmin?.end(), subjectRuntime?.end(),
      nonceA?.end(), nonceB?.end(), admission?.end()]);
  });
  it.skipIf(!tls)('uses three independent verify-full TLS CAs and rejects foreign CA and plaintext', async () => {
    expect(ca).toBeDefined();
    expect(new Set([ca!.subject, ca!.nonce, ca!.admission]).size).toBe(3);
    const dbPools = [subjectRuntime!, nonceA!, admission!];
    for (const pool of dbPools) {
      const result = await pool.query<{ ssl: boolean; version: string; db: string }>(
        "select ssl.ssl, ssl.version, current_database()::text as db from pg_stat_ssl ssl where ssl.pid=pg_backend_pid()",
      );
      expect(result.rows[0]?.ssl).toBe(true);
      expect(result.rows[0]?.version).toMatch(/^TLSv1\.[23]$/u);
    }
    expect((await admission!.query("select session_user::text as login")).rows[0])
      .toMatchObject({ login: 'myeongha_docker_admission_tls_probe' });
    await expect(admission!.query('select * from public.saju_source_proof_nonce_claims'))
      .rejects.toThrow();
    for (const [badHost, badDb, badLogin, credential, foreignCa] of [
      ['subject-db', 'myeongha_saju_subject_local_verify', 'myeongha_runtime',
        process.env.SAJU_BRIDGE_LOCAL_SUBJECT_LOGIN_PASSWORD!, ca!.nonce],
      ['nonce-db', 'myeongha_saju_nonce_local_verify', 'myeongha_docker_nonce_login',
        process.env.SAJU_BRIDGE_LOCAL_NONCE_LOGIN_PASSWORD!, ca!.admission],
      ['admission-db', 'myeongha_saju_admission_local_verify', 'myeongha_docker_admission_tls_probe',
        process.env.SAJU_BRIDGE_LOCAL_ADMISSION_LOGIN_PASSWORD!, ca!.subject],
    ] as const) {
      const foreign = new Pool({
        host: badHost, database: badDb, user: badLogin,
        password: credential, port: 5432, connectionTimeoutMillis: 4000,
        ssl: { ca: foreignCa, rejectUnauthorized: true },
      });
      try {
        await expect(foreign.query('select 1')).rejects.toThrow();
      } finally {
        await foreign.end();
      }
      const plaintext = new Pool({
        host: badHost, database: badDb, user: badLogin,
        password: credential, port: 5432, connectionTimeoutMillis: 4000,
        ssl: false,
      });
      try {
        await expect(plaintext.query('select 1')).rejects.toThrow();
      } finally {
        await plaintext.end();
      }
    }
  });
  it('binds real JWT to owned current Birth, real signed Saju HTTP, and separate nonce atomic claim', async () => {
    const input = operation(owner.token);
    const issued = vi.fn(input.issuePort.issuePreviewProof.bind(input.issuePort));
    const result = await bindAuthenticatedMemberSajuHeldProofV1({
      ...input, issuePort: { issuePreviewProof: issued },
    });
    expect(issued).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      state: 'held', reason: 'source_transport_integrity_verified_only',
      sourceAuthority: 'NOT_EVALUATED', releaseAuthorization: 'NOT_EVALUATED',
      canExecute: false, canPublish: false, canSell: false,
      binding: { subjectId: SUBJECT_OWNER, birthProfileId: BIRTH_PROFILE,
        birthRevisionId: REVISION_1, birthRevisionNo: 1 },
    });
    expect(JSON.stringify(result)).not.toContain(owner.id);
    expect(JSON.stringify(result)).not.toContain(owner.token);
  });
  it('refuses another signed member with forged Subject and user_metadata before Saju', async () => {
    const input = operation(other.token);
    const issued = vi.fn(input.issuePort.issuePreviewProof.bind(input.issuePort));
    const result = await bindAuthenticatedMemberSajuHeldProofV1({
      ...input, issuePort: { issuePreviewProof: issued },
    });
    expect(result).toMatchObject({
      state: 'blocked', reason: 'birth_profile_unavailable',
      canExecute: false, canPublish: false, canSell: false,
    });
    expect(issued).not.toHaveBeenCalled();
  });
  it('refuses malformed or missing member JWT without calling Saju', async () => {
    const fragments = owner.token.split('.');
    const altered = fragments.slice(0, 2).concat([
      (fragments[2]![0] === 'A' ? 'B' : 'A') + fragments[2]!.slice(1),
    ]).join('.');
    for (const token of [altered, undefined]) {
      const input = operation(token);
      const issued = vi.fn(input.issuePort.issuePreviewProof.bind(input.issuePort));
      const result = await bindAuthenticatedMemberSajuHeldProofV1({
        ...input, issuePort: { issuePreviewProof: issued },
      });
      expect(result).toMatchObject({
        state: 'blocked', reason: 'member_auth_required',
        canExecute: false, canPublish: false, canSell: false,
      });
      expect(issued).not.toHaveBeenCalled();
    }
  });
  it('allows exactly one of concurrent signed proof claims in separate Nonce PG sessions', async () => {
    const read = await readBoundCurrentBirthContextV1({
      pool: pgPort(subjectRuntime!),
      verifiedEvidence: { kind: 'member', verifiedAuthUserId: owner.id },
    });
    const payload = buildCurrentBirthSourceProofRehearsalRequestV1(
      read.profile, SAJU_SOURCE_PROOF_GENERAL_NATAL_TEXT_V1,
    );
    const nonce = randomBytes(32).toString('base64url');
    const envelope = await issuer().issuePreviewProof({
      nonce, request: structuredClone(payload),
    });
    const context = { expectedNonce: nonce, expectedRequestBody: payload, nowMs: Date.now() };
    const [first, second] = await Promise.all([
      verifySajuHeldSourceProofV1(envelope, trust(nonceA!), context),
      verifySajuHeldSourceProofV1(envelope, trust(nonceB!), context),
    ]);
    expect([first.state, second.state].sort()).toEqual(['blocked', 'held']);
    expect(first.canExecute).toBe(false);
    expect(second.canExecute).toBe(false);
    expect(first.canSell).toBe(false);
    expect(second.canSell).toBe(false);
  });
});
