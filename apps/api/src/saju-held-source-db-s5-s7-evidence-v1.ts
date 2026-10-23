import type {
  PreparedOfficialReadingReaderAdmissionV1,
} from './official-reading-reader-admission-v1.js';
import {
  type OfficialReadingRecordAuthorityRowV1,
  type OfficialReadingRecordReadAuthorityPortV1,
} from './official-reading-record-read.js';
import {
  inspectSajuHeldTransportDbReadingHandoffV1,
} from './saju-held-transport-db-reading-handoff-v1.js';
import {
  inspectOfficialReaderS5S7WithCurrentRecordsV1,
  type S5CommittedReferenceV1,
  type S6PrivateReadReferenceV1,
  type S7AcknowledgedReferenceV1,
  type OfficialReaderS5S7ContinuityResultV1,
} from './official-reader-s5-s7-reading-continuity-v1.js';
import type {
  OfficialReaderS6CiphertextIdentityWitnessV1,
  OfficialReaderS7PreparedBindingWitnessV1,
} from './official-reader-s6-ciphertext-s7-identity-v1.js';
import {
  hashSajuHeldSourceProofRequestV1,
  type SajuHeldSourceProofVerifierContextV1,
  type SajuHeldSourceProofVerifierTrustV1,
} from './saju-held-source-proof-verifier-v1.js';

/**
 * Exact S3 signed PREVIEW native Reading → DB Official UUID → S5 ciphertext
 * → S6 protected reread → S7 preparation/ACK evidence on ONE DB Records row.
 *
 * This is not the strict S3 Production gate: the Saju native Reading ID is
 * deliberately different from the stored Official Reading UUID. It can only
 * produce technical HELD evidence; it cannot remap IDs or authorize any
 * source issuance, paid generation, persistence, disclosure or delivery.
 */
export const SAJU_HELD_SOURCE_DB_S5_S7_EVIDENCE_VERSION_V1 =
  'saju-held-source-db-s5-s7-evidence-v1' as const;

export type SajuHeldSourceDbS5S7EvidenceV1 = Readonly<{
  contractVersion: typeof SAJU_HELD_SOURCE_DB_S5_S7_EVIDENCE_VERSION_V1;
  state: 'held' | 'blocked';
  evidenceStage: OfficialReaderS5S7ContinuityResultV1['evidenceStage'];
  transportIntegrity: 'VERIFIED' | 'NOT_VERIFIED';
  sourceAuthority: 'NOT_EVALUATED';
  mappingAuthority: 'NOT_EVALUATED';
  currentAccessAuthority: 'NOT_EVALUATED';
  privacyApproval: 'NOT_EVALUATED';
  s5AtomicStorage: 'DB_OWNER_REQUIRED';
  s7Delivery: 'DB_OWNER_REQUIRED';
  canMapReadingId: false;
  canPersist: false;
  canDisclose: false;
  canPublish: false;
  canSell: false;
}>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SHA = /^sha256:v1:[a-f0-9]{64}$/u;
const AAD_KEYS = [
  'subjectId', 'threadId', 'turnId', 'attemptId', 'safeMessageId',
  'officialReadingId', 'readerCharacterId', 'readerContentBundleId',
  'contentReleaseId', 'originatingEntitlementGrantId', 'productId',
  'sourceResponseHash',
] as const;
const PREPARED_KEYS = [
  'subjectId', 'threadId', 'safeMessageId', 'bodyId',
  'deliveryRequestId', 'deliveryAttemptId', 'responsePreparedAt',
] as const;

