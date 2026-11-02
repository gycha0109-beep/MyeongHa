import { describe, expect, it } from 'vitest';
import { hashProtectedSajuTextV1 } from '../../../packages/domain/src/index.js';
import type { CharacterStandardReadingKnowledgeSourceV1 } from './character-standard-reading-knowledge.js';
import type { OfficialReadingReaderAdmissionScopeV1 } from './official-reading-reader-admission-v1.js';
import {
  OFFICIAL_READER_S3_COVERAGE_PREFLIGHT_VERSION_V1,
} from './official-reader-s3-source-coverage-preflight-v1.js';
import {
  preflightOfficialReaderS3FromAdmittedArtifactV1,
} from './official-reader-s3-authoritative-artifact-coverage-v1.js';

const READING = '11111111-1111-4111-8111-111111111111';
const SUBJECT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const RAW = '해당 회원의 비공개 공식 사주 원본';
const COMPANION = '동반 확인해야 하는 정밀 근거';
const WARNING = '해석 시점에 유의할 필수 안내';
const AMBIGUITY = '시각 경계\n경계 시간은 추가 확인이 필요합니다.';
const RESPONSE_HASH = 'sha256:v1:official-db-artifact-hash';
const SCOPE = {
  subjectId: SUBJECT,
  threadId: '66666666-6666-4666-8666-666666666666',
  contentRevision: 9,
  readingId: READING,
  readerCharacterId: 'baekheon',
  readerContentBundleId: '55555555-5555-4555-8555-555555555555',
  contentReleaseId: 'release-9',
  effectiveAt: '2026-10-19T00:00:00Z',
  productId: '33333333-3333-4333-8333-333333333333',
  productSpecVersion: 'standard-reading-v1',
  sajuDomain: 'general',
  readingContractVersion: 'myeonghwa-product-reading-response-v2',
  officialArtifactResponseHash: RESPONSE_HASH,
  productRuleVersion: 'general-reader-rule-v1',
  approvedPolicyRevision: 'policy-9',
} as OfficialReadingReaderAdmissionScopeV1;

function source(overrides: Partial<CharacterStandardReadingKnowledgeSourceV1> = {})
: CharacterStandardReadingKnowledgeSourceV1 {
  return {
    subjectId: SUBJECT, readingId: READING,
    readingSessionId: '22222222-2222-4222-8222-222222222222',
    productId: SCOPE.productId, readerCharacterId: SCOPE.readerCharacterId,
    readerContentBundleId: SCOPE.readerContentBundleId, topicKey: 'general',
    sajuDomain: 'general', readingPeriod: 'original', readingVariant: 'standard',
    sourceBirthRevisionId: '44444444-4444-4444-8444-444444444444',
    productSpecVersion: SCOPE.productSpecVersion,
    domainCapabilityVersion: 'general-v1',
    readingContractVersion: SCOPE.readingContractVersion,
    sajuEngineVersion: 'saju-v1',
    responseHash: RESPONSE_HASH, productResponseState: 'delivered',
    responseSnapshotJsonb: {
      responseVersion: SCOPE.readingContractVersion,
      state: 'delivered',
      reading: {
        readingId: READING,
        sections: [
          { sectionType: 'overview', title: '전체', blocks: [
            { type: 'paragraph', text: RAW },
            { type: 'key_points', items: [COMPANION] },
          ] },
        ],
        disclosures: [{ type: 'scope_limitation', text: WARNING }],
        calculationSummary: {
          ambiguity: [{ title: '시각 경계', summary: '경계 시간은 추가 확인이 필요합니다.' }],
        },
      },
    },
    completedAt: '2026-10-18T23:59:00Z',
    ...overrides,
  };
}
const sourceRef = 'response.reading.sections.0.blocks.0';
const companionRef = 'response.reading.sections.0.blocks.1.items.0';
const warningRef = 'response.reading.disclosures.0';

