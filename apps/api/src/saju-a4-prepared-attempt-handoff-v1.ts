import { createHash, createHmac, randomUUID } from "node:crypto";

export const SAJU_A4_PREPARED_ATTEMPT_HANDOFF_VERSION_V1 =
  "myeongha-a4-prepared-attempt-handoff-v1" as const;
export const SAJU_A4_PREPARED_ATTEMPT_HANDOFF_ISSUER_V1 =
  "myeongha-official-reading" as const;
export const SAJU_A4_PREPARED_ATTEMPT_HANDOFF_AUDIENCE_V1 =
  "saju-a4-provider-capture" as const;
export const SAJU_A4_PREPARED_ATTEMPT_HANDOFF_DOMAIN_V1 =
  "myeongha/a4/prepared-attempt-handoff/v1\0" as const;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const KEY_ID = /^[A-Za-z0-9_.-]{1,64}$/u;
const MAX_REQUEST_BYTES = 16 * 1024;
const MAX_TTL_MS = 120_000;

export interface SajuA4PreparedAttemptHandoffPayloadV1 {
  readonly version: typeof SAJU_A4_PREPARED_ATTEMPT_HANDOFF_VERSION_V1;
  readonly issuer: typeof SAJU_A4_PREPARED_ATTEMPT_HANDOFF_ISSUER_V1;
  readonly audience: typeof SAJU_A4_PREPARED_ATTEMPT_HANDOFF_AUDIENCE_V1;
  readonly keyId: string;
  readonly executionAttemptId: string;
  readonly requestSha256Hex: string;
  readonly nonce: string;
  readonly issuedAtMs: number;
  readonly expiresAtMs: number;
}
export interface SajuA4PreparedAttemptHandoffV1 {
  readonly payload: SajuA4PreparedAttemptHandoffPayloadV1;
  readonly signatureHex: string;
}

/**
 * Call only AFTER the canonical DB's single-use prepare transaction has
 * committed and the exact Production issuance authorities have admitted the
 * operation. This function creates no authorization by itself.
 *
 * A signer's requestBody must be the exact UTF-8 JSON bytes sent to Saju, not
 * a reconstructed request object. No birth data, prompt, response, tokens or
 * credentials enter the proof; only a SHA-256 body digest is transmitted.
 */
export function signSajuA4PreparedAttemptHandoffV1(
  input: Readonly<{
    executionAttemptId: string;
    requestBody: string;
    keyId: string;
    keyBytes: Uint8Array;
    issuedAtMs: number;
    ttlMs?: number;
    nonce?: string;
  }>,
): SajuA4PreparedAttemptHandoffV1 {
  if (
    !input ||
    typeof input.executionAttemptId !== "string" ||
    !UUID.test(input.executionAttemptId) ||
    typeof input.requestBody !== "string" ||
    Buffer.byteLength(input.requestBody, "utf8") < 1 ||
    Buffer.byteLength(input.requestBody, "utf8") > MAX_REQUEST_BYTES ||
    typeof input.keyId !== "string" ||
    !KEY_ID.test(input.keyId) ||
    !(input.keyBytes instanceof Uint8Array) ||
    input.keyBytes.length < 32
  )
    throw new TypeError(
      "Dedicated prepared attempt identity, body and signing key required",
    );
  if (
    !Number.isSafeInteger(input.issuedAtMs) ||
    input.issuedAtMs < 1 ||
    !Number.isSafeInteger(input.ttlMs ?? 60_000) ||
    (input.ttlMs ?? 60_000) < 1 ||
    (input.ttlMs ?? 60_000) > MAX_TTL_MS ||
    !Number.isSafeInteger(input.issuedAtMs + (input.ttlMs ?? 60_000))
  )
    throw new TypeError("Bounded prepared attempt handoff lifetime required");
  try {
    const body: unknown = JSON.parse(input.requestBody);
    if (body === null || typeof body !== "object" || Array.isArray(body))
      throw Error("Not a JSON object");
  } catch {
    throw new TypeError("Prepared attempt must bind exact JSON request bytes");
  }
  const nonce = input.nonce ?? randomUUID();
  if (!UUID.test(nonce))
    throw new TypeError("Untrusted prepared attempt nonce");
  const payload: SajuA4PreparedAttemptHandoffPayloadV1 = Object.freeze({
    version: SAJU_A4_PREPARED_ATTEMPT_HANDOFF_VERSION_V1,
    issuer: SAJU_A4_PREPARED_ATTEMPT_HANDOFF_ISSUER_V1,
    audience: SAJU_A4_PREPARED_ATTEMPT_HANDOFF_AUDIENCE_V1,
    keyId: input.keyId,
    executionAttemptId: input.executionAttemptId.toLowerCase(),
    requestSha256Hex: createHash("sha256")
      .update(input.requestBody, "utf8")
      .digest("hex"),
    nonce: nonce.toLowerCase(),
    issuedAtMs: input.issuedAtMs,
    expiresAtMs: input.issuedAtMs + (input.ttlMs ?? 60_000),
  });
  const signatureHex = createHmac("sha256", Uint8Array.from(input.keyBytes))
    .update(SAJU_A4_PREPARED_ATTEMPT_HANDOFF_DOMAIN_V1, "utf8")
    .update(JSON.stringify(payload), "utf8")
    .digest("hex");
  return Object.freeze({ payload, signatureHex });
}
