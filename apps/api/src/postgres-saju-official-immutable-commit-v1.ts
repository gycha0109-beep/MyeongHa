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
    async finalizeSuccess(input) {
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
      return Object.freeze({
        readingId: strictString(row.readingId, 'Reading ID'),
        executionAttemptId: strictString(row.executionAttemptId, 'execution attempt ID'),
        responseHash: strictString(row.responseHash, 'response hash'),
        replayed: row.replayed,
      });
    },
  });
}
