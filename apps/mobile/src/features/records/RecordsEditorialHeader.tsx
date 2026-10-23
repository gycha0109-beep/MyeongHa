import { StyleSheet, Text, View } from 'react-native';

import type { RecordsTabV1 } from '@/features/records/records-view-model';
import { useMobileTheme } from '@/ui/mobile-theme';
import { MobileUiText } from '@/ui/MobileUiText';
import { useMobileUiLocale } from '@/ui/mobile-ui-locale';
import { previewMobileAuthoredUiLabelV1, type MobilePlannedUiPreviewLocaleV1 } from '@/ui/mobile-planned-ui-screen-preview-v1';

const tabLabels: Readonly<Record<RecordsTabV1, string>> = Object.freeze({
  all: '전체', life: '현세록', readings: '지난 읽기', memories: '기억',
});

/**
 * Purely visual archive header. The supplied itemCount is the number of
 * client-visible, currently loaded rows; never a server collection total.
 */
export function RecordsEditorialHeader({
  selected,
  itemCount,
  previewLocale = null,
}: {
  selected: RecordsTabV1;
  itemCount: number | null;
  previewLocale?: MobilePlannedUiPreviewLocaleV1 | null;
}) {
  const { theme } = useMobileTheme();
  const { locale, t } = useMobileUiLocale();
  const previewText = (source: string) => previewMobileAuthoredUiLabelV1(source, previewLocale, t);
  return (
    <View style={[styles.hero, theme === 'dark' && styles.heroDark]}>
      <View pointerEvents="none" style={styles.innerFrame} />
      <View pointerEvents="none" style={styles.stamp}>
        <Text style={styles.stampText}>錄</Text>
      </View>
      <View style={styles.copy}>
        <MobileUiText style={styles.eyebrow}>{previewText('MY ARCHIVE · 명하')}</MobileUiText>
        <Text style={styles.title}>{previewText('지나온 이야기에도')}{'\n'}{previewText('나의 결이 남습니다.')}</Text>
        <MobileUiText style={styles.description}>
          지금 확인할 수 있는 삶의 기록과 사주 풀이를 차분히 살펴보세요.
        </MobileUiText>
      </View>
      <View style={styles.countRow}>
        <Text style={styles.countCategory}>{previewText(tabLabels[selected])}</Text>
        <View style={styles.countDivider} />
        <Text style={styles.countText}>{itemCount === null
            ? t('기록을 확인하는 중')
            : locale === 'ja-JP' ? `読み込み済み ${itemCount}件`
              : locale === 'zh-TW' ? `已載入 ${itemCount}筆紀錄`
                : `현재 불러온 기록 ${itemCount}건`}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    minHeight: 246,
    paddingHorizontal: 22,
    paddingVertical: 23,
    borderWidth: 1,
    borderColor: '#BE9967',
    borderRadius: 23,
    backgroundColor: '#142A3E',
    overflow: 'hidden',
    gap: 17,
    justifyContent: 'space-between',
  },
  heroDark: { backgroundColor: '#112131', borderColor: '#D1AE7A' },
  innerFrame: {
    position: 'absolute', top: 8, right: 8, bottom: 8, left: 8,
    borderRadius: 16, borderColor: 'rgba(228,196,147,0.27)', borderWidth: 1,
  },
  stamp: {
    position: 'absolute', top: 27, right: -30,
    width: 167, height: 167, borderRadius: 84,
    borderWidth: 1, borderColor: 'rgba(220,177,123,0.22)',
    alignItems: 'center', justifyContent: 'center',
  },
  stampText: { color: 'rgba(220,177,123,0.12)', fontSize: 93, fontWeight: '600' },
  copy: { gap: 11, zIndex: 1, maxWidth: '97%' },
  eyebrow: { color: '#ECD1A2', fontSize: 10, fontWeight: '900', letterSpacing: 1.35 },
  title: { color: '#FFFAF0', fontSize: 26, lineHeight: 37, fontWeight: '900', letterSpacing: -0.7 },
  description: { color: '#EDE1D2', fontSize: 13, lineHeight: 21, maxWidth: 275 },
  countRow: { flexDirection: 'row', alignItems: 'center', gap: 11, zIndex: 1 },
  countCategory: { color: '#ECD1A2', fontSize: 12, fontWeight: '900' },
  countDivider: { width: 1, height: 13, backgroundColor: '#987B56' },
  countText: { color: '#F7E9D8', fontSize: 12, fontWeight: '700' },
});
