import type { PostgresSubjectPoolV1 } from "./postgres-subject-execution.js";

import { createPostgresSajuSourceReceiptLoaderV1 } from "./reading-ai-saju-source-receipt-db-reader-v1.js";
import {
  createSajuA4VerifiedCostCompositionV1,
  type SajuA4VerifiedCostCompositionConfigV1,
} from "./reading-ai-saju-proven-cost-composition-v1.js";
import type { SajuNarrativeProviderObservationV1 } from "./reading-ai-saju-provider-bridge-v1.js";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const OBSERVATION_FIELDS = [
  "callId",
  "requestId",
  "providerKey",
  "modelKey",
  "source",
  "outcome",
  "observedAt",
  "usage",
] as const;
const USAGE_FIELDS = [
  "inputTokens",
  "outputTokens",
  "cachedInputTokens",
  "reasoningTokens",
] as const;
const PAYLOAD_FIELDS = [
  "version",
  "issuer",
  "audience",
  "keyId",
  "issuedAtMs",
  "link",
] as const;
const LINK_FIELDS = [
  "version",
  "externalRequestRef",
  "executionAttemptId",
  "observation",
] as const;

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}
function exact(
  value: Record<string, unknown> | null,
  keys: readonly string[],
): boolean {
  return (
    value !== null &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}
function signedObservation(
  source: unknown,
  expectedCallId: string,
): SajuNarrativeProviderObservationV1 | null {
  const proof = record(source);
  if (!exact(proof, ["payload", "signatureHex"])) return null;
  const payload = record(proof!.payload);
  if (
    !exact(payload, PAYLOAD_FIELDS) ||
    payload!.version !== "saju-provider-call-source-proof-v1"
  )
    return null;
  const link = record(payload!.link);
  if (
    !exact(link, LINK_FIELDS) ||
    link!.version !== "saju-source-provider-call-link-v1"
  )
    return null;
  const observed = record(link!.observation);
  if (
    !exact(observed, OBSERVATION_FIELDS) ||
    observed!.callId !== expectedCallId ||
    !exact(record(observed!.usage), USAGE_FIELDS)
  )
    return null;
  // This is only structural extraction from the signed source-owned row.
  // The independently keyed signer and terminated DB attempt validators in
  // createSajuA4VerifiedCostCompositionV1 must prove this entire observation
  // before the cost Writer may record it.
  return observed as unknown as SajuNarrativeProviderObservationV1;
}

export type SajuA4PostTerminalCostReplayResultV1 =
  | Readonly<{
      state: "held";
      reason: "missing_or_unusable_source_receipt";
      recordedCost: false;
    }>
  | Readonly<{
      state: "recorded";
      callId: string;
      replayed: boolean;
      invoiceReconciled: false;
    }>;

/**
 * Private single-call post-terminal reconciliation. A call UUID is a lookup
 * coordinate, NEVER an attribution authority. The observation comes only
 * from the immutable Saju Source Reader and is re-fetched, HMAC verified,
 * matched to a uniquely terminated canonical DB attempt, then written by
 * the independent Cost Writer. No browser route, scheduler, network issuer,
 * or Production installation is created by this seam.
 *
 * No "missing" result can be interpreted as zero usage or complete costs.
 * DB/source failures and unresolved authority propagate as errors so a
 * retry orchestrator cannot mistake them for successfully processed calls.
 */
export function createSajuA4PostTerminalCostReplayV1(
  input: SajuA4VerifiedCostCompositionConfigV1,
): Readonly<{
  replayOne(callId: string): Promise<SajuA4PostTerminalCostReplayResultV1>;
}> {
  const sourceReader = createPostgresSajuSourceReceiptLoaderV1({
    pool: input.sourceReceiptPool as PostgresSubjectPoolV1,
  });
  const protectedWriter = createSajuA4VerifiedCostCompositionV1(input);
  return Object.freeze({
    async replayOne(callId: string) {
      if (typeof callId !== "string" || !UUID.test(callId))
        throw new TypeError(
          "Valid server-selected Saju provider call UUID required",
        );
      const proof = await sourceReader.loadSignedCallById(callId);
      const observation = signedObservation(proof, callId);
      if (!observation) {
        return Object.freeze({
          state: "held" as const,
          reason: "missing_or_unusable_source_receipt" as const,
          recordedCost: false as const,
        });
      }
      const outcome = await protectedWriter.record({
        expectedSajuRequestId: observation.requestId,
        expectedModelKey: observation.modelKey,
        observation,
      });
      return Object.freeze({
        state: "recorded" as const,
        callId: outcome.callId,
        replayed: outcome.replayed,
        invoiceReconciled: false as const,
      });
    },
  });
}
