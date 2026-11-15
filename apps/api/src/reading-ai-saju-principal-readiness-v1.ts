import type { PostgresSubjectPoolV1 } from "./postgres-subject-execution.js";
import { SAJU_A4_SOURCE_RECEIPT_READER_ROLE_V1 } from "./reading-ai-saju-source-receipt-db-reader-v1.js";
import { READING_AI_BINDING_READER_PRINCIPAL_V1 } from "./reading-ai-saju-attempt-db-verifier-v1.js";
import { READING_AI_COST_WRITER_PRINCIPAL_V1 } from "./reading-ai-cost-writer-v1.js";

const SOURCE_READINESS = `
WITH objects AS (
  SELECT
    to_regclass('saju_source_ops.a4_provider_call_signed_receipts_v1') AS receipts,
    to_regclass('saju_source_ops.a4_provider_call_coverage_v1') AS coverage
)
SELECT current_user::text AS "currentUser",
  receipts IS NOT NULL AND coverage IS NOT NULL AS "objectsExist",
  has_column_privilege(current_user, receipts, 'call_id', 'SELECT') AS "callIdRead",
  has_column_privilege(current_user, receipts, 'proof', 'SELECT') AS "proofRead",
  has_any_column_privilege(current_user, receipts, 'INSERT') AS "canInsert",
  has_any_column_privilege(current_user, receipts, 'UPDATE') AS "canUpdate",
  has_table_privilege(current_user, receipts, 'DELETE') AS "canDelete",
  has_table_privilege(current_user, receipts, 'TRUNCATE') AS "canTruncate",
  has_any_column_privilege(current_user, coverage, 'SELECT') AS "canReadCoverage"
FROM objects
`.trim();

const CANONICAL_READINESS = `
WITH objects AS (
  SELECT to_regclass('public.reading_execution_attempts') AS attempts
)
SELECT current_user::text AS "currentUser",
  attempts IS NOT NULL AS "objectsExist",
  has_column_privilege(current_user, attempts, 'id', 'SELECT') AS "idRead",
  has_column_privilege(current_user, attempts, 'reading_id', 'SELECT') AS "readingRead",
  has_column_privilege(current_user, attempts, 'subject_id', 'SELECT') AS "subjectRead",
  has_column_privilege(current_user, attempts, 'external_request_ref', 'SELECT') AS "refRead",
  has_column_privilege(current_user, attempts, 'state', 'SELECT') AS "stateRead",
  has_any_column_privilege(current_user, attempts, 'INSERT') AS "canInsert",
  has_any_column_privilege(current_user, attempts, 'UPDATE') AS "canUpdate",
  has_table_privilege(current_user, attempts, 'DELETE') AS "canDelete",
  has_table_privilege(current_user, attempts, 'TRUNCATE') AS "canTruncate"
FROM objects
`.trim();

const COST_WRITER_READINESS = `
WITH objects AS (
  SELECT
    to_regprocedure('myeongha_admin_ops.cmd_record_reading_ai_call_v1(uuid,uuid,uuid,jsonb)') AS writer_rpc,
    to_regclass('myeongha_admin_ops.reading_ai_call_cost_events_v1') AS ledger
)
SELECT current_user::text AS "currentUser",
  writer_rpc IS NOT NULL AND ledger IS NOT NULL AS "objectsExist",
  has_function_privilege(current_user, writer_rpc, 'EXECUTE') AS "canExecute",
  has_any_column_privilege(current_user, ledger, 'SELECT') AS "canReadLedger",
  has_any_column_privilege(current_user, ledger, 'INSERT') AS "canInsert",
  has_any_column_privilege(current_user, ledger, 'UPDATE') AS "canUpdate",
  has_table_privilege(current_user, ledger, 'DELETE') AS "canDelete",
  has_table_privilege(current_user, ledger, 'TRUNCATE') AS "canTruncate"
FROM objects
`.trim();

type PrincipalRow = Readonly<Record<string, unknown>>;

async function checkReadOnlyPrincipal(
  pool: PostgresSubjectPoolV1,
  sql: string,
  requiredRole: string,
  requiredTrue: readonly string[],
  requiredFalse: readonly string[],
): Promise<void> {
  const client = await pool.connect();
  let begun = false;
  let discard: unknown;
  try {
    await client.query("BEGIN READ ONLY");
    begun = true;
    const result = await client.query<PrincipalRow>(sql);
    const row = result.rows[0];
    if (
      result.rows.length !== 1 ||
      !row ||
      row.currentUser !== requiredRole ||
      requiredTrue.some((key) => row[key] !== true) ||
      requiredFalse.some((key) => row[key] !== false)
    )
      throw new Error("Dedicated A4 cost attribution principal is not ready");

    await client.query("COMMIT");
    begun = false;
  } catch (error) {
    if (begun) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        discard = rollbackError;
        throw new AggregateError(
          [error, rollbackError],
          "A4 principal check failed and rollback failed",
          { cause: rollbackError },
        );
      }
    }
    throw error;
  } finally {
    client.release(discard);
  }
}

/**
 * Offline/unmounted A4 service-account readiness check. Reads the three
 * independent database sessions using their ACTUAL current_user and grants.
 * Does not create connections/credentials, install roles or call a cost writer.
 *
 * Passing means only the three sessions were checked at this instant.
 * It does not establish TLS, service authentication, Production Interpretation
 * Authority, source callback completeness or provider invoice reconciliation.
 */
export function createSajuA4PrincipalReadinessV1(
  input: Readonly<{
    sourceReceiptPool: PostgresSubjectPoolV1;
    canonicalAttemptPool: PostgresSubjectPoolV1;
    ledgerWriterPool: PostgresSubjectPoolV1;
  }>,
): Readonly<{ check(): Promise<void> }> {
  if (
    !input ||
    typeof input.sourceReceiptPool?.connect !== "function" ||
    typeof input.canonicalAttemptPool?.connect !== "function" ||
    typeof input.ledgerWriterPool?.connect !== "function" ||
    input.sourceReceiptPool === input.canonicalAttemptPool ||
    input.sourceReceiptPool === input.ledgerWriterPool ||
    input.canonicalAttemptPool === input.ledgerWriterPool
  )
    throw new TypeError(
      "Three independent A4 Source, canonical Reader and cost Writer pools required",
    );

  return Object.freeze({
    async check(): Promise<void> {
      await checkReadOnlyPrincipal(
        input.sourceReceiptPool,
        SOURCE_READINESS,
        SAJU_A4_SOURCE_RECEIPT_READER_ROLE_V1,
        ["objectsExist", "callIdRead", "proofRead"],
        [
          "canInsert",
          "canUpdate",
          "canDelete",
          "canTruncate",
          "canReadCoverage",
        ],
      );
      await checkReadOnlyPrincipal(
        input.canonicalAttemptPool,
        CANONICAL_READINESS,
        READING_AI_BINDING_READER_PRINCIPAL_V1,
        [
          "objectsExist",
          "idRead",
          "readingRead",
          "subjectRead",
          "refRead",
          "stateRead",
        ],
        ["canInsert", "canUpdate", "canDelete", "canTruncate"],
      );
      await checkReadOnlyPrincipal(
        input.ledgerWriterPool,
        COST_WRITER_READINESS,
        READING_AI_COST_WRITER_PRINCIPAL_V1,
        ["objectsExist", "canExecute"],
        ["canReadLedger", "canInsert", "canUpdate", "canDelete", "canTruncate"],
      );
    },
  });
}
