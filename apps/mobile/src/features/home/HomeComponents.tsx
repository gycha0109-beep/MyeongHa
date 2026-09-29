import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type {
  HomeReadingTopicV1,
  MobileHomeContinuationCardV1,
  MobileHomeTodayCardV1,
} from '@/features/home/home-view-model';
import { mobileColors } from '@/ui/mobile-colors';

export function HomeBrandHeader({
  greeting,
  subheading,
}: {
  greeting: string;
  subheading: string;
}) {
  return (
    <View style={styles.brandSection}>
      <View style={styles.brandRow}>
        <View style={styles.brandMark}>
          <Text style={styles.brandMarkText}>命</Text>
        </View>
        <View>
          <Text style={styles.brandName}>명하</Text>
          <Text style={styles.brandRoman}>MYEONGHA</Text>
        </View>
      </View>
      <View style={styles.greetingBlock}>
        <Text style={styles.greeting}>{greeting}</Text>
        <Text style={styles.subheading}>{subheading}</Text>
      </View>
    </View>
  );
}

export function HomeTodayCard({ card }: { card: MobileHomeTodayCardV1 }) {
  if (card.kind === 'loading') {
    return (
      <View style={styles.heroCard}>
        <Text style={styles.sectionKicker}>TODAY</Text>
        <Text style={styles.heroTitle}>오늘의 흐름</Text>
        <Text style={styles.body}>현재 명식을 확인하는 중입니다…</Text>
      </View>
    );
  }

  if (card.kind === 'birth_required') {
    return (
      <View style={styles.heroCard}>
        <Text style={styles.sectionKicker}>TODAY</Text>
        <Text style={styles.heroTitle}>오늘의 흐름</Text>
        <Text style={styles.body}>
          아직 내 명식이 없습니다. 출생정보를 등록하면 현재 명식을 확인할 수 있습니다.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/birth')}
          style={styles.primaryButton}
        >
          <Text style={styles.primaryButtonText}>출생정보 입력하기 →</Text>
        </Pressable>
      </View>
    );
  }

  if (card.kind === 'unavailable') {
    const copy =
      card.reason === 'authority_mismatch'
        ? '현재 출생정보와 명식 계산의 기준이 일치하지 않습니다.'
        : card.reason === 'birth'
          ? '현재 출생정보를 확인하지 못했습니다.'
          : '현재 명식 계산을 불러오지 못했습니다.';
    return (
      <View style={styles.heroCard}>
        <Text style={styles.sectionKicker}>TODAY</Text>
        <Text style={styles.heroTitle}>오늘의 흐름</Text>
        <Text style={styles.body}>{copy}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/reading')}
          style={styles.secondaryButton}
        >
          <Text style={styles.secondaryButtonText}>사주에서 확인 →</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.heroCard}>
      <View style={styles.heroTop}>
        <View>
          <Text style={styles.sectionKicker}>TODAY</Text>
          <Text style={styles.heroTitle}>오늘의 흐름</Text>
        </View>
        <Text style={styles.authorityChip}>{card.label}</Text>
      </View>
      <View style={styles.dayMasterRow}>
        <Text style={styles.dayMaster}>{card.dayMaster}</Text>
        <Text style={styles.elementBadge}>{card.element}</Text>
      </View>
      <Text style={styles.completeness}>{card.completeness}</Text>
      <Text style={styles.caption}>
        현재 출생정보를 기준으로 계산된 명식 사실만 보여줍니다.
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/reading')}
        style={styles.primaryButton}
      >
        <Text style={styles.primaryButtonText}>내 사주 보기 →</Text>
      </Pressable>
    </View>
  );
}