function obj(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}
function exact(v: unknown, keys: readonly string[]): v is Record<string, unknown> {
  return obj(v) && Object.keys(v).length === keys.length
    && keys.every(key => Object.hasOwn(v, key));
}
function uuid(v: unknown): boolean {
  return typeof v === 'string' && UUID.test(v);
}
function decision(
  stage: SajuHeldSourceDbS5S7EvidenceV1['evidenceStage'],
  integrity: SajuHeldSourceDbS5S7EvidenceV1['transportIntegrity'],
): SajuHeldSourceDbS5S7EvidenceV1 {
  return Object.freeze({
    contractVersion: SAJU_HELD_SOURCE_DB_S5_S7_EVIDENCE_VERSION_V1,
    state: stage === 'UNAVAILABLE' ? 'blocked' as const : 'held' as const,
    evidenceStage: stage,
    transportIntegrity: integrity,
    sourceAuthority: 'NOT_EVALUATED' as const,
    mappingAuthority: 'NOT_EVALUATED' as const,
    currentAccessAuthority: 'NOT_EVALUATED' as const,
    privacyApproval: 'NOT_EVALUATED' as const,
    s5AtomicStorage: 'DB_OWNER_REQUIRED' as const,
    s7Delivery: 'DB_OWNER_REQUIRED' as const,
    canMapReadingId: false as const,
    canPersist: false as const,
    canDisclose: false as const,
    canPublish: false as const,
    canSell: false as const,
  });
}
const BLOCKED = decision('UNAVAILABLE', 'NOT_VERIFIED');

/**
 * Existing DB Owner S5 AAD binds to the DB STORED response, not to the
 * native signed Saju response (whose Reading ID differs). These hashes must
 * not be silently equated or used as an authorization mapping.
 */
function exactProtectedIdentity(input: Readonly<{
  readerAdmission: PreparedOfficialReadingReaderAdmissionV1;
  s5Commit: S5CommittedReferenceV1;
  s6Read: S6PrivateReadReferenceV1;
  s6CiphertextIdentity: OfficialReaderS6CiphertextIdentityWitnessV1;
  s7PreparedBinding?: OfficialReaderS7PreparedBindingWitnessV1;
  s7Acknowledged?: S7AcknowledgedReferenceV1;
}>): boolean {
  try {
    const { source, scope } = input.readerAdmission;
    const id = input.s6CiphertextIdentity;
    const s5 = input.s5Commit;
    const s6 = input.s6Read;
    if (!source || !scope || !s5 || !s6
      || !exact(id, AAD_KEYS)
      || ![
        id.subjectId, id.threadId, id.turnId, id.attemptId,
        id.safeMessageId, id.officialReadingId, id.readerContentBundleId,
        id.contentReleaseId, id.originatingEntitlementGrantId,
        id.productId, s5.bodyId, s6.bodyId,
      ].every(uuid)
      || typeof id.readerCharacterId !== 'string'
      || !id.readerCharacterId || id.readerCharacterId.length > 128
      || typeof id.sourceResponseHash !== 'string'
      || !SHA.test(id.sourceResponseHash)
      || id.subjectId !== scope.subjectId
      || id.subjectId !== source.subjectId
      || id.threadId !== scope.threadId
      || id.turnId !== s5.turnId
      || id.attemptId !== s5.attemptId
      || id.safeMessageId !== s5.safeMessageId
      || id.officialReadingId !== scope.readingId
      || id.officialReadingId !== s6.officialReadingId
      || id.readerCharacterId !== scope.readerCharacterId
      || id.readerCharacterId !== source.readerCharacterId
      || id.readerContentBundleId !== scope.readerContentBundleId
      || id.contentReleaseId !== scope.contentReleaseId
      || id.productId !== scope.productId
      || id.productId !== source.productId
      || s5.bodyId !== s6.bodyId
      || id.sourceResponseHash !== 'sha256:v1:' +
        hashSajuHeldSourceProofRequestV1(source.responseSnapshotJsonb)) return false;

    const prepared = s6.delivery;
    if (prepared === undefined) {
      return input.s7PreparedBinding === undefined
        && input.s7Acknowledged === undefined;
    }
    const binding = input.s7PreparedBinding;
    return exact(binding, PREPARED_KEYS)
      && [
        binding.subjectId, binding.threadId, binding.safeMessageId,
        binding.bodyId, binding.deliveryRequestId, binding.deliveryAttemptId,
      ].every(uuid)
      && binding.subjectId === id.subjectId
      && binding.threadId === id.threadId
      && binding.safeMessageId === id.safeMessageId
      && binding.bodyId === s5.bodyId
      && binding.deliveryRequestId === prepared.deliveryRequestId
      && binding.deliveryAttemptId === prepared.deliveryAttemptId
      && binding.responsePreparedAt === prepared.responsePreparedAt;
  } catch {
    return false;
  }
}

