import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { PostgresSubjectPoolV1 } from "./postgres-subject-execution.js";
import { createSajuA4PostTerminalCostReplayV1 } from "./reading-ai-saju-postterminal-replay-v1.js";

const SUBJECT = "123e4567-e89b-42d3-a456-426614174000";
const READING = "123e4567-e89b-42d3-a456-426614174001";
const ATTEMPT = "123e4567-e89b-42d3-a456-426614174002";
const CALL = "123e4567-e89b-42d3-a456-426614174003";
const REF = "saju_source_123e4567-e89b-42d3-a456-426614174004";
const TIME = "2026-11-09T10:00:00.000Z";
const KEY = new Uint8Array(32).fill(91);
const OBS = {
  callId: CALL,
  requestId: "saju_private_request_1",
  providerKey: "openai",
  modelKey: "gpt-5.6",
  source: "provider_response_usage",
  outcome: "response_received",
  observedAt: TIME,
  usage: {
    inputTokens: 250,
    outputTokens: 40,
    cachedInputTokens: 30,
    reasoningTokens: 10,
  },
};
const PAYLOAD = {
  version: "saju-provider-call-source-proof-v1",
  issuer: "saju-production",
  audience: "myeongha-admin-a4",
  keyId: "saju-source-key-v1",
  issuedAtMs: Date.parse(TIME) + 1000,
  link: {
    version: "saju-source-provider-call-link-v1",
    executionAttemptId: ATTEMPT,
    externalRequestRef: REF,
    observation: OBS,
  },
};
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value === null || typeof value !== "object") return value;
  const o = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(o)
      .sort()
      .map((key) => [key, canonical(o[key])]),
  );
}
function sign(payload: unknown) {
  return {
    payload,
    signatureHex: createHmac("sha256", KEY)
      .update("myeongha/a4/saju-provider-call-proof/v1\0")
      .update(JSON.stringify(canonical(payload)))
      .digest("hex"),
  };
}
const PROOF = sign(PAYLOAD);

function fixture(
  opts: {
    source?: unknown;
    canonicalAttempt?: readonly unknown[];
    sourceRole?: string;
    attemptRole?: string;
    writerRole?: string;
    sourceError?: boolean;
    writerError?: boolean;
    replayed?: boolean;
  } = {},
) {
  const trace: string[] = [];
  const submitted: Array<Record<string, unknown>> = [];
  const pools = {} as Record<
    "source" | "attempt" | "writer",
    PostgresSubjectPoolV1
  >;
  for (const type of ["source", "attempt", "writer"] as const) {
    pools[type] = {
      async connect() {
        trace.push("connect:" + type);
        return {
          async query<Row>(sql: string, values: readonly unknown[] = []) {
            trace.push(type + ":" + sql.split("\n")[0]);
            let rows: unknown[] = [];
            if (sql.includes("current_user::text"))
              rows = [
                {
                  currentUser:
                    type === "source"
                      ? (opts.sourceRole ??
                        "saju_a4_provider_receipt_reader_v1")
                      : type === "attempt"
                        ? (opts.attemptRole ??
                          "myeongha_reading_ai_cost_binding_reader_v1")
                        : (opts.writerRole ??
                          "myeongha_reading_ai_cost_writer_v1"),
                },
              ];
            else if (
              type === "source" &&
              sql.includes(
                "FROM saju_source_ops.a4_provider_call_signed_receipts_v1",
              )
            ) {
              if (opts.sourceError) throw new Error("source unavailable");
              const proof = opts.source === undefined ? PROOF : opts.source;
              if (proof !== null) rows = [{ proofJson: JSON.stringify(proof) }];
            } else if (
              type === "attempt" &&
              sql.includes("FROM public.reading_execution_attempts a")
            ) {
              rows = [
                ...(opts.canonicalAttempt ?? [
                  {
                    externalRequestRef: REF,
                    executionAttemptId: ATTEMPT,
                    readingId: READING,
                    subjectId: SUBJECT,
                  },
                ]),
              ];
            } else if (
              type === "writer" &&
              sql.includes("cmd_record_reading_ai_call_v1")
            ) {
              if (opts.writerError) throw Error("cost writer unavailable");
              submitted.push(
                JSON.parse(String(values[3])) as Record<string, unknown>,
              );
              rows = [{ callId: CALL, replayed: opts.replayed ?? false }];
            }
            return { rows: rows as Row[] };
          },
          release() {
            trace.push("release:" + type);
          },
        };
      },
    };
  }
  const replay = createSajuA4PostTerminalCostReplayV1({
    sourceReceiptPool: pools.source,
    canonicalAttemptPool: pools.attempt,
    ledgerWriterPool: pools.writer,
    trustedIssuer: PAYLOAD.issuer,
    expectedAudience: PAYLOAD.audience,
    trustedKeyId: PAYLOAD.keyId,
    keyBytes: KEY,
    nowMs: () => PAYLOAD.issuedAtMs + 2000,
  });
  return { replay, trace, submitted };
}

