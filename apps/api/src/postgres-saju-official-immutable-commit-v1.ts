import { hashSajuHeldSourceProofRequestV1 } from './saju-held-source-proof-verifier-v1.js';
import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';
import type { SajuOfficialImmutableCommitPortV1 } from './saju-official-reading-issuer-db-persistence-v1.js';

/**
 * Existing DB Owner atomic finalize command; NOT a new writer, grant or
 * Production activation. In current production myeongha_api_executor remains
 * denied EXECUTE by migration 1000. Only an expressly authorized internal
 * subject transaction may eventually compose this adapter.
 */
export const SAJU_OFFICIAL_DB_FINALIZE_AUTHORITY_V1 =
  'public.cmd_finalize_reading_transport_success_v1' as const;

const FINALIZE_SQL = `
select
  reading_id::text as "readingId",
  execution_attempt_id::text as "executionAttemptId",
  response_hash as "responseHash",
  replayed
from public.cmd_finalize_reading_transport_success_v1(
  $1::uuid, $2::uuid, $3::uuid, $4::uuid,
  $5::text, $6::text, $7::text, $8::text,
  $9::text, $10::text, $11::text,
  $12::jsonb, $13::jsonb, $14::jsonb, $15::jsonb, $16::text
)
`.trim();

// Read back the exact immutable source lineage after finalization in the SAME
// transaction, including replays. The legacy command only compares responseHash
// on replay; the additional check prevents silently changing its native Saju
// identity, source proof reference or Birth hash.
const VERIFY_STORED_LINEAGE_SQL = `
select
  native_reading_id as "nativeReadingId",
  external_request_ref as "externalRequestRef",
  source_birth_input_hash as "sourceBirthInputHash",
  saju_engine_version as "sajuEngineVersion",
  attempt_engine_version as "attemptEngineVersion",
  reading_contract_version as "readingContractVersion",
  product_response_state as "productResponseState",
  stored_snapshot as "storedSnapshot",
  stored_response_hash as "storedResponseHash"
from public.qry_saju_official_stored_lineage_v3(
  $1::uuid, $2::uuid, $3::uuid
)
`.trim();

type StoredLineageRow = Readonly<{
  nativeReadingId: unknown;
  externalRequestRef: unknown;
  sourceBirthInputHash: unknown;
  sajuEngineVersion: unknown;
  attemptEngineVersion: unknown;
  readingContractVersion: unknown;
  productResponseState: unknown;
  storedSnapshot: unknown;
  storedResponseHash: unknown;
}>;

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

type Row = Readonly<{
  readingId: unknown;
  executionAttemptId: unknown;
  responseHash: unknown;
  replayed: unknown;
}>;

function strictString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('Saju official immutable DB commit returned an invalid ' + label);
  }
  return value;
}

export function createPostgresSajuOfficialImmutableCommitPortV1(
  client: PostgresTransactionQueryV1,
): SajuOfficialImmutableCommitPortV1 {
  return Object.freeze({
    async finalizeSuccess(input: Parameters<SajuOfficialImmutableCommitPortV1['finalizeSuccess']>[0]) {
      // Caller has already verified issuer provenance, exact ID mapping,
      // immutable birth revision and current Commerce/Privacy authority.
      // Do not run an open-ended UPDATE or forge a DB success state.
      const result = await client.query<Row>(FINALIZE_SQL, [
        input.subjectId,
        input.readingId,
        input.executionAttemptId,
        input.outboxEventId,
        input.externalRequestRef,
        input.engineVersion,
        input.nativeReadingId,
        input.sourceBirthInputHash,
        null,
        input.readingContractVersion,
        input.productResponseState,
        null,
        null,
        null,
        JSON.stringify(input.storedSnapshot),
        input.storedResponseHash,
      ]);
      if (result.rows.length !== 1 || !result.rows[0]) {
        throw new Error('Saju official immutable DB commit did not return exactly one receipt.');
      }
      const row = result.rows[0];
      if (typeof row.replayed !== 'boolean') {
        throw new Error('Saju official immutable DB commit returned an invalid replay state.');
      }

      const verified = await client.query<StoredLineageRow>(VERIFY_STORED_LINEAGE_SQL, [
        input.subjectId, input.readingId, input.executionAttemptId,
      ]);
      const lineage = verified.rows[0];
      if (verified.rows.length !== 1 || !lineage
        || lineage.nativeReadingId !== input.nativeReadingId
        || lineage.externalRequestRef !== input.externalRequestRef
        || lineage.sourceBirthInputHash !== input.sourceBirthInputHash
        || lineage.sajuEngineVersion !== input.engineVersion
        || lineage.attemptEngineVersion !== input.engineVersion
        || lineage.readingContractVersion !== input.readingContractVersion
        || lineage.productResponseState !== input.productResponseState
        || lineage.storedResponseHash !== input.storedResponseHash
        || !object(lineage.storedSnapshot)
        || !object(lineage.storedSnapshot.reading)
        || lineage.storedSnapshot.reading.readingId !== input.readingId
        || hashSajuHeldSourceProofRequestV1(lineage.storedSnapshot)
            !== input.storedResponseHash.slice('sha256:v1:'.length)) {
        throw new Error('Saju official immutable DB stored lineage does not match the issued source.');
      }
      const originalNativeSnapshot = {
        ...lineage.storedSnapshot,
        reading: {
          ...lineage.storedSnapshot.reading,
          readingId: input.nativeReadingId,
        },
      };
      if (hashSajuHeldSourceProofRequestV1(originalNativeSnapshot)
        !== input.sourceResponseHash) {
        throw new Error('Saju native source hash differs from the stored immutable mapped response.');
      }
      return Object.freeze({
        readingId: strictString(row.readingId, 'Reading ID'),
        executionAttemptId: strictString(row.executionAttemptId, 'execution attempt ID'),
        responseHash: strictString(row.responseHash, 'response hash'),
        replayed: row.replayed,
      });
    },
  });
}
