import { describe, expect, it } from 'vitest';
import { createReaderSajuPrivateMultiUnitPairCollectorV1 } from
  '../apps/api/src/reader-saju-private-multi-unit-pair-v1.js';
import { READER_SAJU_CONSULTATION_EDITORIAL_CRITERIA_V1 } from
  '../apps/api/src/reader-saju-consultation-editorial-evaluation-v1.js';
import {
  assessReaderSajuPrivateMultiUnitConsultationV1,
  type ReaderSajuMultiUnitEditorialUnitReviewV1,
} from '../apps/api/src/reader-saju-multi-unit-editorial-evaluation-v1.js';
import type { CharacterSajuConsultationPrivateBatchComparisonV1 } from
  '../apps/api/src/character-saju-consultation-shadow-v1.js';

const scope = {
  readingRef: 'official-reading-1',
  sourceResponseHash: 'source-v1',
  groundingHash: 'grounding-v1',
  firstCharacterId: 'baekheon',
  secondCharacterId: 'seyeon',
} as const;
function batch(characterId: string, ids: readonly string[], rejected?: string,
  identical = false): CharacterSajuConsultationPrivateBatchComparisonV1 {
  return {
    schemaVersion: 'myeongha-character-saju-consultation-multi-unit-shadow-v1',
    readingRef: scope.readingRef,
    sourceResponseHash: scope.sourceResponseHash,
    groundingHash: scope.groundingHash,
    characterId, sourceUnitIds: ids,
    units: ids.map((sourceUnitId) => ({
      sourceUnitId, sourceBlockRefs: ['official-source-' + sourceUnitId],
      baselineText: '공식 판정-' + sourceUnitId,
      candidateText: identical ? '같은 말-' + sourceUnitId : characterId + ' 상담-' + sourceUnitId,
      candidateHash: characterId + '-' + sourceUnitId,
      evaluation: sourceUnitId === rejected ? 'rejected' as const : 'accepted' as const,
      failureCodes: sourceUnitId === rejected ? ['ADDED_CLAIM'] : [],
    })),
    evaluatorVersion: 'offline-review-v1', revealState: 'forbidden',
  };
}
async function ready(rejected?: string, identical = false) {
  const collector = createReaderSajuPrivateMultiUnitPairCollectorV1(scope);
  await collector.recordPrivateBatchComparison(batch('baekheon', ['a', 'b', 'c'], rejected, identical));
  await collector.recordPrivateBatchComparison(batch('seyeon', ['c', 'a', 'b'], undefined, identical));
  return collector.readPrivateReview();
}
function reviews(): ReaderSajuMultiUnitEditorialUnitReviewV1[] {
  return ['baekheon', 'seyeon'].flatMap((characterId) =>
    ['a', 'b', 'c'].map((sourceUnitId) => ({
      characterId, sourceUnitId, candidateHash: characterId + '-' + sourceUnitId,
      evaluations: READER_SAJU_CONSULTATION_EDITORIAL_CRITERIA_V1.map((criterion) => ({
        criterion, judgement: 'pass' as const, note: '',
      })),
    })));
}
function assess(pair: Awaited<ReturnType<typeof ready>>,
  data?: Partial<Parameters<typeof assessReaderSajuPrivateMultiUnitConsultationV1>[0]>) {
  return assessReaderSajuPrivateMultiUnitConsultationV1({
    pair, unitReviews: [], flowReviews: [], ...data,
  });
}
const complete = {
  unitReviews: reviews(),
  flowReviews: ['baekheon', 'seyeon'].map((characterId) => ({
    characterId, judgement: 'pass' as const, note: '',
  })),
  voiceComparison: { judgement: 'pass' as const, note: '' },
};

describe('private 3–4 unit Saju consultation editorial comparison', () => {
  it('never treats semantic approval as a substitute for actual human judgement', async () => {
    const result = assess(await ready());
    expect(result.outcome).toBe('awaiting_owner_review');
    expect(result.units[0]?.first.pendingCriteria).toHaveLength(5);
    expect(result.publicRevealAuthorized).toBe(false);
    expect(result.units[0]).not.toHaveProperty('baselineText');
    expect(result.units[0]).not.toHaveProperty('candidateText');
  });
  it('compares two Readers in different orders without claiming real-model or product readiness', async () => {
    const result = assess(await ready(), complete);
    expect(result.outcome).toBe('offline_editorial_pass_only');
    expect(result.units).toHaveLength(3);
    expect(result.units[1]?.first.passedCriteria).toBe(5);
    expect(result.units[1]?.second.passedCriteria).toBe(5);
    expect(result.realModelQualityProven).toBe(false);
    expect(result.fullProductQualityProven).toBe(false);
    expect(result.publicRevealAuthorized).toBe(false);
  });
  it('semantic rejection overrides unanimous positive editorial votes', async () => {
    expect(assess(await ready('b'), complete).outcome).toBe('failed_semantic_gate');
  });
  it('identical Reader wording cannot pass the distinct-voice check', async () => {
    const result = assess(await ready(undefined, true), complete);
    expect(result.readerVoiceDifference).toBe('fail');
    expect(result.outcome).toBe('failed_editorial_review');
  });
  it('rejects stale candidate references, duplicate reviews and missing failure notes', async () => {
    const pair = await ready();
    expect(() => assess(pair, {
      unitReviews: [{ ...reviews()[0]!, candidateHash: 'stale' }],
    })).toThrow('stale');
    expect(() => assess(pair, {
      unitReviews: [reviews()[0]!, reviews()[0]!],
    })).toThrow('Duplicate');
    expect(() => assess(pair, {
      flowReviews: [{ characterId: 'baekheon', judgement: 'fail', note: '' }],
    })).toThrow('failure note');
  });
  it('requires explicit flow and voice judgements in addition to per-unit reviews', async () => {
    expect(assess(await ready(), { unitReviews: reviews() }).outcome)
      .toBe('awaiting_owner_review');
    expect(assess(await ready(), {
      ...complete,
      flowReviews: [{ characterId: 'baekheon', judgement: 'fail', note: '연결이 부자연스럽습니다.' }],
    }).outcome).toBe('failed_editorial_review');
  });
});
