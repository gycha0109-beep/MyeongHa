import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  createMyeongHaA4SignedPreparedAttemptIssuerV1,
  MYEONGHA_A4_PREPARED_ATTEMPT_PROOF_VERSION_V1,
} from "./saju-a4-signed-prepared-attempt-issuer-v1.js";

const SUBJECT = "123e4567-e89b-42d3-a456-426614174000";
const READING = "123e4567-e89b-42d3-a456-426614174001";
const ATTEMPT = "123e4567-e89b-42d3-a456-426614174002";
const SESSION = "123e4567-e89b-42d3-a456-426614174003";
const REVISION = "123e4567-e89b-42d3-a456-426614174004";
const KEY = new Uint8Array(32).fill(31);
const NOW = Date.parse("2026-11-11T00:30:00.000Z");
const request = {
  subjectId: SUBJECT,
  readingId: READING,
  executionAttemptId: ATTEMPT,
  readingSessionId: SESSION,
  sourceBirthRevisionId: REVISION,
};
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  const r = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(r)
      .sort()
      .map((k) => [k, canonical(r[k])]),
  );
}
function fixture(allowed: boolean) {
  const admitted = new Set<string>();
  const prepareBeforeSourceCall = vi.fn(async (r: typeof request) => {
    if (!allowed || admitted.has(r.executionAttemptId)) return false;
    admitted.add(r.executionAttemptId);
    return true;
  });
  const issuer = createMyeongHaA4SignedPreparedAttemptIssuerV1({
    preparePort: { prepareBeforeSourceCall },
    issuer: "myeongha-production",
    audience: "saju-production-a4",
    keyId: "mh-a4-prepared-v1",
    keyBytes: KEY,
    nowMs: () => NOW,
    ttlMs: 90_000,
  });
  return { issuer, prepareBeforeSourceCall };
}

describe("MyeongHa A4 governed DB prepared attempt signer (server only)", () => {
  it("signs only after exact one-time current-purchase DB prepare is admitted", async () => {
    const x = fixture(true);
    const proof = await x.issuer.prepareAndSign(request);
    expect(proof?.payload).toEqual({
      version: MYEONGHA_A4_PREPARED_ATTEMPT_PROOF_VERSION_V1,
      issuer: "myeongha-production",
      audience: "saju-production-a4",
      keyId: "mh-a4-prepared-v1",
      issuedAtMs: NOW,
      expiresAtMs: NOW + 90000,
      executionAttemptId: ATTEMPT,
      readingId: READING,
      subjectId: SUBJECT,
    });
    expect(proof?.signatureHex).toMatch(/^[a-f0-9]{64}$/u);
    expect(proof?.signatureHex).toBe(
      createHmac("sha256", KEY)
        .update("myeongha/a4/prepared-attempt-proof/v1\0")
        .update(JSON.stringify(canonical(proof?.payload)))
        .digest("hex"),
    );
    expect(x.prepareBeforeSourceCall).toHaveBeenCalledWith(request);
  });

  it("cannot issue a second proof after the governed DB attempt is replayed", async () => {
    const x = fixture(true);
    expect(await x.issuer.prepareAndSign(request)).not.toBeNull();
    expect(await x.issuer.prepareAndSign(request)).toBeNull();
    expect(x.prepareBeforeSourceCall).toHaveBeenCalledTimes(2);
  });

  it("denies an unentitled or invalid attempt without issuing signed credentials", async () => {
    const x = fixture(false);
    expect(await x.issuer.prepareAndSign(request)).toBeNull();
    const bad = fixture(true);
    expect(
      await bad.issuer.prepareAndSign({ ...request, readingId: "browser-id" }),
    ).toBeNull();
    expect(bad.prepareBeforeSourceCall).not.toHaveBeenCalled();
  });

  it("does not swallow governed DB errors or mint a token after failed admission", async () => {
    const issuer = createMyeongHaA4SignedPreparedAttemptIssuerV1({
      preparePort: {
        prepareBeforeSourceCall: async () => {
          throw Error("DB failed");
        },
      },
      issuer: "myeongha-production",
      audience: "saju-production-a4",
      keyId: "mh-a4-prepared-v1",
      keyBytes: KEY,
      nowMs: () => NOW,
    });
    await expect(issuer.prepareAndSign(request)).rejects.toThrow("DB failed");
  });

  it("rejects missing signing keys and invalid TTL before starting DB prepare", () => {
    const x = fixture(true);
    expect(() =>
      createMyeongHaA4SignedPreparedAttemptIssuerV1({
        preparePort: { prepareBeforeSourceCall: x.prepareBeforeSourceCall },
        issuer: "myeongha-production",
        audience: "saju-production-a4",
        keyId: "mh-a4-prepared-v1",
        keyBytes: new Uint8Array(3),
        nowMs: () => NOW,
        ttlMs: 90_000,
      }),
    ).toThrow("Trusted governed");
    expect(() =>
      createMyeongHaA4SignedPreparedAttemptIssuerV1({
        preparePort: { prepareBeforeSourceCall: x.prepareBeforeSourceCall },
        issuer: "myeongha-production",
        audience: "saju-production-a4",
        keyId: "mh-a4-prepared-v1",
        keyBytes: KEY,
        nowMs: () => NOW,
        ttlMs: 999_999,
      }),
    ).toThrow("Trusted governed");
    expect(x.prepareBeforeSourceCall).not.toHaveBeenCalled();
  });
});
