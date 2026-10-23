import { hashProtectedSajuTextV1 } from '../../../packages/domain/src/index.js';
import type { PreparedOfficialReadingReaderAdmissionV1 } from
  './official-reading-reader-admission-v1.js';
import type { OfficialReadingRecordV1 } from './official-reading-record-read.js';
import {
  projectOfficialStandardReadingToProtectedCharacterSajuContextV1,
} from './character-standard-reading-protected-context.js';
import {
  compareOfficialReaderRecordsSourceV1,
} from './official-reader-records-source-consistency-v1.js';
import { hashSajuHeldSourceProofRequestV1 } from './saju-held-source-proof-verifier-v1.js';

/**
 * Known S3 handoff gap: a native Saju Reading ID is not the DB Owner's
 * Official Reading UUID. SourceUnit parity is useful diagnostic evidence,
 * but it cannot be a replacement for a Production issuer/DB mapping receipt.
 */
export const SAJU_NATIVE_DB_READING_IDENTITY_GAP_VERSION_V1 =
  'saju-native-db-reading-identity-gap-v1' as const;

export type SajuNativeDbReadingIdentityGapV1 = Readonly<{
  contractVersion: typeof SAJU_NATIVE_DB_READING_IDENTITY_GAP_VERSION_V1;
  state: 'held' | 'blocked';
  reason: 'issuer_and_db_mapping_required' | 'source_units_or_db_authority_mismatch';
  mappingAuthority: 'NOT_EVALUATED';
  sourceAuthority: 'NOT_EVALUATED';
  privacyApproval: 'NOT_EVALUATED';
  s5AtomicStorage: 'DB_OWNER_REQUIRED';
  s7Delivery: 'DB_OWNER_REQUIRED';
  canMapReadingId: false;
  canPersist: false;
  canDisclose: false;
  canPublish: false;
  canSell: false;
}>;

function result(consistent: boolean): SajuNativeDbReadingIdentityGapV1 {
  return Object.freeze({
    contractVersion: SAJU_NATIVE_DB_READING_IDENTITY_GAP_VERSION_V1,
    state: consistent ? 'held' : 'blocked',
    reason: consistent
      ? 'issuer_and_db_mapping_required'
      : 'source_units_or_db_authority_mismatch',
    mappingAuthority: 'NOT_EVALUATED',
    sourceAuthority: 'NOT_EVALUATED',
    privacyApproval: 'NOT_EVALUATED',
    s5AtomicStorage: 'DB_OWNER_REQUIRED',
    s7Delivery: 'DB_OWNER_REQUIRED',
    canMapReadingId: false,
    canPersist: false,
    canDisclose: false,
    canPublish: false,
    canSell: false,
  });
}
const BLOCKED = result(false);
const SHA = /^[a-f0-9]{64}$/u;
const TEXT_HASH = /^sha256:v1:[a-f0-9]{64}$/u;
const HANDOFF_VERSION = 'saju-reader-records-source-reference-handoff-v1';
const RESPONSE_VERSION = 'myeonghwa-product-reading-response-v2';
const MAX_UNITS = 128;

function obj(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 256;
}

function listMatches(
  input: unknown,
  projected: readonly { sourceRef: string; text: string }[],
): boolean {
  if (!Array.isArray(input) || input.length !== projected.length
    || input.length > MAX_UNITS) return false;
  const used = new Set<string>();
  return input.every((item: unknown, index) => {
    if (!obj(item) || Object.keys(item).length !== 2
      || typeof item.sourceRef !== 'string'
      || !/^response\.reading\.(?:sections\.[0-9]+\.blocks\.[0-9]+(?:\.(?:items|perspectives|entries|rows)\.[0-9]+)?|disclosures\.[0-9]+)$/u.test(item.sourceRef)
      || typeof item.contentHash !== 'string'
      || !TEXT_HASH.test(item.contentHash)
      || used.has(item.sourceRef)
      || item.sourceRef !== projected[index]?.sourceRef
      || item.contentHash !== hashProtectedSajuTextV1(projected[index]!.text)) {
      return false;
    }
    used.add(item.sourceRef);
    return true;
  });
}

/**
 * Server-only preflight for a pending cross-owner ID mapping receipt.
 *
 * The independently authorized MyeongHa Reader and Records must already
 * agree on the exact DB UUID and stored ProductResponse. We compare actual
 * immutable text-unit hashes without modifying either Reading ID or body.
 *
 * IMPORTANT: Even matching units do not authenticate the claimed Saju
 * responseBodyHash, source ownership, semantic authority, DB transform,
 * birth revision, or a Production ID mapping. A signed/DB-authoritative
 * mapping receipt is still required BEFORE relaxing the existing S3 strict
 * ID check. No refund, paid response, or export may use this result.
 */
