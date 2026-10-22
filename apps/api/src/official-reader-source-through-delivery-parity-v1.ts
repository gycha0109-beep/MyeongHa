import {
  getOfficialReadingRecord,
  type OfficialReadingRecordReadAuthorityPortV1,
} from './official-reading-record-read.js';
import type {
  PreparedOfficialReadingReaderAdmissionV1,
} from './official-reading-reader-admission-v1.js';
import {
  preflightSajuReaderRecordsSourceInventoryParityV1,
} from './official-reader-saju-source-inventory-parity-v1.js';
import {
  inspectOfficialReaderS5S7ContinuityV1,
  type S5CommittedReferenceV1,
  type S6PrivateReadReferenceV1,
  type S7AcknowledgedReferenceV1,
} from './official-reader-s5-s7-reading-continuity-v1.js';

/**
 * One same-snapshot preflight for S3 SourceUnit identity -> S5 committed
 * protected body -> S6 private reread -> S7 delivery/ACK evidence.
 *
 * The DB owner still owns authorization, source issuer verification,
 * storage and disclosure. This preflight never mints one of those rights.
 */
export const OFFICIAL_READER_SOURCE_THROUGH_DELIVERY_PARITY_VERSION_V1 =
  'official-reader-source-through-delivery-parity-v1' as const;

type EvidenceStage =
  | 'UNAVAILABLE'
  | 'S5_COMMITTED_REFERENCE'
  | 'S7_RESPONSE_PREPARED'
  | 'S7_CLIENT_ACKNOWLEDGED_NOT_HUMAN_READ';

export type OfficialReaderSourceThroughDeliveryParityV1 = Readonly<{
  contractVersion: typeof OFFICIAL_READER_SOURCE_THROUGH_DELIVERY_PARITY_VERSION_V1;
  state: 'held' | 'blocked';
  evidenceStage: EvidenceStage;
  sourceAuthority: 'NOT_EVALUATED';
  productionInterpretationAuthority: 'NOT_EVALUATED';
  privacyApproval: 'NOT_EVALUATED';
  s5AtomicStorage: 'DB_OWNER_REQUIRED';
  s7Delivery: 'DB_OWNER_REQUIRED';
  currentAccessAuthority: 'NOT_EVALUATED';
  canPersist: false;
  canDisclose: false;
  canPublish: false;
  canSell: false;
}>;

function verdict(stage: EvidenceStage): OfficialReaderSourceThroughDeliveryParityV1 {
  return Object.freeze({
    contractVersion: OFFICIAL_READER_SOURCE_THROUGH_DELIVERY_PARITY_VERSION_V1,
    state: stage === 'UNAVAILABLE' ? 'blocked' : 'held',
    evidenceStage: stage,
    sourceAuthority: 'NOT_EVALUATED',
    productionInterpretationAuthority: 'NOT_EVALUATED',
    privacyApproval: 'NOT_EVALUATED',
    s5AtomicStorage: 'DB_OWNER_REQUIRED',
    s7Delivery: 'DB_OWNER_REQUIRED',
    currentAccessAuthority: 'NOT_EVALUATED',
    canPersist: false,
    canDisclose: false,
    canPublish: false,
    canSell: false,
  });
}
const BLOCKED = verdict('UNAVAILABLE');

/**
 * Accept ONLY independently authorized server-side inputs. The existing
 * subject-scoped Records owner port is invoked ONCE and the SAME returned
 * immutable Reading snapshot is used for both source and delivery checks.
 *
 * Re-evaluation of S6 Reader Grant / Privacy lease and S7 ACK token belongs
 * to the DB Owner transactions, never to this post-hoc consistency result.
 */
export async function inspectOfficialReaderSourceThroughDeliveryParityV1(
  input: Readonly<{
    readerAdmission: PreparedOfficialReadingReaderAdmissionV1;
    recordAuthorityPort: OfficialReadingRecordReadAuthorityPortV1;
    /** Preview/HELD Saju SourceUnit inventory, not a Production issuer proof. */
    sajuHandoff: unknown;
    s5Commit: S5CommittedReferenceV1;
    /** Must be produced only by DB Owner's S6 protected reread. */
    s6Read: S6PrivateReadReferenceV1;
    s7Acknowledged?: S7AcknowledgedReferenceV1;
  }>,
): Promise<OfficialReaderSourceThroughDeliveryParityV1> {
  try {
    const { scope, source } = input.readerAdmission;
    if (!scope || !source || !scope.subjectId
      || source.subjectId !== scope.subjectId
      || source.readingId !== scope.readingId) return BLOCKED;

    const record = await getOfficialReadingRecord({
      resolvedSubjectId: scope.subjectId,
      readingId: scope.readingId,
      expectedResponseHash: scope.officialArtifactResponseHash,
      authorityPort: input.recordAuthorityPort,
    });

    const parity = preflightSajuReaderRecordsSourceInventoryParityV1({
      readerAdmission: input.readerAdmission,
      record,
      sajuHandoff: input.sajuHandoff,
    });
    if (parity.state !== 'held'
      || parity.sourceAuthority !== 'NOT_EVALUATED'
      || parity.canPersist !== false
      || parity.canDisclose !== false) return BLOCKED;

    const continuity = inspectOfficialReaderS5S7ContinuityV1({
      readerAdmission: input.readerAdmission,
      record,
      s5Commit: input.s5Commit,
      s6Read: input.s6Read,
      ...(input.s7Acknowledged === undefined ? {} :
        { s7Acknowledged: input.s7Acknowledged }),
    });
    if (continuity.state !== 'held'
      || continuity.sourceAuthority !== 'NOT_EVALUATED'
      || continuity.canPersist !== false
      || continuity.canDisclose !== false
      || continuity.evidenceStage === 'UNAVAILABLE') return BLOCKED;

    return verdict(continuity.evidenceStage);
  } catch {
    return BLOCKED;
  }
}
