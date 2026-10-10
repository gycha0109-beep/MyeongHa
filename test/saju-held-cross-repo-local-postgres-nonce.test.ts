import { createHash, randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createSajuHeldSourceProofHttpIssuePortV1,
  SAJU_HELD_SOURCE_PROOF_HTTP_PATH_V1,
  SajuHeldSourceProofHttpErrorV1,
  type SajuHeldSourceProofHttpFetchV1,
} from '../apps/api/src/saju-held-source-proof-http-client-v1.js';
import { createSajuSourceProofPostgresNonceClaimV1 } from '../apps/api/src/saju-source-proof-nonce-postgres-claim-v1.js';
import { verifySajuHeldSourceProofV1 } from '../apps/api/src/saju-held-source-proof-verifier-v1.js';

const enabled = process.env.MYEONGHA_LOCAL_SAJU_NONCE_DB === '1';
const port = Number(process.env.MYEONGHA_LOCAL_SAJU_PORT);
const origin = 'https://saju-proof-local-test.invalid';
const route = SAJU_HELD_SOURCE_PROOF_HTTP_PATH_V1;
const endpoint = 'http://127.0.0.1:' + port + route;

const vectors = [
  {
    birth: { calendarType: 'solar' as const, date: '2024-03-10', time: '12:00',
      sex: 'unspecified' as const },
    reading: { text: '전체 사주' },
  },
  {
    birth: { calendarType: 'solar' as const, date: '2001-07-14', time: '15:20',
      sex: 'female' as const },
    reading: { text: '전체 사주' },
  },
  {
    birth: { calendarType: 'solar' as const, date: '1990-04-15', time: '13:20',
      sex: 'male' as const },
    reading: { text: '전체 사주' },
  },
] as const;

type Vector = typeof vectors[number];
type Issued = Readonly<{ envelope: unknown; request: Vector; nonce: string }>;

function requireIsolatedDb(): void {
  if (process.env.PGHOST !== '127.0.0.1'
    || process.env.PGPORT !== '5432'
    || process.env.PGDATABASE !== 'myeongha_saju_local_verify'
    || process.env.PGUSER !== 'postgres'
    || !process.env.PGPASSWORD
    || !Number.isSafeInteger(port) || port < 1 || port > 65535
    || !process.env.MYEONGHA_LOCAL_SAJU_BEARER
    || !process.env.MYEONGHA_LOCAL_SAJU_HMAC_KEY
    || !process.env.MYEONGHA_LOCAL_SAJU_ISSUER
    || !process.env.MYEONGHA_LOCAL_SAJU_AUDIENCE
    || !process.env.MYEONGHA_LOCAL_SAJU_KEY_ID) {
    throw new Error('Local-only isolated source-proof DB or issuer configuration unavailable.');
  }
}

const localFetch: SajuHeldSourceProofHttpFetchV1 = (url, init) => {
  if (url !== origin + route || init.method !== 'POST' || init.redirect !== 'manual') {
    throw new Error('Unsafe source proof HTTP destination.');
  }
  return fetch(endpoint, init);
};

const pgConfig = {
  host: '127.0.0.1',
  port: 5432,
  database: 'myeongha_saju_local_verify',
  user: 'postgres',
  password: process.env.PGPASSWORD,
  max: 2,
  connectionTimeoutMillis: 5000,
};
const primary = enabled ? new Pool(pgConfig) : undefined;
const alternate = enabled ? new Pool(pgConfig) : undefined;
const inspect = enabled ? new Pool(pgConfig) : undefined;

async function issue(): Promise<Issued> {
  const client = createSajuHeldSourceProofHttpIssuePortV1({
    serviceOrigin: origin,
    serviceBearer: process.env.MYEONGHA_LOCAL_SAJU_BEARER!,
    fetchImpl: localFetch,
  });
  for (const request of vectors) {
    const nonce = randomBytes(24).toString('base64url');
    try {
      return {
        request, nonce,
        envelope: await client.issuePreviewProof({ nonce, request: structuredClone(request) }),
      };
    } catch (error) {
      if (!(error instanceof SajuHeldSourceProofHttpErrorV1)
        || error.code !== 'UPSTREAM_REJECTED') throw error;
    }
  }
  throw new Error('Real Saju issuer did not issue any held source proof.');
}

function context(sample: Issued) {
  return {
    expectedNonce: sample.nonce,
    expectedRequestBody: sample.request,
    nowMs: Date.now(),
  };
}

function verifier(pool: Pool) {
  return {
    trustedIssuer: process.env.MYEONGHA_LOCAL_SAJU_ISSUER!,
    expectedAudience: process.env.MYEONGHA_LOCAL_SAJU_AUDIENCE!,
    trustedKeyId: process.env.MYEONGHA_LOCAL_SAJU_KEY_ID!,
    keyBytes: Buffer.from(process.env.MYEONGHA_LOCAL_SAJU_HMAC_KEY!, 'base64'),
    claimNonceOnce: createSajuSourceProofPostgresNonceClaimV1({ pool }),
  };
}

