import type {
  BirthCalendarTypeV1,
  BirthSexV1,
  TargetPersonCreateRequestV1,
  TargetPersonV1,
} from '@myeongha/api-client';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  MobileBirthInputValidationErrorV1,
  buildMobileTargetPersonCreateRequestV1,
} from '@/features/my/target-person-create-input';
import { mobileColors } from '@/ui/mobile-colors';

const sexOptions = [
  { value: 'male', label: '남성' },
  { value: 'female', label: '여성' },
  { value: 'unspecified', label: '선택 안 함' },
] as const satisfies ReadonlyArray<{
  value: Exclude<BirthSexV1, null>;
  label: string;
}>;

function calendarLabel(item: TargetPersonV1): string {
  const input = item.currentRevision.input;
  if (input.calendarType === 'solar') return '양력';
  return input.isLeapMonth ? '음력 · 윤달' : '음력';
}

function sexLabel(item: TargetPersonV1): string {
  const sex = item.currentRevision.input.sex;
  if (sex === 'male') return '남성';
  if (sex === 'female') return '여성';
  if (sex === 'unspecified') return '성별 미지정';
  return '성별 정보 없음';
}

function timeLabel(item: TargetPersonV1): string {
  const input = item.currentRevision.input;
  if (!input.timeKnown || input.birthTime === null) return '시간 모름';
  return input.birthTime.slice(0, 5);
}

export function MyTargetPersonsSection({
  items,
}: {
  items: readonly TargetPersonV1[];
}) {
  return (
    <View style={styles.section}>
      <View style={styles.intro}>
        <Text style={styles.kicker}>PEOPLE</Text>
        <Text style={styles.title}>등록된 대상</Text>
        <Text style={styles.description}>
          현재 계정에 등록된 대상의 출생정보를 확인합니다.
        </Text>
      </View>

      {items.map((item) => (
        <View key={item.targetPersonId} style={styles.card}>
          <View style={styles.heading}>
            <Text style={styles.name}>
              {item.displayLabel?.trim() || '이름 없는 대상'}
            </Text>
            {item.relationshipLabel?.trim() ? (
              <Text style={styles.relationship}>{item.relationshipLabel}</Text>
            ) : null}
          </View>
          <View style={styles.factRow}>
            <Text style={styles.factLabel}>생년월일</Text>
            <Text style={styles.factValue}>{item.currentRevision.input.birthDate}</Text>
          </View>
          <View style={styles.factRow}>
            <Text style={styles.factLabel}>태어난 시간</Text>
            <Text style={styles.factValue}>{timeLabel(item)}</Text>
          </View>
          <View style={styles.factRow}>
            <Text style={styles.factLabel}>기준</Text>
            <Text style={styles.factValue}>
              {calendarLabel(item)} · {sexLabel(item)}
            </Text>
          </View>
          <Text style={styles.revision}>
            출생정보 revision {item.currentRevision.revisionNo}
          </Text>
        </View>
      ))}

      <Text style={styles.caption}>
        신규 추가만 지원합니다. 수정·삭제·궁합 실행은 아직 지원하지 않습니다.
      </Text>
    </View>
  );
}

export function MyTargetPersonsEmpty() {
  return (
    <View style={styles.section}>
      <View style={styles.intro}>
        <Text style={styles.kicker}>PEOPLE</Text>
        <Text style={styles.title}>등록된 대상</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.description}>현재 등록된 대상이 없습니다.</Text>
      </View>
    </View>
  );
}

