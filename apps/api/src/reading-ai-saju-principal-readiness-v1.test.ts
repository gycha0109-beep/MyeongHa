import { describe, expect, it } from "vitest";
import type { PostgresSubjectPoolV1 } from "./postgres-subject-execution.js";
import { createSajuA4PrincipalReadinessV1 } from "./reading-ai-saju-principal-readiness-v1.js";

type Kind = "source" | "canonical" | "ledger";
type Readiness = Record<string, unknown>;

const ROLES: Record<Kind, string> = {
  source: "saju_a4_provider_receipt_reader_v1",
  canonical: "myeongha_reading_ai_cost_binding_reader_v1",
  ledger: "myeongha_reading_ai_cost_writer_v1",
};

const SOURCE: Readiness = {
  objectsExist: true,
  callIdRead: true,
  proofRead: true,
  canInsert: false,
  canUpdate: false,
  canDelete: false,
  canTruncate: false,
  canReadCoverage: false,
};

const CANONICAL: Readiness = {
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
};

const LEDGER: Readiness = {
  objectsExist: true,
  canExecute: true,
  canReadLedger: false,
  canInsert: false,
  canUpdate: false,
  canDelete: false,
  canTruncate: false,
};

function fixture(
  options: Partial<Record<Kind, Readiness>> = {},
  failure?: Readonly<{ kind: Kind; stage: "connect" | "query" | "commit" }>,
) {
  const sql: Array<{ kind: Kind; statement: string }> = [];
  const released: Array<{ kind: Kind; discard: unknown }> = [];
  const poolFor = (kind: Kind): PostgresSubjectPoolV1 => ({
    async connect() {
      if (failure?.kind === kind && failure.stage === "connect")
        throw new Error("test database unavailable");
      return {
        async query<Row>(statement: string) {
          sql.push({ kind, statement });
          if (
            failure?.kind === kind &&
            failure.stage === "query" &&
            statement.startsWith("WITH")
          )
            throw new Error("test SQL unavailable");
          if (
            failure?.kind === kind &&
            failure.stage === "commit" &&
            statement === "COMMIT"
          )
            throw new Error("test COMMIT unavailable");
          const expected =
            kind === "source"
              ? SOURCE
              : kind === "canonical"
                ? CANONICAL
                : LEDGER;
          const rows = statement.startsWith("WITH")
            ? [{ currentUser: ROLES[kind], ...expected, ...options[kind] }]
            : [];
          return { rows: rows as Row[] };
        },
        release(discard?: unknown) {
          released.push({ kind, discard });
        },
      };
    },
  });

  const sourceReceiptPool = poolFor("source");
  const canonicalAttemptPool = poolFor("canonical");
  const ledgerWriterPool = poolFor("ledger");
  const preflight = createSajuA4PrincipalReadinessV1({
    sourceReceiptPool,
    canonicalAttemptPool,
    ledgerWriterPool,
  });
  return {
    preflight,
    sql,
    released,
    sourceReceiptPool,
    canonicalAttemptPool,
    ledgerWriterPool,
  };
}

describe("A4 three independent database principal readiness (offline only)", () => {
  it("checks all three existing principals and narrow capabilities in read-only transactions", async () => {
    const x = fixture();
    await expect(x.preflight.check()).resolves.toBeUndefined();
    expect(x.sql.map((item) => item.kind)).toEqual([
      "source",
      "source",
      "source",
      "canonical",
      "canonical",
      "canonical",
      "ledger",
      "ledger",
      "ledger",
    ]);
    for (const kind of ["source", "canonical", "ledger"] as const) {
      const statements = x.sql
        .filter((item) => item.kind === kind)
        .map((item) => item.statement);
      expect(statements[0]).toBe("BEGIN READ ONLY");
      expect(statements[1]).toContain("has_");
      expect(statements[2]).toBe("COMMIT");
    }
    expect(
      x.sql.every(
        (item) => !/^(INSERT|UPDATE|DELETE|TRUNCATE)\b/iu.test(item.statement),
      ),
    ).toBe(true);
    expect(x.released).toEqual([
      { kind: "source", discard: undefined },
      { kind: "canonical", discard: undefined },
      { kind: "ledger", discard: undefined },
    ]);
  });

  it.each([
    ["source", { currentUser: "postgres" }, "incorrect Source role"],
    ["source", { proofRead: false }, "missing signed receipt read grant"],
    [
      "source",
      { canReadCoverage: true },
      "Source Reader gaining coverage access",
    ],
    ["source", { canInsert: true }, "Source Reader gaining write access"],
    ["source", { objectsExist: false }, "missing Source schema"],
    ["canonical", { currentUser: "postgres" }, "incorrect canonical DB role"],
    ["canonical", { subjectRead: false }, "missing canonical Subject binding"],
    ["canonical", { canUpdate: true }, "canonical Reader gaining write access"],
    ["ledger", { currentUser: "postgres" }, "incorrect cost writer role"],
    ["ledger", { canExecute: false }, "missing cost RPC authorization"],
    ["ledger", { canReadLedger: true }, "cost Writer gaining direct SELECT"],
    ["ledger", { objectsExist: false }, "missing cost ledger"],
  ] as const)("blocks %s: %s (%s)", async (kind, mismatch, reason) => {
    expect(reason).not.toBe("");
    const x = fixture({ [kind]: mismatch });
    await expect(x.preflight.check()).rejects.toThrow("principal is not ready");
    expect(x.sql.at(-1)).toEqual({ kind, statement: "ROLLBACK" });
    expect(x.sql.some((item) => item.kind === "ledger")).toBe(
      kind === "ledger",
    );
    expect(x.released.every((item) => item.discard === undefined)).toBe(true);
  });

  it.each([
    ["source", "connect"],
    ["canonical", "query"],
    ["ledger", "commit"],
  ] as const)(
    "keeps the operation blocked when %s database %s fails",
    async (kind, stage) => {
      const x = fixture({}, { kind, stage });
      await expect(x.preflight.check()).rejects.toThrow();
      expect(
        x.sql.every(
          (item) => !/^(INSERT|UPDATE|DELETE)\b/iu.test(item.statement),
        ),
      ).toBe(true);
      if (stage !== "connect") {
        expect(x.sql.at(-1)).toEqual({ kind, statement: "ROLLBACK" });
        expect(x.released.at(-1)).toEqual({ kind, discard: undefined });
      }
    },
  );

  it("does not accept one shared DB credential/pool for different authorities", () => {
    const x = fixture();
    expect(() =>
      createSajuA4PrincipalReadinessV1({
        sourceReceiptPool: x.sourceReceiptPool,
        canonicalAttemptPool: x.sourceReceiptPool,
        ledgerWriterPool: x.ledgerWriterPool,
      }),
    ).toThrow("Three independent A4");
    expect(() =>
      createSajuA4PrincipalReadinessV1({
        sourceReceiptPool: x.sourceReceiptPool,
        canonicalAttemptPool: x.canonicalAttemptPool,
        ledgerWriterPool: x.canonicalAttemptPool,
      }),
    ).toThrow("Three independent A4");
  });
});