describe("A4 post-terminal signed source receipt cost replay (HOLD)", () => {
  it("replays only exact signed source values after canonical terminated attempt", async () => {
    const x = fixture();
    expect(await x.replay.replayOne(CALL)).toEqual({
      state: "recorded",
      callId: CALL,
      replayed: false,
      invoiceReconciled: false,
    });
    expect(x.trace.filter((x) => x.startsWith("connect:"))).toEqual([
      "connect:source",
      "connect:source",
      "connect:attempt",
      "connect:writer",
    ]);
    expect(x.submitted).toHaveLength(1);
    expect(x.submitted[0]).toMatchObject({
      callId: CALL,
      inputTokens: OBS.usage.inputTokens,
      outputTokens: OBS.usage.outputTokens,
      cachedInputTokens: OBS.usage.cachedInputTokens,
      workload: "reading",
      costStatus: "price_unknown",
      invoiceReconciled: false,
    });
    expect(JSON.stringify(x.submitted)).not.toContain(OBS.requestId);
  });

  it("preserves idempotent RPC replay and does not claim finalized invoice", async () => {
    const x = fixture({ replayed: true });
    expect(await x.replay.replayOne(CALL)).toMatchObject({
      state: "recorded",
      callId: CALL,
      replayed: true,
      invoiceReconciled: false,
    });
  });

  it("holds missing, malformed and extra-field source proof without reaching DB authority", async () => {
    for (const source of [
      null,
      {},
      { ...PROOF, rawPrompt: "forbidden" },
      {
        ...PROOF,
        payload: {
          ...PAYLOAD,
          link: { ...PAYLOAD.link, observation: { ...OBS, birth: "hidden" } },
        },
      },
    ]) {
      const x = fixture({ source });
      expect(await x.replay.replayOne(CALL)).toMatchObject({
        state: "held",
        reason: "missing_or_unusable_source_receipt",
        recordedCost: false,
      });
      expect(x.trace.filter((t) => t.startsWith("connect:"))).toEqual([
        "connect:source",
      ]);
      expect(x.submitted).toHaveLength(0);
    }
  });

  it("cannot trust a structurally valid receipt with an altered HMAC or source usage", async () => {
    for (const source of [
      { ...PROOF, signatureHex: "0".repeat(64) },
      {
        ...PROOF,
        payload: {
          ...PAYLOAD,
          link: {
            ...PAYLOAD.link,
            observation: {
              ...OBS,
              usage: { ...OBS.usage, inputTokens: 20000 },
            },
          },
        },
      },
    ]) {
      const x = fixture({ source });
      await expect(x.replay.replayOne(CALL)).rejects.toThrow(
        "Unverified Saju to DB Reading execution mapping",
      );
      expect(x.trace.filter((t) => t.startsWith("connect:"))).toEqual([
        "connect:source",
        "connect:source",
      ]);
      expect(x.submitted).toHaveLength(0);
    }
  });

  it("rejects missing, ambiguous, or conflicting canonical Reading attempt", async () => {
    for (const canonicalAttempt of [
      [],
      [
        {
          executionAttemptId: ATTEMPT,
          externalRequestRef: REF,
          readingId: READING,
          subjectId: SUBJECT,
        },
        {
          executionAttemptId: ATTEMPT,
          externalRequestRef: REF,
          readingId: READING,
          subjectId: SUBJECT,
        },
      ],
      [
        {
          executionAttemptId: ATTEMPT,
          externalRequestRef: "saju_source_wrong",
          readingId: READING,
          subjectId: SUBJECT,
        },
      ],
    ]) {
      const x = fixture({ canonicalAttempt });
      await expect(x.replay.replayOne(CALL)).rejects.toThrow(
        "Unverified Saju to DB Reading execution mapping",
      );
      expect(x.trace.some((t) => t === "connect:writer")).toBe(false);
    }
  });

  it("blocks wrong dedicated database principals and temporary source/Writer outages", async () => {
    for (const opts of [
      { sourceRole: "postgres" },
      { attemptRole: "postgres" },
      { writerRole: "postgres" },
      { sourceError: true },
      { writerError: true },
    ]) {
      const x = fixture(opts);
      await expect(x.replay.replayOne(CALL)).rejects.toThrow();
      expect(x.submitted).toHaveLength(0);
    }
  });

  it("does not consult databases for an invalid or browser-chosen call ID", async () => {
    const x = fixture();
    for (const id of ["foo", CALL + ";DELETE", "", "A".repeat(9000)])
      await expect(x.replay.replayOne(id)).rejects.toThrow(
        "Valid server-selected",
      );
    expect(x.trace).toHaveLength(0);
  });
});
