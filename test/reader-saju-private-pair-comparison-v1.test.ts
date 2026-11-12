import { describe, expect, it } from 'vitest';
import {
  createReaderSajuPrivatePairCollectorV1,
} from '../apps/api/src/reader-saju-private-pair-comparison-v1.js';
import {
  CHARACTER_SAJU_CONSULTATION_SHADOW_VERSION_V1,
  type CharacterSajuConsultationPrivateComparisonV1,
} from '../apps/api/src/character-saju-consultation-shadow-v1.js';

const SCOPE = Object.freeze({
  readingRef: 'official-reader-reading-1',
  sourceResponseHash: 'a'.repeat(64),
  groundingHash: 'b'.repeat(64),
  firstCharacterId: 'baekheon',
  secondCharacterId: 'seyeon',
});

function evidence(characterId: string, candidateText: string):
  CharacterSajuConsultationPrivateComparisonV1 {
  return {
    schemaVersion: CHARACTER_SAJU_CONSULTATION_SHADOW_VERSION_V1,
    readingRef: SCOPE.readingRef,
    sourceResponseHash: SCOPE.sourceResponseHash,
    groundingHash: SCOPE.groundingHash,
    characterId,
    sourceUnitId: 'grounding_unit_' + '1'.repeat(24),
    sourceBlockRefs: ['source-reading-1'],
    baselineText: '이 사주는 공식 명리 근거상 일의 성취에서 자율성이 중요합니다.',
    candidateText,
    candidateHash: 'c'.repeat(64),
    evaluation: 'accepted',
    failureCodes: [],
    evaluatorVersion: 'internal-comparison-test-v1',
  };
}

describe('private Reader Saju pair comparison', () => {
  it('keeps two Reader outputs paired to the exact same official meaning without authorizing reveal', async () => {
    const collector = createReaderSajuPrivatePairCollectorV1(SCOPE);
    expect(collector.readPrivateReview()).toEqual({
      status: 'incomplete',
      missingCharacterIds: ['baekheon', 'seyeon'],
    });

    await collector.recordPrivateComparison(evidence(
      'baekheon', '일의 성취에서는 주도권과 자율성이 중요하게 읽힙니다.',
    ));
    expect(collector.readPrivateReview()).toEqual({
      status: 'incomplete',
      missingCharacterIds: ['seyeon'],
    });

    await collector.recordPrivateComparison(evidence(
      'seyeon', '일할 때 자기 방식대로 성과를 낼 수 있는지가 눈에 띄네요.',
    ));
    const pair = collector.readPrivateReview();
    expect(pair.status).toBe('ready_for_private_review');
    if (pair.status !== 'ready_for_private_review') throw new Error('expected pair');
    expect(pair.officialMeaning).toBe(pair.first.baselineText);
    expect(pair.first.baselineText).toBe(pair.second.baselineText);
    expect(pair.first.candidateText).not.toBe(pair.second.candidateText);
    expect(pair.publicationAuthorized).toBe(false);
    expect(pair.first.sourceBlockRefs).toEqual(pair.second.sourceBlockRefs);
  });

  it('never treats two unrelated source units as an exact side-by-side comparison', async () => {
    const collector = createReaderSajuPrivatePairCollectorV1(SCOPE);
    await collector.recordPrivateComparison(evidence('baekheon', '백헌의 표현입니다.'));
    await collector.recordPrivateComparison({
      ...evidence('seyeon', '세연의 표현입니다.'),
      sourceUnitId: 'grounding_unit_' + '2'.repeat(24),
    });
    expect(collector.readPrivateReview()).toMatchObject({
      status: 'different_source_units',
    });
  });

  it('rejects crossed source identity and duplicate reader evidence', async () => {
    const collector = createReaderSajuPrivatePairCollectorV1(SCOPE);
    await expect(collector.recordPrivateComparison({
      ...evidence('baekheon', '기본 설명'),
      readingRef: 'someone-else-reading',
    })).rejects.toThrow('source identity mismatch');
    await collector.recordPrivateComparison(evidence('baekheon', '기본 설명'));
    await expect(collector.recordPrivateComparison(evidence(
      'baekheon', '두 번째 설명',
    ))).rejects.toThrow('source identity mismatch');
    await expect(collector.recordPrivateComparison({
      ...evidence('seyeon', '다른 출처'),
      sourceResponseHash: 'f'.repeat(64),
    })).rejects.toThrow('source identity mismatch');
    expect(collector.readPrivateReview()).toMatchObject({
      status: 'incomplete',
      missingCharacterIds: ['seyeon'],
    });
  });
});
