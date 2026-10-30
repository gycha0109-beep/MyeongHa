import type { VerifiedSubjectIdentityEvidenceV1 } from './subject-identity-resolver.js';
import {
  executePostgresSubjectTransactionV1,
  type PostgresSubjectPoolV1,
} from './postgres-subject-execution.js';

/**
 * Internal read-only observation for an exact official Saju issuance attempt.
 * The guarded SQL function admits only a current original purchase and the
 * canonical Subject. A state observation does NOT confirm the external issuer
 * outcome or authorize retry, report disclosure, or Reader AI context.
 */
export const POSTGRES_SAJU_OFFICIAL_ATTEMPT_RECONCILIATION_V1 =
  'public.qry_saju_official_attempt_reconciliation_status_v1' as const;

const READ_SQL = `
select execution_attempt_no as "executionAttemptNo",
       attempt_state as "attemptState",
       reading_state as "readingState",
       is_committed_source as "isCommittedSource"
from public.qry_saju_official_attempt_reconciliation_status_v1(
  $1::uuid, $2::uuid, $3::uuid
)
`.trim();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const attemptStates = new Set([
  'running', 'failed_retryable', 'failed_final', 'succeeded',
]);
const readingStates = new Set(['pending', 'running', 'failed', 'succeeded']);

type StatusRow = Readonly<{
  executionAttemptNo: unknown;
  attemptState: unknown;
  readingState: unknown;
  isCommittedSource: unknown;
}>;

export type OfficialSajuAttemptObservationV1 =
  | Readonly<{ state: 'unavailable'; canRetry: false; canDisclose: false }>
  | Readonly<{
      state: 'observed';
      attemptNo: number;
      attemptState: string;
      readingState: string;
      isCommittedSource: boolean;
      requiresIssuerReconciliation: boolean;
      canRetry: false;
      canDisclose: false;
    }>;

const unavailable = Object.freeze({
  state: 'unavailable' as const,
  canRetry: false as const,
  canDisclose: false as const,
});

export function createPostgresSajuOfficialAttemptReconciliationPortV1(input: Readonly<{
  pool: PostgresSubjectPoolV1;
  verifiedEvidence: VerifiedSubjectIdentityEvidenceV1;
}>) {
  return Object.freeze({
    async observe(inputIds: Readonly<{
      subjectId: string;
      readingId: string;
      executionAttemptId: string;
    }>): Promise<OfficialSajuAttemptObservationV1> {
      if (![inputIds.subjectId, inputIds.readingId, inputIds.executionAttemptId].every(
        value => typeof value === 'string' && UUID.test(value),
      )) return unavailable;

      return executePostgresSubjectTransactionV1({
        pool: input.pool,
        verifiedEvidence: input.verifiedEvidence,
        execute: async ({ resolvedSubject, client }) => {
          if (resolvedSubject.subjectId !== inputIds.subjectId) return unavailable;
          const response = await client.query<StatusRow>(READ_SQL, [
            inputIds.subjectId, inputIds.readingId, inputIds.executionAttemptId,
          ]);
          if (response.rows.length === 0) return unavailable;
          const row = response.rows[0];
          if (response.rows.length !== 1 || !row ||
            !Number.isSafeInteger(row.executionAttemptNo) ||
            (row.executionAttemptNo as number) < 1 ||
            typeof row.attemptState !== 'string' ||
            !attemptStates.has(row.attemptState) ||
            typeof row.readingState !== 'string' ||
            !readingStates.has(row.readingState) ||
            typeof row.isCommittedSource !== 'boolean' ||
            (row.isCommittedSource && (row.attemptState !== 'succeeded'
              || row.readingState !== 'succeeded')) ||
            (row.attemptState === 'succeeded' && !row.isCommittedSource)) {
            throw new Error('Official Saju attempt reconciliation source is inconsistent.');
          }
          return Object.freeze({
            state: 'observed' as const,
            attemptNo: row.executionAttemptNo as number,
            attemptState: row.attemptState,
            readingState: row.readingState,
            isCommittedSource: row.isCommittedSource,
            // Even a failed_retryable DB state is not source-authoritative
            // confirmation of non-issuance. Never auto-reissue from a DB read.
            requiresIssuerReconciliation: !row.isCommittedSource,
            canRetry: false as const,
            canDisclose: false as const,
          });
        },
      });
    },
  });
}
