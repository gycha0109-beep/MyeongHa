import type { PreparedOfficialReadingReaderAdmissionV1 } from
  './official-reading-reader-admission-v1.js';
import type { OfficialReadingRecordReadAuthorityPortV1 } from
  './official-reading-record-read.js';
import {
  hashSajuHeldSourceProofRequestV1,
} from './saju-held-source-proof-verifier-v1.js';
import {
  OFFICIAL_READER_SOURCE_THROUGH_DELIVERY_PARITY_VERSION_V1,
  inspectOfficialReaderSourceThroughDeliveryParityV1,
  type OfficialReaderSourceThroughDeliveryParityV1,
} from './official-reader-source-through-delivery-parity-v1.js';
import type {
  S5CommittedReferenceV1,
  S6PrivateReadReferenceV1,
  S7AcknowledgedReferenceV1,
} from './official-reader-s5-s7-reading-continuity-v1.js';

/**
 * Metadata-only view of the EXISTING DB Owner #2301 protected ciphertext AAD.
 * Must come from the current S6 S1-locked, independently authorized DB row.
 * Never copy S6 private body, encryption key, receipt token or ciphertext.
 */
export interface OfficialReaderS6CiphertextIdentityWitnessV1 {
  readonly subjectId: string;
  readonly threadId: string;
  readonly turnId: string;
  readonly attemptId: string;
  readonly safeMessageId: string;
  readonly officialReadingId: string;
  readonly readerCharacterId: string;
  readonly readerContentBundleId: string;
  readonly contentReleaseId: string;
  readonly originatingEntitlementGrantId: string;
  readonly productId: string;
  readonly sourceResponseHash: string;
}

/**
 * Private S7 row/request identity. The S7 SQL owner is responsible for
 * binding this tuple while the current Reader entitlement lock is held.
 * Does not contain the acknowledgment bearer or encrypted/plain text.
 */
