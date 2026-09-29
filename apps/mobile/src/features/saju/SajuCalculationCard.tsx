import { StyleSheet, Text, View } from 'react-native';

import type {
  CurrentBirthProfileV1,
  SajuCalculationEvidenceV1,
  SajuPillarStateV1,
} from '@myeongha/api-client';

import { mobileColors } from '@/ui/mobile-colors';

const pillars = [
  ['year', '년주'],
  ['month', '월주'],
  ['day', '일주'],
  ['hour', '시주'],
] as const;

function pillarDisplay(state: SajuPillarStateV1): {
  characters: string;
  text: string;
  meta: string;
} {
  if (state.status === 'resolved') {
    return {
      characters: `${state.value.stem.hanja}${state.value.branch.hanja}`,
      text: `${state.value.stem.value}${state.value.branch.value}`,
      meta: `${state.value.stem.element} · ${state.value.branch.element}`,
    };
  }
  if (state.status === 'ambiguous') {
    return {
      characters: '◇',
      text: '복수 후보',
      meta: `${String(state.candidateCount)}개 후보`,
    };
  }
  return {
    characters: '—',
    text: '확인 불가',
    meta: state.reasonCode,
  };
}

export function SajuCalculationCard(props: {
  readonly birthProfile: CurrentBirthProfileV1;
  readonly calculation: SajuCalculationEvidenceV1;
}) {
  const input = props.birthProfile.currentRevision.input;
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View>
          <Text style={styles.kicker}>CURRENT BIRTH</Text>
          <Text style={styles.title}>나의 명식</Text>
        </View>
        <Text style={styles.revision}>rev {props.birthProfile.currentRevision.revisionNo}</Text>
      </View>

      <Text style={styles.birthSummary}>
        {input.birthDate} · {input.timeKnown ? input.birthTime : '시간 모름'} ·{' '}
        {input.calendarType === 'solar' ? '양력' : '음력'}
      </Text>

      <View style={styles.pillarGrid}>
        {pillars.map(([key, label]) => {
          const display = pillarDisplay(props.calculation.snapshot.pillars[key]);
          return (
            <View style={styles.pillar} key={key}>
              <Text style={styles.pillarLabel}>{label}</Text>
              <Text style={styles.characters}>{display.characters}</Text>
              <Text style={styles.pillarText}>{display.text}</Text>
              <Text style={styles.pillarMeta} numberOfLines={2}>{display.meta}</Text>
            </View>
          );
        })}
      </View>

      <View style={styles.boundary}>
        <Text style={styles.boundaryTitle}>
          {props.calculation.snapshot.completeness.fullyResolved
            ? '네 기둥 계산 완료'
            : '일부 계산 제한'}
        </Text>
        <Text style={styles.boundaryCopy}>
          이 화면은 서버가 검증한 계산 사실만 표시합니다. 의미 해석과 캐릭터 Reading은 별도 authority에서 제공합니다.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: mobileColors.gold,
    borderRadius: 18,
    backgroundColor: mobileColors.surface,
    padding: 20,
    gap: 16,
  },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  kicker: { color: mobileColors.gold, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  title: { color: mobileColors.ink, fontSize: 24, fontWeight: '700', marginTop: 4 },
  revision: { color: mobileColors.muted, fontSize: 12 },
  birthSummary: { color: mobileColors.muted, fontSize: 14, lineHeight: 20 },
  pillarGrid: { flexDirection: 'row', gap: 8 },
  pillar: {
    flex: 1,
    minHeight: 142,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 5,
    gap: 4,
  },
  pillarLabel: { color: mobileColors.muted, fontSize: 11 },
  characters: { color: mobileColors.navy, fontSize: 24, fontWeight: '700', marginTop: 3 },
  pillarText: { color: mobileColors.ink, fontSize: 12, fontWeight: '700' },
  pillarMeta: { color: mobileColors.muted, fontSize: 10, textAlign: 'center' },
  boundary: {
    borderTopWidth: 1,
    borderTopColor: mobileColors.border,
    paddingTop: 14,
    gap: 5,
  },
  boundaryTitle: { color: mobileColors.ink, fontWeight: '700', fontSize: 14 },
  boundaryCopy: { color: mobileColors.muted, fontSize: 12, lineHeight: 18 },
});
