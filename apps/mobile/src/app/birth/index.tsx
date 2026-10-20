import { MyeongHaApiClientErrorV1, type BirthCalendarTypeV1, type BirthSexV1 } from '@myeongha/api-client';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

import {
  MobileBirthInputValidationErrorV1,
  buildMobileBirthProfileCreateRequestV1,
} from '@/features/birth/birth-input';
import { mobileBirthServiceV1 } from '@/features/birth/native-mobile-birth-service';
import { BirthDateCalendar } from '@/features/birth/BirthDateCalendar';
import { BirthTime12HourField } from '@/features/birth/BirthTime12HourField';
import {
  formatMobileBirthClock24HourV1,
  type MobileBirthMeridiemV1,
} from '@/features/birth/birth-clock-12hour';
import { mobileHomeControllerV1 } from '@/features/home/native-mobile-home-controller';
import { mobileColors } from '@/ui/mobile-colors';
import { MobileUiText } from '@/ui/MobileUiText';
import { useMobileThemedStyles } from '@/ui/use-mobile-themed-styles';
import { useMobilePullRefreshV1 } from '@/ui/use-mobile-pull-refresh';

const sexOptions = [
  { value: 'male', label: '남성' },
  { value: 'female', label: '여성' },
  { value: 'unspecified', label: '선택 안 함' },
] as const satisfies ReadonlyArray<{ value: Exclude<BirthSexV1, null>; label: string }>;

