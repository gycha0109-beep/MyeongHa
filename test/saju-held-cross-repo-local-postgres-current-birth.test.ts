import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { bindCurrentSubjectSajuHeldProofV1 } from '../apps/api/src/saju-held-source-proof-revision-binding-v1.js';
import { readBoundCurrentBirthContextV1 } from '../apps/api/src/current-subject-saju-calculation-http.js';
import {
  createSajuHeldSourceProofHttpIssuePortV1,
  SAJU_HELD_SOURCE_PROOF_HTTP_PATH_V1,
  type SajuHeldSourceProofHttpFetchV1,
} from '../apps/api/src/saju-held-source-proof-http-client-v1.js';
import { createSajuSourceProofPostgresNonceClaimV1 } from '../apps/api/src/saju-source-proof-nonce-postgres-claim-v1.js';
import type { PostgresQueryResultV1, PostgresSubjectPoolV1 } from '../apps/api/src/postgres-subject-execution.js';
import type { VerifiedSubjectIdentityEvidenceV1 } from '../apps/api/src/subject-identity-resolver.js';

const enabled = process.env.MYEONGHA_LOCAL_SAJU_BIRTH_DB === '1';
const port = Number(process.env.MYEONGHA_LOCAL_SAJU_PORT);
const AUTH_OWNER = '8c310001-0000-4000-8000-000000000001';
const AUTH_OTHER = '8c310002-0000-4000-8000-000000000002';
const SUBJECT_OWNER = '8c320001-0000-4000-8000-000000000001';
const PROFILE_OWNER = '8c330001-0000-4000-8000-000000000001';
const REVISION_1 = '8c340001-0000-4000-8000-000000000001';
const REVISION_2 = '8c340002-0000-4000-8000-000000000002';
const origin = 'https://saju-proof-local-test.invalid';
const route = SAJU_HELD_SOURCE_PROOF_HTTP_PATH_V1;
const target = 'http://127.0.0.1:' + port + route;
const owner: VerifiedSubjectIdentityEvidenceV1 = { kind: 'member', verifiedAuthUserId: AUTH_OWNER };
const other: VerifiedSubjectIdentityEvidenceV1 = { kind: 'member', verifiedAuthUserId: AUTH_OTHER };

const config = {
  host: '127.0.0.1',
  port: 5432,
  database: 'myeongha_saju_local_verify',
  user: 'postgres',
  password: process.env.PGPASSWORD,
  max: 4,
  connectionTimeoutMillis: 5000,
};
const subjectDb = enabled ? new Pool(config) : undefined;
const nonceDb = enabled ? new Pool(config) : undefined;
const adminDb = enabled ? new Pool(config) : undefined;

function requireIsolatedInputs() {
  if (!Number.isInteger(port) || port <= 0 || port > 65535
    || process.env.PGHOST !== '127.0.0.1' || process.env.PGPORT !== '5432'
    || process.env.PGDATABASE !== 'myeongha_saju_local_verify'
    || process.env.PGUSER !== 'postgres' || !process.env.PGPASSWORD
    || !process.env.MYEONGHA_LOCAL_SAJU_BEARER
    || !process.env.MYEONGHA_LOCAL_SAJU_HMAC_KEY
    || !process.env.MYEONGHA_LOCAL_SAJU_ISSUER
    || !process.env.MYEONGHA_LOCAL_SAJU_AUDIENCE
    || !process.env.MYEONGHA_LOCAL_SAJU_KEY_ID) {
    throw new Error('Refusing to use nonlocal or incomplete current Birth Proof test authority.');
  }
}

function adapter(pool: Pool): PostgresSubjectPoolV1 {
  return {
    async connect() {
      const c = await pool.connect();
      return {
        async query<Row = Record<string, unknown>>(
          sql: string, values?: readonly unknown[],
        ): Promise<PostgresQueryResultV1<Row>> {
          const result = values === undefined
            ? await c.query(sql)
            : await c.query(sql, [...values]);
          return { rows: result.rows as readonly Row[] };
        },
        release(error?: unknown) {
          c.release(error === undefined
            ? undefined
            : error instanceof Error ? error : new Error('Synthetic Birth PostgreSQL discard'));
        },
      };
    },
  };
}

