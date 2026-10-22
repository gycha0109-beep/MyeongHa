import type { OfficialReadingRecordV1 } from '@myeongha/api-client';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { projectMobileOfficialReadingReaderEntryV1 } from '@/features/reading/mobile-official-reading-reader-entry-view-model';
import {
  MOBILE_READER_PRESENTATIONS_V1,
  findMobileReaderPresentationV1,
  isMobileReaderPreviewSelectableV1,
  type MobileReaderPresentationIdV1,
} from '@/features/reading/mobile-reader-presentation';
import { mobileColors } from '@/ui/mobile-colors';
import { useMobileUiLocale } from '@/ui/mobile-ui-locale';
import { projectMobileOfficialReaderEntryUiV1 } from '@/features/reading/mobile-official-reader-entry-locale-v1';

export function MobileOfficialReadingReaderEntry({
  record,
}: Readonly<{ record: OfficialReadingRecordV1 }>) {
  // Local presentation selection is not a purchase, interpretation or Thread action.
  const [selectedReaderId, setSelectedReaderId] = useState<MobileReaderPresentationIdV1>('seyeon');
  const selectedReader = findMobileReaderPresentationV1(selectedReaderId);
  const entry = projectMobileOfficialReadingReaderEntryV1(record, selectedReaderId);
  const { locale } = useMobileUiLocale();
  const ui = projectMobileOfficialReaderEntryUiV1(locale, entry.status);

  return (
    <View style={styles.panel}>
      <Text style={styles.eyebrow}>{ui.eyebrow}</Text>
      <Text style={styles.title}>{ui.title}</Text>
      <Text style={styles.copy}>{ui.description}</Text>
      <View style={styles.grid}>
        {MOBILE_READER_PRESENTATIONS_V1.map((reader) => (
          <Pressable
            key={reader.key}
            accessibilityRole="button"
            accessibilityLabel={`${reader.name} ${ui.viewIntroduction}`}
            accessibilityHint={ui.viewIntroductionHint}
            accessibilityState={{ selected: selectedReaderId === reader.key }}
            onPress={() => setSelectedReaderId(reader.key)}
            style={[
              styles.tile,
              isMobileReaderPreviewSelectableV1(reader.key) && styles.preview,
              selectedReaderId === reader.key && styles.selectedTile,
            ]}
          >
            <Text style={styles.name}>{reader.name}</Text>
            <Text style={styles.sub}>{reader.title}</Text>
            <Text style={styles.sub}>
              {isMobileReaderPreviewSelectableV1(reader.key) ? ui.preview : ui.conceptPending}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.introduction} accessibilityLiveRegion="polite">
        <Text style={styles.introductionTitle}>{selectedReader.name} · {selectedReader.title}</Text>
        <Text style={styles.copy}>{selectedReader.tone}</Text>
        {ui.sourceNotice ? <Text style={styles.copy}>{ui.sourceNotice}</Text> : null}
        <Text style={styles.copy}>{ui.selectionBoundary}</Text>
      </View>
      <Text style={styles.name}>{ui.statusTitle}</Text>
      <Text style={styles.copy}>{ui.statusMessage}</Text>
      <View accessible accessibilityLabel={ui.disabledAccessibilityLabel} style={styles.disabled}>
        <Text style={styles.disabledText}>{ui.disabledLabel}</Text>
      </View>
      <Text style={styles.copy}>{ui.authorityBoundary}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { borderWidth: 1, borderColor: mobileColors.border, borderRadius: 18, backgroundColor: mobileColors.surface, padding: 18, gap: 12 },
  eyebrow: { color: mobileColors.gold, fontSize: 11, fontWeight: '900' },
  title: { color: mobileColors.ink, fontSize: 20, fontWeight: '800' },
  copy: { color: mobileColors.muted, fontSize: 13, lineHeight: 20 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { width: '31%', minHeight: 88, borderWidth: 1, borderColor: mobileColors.border, borderRadius: 12, padding: 6, alignItems: 'center', justifyContent: 'center', gap: 4 },
  preview: { borderColor: mobileColors.gold, backgroundColor: mobileColors.canvas },
  selectedTile: { borderWidth: 2, borderColor: mobileColors.navy, backgroundColor: mobileColors.canvas },
  introduction: { borderWidth: 1, borderColor: mobileColors.border, borderRadius: 12, backgroundColor: mobileColors.canvas, padding: 14, gap: 7 },
  introductionTitle: { color: mobileColors.navy, fontSize: 16, fontWeight: '800' },
  name: { color: mobileColors.ink, fontSize: 15, fontWeight: '800' },
  sub: { color: mobileColors.muted, fontSize: 10, textAlign: 'center' },
  disabled: { backgroundColor: mobileColors.border, borderRadius: 12, minHeight: 46, alignItems: 'center', justifyContent: 'center' },
  disabledText: { color: mobileColors.muted, fontSize: 14, fontWeight: '800' },
});
