import type {
  PostgresSubjectPoolV1,
  PostgresSubjectConnectionV1,
} from "./postgres-subject-execution.js";
import type { MyeongHaA4SignedPreparedAttemptProofV1 } from "./saju-a4-signed-prepared-attempt-issuer-v1.js";

export const MYEONGHA_A4_PROOF_WRITER_ROLE_V1 =
  "myeongha_a4_prepared_proof_writer_v1" as const;
export const MYEONGHA_A4_PROOF_READER_ROLE_V1 =
  "myeongha_a4_prepared_proof_reader_v1" as const;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const INSERT = [
  "INSERT INTO myeongha_a4_source_ops.prepared_attempt_proofs_v1",
  " (execution_attempt_id, proof)",
  "VALUES ($1::uuid, $2::jsonb)",
  "ON CONFLICT (execution_attempt_id) DO NOTHING",
].join("\n");
const SELECT = [
  'SELECT proof::text AS "proofJson"',
  "FROM myeongha_a4_source_ops.prepared_attempt_proofs_v1",
  "WHERE execution_attempt_id = $1::uuid LIMIT 2",
].join("\n");

function record(raw: unknown): Record<string, unknown> | null {
  return raw !== null && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : null;
}
function exact(
  raw: Record<string, unknown> | null,
  names: readonly string[],
): boolean {
  return (
    raw !== null &&
    Object.keys(raw).length === names.length &&
    names.every((k) => Object.hasOwn(raw, k))
  );
}
function canonical(raw: unknown): unknown {
  if (Array.isArray(raw)) return raw.map(canonical);
  const r = record(raw);
  return r === null
    ? raw
    : Object.fromEntries(
        Object.keys(r)
          .sort()
          .map((k) => [k, canonical(r[k])]),
      );
}
function valid(proof: unknown, expectedAttempt?: string): boolean {
  const p = record(proof);
  const x = record(p?.payload);
  if (
    !exact(p, ["payload", "signatureHex"]) ||
    !exact(x, [
      "version",
      "issuer",
      "audience",
      "keyId",
      "issuedAtMs",
      "expiresAtMs",
      "executionAttemptId",
      "readingId",
      "subjectId",
    ])
  )
    return false;
  return (
    x!.version === "myeongha-a4-prepared-attempt-proof-v1" &&
    [x!.executionAttemptId, x!.readingId, x!.subjectId].every(
      (y) => typeof y === "string" && UUID.test(y),
    ) &&
    (expectedAttempt === undefined ||
      x!.executionAttemptId === expectedAttempt) &&
    typeof p!.signatureHex === "string" &&
    /^[0-9a-f]{64}$/u.test(p!.signatureHex) &&
    Number.isSafeInteger(x!.issuedAtMs) &&
    Number.isSafeInteger(x!.expiresAtMs) &&
    (x!.expiresAtMs as number) > (x!.issuedAtMs as number) &&
    (x!.expiresAtMs as number) - (x!.issuedAtMs as number) <= 120000 &&
    [x!.issuer, x!.audience, x!.keyId].every(
      (y) => typeof y === "string" && /^[A-Za-z0-9._:-]{3,128}$/u.test(y),
    ) &&
    Buffer.byteLength(JSON.stringify(proof), "utf8") <= 4096
  );
}

async function checkRole(
  client: PostgresSubjectConnectionV1,
  expected: string,
): Promise<void> {
  const roles = await client.query<{ currentUser: unknown }>(
    'SELECT current_user::text AS "currentUser"',
  );
  if (roles.rows.length !== 1 || roles.rows[0]?.currentUser !== expected)
    throw Error("Dedicated MyeongHa A4 proof principal required");
}
async function transact<T>(
  pool: PostgresSubjectPoolV1,
  readOnly: boolean,
  fn: (client: PostgresSubjectConnectionV1) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  let active = false;
  let discard: unknown;
  try {
    await client.query(readOnly ? "BEGIN READ ONLY" : "BEGIN READ WRITE");
    active = true;
    const result = await fn(client);
    await client.query("COMMIT");
    active = false;
    return result;
  } catch (error) {
    if (active) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        discard = rollbackError;
        throw new AggregateError(
          [error, rollbackError],
          "MyeongHa A4 proof transaction and rollback failed",
          { cause: rollbackError },
        );
      }
    }
    throw error;
  } finally {
    client.release(discard);
  }
}

/**
 * Immutable post-prepare handoff. The caller MUST use the trusted governed
 * attempt issuer's result and block any provider call unless this store
 * confirms COMMIT. The read side serves only a separate Saju-authenticated
 * private HTTP process. This is not a Public/Owner/Preview API or a
 * Production Interpretation Authority grant.
 */
export function createMyeongHaA4PreparedProofPostgresPortsV1(
  input: Readonly<{
    writerPool: PostgresSubjectPoolV1;
    readerPool: PostgresSubjectPoolV1;
  }>,
): Readonly<{
  storePreparedProof(
    proof: MyeongHaA4SignedPreparedAttemptProofV1,
  ): Promise<void>;
  loadPreparedProof(attemptId: string): Promise<unknown | null>;
}> {
  if (
    !input ||
    !input.writerPool?.connect ||
    !input.readerPool?.connect ||
    input.writerPool === input.readerPool
  )
    throw TypeError("Separate private A4 proof writer/reader pools required");
  return Object.freeze({
    async storePreparedProof(
      proof: MyeongHaA4SignedPreparedAttemptProofV1,
    ): Promise<void> {
      if (!valid(proof))
        throw TypeError("Invalid private signed prepared proof");
      await transact(input.writerPool, false, async (client) => {
        await checkRole(client, MYEONGHA_A4_PROOF_WRITER_ROLE_V1);
        await client.query("SET LOCAL synchronous_commit TO on");
        await client.query(INSERT, [
          proof.payload.executionAttemptId,
          JSON.stringify(proof),
        ]);
        const stored = await client.query<{ proofJson: unknown }>(SELECT, [
          proof.payload.executionAttemptId,
        ]);
        if (
          stored.rows.length !== 1 ||
          typeof stored.rows[0]?.proofJson !== "string"
        )
          throw Error("MyeongHa A4 prepared proof not durably acknowledged");
        let parsed: unknown;
        try {
          parsed = JSON.parse(stored.rows[0].proofJson);
        } catch {
          throw Error("Invalid stored A4 proof");
        }
        if (
          !valid(parsed, proof.payload.executionAttemptId) ||
          JSON.stringify(canonical(parsed)) !== JSON.stringify(canonical(proof))
        )
          throw Error(
            "MyeongHa A4 proof conflicts with immutable prior source",
          );
      });
    },
    async loadPreparedProof(attemptId: string): Promise<unknown | null> {
      if (!UUID.test(attemptId)) return null;
      return transact(input.readerPool, true, async (client) => {
        await checkRole(client, MYEONGHA_A4_PROOF_READER_ROLE_V1);
        const stored = await client.query<{ proofJson: unknown }>(SELECT, [
          attemptId,
        ]);
        if (stored.rows.length === 0) return null;
        if (
          stored.rows.length !== 1 ||
          typeof stored.rows[0]?.proofJson !== "string"
        )
          throw Error("Ambiguous MyeongHa A4 source proof row");
        let proof: unknown;
        try {
          proof = JSON.parse(stored.rows[0].proofJson);
        } catch {
          throw Error("Invalid stored A4 proof");
        }
        if (!valid(proof, attemptId)) throw Error("Untrusted stored A4 proof");
        return proof;
      });
    },
  });
}
