import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { PostgresSubjectPoolV1 } from "./postgres-subject-execution.js";
import { createSajuA4AttemptBatchReplayV1 } from "./reading-ai-saju-attempt-batch-replay-v1.js";

const SUBJECT = "123e4567-e89b-42d3-a456-426614174000";
const READING = "123e4567-e89b-42d3-a456-426614174001";
const ATTEMPT = "123e4567-e89b-42d3-a456-426614174002";
const REF = "saju_source_123e4567-e89b-42d3-a456-426614174004";
const CALLS = [
  "123e4567-e89b-42d3-a456-426614174005",
  "123e4567-e89b-42d3-a456-426614174006",
] as const;
const KEY = new Uint8Array(32).fill(91);
const NOW = Date.parse("2026-11-11T02:00:00.000Z");
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value === null || typeof value !== "object") return value;
  const o = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(o)
      .sort()
      .map((k) => [k, canonical(o[k])]),
  );
}
function proof(callId: string, attemptId: string = ATTEMPT, valid = true) {
  const payload = {
    version: "saju-provider-call-source-proof-v1",
    issuer: "saju-production",
    audience: "myeongha-admin-a4",
    keyId: "saju-source-key-v1",
    issuedAtMs: NOW - 1000,
    link: {
      version: "saju-source-provider-call-link-v1",
      externalRequestRef: REF,
      executionAttemptId: attemptId,
      observation: {
        callId,
        requestId: "saju_request_" + callId.slice(-12),
        providerKey: "openai",
        modelKey: "gpt-5.6",
        source: "provider_response_usage",
        outcome: "response_received",
        observedAt: new Date(NOW - 2000).toISOString(),
        usage: {
          inputTokens: 100,
          outputTokens: 20,
          cachedInputTokens: null,
          reasoningTokens: null,
        },
      },
    },
  };
  return {
    payload,
    signatureHex: valid
      ? createHmac("sha256", KEY)
          .update("myeongha/a4/saju-provider-call-proof/v1\0")
          .update(JSON.stringify(canonical(payload)))
          .digest("hex")
      : "0".repeat(64),
  };
}

