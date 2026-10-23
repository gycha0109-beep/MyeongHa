import type {
  LifeRecordFactV1,
  MemoryItemV1,
  ReadingHistoryItemV1,
} from '@myeongha/api-client';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  formatRecordDateV1,
  readingIsArchiveOpenableV1,
  readingReaderLabelV1,
  readingStateLabelV1,
  readingTitleV1,
  type RecordsTabV1,
} from '@/features/records/records-view-model';
import { mobileColors } from '@/ui/mobile-colors';
import { MobileReaderRecordContinuity } from '@/features/records/MobileReaderRecordContinuity';
import { MobileUiText } from '@/ui/MobileUiText';
import { useMobileThemedStyles } from '@/ui/use-mobile-themed-styles';
import { useMobileUiLocale } from '@/ui/mobile-ui-locale';

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
  const styles = useMobileThemedStyles(staticStyles);
  const { t } = useMobileUiLocale();
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
            {t(tab.label)}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export function LifeFactCard({ item }: { item: LifeRecordFactV1 }) {
  const styles = useMobileThemedStyles(staticStyles);
  const revoked = item.revokedAt !== null;
  return (
    <View style={[styles.card, revoked && styles.cardMuted]}>
      <View style={styles.cardTop}>
        <Text style={styles.symbol}>現</Text>
        <Text style={styles.date}>{formatRecordDateV1(item.confirmedAt)}</Text>
      </View>
      <Text style={styles.cardTitle}>{item.factType}</Text>
      <Text style={styles.caption}>기록 형식 {item.schemaVersion} · 출처 {item.sourceKind}</Text>
      <Text style={[styles.state, revoked && styles.revoked]}>
        {revoked ? '철회됨' : '기록됨'}
      </Text>
    </View>
  );
}

export function ReadingHistoryCard({
  item,
  onOpen,
}: {
  item: ReadingHistoryItemV1;
  onOpen?: () => void;
}) {
  const styles = useMobileThemedStyles(staticStyles);
  const openable = readingIsArchiveOpenableV1(item.productResponseState);
  const { t } = useMobileUiLocale();
  const content = (
    <>
      <View style={styles.cardTop}>
        <Text style={styles.symbol}>命</Text>
        <Text style={styles.date}>{formatRecordDateV1(item.completedAt)}</Text>
      </View>
      <Text style={styles.cardTitle}>{t(readingTitleV1(item.sajuDomain))}</Text>
      <Text style={styles.cardBody}>{t(readingReaderLabelV1(item.readerCharacterIds))}</Text>
      <Text style={styles.state}>{t(readingStateLabelV1(item.productResponseState))}</Text>
      {openable && onOpen !== undefined ? (
        <MobileUiText style={styles.openHint}>저장된 풀이 다시 읽기 →</MobileUiText>
      ) : null}
      <Text style={styles.caption}>풀이 기록 형식 · {item.readingContractVersion}</Text>
    </>
  );

  const archiveCard = !openable || onOpen === undefined
    ? <View style={styles.card}>{content}</View>
    : (
      <Pressable
        accessibilityRole="button"
        onPress={onOpen}
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      >
        {content}
      </Pressable>
    );
  // Keep official Records open/read separate from any Reader entitlement
  // probe. Do not nest the purchase/right button inside an archive Pressable.
  return (
    <View style={styles.readingStack}>
      {archiveCard}
      {openable && item.readerCharacterIds.length > 0 ? (
        <MobileReaderRecordContinuity
          readingId={item.readingId}
          readerCharacterIds={item.readerCharacterIds}
        />
      ) : null}
    </View>
  );
}

export function MemoryCard({ item }: { item: MemoryItemV1 }) {
  const styles = useMobileThemedStyles(staticStyles);
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <Text style={styles.symbol}>記</Text>
        <Text style={styles.date}>{formatRecordDateV1(item.createdAt)}</Text>
      </View>
      <Text style={styles.cardTitle}>{item.memoryType}</Text>
      <MobileUiText style={styles.cardBody}>저장된 기억</MobileUiText>
      <Text style={styles.caption}>
        기록 형식 {item.schemaVersion}{item.createdByCharacterId === null ? '' : ' · 연결자 기록'}
      </Text>
    </View>
  );
}

