import type { VerifiedSubjectIdentityEvidenceV1 } from './subject-identity-resolver.js';
import {
  executePostgresSubjectTransactionV1,
  type PostgresSubjectPoolV1,
} from './postgres-subject-execution.js';

/**
 * Records a SERVER-CLASSIFIED transport failure through the EXISTING DB
 * state machine. This does not classify ambiguous Saju outcomes, authorize
 * a new attempt, or make a failed payment eligible for another charge.
 *
 * The ordinary API executor remains denied the transport failure command.
 * No new role, route, grant, or Production issuer is activated here.
 */
const FINALIZE_FAILURE_SQL = `
select
  execution_attempt_id::text as "executionAttemptId",
  execution_attempt_no as "executionAttemptNo",
  attempt_state as "attemptState",
  reading_state as "readingState",
  replayed
from public.cmd_finalize_reading_transport_failure_v1(
  $1::uuid, $2::uuid, $3::uuid, $4::boolean, $5::text, $6::text
)
`.trim();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const ERROR_CODE = /^[A-Z][A-Z0-9_]{0,63}$/u;

export type SajuOfficialAttemptFailureResultV1 =
  | Readonly<{ state: 'held'; canRetry: false }>
  | Readonly<{
      state: 'recorded';
      attemptState: 'failed_retryable' | 'failed_final';
      replayed: boolean;
      canRetry: boolean;
    }>;

export interface SajuOfficialAttemptFailurePortV1 {
  finalizeClassifiedFailure(input: Readonly<{
    subjectId: string;
    readingId: string;
    executionAttemptId: string;
    /** Must be decided by an approved server-side failure policy, never a browser. */
    retryable: boolean;
    errorCode: string;
    externalRequestRef: string | null;
  }>): Promise<SajuOfficialAttemptFailureResultV1>;
}

type FailureInput = Parameters<SajuOfficialAttemptFailurePortV1['finalizeClassifiedFailure']>[0];
type FailureRow = Readonly<{
  executionAttemptId: unknown;
  executionAttemptNo: unknown;
  attemptState: unknown;
  readingState: unknown;
  replayed: unknown;
}>;

function validFailure(input: FailureInput): boolean {
  return [input.subjectId, input.readingId, input.executionAttemptId].every(
    (value) => typeof value === 'string' && UUID.test(value),
  ) && typeof input.retryable === 'boolean'
    && typeof input.errorCode === 'string' && ERROR_CODE.test(input.errorCode)
    && (input.externalRequestRef === null ||
      (typeof input.externalRequestRef === 'string' &&
        input.externalRequestRef.trim() === input.externalRequestRef &&
        input.externalRequestRef.length > 0 &&
        input.externalRequestRef.length <= 256));
}

export function createPostgresSajuOfficialAttemptFailurePortV1(input: Readonly<{
  pool: PostgresSubjectPoolV1;
  verifiedEvidence: VerifiedSubjectIdentityEvidenceV1;
}>): SajuOfficialAttemptFailurePortV1 {
  return Object.freeze({
    async finalizeClassifiedFailure(request: FailureInput) {
      if (!validFailure(request)) return Object.freeze({ state: 'held', canRetry: false });
      return executePostgresSubjectTransactionV1({
        pool: input.pool,
        verifiedEvidence: input.verifiedEvidence,
        execute: async ({ client, resolvedSubject }) => {
          if (resolvedSubject.subjectId !== request.subjectId) {
            return Object.freeze({ state: 'held' as const, canRetry: false as const });
          }
          const response = await client.query<FailureRow>(FINALIZE_FAILURE_SQL, [
            request.subjectId, request.readingId, request.executionAttemptId,
            request.retryable, request.errorCode, request.externalRequestRef,
          ]);
          if (response.rows.length !== 1 || !response.rows[0]) {
            throw new Error('Official Saju attempt failure did not return one DB receipt.');
          }
          const row = response.rows[0];
          const expectedState = request.retryable ? 'failed_retryable' : 'failed_final';
          const expectedReadingState = request.retryable ? 'running' : 'failed';
          if (row.executionAttemptId !== request.executionAttemptId ||
              !Number.isSafeInteger(row.executionAttemptNo) ||
              (row.executionAttemptNo as number) < 1 ||
              row.attemptState !== expectedState ||
              row.readingState !== expectedReadingState ||
              typeof row.replayed !== 'boolean') {
            throw new Error('Official Saju attempt failure receipt conflicts with DB authority.');
          }
          return Object.freeze({
            state: 'recorded' as const,
            attemptState: expectedState,
            replayed: row.replayed,
            // "retryable" here means DB-state eligible only, not permission to
            // reissue an ambiguous request; a new approved issuer check is needed.
            canRetry: false as const,
          });
        },
      });
    },
  });
}
