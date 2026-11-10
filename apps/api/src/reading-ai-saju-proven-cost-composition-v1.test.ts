import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { PostgresSubjectPoolV1 } from "./postgres-subject-execution.js";
import { createSajuA4VerifiedCostCompositionV1 } from "./reading-ai-saju-proven-cost-composition-v1.js";

const SUBJECT = "123e4567-e89b-42d3-a456-426614174000";
const READING = "123e4567-e89b-42d3-a456-426614174001";
const ATTEMPT = "123e4567-e89b-42d3-a456-426614174002";
const CALL = "123e4567-e89b-42d3-a456-426614174003";
const REF = "saju_source_123e4567-e89b-42d3-a456-426614174004";
const TIME = "2026-11-09T10:00:00.000Z";
const KEY = new Uint8Array(32).fill(71);
const OBS = {
  callId: CALL,
  requestId: "saju_private_issued_request",
  modelKey: "gpt-5.6",
  providerKey: "openai" as const,
  source: "provider_response_usage" as const,
  outcome: "response_received" as const,
  observedAt: TIME,
  usage: {
    inputTokens: 120,
    outputTokens: 20,
    cachedInputTokens: null,
    reasoningTokens: null,
  },
};
const PAYLOAD = {
  version: "saju-provider-call-source-proof-v1",
  issuer: "saju-production",
  audience: "myeongha-admin-a4",
  keyId: "source-a4-key-1",
  issuedAtMs: Date.parse(TIME) + 1000,
  link: {
    version: "saju-source-provider-call-link-v1",
    externalRequestRef: REF,
    executionAttemptId: ATTEMPT,
    observation: OBS,
  },
};

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .map((key) => [key, canonical(record[key])]),
  );
}

const PROOF = Object.freeze({
  payload: PAYLOAD,
  signatureHex: createHmac("sha256", KEY)
    .update("myeongha/a4/saju-provider-call-proof/v1\0")
    .update(JSON.stringify(canonical(PAYLOAD)))
    .digest("hex"),
});
const REQUEST = {
  expectedSajuRequestId: OBS.requestId,
  expectedModelKey: OBS.modelKey,
  observation: OBS,
};
const BOUND_ATTEMPT = {
  externalRequestRef: REF,
  executionAttemptId: ATTEMPT,
  readingId: READING,
  subjectId: SUBJECT,
};

function fixture(
  options: {
    sourceRole?: string;
    attemptRole?: string;
    writerRole?: string;
    sourceProof?: unknown;
    attemptRows?: readonly unknown[];
    failSource?: boolean;
    failAttempt?: boolean;
  } = {},
) {
  const trace: string[] = [];
  const statements: Record<
    string,
    Array<{ sql: string; values: readonly unknown[] }>
  > = {
    source: [],
    attempt: [],
    writer: [],
  };
  const makePool = (
    kind: "source" | "attempt" | "writer",
  ): PostgresSubjectPoolV1 => ({
    async connect() {
      trace.push("connect:" + kind);
      return {
        async query<Row>(sql: string, values: readonly unknown[] = []) {
          statements[kind]?.push({ sql, values });
          trace.push(kind + ":" + sql.split("\n")[0]);
          let rows: unknown[] = [];
          if (sql.includes("current_user::text")) {
            rows = [
              {
                currentUser:
                  kind === "source"
                    ? (options.sourceRole ??
                      "saju_a4_provider_receipt_reader_v1")
                    : kind === "attempt"
                      ? (options.attemptRole ??
                        "myeongha_reading_ai_cost_binding_reader_v1")
                      : (options.writerRole ??
                        "myeongha_reading_ai_cost_writer_v1"),
              },
            ];
          } else if (
            kind === "source" &&
            sql.includes(
              "FROM saju_source_ops.a4_provider_call_signed_receipts_v1",
            )
          ) {
            if (options.failSource)
              throw Error("source receipt database unavailable");
            const proof =
              options.sourceProof === undefined ? PROOF : options.sourceProof;
            if (proof !== null) rows = [{ proofJson: JSON.stringify(proof) }];
          } else if (
            kind === "attempt" &&
            sql.includes("FROM public.reading_execution_attempts a")
          ) {
            if (options.failAttempt)
              throw Error("canonical DB attempt unavailable");
            rows = [...(options.attemptRows ?? [BOUND_ATTEMPT])];
          } else if (
            kind === "writer" &&
            sql.includes("cmd_record_reading_ai_call_v1")
          ) {
            rows = [{ callId: CALL, replayed: false }];
          }
          return { rows: rows as Row[] };
        },
        release() {
          trace.push("release:" + kind);
        },
      };
    },
  });
  const sourceReceiptPool = makePool("source");
  const canonicalAttemptPool = makePool("attempt");
  const ledgerWriterPool = makePool("writer");
  const composition = createSajuA4VerifiedCostCompositionV1({
    sourceReceiptPool,
    canonicalAttemptPool,
    ledgerWriterPool,
    trustedIssuer: PAYLOAD.issuer,
    expectedAudience: PAYLOAD.audience,
    trustedKeyId: PAYLOAD.keyId,
    keyBytes: KEY,
    nowMs: () => PAYLOAD.issuedAtMs + 2000,
  });
  return {
    composition,
    trace,
    statements,
    sourceReceiptPool,
    canonicalAttemptPool,
    ledgerWriterPool,
  };
}

