import { MobilePlannedUiQaSwitcherV1 } from '@/ui/MobilePlannedUiQaSwitcherV1';
import type {
  LifeRecordFactV1,
  MemoryItemV1,
  ReadingHistoryItemV1,
} from '@myeongha/api-client';
import { router, useLocalSearchParams } from 'expo-router';
import { plannedMobileUiPreviewLocaleV1, previewMobileAuthoredUiLabelV1 } from '@/ui/mobile-planned-ui-screen-preview-v1';
import { useMobileUiLocale } from '@/ui/mobile-ui-locale';
import type { MobilePlannedUiPreviewLocaleV1 } from '@/ui/mobile-planned-ui-screen-preview-v1';
import { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  LifeFactCard,
  MemoryCard,
  ReadingHistoryCard,
  RecordsEmptyState,
  RecordsFailureBanner,
  RecordsListFooter,
  RecordsTabs,
} from '@/features/records/RecordsComponents';
import { RecordsEditorialHeader } from '@/features/records/RecordsEditorialHeader';
import { useMobileRecordsV1 } from '@/features/records/use-mobile-records';
import {
  buildAllRecordTimelineV1,
  failedCollectionLabelsV1,
  type RecordTimelineItemV1,
  type RecordsTabV1,
} from '@/features/records/records-view-model';
import { mobileColors } from '@/ui/mobile-colors';
import { MobileUiText } from '@/ui/MobileUiText';
import { useMobileThemedStyles } from '@/ui/use-mobile-themed-styles';
import { useMobileTheme } from '@/ui/mobile-theme';
import { useMobilePullRefreshV1 } from '@/ui/use-mobile-pull-refresh';

type VisibleItem =
  | RecordTimelineItemV1
  | Readonly<{ kind: 'life_only'; id: string; source: LifeRecordFactV1 }>
  | Readonly<{ kind: 'reading_only'; id: string; source: ReadingHistoryItemV1 }>
  | Readonly<{ kind: 'memory_only'; id: string; source: MemoryItemV1 }>;

function visibleItems(tab: RecordsTabV1, snapshots: ReturnType<typeof useMobileRecordsV1>['snapshots']): readonly VisibleItem[] {
  if (tab === 'all') return buildAllRecordTimelineV1(snapshots);
  if (tab === 'life') {
    return snapshots.life.items.map((source) =>
      Object.freeze({ kind: 'life_only' as const, id: source.lifeFactId, source }),
    );
  }
  if (tab === 'readings') {
    return snapshots.readings.items.map((source) =>
      Object.freeze({ kind: 'reading_only' as const, id: source.readingId, source }),
    );
  }
  return snapshots.memories.items.map((source) =>
    Object.freeze({ kind: 'memory_only' as const, id: source.memoryItemId, source }),
  );
}

function renderItem(
  item: VisibleItem,
  onOpenReading: (readingId: string) => void,
  previewLocale: MobilePlannedUiPreviewLocaleV1 | null,
) {
  switch (item.kind) {
    case 'life_fact':
    case 'life_only':
      return <LifeFactCard item={item.source} />;
    case 'reading':
    case 'reading_only':
      return (
        <ReadingHistoryCard
          previewLocale={previewLocale}
          item={item.source}
          onOpen={() => onOpenReading(item.source.readingId)}
        />
      );
    case 'memory':
    case 'memory_only':
      return <MemoryCard item={item.source} previewLocale={previewLocale} />;
  }
}

function hasMoreForTab(tab: RecordsTabV1, snapshots: ReturnType<typeof useMobileRecordsV1>['snapshots']) {
  if (tab === 'all') {
    return snapshots.life.hasMore || snapshots.readings.hasMore || snapshots.memories.hasMore;
  }
  return snapshots[tab].hasMore;
}

function loadingMoreForTab(tab: RecordsTabV1, snapshots: ReturnType<typeof useMobileRecordsV1>['snapshots']) {
  if (tab === 'all') {
    return [snapshots.life, snapshots.readings, snapshots.memories]
      .some((snapshot) => snapshot.status === 'loading_more');
  }
  return snapshots[tab].status === 'loading_more';
}

function initialLoadingForTab(tab: RecordsTabV1, snapshots: ReturnType<typeof useMobileRecordsV1>['snapshots']) {
  const selected = tab === 'all'
    ? [snapshots.life, snapshots.readings, snapshots.memories]
    : [snapshots[tab]];
  return selected.every((snapshot) =>
    snapshot.items.length === 0 &&
    (snapshot.status === 'idle' || snapshot.status === 'loading_initial'),
  );
}