export function preflightSajuNativeDbReadingIdentityGapV1(input: Readonly<{
  readerAdmission: PreparedOfficialReadingReaderAdmissionV1;
  record: OfficialReadingRecordV1;
  sajuHandoff: unknown;
}>): SajuNativeDbReadingIdentityGapV1 {
  try {
    const original = compareOfficialReaderRecordsSourceV1(input);
    if (original.state !== 'held' || original.canDisclose !== false
      || !obj(input.sajuHandoff)) return BLOCKED;
    const handoff = input.sajuHandoff;
    if (handoff.version !== HANDOFF_VERSION || handoff.state !== 'held'
      || handoff.lifecycle !== 'preview'
      || handoff.sourceAuthority !== 'NOT_EVALUATED'
      || handoff.productionInterpretationAuthority !== 'NOT_EVALUATED'
      || handoff.releaseAuthorization !== 'NOT_EVALUATED'
      || handoff.subjectBinding !== 'DB_OWNER_REQUIRED'
      || handoff.s5AtomicStorage !== 'DB_OWNER_REQUIRED'
      || handoff.s7Delivery !== 'DB_OWNER_REQUIRED'
      || handoff.mayIssueS3OfficialCoverageCandidate !== false
      || handoff.canMapReadingId !== undefined
      || handoff.canPersist !== false || handoff.canDisclose !== false
      || handoff.canPublish !== false || handoff.canSell !== false
      || !obj(handoff.source) || !obj(handoff.inventory)) return BLOCKED;
    const { source, inventory } = handoff;
    const readerSource = input.readerAdmission.source;
    const body = readerSource.responseSnapshotJsonb;
    if (!obj(body) || body.state !== 'delivered'
      || source.responseVersion !== RESPONSE_VERSION
      || !nonempty(source.readingId)
      || source.readingId === readerSource.readingId
      || source.readingId === input.record.readingId
      || !nonempty(source.responseId)
      || source.responseId !== body.responseId
      || source.responseId !== input.record.reading.responseId
      || typeof source.responseBodyHash !== 'string'
      || !SHA.test(source.responseBodyHash)
      || typeof source.inventoryHash !== 'string'
      || !SHA.test(source.inventoryHash)
      || !nonempty(source.snapshotId)
      || !nonempty(source.interpretationRunId)
      || !nonempty(source.registrySnapshotId)
      || !nonempty(source.executionId)
      || !nonempty(source.preparationId)
      || !nonempty(source.selectionId)
      || !nonempty(source.readingVersion)
      || !nonempty(source.evidenceBundleHash)
      || !SHA.test(source.evidenceBundleHash)
      || !obj(source.profileRef)
      || !nonempty(source.profileRef.id)
      || !nonempty(source.profileRef.version)
      || typeof source.profileRef.contentHash !== 'string'
      || !SHA.test(source.profileRef.contentHash)) return BLOCKED;

    // Validate the integrity of the UNTRUSTED inventory as a self-contained
    // reference; this is not a Production cryptographic issuer attestation.
    const computedInventoryHash = hashSajuHeldSourceProofRequestV1({
      version: HANDOFF_VERSION,
      readingId: source.readingId,
      responseId: source.responseId,
      responseBodyHash: source.responseBodyHash,
      inventory,
    });
    if (computedInventoryHash !== source.inventoryHash) return BLOCKED;

    const projected = projectOfficialStandardReadingToProtectedCharacterSajuContextV1(
      readerSource,
    );
    if (projected.coverageState !== 'complete'
      || projected.readingRef !== input.record.readingId
      || projected.protectedSegments.length + projected.disclosures.length
        + projected.ambiguity.length > MAX_UNITS
      || !listMatches(inventory.segments, projected.protectedSegments)
      || !listMatches(inventory.disclosures, projected.disclosures)
      || !Array.isArray(inventory.ambiguityHashes)
      || inventory.ambiguityHashes.length !== projected.ambiguity.length
      || !inventory.ambiguityHashes.every((hash: unknown, i: number) =>
        typeof hash === 'string' && TEXT_HASH.test(hash)
        && hash === hashProtectedSajuTextV1(projected.ambiguity[i]!))) {
      return BLOCKED;
    }
    // Explicitly return HELD even with identical original user-facing text:
    // the Saju ID and DB UUID have NOT been authoritatively mapped.
    return result(true);
  } catch {
    return BLOCKED;
  }
}
