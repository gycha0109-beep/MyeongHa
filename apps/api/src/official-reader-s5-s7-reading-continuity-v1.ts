import type { PreparedOfficialReadingReaderAdmissionV1 } from
  './official-reading-reader-admission-v1.js';
import {
  getOfficialReadingRecord,
  type OfficialReadingRecordReadAuthorityPortV1,
  type OfficialReadingRecordV1,
} from './official-reading-record-read.js';
import { hashSajuHeldSourceProofRequestV1 } from './saju-held-source-proof-verifier-v1.js';

/**
 * Server-private S5→S6→S7 evidence continuity for the EXISTING DB Owner Draft
 * #2301 outputs. There is no new grant, SQL, Source issuer or public receipt.
 *
 * The S5/S6/S7 shapes below mirror only the metadata of the DB Owner Draft;
 * they are deliberately structural until the Draft is merged into main.
 */
export const OFFICIAL_READER_S5_S7_CONTINUITY_VERSION_V1 =
  'official-reader-s5-s7-reading-continuity-v1' as const;
const S5_VERSION = 'official-reader-s5-protected-answer-commit-v1';
const S7_VERSION = 'official-reader-s7-private-delivery-v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export interface S5CommittedReferenceV1 {
  readonly contractVersion: typeof S5_VERSION;
  readonly bodyId: string;
  readonly safeMessageId: string;
  readonly turnId: string;
  readonly attemptId: string;
  readonly committedAt: string;
  readonly replayed: boolean;
}

export interface S7PreparedReferenceV1 {
  readonly contractVersion: typeof S7_VERSION;
  readonly deliveryRequestId: string;
  readonly deliveryAttemptId: string;
  readonly responsePreparedAt: string;
  /** Bearer ACK token is not accepted, compared, returned or stored here. */
  readonly replayed: boolean;
}

export interface S7AcknowledgedReferenceV1 {
  readonly contractVersion: typeof S7_VERSION;
  readonly deliveryAttemptId: string;
  readonly clientAcknowledgedAt: string;
  readonly replayed: boolean;
}

export interface S6PrivateReadReferenceV1 {
  readonly bodyId: string;
  readonly officialReadingId: string;
  readonly readerCharacterId: string;
  readonly committedAt: string;
  readonly delivery?: S7PreparedReferenceV1;
}

export type OfficialReaderS5S7ContinuityResultV1 = Readonly<{
  contractVersion: typeof OFFICIAL_READER_S5_S7_CONTINUITY_VERSION_V1;
  state: 'held' | 'blocked';
  evidenceStage:
    | 'UNAVAILABLE'
    | 'S5_COMMITTED_REFERENCE'
    | 'S7_RESPONSE_PREPARED'
    | 'S7_CLIENT_ACKNOWLEDGED_NOT_HUMAN_READ';
  sourceAuthority: 'NOT_EVALUATED';
  privacyApproval: 'NOT_EVALUATED';
  currentAccessAuthority: 'NOT_EVALUATED';
  s5AtomicStorage: 'DB_OWNER_REQUIRED';
  s7Delivery: 'DB_OWNER_REQUIRED';
  canPersist: false;
  canDisclose: false;
  canPublish: false;
  canSell: false;
}>;

function decision(stage: OfficialReaderS5S7ContinuityResultV1['evidenceStage']):
  OfficialReaderS5S7ContinuityResultV1 {
  return Object.freeze({
    contractVersion: OFFICIAL_READER_S5_S7_CONTINUITY_VERSION_V1,
    state: stage === 'UNAVAILABLE' ? 'blocked' : 'held',
    evidenceStage: stage,
    sourceAuthority: 'NOT_EVALUATED',
    privacyApproval: 'NOT_EVALUATED',
    currentAccessAuthority: 'NOT_EVALUATED',
    s5AtomicStorage: 'DB_OWNER_REQUIRED',
    s7Delivery: 'DB_OWNER_REQUIRED',
    canPersist: false,
    canDisclose: false,
    canPublish: false,
    canSell: false,
  });
}

const BLOCKED = decision('UNAVAILABLE');

function uuid(value: unknown): boolean {
  return typeof value === 'string' && UUID.test(value);
}

function dateMillis(value: unknown): number | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Interpret only the trusted server's existing S5 commit metadata, current
 * S6 private reread metadata and optional S7 preparation/ACK metadata.
 * Does not call S5/S6/S7 DB functions; those remain DB/Privacy Owner-HELD.
 *
 * A matching response can be used for server-side incident reconciliation,
 * NOT as a capability to persist, deliver, refund, disclose or charge.
 */
