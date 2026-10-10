import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { Pool } from 'pg';
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
import type { PostgresQueryResultV1, PostgresSubjectPoolV1 } from '../apps/api/src/postgres-subject-execution.js';
import type { SupabaseMemberVerifierFetchV1 } from '../apps/api/src/supabase-member-identity-verifier.js';

const enabled = process.env.MYEONGHA_LOCAL_SAJU_AUTH_DB === '1';
const sajuPort = Number(process.env.MYEONGHA_LOCAL_SAJU_PORT);
const OWNER = '8c310001-0000-4000-8000-000000000001';
const OTHER = '8c310002-0000-4000-8000-000000000002';
const SUBJECT = '8c320001-0000-4000-8000-000000000001';
const PROFILE = '8c330001-0000-4000-8000-000000000001';
const REVISION = '8c340001-0000-4000-8000-000000000001';
const API_KEY = 'sb_publishable_disposable_auth_emulator_only';
const AUTH_ISSUER = 'https://synthetic-auth.test.invalid';
const AUTH_AUDIENCE = 'authenticated';
const GUEST_SECRET = 'disposable-guest-fingerprint-test-secret-material';
const guestBearer = 'myeongha_guest_token_0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const jwtSecret = randomBytes(32);
const revoked = new Set<string>();
const authConfig: ProductionUserDataRuntimeConfigV1 = {
  databaseUrl: 'postgresql://synthetic:unused@127.0.0.1/not-connected',
  databasePrincipal: 'synthetic',
  databaseExecutionRole: 'myeongha_api_executor',
  supabaseOrigin: MYEONGHA_PRODUCTION_SUPABASE_ORIGIN,
  supabaseApiKey: API_KEY,
  guestFingerprintSecret: GUEST_SECRET,
};

const pgConfig = {
  host: '127.0.0.1',
  port: 5432,
  database: 'myeongha_saju_local_verify',
  user: 'postgres',
  password: process.env.PGPASSWORD,
  max: 3,
  connectionTimeoutMillis: 5000,
};
const subjectPool = enabled ? new Pool(pgConfig) : undefined;
const noncePool = enabled ? new Pool(pgConfig) : undefined;
let authServer: Server | undefined;
let authPort = 0;
let authCalls = 0;

type TestJwtClaims = {
  sub: string; iss: string; aud: string;
  iat: number; exp: number; jti: string;
  user_metadata?: Record<string, string>;
};

function signToken(
  sub: string,
  changes: Partial<TestJwtClaims> = {},
  signingKey: Buffer = jwtSecret,
): string {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const claims: TestJwtClaims = {
    sub, iss: AUTH_ISSUER, aud: AUTH_AUDIENCE, iat: now,
    exp: now + 300, jti: randomBytes(12).toString('hex'),
    ...changes,
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signingInput = header + '.' + payload;
  const signature = createHmac('sha256', signingKey).update(signingInput).digest('base64url');
  return signingInput + '.' + signature;
}

function verifySyntheticToken(token: string): TestJwtClaims | null {
  const sections = token.split('.');
  if (sections.length !== 3) return null;
  const [header, payload, signature] = sections;
  if (!header || !payload || !signature) return null;
  try {
    const parsedHeader = JSON.parse(Buffer.from(header, 'base64url').toString()) as { alg?: string };
    if (parsedHeader.alg !== 'HS256') return null;
    const expected = createHmac('sha256', jwtSecret)
      .update(header + '.' + payload).digest();
    const supplied = Buffer.from(signature, 'base64url');
    if (supplied.length !== expected.length || !timingSafeEqual(expected, supplied)) return null;
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString()) as TestJwtClaims;
    const now = Math.floor(Date.now() / 1000);
    if (parsed.iss !== AUTH_ISSUER || parsed.aud !== AUTH_AUDIENCE
      || !Number.isSafeInteger(parsed.exp) || parsed.exp <= now
      || !Number.isSafeInteger(parsed.iat) || parsed.iat > now
      || typeof parsed.sub !== 'string' || typeof parsed.jti !== 'string'
      || revoked.has(parsed.jti)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function checkLocalOnly(): void {
  if (process.env.PGHOST !== '127.0.0.1' || process.env.PGPORT !== '5432'
    || process.env.PGDATABASE !== 'myeongha_saju_local_verify'
    || process.env.PGUSER !== 'postgres' || !process.env.PGPASSWORD
    || !Number.isSafeInteger(sajuPort) || sajuPort < 1 || sajuPort > 65535
    || !process.env.MYEONGHA_LOCAL_SAJU_BEARER
    || !process.env.MYEONGHA_LOCAL_SAJU_ISSUER
    || !process.env.MYEONGHA_LOCAL_SAJU_AUDIENCE
    || !process.env.MYEONGHA_LOCAL_SAJU_KEY_ID
    || !process.env.MYEONGHA_LOCAL_SAJU_HMAC_KEY) {
    throw new Error('Synthetic Auth / current Birth check requires disposable local-only authorities.');
  }
}

function wrapDb(pool: Pool): PostgresSubjectPoolV1 {
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
            : error instanceof Error ? error : new Error('Synthetic Auth postgres discard'));
        },
      };
    },
  };
}

