import { createHmac } from "node:crypto";
import type { SajuOfficialAttemptPreparePortV1 } from "./saju-production-reading-execution.js";

export const MYEONGHA_A4_PREPARED_ATTEMPT_PROOF_VERSION_V1 =
  "myeongha-a4-prepared-attempt-proof-v1" as const;
const DOMAIN = "myeongha/a4/prepared-attempt-proof/v1\0";
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const IDENT = /^[a-zA-Z0-9._:-]{3,128}$/u;
const MAX_TTL_MS = 120_000;

export interface MyeongHaA4SignedPreparedAttemptProofV1 {
  readonly payload: Readonly<{
    version: typeof MYEONGHA_A4_PREPARED_ATTEMPT_PROOF_VERSION_V1;
    issuer: string;
    audience: string;
    keyId: string;
    issuedAtMs: number;
    expiresAtMs: number;
    executionAttemptId: string;
    readingId: string;
    subjectId: string;
  }>;
  readonly signatureHex: string;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value === null || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .map((k) => [k, canonical(record[k])]),
  );
}

/**
 * Explicit private issuer. The existing governed DB attemptPrepare MUST have
 * allocated a fresh running attempt and atomically checked its exact current
 * entitlement before signing. A replay returns false and cannot mint a new
 * token. This is NOT Production Interpretation Authority and does NOT issue
 * ProductReadingResponse; no public HTTP route or deployment is installed.
 *
 * The signed proof is for an authenticated Saju-only private loader, never
 * browser storage, request JSON, logs, or admin UI.
 */
export function createMyeongHaA4SignedPreparedAttemptIssuerV1(
  input: Readonly<{
    preparePort: SajuOfficialAttemptPreparePortV1;
    issuer: string;
    audience: string;
    keyId: string;
    keyBytes: Uint8Array;
    nowMs: () => number;
    ttlMs?: number;
  }>,
): Readonly<{
  prepareAndSign(
    request: Parameters<
      SajuOfficialAttemptPreparePortV1["prepareBeforeSourceCall"]
    >[0],
  ): Promise<MyeongHaA4SignedPreparedAttemptProofV1 | null>;
}> {
  const ttl = input?.ttlMs ?? 90_000;
  if (
    !input ||
    typeof input.preparePort?.prepareBeforeSourceCall !== "function" ||
    ![input.issuer, input.audience, input.keyId].every(
      (v) => typeof v === "string" && IDENT.test(v),
    ) ||
    !(input.keyBytes instanceof Uint8Array) ||
    input.keyBytes.byteLength < 32 ||
    typeof input.nowMs !== "function" ||
    !Number.isSafeInteger(ttl) ||
    ttl < 1 ||
    ttl > MAX_TTL_MS
  )
    throw new TypeError(
      "Trusted governed MyeongHa attempt allocator and server signing key required",
    );

  return Object.freeze({
    async prepareAndSign(
      request,
    ): Promise<MyeongHaA4SignedPreparedAttemptProofV1 | null> {
      if (
        !request ||
        ![
          request.subjectId,
          request.readingId,
          request.readingSessionId,
          request.executionAttemptId,
          request.sourceBirthRevisionId,
        ].every((v) => typeof v === "string" && UUID.test(v))
      )
        return null;

      // No production API, provider call or HMAC token is issued if the
      // governed one-time DB allocation/current-purchase admission denies.
      if ((await input.preparePort.prepareBeforeSourceCall(request)) !== true)
        return null;

      const issuedAtMs = input.nowMs();
      if (
        !Number.isSafeInteger(issuedAtMs) ||
        issuedAtMs < 0 ||
        !Number.isSafeInteger(issuedAtMs + ttl)
      )
        throw new Error("Invalid MyeongHa A4 post-prepare issuance clock");

      const payload = Object.freeze({
        version: MYEONGHA_A4_PREPARED_ATTEMPT_PROOF_VERSION_V1,
        issuer: input.issuer,
        audience: input.audience,
        keyId: input.keyId,
        issuedAtMs,
        expiresAtMs: issuedAtMs + ttl,
        executionAttemptId: request.executionAttemptId,
        readingId: request.readingId,
        subjectId: request.subjectId,
      });
      return Object.freeze({
        payload,
        signatureHex: createHmac("sha256", input.keyBytes)
          .update(DOMAIN)
          .update(JSON.stringify(canonical(payload)))
          .digest("hex"),
      });
    },
  });
}
