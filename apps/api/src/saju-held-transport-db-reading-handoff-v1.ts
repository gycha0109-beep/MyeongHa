import type { PreparedOfficialReadingReaderAdmissionV1 } from
  './official-reading-reader-admission-v1.js';
import {
  getOfficialReadingRecord,
  type OfficialReadingRecordReadAuthorityPortV1,
} from './official-reading-record-read.js';
import {
  inspectSajuDbReadingIdOnlyResponseParityV1,
} from './saju-db-reading-id-only-response-parity-v1.js';
import {
  verifySajuHeldSourceProofV1,
  type SajuHeldSourceProofVerifierContextV1,
  type SajuHeldSourceProofVerifierTrustV1,
} from './saju-held-source-proof-verifier-v1.js';

/**
 * Source-owner HMAC integrity vs DB Owner's distinct Official Reading UUID.
 * This invokes the EXISTING Preview transport verifier and SAME original
 * Reading/Response inventory. It does not issue a Production Source proof,
 * mint a DB Reading mapping, or authorize S5/S6/S7 storage and disclosure.
 */
export const SAJU_HELD_TRANSPORT_DB_READING_HANDOFF_VERSION_V1 =
  'saju-held-transport-db-reading-handoff-v1' as const;

export type SajuHeldTransportDbReadingHandoffV1 = Readonly<{
  contractVersion: typeof SAJU_HELD_TRANSPORT_DB_READING_HANDOFF_VERSION_V1;
  state: 'held' | 'blocked';
  reason:
    | 'preview_transport_and_db_response_match_only'
    | 'source_transport_or_db_response_mismatch';
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

function decision(ok: boolean): SajuHeldTransportDbReadingHandoffV1 {
  return Object.freeze({
    contractVersion: SAJU_HELD_TRANSPORT_DB_READING_HANDOFF_VERSION_V1,
    state: ok ? 'held' as const : 'blocked' as const,
    reason: ok
      ? 'preview_transport_and_db_response_match_only' as const
      : 'source_transport_or_db_response_mismatch' as const,
    transportIntegrity: ok ? 'VERIFIED' as const : 'NOT_VERIFIED' as const,
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

const BLOCKED = decision(false);

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Run a single nonce-claim transaction through the already implemented
 * Saju-held transport HMAC verifier. Proof MATERIAL and the local Saju
 * source inventory must identify the SAME execution, response and profile.
 *
 * No native ID is changed to a DB UUID. The existing Reader / Records
 * independently authorized DB snapshot is queried ONCE and compared to the
 * exact signed native v2 response (where only reading.readingId may differ).
 *
 * Authenticating this Preview HMAC does NOT supply Production Saju issuer
 * approval, Subject/Birth Revision authority, Privacy or Commerce grants.
 */
export async function inspectSajuHeldTransportDbReadingHandoffV1(input: Readonly<{
  readerAdmission: PreparedOfficialReadingReaderAdmissionV1;
  recordAuthorityPort: OfficialReadingRecordReadAuthorityPortV1;
  /** In-process Saju v2 HELD SourceUnit handoff; no client-created objects. */
  sajuHandoff: unknown;
  /** Original server-only Preview HMAC envelope; never client-controlled. */
  sourceEnvelope: unknown;
  trust: SajuHeldSourceProofVerifierTrustV1;
  context: SajuHeldSourceProofVerifierContextV1;
}>): Promise<SajuHeldTransportDbReadingHandoffV1> {
  try {
    const { scope, source } = input.readerAdmission;
    const handoff = input.sajuHandoff;
    const envelope = input.sourceEnvelope;
    if (!scope || !source || !scope.subjectId
      || scope.subjectId !== source.subjectId
      || scope.readingId !== source.readingId
      || !record(handoff) || !record(handoff.source)
      || !record(envelope) || !record(envelope.proof)
      || !record(envelope.proof.payload)
      || !record(envelope.proof.payload.material)
      || !record(envelope.response)) return BLOCKED;

    // This is the existing shared-store replay/expiry/signature check.
    // A failed transport check never reads user Records data.
    const verified = await verifySajuHeldSourceProofV1(
      envelope, input.trust, input.context,
    );
    if (verified.state !== 'held'
      || verified.transportIntegrity !== 'VERIFIED'
      || verified.reason !== 'transport_integrity_verified_only'
      || verified.sourceAuthority !== 'NOT_EVALUATED'
      || verified.releaseAuthorization !== 'NOT_EVALUATED'
      || verified.canExecute !== false
      || verified.canPublish !== false
      || verified.canSell !== false
      || !verified.verifiedSource) return BLOCKED;

    const s = handoff.source;
    const v = verified.verifiedSource;
    const material = envelope.proof.payload.material;
    const profile = s.profileRef;
    if (!record(profile) || !record(material.profileRef)
      || s.readingId !== v.readingId
      || s.responseId !== v.responseId
      || s.snapshotId !== v.snapshotId
      || s.registrySnapshotId !== v.registrySnapshotId
      || s.evidenceBundleHash !== v.evidenceBundleHash
      || s.responseBodyHash !== v.responseBodyHash
      || s.interpretationRunId !== material.interpretationRunId
      || s.executionId !== material.executionId
      || s.preparationId !== material.preparationId
      || s.selectionId !== material.selectionId
      || profile.id !== v.profileRef.id
      || profile.version !== v.profileRef.version
      || profile.contentHash !== v.profileRef.contentHash
      || material.readingId !== s.readingId
      || material.responseId !== s.responseId
      || material.responseBodyHash !== s.responseBodyHash
      || material.evidenceBundleHash !== s.evidenceBundleHash
      || material.registrySnapshotId !== s.registrySnapshotId
      || material.snapshotId !== s.snapshotId) return BLOCKED;

    const dbRecord = await getOfficialReadingRecord({
      resolvedSubjectId: scope.subjectId,
      readingId: scope.readingId,
      authorityPort: input.recordAuthorityPort,
    });
    const parity = inspectSajuDbReadingIdOnlyResponseParityV1({
      readerAdmission: input.readerAdmission,
      record: dbRecord,
      sajuHandoff: handoff,
      nativeSajuResponse: envelope.response,
    });
    if (parity.state !== 'held'
      || parity.mappingAuthority !== 'NOT_EVALUATED'
      || parity.sourceAuthority !== 'NOT_EVALUATED'
      || parity.canMapReadingId !== false
      || parity.canPersist !== false
      || parity.canDisclose !== false) return BLOCKED;

    return decision(true);
  } catch {
    return BLOCKED;
  }
}
