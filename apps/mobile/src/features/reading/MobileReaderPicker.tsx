import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  findMobileReaderPresentationV1,
  MOBILE_READER_PRESENTATIONS_V1,
  type MobileReaderPresentationIdV1,
} from '@/features/reading/mobile-reader-presentation';
import { mobileColors } from '@/ui/mobile-colors';

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
  const [expanded, setExpanded] = useState(false);
  const reader = findMobileReaderPresentationV1(selected);
  return (
    <View style={styles.panel}>
      <View style={styles.heading}>
        <View style={styles.headingCopy}>
          <Text style={styles.kicker}>READER · 화면 연출 선택</Text>
          <Text style={styles.title}>{reader.name} <Text style={styles.subtitle}>· {reader.title}</Text></Text>
          <Text style={styles.tone}>{reader.tone}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Reader 선택"
          accessibilityState={{ expanded }}
          onPress={() => setExpanded((current) => !current)}
          style={styles.action}
        >
          <Text style={styles.actionText}>{expanded ? '닫기' : '변경'}</Text>
        </Pressable>
      </View>
      {expanded ? (
        <View style={styles.grid}>
          {MOBILE_READER_PRESENTATIONS_V1.map((option) => (
            <Pressable
              key={option.key}
              accessibilityRole="button"
              accessibilityLabel={`${option.name} Reader 선택`}
              accessibilityState={{ selected: selected === option.key }}
              onPress={() => { onChange(option.key); setExpanded(false); }}
              style={[styles.option, selected === option.key && styles.selected]}
            >
              <Text style={[styles.optionName, selected === option.key && styles.selectedText]}>
                {option.name}
              </Text>
              <Text style={[styles.optionTitle, selected === option.key && styles.selectedText]}>
                {option.title}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <Text style={styles.notice}>
        {vertical === 'saju'
          ? '선택한 Reader는 현재 사주 프리뷰 화면의 표시만 바꿉니다. 해석 근거와 내용은 변경되지 않습니다.'
          : '선택한 Reader는 현재 관상 준비 화면의 표시만 바꿉니다. 사진 분석과 Reader 풀이는 아직 열리지 않았습니다.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 12, padding: 16, borderRadius: 17, borderColor: mobileColors.border, borderWidth: 1, backgroundColor: mobileColors.surface },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headingCopy: { flex: 1, gap: 5 },
  kicker: { color: mobileColors.gold, fontSize: 10, fontWeight: '900', letterSpacing: 0.7 },
  title: { color: mobileColors.ink, fontSize: 20, fontWeight: '800' },
  subtitle: { color: mobileColors.muted, fontSize: 13, fontWeight: '700' },
  tone: { color: mobileColors.muted, fontSize: 12, lineHeight: 19 },
  action: { minHeight: 42, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: mobileColors.border, justifyContent: 'center' },
  actionText: { color: mobileColors.navy, fontSize: 13, fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: { width: '31%', minHeight: 65, borderWidth: 1, borderColor: mobileColors.border, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 3, backgroundColor: mobileColors.canvas, padding: 5 },
  selected: { backgroundColor: mobileColors.navy, borderColor: mobileColors.navy },
  optionName: { color: mobileColors.ink, fontSize: 14, fontWeight: '800' },
  optionTitle: { color: mobileColors.muted, fontSize: 10, textAlign: 'center' },
  selectedText: { color: mobileColors.surface },
  notice: { color: mobileColors.muted, fontSize: 11, lineHeight: 17 },
});
