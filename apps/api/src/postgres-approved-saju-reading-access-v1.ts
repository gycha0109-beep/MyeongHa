import type {
  CharacterStandardReadingAccessAuthorityPortV1,
  CharacterStandardReadingArtifactAuthorityPortV1,
} from './character-standard-reading-knowledge.js';
import type { OfficialReadingRecordReadAuthorityPortV1 } from './official-reading-record-read.js';
import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';

const READ_SQL = `
select reading_id::text as "readingId",reading_session_id::text as "readingSessionId",
  product_id::text as "productId",saju_domain as "sajuDomain",component,
  source_birth_revision_id::text as "sourceBirthRevisionId",reader_character_id as "readerCharacterId",
  reader_content_bundle_id::text as "readerContentBundleId",domain_capability_version as "domainCapabilityVersion",
  saju_engine_version as "sajuEngineVersion",reading_contract_version as "readingContractVersion",
  product_response_state as "productResponseState",response_snapshot_jsonb as "responseSnapshotJsonb",
  response_hash as "responseHash",completed_at::text as "completedAt",
  issued_revision_no as "issuedRevisionNo",current_revision_no as "currentRevisionNo"
from public.qry_approved_saju_component_record_v1($1::uuid,$2::uuid,$3::text,$4::boolean)
`.trim();

interface ApprovedReadingRow {
  readonly readingId: string;
  readonly readingSessionId: string;
  readonly productId: string;
  readonly sajuDomain: string;
  readonly component: string;
  readonly sourceBirthRevisionId: string;
  readonly readerCharacterId: string;
  readonly readerContentBundleId: string;
  readonly domainCapabilityVersion: string;
  readonly sajuEngineVersion: string;
  readonly readingContractVersion: string;
  readonly productResponseState: string;
  readonly responseSnapshotJsonb: unknown;
  readonly responseHash: string;
  readonly completedAt: string;
  readonly issuedRevisionNo: number;
  readonly currentRevisionNo: number | null;
}

/** Request-scoped Records/Reader adapters. Use the canonical subject transaction
 * and a server-validated Reading selector. The Reader metadata query returns no body. */
export function createPostgresApprovedSajuReadingAccessV1(
  client: PostgresTransactionQueryV1,
  readingId: string,
): Readonly<{
  recordPort: OfficialReadingRecordReadAuthorityPortV1;
  accessPort: CharacterStandardReadingAccessAuthorityPortV1;
  artifactPort: CharacterStandardReadingArtifactAuthorityPortV1;
}> {
  async function read(subjectId: string, reader: string | null, includePayload: boolean) {
    const { rows } = await client.query<ApprovedReadingRow>(READ_SQL, [subjectId, readingId, reader, includePayload]);
    const row = rows[0];
    if (rows.length > 1 || (row !== undefined && (row.readingId !== readingId
      || (reader !== null && row.readerCharacterId !== reader)
      || (!includePayload && row.responseSnapshotJsonb !== null)))) {
      throw new Error('Approved Saju Reading returned inconsistent authority.');
    }
    return row;
  }

  return {
    recordPort: {
      async readRecord(input) {
        if (input.readingId !== readingId) return null;
        const row = await read(input.subjectId, null, true);
        if (row === undefined) return null;
        const { issuedRevisionNo, currentRevisionNo } = row;
        return {
          readingId: row.readingId, readingSessionId: row.readingSessionId, sajuDomain: row.sajuDomain,
          readingContractVersion: row.readingContractVersion, productResponseState: row.productResponseState,
          responseSnapshotJsonb: row.responseSnapshotJsonb, responseHash: row.responseHash,
          readerCharacterIds: [row.readerCharacterId], completedAt: row.completedAt,
          birthRevision: {
            issuedRevisionNo, currentRevisionNo,
            state: currentRevisionNo === null ? 'unknown' : currentRevisionNo === issuedRevisionNo ? 'current' : 'changed',
          },
        };
      },
    },
    accessPort: {
      async readAccessibleReadings(input) {
        const row = await read(input.subjectId, input.readerCharacterId, false);
        if (row === undefined) return [];
        return [{
          subjectId: input.subjectId, readingId: row.readingId, readingSessionId: row.readingSessionId,
          productId: row.productId, readerCharacterId: row.readerCharacterId, readerContentBundleId: row.readerContentBundleId,
          topicKey: row.component, sajuDomain: row.sajuDomain,
          readingPeriod: row.component === 'year' ? 'annual' : row.component === 'month' ? 'monthly' : 'natal',
          readingVariant: row.component === 'compatibility' ? 'comparison' : 'default',
          sourceBirthRevisionId: row.sourceBirthRevisionId, productSpecVersion: 'approved-saju-2026-11-06',
          domainCapabilityVersion: row.domainCapabilityVersion, readingContractVersion: row.readingContractVersion,
          sajuEngineVersion: row.sajuEngineVersion, responseHash: row.responseHash,
        }];
      },
    },
    artifactPort: {
      async readArtifactSource(input) {
        if (input.readingId !== readingId) return [];
        const row = await read(input.subjectId, input.readerCharacterId, true);
        if (row === undefined) return [];
        return [{
          readingId: row.readingId, productId: row.productId, readerCharacterId: row.readerCharacterId,
          readingContractVersion: row.readingContractVersion, productResponseState: row.productResponseState,
          responseSnapshotJsonb: row.responseSnapshotJsonb, responseHash: row.responseHash, completedAt: row.completedAt,
        }];
      },
    },
  };
}