const sajuFetch: SajuHeldSourceProofHttpFetchV1 = (input, init) => {
  if (input !== 'https://saju-proof-local-test.invalid' + SAJU_HELD_SOURCE_PROOF_HTTP_PATH_V1
    || init.method !== 'POST' || init.redirect !== 'manual') {
    throw new Error('Refusing any nonlocal Saju destination.');
  }
  return fetch('http://127.0.0.1:' + sajuPort + SAJU_HELD_SOURCE_PROOF_HTTP_PATH_V1, init);
};

const authFetch: SupabaseMemberVerifierFetchV1 = (input, init) => {
  if (String(input) !== MYEONGHA_PRODUCTION_SUPABASE_ORIGIN + '/auth/v1/user'
    || init?.method !== 'GET') {
    throw new Error('Refusing any unsupported Auth destination.');
  }
  return fetch('http://127.0.0.1:' + authPort + '/auth/v1/user', {
    ...init,
    redirect: 'manual',
  });
};

function request(token?: string, method = 'POST', body?: string): Request {
  return new Request('https://myeongha-test.invalid/api/internal/held/saju', {
    method,
    headers: {
      ...(token === undefined ? {} : { Authorization: 'Bearer ' + token }),
      'X-Client-Subject-Id': SUBJECT,
      'X-Client-Birth-Revision-Id': REVISION,
    },
    ...(body === undefined ? {} : { body }),
  });
}

function compose(token?: string, method?: string, body?: string) {
  return {
    request: request(token, method, body),
    identityEvidenceVerifier: createProductionRequestIdentityVerifierV1({
      config: authConfig,
      memberFetchImpl: authFetch,
    }),
    pool: wrapDb(subjectPool!),
    issuePort: createSajuHeldSourceProofHttpIssuePortV1({
      serviceOrigin: 'https://saju-proof-local-test.invalid',
      serviceBearer: process.env.MYEONGHA_LOCAL_SAJU_BEARER!,
      fetchImpl: sajuFetch,
    }),
    verifierTrust: {
      trustedIssuer: process.env.MYEONGHA_LOCAL_SAJU_ISSUER!,
      expectedAudience: process.env.MYEONGHA_LOCAL_SAJU_AUDIENCE!,
      trustedKeyId: process.env.MYEONGHA_LOCAL_SAJU_KEY_ID!,
      keyBytes: Buffer.from(process.env.MYEONGHA_LOCAL_SAJU_HMAC_KEY!, 'base64'),
      claimNonceOnce: createSajuSourceProofPostgresNonceClaimV1({
        pool: wrapDb(noncePool!),
      }),
    },
  };
}