export function MyTargetPersonCreateCard({
  submitting,
  errorMessage,
  onCreate,
}: {
  readonly submitting: boolean;
  readonly errorMessage: string | null;
  readonly onCreate: (request: TargetPersonCreateRequestV1) => Promise<boolean>;
}) {
  const [displayLabel, setDisplayLabel] = useState('');
  const [relationshipLabel, setRelationshipLabel] = useState('');
  const [calendarType, setCalendarType] = useState<BirthCalendarTypeV1>('solar');
  const [year, setYear] = useState('');
  const [month, setMonth] = useState('');
  const [day, setDay] = useState('');
  const [birthTime, setBirthTime] = useState('');
  const [timeKnown, setTimeKnown] = useState(false);
  const [isLeapMonth, setIsLeapMonth] = useState(false);
  const [sex, setSex] = useState<BirthSexV1>('unspecified');
  const [localError, setLocalError] = useState('');

  const chooseCalendar = (value: BirthCalendarTypeV1) => {
    setCalendarType(value);
    if (value === 'solar') setIsLeapMonth(false);
  };

  const submit = async () => {
    setLocalError('');
    let request: TargetPersonCreateRequestV1;
    try {
      request = buildMobileTargetPersonCreateRequestV1({
        displayLabel,
        relationshipLabel,
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
      setLocalError(
        cause instanceof MobileBirthInputValidationErrorV1
          ? cause.message
          : '입력값을 확인해 주세요.',
      );
      return;
    }

    if (!(await onCreate(request))) return;
    setDisplayLabel('');
    setRelationshipLabel('');
    setYear('');
    setMonth('');
    setDay('');
    setBirthTime('');
    setTimeKnown(false);
    setIsLeapMonth(false);
    setSex('unspecified');
    setCalendarType('solar');
  };

  return (
    <View style={styles.createCard}>
      <View style={styles.intro}>
        <Text style={styles.kicker}>ADD PERSON</Text>
        <Text style={styles.title}>새 대상 추가</Text>
        <Text style={styles.description}>
          궁합 등에 사용할 상대의 기본 정보와 출생정보를 등록합니다.
        </Text>
      </View>

      <TextInput
        accessibilityLabel="대상 이름"
        value={displayLabel}
        onChangeText={setDisplayLabel}
        placeholder="이름 또는 별칭"
        placeholderTextColor={mobileColors.muted}
        style={styles.input}
      />
      <TextInput
        accessibilityLabel="관계"
        value={relationshipLabel}
        onChangeText={setRelationshipLabel}
        placeholder="관계 (예: 친구)"
        placeholderTextColor={mobileColors.muted}
        style={styles.input}
      />

      <View style={styles.segmentRow}>
        {(['solar', 'lunar'] as const).map((value) => (
          <Pressable
            key={value}
            accessibilityRole="button"
            accessibilityState={{ selected: calendarType === value }}
            onPress={() => chooseCalendar(value)}
            style={[styles.segment, calendarType === value && styles.segmentSelected]}
          >
            <Text style={[
              styles.segmentText,
              calendarType === value && styles.segmentTextSelected,
            ]}>
              {value === 'solar' ? '양력' : '음력'}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.dateRow}>
        <TextInput
          accessibilityLabel="대상 출생 연도"
          value={year}
          onChangeText={(value) => setYear(value.replace(/\D/gu, '').slice(0, 4))}
          keyboardType="number-pad"
          maxLength={4}
          placeholder="1995"
          placeholderTextColor={mobileColors.muted}
          style={[styles.input, styles.yearInput]}
        />
        <TextInput
          accessibilityLabel="대상 출생 월"
          value={month}
          onChangeText={(value) => setMonth(value.replace(/\D/gu, '').slice(0, 2))}
          keyboardType="number-pad"
          maxLength={2}
          placeholder="08"
          placeholderTextColor={mobileColors.muted}
          style={[styles.input, styles.shortInput]}
        />
        <TextInput
          accessibilityLabel="대상 출생 일"
          value={day}
          onChangeText={(value) => setDay(value.replace(/\D/gu, '').slice(0, 2))}
          keyboardType="number-pad"
          maxLength={2}
          placeholder="17"
          placeholderTextColor={mobileColors.muted}
          style={[styles.input, styles.shortInput]}
        />
      </View>

      <View style={styles.rowBetween}>
        <Text style={styles.factLabel}>출생시간</Text>
        <View style={styles.inlineSwitch}>
          <Text style={styles.caption}>시간 모름</Text>
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
        accessibilityLabel="대상 출생시간"
        editable={timeKnown}
        value={birthTime}
        onChangeText={setBirthTime}
        placeholder={timeKnown ? '14:30' : '시간 모름'}
        placeholderTextColor={mobileColors.muted}
        style={[styles.input, !timeKnown && styles.inputDisabled]}
      />

      {calendarType === 'lunar' ? (
        <View style={styles.rowBetween}>
          <Text style={styles.factLabel}>윤달</Text>
          <Switch value={isLeapMonth} onValueChange={setIsLeapMonth} />
        </View>
      ) : null}

      <View style={styles.segmentRow}>
        {sexOptions.map((option) => (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected: sex === option.value }}
            onPress={() => setSex(option.value)}
            style={[styles.segment, sex === option.value && styles.segmentSelected]}
          >
            <Text style={[
              styles.segmentText,
              sex === option.value && styles.segmentTextSelected,
            ]}>
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {localError ? <Text style={styles.error}>{localError}</Text> : null}
      {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

      <Pressable
        accessibilityRole="button"
        disabled={submitting}
        onPress={() => void submit()}
        style={[styles.primaryButton, submitting && styles.primaryButtonDisabled]}
      >
        {submitting ? (
          <ActivityIndicator color={mobileColors.surface} />
        ) : (
          <Text style={styles.primaryButtonText}>대상 추가</Text>
        )}
      </Pressable>

      <Text style={styles.caption}>
        생성 후 라벨 수정·삭제·출생정보 수정·궁합 실행은 아직 열지 않습니다.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 12 },
  intro: { gap: 5 },
  kicker: {
    color: mobileColors.gold,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  title: { color: mobileColors.ink, fontSize: 20, fontWeight: '800' },
  description: { color: mobileColors.muted, fontSize: 14, lineHeight: 20 },
  card: {
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: 18,
    backgroundColor: mobileColors.surface,
    padding: 18,
    gap: 9,
  },
  createCard: {
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: 18,
    backgroundColor: mobileColors.surface,
    padding: 18,
    gap: 12,
  },
  heading: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
  },
  name: { flex: 1, color: mobileColors.ink, fontSize: 17, fontWeight: '800' },
  relationship: { color: mobileColors.navy, fontSize: 12, fontWeight: '700' },
  factRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
  },
  factLabel: { color: mobileColors.muted, fontSize: 13 },
  factValue: { color: mobileColors.ink, fontSize: 14, fontWeight: '700' },
  revision: { color: mobileColors.muted, fontSize: 11 },
  caption: { color: mobileColors.muted, fontSize: 11, lineHeight: 17 },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: 12,
    backgroundColor: mobileColors.canvas,
    color: mobileColors.ink,
    paddingHorizontal: 13,
    fontSize: 15,
  },
  inputDisabled: { opacity: 0.55 },
  segmentRow: { flexDirection: 'row', gap: 8 },
  segment: {
    flex: 1,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: 10,
  },
  segmentSelected: {
    backgroundColor: mobileColors.navy,
    borderColor: mobileColors.navy,
  },
  segmentText: { color: mobileColors.muted, fontSize: 13, fontWeight: '700' },
  segmentTextSelected: { color: mobileColors.surface },
  dateRow: { flexDirection: 'row', gap: 8 },
  yearInput: { flex: 2 },
  shortInput: { flex: 1 },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  inlineSwitch: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  error: { color: mobileColors.seal, fontSize: 13, lineHeight: 19 },
  primaryButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: mobileColors.navy,
  },
  primaryButtonDisabled: { opacity: 0.65 },
  primaryButtonText: {
    color: mobileColors.surface,
    fontSize: 15,
    fontWeight: '800',
  },
});
