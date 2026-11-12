import { createHmac } from "node:crypto";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMyeongHaA4PreparedProofPrivateHttpServerV1,
  MYEONGHA_A4_PRIVATE_PROOF_PATH_V1,
} from "./saju-a4-prepared-proof-private-http-v1.js";

const UUID = "123e4567-e89b-42d3-a456-426614174002";
const OTHER = "123e4567-e89b-42d3-a456-426614174003";
const NOW = Date.parse("2026-11-11T01:00:00.000Z");
const BEARER = "dedicated-private-proof-service-bearer-2026";
const KEY = new Uint8Array(32).fill(31);
const PAYLOAD = {
  version: "myeongha-a4-prepared-attempt-proof-v1",
  issuer: "myeongha-production",
  audience: "saju-production-a4",
  keyId: "mh-a4-prepared-v1",
  issuedAtMs: NOW - 1000,
  expiresAtMs: NOW + 90000,
  executionAttemptId: UUID,
  readingId: "123e4567-e89b-42d3-a456-426614174001",
  subjectId: "123e4567-e89b-42d3-a456-426614174000",
};
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  const o = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(o)
      .sort()
      .map((k) => [k, canonical(o[k])]),
  );
}
function signed(payload = PAYLOAD) {
  return {
    payload,
    signatureHex: createHmac("sha256", KEY)
      .update("myeongha/a4/prepared-attempt-proof/v1\0")
      .update(JSON.stringify(canonical(payload)))
      .digest("hex"),
  };
}

const running: Server[] = [];
afterEach(async () => {
  await Promise.all(
    running.splice(0).map(
      async (s) =>
        new Promise<void>((resolve) => {
          s.closeAllConnections();
          s.close(() => resolve());
        }),
    ),
  );
});

async function fixture(options: { proof?: unknown; error?: boolean } = {}) {
  const calls: string[] = [];
  const loadPreparedProof = vi.fn(
    async (id: string): Promise<unknown | null> => {
      calls.push(id);
      if (options.error) throw Error("trusted private proof store unavailable");
      return options.proof === undefined ? signed() : options.proof;
    },
  );
  const server = createMyeongHaA4PreparedProofPrivateHttpServerV1({
    serviceBearer: BEARER,
    trustedIssuer: "myeongha-production",
    expectedAudience: "saju-production-a4",
    trustedKeyId: "mh-a4-prepared-v1",
    nowMs: () => NOW,
    readPort: { loadPreparedProof },
  });
  running.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const base = "http://127.0.0.1:" + (server.address() as AddressInfo).port;
  const address =
    base + MYEONGHA_A4_PRIVATE_PROOF_PATH_V1 + "/" + UUID + "/proof";
  return { calls, address, base, loadPreparedProof };
}
const auth = { authorization: "Bearer " + BEARER };

describe("MyeongHa A4 isolated private signed-proof HTTPS-terminable server", () => {
  it("allows only a separate authenticated service to receive an exact time-bounded signed proof", async () => {
    const x = await fixture();
    const r = await fetch(x.address, { headers: auth });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual(signed());
    expect(r.headers.get("cache-control")).toContain("no-store");
    expect(r.headers.get("vary")).toBe("Authorization");
    expect(r.headers.get("access-control-allow-origin")).toBeNull();
    expect(x.calls).toEqual([UUID]);
  });

  it("refuses missing/wrong bearer, browser Origin and Cookie before any proof store lookup", async () => {
    const x = await fixture();
    const cases: HeadersInit[] = [
      {},
      { authorization: "Bearer wrong" },
      { ...auth, origin: "https://untrusted.browser.test" },
      { ...auth, cookie: "session=secret" },
    ];
    for (const headers of cases)
      expect((await fetch(x.address, { headers })).status).toBe(401);
    expect(x.calls).toHaveLength(0);
  });

  it("never reads proof store for wrong method, query, identifier or URL", async () => {
    const x = await fixture();
    expect(
      (await fetch(x.address, { method: "POST", headers: auth })).status,
    ).toBe(405);
    for (const url of [
      x.address + "?next=private",
      x.base + MYEONGHA_A4_PRIVATE_PROOF_PATH_V1 + "/" + OTHER + "/different",
      x.base + "/api/admin/users",
      x.base + MYEONGHA_A4_PRIVATE_PROOF_PATH_V1 + "/not-a-uuid/proof",
    ]) {
      expect((await fetch(url, { headers: auth })).status).toBe(404);
    }
    expect(x.calls).toHaveLength(0);
  });

  it("returns 404 only for absent proof, never a fake zero-cost or admitted response", async () => {
    const x = await fixture({ proof: null });
    const r = await fetch(x.address, { headers: auth });
    expect(r.status).toBe(404);
    expect(JSON.stringify(await r.json())).not.toContain("admitted");
  });

  it("returns 503 without disclosing proof content for stale/mismatched/untrusted source data", async () => {
    for (const proof of [
      signed({ ...PAYLOAD, executionAttemptId: OTHER }),
      signed({ ...PAYLOAD, expiresAtMs: NOW }),
      signed({ ...PAYLOAD, audience: "browser" }),
      { ...signed(), username: "pii" },
      { ...signed(), signatureHex: "not-a-signature" },
    ]) {
      const x = await fixture({ proof });
      const r = await fetch(x.address, { headers: auth });
      expect(r.status).toBe(503);
      expect(JSON.stringify(await r.json())).not.toContain("signatureHex");
    }
  });

  it("keeps trusted repository errors in an unavailable state without leaking secrets", async () => {
    const x = await fixture({ error: true });
    const r = await fetch(x.address, { headers: auth });
    expect(r.status).toBe(503);
    expect(JSON.stringify(await r.json())).not.toContain(BEARER);
  });

  it("will not construct without a dedicated service credential or trusted private repository", () => {
    expect(() =>
      createMyeongHaA4PreparedProofPrivateHttpServerV1({
        serviceBearer: "short",
        trustedIssuer: "myeongha-production",
        expectedAudience: "saju-production-a4",
        trustedKeyId: "mh-a4-prepared-v1",
        nowMs: () => NOW,
        readPort: { loadPreparedProof: async () => signed() },
      }),
    ).toThrow();
  });
});
