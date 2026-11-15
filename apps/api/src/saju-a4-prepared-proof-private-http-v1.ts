import { createHash, timingSafeEqual } from "node:crypto";
import {
  createServer,
  type Server,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";

export const MYEONGHA_A4_PRIVATE_PROOF_PATH_V1 =
  "/api/internal/a4/prepared-attempts" as const;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SIGNATURE = /^[0-9a-f]{64}$/u;
const MAX_TTL = 120_000;
const MAX_CLOCK_SKEW = 10_000;
const PATH =
  /^\/api\/internal\/a4\/prepared-attempts\/([0-9a-f-]{36})\/proof$/u;

function record(raw: unknown): Record<string, unknown> | null {
  return raw !== null && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : null;
}
function exact(
  x: Record<string, unknown> | null,
  keys: readonly string[],
): boolean {
  return (
    x !== null &&
    Object.keys(x).length === keys.length &&
    keys.every((k) => Object.hasOwn(x, k))
  );
}
function isProof(
  raw: unknown,
  requestedId: string,
  now: number,
  issuer: string,
  audience: string,
  keyId: string,
): boolean {
  const proof = record(raw);
  const payload = record(proof?.payload);
  if (
    !exact(proof, ["payload", "signatureHex"]) ||
    !exact(payload, [
      "version",
      "issuer",
      "audience",
      "keyId",
      "issuedAtMs",
      "expiresAtMs",
      "executionAttemptId",
      "readingId",
      "subjectId",
    ])
  )
    return false;
  return (
    proof!.signatureHex !== null &&
    typeof proof!.signatureHex === "string" &&
    SIGNATURE.test(proof!.signatureHex) &&
    payload!.version === "myeongha-a4-prepared-attempt-proof-v1" &&
    payload!.issuer === issuer &&
    payload!.audience === audience &&
    payload!.keyId === keyId &&
    payload!.executionAttemptId === requestedId &&
    typeof payload!.readingId === "string" &&
    UUID.test(payload!.readingId) &&
    typeof payload!.subjectId === "string" &&
    UUID.test(payload!.subjectId) &&
    Number.isSafeInteger(payload!.issuedAtMs) &&
    Number.isSafeInteger(payload!.expiresAtMs) &&
    Number.isSafeInteger(now) &&
    (payload!.expiresAtMs as number) > (payload!.issuedAtMs as number) &&
    (payload!.expiresAtMs as number) - (payload!.issuedAtMs as number) <=
      MAX_TTL &&
    now >= (payload!.issuedAtMs as number) - MAX_CLOCK_SKEW &&
    now < (payload!.expiresAtMs as number)
  );
}
function send(response: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "private, no-store",
    pragma: "no-cache",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    vary: "Authorization",
  });
  response.end(json);
}
function isBearerAuthorized(
  req: IncomingMessage,
  secretDigest: Buffer,
): boolean {
  const header = req.headers.authorization;
  const match =
    typeof header === "string" ? /^Bearer ([^\s]+)$/u.exec(header) : null;
  if (!match?.[1]) return false;
  return timingSafeEqual(
    createHash("sha256").update(match[1], "utf8").digest(),
    secretDigest,
  );
}

export interface MyeongHaA4PrivateProofReadPortV1 {
  /** A server-owned immutable proof prepared ONLY after the governed DB grant. */
  loadPreparedProof(attemptId: string): Promise<unknown | null>;
}

/**
 * Separate unmounted server factory, not an Admin, public or Preview API route.
 * Requires a dedicated Saju->MyeongHa service Bearer and a trusted private
 * proof repository. HTTPS/mTLS private network termination and secret
 * injection are operational prerequisites; this Node server itself is HTTP.
 *
 * Its envelope checks are NOT HMAC authentication: the Saju verifier must
 * independently validate the entire signed proof and atomically claim once.
 */
export function createMyeongHaA4PreparedProofPrivateHttpServerV1(
  input: Readonly<{
    serviceBearer: string;
    trustedIssuer: string;
    expectedAudience: string;
    trustedKeyId: string;
    readPort: MyeongHaA4PrivateProofReadPortV1;
    nowMs: () => number;
  }>,
): Server {
  if (
    !input ||
    typeof input.serviceBearer !== "string" ||
    input.serviceBearer.length < 24 ||
    input.serviceBearer.length > 1024 ||
    /\s/u.test(input.serviceBearer) ||
    typeof input.readPort?.loadPreparedProof !== "function" ||
    typeof input.nowMs !== "function" ||
    ![input.trustedIssuer, input.expectedAudience, input.trustedKeyId].every(
      (x) => typeof x === "string" && /^[a-zA-Z0-9._:-]{3,128}$/u.test(x),
    )
  )
    throw new TypeError(
      "Private Saju A4 bearer and immutable trusted proof reader required",
    );

  const secretDigest = createHash("sha256")
    .update(input.serviceBearer)
    .digest();
  return createServer(
    { maxHeaderSize: 4096, requestTimeout: 5000 },
    async (req, res) => {
      // No CORS or browser-origin admission. The same route cannot be
      // discovered on any existing public Product/Reading/Admin listener.
      if (
        req.headers.origin !== undefined ||
        req.headers.cookie !== undefined ||
        !isBearerAuthorized(req, secretDigest)
      ) {
        req.resume();
        send(res, 401, { error: "A4_PRIVATE_AUTH_REQUIRED" });
        return;
      }
      if (req.method !== "GET") {
        req.resume();
        send(res, 405, { error: "A4_PRIVATE_READ_ONLY" });
        return;
      }
      const uri = req.url ?? "";
      const match = PATH.exec(uri);
      if (!match?.[1] || !UUID.test(match[1])) {
        req.resume();
        send(res, 404, { error: "A4_PROOF_NOT_FOUND" });
        return;
      }
      req.resume();
      try {
        const proof = await input.readPort.loadPreparedProof(match[1]);
        if (proof === null) {
          send(res, 404, { error: "A4_PROOF_NOT_FOUND" });
          return;
        }
        if (
          !isProof(
            proof,
            match[1],
            input.nowMs(),
            input.trustedIssuer,
            input.expectedAudience,
            input.trustedKeyId,
          ) ||
          Buffer.byteLength(JSON.stringify(proof), "utf8") > 4096
        ) {
          send(res, 503, { error: "A4_PROOF_AUTHORITY_UNAVAILABLE" });
          return;
        }
        send(res, 200, proof);
      } catch {
        send(res, 503, { error: "A4_PROOF_AUTHORITY_UNAVAILABLE" });
      }
    },
  );
}