const loopbackFetch: SajuHeldSourceProofHttpFetchV1 = async (url, init) => {
  if (url !== origin + route || init.method !== 'POST'
    || init.redirect !== 'manual') throw new Error('Unsafe local Saju route');
  return fetch(target, init);
};

function issuer() {
  return createSajuHeldSourceProofHttpIssuePortV1({
    serviceOrigin: origin,
    serviceBearer: process.env.MYEONGHA_LOCAL_SAJU_BEARER!,
    fetchImpl: loopbackFetch,
  });
}

function verifier() {
  return {
    trustedIssuer: process.env.MYEONGHA_LOCAL_SAJU_ISSUER!,
    expectedAudience: process.env.MYEONGHA_LOCAL_SAJU_AUDIENCE!,
    trustedKeyId: process.env.MYEONGHA_LOCAL_SAJU_KEY_ID!,
    keyBytes: Buffer.from(process.env.MYEONGHA_LOCAL_SAJU_HMAC_KEY!, 'base64'),
    claimNonceOnce: createSajuSourceProofPostgresNonceClaimV1({
      pool: adapter(nonceDb!),
    }),
  };
}

function input(verifiedEvidence: VerifiedSubjectIdentityEvidenceV1 = owner) {
  return {
    verifiedEvidence,
    pool: adapter(subjectDb!),
    issuePort: issuer(),
    verifierTrust: verifier(),
  };
}

