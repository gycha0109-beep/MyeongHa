import { useState } from 'react';
import {
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { MobileBirthMeridiemV1 } from './birth-clock-12hour.js';
import { mobileColors } from '@/ui/mobile-colors';
import { MobileUiText } from '@/ui/MobileUiText';
import { useMobileThemedStyles } from '@/ui/use-mobile-themed-styles';
import { useMobileUiLocale } from '@/ui/mobile-ui-locale';

const HOURS = Array.from({ length: 12 }, (_, index) => String(index + 1));

function periodLabelFor(option: MobileBirthMeridiemV1, locale: 'ko-KR' | 'ja-JP' | 'zh-TW'): string {
  if (locale === 'ja-JP') return option === 'am' ? '午前' : '午後';
  if (locale === 'zh-TW') return option === 'am' ? '上午' : '下午';
  return option === 'am' ? '오전' : '오후';
}

export function BirthTime12HourField({
  meridiem, hour12, minute, disabled, onMeridiemChange, onHourChange, onMinuteChange,
}: {
  meridiem: MobileBirthMeridiemV1;
  hour12: string;
  minute: string;
  disabled: boolean;
  onMeridiemChange: (value: MobileBirthMeridiemV1) => void;
  onHourChange: (value: string) => void;
  onMinuteChange: (value: string) => void;
}) {
  const styles = useMobileThemedStyles(staticStyles);
  const { locale, t } = useMobileUiLocale();
  const hourUnit = locale === 'ko-KR' ? '시' : locale === 'ja-JP' ? '時' : '時';
  const minuteUnit = locale === 'ko-KR' ? '분' : locale === 'ja-JP' ? '分' : '分';
  const [hourModalVisible, setHourModalVisible] = useState(false);
  const periodLabel = locale === 'ja-JP'
    ? meridiem === 'am' ? '午前' : '午後'
    : locale === 'zh-TW'
      ? meridiem === 'am' ? '上午' : '下午'
      : meridiem === 'am' ? '오전' : '오후';

  return (
    <>
      <View style={[styles.container, disabled && styles.disabled]}>
        <MobileUiText style={styles.helper}>24시간 숫자 대신 오전/오후와 시각을 선택해 주세요.</MobileUiText>
        <View style={styles.meridiemRow}>
          {(['am', 'pm'] as const).map((option) => {
            const selected = meridiem === option;
            return (
              <Pressable
                key={option}
                accessibilityRole="button"
                accessibilityLabel={t(option === 'am' ? '오전' : '오후')}
                accessibilityState={{ selected, disabled }}
                disabled={disabled}
                onPress={() => onMeridiemChange(option)}
                style={[styles.meridiemButton, selected && styles.selected]}>
                <Text style={[styles.meridiemText, selected && styles.selectedText]}>
                  {periodLabelFor(option, locale) + (option === 'am' ? ' (AM)' : ' (PM)')}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.clockRow}>
          <View style={styles.clockPart}>
            <MobileUiText style={styles.fieldLabel}>시</MobileUiText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('출생시간 시 선택')}
              accessibilityState={{ disabled }}
              disabled={disabled}
              onPress={() => setHourModalVisible(true)}
              style={styles.hourButton}
            >
              <Text style={[styles.hourText, !hour12 && styles.placeholderText]}>
                {hour12 ? hour12 + hourUnit : t('시 선택')}
              </Text>
              <Text style={styles.chevron}>⌄</Text>
            </Pressable>
          </View>
          <Text style={styles.colon}>:</Text>
          <View style={styles.clockPart}>
            <MobileUiText style={styles.fieldLabel}>분</MobileUiText>
            <View style={styles.minuteWrapper}>
              <TextInput
                accessibilityLabel={t('출생시간 분')}
                editable={!disabled}
                keyboardType="number-pad"
                maxLength={2}
                selectTextOnFocus
                value={minute}
                onChangeText={(value) => onMinuteChange(value.replace(/\D/gu, '').slice(0, 2))}
                placeholder="00"
                placeholderTextColor={mobileColors.muted}
                style={styles.minuteInput}
              />
              <MobileUiText style={styles.minuteUnit}>분</MobileUiText>
            </View>
          </View>
        </View>
        <Text style={styles.preview}>
          {disabled
            ? t('출생시간을 모르는 경우 시간은 저장하지 않습니다.')
            : hour12
              ? periodLabel + ' ' + hour12 + hourUnit + ' ' + (minute || '—') + minuteUnit
              : t('먼저 태어난 시각을 선택해 주세요. 분은 00~59로 입력합니다.')}
        </Text>
      </View>

      <Modal
        visible={hourModalVisible && !disabled}
        transparent
        animationType="slide"
        onRequestClose={() => setHourModalVisible(false)}
      >
        <SafeAreaView style={styles.overlay}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('시 선택 닫기')}
            onPress={() => setHourModalVisible(false)}
            style={styles.scrim}
          />
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeading}>
                <Text style={styles.modalEyebrow}>{periodLabel} · 12시간제</Text>
                <MobileUiText style={styles.modalTitle}>태어난 시각 선택</MobileUiText>
              </View>
              <Pressable accessibilityRole="button"
                onPress={() => setHourModalVisible(false)} style={styles.closeButton}>
                <MobileUiText style={styles.closeText}>닫기 ✕</MobileUiText>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.hourGrid}>
              {HOURS.map((hour) => {
                const selected = hour12 === hour;
                return (
                  <Pressable
                    key={hour} accessibilityRole="button" accessibilityLabel={periodLabel + ' ' + hour + hourUnit}
                    accessibilityState={{ selected }}
                    onPress={() => { onHourChange(hour); setHourModalVisible(false); }}
                    style={[styles.hourChoice, selected && styles.selected]}
                  >
                    <Text style={[styles.hourChoiceText, selected && styles.selectedText]}>{hour}{hourUnit}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { gap: 13 },
  disabled: { opacity: 0.52 },
  helper: { color: mobileColors.muted, fontSize: 13, lineHeight: 20 },
  meridiemRow: { flexDirection: 'row', gap: 9 },
  meridiemButton: {
    flex: 1, minHeight: 50, borderWidth: 1, borderColor: mobileColors.border,
    borderRadius: 13, backgroundColor: mobileColors.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  selected: { backgroundColor: mobileColors.navy, borderColor: mobileColors.navy },
  meridiemText: { color: mobileColors.ink, fontSize: 14, fontWeight: '800' },
  selectedText: { color: mobileColors.surface },
  clockRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 9 },
  clockPart: { flex: 1, gap: 8 },
  fieldLabel: { color: mobileColors.muted, fontSize: 12, fontWeight: '800' },
  hourButton: {
    minHeight: 55, borderRadius: 13, backgroundColor: mobileColors.surface,
    borderWidth: 1, borderColor: mobileColors.border,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16,
  },
  hourText: { color: mobileColors.ink, fontSize: 19, fontWeight: '900' },
  placeholderText: { color: mobileColors.muted, fontSize: 15 },
  chevron: { color: mobileColors.gold, fontSize: 23, fontWeight: '900' },
  colon: { color: mobileColors.ink, fontSize: 22, fontWeight: '900', marginBottom: 14 },
  minuteWrapper: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: mobileColors.border,
    borderRadius: 13, backgroundColor: mobileColors.surface, paddingRight: 16,
  },
  minuteInput: {
    flex: 1, minHeight: 53, paddingHorizontal: 16, color: mobileColors.ink,
    fontSize: 19, fontWeight: '900',
  },
  minuteUnit: { color: mobileColors.muted, fontSize: 13, fontWeight: '800' },
  preview: { color: mobileColors.muted, fontSize: 12, lineHeight: 19 },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(6,15,26,0.6)' },
  scrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  modalSheet: {
    backgroundColor: mobileColors.canvas, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    borderWidth: 1, borderColor: mobileColors.border, padding: 22, gap: 17,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  modalHeading: { flex: 1, gap: 6 },
  modalEyebrow: { color: mobileColors.gold, fontSize: 11, letterSpacing: 1, fontWeight: '900' },
  modalTitle: { color: mobileColors.ink, fontSize: 20, fontWeight: '900' },
  closeButton: { minHeight: 48, paddingHorizontal: 7, justifyContent: 'center' },
  closeText: { color: mobileColors.navy, fontSize: 13, fontWeight: '800' },
  hourGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, paddingBottom: 16 },
  hourChoice: {
    width: '30%', minHeight: 55, backgroundColor: mobileColors.surface,
    borderWidth: 1, borderColor: mobileColors.border, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
  },
  hourChoiceText: { color: mobileColors.ink, fontSize: 16, fontWeight: '800' },
});
const staticStyles = styles;
