import type {
  LifeRecordFactV1,
  MemoryItemV1,
  ReadingHistoryItemV1,
} from '@myeongha/api-client';

import type {
  MobileRecordsCollectionKeyV1,
  MobileRecordsSnapshotsV1,
} from './mobile-records-controller.js';

export type RecordsTabV1 = 'all' | 'life' | 'readings' | 'memories';

export type RecordTimelineItemV1 =
  | Readonly<{
      kind: 'life_fact';
      id: string;
      timestamp: string;
      source: LifeRecordFactV1;
    }>
  | Readonly<{
      kind: 'reading';
      id: string;
      timestamp: string;
      source: ReadingHistoryItemV1;
    }>
  | Readonly<{
      kind: 'memory';
      id: string;
      timestamp: string;
      source: MemoryItemV1;
    }>;

const readingTitles: Readonly<Record<string, string>> = Object.freeze({
  general: '전체 사주',
  family: '가족',
  relationship: '관계',
  compatibility: '궁합',
  career: '직업 · 커리어',
  business: '사업',
  wealth: '재물',
  life_stage: '삶의 단계',
  question_specific: '지금 고민으로 보기',
});

export function formatRecordDateV1(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/u.exec(value);
  return match === null ? '—' : `${match[1]}.${match[2]}.${match[3]}`;
}

export function readingStateLabelV1(value: string): string {
  if (value === 'delivered' || value === 'delivered_with_fallback') return '완료';
  if (value === 'clarification_required') return '추가 확인 필요';
  return '저장됨';
}

export function readingTitleV1(value: string): string {
  return readingTitles[value] ?? '사주 풀이';
}

export function readingReaderLabelV1(ids: readonly string[]): string {
  if (ids.length === 0) return 'Reader 기록 없음';
  if (ids.length === 1) return '대리자와 본 풀이';
  return `대리자 ${ids.length}명과 본 풀이`;
}

export function buildAllRecordTimelineV1(
  snapshots: MobileRecordsSnapshotsV1,
): readonly RecordTimelineItemV1[] {
  const items: RecordTimelineItemV1[] = [
    ...snapshots.life.items.map((source) =>
      Object.freeze({
        kind: 'life_fact' as const,
        id: source.lifeFactId,
        timestamp: source.confirmedAt,
        source,
      }),
    ),
    ...snapshots.readings.items.map((source) =>
      Object.freeze({
        kind: 'reading' as const,
        id: source.readingId,
        timestamp: source.completedAt,
        source,
      }),
    ),
    ...snapshots.memories.items.map((source) =>
      Object.freeze({
        kind: 'memory' as const,
        id: source.memoryItemId,
        timestamp: source.createdAt,
        source,
      }),
    ),
  ];

  items.sort((left, right) => {
    const delta = Date.parse(right.timestamp) - Date.parse(left.timestamp);
    if (delta !== 0) return delta;
    const kindDelta = left.kind.localeCompare(right.kind);
    return kindDelta !== 0 ? kindDelta : left.id.localeCompare(right.id);
  });
  return Object.freeze(items);
}

export function collectionKeysForTabV1(tab: RecordsTabV1): readonly MobileRecordsCollectionKeyV1[] {
  if (tab === 'all') return Object.freeze(['life', 'readings', 'memories']);
  return Object.freeze([tab]);
}

export function failedCollectionLabelsV1(
  snapshots: MobileRecordsSnapshotsV1,
  tab: RecordsTabV1,
): readonly string[] {
  const labels: Readonly<Record<MobileRecordsCollectionKeyV1, string>> = Object.freeze({
    life: '현세록',
    readings: '지난 읽기',
    memories: '기억',
  });
  return Object.freeze(
    collectionKeysForTabV1(tab)
      .filter((key) => snapshots[key].status === 'error')
      .map((key) => labels[key]),
  );
}
