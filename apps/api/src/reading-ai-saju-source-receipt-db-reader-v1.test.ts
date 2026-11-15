import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { PostgresSubjectPoolV1 } from "./postgres-subject-execution.js";
import { createSajuSignedProviderCallSourceAuthorityV1 } from "./reading-ai-saju-signed-call-source-v1.js";
import {
  createPostgresSajuSourceReceiptLoaderV1,
  SAJU_A4_SOURCE_RECEIPT_READER_ROLE_V1,
} from "./reading-ai-saju-source-receipt-db-reader-v1.js";

const CALL = "123e4567-e89b-42d3-a456-426614174003";
const ATTEMPT = "123e4567-e89b-42d3-a456-426614174002";
const REF = "123e4567-e89b-42d3-a456-426614174004";
const TIME = "2026-11-09T10:00:00.000Z";
const KEY = new Uint8Array(32).fill(73);
const OBS = {
  callId: CALL,
  requestId: "saju_server_private",
  providerKey: "openai" as const,
  modelKey: "gpt-5.6",
  source: "provider_response_usage" as const,
  outcome: "response_received" as const,
  observedAt: TIME,
  usage: {
    inputTokens: 120,
    outputTokens: 5,
    cachedInputTokens: null,
    reasoningTokens: null,
  },
};
const PAYLOAD = {
  version: "saju-provider-call-source-proof-v1",
  issuer: "saju-production",
  audience: "myeongha-admin-a4",
  keyId: "source-key-1",
  issuedAtMs: Date.parse(TIME) + 1000,
  link: {
    version: "saju-source-provider-call-link-v1",
    externalRequestRef: "saju_source_" + REF,
    executionAttemptId: ATTEMPT,
    observation: OBS,
  },
};
function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical);
  if (v === null || typeof v !== "object") return v;
  const o = v as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(o)
      .sort()
      .map((k) => [k, canonical(o[k])]),
  );
}
const PROOF = {
  payload: PAYLOAD,
  signatureHex: createHmac("sha256", KEY)
    .update("myeongha/a4/saju-provider-call-proof/v1\0")
    .update(JSON.stringify(canonical(PAYLOAD)))
    .digest("hex"),
};
const SOURCE_REQUEST = {
  sajuRequestId: OBS.requestId,
  callId: CALL,
  modelKey: OBS.modelKey,
  observedAt: OBS.observedAt,
  observation: OBS,
};

function fixture(
  options: {
    principal?: string;
    rows?: readonly unknown[];
    failQuery?: boolean;
    failRollback?: boolean;
  } = {},
) {
  const queries: Array<{ sql: string; values?: readonly unknown[] }> = [];
  const released: unknown[] = [];
  const pool: PostgresSubjectPoolV1 = {
    async connect() {
      return {
        async query<Row>(sql: string, values?: readonly unknown[]) {
          queries.push(values === undefined ? { sql } : { sql, values });
          if (sql.includes("current_user")) {
            return {
              rows: [
                {
                  currentUser:
                    options.principal ?? SAJU_A4_SOURCE_RECEIPT_READER_ROLE_V1,
                },
              ] as Row[],
            };
          }
          if (
            sql.includes(
              "FROM saju_source_ops.a4_provider_call_signed_receipts_v1",
            )
          ) {
            if (options.failQuery) throw Error("source DB unavailable");
            return {
              rows: (options.rows ?? [
                { proofJson: JSON.stringify(PROOF) },
              ]) as Row[],
            };
          }
          if (sql === "ROLLBACK" && options.failRollback)
            throw Error("rollback unavailable");
          return { rows: [] as Row[] };
        },
        release(error?: unknown) {
          released.push(error);
        },
      };
    },
  };
  return {
    loader: createPostgresSajuSourceReceiptLoaderV1({ pool }),
    queries,
    released,
  };
}

