import { MyeongHaApiClientErrorV1, type BirthCalendarTypeV1, type BirthSexV1 } from '@myeongha/api-client';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  MobileBirthInputValidationErrorV1,
  buildMobileBirthProfileCreateRequestV1,
} from '@/features/birth/birth-input';
import { mobileBirthServiceV1 } from '@/features/birth/native-mobile-birth-service';
import { mobileColors } from '@/ui/mobile-colors';

const sexOptions = [
  { value: 'male', label: '남성' },
  { value: 'female', label: '여성' },
  { value: 'unspecified', label: '선택 안 함' },
] as const satisfies ReadonlyArray<{ value: Exclude<BirthSexV1, null>; label: string }>;

export default function BirthInputScreen() {
  const [calendarType, setCalendarType] = useState<BirthCalendarTypeV1>('solar');
  const [year, setYear] = useState('');
  const [month, setMonth] = useState('');
  const [day, setDay] = useState('');
  const [birthTime, setBirthTime] = useState('');
  const [timeKnown, setTimeKnown] = useState(true);
  const [isLeapMonth, setIsLeapMonth] = useState(false);
  const [sex, setSex] = useState<BirthSexV1>('unspecified');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const chooseCalendar = (value: BirthCalendarTypeV1) => {
    setCalendarType(value);
    if (value === 'solar') setIsLeapMonth(false);
  };

  const submit = async () => {
    setError('');
    let request;
    try {
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
      >
        <Pressable accessibilityRole="button" onPress={() => router.back()}>
          <Text style={styles.back}>‹ 사주로 돌아가기</Text>
        </Pressable>

        <View style={styles.header}>
          <Text style={styles.eyebrow}>BIRTH PROFILE</Text>
          <Text style={styles.title}>출생정보</Text>
          <Text style={styles.description}>
            명식을 계산하기 위한 현재 자기 출생정보를 등록합니다.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>달력</Text>
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
          <Text style={styles.label}>생년월일</Text>
          <View style={styles.dateRow}>
            <TextInput
              accessibilityLabel="출생 연도"
              value={year}
              onChangeText={(value) => setYear(value.replace(/\D/gu, '').slice(0, 4))}
              keyboardType="number-pad"
              maxLength={4}
              placeholder="1995"
              placeholderTextColor={mobileColors.muted}
              style={[styles.input, styles.yearInput]}
            />
            <TextInput
              accessibilityLabel="출생 월"
              value={month}
              onChangeText={(value) => setMonth(value.replace(/\D/gu, '').slice(0, 2))}
              keyboardType="number-pad"
              maxLength={2}
              placeholder="08"
              placeholderTextColor={mobileColors.muted}
              style={[styles.input, styles.shortInput]}
            />
            <TextInput
              accessibilityLabel="출생 일"
              value={day}
              onChangeText={(value) => setDay(value.replace(/\D/gu, '').slice(0, 2))}
              keyboardType="number-pad"
              maxLength={2}
              placeholder="17"
              placeholderTextColor={mobileColors.muted}
              style={[styles.input, styles.shortInput]}
            />
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.rowBetween}>
            <Text style={styles.label}>출생시간</Text>
            <View style={styles.inlineSwitch}>
              <Text style={styles.switchLabel}>시간 모름</Text>
              <Switch
                value={!timeKnown}
                onValueChange={(unknown) => {
                  setTimeKnown(!unknown);
                  if (unknown) setBirthTime('');
                }}
              />
            </View>
          </View>
          <TextInput
            accessibilityLabel="출생시간"
            editable={timeKnown}
            value={birthTime}
            onChangeText={setBirthTime}
            placeholder={timeKnown ? '14:30' : '시간 모름'}
            placeholderTextColor={mobileColors.muted}
            style={[styles.input, !timeKnown && styles.inputDisabled]}
          />
        </View>

        {calendarType === 'lunar' ? (
          <View style={[styles.section, styles.rowBetween]}>
            <View>
              <Text style={styles.label}>윤달</Text>
              <Text style={styles.helper}>윤달로 태어난 경우에만 켜 주세요.</Text>
            </View>
            <Switch value={isLeapMonth} onValueChange={setIsLeapMonth} />
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.label}>성별</Text>
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
            <Text style={styles.primaryButtonText}>내 사주 보기</Text>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: mobileColors.canvas },
  content: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 44, gap: 22 },
  back: { color: mobileColors.navy, fontSize: 15, fontWeight: '700' },
  header: { gap: 8 },
  eyebrow: { color: mobileColors.gold, fontSize: 12, fontWeight: '700', letterSpacing: 1.2 },
  title: { color: mobileColors.ink, fontSize: 32, fontWeight: '700' },
  description: { color: mobileColors.muted, fontSize: 15, lineHeight: 22 },
  section: { gap: 10 },
  label: { color: mobileColors.ink, fontSize: 16, fontWeight: '700' },
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
  dateRow: { flexDirection: 'row', gap: 8 },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: 12,
    backgroundColor: mobileColors.surface,
    color: mobileColors.ink,
    paddingHorizontal: 14,
    fontSize: 17,
  },
  inputDisabled: { opacity: 0.55 },
  yearInput: { flex: 2 },
  shortInput: { flex: 1 },
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
