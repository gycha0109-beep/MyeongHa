import type { VerifiedSubjectIdentityEvidenceV1 } from './subject-identity-resolver.js';
import {
  executePostgresSubjectTransactionV1,
  type PostgresSubjectPoolV1,
  type PostgresTransactionQueryV1,
} from './postgres-subject-execution.js';
import type {
  SajuOfficialIssuancePreflightPortV1,
} from './saju-production-reading-execution.js';
import type {
  SajuOfficialCurrentAuthorityPortV1,
} from './saju-official-reading-issuer-db-persistence-v1.js';

// Neither boundary reads private Commerce, Birth or Reading tables as the API
// role. The DB-owner RPC checks the exact pending attempt and initial purchase
// under the canonical Subject, then locks its grant through the transaction.
const CHECK_SQL = `
select public.qry_saju_official_issuance_preflight_v1(
  $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid
) as "admitted"
`.trim();

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const HASH = /^[a-f0-9]{64}$/u;

type PreflightInputV1 = Parameters<SajuOfficialIssuancePreflightPortV1['admitBeforeSourceCall']>[0];
type RowV1 = Readonly<{ admitted: unknown }>;

function validIdentity(input: PreflightInputV1): boolean {
  return [
    input.subjectId, input.readingId, input.readingSessionId,
    input.executionAttemptId, input.sourceBirthRevisionId,
  ].every((value) => typeof value === 'string' && UUID.test(value));
}

async function checkCurrentIssue(
  client: PostgresTransactionQueryV1,
  input: PreflightInputV1,
): Promise<boolean> {
  if (!validIdentity(input)) return false;
  const response = await client.query<RowV1>(CHECK_SQL, [
    input.subjectId, input.readingId, input.readingSessionId,
    input.executionAttemptId, input.sourceBirthRevisionId,
  ]);
  if (response.rows.length !== 1
    || (response.rows[0]?.admitted !== true && response.rows[0]?.admitted !== false)) {
    throw new Error('Saju official issuance preflight did not return one verified boolean.');
  }
  return response.rows[0].admitted === true;
}

/**
 * First protected permission check before invoking the Saju Production host.
 * A short transaction prevents premature, unentitled network execution.
 * This preflight alone NEVER gives an authorization to commit or disclose.
 */
export function createPostgresSajuOfficialIssuancePreflightPortV1(input: Readonly<{
  pool: PostgresSubjectPoolV1;
  verifiedEvidence: VerifiedSubjectIdentityEvidenceV1;
}>): SajuOfficialIssuancePreflightPortV1 {
  return Object.freeze({
    async admitBeforeSourceCall(request: PreflightInputV1) {
      if (!validIdentity(request)) return false;
      return executePostgresSubjectTransactionV1({
        pool: input.pool,
        verifiedEvidence: input.verifiedEvidence,
        execute: ({ client, resolvedSubject }) =>
          resolvedSubject.subjectId === request.subjectId
            ? checkCurrentIssue(client, request)
            : false,
      });
    },
  });
}

/**
 * Second authority check immediately before the immutable finalize.
 * The same DB RPC locks the exact current grant through COMMIT/ROLLBACK,
 * so an in-flight refund or Birth revision update cannot race this write.
 */
export function createPostgresSajuOfficialCurrentAuthorityPortV1(
  client: PostgresTransactionQueryV1,
): SajuOfficialCurrentAuthorityPortV1 {
  return Object.freeze({
    async admitCurrentIssue(input: Parameters<SajuOfficialCurrentAuthorityPortV1['admitCurrentIssue']>[0]) {
      if (!HASH.test(input.sourceResponseHash) || !HASH.test(input.storedResponseHash)) {
        return false;
      }
      return checkCurrentIssue(client, {
        subjectId: input.subjectId,
        readingId: input.dbReadingId,
        readingSessionId: input.readingSessionId,
        // A prepared attempt is independently pinned by the issuer transaction.
        executionAttemptId: input.executionAttemptId,
        sourceBirthRevisionId: input.sourceBirthRevisionId,
      });
    },
  });
}
