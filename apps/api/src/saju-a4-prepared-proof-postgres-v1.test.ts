import { describe, expect, it } from "vitest";
import { createMyeongHaA4SignedPreparedAttemptIssuerV1 } from "./saju-a4-signed-prepared-attempt-issuer-v1.js";
import {
  createMyeongHaA4PreparedProofPostgresPortsV1,
  MYEONGHA_A4_PROOF_READER_ROLE_V1,
  MYEONGHA_A4_PROOF_WRITER_ROLE_V1,
} from "./saju-a4-prepared-proof-postgres-v1.js";
import type { PostgresSubjectPoolV1 } from "./postgres-subject-execution.js";

const ATTEMPT = "123e4567-e89b-42d3-a456-426614174002";
const REQUEST = {
  executionAttemptId: ATTEMPT,
  subjectId: "123e4567-e89b-42d3-a456-426614174000",
  readingId: "123e4567-e89b-42d3-a456-426614174001",
  readingSessionId: "123e4567-e89b-42d3-a456-426614174003",
  sourceBirthRevisionId: "123e4567-e89b-42d3-a456-426614174004",
};
const KEY = new Uint8Array(32).fill(31);
async function signed() {
  const issuer = createMyeongHaA4SignedPreparedAttemptIssuerV1({
    preparePort: { prepareBeforeSourceCall: async () => true },
    issuer: "myeongha-production",
    audience: "saju-production-a4",
    keyId: "mh-a4-prepared-v1",
    keyBytes: KEY,
    nowMs: () => Date.parse("2026-11-11T01:00:00.000Z"),
  });
  return (await issuer.prepareAndSign(REQUEST))!;
}

function fixture(
  opts: {
    writerRole?: string;
    readerRole?: string;
    failStore?: boolean;
    failRead?: boolean;
    failCommit?: boolean;
  } = {},
) {
  const rows = new Map<string, string>();
  const logs: Record<"writer" | "reader", string[]> = {
    writer: [],
    reader: [],
  };
  const pool = (type: "writer" | "reader"): PostgresSubjectPoolV1 => ({
    async connect() {
      return {
        async query<R>(sql: string, args: readonly unknown[] = []) {
          logs[type].push(sql);
          if (sql.includes("current_user::text"))
            return {
              rows: [
                {
                  currentUser:
                    type === "writer"
                      ? (opts.writerRole ?? MYEONGHA_A4_PROOF_WRITER_ROLE_V1)
                      : (opts.readerRole ?? MYEONGHA_A4_PROOF_READER_ROLE_V1),
                },
              ] as R[],
            };
          if (sql.startsWith("INSERT INTO")) {
            if (opts.failStore) throw new Error("DB proof write unavailable");
            if (!rows.has(String(args[0])))
              rows.set(String(args[0]), String(args[1]));
          }
          if (sql.startsWith("SELECT proof::text")) {
            if (opts.failRead) throw new Error("DB proof read unavailable");
            const proofJson = rows.get(String(args[0]));
            return {
              rows:
                proofJson === undefined
                  ? ([] as R[])
                  : ([{ proofJson }] as R[]),
            };
          }
          if (sql === "COMMIT" && opts.failCommit)
            throw new Error("DB proof COMMIT unavailable");
          return { rows: [] as R[] };
        },
        release() {},
      };
    },
  });
  const ports = createMyeongHaA4PreparedProofPostgresPortsV1({
    writerPool: pool("writer"),
    readerPool: pool("reader"),
  });
  return { ports, rows, logs };
}

describe("A4 immutable post-prepare proof persistence and private reader", () => {
  it("stores a real DB-prepared signed proof then reads it via separate read-only role", async () => {
    const x = fixture();
    const proof = await signed();
    await x.ports.storePreparedProof(proof);
    expect(await x.ports.loadPreparedProof(ATTEMPT)).toEqual(proof);
    expect(x.rows.size).toBe(1);
    expect(x.logs.writer).toEqual([
      "BEGIN READ WRITE",
      'SELECT current_user::text AS "currentUser"',
      "SET LOCAL synchronous_commit TO on",
      expect.stringContaining("INSERT INTO"),
      expect.stringContaining("SELECT proof::text"),
      "COMMIT",
    ]);
    expect(x.logs.reader).toEqual([
      "BEGIN READ ONLY",
      'SELECT current_user::text AS "currentUser"',
      expect.stringContaining("SELECT proof::text"),
      "COMMIT",
    ]);
  });

  it("confirms exact repeated writes but denies a changed proof for the same attempt", async () => {
    const x = fixture();
    const proof = await signed();
    await x.ports.storePreparedProof(proof);
    await x.ports.storePreparedProof(proof);
    await expect(
      x.ports.storePreparedProof({
        ...proof,
        signatureHex: "0".repeat(64),
      }),
    ).rejects.toThrow("conflicts with immutable prior");
    expect(x.rows.size).toBe(1);
    expect(x.logs.writer.at(-1)).toBe("ROLLBACK");
  });

  it("holds missing proof and rejects invalid read identifier without a DB mutation", async () => {
    const x = fixture();
    expect(await x.ports.loadPreparedProof(ATTEMPT)).toBeNull();
    const size = x.logs.reader.length;
    expect(await x.ports.loadPreparedProof("browser-id")).toBeNull();
    expect(x.logs.reader).toHaveLength(size);
  });

  it("rejects invalid, oversized and extra-field signed proof before writing", async () => {
    const x = fixture();
    const proof = await signed();
    for (const forged of [
      { ...proof, rawBirth: "1999-01-01" },
      { ...proof, payload: { ...proof.payload, prompt: "secret" } },
      {
        ...proof,
        payload: { ...proof.payload, executionAttemptId: "not-uuid" },
      },
      { ...proof, signatureHex: "not-hex" },
      { ...proof, signatureHex: "a".repeat(5000) },
    ]) {
      await expect(
        x.ports.storePreparedProof(forged as typeof proof),
      ).rejects.toThrow("Invalid private signed prepared proof");
    }
    expect(x.rows.size).toBe(0);
    expect(x.logs.writer).toHaveLength(0);
  });

  it("rejects misassigned Reader/Writer roles before touching the A4 proof table", async () => {
    for (const opts of [
      { writerRole: MYEONGHA_A4_PROOF_READER_ROLE_V1 },
      { readerRole: MYEONGHA_A4_PROOF_WRITER_ROLE_V1 },
    ]) {
      const x = fixture(opts);
      if (opts.writerRole) {
        await expect(
          x.ports.storePreparedProof(await signed()),
        ).rejects.toThrow("principal");
        expect(x.rows.size).toBe(0);
      } else {
        await expect(x.ports.loadPreparedProof(ATTEMPT)).rejects.toThrow(
          "principal",
        );
      }
    }
  });

  it("propagates storage/read/COMMIT failures and cannot acknowledge a failed handoff", async () => {
    for (const opts of [
      { failStore: true },
      { failRead: true },
      { failCommit: true },
    ]) {
      const x = fixture(opts);
      await expect(
        x.ports.storePreparedProof(await signed()),
      ).rejects.toThrow();
      expect(x.logs.writer.at(-1)).toBe("ROLLBACK");
    }
  });
});
