import type { VerifiedSubjectIdentityEvidenceV1 } from './subject-identity-resolver.js';
import {
  executePostgresSubjectTransactionV1,
  type PostgresSubjectPoolV1,
} from './postgres-subject-execution.js';
import type { SajuOfficialAttemptPreparePortV1 } from './saju-production-reading-execution.js';

/**
 * Internal official Reading attempt allocator. It reuses the existing governed
 * transport command, then checks the exact paid initial Reader grant in the SAME
 * transaction. An invalid grant rolls back the newly allocated attempt.
 *
 * The ordinary API executor is still denied the transport command by migration
 * 1000: this adapter does not activate Production issuance or grant any privilege.
 */
const PREPARE_SQL = `
select
  execution_attempt_id::text as "executionAttemptId",
  execution_attempt_no as "executionAttemptNo",
  attempt_state as "attemptState",
  replayed
from public.cmd_prepare_reading_transport_attempt_v1(
  $1::uuid, $2::uuid, $3::uuid, $4::text, $5::text, $6::text
)
`.trim();

const CURRENT_PURCHASE_SQL = `
select public.qry_saju_official_issuance_preflight_v1(
  $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid
) as "admitted"
`.trim();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const deniedAfterAllocation = Object.freeze(new Error('Official Reading attempt is not currently entitled.'));

type PrepareInput = Parameters<SajuOfficialAttemptPreparePortV1['prepareBeforeSourceCall']>[0];
type PrepareRow = Readonly<{
  executionAttemptId: unknown;
  executionAttemptNo: unknown;
  attemptState: unknown;
  replayed: unknown;
}>;

function validIdentity(input: PrepareInput): boolean {
  return [input.subjectId, input.readingId, input.readingSessionId,
    input.executionAttemptId, input.sourceBirthRevisionId].every(
    (value) => typeof value === 'string' && UUID.test(value),
  );
}

function validServerKey(value: string): boolean {
  return typeof value === 'string' && value.length > 0 &&
    value.trim() === value && value.length <= 256;
}

/** Caller-controlled browser fields must not be used for the transport identity. */
export function createPostgresSajuOfficialAttemptPreparePortV1(input: Readonly<{
  pool: PostgresSubjectPoolV1;
  verifiedEvidence: VerifiedSubjectIdentityEvidenceV1;
  transportKey: string;
  sajuEngineKey: string;
  requestedEngineVersion: string | null;
}>): SajuOfficialAttemptPreparePortV1 {
  const validConfiguration = validServerKey(input.transportKey)
    && validServerKey(input.sajuEngineKey)
    && (input.requestedEngineVersion === null ||
      validServerKey(input.requestedEngineVersion));

  return Object.freeze({
    async prepareBeforeSourceCall(request: PrepareInput) {
      if (!validConfiguration || !validIdentity(request)) return false;
      try {
        return await executePostgresSubjectTransactionV1({
          pool: input.pool,
          verifiedEvidence: input.verifiedEvidence,
          execute: async ({ client, resolvedSubject }) => {
            if (resolvedSubject.subjectId !== request.subjectId) return false;
            const attempt = await client.query<PrepareRow>(PREPARE_SQL, [
              request.subjectId,
              request.readingId,
              request.executionAttemptId,
              input.transportKey,
              input.sajuEngineKey,
              input.requestedEngineVersion,
            ]);
            if (attempt.rows.length !== 1 || !attempt.rows[0]) {
              throw new Error('Official Reading prepare returned an invalid receipt.');
            }
            const row = attempt.rows[0];
            if (row.executionAttemptId !== request.executionAttemptId ||
              !Number.isSafeInteger(row.executionAttemptNo) ||
              (row.executionAttemptNo as number) < 1 ||
              row.attemptState !== 'running' ||
              typeof row.replayed !== 'boolean') {
              throw new Error('Official Reading prepare receipt does not match this attempt.');
            }
            // The existing DB command returns exact replays, including running
            // ones. Never send a second Saju network request for the same ID.
            if (row.replayed) return false;

            const result = await client.query<{ admitted: unknown }>(CURRENT_PURCHASE_SQL, [
              request.subjectId, request.readingId, request.readingSessionId,
              request.executionAttemptId, request.sourceBirthRevisionId,
            ]);
            if (result.rows.length !== 1 || result.rows[0]?.admitted !== true) {
              // A mere false result must NOT commit an unentitled running attempt.
              throw deniedAfterAllocation;
            }
            return true;
          },
        });
      } catch (error) {
        if (error === deniedAfterAllocation) return false;
        throw error;
      }
    },
  });
}
