import type { CharacterStandardReadingKnowledgeSourceV1 } from './character-standard-reading-knowledge.js';
import {
  projectOfficialStandardReadingToProtectedCharacterSajuContextV1,
} from './character-standard-reading-protected-context.js';
import type {
  OfficialReadingReaderAdmissionScopeV1,
} from './official-reading-reader-admission-v1.js';
import {
  OFFICIAL_READER_S3_COVERAGE_PREFLIGHT_VERSION_V1,
  preflightOfficialReaderS3SourceCoverageV1,
  type OfficialReaderS3CoveragePreflightV1,
} from './official-reader-s3-source-coverage-preflight-v1.js';

const BLOCKED: OfficialReaderS3CoveragePreflightV1 = Object.freeze({
  version: OFFICIAL_READER_S3_COVERAGE_PREFLIGHT_VERSION_V1,
  state: 'blocked',
  reason: 'invalid_or_incomplete_source_units',
  sourceAuthority: 'NOT_EVALUATED',
  semanticAuthority: 'NOT_EVALUATED',
  outputAuthority: 'NOT_EVALUATED',
  canExecute: false,
  canPublish: false,
  canSell: false,
  publicDisclosureAuthorized: false,
});

/**
 * S3 offline/held bridge from an already server/DB-admitted Official Reading
 * source, NOT from a client-supplied manifest of "trusted" source segments.
 *
 * The existing source resolver MUST have performed its authoritative DB
 * access and artifact checks. Structural identity comparison and projection
 * do not attest Saju execution, semantic truth, payment or source signature.
 * No data is written, emitted or released; only constant, secret-free
 * HELD/BLOCKED decisions are returned.
 */
export function preflightOfficialReaderS3FromAdmittedArtifactV1(input: Readonly<{
  scope: OfficialReadingReaderAdmissionScopeV1;
  source: CharacterStandardReadingKnowledgeSourceV1;
  candidate: unknown;
}>): OfficialReaderS3CoveragePreflightV1 {
  try {
    const { scope, source, candidate } = input;
    if (source.subjectId !== scope.subjectId
      || source.readingId !== scope.readingId
      || source.readerCharacterId !== scope.readerCharacterId
      || source.readerContentBundleId !== scope.readerContentBundleId
      || source.productId !== scope.productId
      || source.productSpecVersion !== scope.productSpecVersion
      || source.sajuDomain !== scope.sajuDomain
      || source.readingContractVersion !== scope.readingContractVersion
      || source.responseHash !== scope.officialArtifactResponseHash
      || source.productResponseState !== 'delivered') {
      return BLOCKED;
    }

    // The projection re-verifies the exact stored ProductReadingResponse
    // contract/state/Reading identity, and rehashes its protected source text.
    // Partial fallback Readings must not silently become complete paid proofs.
    const protectedSource =
      projectOfficialStandardReadingToProtectedCharacterSajuContextV1(source);
    if (protectedSource.coverageState !== 'complete') return BLOCKED;

    return preflightOfficialReaderS3SourceCoverageV1({
      scope, protectedSource, candidate,
    });
  } catch {
    // Raw birth data, Reading text and provider errors must never escape.
    return BLOCKED;
  }
}
