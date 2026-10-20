import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { BirthCalendarTypeV1 } from '@myeongha/api-client';
import { mobileColors } from '@/ui/mobile-colors';
import { MobileUiText } from '@/ui/MobileUiText';
import { useMobileThemedStyles } from '@/ui/use-mobile-themed-styles';
import { useMobileUiLocale } from '@/ui/mobile-ui-locale';

type PickerStep = 'year' | 'month' | 'day';
export type BirthDateParts = Readonly<{ year: string; month: string; day: string }>;

const MIN_YEAR = 1800;
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;
const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);

function validYear(value: string): number | null {
  const year = Number(value);
  return /^\d{4}$/u.test(value) && year >= MIN_YEAR && year <= new Date().getFullYear()
    ? year
    : null;
}

function daysInMonth(calendarType: BirthCalendarTypeV1, year: number, month: number): number {
  // Lunar months may contain 29 or 30 days; the server validates the actual
  // lunar date and leap month. Never use the Gregorian month length for lunar.
  return calendarType === 'lunar' ? 30 : new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function BirthDateCalendar({
  visible,
  calendarType,
  value,
  onClose,
  onSelect,
}: {
  visible: boolean;
  calendarType: BirthCalendarTypeV1;
  value: BirthDateParts;
  onClose: () => void;
  onSelect: (value: BirthDateParts) => void;
}) {
  const styles = useMobileThemedStyles(staticStyles);
  const { locale, t } = useMobileUiLocale();
  const yearUnit = locale === 'ko-KR' ? '년' : '年';
  const monthUnit = locale === 'ja-JP' ? '月' : locale === 'zh-TW' ? '月' : '월';
  const dayUnit = locale === 'ko-KR' ? '일' : '日';
  const weekdayLabels = locale === 'ko-KR' ? WEEKDAYS
    : locale === 'ja-JP' ? ['日','月','火','水','木','金','土']
      : ['日','一','二','三','四','五','六'];
  const selectedYear = validYear(value.year);
  const [step, setStep] = useState<PickerStep>('year');
  const [year, setYear] = useState(2000);
  const [month, setMonth] = useState(1);
  const [decade, setDecade] = useState(1990);

  useEffect(() => {
    if (!visible) return;
    const initialYear = selectedYear ?? 2000;
    setYear(initialYear);
    setMonth(Number(value.month) >= 1 && Number(value.month) <= 12 ? Number(value.month) : 1);
    setDecade(Math.floor(initialYear / 10) * 10);
    setStep(selectedYear !== null && value.month !== '' ? 'day' : 'year');
  }, [visible, value.year, value.month, selectedYear]);

  const todayYear = new Date().getFullYear();
  const yearChoices = useMemo(
    () => Array.from({ length: 10 }, (_, index) => decade + index),
    [decade],
  );
  const dayCount = daysInMonth(calendarType, year, month);
  const leading = calendarType === 'solar'
    ? new Date(Date.UTC(year, month - 1, 1)).getUTCDay()
    : 0;
  const dayChoices = Array.from({ length: dayCount }, (_, index) => index + 1);
  const dateLabel = t(calendarType === 'solar' ? '양력' : '음력');

  function finish(day: number) {
    onSelect({
      year: String(year),
      month: String(month).padStart(2, '0'),
      day: String(day).padStart(2, '0'),
    });
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.overlay}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('달력 닫기')} onPress={onClose} style={styles.scrim} />
        <View style={styles.sheet}>
          <View style={styles.topRow}>
            <View style={styles.heading}>
              <Text style={styles.kicker}>BIRTH DATE · {dateLabel}</Text>
              <MobileUiText style={styles.title}>생년월일 선택</MobileUiText>
            </View>
            <Pressable accessibilityRole="button" onPress={onClose} style={styles.close}>
              <MobileUiText style={styles.closeText}>닫기 ✕</MobileUiText>
            </Pressable>
          </View>

          <View style={styles.breadcrumb}>
            <Pressable accessibilityRole="button" onPress={() => {
              setDecade(Math.floor(year / 10) * 10);
              setStep('year');
            }} style={[styles.crumb, step === 'year' && styles.crumbActive]}>
              <Text style={[styles.crumbText, step === 'year' && styles.crumbTextActive]}>{year}{yearUnit}</Text>
            </Pressable>
            <Text style={styles.crumbArrow}>›</Text>
            <Pressable accessibilityRole="button" disabled={step === 'year'} onPress={() => setStep('month')} style={[styles.crumb, step === 'month' && styles.crumbActive]}>
              <Text style={[styles.crumbText, step === 'month' && styles.crumbTextActive]}>{month}{monthUnit}</Text>
            </Pressable>
            <Text style={styles.crumbArrow}>›</Text>
            <Text style={styles.currentStep}>{step === 'day' ? t('날짜 선택') : dayUnit}</Text>
          </View>

          <ScrollView style={styles.pickerScroll} contentContainerStyle={styles.pickerBody}>
            {step === 'year' ? (
              <>
                <View style={styles.navRow}>
                  <Pressable accessibilityRole="button" accessibilityLabel={t('10년 전')} disabled={decade <= MIN_YEAR}
                    onPress={() => setDecade((prev) => prev - 10)} style={styles.navButton}>
                    <Text style={styles.navText}>‹</Text>
                  </Pressable>
                  <Text style={styles.navTitle}>{decade}–{decade + 9}{yearUnit}</Text>
                  <Pressable accessibilityRole="button" accessibilityLabel={t('10년 후')} disabled={decade + 10 > todayYear}
                    onPress={() => setDecade((prev) => prev + 10)} style={styles.navButton}>
                    <Text style={styles.navText}>›</Text>
                  </Pressable>
                </View>
                <View style={styles.choiceGrid}>
                  {yearChoices.map((choice) => {
                    const disabled = choice < MIN_YEAR || choice > todayYear;
                    return (
                      <Pressable key={choice} accessibilityRole="button" accessibilityLabel={choice + yearUnit}
                        disabled={disabled} onPress={() => { setYear(choice); setStep('month'); }}
                        style={[styles.choice, choice === year && styles.selected, disabled && styles.disabled]}>
                        <Text style={[styles.choiceText, choice === year && styles.selectedText]}>{choice}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <MobileUiText style={styles.hint}>화살표로 10년 단위 이동 후 출생 연도를 선택하세요.</MobileUiText>
              </>
            ) : step === 'month' ? (
              <>
                <Text style={styles.sectionTitle}>{year}{yearUnit} · {t('출생 월')}</Text>
                <View style={styles.choiceGrid}>
                  {MONTHS.map((choice) => (
                    <Pressable key={choice} accessibilityRole="button" accessibilityLabel={choice + monthUnit}
                      onPress={() => { setMonth(choice); setStep('day'); }}
                      style={[styles.choice, choice === month && styles.selected]}>
                      <Text style={[styles.choiceText, choice === month && styles.selectedText]}>{choice}{monthUnit}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : (
              <>
                <View style={styles.navRow}>
                  <Pressable accessibilityRole="button" accessibilityLabel={t('이전 달')}
                    onPress={() => {
                      if (month === 1) { setYear((prev) => Math.max(MIN_YEAR, prev - 1)); setMonth(12); }
                      else setMonth((prev) => prev - 1);
                    }}
                    style={styles.navButton}>
                    <Text style={styles.navText}>‹</Text>
                  </Pressable>
                  <Text style={styles.navTitle}>{year}{yearUnit} {month}{monthUnit} · {dateLabel}</Text>
                  <Pressable accessibilityRole="button" accessibilityLabel={t('다음 달')}
                    disabled={year >= todayYear && month === 12}
                    onPress={() => {
                      if (month === 12) { setYear((prev) => prev + 1); setMonth(1); }
                      else setMonth((prev) => prev + 1);
                    }}
                    style={styles.navButton}>
                    <Text style={styles.navText}>›</Text>
                  </Pressable>
                </View>
                {calendarType === 'solar' ? (
                  <View style={styles.daysGrid}>
                    {weekdayLabels.map((name) => (
                      <View key={name} style={styles.weekdayCell}>
                        <Text style={styles.weekdayText}>{name}</Text>
                      </View>
                    ))}
                    {Array.from({ length: leading }, (_, index) => (
                      <View key={'space-' + index} style={styles.daySpace} />
                    ))}
                    {dayChoices.map((choice) => {
                      const active = Number(value.year) === year &&
                        Number(value.month) === month && Number(value.day) === choice;
                      return (
                        <Pressable key={choice} accessibilityRole="button"
                          accessibilityLabel={year + yearUnit + ' ' + month + monthUnit + ' ' + choice + dayUnit}
                          accessibilityState={{ selected: active }}
                          onPress={() => finish(choice)}
                          style={[styles.dayCell, active && styles.selected]}>
                          <Text style={[styles.dayText, active && styles.selectedText]}>{choice}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : (
                  <>
                    <MobileUiText style={styles.hint}>음력은 양력의 요일 배열과 다릅니다. 해당 월의 날짜를 선택해 주세요.</MobileUiText>
                    <View style={styles.daysGrid}>
                      {dayChoices.map((choice) => {
                        const active = Number(value.year) === year &&
                          Number(value.month) === month && Number(value.day) === choice;
                        return (
                          <Pressable key={choice} accessibilityRole="button"
                            accessibilityLabel={dateLabel + ' ' + year + yearUnit + ' ' + month + monthUnit + ' ' + choice + dayUnit}
                            accessibilityState={{ selected: active }}
                            onPress={() => finish(choice)}
                            style={[styles.dayCell, active && styles.selected]}>
                            <Text style={[styles.dayText, active && styles.selectedText]}>{choice}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    <MobileUiText style={styles.hint}>음력 29일·30일 및 윤달의 실제 존재 여부는 저장 시 서버에서 확인합니다.</MobileUiText>
                  </>
                )}
              </>
            )}
          </ScrollView>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(6,15,26,0.6)' },
  scrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  sheet: { backgroundColor: mobileColors.canvas, borderTopLeftRadius: 25, borderTopRightRadius: 25, borderWidth: 1, borderColor: mobileColors.border, padding: 22, maxHeight: '91%', minHeight: 370, gap: 18 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  heading: { flex: 1, gap: 5 },
  kicker: { color: mobileColors.gold, fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  title: { color: mobileColors.ink, fontSize: 22, fontWeight: '900' },
  close: { minWidth: 64, minHeight: 48, alignItems: 'flex-end', justifyContent: 'center' },
  closeText: { color: mobileColors.navy, fontSize: 13, fontWeight: '800' },
  breadcrumb: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  crumb: { borderRadius: 11, borderWidth: 1, borderColor: mobileColors.border, backgroundColor: mobileColors.surface, paddingHorizontal: 13, minHeight: 44, justifyContent: 'center' },
  crumbActive: { backgroundColor: mobileColors.navy, borderColor: mobileColors.navy },
  crumbText: { color: mobileColors.ink, fontSize: 14, fontWeight: '800' },
  crumbTextActive: { color: mobileColors.surface },
  crumbArrow: { color: mobileColors.muted, fontSize: 18, fontWeight: '900' },
  currentStep: { color: mobileColors.muted, fontSize: 13, fontWeight: '700' },
  pickerScroll: { flexGrow: 0 },
  pickerBody: { gap: 18, paddingBottom: 20 },
  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14 },
  navButton: { width: 48, height: 48, borderRadius: 13, borderWidth: 1, borderColor: mobileColors.border, backgroundColor: mobileColors.surface, alignItems: 'center', justifyContent: 'center' },
  navText: { color: mobileColors.navy, fontSize: 25, fontWeight: '700' },
  navTitle: { color: mobileColors.ink, fontSize: 18, fontWeight: '900' },
  sectionTitle: { color: mobileColors.ink, fontSize: 17, fontWeight: '800' },
  choiceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { width: '31%', minHeight: 53, borderRadius: 13, borderWidth: 1, borderColor: mobileColors.border, backgroundColor: mobileColors.surface, alignItems: 'center', justifyContent: 'center' },
  choiceText: { color: mobileColors.ink, fontSize: 16, fontWeight: '800' },
  selected: { borderColor: mobileColors.navy, backgroundColor: mobileColors.navy },
  selectedText: { color: mobileColors.surface },
  disabled: { opacity: 0.32 },
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  weekdayCell: { width: '14.2857%', minHeight: 36, alignItems: 'center', justifyContent: 'center' },
  weekdayText: { color: mobileColors.muted, fontSize: 12, fontWeight: '800' },
  daySpace: { width: '14.2857%', height: 46 },
  dayCell: { width: '14.2857%', minHeight: 46, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  dayText: { color: mobileColors.ink, fontSize: 14, fontWeight: '800' },
  hint: { color: mobileColors.muted, fontSize: 12, lineHeight: 20 },
});
const staticStyles = styles;