function digest(sample: Issued): string {
  const replayKey = process.env.MYEONGHA_LOCAL_SAJU_ISSUER + ':'
    + process.env.MYEONGHA_LOCAL_SAJU_AUDIENCE + ':' + sample.nonce;
  return createHash('sha256')
    .update('myeongha/saju/source-proof/nonce-replay/v1\0')
    .update(replayKey).digest('hex');
}

describe.skipIf(!enabled)('actual Saju issuer HTTP -> MyeongHa verifier -> PostgreSQL nonce claim', () => {
  beforeAll(async () => {
    requireIsolatedDb();
    const result = await inspect!.query<{ current_database: string; role_present: boolean; rls: boolean }>(
      'select current_database(), '
      + "exists(select 1 from pg_roles where rolname = 'myeongha_saju_proof_nonce_runtime') as role_present, "
      + "(select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.saju_source_proof_nonce_claims'::regclass) as rls",
    );
    expect(result.rows[0]).toMatchObject({
      current_database: 'myeongha_saju_local_verify',
      role_present: true,
      rls: true,
    });
  });

  afterAll(async () => {
    await Promise.all([primary?.end(), alternate?.end(), inspect?.end()]);
  });

  it('persists a true signed HTTP proof once, then rejects replay across fresh PostgreSQL sessions', async () => {
    const sample = await issue();
    const proofContext = context(sample);
    expect(await verifySajuHeldSourceProofV1(sample.envelope, verifier(primary!), proofContext))
      .toMatchObject({
        state: 'held',
        transportIntegrity: 'VERIFIED',
        sourceAuthority: 'NOT_EVALUATED',
        releaseAuthorization: 'NOT_EVALUATED',
        canExecute: false, canPublish: false, canSell: false,
      });
    expect(await verifySajuHeldSourceProofV1(sample.envelope, verifier(alternate!), proofContext))
      .toMatchObject({ state: 'blocked', transportIntegrity: 'NOT_VERIFIED', canSell: false });
    const saved = await inspect!.query<{ replay_key_digest: string; retained_until: Date }>(
      'select replay_key_digest, retained_until from public.saju_source_proof_nonce_claims where replay_key_digest = $1',
      [digest(sample)],
    );
    expect(saved.rows).toHaveLength(1);
    expect(saved.rows[0]?.replay_key_digest).not.toContain(sample.nonce);
    expect(new Date(saved.rows[0]!.retained_until).getTime()).toBeGreaterThan(Date.now());
  });

  it('accepts exactly one of two concurrent PostgreSQL claims for the same signed HTTP proof', async () => {
    const sample = await issue();
    const [first, second] = await Promise.all([
      verifySajuHeldSourceProofV1(sample.envelope, verifier(primary!), context(sample)),
      verifySajuHeldSourceProofV1(sample.envelope, verifier(alternate!), context(sample)),
    ]);
    expect([first.state, second.state].sort()).toEqual(['blocked', 'held']);
    expect(first.canExecute).toBe(false);
    expect(second.canExecute).toBe(false);
    expect(first.canSell).toBe(false);
    expect(second.canSell).toBe(false);
    const saved = await inspect!.query<{ count: string }>(
      'select count(*)::text as count from public.saju_source_proof_nonce_claims where replay_key_digest = $1',
      [digest(sample)],
    );
    expect(saved.rows[0]?.count).toBe('1');
  });

  it('rejects tampered signed HTTP envelope before claim; browser role cannot bypass RLS', async () => {
    const sample = await issue();
    const modified = structuredClone(sample.envelope) as { response: { responseId: string } };
    modified.response.responseId = 'forged-local-response';
    expect(await verifySajuHeldSourceProofV1(modified, verifier(primary!), context(sample)))
      .toMatchObject({ state: 'blocked', canPublish: false });
    const before = await inspect!.query<{ count: string }>(
      'select count(*)::text as count from public.saju_source_proof_nonce_claims where replay_key_digest = $1',
      [digest(sample)],
    );
    expect(before.rows[0]?.count).toBe('0');
    const connection = await inspect!.connect();
    try {
      await connection.query('BEGIN');
      await connection.query('SET LOCAL ROLE authenticated');
      await expect(connection.query(
        'insert into public.saju_source_proof_nonce_claims (replay_key_digest,retained_until) '
        + "values ($1,clock_timestamp()+interval '60 seconds')",
        [digest(sample)],
      )).rejects.toThrow();
    } finally {
      await connection.query('ROLLBACK');
      connection.release();
    }
    expect(await verifySajuHeldSourceProofV1(sample.envelope, verifier(alternate!), context(sample)))
      .toMatchObject({ state: 'held', transportIntegrity: 'VERIFIED', canSell: false });
  });
});