function candidate() {
  return {
    schemaVersion: OFFICIAL_READER_S3_COVERAGE_PREFLIGHT_VERSION_V1,
    officialReadingId: READING,
    officialArtifactResponseHash: RESPONSE_HASH,
    selectedUnits: [{ sourceRef, contentHash: hashProtectedSajuTextV1(RAW) }],
    coPresentUnits: [{ sourceRef: companionRef, contentHash: hashProtectedSajuTextV1(COMPANION) }],
    disclosureUnits: [{ sourceRef: warningRef, contentHash: hashProtectedSajuTextV1(WARNING) }],
    ambiguityHashes: [hashProtectedSajuTextV1(AMBIGUITY)],
    semanticValidation: {
      state: 'passed', revision: 'synthetic-not-trusted', evidenceDigest: 'a'.repeat(64),
    },
    outputValidation: {
      state: 'passed', revision: 'synthetic-not-trusted', evidenceDigest: 'b'.repeat(64),
    },
  };
}
function run(input: {
  scope?: OfficialReadingReaderAdmissionScopeV1;
  source?: CharacterStandardReadingKnowledgeSourceV1;
  candidate?: unknown;
} = {}) {
  return preflightOfficialReaderS3FromAdmittedArtifactV1({
    scope: input.scope ?? SCOPE,
    source: input.source ?? source(),
    candidate: input.candidate ?? candidate(),
  });
}

describe('S3 Official Reading DB source -> protected Source closure (held only)', () => {
  it('projects the real stored v2 Reading rather than trusting caller-provided protected segments', () => {
    const verdict = run();
    expect(verdict).toMatchObject({
      state: 'held', sourceAuthority: 'NOT_EVALUATED',
      semanticAuthority: 'NOT_EVALUATED', outputAuthority: 'NOT_EVALUATED',
      canExecute: false, canPublish: false, canSell: false,
      publicDisclosureAuthorized: false,
    });
    for (const secret of [SUBJECT, READING, RAW, COMPANION, WARNING, AMBIGUITY, RESPONSE_HASH]) {
      expect(JSON.stringify(verdict)).not.toContain(secret);
    }
  });

  it.each([
    ['different Subject', { subjectId: 'other-subject' }],
    ['different Reader', { readerCharacterId: 'other-reader' }],
    ['different Bundle', { readerContentBundleId: 'other-bundle' }],
    ['different Product', { productId: 'other-product' }],
    ['different Product Spec', { productSpecVersion: 'other-spec' }],
    ['different Saju domain', { sajuDomain: 'career' as const }],
    ['different original contract', { readingContractVersion: 'other-contract' }],
    ['different response hash', { responseHash: 'different-hash' }],
    ['different Reading', { readingId: 'other-reading' }],
    ['partial fallback', {
      productResponseState: 'delivered_with_fallback',
      responseSnapshotJsonb: {
        ...source().responseSnapshotJsonb as Record<string, unknown>,
        state: 'delivered_with_fallback',
      },
    }],
  ])('blocks DB %s identity drift before considering candidate evidence', (_name, modified) => {
    expect(run({ source: source(modified) })).toMatchObject({
      state: 'blocked', publicDisclosureAuthorized: false, canSell: false,
    });
  });

  it('blocks a mixed Reading id in the persisted response payload itself', () => {
    const original = source().responseSnapshotJsonb as Record<string, unknown>;
    const reading = original.reading as Record<string, unknown>;
    const bad = source({ responseSnapshotJsonb: {
      ...original,
      reading: { ...reading, readingId: 'different-reading' },
    } });
    expect(run({ source: bad }).state).toBe('blocked');
  });

  it('blocks missing mandatory disclosure, companion and ambiguity from projected v2 source', () => {
    for (const patch of [
      { coPresentUnits: [] },
      { disclosureUnits: [] },
      { ambiguityHashes: [] },
    ]) {
      expect(run({ candidate: { ...candidate(), ...patch } })).toMatchObject({
        state: 'blocked', publicDisclosureAuthorized: false,
      });
    }
  });

  it('blocks an altered text at the actual stored response even when the old candidate hashes remain unchanged', () => {
    const original = source().responseSnapshotJsonb as Record<string, unknown>;
    const reading = original.reading as Record<string, unknown>;
    const sections = reading.sections as Record<string, unknown>[];
    const changed = {
      ...original,
      reading: { ...reading, sections: [
        { ...sections[0], blocks: [
          { type: 'paragraph', text: '조작된 민감 원문' },
          { type: 'key_points', items: [COMPANION] },
        ] },
      ] },
    };
    const verdict = run({ source: source({ responseSnapshotJsonb: changed }) });
    expect(verdict.state).toBe('blocked');
    expect(JSON.stringify(verdict)).not.toContain('조작된 민감 원문');
  });

  it('blocks malformed stored response and forged candidate, returning no private artifacts', () => {
    expect(run({ source: source({ responseSnapshotJsonb: { forged: true } }) }))
      .toMatchObject({ state: 'blocked' });
    expect(run({ candidate: { sourceAuthority: 'VERIFIED', canSell: true } }))
      .toMatchObject({ state: 'blocked', canSell: false });
  });
});
