import { RefreshControl, SafeAreaView, ScrollView, StyleSheet, View } from 'react-native';

import {
  HomeBrandHeader,
  HomeContinuationCard,
  HomeReadingTopics,
  HomeTodayCard,
} from '@/features/home/HomeComponents';
import { HomeCharacterFeature } from '@/features/home/HomeCharacterFeature';
import { createMobileHomeViewModelV1 } from '@/features/home/home-view-model';
import { useMobileHomeV1 } from '@/features/home/use-mobile-home';
import { mobileColors } from '@/ui/mobile-colors';
import { useMobileThemedStyles } from '@/ui/use-mobile-themed-styles';
import { useMobileTheme } from '@/ui/mobile-theme';
import { MobileFortuneCookie } from '@/features/home/MobileFortuneCookie';

export default function HomeScreen() {
  const styles = useMobileThemedStyles(staticStyles);
  const { colors } = useMobileTheme();
  const { snapshot, refresh } = useMobileHomeV1();
  const view = createMobileHomeViewModelV1(snapshot.state);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.canvas }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={snapshot.refreshing}
            onRefresh={() => void refresh()}
            tintColor={colors.navy}
          />
        }
      >
        <HomeBrandHeader greeting={view.greeting} subheading={view.subheading} />
        <HomeCharacterFeature />
        <HomeTodayCard card={view.today} />
        <MobileFortuneCookie />
        <HomeContinuationCard card={view.continuation} />
        <HomeReadingTopics topics={view.readingTopics} />
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
    gap: 21,
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: mobileColors.border },
});
const staticStyles = styles;
