import type {
  BirthCalendarTypeV1,
  BirthProfileCreateRequestV1,
  BirthSexV1,
} from '@myeongha/api-client';

export interface MobileBirthInputDraftV1 {
  readonly calendarType: BirthCalendarTypeV1;
  readonly year: string;
  readonly month: string;
  readonly day: string;
  readonly birthTime: string;
  readonly timeKnown: boolean;
  readonly isLeapMonth: boolean;
  readonly sex: BirthSexV1;
}

export class MobileBirthInputValidationErrorV1 extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MobileBirthInputValidationErrorV1';
  }
}

function fail(message: string): never {
  throw new MobileBirthInputValidationErrorV1(message);
}

function digits(value: string): string {
  return value.replace(/\D/gu, '');
}

function parseDatePart(name: string, raw: string, minimum: number, maximum: number): number {
  const normalized = digits(raw);
  if (normalized.length === 0) return fail(`${name}을 입력해 주세요.`);
  const value = Number(normalized);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    return fail(`${name}을 확인해 주세요.`);
  }
  return value;
}

function buildBirthDate(draft: MobileBirthInputDraftV1): string {
  const yearText = digits(draft.year);
  if (yearText.length !== 4) return fail('출생 연도는 네 자리로 입력해 주세요.');
  const year = Number(yearText);
  if (!Number.isInteger(year) || year < 1) return fail('출생 연도를 확인해 주세요.');

  const month = parseDatePart('출생 월', draft.month, 1, 12);
  const day = parseDatePart(
    '출생 일',
    draft.day,
    1,
    draft.calendarType === 'lunar' ? 30 : 31,
  );

  if (draft.calendarType === 'solar') {
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      return fail('존재하는 양력 생년월일을 입력해 주세요.');
    }
  }

  return `${yearText}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function normalizeBirthTime(draft: MobileBirthInputDraftV1): string | null {
  if (!draft.timeKnown) return null;
  const match = /^(\d{1,2}):(\d{2})$/u.exec(draft.birthTime.trim());
  if (match === null) return fail('출생시간은 HH:mm 형식으로 입력해 주세요.');

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return fail('출생시간을 확인해 주세요.');
  }

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function buildMobileBirthProfileCreateRequestV1(
  draft: MobileBirthInputDraftV1,
): BirthProfileCreateRequestV1 {
  if (draft.calendarType !== 'solar' && draft.calendarType !== 'lunar') {
    return fail('달력 유형을 확인해 주세요.');
  }

  return Object.freeze({
    label: null,
    input: Object.freeze({
      calendarType: draft.calendarType,
      birthDate: buildBirthDate(draft),
      birthTime: normalizeBirthTime(draft),
      timeKnown: draft.timeKnown,
      isLeapMonth: draft.calendarType === 'lunar' ? draft.isLeapMonth : false,
      sex: draft.sex,
    }),
  });
}
