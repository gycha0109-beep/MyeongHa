import type { BirthInputV1 } from '@myeongha/api-client';
import type { MobileUiLocale } from '../../ui/mobile-ui-copy.js';

// Presentation-only values from a server-owned Birth Profile input.
// In particular, a lunar date is never converted using Gregorian Date.
type FieldV1 = 'date' | 'time' | 'sex' | 'place' | 'basis';
type LabelsV1 = Readonly<Record<MobileUiLocale, string>>;
const LABELS: Readonly<Record<'heading' | FieldV1, LabelsV1>> = Object.freeze({
  heading: { 'ko-KR': '입력 정보', 'ja-JP': '入力情報', 'zh-TW': '輸入資料', 'en-US': 'Entered information', 'zh-CN': '输入的信息' },
  date: { 'ko-KR': '생년월일', 'ja-JP': '生年月日', 'zh-TW': '出生日期', 'en-US': 'Date of birth', 'zh-CN': '出生日期' },
  time: { 'ko-KR': '출생 시간', 'ja-JP': '出生時刻', 'zh-TW': '出生時間', 'en-US': 'Birth time', 'zh-CN': '出生时间' },
  sex: { 'ko-KR': '성별', 'ja-JP': '性別', 'zh-TW': '性別', 'en-US': 'Gender', 'zh-CN': '性别' },
  place: { 'ko-KR': '출생지', 'ja-JP': '出生地', 'zh-TW': '出生地', 'en-US': 'Place of birth', 'zh-CN': '出生地' },
  basis: { 'ko-KR': '계산 기준', 'ja-JP': '計算基準', 'zh-TW': '計算基準', 'en-US': 'Calculation basis', 'zh-CN': '计算依据' },
});
const UNKNOWN: LabelsV1 = Object.freeze({ 'ko-KR': '확인 불가', 'ja-JP': '確認できません', 'zh-TW': '無法確認', 'en-US': 'Cannot verify', 'zh-CN': '无法确认' });
const UNAVAILABLE: LabelsV1 = Object.freeze({ 'ko-KR': '제공되지 않음', 'ja-JP': '入力項目なし', 'zh-TW': '未提供', 'en-US': 'Not provided', 'zh-CN': '未提供' });
const UNKNOWN_TIME: LabelsV1 = Object.freeze({ 'ko-KR': '시간 모름', 'ja-JP': '時刻不明', 'zh-TW': '時間不詳', 'en-US': 'Unknown time', 'zh-CN': '时间不详' });
const UNSPECIFIED: LabelsV1 = Object.freeze({ 'ko-KR': '미입력', 'ja-JP': '未指定', 'zh-TW': '未指定', 'en-US': 'Not specified', 'zh-CN': '未指定' });
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'] as const;
const CALENDAR = Object.freeze({
  solar: { 'ko-KR': '양력', 'ja-JP': '新暦', 'zh-TW': '國曆', 'en-US': 'Solar', 'zh-CN': '公历' },
  lunar: { 'ko-KR': '음력', 'ja-JP': '旧暦', 'zh-TW': '農曆', 'en-US': 'Lunar', 'zh-CN': '农历' },
} satisfies Record<'solar' | 'lunar', LabelsV1>);
const LEAP: LabelsV1 = Object.freeze({ 'ko-KR': '윤달', 'ja-JP': '閏月', 'zh-TW': '閏月', 'en-US': 'Leap month', 'zh-CN': '闰月' });
const SERVER_CALCULATED: LabelsV1 = Object.freeze({ 'ko-KR': '서버 계산 기준', 'ja-JP': 'サーバー計算基準', 'zh-TW': '伺服器計算基準', 'en-US': 'Server-calculated', 'zh-CN': '服务器计算基准' });
const SEX = Object.freeze({
  male: { 'ko-KR': '남성', 'ja-JP': '男性', 'zh-TW': '男性', 'en-US': 'Male', 'zh-CN': '男性' },
  female: { 'ko-KR': '여성', 'ja-JP': '女性', 'zh-TW': '女性', 'en-US': 'Female', 'zh-CN': '女性' },
} satisfies Record<'male' | 'female', LabelsV1>);

export const MOBILE_SAJU_BIRTH_FIELDS_V1: readonly FieldV1[] = Object.freeze(['date', 'time', 'sex', 'place', 'basis']);

export function mobileSajuBirthLabelV1(key: 'heading' | FieldV1, locale: MobileUiLocale): string {
  return LABELS[key][locale];
}

export function projectMobileSajuBirthFactsV1(
  input: BirthInputV1,
  locale: MobileUiLocale,
): Readonly<Record<FieldV1, string>> {
  const birthDate = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(input.birthDate);
  const parsed = birthDate?.slice(1).map(Number);
  const [year, month, day] = parsed ?? [0, 0, 0];
  const validDate = year > 0 && month >= 1 && month <= 12 && day >= 1 && day <= 31;
  const date = !validDate ? UNKNOWN[locale]
    : locale === 'ko-KR' ? `${year}년 ${month}월 ${day}일`
    : locale === 'en-US' ? `${MONTHS[month - 1]} ${day}, ${year}`
    : `${year}年${month}月${day}日`;
  const sourceTime = input.timeKnown
    ? /^(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/u.exec(input.birthTime ?? '')
    : null;
  const hour = Number(sourceTime?.[1]);
  const minute = Number(sourceTime?.[2]);
  const validTime = sourceTime !== null && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
  const time = !input.timeKnown ? UNKNOWN_TIME[locale]
    : !validTime ? UNKNOWN[locale]
    : locale === 'ko-KR'
      ? `${hour < 12 ? '오전' : '오후'} ${hour % 12 || 12}시 ${String(minute).padStart(2, '0')}분`
    : locale === 'en-US'
      ? `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`
    : locale === 'zh-CN'
      ? `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
    : `${hour}:${String(minute).padStart(2, '0')}`;
  const calendar = CALENDAR[input.calendarType][locale];
  const calendarWithLeap = input.calendarType === 'lunar' && input.isLeapMonth
    ? `${calendar} · ${LEAP[locale]}` : calendar;
  const sex = input.sex === 'male' || input.sex === 'female'
    ? SEX[input.sex][locale] : UNSPECIFIED[locale];

  return Object.freeze({
    date,
    time,
    sex,
    // BirthInputV1 has no birth-place field. Do not infer a location.
    place: UNAVAILABLE[locale],
    basis: `${calendarWithLeap} · ${SERVER_CALCULATED[locale]}`,
  });
}
