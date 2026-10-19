import { StyleSheet, Text, View } from 'react-native';

import type { MobileSajuViewModelV1 } from '@/features/saju/saju-view-model';
import { useMobileTheme } from '@/ui/mobile-theme';

/**
 * Editorial treatment of server-calculated birth-chart evidence.
 * No new fortunes, generative interpretations, or entitlement claims.
 */
export function SajuEditorialSummary({ viewModel }: { viewModel: MobileSajuViewModelV1 }) {
  const { theme } = useMobileTheme();
  const day = viewModel.dayMaster;
  const dayConfirmed = day.status === 'resolved';

  return (
    <View style={[styles.hero, theme === 'dark' && styles.heroDark]}>
      <View pointerEvents="none" style={styles.borderFrame} />
      <View style={styles.heading}>
        <Text style={styles.eyebrow}>MY FOUR PILLARS · 命</Text>
        <Text style={styles.title}>나의 명식, 나를 읽는 첫 장</Text>
        <Text style={styles.subtitle}>태어난 순간의 정보를 토대로 계산한 명식을 확인해 보세요.</Text>
      </View>
      <View style={styles.divider} />
      <View style={styles.facts}>
        <View style={styles.daySeal}>
          <Text style={styles.sealHanja}>{dayConfirmed ? day.hanja : '命'}</Text>
        </View>
        <View style={styles.factCopy}>
          <Text style={styles.factLabel}>나의 일간</Text>
          <Text style={styles.factPrimary}>{dayConfirmed ? day.hangul : '계산 상태 확인 필요'}</Text>
          <Text style={styles.factSecondary}>
            {dayConfirmed ? [day.element, day.yinYang].filter(Boolean).join(' · ') : '확정된 기둥만 표시합니다.'}
          </Text>
        </View>
      </View>
      <View style={styles.stateRow}>
        <View style={styles.stateMark} />
        <Text style={styles.stateLabel}>{viewModel.completeness.headline}</Text>
      </View>
      <Text style={styles.disclaimer}>이 정보는 검증된 명식 계산 결과입니다. 하루 운세나 미래를 예측한 내용이 아닙니다.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    minHeight: 270,
    borderRadius: 23,
    backgroundColor: '#142B40',
    borderColor: '#BC9564',
    borderWidth: 1,
    padding: 23,
    gap: 15,
    overflow: 'hidden',
  },
  heroDark: { backgroundColor: '#15202B', borderColor: '#C7A372' },
  borderFrame: {
    position: 'absolute',
    top: 8, right: 8, bottom: 8, left: 8,
    borderRadius: 16, borderWidth: 1, borderColor: 'rgba(221,183,129,0.26)',
  },
  heading: { gap: 8 },
  eyebrow: { color: '#E5C393', fontSize: 10, fontWeight: '900', letterSpacing: 1.6 },
  title: { color: '#FFF9EF', fontSize: 23, fontWeight: '800', letterSpacing: -0.65, lineHeight: 31 },
  subtitle: { color: '#E8DCCC', fontSize: 13, lineHeight: 20 },
  divider: { height: 1, backgroundColor: 'rgba(226,194,148,0.4)' },
  facts: { flexDirection: 'row', alignItems: 'center', gap: 17 },
  daySeal: {
    width: 76, height: 82,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#DAB983', borderRadius: 16,
    backgroundColor: 'rgba(255,247,228,0.07)',
  },
  sealHanja: { color: '#F5E2C1', fontSize: 38, fontWeight: '700' },
  factCopy: { flex: 1, gap: 6 },
  factLabel: { color: '#E5C393', fontSize: 11, fontWeight: '700' },
  factPrimary: { color: '#FFFFFF', fontSize: 19, fontWeight: '800' },
  factSecondary: { color: '#E8DCCC', fontSize: 13, lineHeight: 18 },
  stateRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stateMark: { backgroundColor: '#DFC090', width: 6, height: 6, borderRadius: 3 },
  stateLabel: { flex: 1, color: '#F1E8D9', fontSize: 12, lineHeight: 18, fontWeight: '700' },
  disclaimer: { color: '#D2C5B5', fontSize: 11, lineHeight: 17 },
});
