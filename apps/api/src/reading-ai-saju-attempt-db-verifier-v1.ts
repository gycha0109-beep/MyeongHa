import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import type { DbReadingAttemptBindingAuthorityV1 } from './reading-ai-saju-binding-authority-v1.js';

/**
 * A4 OFFLINE candidate for the DB half of Saju provider-call attribution.
 * A Saju source receipt must independently attest the exact transport ref AND
 * pre-allocated DB attempt before this function may be used.
 *
 * This is deliberately NOT mounted in Production. The required dedicated
 * read-only principal does not yet exist, and its proposed grants would need
 * to cover the complete attempt set (including RLS) to prove global uniqueness.
 * The existing cost Writer and Admin Reader MUST NOT be reused.
 *
 * The transport ref is stored only on terminal attempts. Therefore this
 * verifier is for deferred reconciliation, never for attribution of an
 * in-flight provider call. Unresolved/failed calls remain unmeasured.
 */
export const READING_AI_BINDING_READER_PRINCIPAL_V1 =
  'myeongha_reading_ai_cost_binding_reader_v1' as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const CONTROL = /[\u0000-\u001f\u007f]/u;
const CHECK_PRINCIPAL = 'SELECT current_user::text AS "currentUser"';

/** Only exact terminal attempt/ref and globally unique source-ref may return. */
const FIND_BOUND_ATTEMPT = `
SELECT
  a.external_request_ref AS "externalRequestRef",
  a.id::text AS "executionAttemptId",
  a.reading_id::text AS "readingId",
  a.subject_id::text AS "subjectId"
FROM public.reading_execution_attempts a
WHERE a.id = $1::uuid
  AND a.external_request_ref = $2::text
  AND a.state IN ('succeeded', 'failed_retryable', 'failed_final')
  AND (SELECT count(*) FROM public.reading_execution_attempts d
       WHERE d.external_request_ref = $2::text) = 1
LIMIT 2`.trim();

type AttemptRow = Readonly<{
  externalRequestRef: unknown;
  executionAttemptId: unknown;
  readingId: unknown;
  subjectId: unknown;
}>;

function requestAllowed(value: string, id: string): boolean {
  return typeof value === 'string'
    && value.length > 0 && value.length <= 256
    && value.trim() === value && !CONTROL.test(value)
    && typeof id === 'string' && UUID.test(id);
}

/**
 * Implements the DB half of DbReadingAttemptBindingAuthorityV1 structurally.
 * Requires a separate server-held, globally scoped, read-only DB authority;
 * no role, grants, route, credentials or automatic runtime mount are installed.
 */
export function createPostgresSajuReadingAttemptVerifierV1(input: Readonly<{
  pool: PostgresSubjectPoolV1;
}>): DbReadingAttemptBindingAuthorityV1 {
  return Object.freeze({
    async verifyDbAttempt(request: Readonly<{
      externalRequestRef: string;
      executionAttemptId: string;
    }>): Promise<Readonly<{
      externalRequestRef: string;
      executionAttemptId: string;
      readingId: string;
      subjectId: string;
    }> | null> {
      if (!requestAllowed(request.externalRequestRef, request.executionAttemptId))
        return null;
      const client = await input.pool.connect();
      let active = false;
      let discard: unknown;
      try {
        await client.query('BEGIN READ ONLY');
        active = true;
        const role = await client.query<{ currentUser: unknown }>(CHECK_PRINCIPAL);
        if (role.rows.length !== 1
          || role.rows[0]?.currentUser !== READING_AI_BINDING_READER_PRINCIPAL_V1)
          throw Error('Dedicated read-only Reading binding authority required');

        const result = await client.query<AttemptRow>(FIND_BOUND_ATTEMPT, [
          request.executionAttemptId, request.externalRequestRef,
        ]);
        const row = result.rows[0];
        const valid = result.rows.length === 1 && row !== undefined
          && row.externalRequestRef === request.externalRequestRef
          && typeof row.executionAttemptId === 'string'
          && row.executionAttemptId.toLowerCase() === request.executionAttemptId.toLowerCase()
          && typeof row.readingId === 'string' && UUID.test(row.readingId)
          && typeof row.subjectId === 'string' && UUID.test(row.subjectId);

        await client.query('COMMIT');
        active = false;
        if (!valid || row === undefined) return null;
        return Object.freeze({
          externalRequestRef: request.externalRequestRef,
          executionAttemptId: String(row.executionAttemptId).toLowerCase(),
          readingId: String(row.readingId).toLowerCase(),
          subjectId: String(row.subjectId).toLowerCase(),
        });
      } catch (error) {
        if (active) {
          try { await client.query('ROLLBACK'); }
          catch (rollbackError) {
            discard = rollbackError;
            throw new AggregateError([error, rollbackError],
              'Reading binding verification failed and rollback also failed');
          }
        }
        throw error;
      } finally {
        client.release(discard);
      }
    },
  });
}
