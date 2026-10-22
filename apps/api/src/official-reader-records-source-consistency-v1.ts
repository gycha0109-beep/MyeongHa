import type {
  PreparedOfficialReadingReaderAdmissionV1,
} from './official-reading-reader-admission-v1.js';
import type {
  OfficialReadingRecordV1,
} from './official-reading-record-read.js';
import { projectOfficialStandardReadingToProtectedCharacterSajuContextV1 } from
  './character-standard-reading-protected-context.js';
import { hashSajuHeldSourceProofRequestV1 } from './saju-held-source-proof-verifier-v1.js';

/**
 * Server-only check between TWO independently DB-authorized read results.
 * A matching snapshot is neither Saju Production source attestation nor
 * current Reader Entitlement, a Records access grant, or S5/S7 authorization.
 */
export const OFFICIAL_READER_RECORDS_SOURCE_CONSISTENCY_VERSION_V1 =
  'official-reader-records-source-consistency-v1' as const;

export type OfficialReaderRecordsSourceConsistencyV1 = Readonly<{
  contractVersion: typeof OFFICIAL_READER_RECORDS_SOURCE_CONSISTENCY_VERSION_V1;
  state: 'held' | 'blocked';
  reason: 'exact_reading_reference_consistent_only' | 'source_scope_or_snapshot_mismatch';
  sourceAuthority: 'NOT_EVALUATED';
  privacyApproval: 'NOT_EVALUATED';
  currentAccessAuthority: 'NOT_EVALUATED';
  canPersist: false;
  canDisclose: false;
  canPublish: false;
  canSell: false;
}>;

function verdict(valid: boolean): OfficialReaderRecordsSourceConsistencyV1 {
  return Object.freeze({
    contractVersion: OFFICIAL_READER_RECORDS_SOURCE_CONSISTENCY_VERSION_V1,
    state: valid ? 'held' : 'blocked',
    reason: valid
      ? 'exact_reading_reference_consistent_only'
      : 'source_scope_or_snapshot_mismatch',
    sourceAuthority: 'NOT_EVALUATED',
    privacyApproval: 'NOT_EVALUATED',
    currentAccessAuthority: 'NOT_EVALUATED',
    canPersist: false,
    canDisclose: false,
    canPublish: false,
    canSell: false,
  });
}
const BLOCKED = verdict(false);

/**
 * Input MUST come from the existing independent DB/Subject resolvers:
 *   Reader: prepareOfficialReadingReaderAdmissionV1 (exact Reader/current grant)
 *   Records: getOfficialReadingRecord (exact Subject/Reading archive access)
 *
 * No new DB lookup, token, API endpoint, Saju text, response digest or
 * approval is returned. The caller is not allowed to treat HELD as a permit.
 */
export function compareOfficialReaderRecordsSourceV1(input: Readonly<{
  readerAdmission: PreparedOfficialReadingReaderAdmissionV1;
  record: OfficialReadingRecordV1;
}>): OfficialReaderRecordsSourceConsistencyV1 {
  try {
    const { source, scope } = input.readerAdmission;
    const record = input.record;
    if (!source || !scope || !record
      || !source.subjectId || !scope.subjectId
      || source.subjectId !== scope.subjectId
      || source.readingId !== scope.readingId
      || source.readerCharacterId !== scope.readerCharacterId
      || source.readerContentBundleId !== scope.readerContentBundleId
      || source.productId !== scope.productId
      || source.productSpecVersion !== scope.productSpecVersion
      || source.sajuDomain !== scope.sajuDomain
      || source.readingContractVersion !== scope.readingContractVersion
      || source.responseHash !== scope.officialArtifactResponseHash
      || source.productResponseState !== 'delivered'
      || record.productResponseState !== source.productResponseState
      || record.readingId !== scope.readingId
      || record.readingSessionId !== source.readingSessionId
      || record.sajuDomain !== scope.sajuDomain
      || record.readingContractVersion !== scope.readingContractVersion
      || !record.readerCharacterIds.includes(scope.readerCharacterId)
      || record.completedAt !== source.completedAt
    ) return BLOCKED;

    // The official Reader projector accepts only a source/contract bound
    // to the exact original ProductReadingResponse text. It does not approve
    // its meaning, Product eligibility, purchase rights or disclosures.
    const projected =
      projectOfficialStandardReadingToProtectedCharacterSajuContextV1(source);
    if (projected.readingRef !== record.readingId
      || projected.domain !== record.sajuDomain
      || projected.coverageState !== 'complete') return BLOCKED;

    const stored = source.responseSnapshotJsonb;
    if (stored === null || typeof stored !== 'object' || Array.isArray(stored)
      || record.reading === null || typeof record.reading !== 'object'
      || Array.isArray(record.reading)) return BLOCKED;

    const readerResponse = stored as Record<string, unknown>;
    const recordsResponse = record.reading;
    if (readerResponse.responseVersion !== scope.readingContractVersion
      || recordsResponse.responseVersion !== scope.readingContractVersion
      || readerResponse.state !== source.productResponseState
      || recordsResponse.state !== record.productResponseState) return BLOCKED;
    const readerReading = readerResponse.reading;
    const recordReading = recordsResponse.reading;
    if (readerReading === null || typeof readerReading !== 'object'
      || Array.isArray(readerReading) || recordReading === null
      || typeof recordReading !== 'object' || Array.isArray(recordReading)
      || (readerReading as Record<string, unknown>).readingId !== record.readingId
      || (recordReading as Record<string, unknown>).readingId !== record.readingId
      || hashSajuHeldSourceProofRequestV1(readerResponse)
        !== hashSajuHeldSourceProofRequestV1(recordsResponse)) return BLOCKED;

    return verdict(true);
  } catch {
    return BLOCKED;
  }
}
