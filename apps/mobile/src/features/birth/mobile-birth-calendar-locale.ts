import type { MobileUiLocale } from '../../ui/mobile-ui-copy.js';

/** Calendar chrome only: no date arithmetic or lunar conversion. */
export interface MobileBirthCalendarLocaleLabelsV1 {
  readonly yearUnit: string;
  readonly monthUnit: string;
  readonly dayUnit: string;
  readonly weekdays: readonly [string, string, string, string, string, string, string];
}

const BIRTH_CALENDAR_LOCALE_V1: Readonly<Record<MobileUiLocale, MobileBirthCalendarLocaleLabelsV1>> = Object.freeze({
  'ko-KR': Object.freeze({
    yearUnit: '년', monthUnit: '월', dayUnit: '일',
    weekdays: ['일', '월', '화', '수', '목', '금', '토'] as const,
  }),
  'ja-JP': Object.freeze({
    yearUnit: '年', monthUnit: '月', dayUnit: '日',
    weekdays: ['日', '月', '火', '水', '木', '金', '土'] as const,
  }),
  'zh-TW': Object.freeze({
    yearUnit: '年', monthUnit: '月', dayUnit: '日',
    weekdays: ['日', '一', '二', '三', '四', '五', '六'] as const,
  }),
  'en-US': Object.freeze({
    yearUnit: '', monthUnit: '', dayUnit: '',
    weekdays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const,
  }),
  'zh-CN': Object.freeze({
    yearUnit: '年', monthUnit: '月', dayUnit: '日',
    weekdays: ['日', '一', '二', '三', '四', '五', '六'] as const,
  }),
});

export function mobileBirthCalendarLocaleLabelsV1(locale: MobileUiLocale): MobileBirthCalendarLocaleLabelsV1 {
  return BIRTH_CALENDAR_LOCALE_V1[locale];
}
