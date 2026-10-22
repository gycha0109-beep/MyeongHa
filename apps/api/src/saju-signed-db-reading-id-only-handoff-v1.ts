import type { PreparedOfficialReadingReaderAdmissionV1 } from
  './official-reading-reader-admission-v1.js';
import type { OfficialReadingRecordV1 } from './official-reading-record-read.js';
import {
  inspectSajuDbReadingIdOnlyResponseParityV1,
} from './saju-db-reading-id-only-response-parity-v1.js';
import {
  hashSajuHeldSourceProofRequestV1,
  verifySajuHeldSourceProofV1,
  type SajuHeldSourceProofVerifierContextV1,
  type SajuHeldSourceProofVerifierTrustV1,
} from './saju-held-source-proof-verifier-v1.js';

/**
 * Saju #2410 / DB #2301 handoff: the existing signed PREVIEW response,
 * source-owned identity inventory, and independently admitted DB Reading.
 * Matching these inputs is not a Production issuer or DB mapping approval.
 */
export const SAJU_SIGNED_ID_ONLY_READING_HANDOFF_VERSION_V1 =
  'saju-signed-id-only-reading-handoff-v1' as const;

export type SajuSignedIdOnlyReadingHandoffV1 = Readonly<{
  contractVersion: typeof SAJU_SIGNED_ID_ONLY_READING_HANDOFF_VERSION_V1;
  state: 'held' | 'blocked';
  transportIntegrity: 'VERIFIED' | 'NOT_VERIFIED';
  sourceAuthority: 'NOT_EVALUATED';
  mappingAuthority: 'NOT_EVALUATED';
  privacyApproval: 'NOT_EVALUATED';
  s5AtomicStorage: 'DB_OWNER_REQUIRED';
  s7Delivery: 'DB_OWNER_REQUIRED';
  canMapReadingId: false;
  canPersist: false;
  canDisclose: false;
  canPublish: false;
  canSell: false;
}>;

function decision(matched: boolean): SajuSignedIdOnlyReadingHandoffV1 {
  return Object.freeze({
    contractVersion: SAJU_SIGNED_ID_ONLY_READING_HANDOFF_VERSION_V1,
    state: matched ? 'held' as const : 'blocked' as const,
    transportIntegrity: matched ? 'VERIFIED' as const : 'NOT_VERIFIED' as const,
    sourceAuthority: 'NOT_EVALUATED' as const,
    mappingAuthority: 'NOT_EVALUATED' as const,
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

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sameProfile(a: unknown, b: unknown): boolean {
  return object(a) && object(b)
    && a.id === b.id
    && a.version === b.version
    && a.contentHash === b.contentHash;
}

/**
 * Does NOT create a new issuer, cryptographic algorithm, nonce store or
 * payment right. Existing verifySajuHeldSourceProofV1 authenticates the
 * Preview envelope for a server-constructed normalized request and a
 * cross-replica single-use nonce. The response is used directly from that
 * verified envelope, never supplied as a separate user-authored body.
 *
 * Even after a valid signature, ID mapping and any official release remain
 * forbidden: Saju Production semantic/source authority, DB Birth Revision,
 * transform receipt, entitlement and privacy grants are held by their Owners.
 */
export async function inspectSignedSajuDbReadingIdOnlyHandoffV1(input: Readonly<{
  readerAdmission: PreparedOfficialReadingReaderAdmissionV1;
  record: OfficialReadingRecordV1;
  sajuHandoff: unknown;
  previewEnvelope: unknown;
  trust: SajuHeldSourceProofVerifierTrustV1;
  context: SajuHeldSourceProofVerifierContextV1;
}>): Promise<SajuSignedIdOnlyReadingHandoffV1> {
  try {
    // Snapshot the untrusted transport before the async nonce claim, so a
    // caller cannot switch its response/identity in the middle of verification.
    const envelope: unknown = structuredClone(input.previewEnvelope);
    if (!object(envelope) || !object(envelope.response)
      || !object(envelope.proof) || !object(envelope.proof.payload)
      || !object(input.sajuHandoff) || !object(input.sajuHandoff.source)) {
      return BLOCKED;
    }
    const handoffSource = input.sajuHandoff.source;
    const nativeResponse = envelope.response;
    const parity = inspectSajuDbReadingIdOnlyResponseParityV1({
      readerAdmission: input.readerAdmission,
      record: input.record,
      sajuHandoff: input.sajuHandoff,
      nativeSajuResponse: nativeResponse,
    });
    // Byte/content mismatch is rejected BEFORE consuming a valid nonce.
    if (parity.state !== 'held'
      || parity.mappingAuthority !== 'NOT_EVALUATED'
      || parity.canMapReadingId !== false
      || parity.canDisclose !== false
      || parity.canPersist !== false) return BLOCKED;

    const proof = await verifySajuHeldSourceProofV1(
      envelope, input.trust, input.context,
    );
    if (proof.state !== 'held'
      || proof.transportIntegrity !== 'VERIFIED'
      || proof.sourceAuthority !== 'NOT_EVALUATED'
      || proof.releaseAuthorization !== 'NOT_EVALUATED'
      || proof.canExecute !== false
      || proof.canPublish !== false
      || proof.canSell !== false
      || !proof.verifiedSource) return BLOCKED;

    // Proof material was signed as part of the trusted envelope. Match the
    // FULL source lineage, not just the displayed text or response ID.
    const material = envelope.proof.payload.material;
    if (!object(material)
      || proof.verifiedSource.readingId !== handoffSource.readingId
      || proof.verifiedSource.responseId !== handoffSource.responseId
      || proof.verifiedSource.responseBodyHash !== handoffSource.responseBodyHash
      || proof.verifiedSource.snapshotId !== handoffSource.snapshotId
      || proof.verifiedSource.registrySnapshotId !== handoffSource.registrySnapshotId
      || proof.verifiedSource.evidenceBundleHash !== handoffSource.evidenceBundleHash
      || !sameProfile(proof.verifiedSource.profileRef, handoffSource.profileRef)
      || material.interpretationRunId !== handoffSource.interpretationRunId
      || material.executionId !== handoffSource.executionId
      || material.preparationId !== handoffSource.preparationId
      || material.selectionId !== handoffSource.selectionId
      || proof.verifiedSource.responseBodyHash !==
        hashSajuHeldSourceProofRequestV1(nativeResponse)) return BLOCKED;

    // A Preview HMAC authenticates a transport hop, NOT a Production Reading,
    // DB mapping receipt, S5 atomic write or S7 client delivery permission.
    return decision(true);
  } catch {
    return BLOCKED;
  }
}
