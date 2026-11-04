import { StyleSheet, Text, View } from 'react-native';

import { mobileSajuReportOutlineCopyV1 } from './mobile-saju-report-outline-copy';
import { mobileColors } from '@/ui/mobile-colors';
import { useMobileThemedStyles } from '@/ui/use-mobile-themed-styles';
import { useMobileUiLocale } from '@/ui/mobile-ui-locale';

/** Public product-structure preview; never renders personal/paid interpretation bytes. */
export function SajuReportStructurePreview() {
  const styles = useMobileThemedStyles(staticStyles);
  const { locale } = useMobileUiLocale();
  const copy = mobileSajuReportOutlineCopyV1(locale);

  return (
    <View style={styles.section}>
      <View style={styles.heading}>
        <Text style={styles.title}>{copy.heading}</Text>
        <Text style={styles.tag}>{copy.example}</Text>
      </View>
      <Text style={styles.description}>{copy.description}</Text>
      <View style={styles.exampleSheet} accessibilityLabel={copy.notResult}>
        <Text style={styles.chapter}>{copy.chapter}</Text>
        <Text style={styles.contents}>{copy.contents}</Text>
        <Text style={styles.disclaimer}>{copy.notResult}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 13, paddingTop: 8 },
  heading: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, alignItems: 'center' },
  title: { color: mobileColors.ink, fontSize: 20, fontWeight: '800' },
  tag: { color: mobileColors.gold, fontSize: 11, fontWeight: '800' },
  description: { color: mobileColors.muted, fontSize: 13, lineHeight: 20 },
  exampleSheet: {
    padding: 19, gap: 13, borderRadius: 18, borderWidth: 1,
    borderColor: mobileColors.border, backgroundColor: mobileColors.surface,
  },
  chapter: { color: mobileColors.navy, fontSize: 17, lineHeight: 26, fontWeight: '800' },
  contents: { color: mobileColors.ink, fontSize: 13, lineHeight: 22 },
  disclaimer: { color: mobileColors.muted, fontSize: 11, lineHeight: 17 },
});
const staticStyles = styles;
