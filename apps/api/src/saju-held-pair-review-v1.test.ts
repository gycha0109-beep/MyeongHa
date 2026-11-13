import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createSajuHeldPairReviewPortV1 } from './saju-held-pair-review-v1.js';
import { hashSajuHeldSourceProofRequestV1 as hash } from './saju-held-source-proof-verifier-v1.js';

const VERSION = 'myeonghwa-held-pair-review-v1';
const keyId = 'isolated-held-pair-test';
const ownHash = 'a'.repeat(64);
const otherHash = 'b'.repeat(64);
const both = [
  { role: 'self', calculationHash: ownHash },
  { role: 'partner', calculationHash: otherHash },
];
const subjectPath = 'subject.pillars.day.value.branch';
const targetPath = 'target.pillars.day.value.branch';
const body = {
  birth: { calendarType: 'solar', date: '1990-05-15', time: '14:30', sex: 'unspecified' },
  partnerBirth: { calendarType: 'solar', date: '1996-01-09', time: '09:30', sex: 'unspecified' },
} as const;

function evidence() {
  const sample = {
    lifecycle: 'internal_preview_only',
    coverage: 'calculation_facts_only',
    generatedInterpretationClaims: false,
    mayPublish: false, mayPersist: false, maySell: false,
    evidence: {
      matches: [{
        kind: 'branch_six_combination',
        subject: { factPath: subjectPath, value: '子' },
        target: { factPath: targetPath, value: '丑' },
      }],
      readingReview: {
        state: 'held',
        actualCompatibilityReadingReady: false,
        mayGrantOfficialAuthority: false,
        charts: both,
      },
      internalServiceInterpretation: {
        version: 'saju-t10-internal-service-interpretation-v1',
        lifecycle: 'internal_policy_trial',
        policyId: 'myeongha-t10-internal-relational-explanation-v1',
        policyVersion: '2026-11-13',
        adoption: 'project_owner_service_lexicon',
        academicThirdPartyApprovalRequired: false,
        ruleCoverage: 'resolved_day_stem_branch_and_other_positions',
        charts: both,
        sentences: [
          { ruleId: 'T10-SERVICE-DAY-SIX-COMBINATION',
            paragraph: '두 명식에서 일지 간 육합 구조를 관찰했습니다.',
            observedFactPaths: [subjectPath, targetPath],
            calculationSourceIds: ['SRC-T0-YISI-ZHAN-10'], sourceDefinitionHashes: ['c'.repeat(64)],
            interpretationOwner: 'myeongha_internal_service', individualOutcomeClaimed: false },
          { ruleId: 'T10-SERVICE-DAY-STEM-NO-FIVE-COMBINATION',
            paragraph: '일간 사이에 오합이 관찰되지 않아도 이것은 관계의 실패를 뜻하지 않습니다.',
            observedFactPaths: [],
            calculationSourceIds: [], sourceDefinitionHashes: [],
            interpretationOwner: 'myeongha_internal_service', individualOutcomeClaimed: false },
          { ruleId: 'T10-SERVICE-BOUNDED-SCOPE',
            paragraph: '개인 관계의 결과나 성공 여부는 단정하지 않습니다.',
            observedFactPaths: [],
            calculationSourceIds: [], sourceDefinitionHashes: [],
            interpretationOwner: 'myeongha_internal_service', individualOutcomeClaimed: false },
        ],
        readyForOfficialIssue: false, mayPublish: false, maySell: false,
      },
    },
  };
  const meaning = sample.evidence.internalServiceInterpretation;
  const units = meaning.sentences.map(entry => {
    const value = {
      ruleId: entry.ruleId, paragraph: entry.paragraph,
      observedFactPaths: entry.observedFactPaths,
      calculationSourceIds: entry.calculationSourceIds,
      sourceDefinitionHashes: entry.sourceDefinitionHashes,
    };
    return { unitId: 't10_unit_' + hash(value).slice(0, 24), ...value };
  });
  const unsigned = {
    version: 'saju-t10-pair-reading-material-v1',
    policyId: 'myeongha-t10-internal-relational-explanation-v1',
    policyVersion: '2026-11-13', readingDomain: 'compatibility',
    interpretationOwner: 'myeongha_internal_service',
    sourceScope: 'two_canonical_natal_charts',
    charts: both.map(chart => ({ ...chart, snapshotId: 'snapshot-' + chart.role })),
    units,
  };
  return { ...sample, evidence: { ...sample.evidence, sourceReadingMaterial: {
    ...unsigned, materialHash: hash(unsigned), status: 'source_owned_candidate_unissued',
    officialIssueAuthorized: false, mayPublish: false, maySell: false,
  } } };
}