describe("A4 authenticated Saju source receipt DB reader (HOLD)", () => {
  it("loads only one committed call ID and passes its actual signed proof to the independent authority", async () => {
    const x = fixture();
    const authority = createSajuSignedProviderCallSourceAuthorityV1({
      trustedIssuer: "saju-production",
      expectedAudience: "myeongha-admin-a4",
      trustedKeyId: "source-key-1",
      keyBytes: KEY,
      nowMs: () => Date.parse(TIME) + 2500,
      loadSignedCallById: x.loader.loadSignedCallById,
    });
    await expect(authority.verifyProviderCall(SOURCE_REQUEST)).resolves.toEqual(
      {
        sajuRequestId: OBS.requestId,
        callId: CALL,
        modelKey: OBS.modelKey,
        observedAt: TIME,
        externalRequestRef: "saju_source_" + REF,
        executionAttemptId: ATTEMPT,
      },
    );
    expect(x.queries.map((q) => q.sql)).toEqual([
      "BEGIN READ ONLY",
      'SELECT current_user::text AS "currentUser"',
      expect.stringContaining(
        "FROM saju_source_ops.a4_provider_call_signed_receipts_v1",
      ),
      "COMMIT",
    ]);
    expect(x.queries[2]?.sql).toContain("WHERE call_id = $1::uuid");
    expect(x.queries[2]?.values).toEqual([CALL]);
    expect(x.released).toHaveLength(1);
  });
  it("rejects an unrelated DB role before reading the source receipt", async () => {
    for (const principal of [
      "postgres",
      "service_role",
      "myeongha_admin_reader",
      "myeongha_reading_ai_cost_binding_reader_v1",
    ]) {
      const x = fixture({ principal });
      await expect(x.loader.loadSignedCallById(CALL)).rejects.toThrow(
        "Dedicated Saju source receipt reader principal required",
      );
      expect(x.queries.map((q) => q.sql)).toEqual([
        "BEGIN READ ONLY",
        'SELECT current_user::text AS "currentUser"',
        "ROLLBACK",
      ]);
    }
  });
  it("never opens DB for invalid or browser-controlled call IDs", async () => {
    const x = fixture();
    for (const callId of [
      "",
      "arbitrary",
      "abc\n",
      "123e4567-e89b-42d3-a456-426614174003;DROP TABLE x",
    ])
      await expect(x.loader.loadSignedCallById(callId)).resolves.toBeNull();
    expect(x.queries).toHaveLength(0);
    expect(x.released).toHaveLength(0);
  });
  it("holds missing, duplicate, mutated and oversized evidence without claiming source authority", async () => {
    const tampered = {
      ...PROOF,
      payload: {
        ...PAYLOAD,
        link: { ...PAYLOAD.link, observation: { ...OBS, callId: ATTEMPT } },
      },
    };
    for (const rows of [
      [],
      [
        { proofJson: JSON.stringify(PROOF) },
        { proofJson: JSON.stringify(PROOF) },
      ],
      [{ proofJson: JSON.stringify(tampered) }],
      [{ proofJson: JSON.stringify({ ...PROOF, privateBirth: "x" }) }],
      [{ proofJson: "{bad" }],
      [{ proofJson: "x".repeat(9000) }],
    ]) {
      const x = fixture({ rows });
      await expect(x.loader.loadSignedCallById(CALL)).resolves.toBeNull();
    }
  });
  it("rolls back and releases on source DB faults and uncertain rollback state", async () => {
    const x = fixture({ failQuery: true });
    await expect(x.loader.loadSignedCallById(CALL)).rejects.toThrow(
      "source DB unavailable",
    );
    expect(x.queries.at(-1)?.sql).toBe("ROLLBACK");
    expect(x.released).toHaveLength(1);
    const failed = fixture({ failQuery: true, failRollback: true });
    await expect(failed.loader.loadSignedCallById(CALL)).rejects.toThrow(
      "rollback failed",
    );
    expect(failed.released).toHaveLength(1);
    expect(failed.released[0]).toBeInstanceOf(Error);
  });
});
