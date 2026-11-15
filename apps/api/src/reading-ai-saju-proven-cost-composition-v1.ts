import type { PostgresSubjectPoolV1 } from "./postgres-subject-execution.js";
import type { SeyeonAiPriceV1 } from "./seyeon-ai-usage-cost-v1.js";
import { createSajuSignedProviderCallSourceAuthorityV1 } from "./reading-ai-saju-signed-call-source-v1.js";
import { createPostgresSajuSourceReceiptLoaderV1 } from "./reading-ai-saju-source-receipt-db-reader-v1.js";
import { createPostgresSajuReadingAttemptVerifierV1 } from "./reading-ai-saju-attempt-db-verifier-v1.js";
import { createSajuA4PrincipalReadinessV1 } from "./reading-ai-saju-principal-readiness-v1.js";
import { createVerifiedSajuReadingProviderBindingAuthorityV1 } from "./reading-ai-saju-binding-authority-v1.js";
import {
  createSajuNarrativeReadingCostBridgeV1,
  type SajuNarrativeProviderObservationV1,
} from "./reading-ai-saju-provider-bridge-v1.js";

/**
 * Three independent server-held database principals are mandatory:
 * 1. Saju source-owned signed receipt Reader;
 * 2. canonical MyeongHa execution-attempt Reader;
 * 3. MyeongHa cost ledger Writer.
 *
 * This composition does not create a new public endpoint, provider event,
 * credential, authorization grant, production deployment or cost-collection
 * activation. Only a governed, independently admitted server runtime may
 * install and call it after validating all three principals and source keys.
 * Every verified Source/DB binding must also pass independent grant and role
 * checks immediately before the Writer RPC. This cannot establish invoice
 * completeness or guarantee future DB availability.
 */
export interface SajuA4VerifiedCostCompositionConfigV1 {
  readonly sourceReceiptPool: PostgresSubjectPoolV1;
  readonly canonicalAttemptPool: PostgresSubjectPoolV1;
  readonly ledgerWriterPool: PostgresSubjectPoolV1;
  readonly trustedIssuer: string;
  readonly expectedAudience: string;
  readonly trustedKeyId: string;
  readonly keyBytes: Uint8Array;
  readonly nowMs: () => number;
}

export function createSajuA4VerifiedCostCompositionV1(
  input: SajuA4VerifiedCostCompositionConfigV1,
): Readonly<{
  record(
    input: Readonly<{
      expectedSajuRequestId: string;
      expectedModelKey: string;
      observation: SajuNarrativeProviderObservationV1;
      price?: SeyeonAiPriceV1;
    }>,
  ): Promise<Readonly<{ callId: string; replayed: boolean }>>;
}> {
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
      "Three independent A4 source, canonical DB and cost writer pools required",
    );

  const sourceReceiptReader = createPostgresSajuSourceReceiptLoaderV1({
    pool: input.sourceReceiptPool,
  });
  const source = createSajuSignedProviderCallSourceAuthorityV1({
    trustedIssuer: input.trustedIssuer,
    expectedAudience: input.expectedAudience,
    trustedKeyId: input.trustedKeyId,
    keyBytes: input.keyBytes,
    nowMs: input.nowMs,
    loadSignedCallById: sourceReceiptReader.loadSignedCallById,
  });
  const db = createPostgresSajuReadingAttemptVerifierV1({
    pool: input.canonicalAttemptPool,
  });
  const bindingAuthority = createVerifiedSajuReadingProviderBindingAuthorityV1({
    source,
    db,
  });
  const readiness = createSajuA4PrincipalReadinessV1(input);
  const bridge = createSajuNarrativeReadingCostBridgeV1({
    pool: input.ledgerWriterPool,
    bindingAuthority: Object.freeze({
      async resolve(request: Parameters<typeof bindingAuthority.resolve>[0]) {
        // Validate the signed Source and canonical terminated Reading attempt
        // before checking three least-privilege DB principals. Never call the
        // ledger Writer when the privilege check fails.
        const binding = await bindingAuthority.resolve(request);
        if (binding !== null) await readiness.check();
        return binding;
      },
    }),
  });
  return Object.freeze({ record: bridge.record });
}
