import { StyleSheet, Text, View } from 'react-native';

import type { MobileSajuViewModelV1 } from './saju-view-model';
import { mobileColors } from '@/ui/mobile-colors';
import { MobileUiText } from '@/ui/MobileUiText';
import { useMobileThemedStyles } from '@/ui/use-mobile-themed-styles';
import { useMobileUiLocale } from '@/ui/mobile-ui-locale';

export function BirthSummaryCard({ summary }: { summary: string }) {
  const styles = useMobileThemedStyles(staticStyles);
  const { t } = useMobileUiLocale();
  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>CURRENT BIRTH</Text>
      <Text style={styles.summary}>{summary.split(' · ').map((part) => t(part)).join(' · ')}</Text>
    </View>
  );
}

export function SajuPillarGrid({ pillars }: Pick<MobileSajuViewModelV1, 'pillars'>) {
  const styles = useMobileThemedStyles(staticStyles);
  const { t, locale } = useMobileUiLocale();
  const japaneseBranches: Readonly<Record<string, string>> = { 子: 'ね', 丑: 'うし', 寅: 'とら', 卯: 'う', 辰: 'たつ', 巳: 'み', 午: 'うま', 未: 'ひつじ', 申: 'さる', 酉: 'とり', 戌: 'いぬ', 亥: 'い' };
  return (
    <View style={styles.section}>
      <MobileUiText style={styles.sectionTitle}>나의 명식</MobileUiText>
      <View style={styles.pillarRow}>
        {pillars.map((pillar) => (
          <View
            key={pillar.key}
            style={[styles.pillarCard, pillar.emphasis && styles.pillarCardEmphasis]}
          >
            <Text style={styles.pillarLabel}>{t(pillar.label)}</Text>
            <Text style={[styles.hanja, pillar.emphasis && styles.hanjaEmphasis]}>
              {pillar.stemHanja}
            </Text>
            <Text style={[styles.hanja, pillar.emphasis && styles.hanjaEmphasis]}>
              {pillar.branchHanja}
            </Text>
            <Text style={styles.pillarHangul}>
              {pillar.status === 'resolved'
                ? locale === 'ko-KR'
                  ? `${pillar.stemHangul}${pillar.branchHangul}`
                  : locale === 'ja-JP'
                    ? `${t(pillar.stemHangul)}${japaneseBranches[pillar.branchHanja] ?? pillar.branchHanja}`
                    : `${pillar.stemHanja}${pillar.branchHanja}`
                : pillar.status === 'ambiguous'
                  ? t('모호')
                  : t('미확정')}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function DayMasterCard({ dayMaster }: Pick<MobileSajuViewModelV1, 'dayMaster'>) {
  const styles = useMobileThemedStyles(staticStyles);
  const { t } = useMobileUiLocale();
  return (
    <View style={styles.card}>
      <MobileUiText style={styles.sectionTitle}>나의 일간</MobileUiText>
      <Text style={styles.dayMasterHanja}>{dayMaster.hanja}</Text>
      <Text style={styles.dayMasterHangul}>{t(dayMaster.hangul)}</Text>
      {dayMaster.status === 'resolved' ? (
        <Text style={styles.muted}>{t(dayMaster.element ?? '')} · {t(dayMaster.yinYang ?? '')}</Text>
      ) : (
        <MobileUiText style={styles.muted}>일주가 확정되면 일간을 표시합니다.</MobileUiText>
      )}
    </View>
  );
}

export function ElementBalance({ elementBalance }: Pick<MobileSajuViewModelV1, 'elementBalance'>) {
  const styles = useMobileThemedStyles(staticStyles);
  const { t } = useMobileUiLocale();
  const maximum = Math.max(1, ...elementBalance.map((item) => item.count));
  return (
    <View style={styles.card}>
      <MobileUiText style={styles.sectionTitle}>오행 균형</MobileUiText>
      <MobileUiText style={styles.caption}>확정된 기둥의 천간·지지만 집계합니다.</MobileUiText>
      {elementBalance.map((item) => (
        <View key={item.element} style={styles.balanceRow}>
          <Text style={styles.elementLabel}>{t(item.element)}</Text>
          <View style={styles.track}>
            <View
              style={[
                styles.fill,
                { flex: item.count / maximum },
              ]}
            />
            <View style={{ flex: 1 - item.count / maximum }} />
          </View>
          <Text style={styles.count}>{item.count}</Text>
        </View>
      ))}
    </View>
  );
}

export function CalculationCompleteness({
  completeness,
}: Pick<MobileSajuViewModelV1, 'completeness'>) {
  const styles = useMobileThemedStyles(staticStyles);
  const { t } = useMobileUiLocale();
  return (
    <View style={styles.card}>
      <MobileUiText style={styles.sectionTitle}>계산 상태</MobileUiText>
      <Text style={styles.completenessHeadline}>{completeness.fullyResolved ? t(completeness.headline) : t('{count}/4 기둥 확정').replace('{count}', String(completeness.resolvedPillarCount))}</Text>
      <Text style={styles.muted}>{t(completeness.detail)}</Text>
      <MobileUiText style={styles.caption}>이 화면은 계산 사실만 표시하며 해석을 생성하지 않습니다.</MobileUiText>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 12 },
  card: {
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: 18,
    backgroundColor: mobileColors.surface,
    padding: 20,
    gap: 10,
  },
  eyebrow: { color: mobileColors.gold, fontSize: 11, fontWeight: '800', letterSpacing: 1.1 },
  summary: { color: mobileColors.navy, fontSize: 17, fontWeight: '700' },
  sectionTitle: { color: mobileColors.ink, fontSize: 19, fontWeight: '800' },
  pillarRow: { flexDirection: 'row', gap: 8 },
  pillarCard: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: 14,
    backgroundColor: mobileColors.surface,
    paddingVertical: 14,
    paddingHorizontal: 4,
    gap: 4,
  },
  pillarCardEmphasis: { borderColor: mobileColors.gold, borderWidth: 2 },
  pillarLabel: { color: mobileColors.muted, fontSize: 12, fontWeight: '700' },
  hanja: { color: mobileColors.ink, fontSize: 29, fontWeight: '700' },
  hanjaEmphasis: { color: mobileColors.navy },
  pillarHangul: { color: mobileColors.muted, fontSize: 11, fontWeight: '700' },
  dayMasterHanja: { color: mobileColors.navy, fontSize: 54, fontWeight: '700', textAlign: 'center' },
  dayMasterHangul: { color: mobileColors.ink, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  muted: { color: mobileColors.muted, fontSize: 14, lineHeight: 21 },
  caption: { color: mobileColors.muted, fontSize: 12, lineHeight: 18 },
  balanceRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  elementLabel: { width: 22, color: mobileColors.ink, fontSize: 14, fontWeight: '800' },
  track: {
    flex: 1,
    height: 8,
    flexDirection: 'row',
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: mobileColors.canvas,
  },
  fill: { backgroundColor: mobileColors.gold },
  count: { width: 18, textAlign: 'right', color: mobileColors.navy, fontSize: 14, fontWeight: '800' },
  completenessHeadline: { color: mobileColors.navy, fontSize: 18, fontWeight: '800' },
});
const staticStyles = styles;
