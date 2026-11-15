import type { PostgresSubjectPoolV1 } from "./postgres-subject-execution.js";

/**
 * A4 Saju-owned source receipt Reader, separate from the MyeongHa DB attempt
 * Reader, Cost Writer and regular Admin Reader. The source schema and dedicated
 * principal are defined by Saju's offline PostgreSQL receipt install candidate.
 */
export const SAJU_A4_SOURCE_RECEIPT_READER_ROLE_V1 =
  "saju_a4_provider_receipt_reader_v1" as const;

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SELECT_RECEIPT = `
SELECT proof::text AS "proofJson"
FROM saju_source_ops.a4_provider_call_signed_receipts_v1
WHERE call_id = $1::uuid
LIMIT 2
`.trim();
const CHECK_ROLE = 'SELECT current_user::text AS "currentUser"';
const MAX_RECEIPT_BYTES = 8192;

type SourceRow = Readonly<{ proofJson: unknown }>;

function exactKeys(value: unknown, names: readonly string[]): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value);
  return (
    actual.length === names.length &&
    names.every((name) => Object.hasOwn(value, name))
  );
}

function verifiedProjection(json: unknown, callId: string): unknown | null {
  if (
    typeof json !== "string" ||
    Buffer.byteLength(json, "utf8") > MAX_RECEIPT_BYTES
  )
    return null;
  try {
    const proof: unknown = JSON.parse(json);
    if (!exactKeys(proof, ["payload", "signatureHex"])) return null;
    const envelope = proof as Record<string, unknown>;
    const payload = envelope.payload;
    if (
      !exactKeys(payload, [
        "version",
        "issuer",
        "audience",
        "keyId",
        "issuedAtMs",
        "link",
      ])
    )
      return null;
    const link = (payload as Record<string, unknown>).link;
    if (
      !exactKeys(link, [
        "version",
        "externalRequestRef",
        "executionAttemptId",
        "observation",
      ])
    )
      return null;
    const observation = (link as Record<string, unknown>).observation;
    if (
      !exactKeys(observation, [
        "callId",
        "requestId",
        "providerKey",
        "modelKey",
        "source",
        "outcome",
        "observedAt",
        "usage",
      ])
    )
      return null;
    const view = observation as Record<string, unknown>;
    if (
      !exactKeys(view.usage, [
        "inputTokens",
        "outputTokens",
        "cachedInputTokens",
        "reasoningTokens",
      ]) ||
      view.callId !== callId
    )
      return null;
    // This is an identifier/shape/size transport check only.
    // Independent HMAC verification of every field is mandatory downstream.
    return proof;
  } catch {
    return null;
  }
}

/**
 * This port can be passed ONLY from authenticated service-side code into
 * createSajuSignedProviderCallSourceAuthorityV1.loadSignedCallById.
 *
 * It does not create a DB role, issue credentials, expose an HTTP route,
 * establish Production issuer authority or activate cost collection.
 */
export function createPostgresSajuSourceReceiptLoaderV1(
  input: Readonly<{
    pool: PostgresSubjectPoolV1;
  }>,
): Readonly<{ loadSignedCallById(callId: string): Promise<unknown | null> }> {
  if (!input?.pool || typeof input.pool.connect !== "function")
    throw TypeError("Dedicated Saju source receipt Reader connection required");
  return Object.freeze({
    async loadSignedCallById(callId: string): Promise<unknown | null> {
      if (typeof callId !== "string" || !UUID.test(callId)) return null;
      const client = await input.pool.connect();
      let active = false;
      let discard: unknown;
      try {
        await client.query("BEGIN READ ONLY");
        active = true;
        const principal = await client.query<{ currentUser: unknown }>(
          CHECK_ROLE,
        );
        if (
          principal.rows.length !== 1 ||
          principal.rows[0]?.currentUser !==
            SAJU_A4_SOURCE_RECEIPT_READER_ROLE_V1
        )
          throw Error(
            "Dedicated Saju source receipt reader principal required",
          );
        const result = await client.query<SourceRow>(SELECT_RECEIPT, [callId]);
        const proof =
          result.rows.length === 0
            ? null
            : result.rows.length === 1
              ? verifiedProjection(result.rows[0]?.proofJson, callId)
              : null;
        await client.query("COMMIT");
        active = false;
        return proof;
      } catch (error) {
        if (active) {
          try {
            await client.query("ROLLBACK");
          } catch (rollbackError) {
            discard = rollbackError;
            throw new AggregateError(
              [error, rollbackError],
              "Saju source receipt read failed and rollback failed",
              { cause: rollbackError },
            );
          }
        }
        throw error;
      } finally {
        client.release(discard);
      }
    },
  });
}