describe.skipIf(!enabled)(
  'real PostgreSQL current member Birth -> Saju process HTTP -> HMAC + durable nonce -> Birth recheck',
  () => {
    beforeAll(async () => {
      requireIsolatedInputs();
      const result = await adminDb!.query<{
        database: string; owner_count: string; current_revision_id: string;
        member_role: boolean; subject_rls: boolean; birth_rls: boolean;
      }>(
        'select current_database() as database, '
        + "(select count(*)::text from auth.users where id = $1::uuid) as owner_count, "
        + "(select current_revision_id::text from public.birth_profiles where id = $2::uuid) as current_revision_id, "
        + "(select exists(select 1 from pg_roles where rolname = 'myeongha_api_executor')) as member_role, "
        + "(select relrowsecurity from pg_class where oid = 'public.subjects'::regclass) as subject_rls, "
        + "(select relrowsecurity from pg_class where oid = 'public.birth_profile_revisions'::regclass) as birth_rls",
        [AUTH_OWNER, PROFILE_OWNER],
      );
      expect(result.rows[0]).toMatchObject({
        database: 'myeongha_saju_local_verify',
        owner_count: '1',
        current_revision_id: REVISION_1,
        member_role: true, subject_rls: true, birth_rls: true,
      });
    });

    afterAll(async () => {
      await Promise.all([subjectDb?.end(), nonceDb?.end(), adminDb?.end()]);
    });

    it('resolves actual owner-scoped Subject and immutable current Birth revision from PostgreSQL', async () => {
      const result = await readBoundCurrentBirthContextV1({
        pool: adapter(subjectDb!), verifiedEvidence: owner,
      });
      expect(result.resolvedSubject).toMatchObject({
        subjectId: SUBJECT_OWNER, subjectKind: 'member',
      });
      expect(result.profile).toMatchObject({
        birthProfileId: PROFILE_OWNER, profileKind: 'self',
        currentRevision: {
          revisionId: REVISION_1, revisionNo: 1,
          input: {
            calendarType: 'solar', birthDate: '2024-03-10',
            birthTime: '12:00:00', timeKnown: true, sex: 'unspecified',
          },
        },
      });
    });

    it('binds Saju real HTTP Proof to actual current Birth revision and persists nonce via PostgreSQL', async () => {
      const issuePort = issuer();
      const seen = vi.fn(issuePort.issuePreviewProof.bind(issuePort));
      const result = await bindCurrentSubjectSajuHeldProofV1({
        ...input(),
        issuePort: { issuePreviewProof: seen },
      });
      expect(seen).toHaveBeenCalledOnce();
      expect(seen.mock.calls[0]?.[0]).toEqual({
        nonce: expect.stringMatching(/^[a-zA-Z0-9_-]{22,128}$/u),
        request: {
          birth: { calendarType: 'solar', date: '2024-03-10', time: '12:00', sex: 'unspecified' },
          reading: { text: '전체 사주' },
        },
      });
      expect(result).toMatchObject({
        state: 'held', reason: 'source_transport_integrity_verified_only',
        sourceAuthority: 'NOT_EVALUATED', releaseAuthorization: 'NOT_EVALUATED',
        canExecute: false, canPublish: false, canSell: false,
        binding: {
          subjectId: SUBJECT_OWNER, birthProfileId: PROFILE_OWNER,
          birthRevisionId: REVISION_1, birthRevisionNo: 1,
          requestBodyHash: expect.stringMatching(/^[a-f0-9]{64}$/u),
          responseBodyHash: expect.stringMatching(/^[a-f0-9]{64}$/u),
        },
      });
      expect(JSON.stringify(result)).not.toContain('2024-03-10');
      expect(JSON.stringify(result)).not.toContain(AUTH_OWNER);
      const count = await adminDb!.query<{ count: string }>(
        'select count(*)::text as count from public.saju_source_proof_nonce_claims',
      );
      expect(Number(count.rows[0]?.count)).toBeGreaterThanOrEqual(1);
    });

    it('does not invoke Saju for a different verified member with no current self Birth', async () => {
      const issue = issuer();
      const seen = vi.fn(issue.issuePreviewProof.bind(issue));
      const result = await bindCurrentSubjectSajuHeldProofV1({
        ...input(other),
        issuePort: { issuePreviewProof: seen },
      });
      expect(result).toMatchObject({
        state: 'blocked', reason: 'birth_profile_unavailable',
        canExecute: false, canPublish: false, canSell: false,
      });
      expect(seen).not.toHaveBeenCalled();
      expect(result).not.toHaveProperty('binding');
    });

    it('blocks a different revision ID even if the corrected Birth values are byte-for-byte identical', async () => {
      const issue = issuer();
      const seen = vi.fn(async (request: Parameters<typeof issue.issuePreviewProof>[0]) => {
        const proof = await issue.issuePreviewProof(request);
        // Actual authoritative update occurs AFTER real Saju HTTP response
        // and BEFORE MyeongHa opens the post-proof Subject/Birth transaction.
        await adminDb!.query(
          'update public.birth_profiles set current_revision_id = $1::uuid where id = $2::uuid',
          [REVISION_2, PROFILE_OWNER],
        );
        return proof;
      });
      try {
        const result = await bindCurrentSubjectSajuHeldProofV1({
          ...input(), issuePort: { issuePreviewProof: seen },
        });
        expect(seen).toHaveBeenCalledOnce();
        expect(result).toMatchObject({
          state: 'blocked', reason: 'current_birth_revision_changed',
          sourceAuthority: 'NOT_EVALUATED', releaseAuthorization: 'NOT_EVALUATED',
          canExecute: false, canPublish: false, canSell: false,
        });
        expect(result).not.toHaveProperty('binding');
        const current = await adminDb!.query<{ current_revision_id: string }>(
          'select current_revision_id::text from public.birth_profiles where id = $1::uuid',
          [PROFILE_OWNER],
        );
        expect(current.rows[0]?.current_revision_id).toBe(REVISION_2);
      } finally {
        // Restore only a disposable fixture; no Production migration or data.
        await adminDb!.query(
          'update public.birth_profiles set current_revision_id = $1::uuid where id = $2::uuid',
          [REVISION_1, PROFILE_OWNER],
        );
      }
    });
  },
);
