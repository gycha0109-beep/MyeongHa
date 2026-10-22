import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  findMobileReaderPresentationV1,
  MOBILE_READER_VISIBLE_LAUNCH_PRESENTATIONS_V1,
  type MobileReaderPresentationIdV1,
  isMobileReaderPreviewSelectableV1,
} from '@/features/reading/mobile-reader-presentation';
import { createMobileReaderAccessViewStateV1 } from '@/features/reading/mobile-reader-access-view-model';
import { mobileColors } from '@/ui/mobile-colors';
import { useMobileUiLocale } from '@/ui/mobile-ui-locale';
import { projectMobileReaderPickerUiV1 } from '@/features/reading/mobile-reader-picker-ui-locale-v1';
import { useMobileThemedStyles } from '@/ui/use-mobile-themed-styles';
import { resolveMobileChatPortraitV1 } from '@/features/chat/chat-character-portraits';

interface MobileReaderPickerPropsV1 {
  readonly selected: MobileReaderPresentationIdV1;
  readonly onChange: (reader: MobileReaderPresentationIdV1) => void;
  readonly vertical: 'saju' | 'face';
}

/**
 * Presentation-only Reader selector. Does not invoke Reader Interpretation,
 * create a Thread, assert eligibility, or alter the Saju/Face source result.
 */
export function MobileReaderPicker({ selected, onChange, vertical }: MobileReaderPickerPropsV1) {
  const styles = useMobileThemedStyles(staticStyles);
  const { locale } = useMobileUiLocale();
  const ui = projectMobileReaderPickerUiV1(locale);
  const [expanded, setExpanded] = useState(false);
  const effectiveSelected = isMobileReaderPreviewSelectableV1(selected) ? selected : 'seyeon';
  const reader = findMobileReaderPresentationV1(effectiveSelected);
  const selectedPortrait = resolveMobileChatPortraitV1(effectiveSelected);
  return (
    <View style={styles.panel}>
      <View style={styles.heading}>
        {selectedPortrait !== null ? (
          <Image
            source={selectedPortrait}
            style={styles.selectedPortrait}
            resizeMode="cover"
            accessibilityLabel={`${reader.name} ${ui.portrait}`}
          />
        ) : null}
        <View style={styles.headingCopy}>
          <Text style={styles.kicker}>{ui.kicker}</Text>
          <Text style={styles.title}>{reader.name} <Text style={styles.subtitle}>· {reader.title}</Text></Text>
          <Text style={styles.tone}>{reader.tone}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={ui.select}
          accessibilityState={{ expanded }}
          onPress={() => setExpanded((current) => !current)}
          style={styles.action}
        >
          <Text style={styles.actionText}>{expanded ? ui.close : ui.change}</Text>
        </Pressable>
      </View>
      {expanded ? (
        <View style={styles.grid}>
          {MOBILE_READER_VISIBLE_LAUNCH_PRESENTATIONS_V1.map((option) => {
            const available = isMobileReaderPreviewSelectableV1(option.key);
            const accessView = createMobileReaderAccessViewStateV1(option.key);
            const portrait = resolveMobileChatPortraitV1(option.key);
            return (
            <Pressable
              key={option.key}
              accessibilityRole="button"
              accessibilityLabel={`${option.name} ${ui.select}`}
              accessibilityState={{ selected: effectiveSelected === option.key, disabled: !available }}
              disabled={!available}
              onPress={() => {
                if (!available) return;
                onChange(option.key);
                setExpanded(false);
              }}
              style={[styles.option, effectiveSelected === option.key && styles.selected, !available && styles.unavailable]}
            >
              {portrait !== null ? (
                <Image source={portrait} style={styles.optionPortrait} resizeMode="cover"
                  accessibilityLabel={`${option.name} ${ui.portrait}`} />
              ) : null}
              <Text style={[styles.optionName, effectiveSelected === option.key && styles.selectedText]}>
                {option.name}
              </Text>
              <Text style={[styles.optionTitle, effectiveSelected === option.key && styles.selectedText]}>
                {option.title}
              </Text>
              <Text style={styles.optionTone}>{option.tone}</Text>
              <Text style={styles.optionStatus}>
                {accessView.previewPresentation === 'preview_available' ? ui.previewOnly : ui.conceptPending}
              </Text>
            </Pressable>
            );
          })}
        </View>
      ) : null}
      <Text style={styles.notice}>{ui.selectionLimit}</Text>
      <Text style={styles.notice}>{ui.authorityBoundary}</Text>
      <Text style={styles.notice}>
        {vertical === 'saju' ? ui.saju : ui.face}
      </Text>
      {ui.sourceNotice ? <Text style={styles.notice}>{ui.sourceNotice}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 12, padding: 16, borderRadius: 17, borderColor: mobileColors.border, borderWidth: 1, backgroundColor: mobileColors.surface },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  selectedPortrait: { width: 92, height: 118, borderRadius: 14, borderWidth: 1, borderColor: mobileColors.gold },
  headingCopy: { flex: 1, gap: 5 },
  kicker: { color: mobileColors.gold, fontSize: 10, fontWeight: '900', letterSpacing: 0.7 },
  title: { color: mobileColors.ink, fontSize: 20, fontWeight: '800' },
  subtitle: { color: mobileColors.muted, fontSize: 13, fontWeight: '700' },
  tone: { color: mobileColors.muted, fontSize: 12, lineHeight: 19 },
  action: { minHeight: 42, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: mobileColors.border, justifyContent: 'center' },
  actionText: { color: mobileColors.navy, fontSize: 13, fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: { width: '31%', minHeight: 168, borderWidth: 1, borderColor: mobileColors.border, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: mobileColors.canvas, padding: 5 },
  optionPortrait: { width: '100%', height: 86, borderRadius: 9 },
  selected: { backgroundColor: mobileColors.navy, borderColor: mobileColors.navy },
  unavailable: { opacity: 0.5 },
  optionName: { color: mobileColors.ink, fontSize: 14, fontWeight: '800' },
  optionTitle: { color: mobileColors.muted, fontSize: 10, textAlign: 'center' },
  optionTone: { color: mobileColors.muted, fontSize: 10, lineHeight: 14, textAlign: 'center' },
  optionStatus: { color: mobileColors.gold, fontSize: 10, fontWeight: '800', textAlign: 'center' },
  selectedText: { color: mobileColors.surface },
  notice: { color: mobileColors.muted, fontSize: 11, lineHeight: 17 },
});
const staticStyles = styles;