describe("A4 signed Saju source => canonical DB attempt => dedicated cost ledger", () => {
  it("writes only after all three independent authorities are verified in order", async () => {
    const x = fixture();
    expect(await x.composition.record(REQUEST)).toEqual({
      callId: CALL,
      replayed: false,
    });
    expect(x.trace.filter((t) => t.startsWith("connect:"))).toEqual([
      "connect:source",
      "connect:attempt",
      "connect:writer",
    ]);
    expect(x.statements.source?.map((q) => q.sql)).toEqual([
      "BEGIN READ ONLY",
      'SELECT current_user::text AS "currentUser"',
      expect.stringContaining(
        "FROM saju_source_ops.a4_provider_call_signed_receipts_v1",
      ),
      "COMMIT",
    ]);
    expect(x.statements.attempt?.map((q) => q.sql)).toEqual([
      "BEGIN READ ONLY",
      'SELECT current_user::text AS "currentUser"',
      expect.stringContaining("FROM public.reading_execution_attempts a"),
      "COMMIT",
    ]);
    expect(x.statements.writer?.map((q) => q.sql)).toEqual([
      "BEGIN",
      'SELECT current_user::text AS "currentUser"',
      expect.stringContaining("cmd_record_reading_ai_call_v1"),
      "COMMIT",
    ]);
    const writerInput = x.statements.writer?.find((q) =>
      q.sql.includes("cmd_record_reading_ai_call_v1"),
    );
    expect(writerInput?.values.slice(0, 3)).toEqual([
      SUBJECT,
      READING,
      ATTEMPT,
    ]);
    const costEvent = JSON.parse(writerInput?.values[3] as string);
    expect(costEvent).toMatchObject({
      callId: CALL,
      modelKey: OBS.modelKey,
      inputTokens: 120,
      outputTokens: 20,
      workload: "reading",
      invoiceReconciled: false,
    });
    expect(JSON.stringify(costEvent)).not.toContain(OBS.requestId);
  });

  it("rejects missing or substituted signed Source evidence before DB/Writer access", async () => {
    for (const sourceProof of [
      null,
      { ...PROOF, signatureHex: "0".repeat(64) },
      {
        ...PROOF,
        payload: {
          ...PAYLOAD,
          link: { ...PAYLOAD.link, executionAttemptId: READING },
        },
      },
    ]) {
      const x = fixture({ sourceProof });
      await expect(x.composition.record(REQUEST)).rejects.toThrow(
        "Unverified Saju to DB Reading execution mapping",
      );
      expect(x.trace.filter((t) => t.startsWith("connect:"))).toEqual([
        "connect:source",
      ]);
    }
  });

  it("rejects forged usage even if signed callId matches and prevents canonical DB lookup", async () => {
    const x = fixture();
    await expect(
      x.composition.record({
        ...REQUEST,
        observation: { ...OBS, usage: { ...OBS.usage, inputTokens: 999 } },
      }),
    ).rejects.toThrow("Unverified Saju to DB Reading execution mapping");
    expect(x.trace.filter((t) => t.startsWith("connect:"))).toEqual([
      "connect:source",
    ]);
  });

  it("never writes for missing/ambiguous/mismatched canonical attempt", async () => {
    for (const attemptRows of [
      [],
      [BOUND_ATTEMPT, BOUND_ATTEMPT],
      [{ ...BOUND_ATTEMPT, externalRequestRef: "another-ref" }],
      [{ ...BOUND_ATTEMPT, subjectId: "not-a-uuid" }],
    ]) {
      const x = fixture({ attemptRows });
      await expect(x.composition.record(REQUEST)).rejects.toThrow(
        "Unverified Saju to DB Reading execution mapping",
      );
      expect(x.trace.filter((t) => t.startsWith("connect:"))).toEqual([
        "connect:source",
        "connect:attempt",
      ]);
    }
  });

  it("rejects incorrect Source/DB/Writer roles without escalating privileges", async () => {
    const cases = [
      { sourceRole: "myeongha_admin_reader", expected: ["source"] },
      {
        attemptRole: "myeongha_reading_ai_cost_writer_v1",
        expected: ["source", "attempt"],
      },
      {
        writerRole: "myeongha_admin_reader",
        expected: ["source", "attempt", "writer"],
      },
    ];
    for (const c of cases) {
      const x = fixture(c);
      await expect(x.composition.record(REQUEST)).rejects.toThrow();
      expect(x.trace.filter((t) => t.startsWith("connect:"))).toEqual(
        c.expected.map((k) => "connect:" + k),
      );
      expect(
        x.statements.writer?.some((q) =>
          q.sql.includes("cmd_record_reading_ai_call_v1"),
        ),
      ).toBe(false);
    }
  });

  it("fails closed on unavailable source and DB evidence and malformed request", async () => {
    for (const options of [{ failSource: true }, { failAttempt: true }]) {
      const x = fixture(options);
      await expect(x.composition.record(REQUEST)).rejects.toThrow();
      expect(x.statements.writer).toHaveLength(0);
    }
    const invalid = fixture();
    await expect(
      invalid.composition.record({
        ...REQUEST,
        observation: { ...OBS, requestId: "user-replaced-request" },
      }),
    ).rejects.toThrow("Unbound Saju narrative provider observation");
    expect(invalid.trace).toHaveLength(0);
  });

  it("does not permit a shared DB pool to impersonate three separate principals", () => {
    const x = fixture();
    expect(() =>
      createSajuA4VerifiedCostCompositionV1({
        sourceReceiptPool: x.sourceReceiptPool,
        canonicalAttemptPool: x.sourceReceiptPool,
        ledgerWriterPool: x.ledgerWriterPool,
        trustedIssuer: PAYLOAD.issuer,
        expectedAudience: PAYLOAD.audience,
        trustedKeyId: PAYLOAD.keyId,
        keyBytes: KEY,
        nowMs: () => PAYLOAD.issuedAtMs + 2000,
      }),
    ).toThrow("Three independent");
  });
});
