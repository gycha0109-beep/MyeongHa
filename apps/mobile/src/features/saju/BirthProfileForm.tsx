import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import type {
  BirthCalendarTypeV1,
  BirthProfileCreateRequestV1,
  BirthSexV1,
} from '@myeongha/api-client';

import { mobileColors } from '@/ui/mobile-colors';

type BirthSexChoice = 'unset' | Exclude<BirthSexV1, null>;

function validBirthDate(value: string, calendarType: BirthCalendarTypeV1): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (match === null) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || year < 1 || month < 1 || month > 12) return false;
  if (calendarType === 'lunar') return day >= 1 && day <= 30;
  if (day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function validBirthTime(value: string): boolean {
  const match = /^(\d{2}):(\d{2})$/u.exec(value);
  if (match === null) return false;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

export function BirthProfileForm(props: {
  readonly busy: boolean;
  readonly onSubmit: (request: BirthProfileCreateRequestV1) => Promise<void>;
}) {
  const [calendarType, setCalendarType] = useState<BirthCalendarTypeV1>('solar');
  const [birthDate, setBirthDate] = useState('');
  const [birthTime, setBirthTime] = useState('');
  const [timeUnknown, setTimeUnknown] = useState(false);
  const [isLeapMonth, setIsLeapMonth] = useState(false);
  const [sexChoice, setSexChoice] = useState<BirthSexChoice>('unset');
  const [validation, setValidation] = useState<string | null>(null);

  async function submit() {
    setValidation(null);
    if (!validBirthDate(birthDate, calendarType)) {
      setValidation('생년월일을 YYYY-MM-DD 형식으로 확인해 주세요.');
      return;
    }
    if (!timeUnknown && !validBirthTime(birthTime)) {
      setValidation('출생시간을 HH:MM 형식으로 입력하거나 시간 모름을 선택해 주세요.');
      return;
    }

    await props.onSubmit(Object.freeze({
      label: null,
      input: Object.freeze({
        calendarType,
        birthDate,
        birthTime: timeUnknown ? null : birthTime,
        timeKnown: !timeUnknown,
        isLeapMonth: calendarType === 'lunar' ? isLeapMonth : false,
        sex: sexChoice === 'unset' ? null : sexChoice,
      }),
    }));
  }

  return (
    <View style={styles.card}>
      <View style={styles.heading}>
        <Text style={styles.title}>내 사주 정보</Text>
        <Text style={styles.copy}>
          태어난 정보를 등록하면 현재 세션의 자기 명식을 서버에서 계산합니다.
        </Text>
      </View>

      <Text style={styles.label}>달력 기준</Text>
      <View style={styles.segmentRow}>
        {(['solar', 'lunar'] as const).map((value) => {
          const selected = calendarType === value;
          return (
            <Pressable
              key={value}
              onPress={() => {
                setCalendarType(value);
                if (value === 'solar') setIsLeapMonth(false);
              }}
              style={[styles.segment, selected && styles.segmentSelected]}
              accessibilityRole="button"
              accessibilityState={{ selected }}
            >
              <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>
                {value === 'solar' ? '양력' : '음력'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.label}>생년월일</Text>
      <TextInput
        value={birthDate}
        onChangeText={setBirthDate}
        placeholder="1990-01-31"
        keyboardType="numbers-and-punctuation"
        autoComplete="birthdate-full"
        style={styles.input}
        editable={!props.busy}
      />

      <View style={styles.switchRow}>
        <View style={styles.switchCopy}>
          <Text style={styles.label}>출생시간 모름</Text>
          <Text style={styles.help}>모르는 경우 시주 등 일부 계산이 제한될 수 있습니다.</Text>
        </View>
        <Switch
          value={timeUnknown}
          onValueChange={setTimeUnknown}
          disabled={props.busy}
        />
      </View>

      {!timeUnknown ? (
        <>
          <Text style={styles.label}>출생시간</Text>
          <TextInput
            value={birthTime}
            onChangeText={setBirthTime}
            placeholder="14:30"
            keyboardType="numbers-and-punctuation"
            style={styles.input}
            editable={!props.busy}
          />
        </>
      ) : null}

      {calendarType === 'lunar' ? (
        <View style={styles.switchRow}>
          <Text style={styles.label}>윤달</Text>
          <Switch
            value={isLeapMonth}
            onValueChange={setIsLeapMonth}
            disabled={props.busy}
          />
        </View>
      ) : null}

      <Text style={styles.label}>성별 입력 · 선택</Text>
      <View style={styles.segmentRow}>
        {([
          ['unset', '선택 안 함'],
          ['male', '남성'],
          ['female', '여성'],
        ] as const).map(([value, label]) => {
          const selected = sexChoice === value;
          return (
            <Pressable
              key={value}
              onPress={() => setSexChoice(value)}
              style={[styles.segment, selected && styles.segmentSelected]}
              accessibilityRole="button"
              accessibilityState={{ selected }}
            >
              <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {validation ? <Text style={styles.error}>{validation}</Text> : null}

      <Pressable
        disabled={props.busy}
        onPress={() => void submit()}
        style={[styles.submit, props.busy && styles.disabled]}
      >
        <Text style={styles.submitText}>
          {props.busy ? '명식을 계산하는 중…' : '내 사주 만들기'}
        </Text>
      </Pressable>

      <Text style={styles.help}>
        게스트로 먼저 사용할 수 있으며, authoritative Birth/사주 상태는 서버에 보관됩니다.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: 18,
    backgroundColor: mobileColors.surface,
    padding: 20,
    gap: 12,
  },
  heading: { gap: 6, marginBottom: 4 },
  title: { color: mobileColors.ink, fontSize: 21, fontWeight: '700' },
  copy: { color: mobileColors.muted, fontSize: 14, lineHeight: 21 },
  label: { color: mobileColors.ink, fontSize: 14, fontWeight: '700' },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    color: mobileColors.ink,
    backgroundColor: '#FFFDF8',
    fontSize: 16,
  },
  segmentRow: { flexDirection: 'row', gap: 8 },
  segment: {
    flex: 1,
    minHeight: 42,
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  segmentSelected: { backgroundColor: mobileColors.navy, borderColor: mobileColors.navy },
  segmentText: { color: mobileColors.muted, fontWeight: '700', fontSize: 13 },
  segmentTextSelected: { color: mobileColors.surface },
  switchRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  switchCopy: { flex: 1, gap: 3 },
  help: { color: mobileColors.muted, fontSize: 12, lineHeight: 18 },
  error: { color: mobileColors.seal, fontSize: 13, lineHeight: 19 },
  submit: {
    minHeight: 52,
    borderRadius: 13,
    backgroundColor: mobileColors.navy,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  disabled: { opacity: 0.55 },
  submitText: { color: mobileColors.surface, fontSize: 16, fontWeight: '700' },
});
