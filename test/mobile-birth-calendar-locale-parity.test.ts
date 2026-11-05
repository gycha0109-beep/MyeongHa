import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { mobileBirthCalendarLocaleLabelsV1 } from '../apps/mobile/src/features/birth/mobile-birth-calendar-locale.js';

describe('native Birth calendar five-language interface', () => {
  it('keeps original Korean and Japanese units while using localized weekday labels', () => {
    expect(mobileBirthCalendarLocaleLabelsV1('ko-KR')).toEqual({
      yearUnit: '년', monthUnit: '월', dayUnit: '일',
      weekdays: ['일', '월', '화', '수', '목', '금', '토'],
    });
    expect(mobileBirthCalendarLocaleLabelsV1('ja-JP')).toEqual({
      yearUnit: '年', monthUnit: '月', dayUnit: '日',
      weekdays: ['日', '月', '火', '水', '木', '金', '土'],
    });
  });

  it('uses correct Chinese units for both scripts, and English weekdays without CJK units', () => {
    const chineseWeekdays = ['日', '一', '二', '三', '四', '五', '六'];
    for (const locale of ['zh-TW', 'zh-CN'] as const) {
      expect(mobileBirthCalendarLocaleLabelsV1(locale)).toEqual({
        yearUnit: '年', monthUnit: '月', dayUnit: '日', weekdays: chineseWeekdays,
      });
    }
    expect(mobileBirthCalendarLocaleLabelsV1('en-US')).toEqual({
      yearUnit: '', monthUnit: '', dayUnit: '',
      weekdays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    });
  });

  it('applies locale units and accessible English dates without modifying Birth submission', async () => {
    const [calendar, screen] = await Promise.all([
      readFile(new URL('../apps/mobile/src/features/birth/BirthDateCalendar.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../apps/mobile/src/app/birth/index.tsx', import.meta.url), 'utf8'),
    ]);
    expect(calendar).toContain('mobileBirthCalendarLocaleLabelsV1(locale)');
    expect(calendar).toContain('weekdays: weekdayLabels');
    expect(calendar).toContain("locale === 'en-US' ? t('출생 일') : dayUnit");
    expect(calendar).toContain("locale === 'en-US' ? `${t('출생 연도')} ${choice}`");
    expect(calendar).toContain("locale === 'en-US' ? `${t('출생 월')} ${choice}`");
    expect(calendar).toContain("calendarType === 'lunar' ? 30");
    expect(calendar).toContain("new Date(Date.UTC(year, month, 0)).getUTCDate()");
    expect(screen).toContain('buildMobileBirthProfileCreateRequestV1({');
  });
});
