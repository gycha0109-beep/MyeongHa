import { hashProtectedSajuTextV1 } from '../../../packages/domain/src/index.js';
import type { OfficialReadingReaderAdmissionScopeV1 } from './official-reading-reader-admission-v1.js';
import type { CharacterStandardReadingProtectedSajuContextV1 } from './character-standard-reading-protected-context.js';

/**
 * S3 candidate-shape audit ONLY. This is not Saju owner attestation, semantic
 * truth, signed issuer verification, paid disclosure, or a T2 commit permit.
 * It intentionally has no positive approval output or persistent write.
 */
export const OFFICIAL_READER_S3_COVERAGE_PREFLIGHT_VERSION_V1 =
  'official-reader-s3-source-coverage-preflight-v1' as const;

type RecordValue = Record<string, unknown>;
const HASH = /^[a-f0-9]{64}$/u;
const PROTECTED_TEXT_HASH = /^sha256:v1:[a-f0-9]{64}$/u;
function object(value: unknown): value is RecordValue {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function fields(value: RecordValue, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
function validHash(value: unknown): value is string {
  return typeof value === 'string' && HASH.test(value);
}
function validProtectedHash(value: unknown): value is string {
  return typeof value === 'string' && PROTECTED_TEXT_HASH.test(value);
}
function string(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 512
    && value.trim() === value;
}
type UnitV1 = Readonly<{ sourceRef: string; contentHash: string }>;
function validUnit(item: unknown): item is UnitV1 {
  return object(item) && fields(item, ['sourceRef', 'contentHash'])
    && string(item.sourceRef) && validProtectedHash(item.contentHash);
}
function indexedUnits(value: unknown): ReadonlyMap<string, string> | null {
  if (!Array.isArray(value) || value.length > 128) return null;
  const units = new Map<string, string>();
  for (const unit of value) {
    if (!validUnit(unit) || units.has(unit.sourceRef)) return null;
    units.set(unit.sourceRef, unit.contentHash);
  }
  return units;
}
function exactUnits(actual: ReadonlyMap<string, string>, expected: ReadonlyMap<string, string>): boolean {
  return actual.size === expected.size
    && [...expected].every(([ref, hash]) => actual.get(ref) === hash);
}
function safeVerdict(value: unknown): boolean {
  return object(value) && fields(value, ['state', 'revision', 'evidenceDigest'])
    && value.state === 'passed' && string(value.revision)
    && validHash(value.evidenceDigest);
}
export type OfficialReaderS3CoveragePreflightV1 = Readonly<{
  version: typeof OFFICIAL_READER_S3_COVERAGE_PREFLIGHT_VERSION_V1;
  state: 'blocked' | 'held';
  reason: 'invalid_or_incomplete_source_units' | 'saju_issuer_and_privacy_approval_missing';
  sourceAuthority: 'NOT_EVALUATED';
  semanticAuthority: 'NOT_EVALUATED';
  outputAuthority: 'NOT_EVALUATED';
  canExecute: false;
  canPublish: false;
  canSell: false;
  publicDisclosureAuthorized: false;
}>;
function verdict(state: 'blocked' | 'held'): OfficialReaderS3CoveragePreflightV1 {
  return Object.freeze({
    version: OFFICIAL_READER_S3_COVERAGE_PREFLIGHT_VERSION_V1,
    state,
    reason: state === 'blocked'
      ? 'invalid_or_incomplete_source_units' as const
      : 'saju_issuer_and_privacy_approval_missing' as const,
    sourceAuthority: 'NOT_EVALUATED' as const,
    semanticAuthority: 'NOT_EVALUATED' as const,
    outputAuthority: 'NOT_EVALUATED' as const,
    canExecute: false as const, canPublish: false as const, canSell: false as const,
    publicDisclosureAuthorized: false as const,
  });
}

/**
 * Compare an untrusted proposed source manifest against the exact text hashes
 * projected from an independently DB-authorized official artifact.
 *
 * Only Saju can define/issue a signed, subject-bound source-unit proof. Even
 * full structural coverage returns HELD: strings, unsigned validation flags,
 * and signed Preview TRANSPORT proofs cannot become production authority.
 * No source text, hash, personal identifier, or candidate is returned.
 */
export function preflightOfficialReaderS3SourceCoverageV1(input: Readonly<{
  scope: OfficialReadingReaderAdmissionScopeV1;
  protectedSource: CharacterStandardReadingProtectedSajuContextV1;
  candidate: unknown;
}>): OfficialReaderS3CoveragePreflightV1 {
  try {
    const { scope, protectedSource, candidate } = input;
    if (!object(candidate) || !fields(candidate, [
      'schemaVersion', 'officialReadingId', 'officialArtifactResponseHash',
      'selectedUnits', 'coPresentUnits', 'disclosureUnits', 'ambiguityHashes',
      'semanticValidation', 'outputValidation',
    ]) || candidate.schemaVersion !== OFFICIAL_READER_S3_COVERAGE_PREFLIGHT_VERSION_V1
      || !string(scope.readingId) || !string(scope.officialArtifactResponseHash)
      || protectedSource.readingRef !== scope.readingId
      || protectedSource.domain !== scope.sajuDomain
      || candidate.officialReadingId !== scope.readingId
      || candidate.officialArtifactResponseHash !== scope.officialArtifactResponseHash
      || !safeVerdict(candidate.semanticValidation)
      || !safeVerdict(candidate.outputValidation)) return verdict('blocked');

    const selected = indexedUnits(candidate.selectedUnits);
    const coPresent = indexedUnits(candidate.coPresentUnits);
    const disclosures = indexedUnits(candidate.disclosureUnits);
    if (selected === null || coPresent === null || disclosures === null
      || selected.size === 0) return verdict('blocked');

    const expectedSegments = new Map<string, string>();
    const segmentIds = new Set<string>();
    for (const segment of protectedSource.protectedSegments) {
      if (!string(segment.segmentId) || segmentIds.has(segment.segmentId)
        || segment.sourceReadingRef !== scope.readingId
        || !string(segment.sourceRef) || !validProtectedHash(segment.contentHash)
        || expectedSegments.has(segment.sourceRef)
        || hashProtectedSajuTextV1(segment.text) !== segment.contentHash) return verdict('blocked');
      segmentIds.add(segment.segmentId);
      expectedSegments.set(segment.sourceRef, segment.contentHash);
    }
    const combined = new Map(selected);
    for (const [ref, hash] of coPresent) {
      if (combined.has(ref)) return verdict('blocked');
      combined.set(ref, hash);
    }
    if (!exactUnits(combined, expectedSegments)) return verdict('blocked');

    const expectedDisclosures = new Map<string, string>();
    for (const unit of protectedSource.disclosures) {
      if (!string(unit.segmentId) || segmentIds.has(unit.segmentId)
        || unit.sourceReadingRef !== scope.readingId
        || expectedSegments.has(unit.sourceRef)
        || !string(unit.sourceRef) || !validProtectedHash(unit.contentHash)
        || expectedDisclosures.has(unit.sourceRef)
        || hashProtectedSajuTextV1(unit.text) !== unit.contentHash) return verdict('blocked');
      segmentIds.add(unit.segmentId);
      expectedDisclosures.set(unit.sourceRef, unit.contentHash);
    }
    if (!exactUnits(disclosures, expectedDisclosures)) return verdict('blocked');

    const ambiguityHashes: unknown = candidate.ambiguityHashes;
    if (!Array.isArray(ambiguityHashes)
      || ambiguityHashes.length !== protectedSource.ambiguity.length
      || ambiguityHashes.length > 128
      || ambiguityHashes.some((value: unknown) => !validProtectedHash(value))) return verdict('blocked');
    const expectedAmbiguity = protectedSource.ambiguity.map(text => hashProtectedSajuTextV1(text));
    if (new Set(expectedAmbiguity).size !== expectedAmbiguity.length
      || new Set(ambiguityHashes).size !== ambiguityHashes.length
      || expectedAmbiguity.some((hash, i) => ambiguityHashes[i] !== hash)) return verdict('blocked');
    return verdict('held');
  } catch {
    return verdict('blocked');
  }
}
