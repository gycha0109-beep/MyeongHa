import { describe, expect, it, vi } from "vitest";
import { createMyeongHaA4SignedPreparedAttemptIssuerV1 } from "./saju-a4-signed-prepared-attempt-issuer-v1.js";
import { createMyeongHaA4PreparedProofHandoffV1 } from "./saju-a4-prepared-proof-handoff-v1.js";

const REQUEST = {
  subjectId: "123e4567-e89b-42d3-a456-426614174000",
  readingId: "123e4567-e89b-42d3-a456-426614174001",
  executionAttemptId: "123e4567-e89b-42d3-a456-426614174002",
  readingSessionId: "123e4567-e89b-42d3-a456-426614174003",
  sourceBirthRevisionId: "123e4567-e89b-42d3-a456-426614174004",
};

function fixture(allowed = true, persist = true) {
  const log: string[] = [];
  const prepareBeforeSourceCall = vi.fn(async () => {
    log.push("governed DB prepare");
    return allowed;
  });
  const issuer = createMyeongHaA4SignedPreparedAttemptIssuerV1({
    preparePort: { prepareBeforeSourceCall },
    issuer: "myeongha-production",
    audience: "saju-production-a4",
    keyId: "mh-a4-prepared-v1",
    keyBytes: new Uint8Array(32).fill(31),
    nowMs: () => Date.parse("2026-11-11T01:00:00.000Z"),
  });
  const storePreparedProof = vi.fn(async () => {
    log.push("immutable source proof COMMIT");
    if (!persist) throw Error("proof persistence failed");
  });
  const wrapper = createMyeongHaA4PreparedProofHandoffV1({
    issuer,
    store: { storePreparedProof },
  });
  return { wrapper, log, storePreparedProof, prepareBeforeSourceCall };
}
describe("A4 official attempt: DB prepare => signed token => durable store before Saju transport", () => {
  it("returns true only after the exactly matching prepared signed proof is durably acknowledged", async () => {
    const x = fixture();
    expect(await x.wrapper.prepareBeforeSourceCall(REQUEST)).toBe(true);
    expect(x.log).toEqual([
      "governed DB prepare",
      "immutable source proof COMMIT",
    ]);
    expect(x.prepareBeforeSourceCall).toHaveBeenCalledOnce();
    expect(x.storePreparedProof.mock.calls).toHaveLength(1);
  });
  it("never stores or sends a proof if the canonical DB admission denies", async () => {
    const x = fixture(false);
    expect(await x.wrapper.prepareBeforeSourceCall(REQUEST)).toBe(false);
    expect(x.log).toEqual(["governed DB prepare"]);
    expect(x.storePreparedProof).not.toHaveBeenCalled();
  });
  it("does not authorize a Saju provider call if proof persistence was not committed", async () => {
    const x = fixture(true, false);
    await expect(x.wrapper.prepareBeforeSourceCall(REQUEST)).rejects.toThrow(
      "proof persistence failed",
    );
    expect(x.log).toEqual([
      "governed DB prepare",
      "immutable source proof COMMIT",
    ]);
  });
  it("does not accept signer mismatch or untrusted replacements", async () => {
    const signing = fixture();
    const good = signing.storePreparedProof;
    expect(() =>
      createMyeongHaA4PreparedProofHandoffV1({
        issuer: {
          prepareAndSign: async () => ({
            payload: {
              version: "myeongha-a4-prepared-attempt-proof-v1",
              issuer: "myeongha-production",
              audience: "saju-production-a4",
              keyId: "mh-a4-prepared-v1",
              issuedAtMs: 1,
              expiresAtMs: 2,
              executionAttemptId: "123e4567-e89b-42d3-a456-426614174003",
              readingId: REQUEST.readingId,
              subjectId: REQUEST.subjectId,
            },
            signatureHex: "a".repeat(64),
          }),
        },
        store: { storePreparedProof: good },
      }),
    ).not.toThrow();
    const fake = createMyeongHaA4PreparedProofHandoffV1({
      issuer: {
        prepareAndSign: async () => ({
          payload: {
            version: "myeongha-a4-prepared-attempt-proof-v1",
            issuer: "myeongha-production",
            audience: "saju-production-a4",
            keyId: "mh-a4-prepared-v1",
            issuedAtMs: 1,
            expiresAtMs: 2,
            executionAttemptId: "123e4567-e89b-42d3-a456-426614174003",
            readingId: REQUEST.readingId,
            subjectId: REQUEST.subjectId,
          },
          signatureHex: "a".repeat(64),
        }),
      },
      store: { storePreparedProof: good },
    });
    await expect(fake.prepareBeforeSourceCall(REQUEST)).rejects.toThrow(
      "mismatched DB attempt",
    );
    expect(good).not.toHaveBeenCalled();
  });
});
