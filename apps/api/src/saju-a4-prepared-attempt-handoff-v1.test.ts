import { createHash, createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  signSajuA4PreparedAttemptHandoffV1,
  SAJU_A4_PREPARED_ATTEMPT_HANDOFF_DOMAIN_V1,
} from "./saju-a4-prepared-attempt-handoff-v1.js";

const ATTEMPT = "123e4567-e89b-42d3-a456-426614174002";
const NONCE = "123e4567-e89b-42d3-a456-426614174003";
const BODY = '{"birth":{"date":"1990-01-01"},"reading":{"text":"test"}}';
const KEY = new Uint8Array(32).fill(77);
const NOW = 1_793_000_000_000;
const base = {
  executionAttemptId: ATTEMPT,
  requestBody: BODY,
  keyId: "a4-admission-key-20261110",
  keyBytes: KEY,
  issuedAtMs: NOW,
  nonce: NONCE,
};

describe("MyeongHa A4 official prepared attempt transport attestation (OFFLINE)", () => {
  it("signs only the attempt ID, nonce, exact request digest and bounded lifetime", () => {
    const proof = signSajuA4PreparedAttemptHandoffV1(base);
    expect(proof.payload).toEqual({
      version: "myeongha-a4-prepared-attempt-handoff-v1",
      issuer: "myeongha-official-reading",
      audience: "saju-a4-provider-capture",
      keyId: base.keyId,
      executionAttemptId: ATTEMPT,
      requestSha256Hex: createHash("sha256").update(BODY).digest("hex"),
      nonce: NONCE,
      issuedAtMs: NOW,
      expiresAtMs: NOW + 60_000,
    });
    expect(proof.signatureHex).toBe(
      createHmac("sha256", KEY)
        .update(SAJU_A4_PREPARED_ATTEMPT_HANDOFF_DOMAIN_V1)
        .update(JSON.stringify(proof.payload))
        .digest("hex"),
    );
    expect(JSON.stringify(proof)).not.toContain("1990-01-01");
    expect(JSON.stringify(proof)).not.toContain("test");
  });

  it("binds the exact original bytes and cannot be reused for another request body", () => {
    const original = signSajuA4PreparedAttemptHandoffV1(base);
    const changed = signSajuA4PreparedAttemptHandoffV1({
      ...base,
      requestBody: BODY.replace("1990-01-01", "1990-01-02"),
    });
    expect(original.payload.requestSha256Hex).not.toBe(
      changed.payload.requestSha256Hex,
    );
    expect(original.signatureHex).not.toBe(changed.signatureHex);
  });

  it("rejects untrusted attempt identities and body/secret before signing", () => {
    for (const invalid of [
      { ...base, executionAttemptId: "caller-controlled-id" },
      { ...base, requestBody: "{invalid" },
      { ...base, requestBody: JSON.stringify("text") },
      { ...base, requestBody: "{}" + " ".repeat(17_000) },
      { ...base, keyId: "whitespace key" },
      { ...base, keyBytes: new Uint8Array(5) },
      { ...base, nonce: "invalid" },
    ]) {
      expect(() => signSajuA4PreparedAttemptHandoffV1(invalid)).toThrow();
    }
  });

  it("rejects unbounded or invalid token expiry and does not export raw content", () => {
    for (const ttlMs of [0, -1, 120_001, NaN, Infinity, 0.1]) {
      expect(() =>
        signSajuA4PreparedAttemptHandoffV1({ ...base, ttlMs }),
      ).toThrow();
    }
    expect(
      signSajuA4PreparedAttemptHandoffV1({ ...base, ttlMs: 120_000 }).payload
        .expiresAtMs,
    ).toBe(NOW + 120_000);
  });
});