export function RecordsEmptyState({ label }: { label: string }) {
  const styles = useMobileThemedStyles(staticStyles);
  const { t } = useMobileUiLocale();
  const emptyByCategory: Readonly<Record<string, string>> = {
    '기록': '아직 기록이 없습니다',
    '현세록': '아직 현세록이 없습니다',
    '지난 읽기': '아직 지난 읽기가 없습니다',
    '기억': '아직 기억이 없습니다',
  };
  return (
    <View style={styles.empty}>
      <Text style={styles.emptySymbol}>之</Text>
      <Text style={styles.cardTitle}>{t(emptyByCategory[label] ?? '아직 기록이 없습니다')}</Text>
      <MobileUiText style={styles.cardBody}>확인된 기록이 생기면 이곳에 표시됩니다.</MobileUiText>
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
  const styles = useMobileThemedStyles(staticStyles);
  const { t } = useMobileUiLocale();
  if (labels.length === 0) return null;
  return (
    <View style={styles.failure}>
      <View style={styles.failureCopy}>
        <MobileUiText style={styles.failureTitle}>일부 기록을 불러오지 못했습니다</MobileUiText>
        <Text style={styles.cardBody}>{labels.map((label) => t(label)).join(' · ')}</Text>
      </View>
      <Pressable accessibilityRole="button" onPress={onRetry} style={styles.retryButton}>
        <MobileUiText style={styles.retryText}>다시 시도</MobileUiText>
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
  const styles = useMobileThemedStyles(staticStyles);
  if (loading) {
    return <ActivityIndicator color={mobileColors.navy} style={styles.footer} />;
  }
  if (error && hasMore) {
    return (
      <Pressable accessibilityRole="button" onPress={onRetry} style={styles.footerButton}>
        <MobileUiText style={styles.retryText}>더 불러오기 다시 시도</MobileUiText>
      </Pressable>
    );
  }
  return <View style={styles.footerSpacer} />;
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: 7, paddingVertical: 3 },
  tab: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: mobileColors.border,
    backgroundColor: mobileColors.surface,
  },
  tabSelected: { backgroundColor: mobileColors.navy, borderColor: mobileColors.navy },
  tabText: { color: mobileColors.muted, fontSize: 12, fontWeight: '800', letterSpacing: -0.3 },
  tabTextSelected: { color: mobileColors.surface },
  readingStack: { gap: 10 },
  card: {
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: 20,
    backgroundColor: mobileColors.surface,
    padding: 20,
    gap: 10,
  },
  cardMuted: { opacity: 0.7 },
  cardPressed: { opacity: 0.82 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  symbol: { color: mobileColors.gold, fontSize: 23, fontWeight: '900' },
  date: { color: mobileColors.muted, fontSize: 12, fontWeight: '600' },
  cardTitle: { color: mobileColors.ink, fontSize: 19, fontWeight: '900', letterSpacing: -0.35 },
  cardBody: { color: mobileColors.muted, fontSize: 14, lineHeight: 22 },
  state: { color: mobileColors.navy, fontSize: 13, fontWeight: '900' },
  openHint: { color: mobileColors.navy, fontSize: 13, fontWeight: '900', paddingTop: 6 },
  revoked: { color: mobileColors.seal },
  caption: { color: mobileColors.muted, fontSize: 11, lineHeight: 18 },
  empty: {
    alignItems: 'center',
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: 20,
    backgroundColor: mobileColors.surface,
    paddingHorizontal: 24,
    paddingVertical: 38,
    gap: 10,
  },
  emptySymbol: { color: mobileColors.gold, fontSize: 34, fontWeight: '800' },
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
  retryButton: { minHeight: 48, paddingHorizontal: 12, justifyContent: 'center' },
  retryText: { color: mobileColors.navy, fontSize: 13, fontWeight: '800' },
  footer: { paddingVertical: 24 },
  footerButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingVertical: 14 },
  footerSpacer: { height: 24 },
});
const staticStyles = styles;