export function HomeContinuationCard({
  card,
}: {
  card: MobileHomeContinuationCardV1;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeading}>
        <View>
          <Text style={styles.sectionKicker}>CONTINUE</Text>
          <Text style={styles.sectionTitle}>이어지는 이야기</Text>
        </View>
      </View>

      {card.kind === 'loading' ? (
        <View style={styles.card}>
          <Text style={styles.body}>최근 저장된 풀이를 확인하는 중입니다…</Text>
        </View>
      ) : null}

      {card.kind === 'ready' ? (
        <View style={styles.card}>
          <View style={styles.continuationTop}>
            <Text style={styles.recordSymbol}>命</Text>
            <Text style={styles.date}>{card.dateLabel}</Text>
          </View>
          <Text style={styles.cardTitle}>{card.title}</Text>
          <Text style={styles.body}>가장 최근 저장된 공식 사주 풀이</Text>
          <Text style={styles.stateText}>{card.status}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/records')}
            style={styles.textAction}
          >
            <Text style={styles.textActionText}>기록에서 보기 →</Text>
          </Pressable>
        </View>
      ) : null}

      {card.kind === 'empty' ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>아직 이어갈 풀이가 없습니다</Text>
          <Text style={styles.body}>내 사주를 확인하면 읽기의 시작점을 찾을 수 있습니다.</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/reading')}
            style={styles.textAction}
          >
            <Text style={styles.textActionText}>사주 보기 →</Text>
          </Pressable>
        </View>
      ) : null}

      {card.kind === 'unavailable' ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>최근 풀이를 불러오지 못했습니다</Text>
          <Text style={styles.body}>다른 홈 정보는 그대로 사용할 수 있습니다.</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/records')}
            style={styles.textAction}
          >
            <Text style={styles.textActionText}>기록에서 확인 →</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

export function HomeReadingTopics({
  topics,
}: {
  topics: readonly HomeReadingTopicV1[];
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeading}>
        <View>
          <Text style={styles.sectionKicker}>READING</Text>
          <Text style={styles.sectionTitle}>사주 읽기 주제</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/reading')}
          style={styles.inlineAction}
        >
          <Text style={styles.inlineActionText}>사주에서 보기 →</Text>
        </Pressable>
      </View>

      <View style={styles.topicGrid}>
        {topics.map((topic) => (
          <View key={topic.key} style={styles.topicCard}>
            <Text style={styles.topicSymbol}>
              {topic.key === 'general' ? '命' : topic.key === 'career' ? '業' : topic.key === 'wealth' ? '財' : '緣'}
            </Text>
            <Text style={styles.topicTitle}>{topic.title}</Text>
            <Text style={styles.topicBody}>{topic.subtitle}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.caption}>
        주제를 선택하는 기능은 사주 화면에서 연결됩니다.
      </Text>
    </View>
  );
}

export function HomeCharacterPending({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <View style={styles.section}>
      <View>
        <Text style={styles.sectionKicker}>CONVERSATION</Text>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <View style={styles.characterPending}>
        <View style={styles.characterMark}>
          <Text style={styles.characterMarkText}>明</Text>
        </View>
        <View style={styles.characterCopy}>
          <Text style={styles.cardTitle}>대화할 사람 만나기</Text>
          <Text style={styles.body}>{body}</Text>
          <Text style={styles.pendingBadge}>준비 중</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  brandSection: { gap: 24 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  brandMark: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
    borderWidth: 1,
    borderColor: mobileColors.gold,
  },
  brandMarkText: { color: mobileColors.navy, fontSize: 18, fontWeight: '900' },
  brandName: { color: mobileColors.ink, fontSize: 18, fontWeight: '900', letterSpacing: 1.2 },
  brandRoman: { color: mobileColors.gold, fontSize: 9, fontWeight: '800', letterSpacing: 1.5 },
  greetingBlock: { gap: 5 },
  greeting: { color: mobileColors.ink, fontSize: 28, lineHeight: 36, fontWeight: '800' },
  subheading: { color: mobileColors.muted, fontSize: 15, lineHeight: 22 },
  section: { gap: 12 },
  sectionHeading: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 },
  sectionKicker: { color: mobileColors.gold, fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  sectionTitle: { marginTop: 3, color: mobileColors.ink, fontSize: 21, fontWeight: '800' },
  heroCard: {
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: 22,
    backgroundColor: mobileColors.surface,
    padding: 20,
    gap: 13,
  },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  heroTitle: { marginTop: 3, color: mobileColors.ink, fontSize: 22, fontWeight: '800' },
  authorityChip: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    backgroundColor: mobileColors.navy,
    color: mobileColors.surface,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 11,
    fontWeight: '800',
  },
  dayMasterRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  dayMaster: { color: mobileColors.navy, fontSize: 29, fontWeight: '900' },
  elementBadge: { color: mobileColors.gold, fontSize: 14, fontWeight: '800' },
  completeness: { color: mobileColors.ink, fontSize: 15, fontWeight: '800' },
  caption: { color: mobileColors.muted, fontSize: 11, lineHeight: 17 },
  primaryButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: mobileColors.navy,
  },
  primaryButtonText: { color: mobileColors.surface, fontSize: 14, fontWeight: '900' },
  secondaryButton: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    borderWidth: 1,
    borderColor: mobileColors.border,
  },
  secondaryButtonText: { color: mobileColors.navy, fontSize: 14, fontWeight: '800' },
  card: {
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: 18,
    backgroundColor: mobileColors.surface,
    padding: 18,
    gap: 8,
  },
  continuationTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  recordSymbol: { color: mobileColors.gold, fontSize: 20, fontWeight: '900' },
  date: { color: mobileColors.muted, fontSize: 12, fontWeight: '700' },
  cardTitle: { color: mobileColors.ink, fontSize: 18, fontWeight: '800' },
  body: { color: mobileColors.muted, fontSize: 14, lineHeight: 21 },
  stateText: { color: mobileColors.navy, fontSize: 12, fontWeight: '800' },
  textAction: { alignSelf: 'flex-start', paddingTop: 4, paddingVertical: 6 },
  textActionText: { color: mobileColors.navy, fontSize: 13, fontWeight: '900' },
  inlineAction: { paddingVertical: 5 },
  inlineActionText: { color: mobileColors.navy, fontSize: 12, fontWeight: '800' },
  topicGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  topicCard: {
    width: '48%',
    minHeight: 128,
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: 17,
    backgroundColor: mobileColors.surface,
    padding: 15,
    gap: 7,
  },
  topicSymbol: { color: mobileColors.gold, fontSize: 21, fontWeight: '900' },
  topicTitle: { color: mobileColors.ink, fontSize: 15, fontWeight: '800' },
  topicBody: { color: mobileColors.muted, fontSize: 12, lineHeight: 18 },
  characterPending: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: 18,
    backgroundColor: mobileColors.surface,
    padding: 18,
  },
  characterMark: {
    width: 58,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 29,
    borderWidth: 1,
    borderColor: mobileColors.gold,
  },
  characterMarkText: { color: mobileColors.navy, fontSize: 22, fontWeight: '900' },
  characterCopy: { flex: 1, gap: 5 },
  pendingBadge: { alignSelf: 'flex-start', color: mobileColors.muted, fontSize: 11, fontWeight: '800' },
});
