import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import { formatMobileBirthClock24HourV1 } from '../apps/mobile/src/features/birth/birth-clock-12hour.js';
import { buildMobileBirthProfileCreateRequestV1 } from '../apps/mobile/src/features/birth/birth-input.js';

async function source(path: string) {
  return readFile(new URL('../' + path, import.meta.url), 'utf8');
}

describe('mobile Birth calendar and 12-hour clock', () => {
  it('correctly maps midnight, noon and all meridiem boundaries', () => {
    expect(formatMobileBirthClock24HourV1({ meridiem: 'am', hour12: '12', minute: '00' })).toBe('00:00');
    expect(formatMobileBirthClock24HourV1({ meridiem: 'pm', hour12: '12', minute: '00' })).toBe('12:00');
    expect(formatMobileBirthClock24HourV1({ meridiem: 'am', hour12: '1', minute: '30' })).toBe('01:30');
    expect(formatMobileBirthClock24HourV1({ meridiem: 'pm', hour12: '1', minute: '30' })).toBe('13:30');
    expect(formatMobileBirthClock24HourV1({ meridiem: 'pm', hour12: '7', minute: '30' })).toBe('19:30');
    expect(formatMobileBirthClock24HourV1({ meridiem: 'pm', hour12: '11', minute: '59' })).toBe('23:59');
  });

  it('rejects missing or malformed times, including out-of-range minutes', () => {
    for (const hour12 of ['', '0', '13', '19', '00', '01', 'abc']) {
      expect(() => formatMobileBirthClock24HourV1({
        meridiem: 'am', hour12, minute: '30',
      })).toThrow('출생시간의 시를 선택해 주세요.');
    }
    for (const minute of ['', '-1', '60', '99', '000', 'xx']) {
      expect(() => formatMobileBirthClock24HourV1({
        meridiem: 'pm', hour12: '7', minute,
      })).toThrow('출생시간의 분은 00부터 59까지 입력해 주세요.');
    }
    expect(() => formatMobileBirthClock24HourV1({
      meridiem: 'AM' as 'am', hour12: '7', minute: '30',
    })).toThrow('오전 또는 오후를 선택해 주세요.');
  });

  it('preserves the existing server contract for selected date and 12-hour input', () => {
    const birthTime = formatMobileBirthClock24HourV1({ meridiem: 'pm', hour12: '7', minute: '30' });
    expect(buildMobileBirthProfileCreateRequestV1({
      calendarType: 'solar', year: '1996', month: '1', day: '9', birthTime,
      timeKnown: true, isLeapMonth: false, sex: 'unspecified',
    })).toMatchObject({
      input: { calendarType: 'solar', birthDate: '1996-01-09', birthTime: '19:30', timeKnown: true },
    });
    expect(buildMobileBirthProfileCreateRequestV1({
      calendarType: 'lunar', year: '2000', month: '2', day: '30', birthTime: '',
      timeKnown: false, isLeapMonth: true, sex: 'unspecified',
    })).toMatchObject({
      input: { calendarType: 'lunar', birthDate: '2000-02-30', birthTime: null, isLeapMonth: true },
    });
  });

  it('uses a touch calendar, years/month/day selector and lunar-safe days', async () => {
    const screen = await source('apps/mobile/src/app/birth/index.tsx');
    const calendar = await source('apps/mobile/src/features/birth/BirthDateCalendar.tsx');
    expect(screen).toContain('<BirthDateCalendar');
    expect(screen).toContain('달력에서 날짜 선택');
    expect(screen).not.toContain('accessibilityLabel="출생 연도"');
    expect(screen).not.toContain('accessibilityLabel="출생 월"');
    expect(screen).not.toContain('accessibilityLabel="출생 일"');
    expect(calendar).toContain("type PickerStep = 'year' | 'month' | 'day'");
    expect(calendar).toContain("calendarType === 'lunar' ? 30");
    expect(calendar).toContain('new Date(Date.UTC(year, month, 0)).getUTCDate()');
    expect(calendar).toContain('setDecade((prev) => prev - 10)');
    expect(calendar).toContain('onSelect({');
    expect(calendar).toContain('onRequestClose={onClose}');
  });

  it('uses AM/PM and numeric hours with disabled unknown-time behavior', async () => {
    const screen = await source('apps/mobile/src/app/birth/index.tsx');
    const picker = await source('apps/mobile/src/features/birth/BirthTime12HourField.tsx');
    expect(screen).toContain('<BirthTime12HourField');
    expect(screen).toContain('formatMobileBirthClock24HourV1({ meridiem, hour12, minute })');
    expect(screen).toContain('disabled={!timeKnown}');
    expect(screen).toContain("if (unknown) {");
    expect(picker).toContain("(['am', 'pm'] as const)");
    expect(picker).toContain("Array.from({ length: 12 }");
    expect(picker).toContain('maxLength={2}');
    expect(picker).toContain('onHourChange(hour)');
    expect(picker).not.toContain('19:30');
    expect(picker).toContain('MobileUiLocale');
    expect(picker).toContain("locale === 'en-US'");
    expect(picker).toContain("locale === 'zh-CN'");
  });
});
