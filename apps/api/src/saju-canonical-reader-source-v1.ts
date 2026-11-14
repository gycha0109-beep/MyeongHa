import {
  admitCharacterSajuGroundingBundleViewV1,
  hashCharacterSajuGroundingBundleMaterialV1,
  SAJU_CHARACTER_GROUNDING_PROJECTION_VERSION_V1,
  SAJU_CHARACTER_GROUNDING_SCHEMA_VERSION_V1,
  SAJU_GROUNDING_AXIS_REGISTRY_VERSION_V1,
} from '../../../packages/domain/src/index.js';
import type { SajuDomain } from '../../../packages/contracts/src/index.js';
import { hashSajuHeldSourceProofRequestV1 as hashJson } from './saju-held-source-proof-verifier-v1.js';
import {
  admitSajuCanonicalReaderTemporalV1,
  projectSajuTemporalDisclosuresV1,
  type SajuCanonicalReaderPeriodV1,
  type SajuCanonicalReaderTemporalV1,
} from './saju-canonical-reader-temporal-v1.js';

const HASH = /^[0-9a-f]{64}$/u;
const UNIT = /^grounding_unit_v2_[0-9a-f]{24}$/u;
const CANONICAL_UNIT = /^canonical_reading_unit_[0-9a-f]{24}$/u;
const CLAIM_CLASSIFICATION = /^(?:polarity:(?:supportive|challenging|neutral|mixed)|emphasis:(?:minor|moderate|major))$/u;

export const SAJU_CANONICAL_READER_SOURCE_MAX_BYTES = 128 * 1024;

type Data = Record<string, unknown>;

export interface SajuCanonicalReaderSourceV1 {
  readonly grounding: Data;
  readonly semanticSource: Data;
  readonly temporal?: SajuCanonicalReaderTemporalV1;
}