/**
 * Fetches the Owner-authorized Records row once for this call only, then
 * reuses precisely those row bytes through the EXISTING two independently
 * bounded consumers. No global caching or permissions are introduced.
 *
 * The source signature is checked before the Records query. A successful
 * result indicates neither Production source coverage nor a live entitlement
 * or refund decision; the DB Owner S1-locked S5/S6/S7 runtime must perform
 * those current checks separately on every actual operation.
 */
export async function inspectSajuHeldSourceDbS5S7EvidenceV1(input: Readonly<{
  readerAdmission: PreparedOfficialReadingReaderAdmissionV1;
  recordAuthorityPort: OfficialReadingRecordReadAuthorityPortV1;
  sajuHandoff: unknown;
  sourceEnvelope: unknown;
  trust: SajuHeldSourceProofVerifierTrustV1;
  context: SajuHeldSourceProofVerifierContextV1;
  s5Commit: S5CommittedReferenceV1;
  s6Read: S6PrivateReadReferenceV1;
  s6CiphertextIdentity: OfficialReaderS6CiphertextIdentityWitnessV1;
  s7PreparedBinding?: OfficialReaderS7PreparedBindingWitnessV1;
  s7Acknowledged?: S7AcknowledgedReferenceV1;
}>): Promise<SajuHeldSourceDbS5S7EvidenceV1> {
  try {
    if (!exactProtectedIdentity(input)) return BLOCKED;
    const scope = input.readerAdmission.scope;
    if (!scope || !scope.subjectId || !scope.readingId) return BLOCKED;

    let pinnedPromise: Promise<OfficialReadingRecordAuthorityRowV1 | null> | undefined;
    const pinnedPort: OfficialReadingRecordReadAuthorityPortV1 = {
      readRecord: ({subjectId, readingId}) => {
        if (subjectId !== scope.subjectId || readingId !== scope.readingId) {
          return null;
        }
        pinnedPromise ??= Promise.resolve().then(() =>
          input.recordAuthorityPort.readRecord({subjectId, readingId}));
        return pinnedPromise;
      },
    };
    const preview = await inspectSajuHeldTransportDbReadingHandoffV1({
      readerAdmission: input.readerAdmission,
      recordAuthorityPort: pinnedPort,
      sajuHandoff: input.sajuHandoff,
      sourceEnvelope: input.sourceEnvelope,
      trust: input.trust,
      context: input.context,
    });
    if (preview.state !== 'held'
      || preview.transportIntegrity !== 'VERIFIED'
      || preview.mappingAuthority !== 'NOT_EVALUATED'
      || preview.sourceAuthority !== 'NOT_EVALUATED'
      || preview.canMapReadingId !== false
      || preview.canPersist !== false
      || preview.canDisclose !== false) return BLOCKED;

    const s5s7 = await inspectOfficialReaderS5S7WithCurrentRecordsV1({
      readerAdmission: input.readerAdmission,
      recordAuthorityPort: pinnedPort,
      s5Commit: input.s5Commit,
      s6Read: input.s6Read,
      ...(input.s7Acknowledged === undefined ? {} :
        {s7Acknowledged: input.s7Acknowledged}),
    });
    if (s5s7.state !== 'held'
      || s5s7.sourceAuthority !== 'NOT_EVALUATED'
      || s5s7.currentAccessAuthority !== 'NOT_EVALUATED'
      || s5s7.canPersist !== false
      || s5s7.canDisclose !== false
      || s5s7.evidenceStage === 'UNAVAILABLE') return BLOCKED;

    return decision(s5s7.evidenceStage, 'VERIFIED');
  } catch {
    return BLOCKED;
  }
}