function port(candidate: unknown) {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return createSajuHeldPairReviewPortV1({
    origin: 'https://isolated.example.test',
    bearerToken: 'private-isolated-bearer-123456',
    keyId, verificationKey: publicKey,
    async fetchImpl(_url, init) {
      const submitted = JSON.parse(String(init?.body));
      const nonce = new Headers(init?.headers).get('x-myeongha-pair-review-nonce');
      const payload = {
        version: VERSION, keyId, state: 'held', nonce,
        requestBodyHash: hash(submitted), responseBodyHash: hash(candidate),
      };
      const signature = sign(null, Buffer.from(VERSION + '\0' + hash(payload)), privateKey)
        .toString('base64url');
      return Response.json(candidate, {
        headers: {
          'x-myeonghwa-reading-lifecycle': 'preview',
          'x-myeonghwa-pair-review-proof':
            Buffer.from(JSON.stringify({ payload, signature })).toString('base64url'),
        },
      });
    },
  });
}

describe('signed held T10 pair interpretation acceptance', () => {
  it('keeps both independently identified chart meanings in private held review', async () => {
    const original = evidence();
    const result = await port(original).inspectSource(body);
    expect(result).toEqual(original);
    expect(result).toMatchObject({ evidence: { internalServiceInterpretation: { charts: both } } });
    expect(result?.maySell).toBe(false);
  });

  it('rejects source-signed meaning with missing policy, changed chart or invented fact path', async () => {
    const missing = evidence();
    delete (missing.evidence as Record<string, unknown>).internalServiceInterpretation;
    expect(await port(missing).inspectSource(body)).toBeNull();
    const wrongChart = evidence();
    wrongChart.evidence.internalServiceInterpretation.charts = [
      { role: 'self', calculationHash: otherHash },
      both[1]!,
    ];
    expect(await port(wrongChart).inspectSource(body)).toBeNull();
    const fabricated = evidence();
    fabricated.evidence.internalServiceInterpretation.sentences[0]!.observedFactPaths = [
      'subject.pillars.hour.value.branch',
    ];
    expect(await port(fabricated).inspectSource(body)).toBeNull();
  });

  it('rejects a signed but incomplete day-stem axis or two mutually exclusive day rules', async () => {
    const missingStem = evidence();
    missingStem.evidence.internalServiceInterpretation.sentences =
      missingStem.evidence.internalServiceInterpretation.sentences.filter(x =>
        x.ruleId !== 'T10-SERVICE-DAY-STEM-NO-FIVE-COMBINATION');
    expect(await port(missingStem).inspectSource(body)).toBeNull();
    const duplicateDay = evidence();
    duplicateDay.evidence.internalServiceInterpretation.sentences.splice(1, 0, {
      ruleId: 'T10-SERVICE-DAY-CLASH',
      paragraph: '같은 일지에서 별도 충이 발생한 것으로 잘못 기록한 문장.',
      observedFactPaths: [],
      interpretationOwner: 'myeongha_internal_service', individualOutcomeClaimed: false,
    });
    expect(await port(duplicateDay).inspectSource(body)).toBeNull();
  });

  it('rejects missing or internally inconsistent two-chart material', async () => {
    const missing = evidence();
    delete (missing.evidence as Record<string, unknown>).sourceReadingMaterial;
    expect(await port(missing).inspectSource(body)).toBeNull();
    const changedSentence = evidence();
    changedSentence.evidence.sourceReadingMaterial.units[0]!.paragraph = '달라진 문장';
    expect(await port(changedSentence).inspectSource(body)).toBeNull();
    const changedChart = evidence();
    changedChart.evidence.sourceReadingMaterial.charts[1]!.calculationHash = ownHash;
    expect(await port(changedChart).inspectSource(body)).toBeNull();
    const attemptedIssue = evidence();
    attemptedIssue.evidence.sourceReadingMaterial.officialIssueAuthorized = true;
    expect(await port(attemptedIssue).inspectSource(body)).toBeNull();
  });

  it('rejects signed meaning that tries to become official or claim an outcome', async () => {
    const issued = evidence();
    issued.evidence.internalServiceInterpretation.readyForOfficialIssue = true;
    expect(await port(issued).inspectSource(body)).toBeNull();
    const outcome = evidence();
    outcome.evidence.internalServiceInterpretation.sentences[0]!.individualOutcomeClaimed = true;
    expect(await port(outcome).inspectSource(body)).toBeNull();
  });
});
