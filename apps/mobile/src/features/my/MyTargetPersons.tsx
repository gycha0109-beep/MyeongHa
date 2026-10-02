import type { TargetPersonV1 } from '@myeongha/api-client';
import { StyleSheet, Text, View } from 'react-native';

import { mobileColors } from '@/ui/mobile-colors';

function calendarLabel(item: TargetPersonV1): string {
  const input = item.currentRevision.input;
  if (input.calendarType === 'solar') return '양력';
  return input.isLeapMonth ? '음력 · 윤달' : '음력';
}

function sexLabel(item: TargetPersonV1): string {
  const sex = item.currentRevision.input.sex;
  if (sex === 'male') return '남성';
  if (sex === 'female') return '여성';
  if (sex === 'unspecified') return '성별 미지정';
  return '성별 정보 없음';
}

function timeLabel(item: TargetPersonV1): string {
  const input = item.currentRevision.input;
  if (!input.timeKnown || input.birthTime === null) return '시간 모름';
  return input.birthTime.slice(0, 5);
}

export function MyTargetPersonsSection({
  items,
}: {
  items: readonly TargetPersonV1[];
}) {
  return (
    <View style={styles.section}>
      <View style={styles.intro}>
        <Text style={styles.kicker}>PEOPLE</Text>
        <Text style={styles.title}>등록된 대상</Text>
        <Text style={styles.description}>
          현재 계정에 이미 등록된 대상의 출생정보를 확인합니다.
        </Text>
      </View>

      {items.map((item) => (
        <View key={item.targetPersonId} style={styles.card}>
          <View style={styles.heading}>
            <Text style={styles.name}>
              {item.displayLabel?.trim() || '이름 없는 대상'}
            </Text>
            {item.relationshipLabel?.trim() ? (
              <Text style={styles.relationship}>{item.relationshipLabel}</Text>
            ) : null}
          </View>
          <View style={styles.factRow}>
            <Text style={styles.factLabel}>생년월일</Text>
            <Text style={styles.factValue}>{item.currentRevision.input.birthDate}</Text>
          </View>
          <View style={styles.factRow}>
            <Text style={styles.factLabel}>태어난 시간</Text>
            <Text style={styles.factValue}>{timeLabel(item)}</Text>
          </View>
          <View style={styles.factRow}>
            <Text style={styles.factLabel}>기준</Text>
            <Text style={styles.factValue}>
              {calendarLabel(item)} · {sexLabel(item)}
            </Text>
          </View>
          <Text style={styles.revision}>
            출생정보 revision {item.currentRevision.revisionNo}
          </Text>
        </View>
      ))}

      <Text style={styles.caption}>
        대상 추가·수정은 아직 모바일에서 지원하지 않습니다.
      </Text>
    </View>
  );
}

export function MyTargetPersonsEmpty() {
  return (
    <View style={styles.section}>
      <View style={styles.intro}>
        <Text style={styles.kicker}>PEOPLE</Text>
        <Text style={styles.title}>등록된 대상</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.description}>현재 등록된 대상이 없습니다.</Text>
        <Text style={styles.caption}>
          대상 추가 기능은 아직 모바일에서 지원하지 않습니다.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 12 },
  intro: { gap: 5 },
  kicker: {
    color: mobileColors.gold,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  title: { color: mobileColors.ink, fontSize: 20, fontWeight: '800' },
  description: { color: mobileColors.muted, fontSize: 14, lineHeight: 20 },
  card: {
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: 18,
    backgroundColor: mobileColors.surface,
    padding: 18,
    gap: 9,
  },
  heading: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
  },
  name: { flex: 1, color: mobileColors.ink, fontSize: 17, fontWeight: '800' },
  relationship: { color: mobileColors.navy, fontSize: 12, fontWeight: '700' },
  factRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
  },
  factLabel: { color: mobileColors.muted, fontSize: 13 },
  factValue: { color: mobileColors.ink, fontSize: 14, fontWeight: '700' },
  revision: { color: mobileColors.muted, fontSize: 11 },
  caption: { color: mobileColors.muted, fontSize: 11, lineHeight: 17 },
});
