import { describe, expect, it } from 'vitest';
import {
  createReaderSajuPrivateMultiUnitPairCollectorV1,
} from '../apps/api/src/reader-saju-private-multi-unit-pair-v1.js';
import type {
  CharacterSajuConsultationPrivateBatchComparisonV1,
} from '../apps/api/src/character-saju-consultation-shadow-v1.js';

const scope = {
  readingRef: 'official-reading-1',
  sourceResponseHash: 'source-hash-1',
  groundingHash: 'grounding-hash-1',
  firstCharacterId: 'baekheon',
  secondCharacterId: 'seyeon',
} as const;

function record(
  characterId: string,
  unitIds: readonly string[],
  rejected: string | null = null,
): CharacterSajuConsultationPrivateBatchComparisonV1 {
  return {
    schemaVersion: 'myeongha-character-saju-consultation-multi-unit-shadow-v1',
    readingRef: scope.readingRef,
    sourceResponseHash: scope.sourceResponseHash,
    groundingHash: scope.groundingHash,
    characterId,
    sourceUnitIds: unitIds,
    units: unitIds.map((unitId) => ({
      sourceUnitId: unitId,
      sourceBlockRefs: ['official-source-' + unitId],
      baselineText: '공식 의미-' + unitId,
      candidateText: characterId + ' 상담 표현-' + unitId,
      candidateHash: characterId + unitId,
      evaluation: rejected === unitId ? 'rejected' as const : 'accepted' as const,
      failureCodes: rejected === unitId ? ['ADDED_CLAIM'] : [],
    })),
    evaluatorVersion: 'offline-evaluation-v1',
    revealState: 'forbidden',
  };
}

describe('private three-to-four-unit character pair comparison', () => {
  it('compares identical Saju facts even when two character voices use different narrative order', async () => {
    const pair = createReaderSajuPrivateMultiUnitPairCollectorV1(scope);
    expect(pair.readPrivateReview()).toMatchObject({
      status: 'incomplete',
      missingCharacterIds: ['baekheon', 'seyeon'],
    });
    await pair.recordPrivateBatchComparison(record('baekheon', ['one', 'two', 'three']));
    await pair.recordPrivateBatchComparison(record('seyeon', ['three', 'one', 'two']));
    const result = pair.readPrivateReview();
    expect(result.status).toBe('ready_for_private_review');
    if (result.status !== 'ready_for_private_review') throw new Error('expected ready pair');
    expect(result.unitIds).toEqual(['one', 'two', 'three']);
    expect(result.first.units.map((x) => x.sourceUnitId)).toEqual(['one', 'two', 'three']);
    expect(result.second.units.map((x) => x.sourceUnitId)).toEqual(['three', 'one', 'two']);
    expect(result.allSemanticEvaluationsAccepted).toBe(true);
    expect(result.fullProductQualityProven).toBe(false);
    expect(result.publicRevealAuthorized).toBe(false);
  });

  it('refuses an unrelated unit set instead of treating it as the same natal chart', async () => {
    const pair = createReaderSajuPrivateMultiUnitPairCollectorV1(scope);
    await pair.recordPrivateBatchComparison(record('baekheon', ['one', 'two', 'three']));
    await pair.recordPrivateBatchComparison(record('seyeon', ['one', 'two', 'other']));
    expect(pair.readPrivateReview()).toMatchObject({ status: 'different_source_units' });
  });

  it('rejects changed original wording even if the unit identifiers match', async () => {
    const pair = createReaderSajuPrivateMultiUnitPairCollectorV1(scope);
    await pair.recordPrivateBatchComparison(record('baekheon', ['one', 'two', 'three']));
    const altered = record('seyeon', ['one', 'two', 'three']);
    await pair.recordPrivateBatchComparison({
      ...altered,
      units: altered.units.map((x) => x.sourceUnitId === 'two'
        ? { ...x, baselineText: '바뀐 원문' } : x),
    });
    expect(() => pair.readPrivateReview()).toThrow('exact source-owned baseline');
  });

  it('retains semantic reviewer failures as failures, never as a public quality pass', async () => {
    const pair = createReaderSajuPrivateMultiUnitPairCollectorV1(scope);
    await pair.recordPrivateBatchComparison(record('baekheon', ['one', 'two', 'three']));
    await pair.recordPrivateBatchComparison(record('seyeon', ['one', 'two', 'three'], 'two'));
    const result = pair.readPrivateReview();
    expect(result.status).toBe('ready_for_private_review');
    if (result.status !== 'ready_for_private_review') throw new Error('expected ready');
    expect(result.allSemanticEvaluationsAccepted).toBe(false);
    expect(result.publicRevealAuthorized).toBe(false);
  });

  it('rejects duplicate characters, source swaps, and missing source units', async () => {
    const pair = createReaderSajuPrivateMultiUnitPairCollectorV1(scope);
    await expect(pair.recordPrivateBatchComparison({
      ...record('baekheon', ['one', 'two', 'three']),
      sourceResponseHash: 'other-source',
    })).rejects.toThrow('source or reader identity');
    await expect(pair.recordPrivateBatchComparison(record('baekheon', ['one', 'one', 'three'])))
      .rejects.toThrow('source or reader identity');
    await pair.recordPrivateBatchComparison(record('baekheon', ['one', 'two', 'three']));
    await expect(pair.recordPrivateBatchComparison(record('baekheon', ['one', 'two', 'three'])))
      .rejects.toThrow('source or reader identity');
  });
});
