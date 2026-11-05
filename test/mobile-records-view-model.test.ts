import { describe, expect, it } from 'vitest';

import {
  buildAllRecordTimelineV1,
  readingReaderLabelV1,
  readingStateLabelV1,
  readingTitleV1,
} from '../apps/mobile/src/features/records/records-view-model.js';

const ready = <T>(items: readonly T[]) => ({
  status: 'ready' as const,
  items,
  hasMore: false,
  nextCursor: null,
  errorCode: null,
});

describe('mobile Records view model', () => {
  it('merges sources only as a UI projection and preserves source object identity', () => {
    const fact = {
      lifeFactId: 'fact-1',
      factType: 'employment',
      schemaVersion: 'v1',
      valueJsonb: { private: 'payload' },
      validFrom: null,
      validTo: null,
      sourceKind: 'chat',
      sourceMessageId: null,
      sourceMergeActionId: null,
      supersedesFactId: null,
      confirmedAt: '2026-09-27T00:00:00.000Z',
      revokedAt: null,
      createdAt: '2026-09-27T00:00:00.000Z',
    };
    const reading = {
      readingId: 'reading-1',
      readingSessionId: 'session-1',
      sajuDomain: 'general',
      readingContractVersion: 'v1',
      productResponseState: 'delivered',
      readerCharacterIds: [],
      createdAt: '2026-09-28T00:00:00.000Z',
      completedAt: '2026-09-29T00:00:00.000Z',
    };
    const memory = {
      memoryItemId: 'memory-1',
      memoryType: 'conversation',
      schemaVersion: 'v1',
      contentJsonb: { private: 'memory' },
      createdByCharacterId: null,
      createdAt: '2026-09-28T00:00:00.000Z',
    };

    const timeline = buildAllRecordTimelineV1({
      life: ready([fact]),
      readings: ready([reading]),
      memories: ready([memory]),
    });

    expect(timeline.map((item) => item.kind)).toEqual(['reading', 'memory', 'life_fact']);
    expect(timeline[0]?.source).toBe(reading);
    expect(timeline[1]?.source).toBe(memory);
    expect(timeline[2]?.source).toBe(fact);
  });

  it('uses bounded presentation labels without inventing character names', () => {
    expect(readingTitleV1('career')).toBe('직업 · 커리어');
    expect(readingTitleV1('unknown-domain')).toBe('사주 풀이');
    expect(readingStateLabelV1('delivered_with_fallback')).toBe('완료');
    expect(readingStateLabelV1('clarification_required')).toBe('추가 확인 필요');
    expect(readingReaderLabelV1(['character-a'])).toBe('연결자와 본 풀이');
    expect(readingReaderLabelV1(['character-a', 'character-b'])).toBe('연결자 2명과 본 풀이');
  });
  it('localizes Reader-count captions without exposing Reader identities', () => {
    const ids = Object.freeze(['opaque-reader-a', 'opaque-reader-b']);
    const samples = [
      { locale: 'ko-KR', zero: 'Reader 기록 없음', one: '연결자와 본 풀이', multiple: '연결자 2명과 본 풀이' },
      { locale: 'ja-JP', zero: '案内人の記録なし', one: '案内人と行った鑑定', multiple: '2人の案内人と行った鑑定' },
      { locale: 'zh-TW', zero: '無引路人紀錄', one: '與引路人共同進行的解讀', multiple: '與 2 位引路人共同進行的解讀' },
      { locale: 'en-US', zero: 'No reader recorded', one: 'Reading with a reader', multiple: 'Reading with 2 readers' },
      { locale: 'zh-CN', zero: '未记录引路人', one: '与引路人共同进行的解读', multiple: '与 2 位引路人共同进行的解读' },
    ] as const;
    for (const row of samples) {
      expect(readingReaderLabelV1([], row.locale)).toBe(row.zero);
      expect(readingReaderLabelV1([ids[0]!], row.locale)).toBe(row.one);
      const caption = readingReaderLabelV1(ids, row.locale);
      expect(caption).toBe(row.multiple);
      expect(caption).not.toContain('opaque-reader');
    }
    expect(ids).toEqual(['opaque-reader-a', 'opaque-reader-b']);
  });

});