describe.skipIf(!enabled)('synthetic signed Auth user -> production verifier -> current Birth DB -> real Saju HTTP Proof', () => {
  beforeAll(async () => {
    checkLocalOnly();
    authServer = createServer((req, res) => {
      authCalls += 1;
      if (req.url !== '/auth/v1/user' || req.method !== 'GET'
        || req.headers.apikey !== API_KEY || req.headers.cookie !== undefined
        || req.headers['x-client-subject-id'] !== undefined) {
        res.writeHead(404).end();
        return;
      }
      const raw = req.headers.authorization;
      const token = typeof raw === 'string' && raw.startsWith('Bearer ')
        ? raw.slice('Bearer '.length) : '';
      const claims = verifySyntheticToken(token);
      if (claims === null) {
        res.writeHead(401, { 'cache-control': 'no-store' }).end();
        return;
      }
      res.writeHead(200, {
        'content-type': 'application/json',
        'cache-control': 'no-store',
      }).end(JSON.stringify({
        id: claims.sub,
        user_metadata: { subjectId: 'must-not-be-used', ...claims.user_metadata },
      }));
    });
    await new Promise<void>((resolve, reject) => {
      authServer!.once('error', reject);
      authServer!.listen(0, '127.0.0.1', resolve);
    });
    const bound = authServer!.address();
    if (!bound || typeof bound === 'string') throw new Error('Synthetic Auth loopback failed.');
    authPort = bound.port;
    const db = await subjectPool!.query<{ name: string }>(
      'select current_database() as name',
    );
    expect(db.rows[0]?.name).toBe('myeongha_saju_local_verify');
  });

  afterAll(async () => {
    await Promise.all([
      subjectPool?.end(), noncePool?.end(),
      new Promise<void>(resolve => authServer?.close(() => resolve()) ?? resolve()),
    ]);
  });

  it('accepts an independently signed local Auth token through the existing production member verifier', async () => {
    const token = signToken(OWNER, {
      user_metadata: { subjectId: OTHER, birthRevisionId: 'forged' },
    });
    const input = compose(token);
    const seen = vi.fn(input.issuePort.issuePreviewProof.bind(input.issuePort));
    const result = await bindAuthenticatedMemberSajuHeldProofV1({
      ...input, issuePort: { issuePreviewProof: seen },
    });
    expect(seen).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      state: 'held',
      reason: 'source_transport_integrity_verified_only',
      sourceAuthority: 'NOT_EVALUATED',
      releaseAuthorization: 'NOT_EVALUATED',
      canExecute: false, canPublish: false, canSell: false,
      binding: {
        subjectId: SUBJECT, birthProfileId: PROFILE,
        birthRevisionId: REVISION, birthRevisionNo: 1,
      },
    });
    expect(JSON.stringify(result)).not.toContain(OWNER);
    expect(JSON.stringify(result)).not.toContain('2024-03-10');
    expect(JSON.stringify(result)).not.toContain(token);
  });

  it('refuses unsigned, wrong-key, expired, wrong issuer/audience, and revoked JWTs before any Saju call', async () => {
    const now = Math.floor(Date.now() / 1000);
    const revokedId = randomBytes(12).toString('hex');
    revoked.add(revokedId);
    const invalidTokens = [
      'header.payload.signature',
      signToken(OWNER, {}, randomBytes(32)),
      signToken(OWNER, { exp: now - 10 }),
      signToken(OWNER, { iss: 'https://forged-issuer.invalid' }),
      signToken(OWNER, { aud: 'another-app' }),
      signToken(OWNER, { jti: revokedId }),
    ];
    for (const token of invalidTokens) {
      const input = compose(token);
      const issuePreviewProof = vi.fn(input.issuePort.issuePreviewProof.bind(input.issuePort));
      const before = authCalls;
      const result = await bindAuthenticatedMemberSajuHeldProofV1({
        ...input, issuePort: { issuePreviewProof },
      });
      expect(result).toMatchObject({
        state: 'blocked', reason: 'member_auth_required',
        canExecute: false, canPublish: false, canSell: false,
      });
      expect(result).not.toHaveProperty('binding');
      expect(issuePreviewProof).not.toHaveBeenCalled();
      expect(authCalls).toBe(before + 1);
    }
  });

  it('refuses a genuine other-member Auth token with no owned Birth without contacting Saju', async () => {
    const input = compose(signToken(OTHER));
    const issuePreviewProof = vi.fn(input.issuePort.issuePreviewProof.bind(input.issuePort));
    const result = await bindAuthenticatedMemberSajuHeldProofV1({
      ...input, issuePort: { issuePreviewProof },
    });
    expect(result).toMatchObject({
      state: 'blocked', reason: 'birth_profile_unavailable',
      canExecute: false, canPublish: false, canSell: false,
    });
    expect(issuePreviewProof).not.toHaveBeenCalled();
    expect(result).not.toHaveProperty('binding');
  });

  it('rejects absent credentials, Guest bearer, non-POST method and caller-supplied body', async () => {
    const scenarios = [
      { input: compose(), reason: 'member_auth_required' },
      { input: compose(guestBearer), reason: 'member_credential_not_supported' },
      { input: compose(signToken(OWNER), 'GET'), reason: 'invalid_member_request' },
      { input: compose(signToken(OWNER), 'POST', '{"birthDate":"1990-01-01"}'),
        reason: 'invalid_member_request' },
    ];
    for (const scenario of scenarios) {
      const issuePreviewProof = vi.fn(scenario.input.issuePort.issuePreviewProof.bind(scenario.input.issuePort));
      const result = await bindAuthenticatedMemberSajuHeldProofV1({
        ...scenario.input, issuePort: { issuePreviewProof },
      });
      expect(result).toMatchObject({
        state: 'blocked', reason: scenario.reason,
        canExecute: false, canPublish: false, canSell: false,
      });
      expect(issuePreviewProof).not.toHaveBeenCalled();
    }
  });

  it('fails closed when the real member verifier cannot reach its Auth authority', async () => {
    const input = compose(signToken(OWNER));
    const issuePreviewProof = vi.fn(input.issuePort.issuePreviewProof.bind(input.issuePort));
    const result = await bindAuthenticatedMemberSajuHeldProofV1({
      ...input,
      identityEvidenceVerifier: createProductionRequestIdentityVerifierV1({
        config: authConfig,
        memberFetchImpl: async () => { throw new Error('synthetic Auth unavailable'); },
      }),
      issuePort: { issuePreviewProof },
    });
    expect(result).toMatchObject({
      state: 'blocked', reason: 'member_auth_unavailable',
      canExecute: false, canPublish: false, canSell: false,
    });
    expect(issuePreviewProof).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain('synthetic Auth unavailable');
  });
});