function fixture(
  opts: {
    calls?: readonly string[];
    listed?: readonly { callId: string; proofJson: string }[];
    invalidSignedCall?: string;
    sourceRole?: string;
    failSecondWrite?: boolean;
    missingIndividual?: string;
    stored?: Set<string>;
    readinessOverrides?: Partial<
      Record<"source" | "attempt" | "writer", Record<string, unknown>>
    >;
  } = {},
) {
  const stored = opts.stored ?? new Set<string>();
  const callList = opts.calls ?? CALLS;
  const rows =
    opts.listed ??
    callList.map((callId) => ({
      callId,
      proofJson: JSON.stringify(proof(callId)),
    }));
  const trace: string[] = [];
  const pools = {} as Record<
    "source" | "attempt" | "writer",
    PostgresSubjectPoolV1
  >;
  for (const type of ["source", "attempt", "writer"] as const) {
    pools[type] = {
      async connect() {
        trace.push("connect:" + type);
        return {
          async query<Row>(sql: string, args: readonly unknown[] = []) {
            trace.push(type + ":" + sql.split("\n")[0]);
            let response: unknown[] = [];
            if (sql.startsWith("WITH objects AS")) {
              const privileges =
                type === "source"
                  ? {
                      objectsExist: true,
                      callIdRead: true,
                      proofRead: true,
                      canInsert: false,
                      canUpdate: false,
                      canDelete: false,
                      canTruncate: false,
                      canReadCoverage: false,
                    }
                  : type === "attempt"
                    ? {
                        objectsExist: true,
                        idRead: true,
                        readingRead: true,
                        subjectRead: true,
                        refRead: true,
                        stateRead: true,
                        canInsert: false,
                        canUpdate: false,
                        canDelete: false,
                        canTruncate: false,
                      }
                    : {
                        objectsExist: true,
                        canExecute: true,
                        canReadLedger: false,
                        canInsert: false,
                        canUpdate: false,
                        canDelete: false,
                        canTruncate: false,
                      };
              response = [
                {
                  currentUser:
                    type === "source"
                      ? (opts.sourceRole ??
                        "saju_a4_provider_receipt_reader_v1")
                      : type === "attempt"
                        ? "myeongha_reading_ai_cost_binding_reader_v1"
                        : "myeongha_reading_ai_cost_writer_v1",
                  ...privileges,
                  ...opts.readinessOverrides?.[type],
                },
              ];
            } else if (sql.includes("current_user::text")) {
              response = [
                {
                  currentUser:
                    type === "source"
                      ? (opts.sourceRole ??
                        "saju_a4_provider_receipt_reader_v1")
                      : type === "attempt"
                        ? "myeongha_reading_ai_cost_binding_reader_v1"
                        : "myeongha_reading_ai_cost_writer_v1",
                },
              ];
            } else if (
              type === "source" &&
              sql.includes("ORDER BY call_id LIMIT 501")
            ) {
              response = [...rows];
            } else if (
              type === "source" &&
              sql.includes("WHERE call_id = $1::uuid")
            ) {
              const callId = String(args[0]);
              if (callId !== opts.missingIndividual) {
                response = [
                  {
                    proofJson: JSON.stringify(
                      proof(callId, ATTEMPT, callId !== opts.invalidSignedCall),
                    ),
                  },
                ];
              }
            } else if (
              type === "attempt" &&
              sql.includes("FROM public.reading_execution_attempts a")
            ) {
              response = [
                {
                  externalRequestRef: REF,
                  executionAttemptId: ATTEMPT,
                  readingId: READING,
                  subjectId: SUBJECT,
                },
              ];
            } else if (
              type === "writer" &&
              sql.includes("cmd_record_reading_ai_call_v1")
            ) {
              const item = JSON.parse(String(args[3])) as Record<
                string,
                unknown
              >;
              const callId = String(item.callId);
              if (opts.failSecondWrite && callId === CALLS[1])
                throw Error("simulated cost Writer unavailable");
              const replayed = stored.has(callId);
              stored.add(callId);
              response = [{ callId, replayed }];
            }
            return { rows: response as Row[] };
          },
          release() {
            trace.push("release:" + type);
          },
        };
      },
    };
  }
  return {
    service: createSajuA4AttemptBatchReplayV1({
      sourceReceiptPool: pools.source,
      canonicalAttemptPool: pools.attempt,
      ledgerWriterPool: pools.writer,
      trustedIssuer: "saju-production",
      expectedAudience: "myeongha-admin-a4",
      trustedKeyId: "saju-source-key-v1",
      keyBytes: KEY,
      nowMs: () => NOW,
    }),
    trace,
    stored,
  };
}

