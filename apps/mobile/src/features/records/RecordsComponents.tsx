import type {
  LifeRecordFactV1,
  MemoryItemV1,
  ReadingHistoryItemV1,
} from '@myeongha/api-client';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  formatRecordDateV1,
  readingReaderLabelV1,
  readingStateLabelV1,
  readingTitleV1,
  type RecordsTabV1,
} from '@/features/records/records-view-model';
import { mobileColors } from '@/ui/mobile-colors';

export const RECORDS_TABS_V1 = Object.freeze([
  { key: 'all', label: '전체' },
  { key: 'life', label: '현세록' },
  { key: 'readings', label: '지난 읽기' },
  { key: 'memories', label: '기억' },
] as const satisfies readonly { key: RecordsTabV1; label: string }[]);

export function RecordsTabs({
  selected,
  onSelect,
}: {
  selected: RecordsTabV1;
  onSelect: (tab: RecordsTabV1) => void;
}) {
  return (
    <View style={styles.tabs}>
      {RECORDS_TABS_V1.map((tab) => (
        <Pressable
          key={tab.key}
          accessibilityRole="button"
          accessibilityState={{ selected: selected === tab.key }}
          onPress={() => onSelect(tab.key)}
          style={[styles.tab, selected === tab.key && styles.tabSelected]}
        >
          <Text style={[styles.tabText, selected === tab.key && styles.tabTextSelected]}>
            {tab.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export function LifeFactCard({ item }: { item: LifeRecordFactV1 }) {
  const revoked = item.revokedAt !== null;
  return (
    <View style={[styles.card, revoked && styles.cardMuted]}>
      <View style={styles.cardTop}>
        <Text style={styles.symbol}>現</Text>
        <Text style={styles.date}>{formatRecordDateV1(item.confirmedAt)}</Text>
      </View>
      <Text style={styles.cardTitle}>{item.factType}</Text>
      <Text style={styles.cardBody}>
        {item.schemaVersion} · {item.sourceKind}
      </Text>
      <Text style={[styles.state, revoked && styles.revoked]}>
        {revoked ? '철회됨' : '기록됨'}
      </Text>
    </View>
  );
}

export function ReadingHistoryCard({ item }: { item: ReadingHistoryItemV1 }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <Text style={styles.symbol}>命</Text>
        <Text style={styles.date}>{formatRecordDateV1(item.completedAt)}</Text>
      </View>
      <Text style={styles.cardTitle}>{readingTitleV1(item.sajuDomain)}</Text>
      <Text style={styles.cardBody}>{readingReaderLabelV1(item.readerCharacterIds)}</Text>
      <Text style={styles.state}>{readingStateLabelV1(item.productResponseState)}</Text>
      <Text style={styles.caption}>Reading contract · {item.readingContractVersion}</Text>
    </View>
  );
}

export function MemoryCard({ item }: { item: MemoryItemV1 }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <Text style={styles.symbol}>記</Text>
        <Text style={styles.date}>{formatRecordDateV1(item.createdAt)}</Text>
      </View>
      <Text style={styles.cardTitle}>{item.memoryType}</Text>
      <Text style={styles.cardBody}>저장된 기억</Text>
      <Text style={styles.caption}>
        {item.schemaVersion}{item.createdByCharacterId === null ? '' : ' · 대리자 기록'}
      </Text>
    </View>
  );
}

export function RecordsEmptyState({ label }: { label: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptySymbol}>之</Text>
      <Text style={styles.cardTitle}>아직 {label}이 없습니다</Text>
      <Text style={styles.cardBody}>확인된 기록이 생기면 이곳에 표시됩니다.</Text>
    </View>
  );
}

export function RecordsFailureBanner({
  labels,
  onRetry,
}: {
  labels: readonly string[];
  onRetry: () => void;
}) {
  if (labels.length === 0) return null;
  return (
    <View style={styles.failure}>
      <View style={styles.failureCopy}>
        <Text style={styles.failureTitle}>일부 기록을 불러오지 못했습니다</Text>
        <Text style={styles.cardBody}>{labels.join(' · ')}</Text>
      </View>
      <Pressable accessibilityRole="button" onPress={onRetry} style={styles.retryButton}>
        <Text style={styles.retryText}>다시 시도</Text>
      </Pressable>
    </View>
  );
}

export function RecordsListFooter({
  loading,
  hasMore,
  error,
  onRetry,
}: {
  loading: boolean;
  hasMore: boolean;
  error: boolean;
  onRetry: () => void;
}) {
  if (loading) {
    return <ActivityIndicator color={mobileColors.navy} style={styles.footer} />;
  }
  if (error && hasMore) {
    return (
      <Pressable accessibilityRole="button" onPress={onRetry} style={styles.footerButton}>
        <Text style={styles.retryText}>더 불러오기 다시 시도</Text>
      </Pressable>
    );
  }
  return <View style={styles.footerSpacer} />;
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: 7, paddingVertical: 4 },
  tab: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: mobileColors.border,
    backgroundColor: mobileColors.surface,
  },
  tabSelected: { backgroundColor: mobileColors.navy, borderColor: mobileColors.navy },
  tabText: { color: mobileColors.muted, fontSize: 12, fontWeight: '800' },
  tabTextSelected: { color: mobileColors.surface },
  card: {
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: 18,
    backgroundColor: mobileColors.surface,
    padding: 18,
    gap: 7,
  },
  cardMuted: { opacity: 0.7 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  symbol: { color: mobileColors.gold, fontSize: 20, fontWeight: '800' },
  date: { color: mobileColors.muted, fontSize: 12, fontWeight: '600' },
  cardTitle: { color: mobileColors.ink, fontSize: 18, fontWeight: '800' },
  cardBody: { color: mobileColors.muted, fontSize: 14, lineHeight: 20 },
  state: { color: mobileColors.navy, fontSize: 13, fontWeight: '800' },
  revoked: { color: mobileColors.seal },
  caption: { color: mobileColors.muted, fontSize: 11, lineHeight: 17 },
  empty: {
    alignItems: 'center',
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: 18,
    backgroundColor: mobileColors.surface,
    padding: 28,
    gap: 8,
  },
  emptySymbol: { color: mobileColors.gold, fontSize: 30, fontWeight: '800' },
  failure: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: 16,
    backgroundColor: mobileColors.surface,
    padding: 14,
  },
  failureCopy: { flex: 1, gap: 3 },
  failureTitle: { color: mobileColors.seal, fontSize: 14, fontWeight: '800' },
  retryButton: { paddingHorizontal: 12, paddingVertical: 9 },
  retryText: { color: mobileColors.navy, fontSize: 13, fontWeight: '800' },
  footer: { paddingVertical: 24 },
  footerButton: { alignItems: 'center', paddingVertical: 20 },
  footerSpacer: { height: 24 },
});