export default function BirthInputScreen() {
  const styles = useMobileThemedStyles(staticStyles);
  const [calendarType, setCalendarType] = useState<BirthCalendarTypeV1>('solar');
  const [year, setYear] = useState('');
  const [month, setMonth] = useState('');
  const [day, setDay] = useState('');
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [meridiem, setMeridiem] = useState<MobileBirthMeridiemV1>('am');
  const [hour12, setHour12] = useState('');
  const [minute, setMinute] = useState('00');
  const [timeKnown, setTimeKnown] = useState(true);
  const [isLeapMonth, setIsLeapMonth] = useState(false);
  const [sex, setSex] = useState<BirthSexV1>('unspecified');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const refreshBirthStatus = useCallback(async () => {
    if (submitting) return;
    // Inspect current authority without overwriting the unsaved form fields.
    try {
      const current = await mobileBirthServiceV1.readCurrent();
      setError(current === null
        ? ''
        : '이미 등록된 출생정보가 있습니다. 현재 내용은 사주 탭에서 확인해 주세요.');
    } catch {
      setError('현재 출생정보를 다시 확인하지 못했습니다. 입력 내용은 그대로 유지됩니다.');
    }
  }, [submitting]);
  const { refreshing, onRefresh } = useMobilePullRefreshV1(refreshBirthStatus);

  const chooseCalendar = (value: BirthCalendarTypeV1) => {
    setCalendarType(value);
    if (value === 'solar') setIsLeapMonth(false);
  };

  const submit = async () => {
    setError('');
    let request;
    try {
      const birthTime = timeKnown
        ? formatMobileBirthClock24HourV1({ meridiem, hour12, minute })
        : '';
      request = buildMobileBirthProfileCreateRequestV1({
        calendarType,
        year,
        month,
        day,
        birthTime,
        timeKnown,
        isLeapMonth,
        sex,
      });
    } catch (cause) {
      if (cause instanceof MobileBirthInputValidationErrorV1) {
        setError(cause.message);
        return;
      }
      setError('출생정보를 확인해 주세요.');
      return;
    }

    setSubmitting(true);
    try {
      await mobileBirthServiceV1.create(request);
      mobileHomeControllerV1.invalidate();
      router.replace('/reading');
    } catch (cause) {
      if (
        cause instanceof MyeongHaApiClientErrorV1 &&
        cause.kind === 'http' &&
        cause.code === 'INVALID_REQUEST'
      ) {
        try {
          const existing = await mobileBirthServiceV1.readCurrent();
          if (existing !== null) {
            mobileHomeControllerV1.invalidate();
            router.replace('/reading');
            return;
          }
        } catch {
          // Preserve the original bounded create failure below.
        }
        setError('입력값을 처리하지 못했습니다. 생년월일과 출생시간을 확인해 주세요.');
        return;
      }

      if (
        cause instanceof MyeongHaApiClientErrorV1 &&
        cause.kind === 'network'
      ) {
        setError('서버에 연결하지 못했습니다. 네트워크를 확인하고 다시 시도해 주세요.');
        return;
      }
      setError('출생정보를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
        refreshControl={(
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void onRefresh()}
            enabled={!submitting}
            tintColor={mobileColors.navy}
            colors={[mobileColors.navy]}
          />
        )}
      >
        <Pressable accessibilityRole="button" onPress={() => router.back()}>
          <MobileUiText style={styles.back}>‹ 사주로 돌아가기</MobileUiText>
        </Pressable>

        <View style={styles.header}>
          <Text style={styles.eyebrow}>BIRTH PROFILE</Text>
          <MobileUiText style={styles.title}>출생정보</MobileUiText>
          <MobileUiText style={styles.description}>
            명식을 계산하기 위한 현재 자기 출생정보를 등록합니다.
          </MobileUiText>
        </View>

        <View style={styles.section}>
          <MobileUiText style={styles.label}>달력</MobileUiText>
          <View style={styles.segmentRow}>
            {(['solar', 'lunar'] as const).map((value) => (
              <Pressable
                key={value}
                accessibilityRole="button"
                accessibilityState={{ selected: calendarType === value }}
                onPress={() => chooseCalendar(value)}
                style={[styles.segment, calendarType === value && styles.segmentSelected]}
              >
                <Text style={[styles.segmentText, calendarType === value && styles.segmentTextSelected]}>
                  {value === 'solar' ? '양력' : '음력'}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <MobileUiText style={styles.label}>생년월일</MobileUiText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('출생 생년월일 달력 열기')}
            onPress={() => setDatePickerVisible(true)}
            style={({ pressed }) => [styles.dateButton, pressed && styles.pressed]}
          >
            <View style={styles.dateIcon}>
              <Text style={styles.dateIconText}>▦</Text>
            </View>
            <View style={styles.dateCopy}>
              <Text style={styles.dateHint}>{t(calendarType === 'solar' ? '양력 생년월일' : '음력 생년월일')}</Text>
              <Text style={[styles.dateValue, !year && styles.datePlaceholder]}>
                {year && month && day
                  ? year + '년 ' + Number(month) + '월 ' + Number(day) + '일'
                  : '달력에서 날짜 선택'}
              </Text>
            </View>
            <Text style={styles.dateChevron}>›</Text>
          </Pressable>
          <MobileUiText style={styles.helper}>
            연도 → 월 → 날짜 순서로 선택할 수 있습니다.
          </MobileUiText>
          <BirthDateCalendar
            visible={datePickerVisible}
            calendarType={calendarType}
            value={{ year, month, day }}
            onClose={() => setDatePickerVisible(false)}
            onSelect={(value) => {
              setYear(value.year);
              setMonth(value.month);
              setDay(value.day);
              setError('');
            }}
          />
        </View>

        <View style={styles.section}>
          <View style={styles.rowBetween}>
            <MobileUiText style={styles.label}>출생시간</MobileUiText>
            <View style={styles.inlineSwitch}>
              <MobileUiText style={styles.switchLabel}>시간 모름</MobileUiText>
              <Switch
                value={!timeKnown}
                onValueChange={(unknown) => {
                  setTimeKnown(!unknown);
                  if (unknown) {
                    setHour12('');
                    setMinute('00');
                    setMeridiem('am');
                  }
                }}
              />
            </View>
          </View>
          <BirthTime12HourField
            meridiem={meridiem}
            hour12={hour12}
            minute={minute}
            disabled={!timeKnown}
            onMeridiemChange={setMeridiem}
            onHourChange={setHour12}
            onMinuteChange={setMinute}
          />
        </View>

        {calendarType === 'lunar' ? (
          <View style={[styles.section, styles.rowBetween]}>
            <View>
              <MobileUiText style={styles.label}>윤달</MobileUiText>
              <MobileUiText style={styles.helper}>윤달로 태어난 경우에만 켜 주세요.</MobileUiText>
            </View>
            <Switch value={isLeapMonth} onValueChange={setIsLeapMonth} />
          </View>
        ) : null}

        <View style={styles.section}>
          <MobileUiText style={styles.label}>성별</MobileUiText>
          <View style={styles.segmentRow}>
            {sexOptions.map((option) => (
              <Pressable
                key={option.value}
                accessibilityRole="button"
                accessibilityState={{ selected: sex === option.value }}
                onPress={() => setSex(option.value)}
                style={[styles.segment, sex === option.value && styles.segmentSelected]}
              >
                <Text style={[styles.segmentText, sex === option.value && styles.segmentTextSelected]}>
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          accessibilityRole="button"
          disabled={submitting}
          onPress={() => void submit()}
          style={[styles.primaryButton, submitting && styles.primaryButtonDisabled]}
        >
          {submitting ? (
            <ActivityIndicator color={mobileColors.surface} />
          ) : (
            <MobileUiText style={styles.primaryButtonText}>내 사주 보기</MobileUiText>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: mobileColors.canvas },
  content: { paddingHorizontal: 22, paddingTop: 20, paddingBottom: 48, gap: 24 },
  back: { color: mobileColors.navy, fontSize: 15, fontWeight: '700' },
  header: { gap: 8 },
  eyebrow: { color: mobileColors.gold, fontSize: 12, fontWeight: '700', letterSpacing: 1.2 },
  title: { color: mobileColors.ink, fontSize: 32, fontWeight: '900' },
  description: { color: mobileColors.muted, fontSize: 15, lineHeight: 22 },
  section: { gap: 13 },
  label: { color: mobileColors.ink, fontSize: 17, fontWeight: '900' },
  helper: { marginTop: 4, color: mobileColors.muted, fontSize: 13 },
  segmentRow: { flexDirection: 'row', gap: 8 },
  segment: {
    flex: 1,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: 12,
    backgroundColor: mobileColors.surface,
  },
  segmentSelected: { backgroundColor: mobileColors.navy, borderColor: mobileColors.navy },
  segmentText: { color: mobileColors.muted, fontSize: 15, fontWeight: '700' },
  segmentTextSelected: { color: mobileColors.surface },
  dateButton: {
    minHeight: 82,
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: 17,
    backgroundColor: mobileColors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
    paddingHorizontal: 16,
  },
  dateIcon: {
    width: 46,
    height: 46,
    borderWidth: 1,
    borderColor: mobileColors.gold,
    borderRadius: 13,
    backgroundColor: mobileColors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateIconText: { color: mobileColors.gold, fontSize: 28, fontWeight: '800' },
  dateCopy: { flex: 1, gap: 6 },
  dateHint: { color: mobileColors.muted, fontSize: 12, fontWeight: '800' },
  dateValue: { color: mobileColors.ink, fontSize: 17, fontWeight: '900' },
  datePlaceholder: { color: mobileColors.muted, fontSize: 16 },
  dateChevron: { color: mobileColors.navy, fontSize: 28, fontWeight: '700' },
  pressed: { opacity: 0.76 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  inlineSwitch: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  switchLabel: { color: mobileColors.muted, fontSize: 13 },
  error: { color: mobileColors.seal, fontSize: 14, lineHeight: 20 },
  primaryButton: {
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: mobileColors.navy,
  },
  primaryButtonDisabled: { opacity: 0.65 },
  primaryButtonText: { color: mobileColors.surface, fontSize: 17, fontWeight: '800' },
});
const staticStyles = styles;
