import { MobileBirthInputValidationErrorV1 } from './birth-input.js';

export type MobileBirthMeridiemV1 = 'am' | 'pm';

export interface MobileBirthClockDraftV1 {
  readonly meridiem: MobileBirthMeridiemV1;
  readonly hour12: string;
  readonly minute: string;
}

/**
 * Display: 오전/오후 1~12시, 00~59분.
 * API: unchanged, canonical 24-hour HH:mm.
 */
export function formatMobileBirthClock24HourV1(draft: MobileBirthClockDraftV1): string {
  if (draft.meridiem !== 'am' && draft.meridiem !== 'pm') {
    throw new MobileBirthInputValidationErrorV1('오전 또는 오후를 선택해 주세요.');
  }
  if (!/^(?:[1-9]|1[0-2])$/u.test(draft.hour12)) {
    throw new MobileBirthInputValidationErrorV1('출생시간의 시를 선택해 주세요.');
  }
  if (!/^\d{1,2}$/u.test(draft.minute) || Number(draft.minute) > 59) {
    throw new MobileBirthInputValidationErrorV1('출생시간의 분은 00부터 59까지 입력해 주세요.');
  }

  const hour = Number(draft.hour12) % 12 + (draft.meridiem === 'pm' ? 12 : 0);
  return String(hour).padStart(2, '0') + ':' + draft.minute.padStart(2, '0');
}