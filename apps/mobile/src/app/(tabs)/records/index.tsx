import type {
  LifeRecordFactV1,
  MemoryItemV1,
  ReadingHistoryItemV1,
} from '@myeongha/api-client';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  FlatList,
  SafeAreaView,
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
import { useMobileRecordsV1 } from '@/features/records/use-mobile-records';
import {
  buildAllRecordTimelineV1,
  failedCollectionLabelsV1,
  type RecordTimelineItemV1,
  type RecordsTabV1,
} from '@/features/records/records-view-model';
import { mobileColors } from '@/ui/mobile-colors';

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

function renderItem(item: VisibleItem, onOpenReading: (readingId: string) => void) {
  switch (item.kind) {
    case 'life_fact':
    case 'life_only':
      return <LifeFactCard item={item.source} />;
    case 'reading':
    case 'reading_only':
      return (
        <ReadingHistoryCard
          item={item.source}
          onOpen={() => onOpenReading(item.source.readingId)}
        />
      );
    case 'memory':
    case 'memory_only':
      return <MemoryCard item={item.source} />;
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
  const [tab, setTab] = useState<RecordsTabV1>('all');
  const { snapshots, retryFailed, loadMore } = useMobileRecordsV1();

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
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        data={items}
        keyExtractor={(item) => `${item.kind}:${item.id}`}
        renderItem={({ item }) => renderItem(item, openReading)}
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
            <View style={styles.header}>
              <Text style={styles.eyebrow}>MY RECORDS</Text>
              <Text style={styles.title}>기록</Text>
              <Text style={styles.description}>
                삶의 사실, 사주 풀이 이력, 기억을 각 authority 그대로 확인합니다.
              </Text>
            </View>
            <RecordsTabs selected={tab} onSelect={setTab} />
            <RecordsFailureBanner
              labels={failedLabels}
              onRetry={() => void retryFailed(tab)}
            />
            {initialLoading ? (
              <View style={styles.loadingCard}>
                <Text style={styles.loadingText}>기록을 불러오는 중입니다…</Text>
              </View>
            ) : null}
          </View>
        )}
        ListEmptyComponent={
          initialLoading ? null : <RecordsEmptyState label={
            tab === 'all' ? '기록' :
            tab === 'life' ? '현세록' :
            tab === 'readings' ? '지난 읽기' : '기억'
          } />
        }
        ListFooterComponent={
          <RecordsListFooter
            loading={loadingMore}
            hasMore={hasMore}
            error={loadMoreError}
            onRetry={() => void loadMore(tab)}
          />
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: mobileColors.canvas },
  content: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 28, paddingBottom: 28 },
  headerStack: { gap: 18, marginBottom: 18 },
  header: { gap: 8 },
  eyebrow: { color: mobileColors.gold, fontSize: 12, fontWeight: '700', letterSpacing: 1.2 },
  title: { color: mobileColors.ink, fontSize: 32, fontWeight: '700' },
  description: { color: mobileColors.muted, fontSize: 15, lineHeight: 22 },
  separator: { height: 12 },
  loadingCard: {
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: 16,
    backgroundColor: mobileColors.surface,
    padding: 18,
  },
  loadingText: { color: mobileColors.muted, fontSize: 14 },
});