function isRecord(value: unknown): value is Data {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function admitSajuCanonicalReaderSourceV1(
  value: unknown,
  nativeResponse: Data,
  engineVersion: string,
  expectedPeriod?: SajuCanonicalReaderPeriodV1,
): SajuCanonicalReaderSourceV1 | null {
  if (!isRecord(value) || Object.keys(value).length !== (expectedPeriod === undefined ? 2 : 3) ||
    !isRecord(value.grounding) || !isRecord(value.semanticSource) ||
    !isRecord(nativeResponse.reading) ||
    Buffer.byteLength(JSON.stringify(value)) > SAJU_CANONICAL_READER_SOURCE_MAX_BYTES) return null;
  const { grounding, semanticSource } = value;
  const { generatedAt: _generatedAt, ...stableReading } = nativeResponse.reading;
  const stableHash = hashJson({
    responseVersion: nativeResponse.responseVersion, state: nativeResponse.state,
    messageCode: nativeResponse.messageCode, requiredAction: nativeResponse.requiredAction, reading: stableReading,
  });
  if (grounding.schemaVersion !== 'myeonghwa-character-grounding-v2' ||
    grounding.projectionVersion !== 'myeonghwa-character-grounding-projection-v3' ||
    grounding.axisRegistryVersion !== SAJU_GROUNDING_AXIS_REGISTRY_VERSION_V1 ||
    grounding.readingRef !== stableReading.readingId || grounding.productResponseVersion !== nativeResponse.responseVersion ||
    grounding.engineVersion !== engineVersion || grounding.sourceResponseHash !== stableHash ||
    typeof grounding.groundingHash !== 'string' || !HASH.test(grounding.groundingHash) ||
    typeof grounding.sourceSemanticHash !== 'string' || !HASH.test(grounding.sourceSemanticHash) ||
    semanticSource.version !== 'myeongha-official-reading-semantic-source-handoff-v1' ||
    semanticSource.semanticHash !== grounding.sourceSemanticHash ||
    typeof semanticSource.officialReportHash !== 'string' || !HASH.test(semanticSource.officialReportHash) ||
    !Array.isArray(grounding.units) || grounding.units.length === 0 || !Array.isArray(semanticSource.units)) return null;

  const canonicalRefs = new Map<string, readonly string[]>();
  for (const unit of semanticSource.units) {
    if (!isRecord(unit) || typeof unit.unitId !== 'string' || !CANONICAL_UNIT.test(unit.unitId) ||
      canonicalRefs.has(unit.unitId) || !Array.isArray(unit.factRefs) ||
      !unit.factRefs.every(ref => typeof ref === 'string') || !Array.isArray(unit.sourceRefs)) return null;
    canonicalRefs.set(unit.unitId, unit.factRefs);
  }
  for (const unit of grounding.units) {
    if (!isRecord(unit) || typeof unit.unitId !== 'string' || !UNIT.test(unit.unitId) ||
      !Array.isArray(unit.sourceCanonicalUnitRefs) || unit.sourceCanonicalUnitRefs.length === 0 ||
      unit.sourceCanonicalUnitRefs.some(ref => !canonicalRefs.has(ref)) ||
      !Array.isArray(unit.requiredCompanionUnitRefs) ||
      unit.requiredCompanionUnitRefs.some(ref => typeof ref !== 'string' || !UNIT.test(ref))) return null;
  }
  if (expectedPeriod === undefined) return { grounding, semanticSource };
  const temporal = value.temporal;
  return admitSajuCanonicalReaderTemporalV1(temporal, expectedPeriod, hashJson(nativeResponse),
    semanticSource.snapshotId, grounding.units, canonicalRefs)
    ? { grounding, semanticSource, temporal } : null;
}

/**
 * The existing Renderer accepts the V1 bundle view. Keep the canonical
 * source IDs in its provenance slots and the full source in the signed receipt.
 */
export function projectSajuCanonicalReaderGroundingV1(
  source: SajuCanonicalReaderSourceV1,
  input: Readonly<{ readingId: string; storedResponseHash: string; sajuDomain: SajuDomain }>,
) {
  const { grounding } = source;
  const sourceResponseHash = input.storedResponseHash.slice('sha256:v1:'.length);
  if (!/^sha256:v1:[0-9a-f]{64}$/u.test(input.storedResponseHash) ||
    grounding.readingDomain !== input.sajuDomain || !Array.isArray(grounding.units) || !Array.isArray(grounding.disclosures)) {
    throw new Error('Canonical Reader source is outside the purchased Reading.');
  }
  const readingRef = input.readingId;
  const unitIdV1 = (id: string) => id.replace(/^grounding_unit_v2_/u, 'grounding_unit_');
  const temporal = source.temporal === undefined ? undefined :
    projectSajuTemporalDisclosuresV1(source.temporal, grounding.disclosures.length);
  const material = {
    schemaVersion: SAJU_CHARACTER_GROUNDING_SCHEMA_VERSION_V1,
    groundingProjectionVersion: SAJU_CHARACTER_GROUNDING_PROJECTION_VERSION_V1,
    axisRegistryVersion: SAJU_GROUNDING_AXIS_REGISTRY_VERSION_V1,
    readingRef,
    productResponseVersion: grounding.productResponseVersion as string,
    engineVersion: grounding.engineVersion as string,
    readingDomain: input.sajuDomain,
    sourceResponseHash,
    units: grounding.units.map((unit: Data) => ({
      unitId: unitIdV1(unit.unitId as string),
      domain: unit.domain, axis: unit.axis, narrativeRole: unit.narrativeRole,
      semanticKey: unit.semanticKey, canonicalMeaning: unit.canonicalMeaning,
      sourceBlockRefs: unit.sourceCanonicalUnitRefs,
      // V2 puts claim classification tags in this field alongside actual
      // qualifiers. The signed receipt retains those tags for provenance.
      qualifiers: Array.isArray(unit.qualifiers)
        ? unit.qualifiers.filter(qualifier => typeof qualifier !== 'string' || !CLAIM_CLASSIFICATION.test(qualifier))
        : unit.qualifiers,
      prohibitedExtensions: unit.prohibitedExtensions,
      requiredCompanionUnitRefs: (unit.requiredCompanionUnitRefs as string[]).map(unitIdV1),
      requiredDisclosureRefs: temporal === undefined || !Array.isArray(unit.requiredDisclosureRefs)
        ? unit.requiredDisclosureRefs
        : [...unit.requiredDisclosureRefs, ...(temporal.refsByUnit.get(unit.unitId as string) ?? [])],
      realizationPolicyRef: unit.realizationPolicyRef,
    })),
    disclosures: temporal === undefined ? grounding.disclosures : [...grounding.disclosures, ...temporal.disclosures],
    ambiguities: grounding.ambiguities,
  };
  const groundingHash = hashCharacterSajuGroundingBundleMaterialV1(material);
  return admitCharacterSajuGroundingBundleViewV1({
    candidate: { ...material, groundingHash },
    expectedRef: {
      schemaVersion: material.schemaVersion, groundingProjectionVersion: material.groundingProjectionVersion,
      axisRegistryVersion: material.axisRegistryVersion, readingRef, productResponseVersion: material.productResponseVersion,
      engineVersion: material.engineVersion, readingDomain: material.readingDomain, sourceResponseHash, groundingHash,
    },
  });
}
