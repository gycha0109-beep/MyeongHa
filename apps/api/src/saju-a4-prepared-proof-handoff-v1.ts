import type { SajuOfficialAttemptPreparePortV1 } from "./saju-production-reading-execution.js";
import type { MyeongHaA4SignedPreparedAttemptProofV1 } from "./saju-a4-signed-prepared-attempt-issuer-v1.js";

export interface MyeongHaA4PreparedProofIssuerPortV1 {
  prepareAndSign(
    request: Parameters<
      SajuOfficialAttemptPreparePortV1["prepareBeforeSourceCall"]
    >[0],
  ): Promise<MyeongHaA4SignedPreparedAttemptProofV1 | null>;
}
export interface MyeongHaA4PreparedProofStorePortV1 {
  storePreparedProof(
    proof: MyeongHaA4SignedPreparedAttemptProofV1,
  ): Promise<void>;
}

/**
 * Plugged into the *existing* official Reading attemptPrepare seam; does
 * not replace canonical DB preparation or expand subject entitlements.
 * The issuer invokes governed prepare exactly once, signs only a new
 * attempt, and this wrapper durably stores before returning 'true'.
 * Any failed/missing authorization or uncertain storage blocks the upstream
 * Saju provider call. Saju fetches the stored proof separately over its
 * dedicated authenticated private reader service.
 *
 * This does NOT mount Production Interpretation Authority, Saju HTTP or a
 * payment/credit/AI-cost collection route.
 */
export function createMyeongHaA4PreparedProofHandoffV1(
  input: Readonly<{
    issuer: MyeongHaA4PreparedProofIssuerPortV1;
    store: MyeongHaA4PreparedProofStorePortV1;
  }>,
): SajuOfficialAttemptPreparePortV1 {
  if (
    typeof input?.issuer?.prepareAndSign !== "function" ||
    typeof input?.store?.storePreparedProof !== "function"
  )
    throw TypeError(
      "Trusted prepared issuer and durable proof storage required",
    );
  return Object.freeze({
    async prepareBeforeSourceCall(
      request: Parameters<
        SajuOfficialAttemptPreparePortV1["prepareBeforeSourceCall"]
      >[0],
    ): Promise<boolean> {
      const proof = await input.issuer.prepareAndSign(request);
      if (proof === null) return false;
      if (
        proof.payload.executionAttemptId !== request.executionAttemptId ||
        proof.payload.readingId !== request.readingId ||
        proof.payload.subjectId !== request.subjectId
      )
        throw Error("Prepared A4 issuer returned a mismatched DB attempt");
      // Await immutable read-back and COMMIT before the paid Saju call.
      await input.store.storePreparedProof(proof);
      return true;
    },
  });
}
