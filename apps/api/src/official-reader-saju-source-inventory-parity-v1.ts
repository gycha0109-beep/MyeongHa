import { hashProtectedSajuTextV1 } from '../../../packages/domain/src/index.js';
import type { PreparedOfficialReadingReaderAdmissionV1 } from './official-reading-reader-admission-v1.js';
import {
  getOfficialReadingRecord,
  type OfficialReadingRecordReadAuthorityPortV1,
  type OfficialReadingRecordV1,
} from './official-reading-record-read.js';
import { projectOfficialStandardReadingToProtectedCharacterSajuContextV1 } from './character-standard-reading-protected-context.js';
import { compareOfficialReaderRecordsSourceV1 } from './official-reader-records-source-consistency-v1.js';
import { hashSajuHeldSourceProofRequestV1 } from './saju-held-source-proof-verifier-v1.js';

export const OFFICIAL_READER_SAJU_SOURCE_INVENTORY_PARITY_VERSION_V1 =
  'official-reader-saju-source-inventory-parity-v1' as const;
const SAJU_HANDOFF_VERSION = 'saju-reader-records-source-reference-handoff-v1';
const SAJU_RESPONSE_VERSION = 'myeonghwa-product-reading-response-v2';
const HASH = /^[a-f0-9]{64}$/u;
const MAX_UNITS = 128;

type Json = Record<string, unknown>;