export function inspectOfficialReaderS5S7ContinuityV1(input: Readonly<{
  /** Independently server/DB-admitted Reader source; no untrusted ticket. */
  readerAdmission: PreparedOfficialReadingReaderAdmissionV1;
  /** Independently subject-authorized Records response. */
  record: OfficialReadingRecordV1;
  s5Commit: S5CommittedReferenceV1;
  /** Only the metadata fields from S6; NEVER pass through `body`. */
  s6Read: S6PrivateReadReferenceV1;
  /** Optional client ACK from DB Owner S7, not a human-read signal. */
  s7Acknowledged?: S7AcknowledgedReferenceV1;
}>): OfficialReaderS5S7ContinuityResultV1 {
  try {
    const { readerAdmission, record: records, s5Commit, s6Read, s7Acknowledged } = input;
    const { source, scope } = readerAdmission;
    if (!source || !scope || !records || !s5Commit || !s6Read
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
      || records.productResponseState !== 'delivered'
      || records.readingId !== scope.readingId
      || records.readingSessionId !== source.readingSessionId
      || records.sajuDomain !== scope.sajuDomain
      || records.readingContractVersion !== scope.readingContractVersion
      || records.completedAt !== source.completedAt
      || !records.readerCharacterIds.includes(scope.readerCharacterId)) return BLOCKED;

    const readerResponse = source.responseSnapshotJsonb;
    const archiveResponse = records.reading;
    if (!record(readerResponse) || !record(archiveResponse)
      || readerResponse.state !== 'delivered'
      || archiveResponse.state !== 'delivered'
      || readerResponse.responseVersion !== scope.readingContractVersion
      || archiveResponse.responseVersion !== scope.readingContractVersion
      || !record(readerResponse.reading) || !record(archiveResponse.reading)
      || readerResponse.reading.readingId !== scope.readingId
      || archiveResponse.reading.readingId !== scope.readingId
      || hashSajuHeldSourceProofRequestV1(readerResponse)
        !== hashSajuHeldSourceProofRequestV1(archiveResponse)) return BLOCKED;

    if (s5Commit.contractVersion !== S5_VERSION
      || !uuid(s5Commit.bodyId) || !uuid(s5Commit.safeMessageId)
      || !uuid(s5Commit.turnId) || !uuid(s5Commit.attemptId)
      || typeof s5Commit.replayed !== 'boolean'
      || !uuid(s6Read.bodyId) || !uuid(s6Read.officialReadingId)
      || s5Commit.bodyId !== s6Read.bodyId
      || s6Read.officialReadingId !== scope.readingId
      || s6Read.readerCharacterId !== scope.readerCharacterId
      || dateMillis(s5Commit.committedAt) === null
      || (dateMillis(s5Commit.committedAt) ?? 0)
        < (dateMillis(scope.effectiveAt) ?? Number.POSITIVE_INFINITY)
      || (dateMillis(s5Commit.committedAt) ?? 0)
        < (dateMillis(source.completedAt) ?? Number.POSITIVE_INFINITY)
      || s5Commit.committedAt !== s6Read.committedAt) return BLOCKED;

    const prepared = s6Read.delivery;
    if (prepared === undefined) {
      return s7Acknowledged === undefined
        ? decision('S5_COMMITTED_REFERENCE')
        : BLOCKED;
    }
    if (prepared.contractVersion !== S7_VERSION
      || !uuid(prepared.deliveryRequestId) || !uuid(prepared.deliveryAttemptId)
      || typeof prepared.replayed !== 'boolean'
      || dateMillis(prepared.responsePreparedAt) === null
      || (dateMillis(prepared.responsePreparedAt) ?? 0)
        < (dateMillis(s5Commit.committedAt) ?? Number.POSITIVE_INFINITY)) {
      return BLOCKED;
    }
    if (s7Acknowledged === undefined) return decision('S7_RESPONSE_PREPARED');
    if (s7Acknowledged.contractVersion !== S7_VERSION
      || s7Acknowledged.deliveryAttemptId !== prepared.deliveryAttemptId
      || typeof s7Acknowledged.replayed !== 'boolean'
      || dateMillis(s7Acknowledged.clientAcknowledgedAt) === null
      || (dateMillis(s7Acknowledged.clientAcknowledgedAt) ?? 0)
        < (dateMillis(prepared.responsePreparedAt) ?? Number.POSITIVE_INFINITY)) {
      return BLOCKED;
    }
    return decision('S7_CLIENT_ACKNOWLEDGED_NOT_HUMAN_READ');
  } catch {
    return BLOCKED;
  }
}


/**
 * Re-read Records via its EXISTING subject-scoped DB authority port for the
 * exact Reader-admitted Official Reading before examining S5/S7 metadata.
 * Caller must independently ensure current S6 Grant/Privacy Lease; this check
 * never revalidates or resurrects a purchase, refund, key or ACK token.
 */
export async function inspectOfficialReaderS5S7WithCurrentRecordsV1(input: Readonly<{
  readerAdmission: PreparedOfficialReadingReaderAdmissionV1;
  recordAuthorityPort: OfficialReadingRecordReadAuthorityPortV1;
  s5Commit: S5CommittedReferenceV1;
  s6Read: S6PrivateReadReferenceV1;
  s7Acknowledged?: S7AcknowledgedReferenceV1;
}>): Promise<OfficialReaderS5S7ContinuityResultV1> {
  try {
    const { scope, source } = input.readerAdmission;
    if (!scope || !source || !scope.subjectId
      || scope.subjectId !== source.subjectId
      || scope.readingId !== source.readingId) return BLOCKED;
    const record = await getOfficialReadingRecord({
      resolvedSubjectId: scope.subjectId,
      readingId: scope.readingId,
      authorityPort: input.recordAuthorityPort,
    });
    return inspectOfficialReaderS5S7ContinuityV1({
      readerAdmission: input.readerAdmission,
      record,
      s5Commit: input.s5Commit,
      s6Read: input.s6Read,
      ...(input.s7Acknowledged === undefined
        ? {}
        : { s7Acknowledged: input.s7Acknowledged }),
    });
  } catch {
    return BLOCKED;
  }
}