export interface OfficialReaderS7PreparedBindingWitnessV1 {
  readonly subjectId: string;
  readonly threadId: string;
  readonly safeMessageId: string;
  readonly bodyId: string;
  readonly deliveryRequestId: string;
  readonly deliveryAttemptId: string;
  readonly responsePreparedAt: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SOURCE_HASH = /^sha256:v1:[a-f0-9]{64}$/u;
const CIPHERTEXT_KEYS = [
  'subjectId', 'threadId', 'turnId', 'attemptId', 'safeMessageId',
  'officialReadingId', 'readerCharacterId', 'readerContentBundleId',
  'contentReleaseId', 'originatingEntitlementGrantId', 'productId',
  'sourceResponseHash',
] as const;
const DELIVERY_KEYS = [
  'subjectId', 'threadId', 'safeMessageId', 'bodyId',
  'deliveryRequestId', 'deliveryAttemptId', 'responsePreparedAt',
] as const;

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function exact(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}
function uuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}
function blocked(): OfficialReaderSourceThroughDeliveryParityV1 {
  return Object.freeze({
    contractVersion: OFFICIAL_READER_SOURCE_THROUGH_DELIVERY_PARITY_VERSION_V1,
    state: 'blocked',
    evidenceStage: 'UNAVAILABLE',
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
const BLOCKED = blocked();

/**
 * Extend the existing single-snapshot S3→S7 HELD preflight by matching the
 * actual S6 ciphertext's authenticated identity (AAD) and S7 prepared tuple.
 * This is a metadata reconciliation ONLY, not authentication of the witness
 * provenance: DB/Privacy Owners must independently attest the S6/S7 row and
 * latest Grant/Privacy Lease in their existing S1-locked transactions.
 *
 * The original one-snapshot check is called only after this metadata filter;
 * it still reads the current DB-authorized Records source exactly once.
 */
export async function inspectOfficialReaderS6CiphertextS7IdentityV1(input: Readonly<{
  readerAdmission: PreparedOfficialReadingReaderAdmissionV1;
  recordAuthorityPort: OfficialReadingRecordReadAuthorityPortV1;
  sajuHandoff: unknown;
  s5Commit: S5CommittedReferenceV1;
  s6Read: S6PrivateReadReferenceV1;
  s6CiphertextIdentity: OfficialReaderS6CiphertextIdentityWitnessV1;
  s7PreparedBinding?: OfficialReaderS7PreparedBindingWitnessV1;
  s7Acknowledged?: S7AcknowledgedReferenceV1;
}>): Promise<OfficialReaderSourceThroughDeliveryParityV1> {
  try {
    const { readerAdmission, s5Commit, s6Read } = input;
    const { scope, source } = readerAdmission;
    const identity = input.s6CiphertextIdentity;
    const handoff = input.sajuHandoff;
    if (!scope || !source || !object(identity) || !exact(identity, CIPHERTEXT_KEYS)
      || !object(handoff) || !object(handoff.source)
      || typeof scope.readerCharacterId !== 'string'
      || scope.readerCharacterId.length === 0
      || scope.readerCharacterId.length > 128
      || identity.readerCharacterId !== scope.readerCharacterId
      || ![
        identity.subjectId, identity.threadId, identity.turnId,
        identity.attemptId, identity.safeMessageId, identity.officialReadingId,
        identity.readerContentBundleId, identity.contentReleaseId,
        identity.originatingEntitlementGrantId, identity.productId,
        s5Commit.bodyId, s6Read.bodyId,
      ].every(uuid)
      || identity.subjectId !== scope.subjectId
      || identity.threadId !== scope.threadId
      || identity.turnId !== s5Commit.turnId
      || identity.attemptId !== s5Commit.attemptId
      || identity.safeMessageId !== s5Commit.safeMessageId
      || identity.officialReadingId !== scope.readingId
      || identity.officialReadingId !== s6Read.officialReadingId
      || identity.readerContentBundleId !== scope.readerContentBundleId
      || identity.contentReleaseId !== scope.contentReleaseId
      || identity.productId !== scope.productId
      || identity.subjectId !== source.subjectId
      || identity.readerCharacterId !== source.readerCharacterId
      || s5Commit.bodyId !== s6Read.bodyId
      || !SOURCE_HASH.test(identity.sourceResponseHash)) return BLOCKED;

    const bodyHash = hashSajuHeldSourceProofRequestV1(source.responseSnapshotJsonb);
    if (identity.sourceResponseHash !== 'sha256:v1:' + bodyHash
      || handoff.source.responseBodyHash !== bodyHash
      || source.responseHash !== scope.officialArtifactResponseHash) return BLOCKED;

    const prepared = s6Read.delivery;
    const binding = input.s7PreparedBinding;
    if (prepared === undefined) {
      if (binding !== undefined || input.s7Acknowledged !== undefined) return BLOCKED;
    } else {
      if (!object(binding) || !exact(binding, DELIVERY_KEYS)
        || ![
          binding.subjectId, binding.threadId, binding.safeMessageId,
          binding.bodyId, binding.deliveryRequestId, binding.deliveryAttemptId,
        ].every(uuid)
        || binding.subjectId !== identity.subjectId
        || binding.threadId !== identity.threadId
        || binding.safeMessageId !== identity.safeMessageId
        || binding.bodyId !== s5Commit.bodyId
        || binding.deliveryRequestId !== prepared.deliveryRequestId
        || binding.deliveryAttemptId !== prepared.deliveryAttemptId
        || binding.responsePreparedAt !== prepared.responsePreparedAt) return BLOCKED;
    }

    const result = await inspectOfficialReaderSourceThroughDeliveryParityV1({
      readerAdmission,
      recordAuthorityPort: input.recordAuthorityPort,
      sajuHandoff: handoff,
      s5Commit,
      s6Read,
      ...(input.s7Acknowledged === undefined
        ? {} : { s7Acknowledged: input.s7Acknowledged }),
    });
    return result.state === 'held'
      && result.canDisclose === false
      && result.canPersist === false
      && result.sourceAuthority === 'NOT_EVALUATED'
      ? result : BLOCKED;
  } catch {
    return BLOCKED;
  }
}
