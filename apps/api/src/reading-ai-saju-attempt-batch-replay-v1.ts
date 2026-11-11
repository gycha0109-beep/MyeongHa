import type { PostgresSubjectPoolV1 } from "./postgres-subject-execution.js";
import { SAJU_A4_SOURCE_RECEIPT_READER_ROLE_V1 } from "./reading-ai-saju-source-receipt-db-reader-v1.js";
import { createSajuA4PostTerminalCostReplayV1 } from "./reading-ai-saju-postterminal-replay-v1.js";
import type { SajuA4VerifiedCostCompositionConfigV1 } from "./reading-ai-saju-proven-cost-composition-v1.js";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const MAX_LOCAL_RECEIPTS = 500;
const LIST = `
SELECT call_id::text AS "callId", proof::text AS "proofJson"
FROM saju_source_ops.a4_provider_call_signed_receipts_v1
WHERE proof #>> '{payload,link,executionAttemptId}' = $1::text
ORDER BY call_id LIMIT 501
`.trim();

function record(raw: unknown): Record<string, unknown> | null {
  return raw !== null && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : null;
}

/**
 * A bounded, read-only census of source-owned, locally retained receipts for
 * one server-chosen canonical DB execution attempt. This is discovery only,
 * NOT proof of any provider-wide callback completeness or Reading authority.
 *
 * Each discovered call is independently re-fetched and HMAC-verified by the
 * existing protected single-call replayer before a cost Writer can record it.
 */
async function listLocalSourceCallIds(
  pool: PostgresSubjectPoolV1,
  executionAttemptId: string,
): Promise<readonly string[]> {
  const client = await pool.connect();
  let begun = false;
  let discard: unknown;
  try {
    await client.query("BEGIN READ ONLY");
    begun = true;
    const roles = await client.query<{ currentUser: unknown }>(
      'SELECT current_user::text AS "currentUser"',
    );
    if (
      roles.rows.length !== 1 ||
      roles.rows[0]?.currentUser !== SAJU_A4_SOURCE_RECEIPT_READER_ROLE_V1
    ) {
      throw new Error(
        "Dedicated Saju source receipt Reader principal required",
      );
    }
    const found = await client.query<{ callId: unknown; proofJson: unknown }>(
      LIST,
      [executionAttemptId],
    );
    if (found.rows.length > MAX_LOCAL_RECEIPTS) {
      throw new Error("A4 signed receipt census exceeded a bounded limit");
    }
    const calls: string[] = [];
    let previous = "";
    for (const row of found.rows) {
      if (
        typeof row.callId !== "string" ||
        !UUID.test(row.callId) ||
        row.callId <= previous ||
        typeof row.proofJson !== "string" ||
        Buffer.byteLength(row.proofJson, "utf8") > 8192
      ) {
        throw new Error("Invalid or ambiguous Saju source receipt census");
      }
      let proof: Record<string, unknown> | null;
      try {
        proof = record(JSON.parse(row.proofJson));
      } catch {
        throw new Error("Malformed Saju source receipt census");
      }
      const payload = record(proof?.payload);
      const link = record(payload?.link);
      const observation = record(link?.observation);
      if (
        !proof ||
        !payload ||
        !link ||
        !observation ||
        link.executionAttemptId !== executionAttemptId ||
        observation.callId !== row.callId
      ) {
        throw new Error("Unbound Saju source receipt census");
      }
      calls.push(row.callId);
      previous = row.callId;
    }
    await client.query("COMMIT");
    begun = false;
    return Object.freeze(calls);
  } catch (error) {
    if (begun) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        discard = rollbackError;
        throw new AggregateError(
          [error, rollbackError],
          "A4 source receipt census failed and rollback failed",
          { cause: rollbackError },
        );
      }
    }
    throw error;
  } finally {
    client.release(discard);
  }
}

export type SajuA4AttemptBatchReplayResultV1 =
  | Readonly<{
      state: "held_no_local_receipts";
      executionAttemptId: string;
      observedLocalCalls: 0;
      recordedCalls: 0;
      replayedCalls: 0;
      completeCostCoverage: false;
      invoiceReconciled: false;
    }>
  | Readonly<{
      state: "local_receipts_recorded";
      executionAttemptId: string;
      observedLocalCalls: number;
      recordedCalls: number;
      replayedCalls: number;
      completeCostCoverage: false;
      invoiceReconciled: false;
    }>;

/**
 * Offline, server-only, one-attempt extension of the existing post-terminal
 * single-call cost writer. Missing/invalid receipts or an uncertain DB
 * operation fail closed; earlier successful entries remain idempotently
 * replayable on retry. A local census can never establish total provider usage.
 *
 * No scheduler, HTTP route, authorized issuer, production installation,
 * price guessing or billing reconciliation is performed.
 */
export function createSajuA4AttemptBatchReplayV1(
  input: SajuA4VerifiedCostCompositionConfigV1,
): Readonly<{
  replayAttempt(
    executionAttemptId: string,
  ): Promise<SajuA4AttemptBatchReplayResultV1>;
}> {
  if (
    !input ||
    typeof input.sourceReceiptPool?.connect !== "function" ||
    input.sourceReceiptPool === input.canonicalAttemptPool ||
    input.sourceReceiptPool === input.ledgerWriterPool
  ) {
    throw new TypeError("Independent A4 source receipt Reader required");
  }
  const replay = createSajuA4PostTerminalCostReplayV1(input);
  return Object.freeze({
    async replayAttempt(executionAttemptId: string) {
      if (
        typeof executionAttemptId !== "string" ||
        !UUID.test(executionAttemptId)
      ) {
        throw new TypeError(
          "Server-chosen A4 canonical execution attempt UUID required",
        );
      }
      const callIds = await listLocalSourceCallIds(
        input.sourceReceiptPool,
        executionAttemptId,
      );
      if (callIds.length === 0) {
        return Object.freeze({
          state: "held_no_local_receipts" as const,
          executionAttemptId,
          observedLocalCalls: 0 as const,
          recordedCalls: 0 as const,
          replayedCalls: 0 as const,
          completeCostCoverage: false as const,
          invoiceReconciled: false as const,
        });
      }
      let recordedCalls = 0;
      let replayedCalls = 0;
      for (const callId of callIds) {
        const outcome = await replay.replayOne(callId);
        if (outcome.state !== "recorded" || outcome.callId !== callId) {
          throw new Error(
            "Unverified Saju provider receipt in local attempt census",
          );
        }
        if (outcome.replayed) replayedCalls += 1;
        else recordedCalls += 1;
      }
      return Object.freeze({
        state: "local_receipts_recorded" as const,
        executionAttemptId,
        observedLocalCalls: callIds.length,
        recordedCalls,
        replayedCalls,
        completeCostCoverage: false as const,
        invoiceReconciled: false as const,
      });
    },
  });
}