describe("A4 bounded source-owned attempt receipt replay (OFFLINE)", () => {
  it("replays two distinct signed calls after canonical attempt proof and never claims complete billing", async () => {
    const x = fixture();
    expect(await x.service.replayAttempt(ATTEMPT)).toEqual({
      state: "local_receipts_recorded",
      executionAttemptId: ATTEMPT,
      observedLocalCalls: 2,
      recordedCalls: 2,
      replayedCalls: 0,
      completeCostCoverage: false,
      invoiceReconciled: false,
    });
    expect([...x.stored].sort()).toEqual([...CALLS]);
    expect(x.trace.filter((s) => s === "connect:writer")).toHaveLength(3);
    expect(x.trace).toContain("writer:WITH objects AS (");
    expect(x.trace[0]).toBe("connect:source");
    expect(x.trace.some((s) => s === "source:BEGIN READ ONLY")).toBe(true);
  });

  it("retains idempotency for the complete local attempt replay", async () => {
    const x = fixture();
    await x.service.replayAttempt(ATTEMPT);
    const result = await x.service.replayAttempt(ATTEMPT);
    expect(result).toMatchObject({
      state: "local_receipts_recorded",
      recordedCalls: 0,
      replayedCalls: 2,
      completeCostCoverage: false,
    });
    expect(x.stored.size).toBe(2);
  });

  it("does not misinterpret zero locally retained receipts as zero-cost evidence", async () => {
    const x = fixture({ calls: [] });
    expect(await x.service.replayAttempt(ATTEMPT)).toMatchObject({
      state: "held_no_local_receipts",
      observedLocalCalls: 0,
      completeCostCoverage: false,
    });
    expect(x.trace).not.toContain("connect:writer");
  });

  it("fails before any Writer call if discovery contains invalid or cross-attempt evidence", async () => {
    for (const listed of [
      [
        {
          callId: CALLS[0],
          proofJson: JSON.stringify(proof(CALLS[0], CALLS[1])),
        },
      ],
      [{ callId: CALLS[0], proofJson: "not-json" }],
      [{ callId: CALLS[0], proofJson: JSON.stringify(proof(CALLS[1])) }],
      [
        { callId: CALLS[0], proofJson: JSON.stringify(proof(CALLS[0])) },
        { callId: CALLS[0], proofJson: JSON.stringify(proof(CALLS[0])) },
      ],
    ]) {
      const x = fixture({ listed });
      await expect(x.service.replayAttempt(ATTEMPT)).rejects.toThrow();
      expect(x.trace).not.toContain("connect:writer");
    }
  });

  it("bounds local source census and never silently skips the overflow", async () => {
    const listed = Array.from({ length: 501 }, (_, i) => ({
      callId: CALLS[0],
      proofJson: JSON.stringify({ proof: i }),
    }));
    const x = fixture({ listed });
    await expect(x.service.replayAttempt(ATTEMPT)).rejects.toThrow(
      "bounded limit",
    );
    expect(x.trace).not.toContain("connect:writer");
  });

  it("never records a forged or unavailable individual receipt", async () => {
    for (const opts of [
      { invalidSignedCall: CALLS[0] },
      { missingIndividual: CALLS[0] },
    ]) {
      const x = fixture(opts);
      await expect(x.service.replayAttempt(ATTEMPT)).rejects.toThrow();
      expect(x.stored.size).toBe(0);
    }
  });

  it.each([
    ["source", { callIdRead: false }, "missing signed receipt read"],
    ["source", { canInsert: true }, "Source Reader acquiring INSERT"],
    ["source", { canReadCoverage: true }, "Source Reader acquiring coverage data"],
    ["source", { objectsExist: false }, "missing Source table"],
    ["attempt", { subjectRead: false }, "missing canonical Subject column"],
    ["attempt", { canUpdate: true }, "canonical Reader acquiring UPDATE"],
    ["writer", { canExecute: false }, "missing cost RPC permission"],
    ["writer", { canReadLedger: true }, "cost Writer acquiring ledger SELECT"],
    ["writer", { currentUser: "postgres" }, "incorrect cost Writer principal"],
  ] as const)(
    "rejects %s grant/readiness mismatch: %s (%s)",
    async (role, mismatch, reason) => {
      expect(reason.length).toBeGreaterThan(0);
      const x = fixture({ readinessOverrides: { [role]: mismatch } });
      await expect(x.service.replayAttempt(ATTEMPT)).rejects.toThrow(
        "Dedicated A4 cost attribution principal is not ready",
      );
      expect(x.stored.size).toBe(0);
      expect(
        x.trace.some((entry) =>
          entry.startsWith("writer:SELECT current_user::text"),
        ),
      ).toBe(false);
    },
  );

  it("does not require a cost Writer for empty or invalid Source receipt censuses", async () => {
    const empty = fixture({ calls: [] });
    expect(await empty.service.replayAttempt(ATTEMPT)).toMatchObject({
      state: "held_no_local_receipts",
      completeCostCoverage: false,
    });
    expect(empty.trace).not.toContain("connect:writer");

    const invalid = fixture({
      listed: [{ callId: CALLS[0], proofJson: "invalid-json" }],
    });
    await expect(invalid.service.replayAttempt(ATTEMPT)).rejects.toThrow();
    expect(invalid.trace).not.toContain("connect:writer");
  });

  it("preserves already committed immutable entries when a subsequent Writer fails", async () => {
    const x = fixture({ failSecondWrite: true });
    await expect(x.service.replayAttempt(ATTEMPT)).rejects.toThrow(
      "simulated cost Writer unavailable",
    );
    expect([...x.stored]).toEqual([CALLS[0]]);
    expect(x.trace).toContain("writer:ROLLBACK");
  });

  it("rejects a wrong Source database principal and invalid identifiers", async () => {
    const x = fixture({ sourceRole: "postgres" });
    await expect(x.service.replayAttempt(ATTEMPT)).rejects.toThrow(
      "Reader principal",
    );
    expect(x.trace).not.toContain("connect:writer");
    const y = fixture();
    await expect(y.service.replayAttempt("browser-owned-id")).rejects.toThrow(
      "Server-chosen",
    );
    expect(y.trace).toHaveLength(0);
  });
});
