import { RefreshControl, SafeAreaView, ScrollView, StyleSheet, View } from 'react-native';

import {
  HomeBrandHeader,
  HomeCharacterPending,
  HomeContinuationCard,
  HomeReadingTopics,
  HomeTodayCard,
} from '@/features/home/HomeComponents';
import { createMobileHomeViewModelV1 } from '@/features/home/home-view-model';
import { useMobileHomeV1 } from '@/features/home/use-mobile-home';
import { mobileColors } from '@/ui/mobile-colors';

export default function HomeScreen() {
  const { snapshot, refresh } = useMobileHomeV1();
  const view = createMobileHomeViewModelV1(snapshot.state);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={snapshot.refreshing}
            onRefresh={() => void refresh()}
            tintColor={mobileColors.navy}
          />
        }
      >
        <HomeBrandHeader greeting={view.greeting} subheading={view.subheading} />
        <View style={styles.divider} />
        <HomeTodayCard card={view.today} />
        <HomeContinuationCard card={view.continuation} />
        <HomeReadingTopics topics={view.readingTopics} />
        <HomeCharacterPending
          title={view.characterSurface.title}
          body={view.characterSurface.body}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: mobileColors.canvas },
  content: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40,
    gap: 24,
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: mobileColors.border },
});