function obj(value: unknown): value is Json {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sourceUnits(value: unknown): readonly { sourceRef: string; contentHash: string }[] | null {
  if (!Array.isArray(value) || value.length > MAX_UNITS) return null;
  const seen = new Set<string>();
  const result: { sourceRef: string; contentHash: string }[] = [];
  for (const unit of value) {
    if (!obj(unit) || Object.keys(unit).length !== 2
      || typeof unit.sourceRef !== 'string'
      || !/^response\.reading\.(sections\.[0-9]+\.blocks\.[0-9]+|disclosures\.[0-9]+)/u.test(unit.sourceRef)
      || typeof unit.contentHash !== 'string'
      || !/^sha256:v1:[a-f0-9]{64}$/u.test(unit.contentHash)
      || seen.has(unit.sourceRef)) return null;
    seen.add(unit.sourceRef);
    result.push({ sourceRef: unit.sourceRef, contentHash: unit.contentHash });
  }
  return result;
}

function equalUnits(
  candidate: readonly { sourceRef: string; contentHash: string }[],
  fromDb: readonly { sourceRef: string; contentHash: string }[],
): boolean {
  return candidate.length === fromDb.length
    && candidate.every((unit, index) =>
      unit.sourceRef === fromDb[index]?.sourceRef
      && unit.contentHash === fromDb[index]?.contentHash);
}

export type OfficialReaderSajuSourceInventoryParityV1 = Readonly<{
  contractVersion: typeof OFFICIAL_READER_SAJU_SOURCE_INVENTORY_PARITY_VERSION_V1;
  state: 'held' | 'blocked';
  sourceAuthority: 'NOT_EVALUATED';
  s5AtomicStorage: 'DB_OWNER_REQUIRED';
  s7Delivery: 'DB_OWNER_REQUIRED';
  canPersist: false;
  canDisclose: false;
  canPublish: false;
  canSell: false;
}>;

function decision(consistent: boolean): OfficialReaderSajuSourceInventoryParityV1 {
  return Object.freeze({
    contractVersion: OFFICIAL_READER_SAJU_SOURCE_INVENTORY_PARITY_VERSION_V1,
    state: consistent ? 'held' : 'blocked',
    sourceAuthority: 'NOT_EVALUATED',
    s5AtomicStorage: 'DB_OWNER_REQUIRED',
    s7Delivery: 'DB_OWNER_REQUIRED',
    canPersist: false,
    canDisclose: false,
    canPublish: false,
    canSell: false,
  });
}

const BLOCKED = decision(false);

/**
 * Server-only parity preflight. Inputs are:
 *  - an existing independently DB-admitted Reader source
 *  - an existing independently DB-admitted Records source
 *  - an UNTRUSTED source inventory with Saju 2B-3A/2B-3B handoff shape.
 *
 * This adapter never authenticates a Saju Production issuer, and does not
 * supply selected/co-present classifications or Semantic/Output Guard evidence.
 * In particular, native Saju IDs and DB UUIDs are NOT silently remapped:
 * a divergent ID/hash is BLOCKED until the DB/Saju Owners issue an authoritative
 * mapping receipt. No approval state or private text can be returned.
 */
export function preflightSajuReaderRecordsSourceInventoryParityV1(input: Readonly<{
  readerAdmission: PreparedOfficialReadingReaderAdmissionV1;
  record: OfficialReadingRecordV1;
  sajuHandoff: unknown;
}>): OfficialReaderSajuSourceInventoryParityV1 {
  try {
    const match = compareOfficialReaderRecordsSourceV1(input);
    if (match.state !== 'held' || match.canDisclose !== false
      || !obj(input.sajuHandoff)) return BLOCKED;
    const handoff = input.sajuHandoff;
    const source = handoff.source;
    const inventory = handoff.inventory;
    if (handoff.version !== SAJU_HANDOFF_VERSION
      || handoff.state !== 'held' || handoff.lifecycle !== 'preview'
      || handoff.sourceAuthority !== 'NOT_EVALUATED'
      || handoff.productionInterpretationAuthority !== 'NOT_EVALUATED'
      || handoff.releaseAuthorization !== 'NOT_EVALUATED'
      || handoff.subjectBinding !== 'DB_OWNER_REQUIRED'
      || handoff.s5AtomicStorage !== 'DB_OWNER_REQUIRED'
      || handoff.s7Delivery !== 'DB_OWNER_REQUIRED'
      || handoff.canPersist !== false || handoff.canDisclose !== false
      || handoff.canPublish !== false || handoff.canSell !== false
      || handoff.mayIssueS3OfficialCoverageCandidate !== false
      || !obj(source) || !obj(inventory)) return BLOCKED;

    const readerSource = input.readerAdmission.source;
    const readerResponse = readerSource.responseSnapshotJsonb;
    const recordResponse = input.record.reading;
    if (!obj(readerResponse)
      || readerResponse.responseVersion !== SAJU_RESPONSE_VERSION
      || source.responseVersion !== SAJU_RESPONSE_VERSION
      || source.readingId !== input.record.readingId
      || source.readingId !== readerSource.readingId
      || source.responseId !== readerResponse.responseId
      || source.responseId !== recordResponse.responseId
      || typeof source.responseBodyHash !== 'string' || !HASH.test(source.responseBodyHash)
      || source.responseBodyHash !== hashSajuHeldSourceProofRequestV1(readerResponse)
      || typeof source.inventoryHash !== 'string' || !HASH.test(source.inventoryHash)
      || typeof source.snapshotId !== 'string' || !source.snapshotId
      || typeof source.interpretationRunId !== 'string' || !source.interpretationRunId
      || typeof source.registrySnapshotId !== 'string' || !source.registrySnapshotId
      || typeof source.evidenceBundleHash !== 'string' || !HASH.test(source.evidenceBundleHash)
      || typeof source.readingVersion !== 'string' || !source.readingVersion
      || !obj(source.profileRef)
      || typeof source.profileRef.id !== 'string' || !source.profileRef.id
      || typeof source.profileRef.version !== 'string' || !source.profileRef.version
      || typeof source.profileRef.contentHash !== 'string'
      || !HASH.test(source.profileRef.contentHash)) return BLOCKED;

    const projected = projectOfficialStandardReadingToProtectedCharacterSajuContextV1(
      readerSource,
    );
    if (projected.readingRef !== source.readingId || projected.coverageState !== 'complete') {
      return BLOCKED;
    }
    const segments = sourceUnits(inventory.segments);
    const disclosures = sourceUnits(inventory.disclosures);
    if (!segments || !disclosures
      || segments.length + disclosures.length > MAX_UNITS
      || segments.length !== projected.protectedSegments.length
      || disclosures.length !== projected.disclosures.length
      || !equalUnits(segments, projected.protectedSegments)
      || !equalUnits(disclosures, projected.disclosures)) return BLOCKED;

    const ambiguities = inventory.ambiguityHashes;
    if (!Array.isArray(ambiguities)
      || ambiguities.length !== projected.ambiguity.length
      || ambiguities.length + segments.length + disclosures.length > MAX_UNITS
      || ambiguities.some((v: unknown) =>
        typeof v !== 'string' || !/^sha256:v1:[a-f0-9]{64}$/u.test(v))
      || new Set(ambiguities).size !== ambiguities.length
      || ambiguities.some((hash: string, i: number) =>
        hash !== hashProtectedSajuTextV1(projected.ambiguity[i] ?? ''))) {
      return BLOCKED;
    }

    const expectedInventoryHash = hashSajuHeldSourceProofRequestV1({
      version: SAJU_HANDOFF_VERSION,
      readingId: source.readingId,
      responseId: source.responseId,
      responseBodyHash: source.responseBodyHash,
      inventory: {
        segments: inventory.segments,
        disclosures: inventory.disclosures,
        ambiguityHashes: inventory.ambiguityHashes,
      },
    });
    if (source.inventoryHash !== expectedInventoryHash) return BLOCKED;

    return decision(true);
  } catch {
    return BLOCKED;
  }
}


/**
 * Invoke the EXISTING Records owner-scoped DB read for the exact Reading
 * already admitted by the Reader. No new query/GRANT/route is introduced.
 * Caller must supply the currently authorized server-side Reader admission
 * and existing Records authority port, not any browser-authored objects.
 *
 * Saju issuer and operational approvals are still missing, so success is HELD.
 * Failure returns no Reading identity, raw source bytes or private body.
 */
export async function preflightSajuReaderAgainstCurrentRecordsV1(input: Readonly<{
  readerAdmission: PreparedOfficialReadingReaderAdmissionV1;
  recordAuthorityPort: OfficialReadingRecordReadAuthorityPortV1;
  sajuHandoff: unknown;
}>): Promise<OfficialReaderSajuSourceInventoryParityV1> {
  try {
    const scope = input.readerAdmission.scope;
    const source = input.readerAdmission.source;
    if (!scope || !source || !scope.subjectId
      || scope.subjectId !== source.subjectId
      || scope.readingId !== source.readingId) return BLOCKED;
    const record = await getOfficialReadingRecord({
      resolvedSubjectId: scope.subjectId,
      readingId: scope.readingId,
      expectedResponseHash: scope.officialArtifactResponseHash,
      authorityPort: input.recordAuthorityPort,
    });
    return preflightSajuReaderRecordsSourceInventoryParityV1({
      readerAdmission: input.readerAdmission,
      record,
      sajuHandoff: input.sajuHandoff,
    });
  } catch {
    return BLOCKED;
  }
}
