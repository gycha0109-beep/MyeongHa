import { describe, expect, it } from 'vitest';
import { hashProtectedSajuTextV1 } from '../../../packages/domain/src/index.js';
import type { OfficialReadingReaderAdmissionScopeV1 } from './official-reading-reader-admission-v1.js';
import type { CharacterStandardReadingProtectedSajuContextV1 } from './character-standard-reading-protected-context.js';
import {
  OFFICIAL_READER_S3_COVERAGE_PREFLIGHT_VERSION_V1,
  preflightOfficialReaderS3SourceCoverageV1,
} from './official-reader-s3-source-coverage-preflight-v1.js';

const scope = {
  readingId: 'official-reading-A',
  sajuDomain: 'relationship',
  officialArtifactResponseHash: 'a'.repeat(64),
} as OfficialReadingReaderAdmissionScopeV1;
const raw = '민감한 유료 사주 해설 원문';
const another = '반드시 동반해야 하는 근거';
const disclosure = '불확실성을 포함하는 고지';
const ambiguous = '시나리오 A와 B 모두 가능';

function source() {
  return {
    readingRef: scope.readingId,
    domain: scope.sajuDomain,
    protectedSegments: [
      { sourceRef: 'sections.0.0', text: raw, contentHash: hashProtectedSajuTextV1(raw) },
      { sourceRef: 'sections.0.1', text: another, contentHash: hashProtectedSajuTextV1(another) },
    ],
    disclosures: [
      { sourceRef: 'disclosures.0', text: disclosure, contentHash: hashProtectedSajuTextV1(disclosure) },
    ],
    ambiguity: [ambiguous],
  } as CharacterStandardReadingProtectedSajuContextV1;
}
function proposed() {
  return {
    schemaVersion: OFFICIAL_READER_S3_COVERAGE_PREFLIGHT_VERSION_V1,
    officialReadingId: scope.readingId,
    officialArtifactResponseHash: scope.officialArtifactResponseHash,
    selectedUnits: [{ sourceRef: 'sections.0.0', contentHash: hashProtectedSajuTextV1(raw) }],
    coPresentUnits: [{ sourceRef: 'sections.0.1', contentHash: hashProtectedSajuTextV1(another) }],
    disclosureUnits: [{ sourceRef: 'disclosures.0', contentHash: hashProtectedSajuTextV1(disclosure) }],
    ambiguityHashes: [hashProtectedSajuTextV1(ambiguous)],
    semanticValidation: { state: 'passed', revision: 'synthetic-semantic', evidenceDigest: 'b'.repeat(64) },
    outputValidation: { state: 'passed', revision: 'synthetic-output', evidenceDigest: 'c'.repeat(64) },
  };
}
function evaluate(candidate: unknown, protectedSource = source(), officialScope = scope) {
  return preflightOfficialReaderS3SourceCoverageV1({
    scope: officialScope, protectedSource, candidate,
  });
}
describe('S3 candidate-only source coverage: never a production Saju issuer', () => {
  it('checks all exact selections, co-present, disclosures and ambiguity but returns HELD without raw text', () => {
    const verdict = evaluate(proposed());
    expect(verdict).toMatchObject({
      state: 'held', sourceAuthority: 'NOT_EVALUATED',
      semanticAuthority: 'NOT_EVALUATED', outputAuthority: 'NOT_EVALUATED',
      canExecute: false, canPublish: false, canSell: false,
      publicDisclosureAuthorized: false,
    });
    const serialized = JSON.stringify(verdict);
    for (const secret of [raw, another, disclosure, ambiguous, scope.readingId, scope.officialArtifactResponseHash]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it.each([
    ['forged preview transport envelope', () => ({
      lifecycle: 'preview', state: 'held', transportIntegrity: 'VERIFIED',
      sourceAuthority: 'NOT_EVALUATED', canSell: false,
    })],
    ['different official Reading', () => ({ ...proposed(), officialReadingId: 'other-reading' })],
    ['different official response hash', () => ({ ...proposed(), officialArtifactResponseHash: 'f'.repeat(64) })],
    ['omitted companion unit', () => ({ ...proposed(), coPresentUnits: [] })],
    ['tampered selected unit hash', () => ({ ...proposed(), selectedUnits: [{ sourceRef: 'sections.0.0', contentHash: 'f'.repeat(64) }] })],
    ['duplicate selection across categories', () => ({
      ...proposed(), coPresentUnits: [
        { sourceRef: 'sections.0.0', contentHash: hashProtectedSajuTextV1(raw) },
        { sourceRef: 'sections.0.1', contentHash: hashProtectedSajuTextV1(another) },
      ],
    })],
    ['duplicate companion within category', () => ({
      ...proposed(), coPresentUnits: [
        ...proposed().coPresentUnits, ...proposed().coPresentUnits,
      ],
    })],
    ['undisclosed required warning', () => ({ ...proposed(), disclosureUnits: [] })],
    ['lost ambiguity', () => ({ ...proposed(), ambiguityHashes: [] })],
    ['tampered ambiguity', () => ({ ...proposed(), ambiguityHashes: ['f'.repeat(64)] })],
    ['missing semantic verdict', () => ({ ...proposed(), semanticValidation: null })],
    ['failed output verdict', () => ({
      ...proposed(), outputValidation: { ...proposed().outputValidation, state: 'failed' },
    })],
    ['forged extra source authority', () => ({ ...proposed(), sourceAuthority: 'VERIFIED' })],
  ])('blocks %s (nothing released)', (_name, candidate) => {
    expect(evaluate(candidate())).toMatchObject({
      state: 'blocked', publicDisclosureAuthorized: false,
      canPublish: false, canSell: false,
    });
  });

  it('rejects a different DB-authorized Reading without returning source text', () => {
    const verdict = evaluate(proposed(), {
      ...source(), readingRef: 'different-reading',
    });
    expect(verdict).toMatchObject({ state: 'blocked', publicDisclosureAuthorized: false });
    expect(JSON.stringify(verdict)).not.toContain(raw);
  });

  it('blocks modified official protected content even if supplied manifest uses old hashes', () => {
    const s = source();
    const changed = {
      ...s,
      protectedSegments: [{ ...s.protectedSegments[0]!, text: '변조된 유료 해설' }, s.protectedSegments[1]!],
    };
    expect(evaluate(proposed(), changed)).toMatchObject({ state: 'blocked' });
  });
});
