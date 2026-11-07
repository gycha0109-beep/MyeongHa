import { describe, expect, it } from 'vitest';
import {
  READER_SAJU_CONSULTATION_EDITORIAL_CRITERIA_V1,
  assessReaderSajuPrivateConsultationPairV1,
  type ReaderSajuConsultationEditorialReviewV1,
} from '../apps/api/src/reader-saju-consultation-editorial-evaluation-v1.js';
import type {
  ReaderSajuPrivatePairComparisonV1,
} from '../apps/api/src/reader-saju-private-pair-comparison-v1.js';
import {
  CHARACTER_SAJU_CONSULTATION_SHADOW_VERSION_V1,
} from '../apps/api/src/character-saju-consultation-shadow-v1.js';

function pair(): Extract<ReaderSajuPrivatePairComparisonV1, {status:'ready_for_private_review'}> {
  const common = {
    schemaVersion: CHARACTER_SAJU_CONSULTATION_SHADOW_VERSION_V1,
    readingRef: 'official-reading-1',
    sourceResponseHash: 'source-hash-1',
    groundingHash: 'grounding-hash-1',
    sourceUnitId: 'unit-1',
    sourceBlockRefs: ['source-1'],
    baselineText: '공식 판독 의미 하나',
    evaluation: 'accepted' as const,
    failureCodes: [],
    evaluatorVersion: 'offline-model-review-v1',
  };
  return {
    status: 'ready_for_private_review',
    schemaVersion: 'reader-saju-private-pair-comparison-v1',
    readingRef: common.readingRef,
    sourceResponseHash: common.sourceResponseHash,
    groundingHash: common.groundingHash,
    sourceUnitId: common.sourceUnitId,
    officialSourceRefs: common.sourceBlockRefs,
    officialMeaning: common.baselineText,
    first: {
      ...common,
      characterId: 'baekheon',
      candidateText: '이 사주의 직업적 특징은 공식 판정대로입니다.',
      candidateHash: 'candidate-hash-1',
    },
    second: {
      ...common,
      characterId: 'seyeon',
      candidateText: '이 부분에서는 공식적으로 확인된 특징이 먼저 보여요.',
      candidateHash: 'candidate-hash-2',
    },
    publicationAuthorized: false,
  };
}

function review(characterId: string, hash: string, failing?: string):
  ReaderSajuConsultationEditorialReviewV1 {
  return {
    characterId,
    candidateHash: hash,
    evaluations: READER_SAJU_CONSULTATION_EDITORIAL_CRITERIA_V1.map((criterion) => ({
      criterion,
      judgement: criterion === failing ? 'fail' as const : 'pass' as const,
      note: criterion === failing ? '이 부분은 교과서 설명만 반복합니다.' : '',
    })),
  };
}

describe('Reader consultation owner editorial assessment — offline and never authorizing publication', () => {
  it('does not infer paid-product readiness or public rights even if both Readers pass the first unit', () => {
    const source = pair();
    const result = assessReaderSajuPrivateConsultationPairV1({
      pair: source,
      reviews: [
        review('baekheon', 'candidate-hash-1'),
        review('seyeon', 'candidate-hash-2'),
      ],
    });
    expect(result.outcome).toBe('eligible_for_larger_offline_trial');
    expect(result.first.evaluatedCriteria).toBe(5);
    expect(result.second.passedCriteria).toBe(5);
    expect(result.fullProductQualityProven).toBe(false);
    expect(result.publicRevealAuthorized).toBe(false);
    expect(result.coverageScope).toBe('single_official_unit_only');
    expect(result.sourceBlockRefs).toEqual(['source-1']);
    expect(result).not.toHaveProperty('candidateText');
    expect(result).not.toHaveProperty('baselineText');
  });

  it('requires explicit owner review rather than treating independent model grades as human approval', () => {
    const result = assessReaderSajuPrivateConsultationPairV1({ pair: pair(), reviews: [] });
    expect(result.outcome).toBe('awaiting_owner_review');
    expect(result.first.evaluatedCriteria).toBe(0);
    expect(result.first.pendingCriteria).toEqual(READER_SAJU_CONSULTATION_EDITORIAL_CRITERIA_V1);
    expect(result.publicRevealAuthorized).toBe(false);
  });

  it('records an editorial failure even when an LLM semantic evaluator marked both outputs accepted', () => {
    const result = assessReaderSajuPrivateConsultationPairV1({
      pair: pair(),
      reviews: [
        review('baekheon', 'candidate-hash-1', 'PERSONALIZED_OPENING'),
        review('seyeon', 'candidate-hash-2'),
      ],
    });
    expect(result.outcome).toBe('failed_editorial_review');
    expect(result.first.failedCriteria).toEqual(['PERSONALIZED_OPENING']);
    expect(result.publicRevealAuthorized).toBe(false);
  });

  it('fails on a semantic reject regardless of glowing owner ratings', () => {
    const source = pair();
    const result = assessReaderSajuPrivateConsultationPairV1({
      pair: { ...source, second: { ...source.second, evaluation: 'rejected' } },
      reviews: [
        review('baekheon', 'candidate-hash-1'),
        review('seyeon', 'candidate-hash-2'),
      ],
    });
    expect(result.outcome).toBe('failed_semantic_gate');
    expect(result.second.semanticGate).toBe('rejected');
  });

  it('refuses wrong-Reader votes, stale candidate hashes, missing evidence notes, or noncomparable sources', () => {
    const source = pair();
    expect(() => assessReaderSajuPrivateConsultationPairV1({
      pair: source,
      reviews: [review('other-character', 'candidate-hash-1')],
    })).toThrow('no matching');
    expect(() => assessReaderSajuPrivateConsultationPairV1({
      pair: source,
      reviews: [review('baekheon', 'old-candidate-hash')],
    })).toThrow('does not match');
    const first = review('baekheon', 'candidate-hash-1');
    expect(() => assessReaderSajuPrivateConsultationPairV1({
      pair: source,
      reviews: [{
        ...first,
        evaluations: first.evaluations.map((x) => ({
          ...x,
          judgement: 'fail' as const,
          note: '',
        })),
      }],
    })).toThrow('valid recorded judgement');
    expect(() => assessReaderSajuPrivateConsultationPairV1({
      pair: { status: 'incomplete', missingCharacterIds: ['seyeon'] },
      reviews: [],
    })).toThrow('identical verified official');
  });
});