export default function RecordsScreen() {
  const styles = useMobileThemedStyles(staticStyles);
  const { colors } = useMobileTheme();
  const { t } = useMobileUiLocale();
  const { tab: routeTab, uiPreview } = useLocalSearchParams<{ tab?: string; uiPreview?: string | string[] }>();
  const previewLocale = plannedMobileUiPreviewLocaleV1(uiPreview, __DEV__);
  const previewText = (source: string) => previewMobileAuthoredUiLabelV1(source, previewLocale, t);
  const requestedTab: RecordsTabV1 = routeTab === 'readings' ? 'readings' : 'all';
  const [tab, setTab] = useState<RecordsTabV1>(requestedTab);
  useEffect(() => { setTab(requestedTab); }, [requestedTab]);
  const { snapshots, retryFailed, loadMore, refreshAll } = useMobileRecordsV1();
  const { refreshing, onRefresh } = useMobilePullRefreshV1(refreshAll);

  const items = useMemo(() => visibleItems(tab, snapshots), [snapshots, tab]);
  const failedLabels = failedCollectionLabelsV1(snapshots, tab);
  const hasMore = hasMoreForTab(tab, snapshots);
  const loadingMore = loadingMoreForTab(tab, snapshots);
  const initialLoading = initialLoadingForTab(tab, snapshots);
  const openReading = (readingId: string) => {
    router.push(`/reading/${readingId}`);
  };

  const loadMoreError = tab === 'all'
    ? [snapshots.life, snapshots.readings, snapshots.memories]
        .some((snapshot) => snapshot.status === 'error' && snapshot.items.length > 0)
    : snapshots[tab].status === 'error' && snapshots[tab].items.length > 0;

  return (
    <View style={[styles.safeArea, { backgroundColor: colors.canvas }]}>
      <FlatList
        data={items}
        refreshControl={(
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void onRefresh()}
            tintColor={colors.navy}
            colors={[colors.navy]}
          />
        )}
        keyExtractor={(item) => `${item.kind}:${item.id}`}
        renderItem={({ item }) => renderItem(item, openReading, previewLocale)}
        contentContainerStyle={styles.content}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        onEndReached={() => {
          if (!loadingMore && hasMore && items.length > 0) {
            void loadMore(tab);
          }
        }}
        onEndReachedThreshold={0.4}
        ListHeaderComponent={(
          <View style={styles.headerStack}>
            <MobilePlannedUiQaSwitcherV1 />
            <View style={styles.header}>
              <Text style={[styles.eyebrow, { color: colors.gold }]}>MY RECORDS</Text>
              <MobileUiText style={[styles.title, { color: colors.ink }]}>{previewText('기록')}</MobileUiText>
              <MobileUiText style={[styles.description, { color: colors.muted }]}>
                삶의 사실과 지난 풀이, 저장된 기억을 차분히 찾아보세요.
              </MobileUiText>
            </View>
            <RecordsEditorialHeader selected={tab} itemCount={initialLoading ? null : items.length} previewLocale={previewLocale} />
            <RecordsTabs selected={tab} onSelect={setTab} previewLocale={previewLocale} />
            <RecordsFailureBanner
              previewLocale={previewLocale}
              labels={failedLabels}
              onRetry={() => void retryFailed(tab)}
            />
            {initialLoading ? (
              <View style={styles.loadingCard}>
                <MobileUiText style={styles.loadingText}>{previewText('기록을 불러오는 중입니다…')}</MobileUiText>
              </View>
            ) : null}
          </View>
        )}
        ListEmptyComponent={
          initialLoading ? null : <RecordsEmptyState previewLocale={previewLocale} label={
            tab === 'all' ? '기록' :
            tab === 'life' ? '현세록' :
            tab === 'readings' ? '지난 읽기' : '기억'
          } />
        }
        ListFooterComponent={
          <RecordsListFooter
            previewLocale={previewLocale}
            loading={loadingMore}
            hasMore={hasMore}
            error={loadMoreError}
            onRetry={() => void loadMore(tab)}
          />
        }
      />
    </View>  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: mobileColors.canvas },
  content: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 25, paddingBottom: 36 },
  headerStack: { gap: 18, marginBottom: 20 },
  header: { gap: 7 },
  eyebrow: { color: mobileColors.gold, fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  title: { color: mobileColors.ink, fontSize: 31, fontWeight: '900', letterSpacing: -0.55 },
  description: { color: mobileColors.muted, fontSize: 14, lineHeight: 21 },
  separator: { height: 13 },
  loadingCard: {
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: 16,
    backgroundColor: mobileColors.surface,
    padding: 18,
  },
  loadingText: { color: mobileColors.muted, fontSize: 14 },
});
const staticStyles = styles;
