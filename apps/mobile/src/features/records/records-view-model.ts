import type {
  LifeRecordFactV1,
  MemoryItemV1,
  ReadingHistoryItemV1,
} from '@myeongha/api-client';

import type { MobileUiLocale } from '../../ui/mobile-ui-copy.js';

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

const RECORD_MONTH_NAMES_EN = Object.freeze([
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const);

/** Display-only: preserve the date portion of the server timestamp verbatim.
 * Do not reinterpret a source-owned UTC/offset timestamp as the device timezone.
 */
export function formatRecordDateV1(value: string, locale: MobileUiLocale = 'ko-KR'): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/u.exec(value);
  if (match === null) return '—';
  const year = match[1] ?? '';
  const month = match[2] ?? '';
  const day = match[3] ?? '';
  if (locale === 'en-US') {
    const monthName = RECORD_MONTH_NAMES_EN[Number(month) - 1] ?? month;
    return `${monthName} ${Number(day)}, ${year}`;
  }
  if (locale === 'ja-JP' || locale === 'zh-TW' || locale === 'zh-CN') {
    return `${year}年${Number(month)}月${Number(day)}日`;
  }
  return `${year}.${month}.${day}`;
}

/** Locale-only loaded row count, not a server-side collection total. */
export function formatLoadedRecordsCountV1(count: number, locale: MobileUiLocale = 'ko-KR'): string {
  if (locale === 'ja-JP') return `読み込み済み ${count}件`;
  if (locale === 'zh-TW') return `已載入 ${count}筆紀錄`;
  if (locale === 'en-US') return `Loaded ${count} ${count === 1 ? 'record' : 'records'}`;
  if (locale === 'zh-CN') return `已加载 ${count} 条记录`;
  return `현재 불러온 기록 ${count}건`;
}

export function readingIsArchiveOpenableV1(value: string): boolean {
  return value === 'delivered' || value === 'delivered_with_fallback';
}

export function readingStateLabelV1(value: string): string {
  if (value === 'delivered' || value === 'delivered_with_fallback') return '완료';
  if (value === 'clarification_required') return '추가 확인 필요';
  return '저장됨';
}

export function readingTitleV1(value: string): string {
  return readingTitles[value] ?? '사주 풀이';
}

/** Count-only display caption; opaque Reader IDs are never rendered as names or grants. */
export function readingReaderLabelV1(
  ids: readonly string[],
  locale: MobileUiLocale = 'ko-KR',
): string {
  const count = ids.length;
  if (count === 0) {
    return ({
      'ko-KR': 'Reader 기록 없음',
      'ja-JP': '案内人の記録なし',
      'zh-TW': '無引路人紀錄',
      'en-US': 'No reader recorded',
      'zh-CN': '未记录引路人',
    } as const)[locale];
  }
  if (count === 1) {
    return ({
      'ko-KR': '연결자와 본 풀이',
      'ja-JP': '案内人と行った鑑定',
      'zh-TW': '與引路人共同進行的解讀',
      'en-US': 'Reading with a reader',
      'zh-CN': '与引路人共同进行的解读',
    } as const)[locale];
  }
  if (locale === 'ja-JP') return `${count}人の案内人と行った鑑定`;
  if (locale === 'zh-TW') return `與 ${count} 位引路人共同進行的解讀`;
  if (locale === 'en-US') return `Reading with ${count} readers`;
  if (locale === 'zh-CN') return `与 ${count} 位引路人共同进行的解读`;
  return `연결자 ${count}명과 본 풀이`;
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

/** A zero-row state is still loading when any selected source is pending.
 * Prevents a completed empty collection from masking other pending sources.
 */
export function recordsInitiallyLoadingV1(
  snapshots: MobileRecordsSnapshotsV1,
  tab: RecordsTabV1,
): boolean {
  const selected = collectionKeysForTabV1(tab).map((key) => snapshots[key]);
  return selected.every((section) => section.items.length === 0) &&
    selected.some((section) => section.status === 'idle' || section.status === 'loading_initial');
}

/** Display "no records" only when every selected source finished successfully.
 * Partial server errors and unknown ownership are NOT proof of an empty archive.
 */
export function recordsConfirmedEmptyV1(
  snapshots: MobileRecordsSnapshotsV1,
  tab: RecordsTabV1,
): boolean {
  return collectionKeysForTabV1(tab).every((key) => {
    const section = snapshots[key];
    return section.status === 'ready' && section.items.length === 0 && !section.hasMore;
  });
}
