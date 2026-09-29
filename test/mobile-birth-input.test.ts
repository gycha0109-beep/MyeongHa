import { describe, expect, it } from 'vitest';

import {
  MobileBirthInputValidationErrorV1,
  buildMobileBirthProfileCreateRequestV1,
} from '../apps/mobile/src/features/birth/birth-input.js';

describe('mobile Birth input contract', () => {
  it('builds the canonical solar Birth create payload', () => {
    expect(
      buildMobileBirthProfileCreateRequestV1({
        calendarType: 'solar',
        year: '1995',
        month: '8',
        day: '17',
        birthTime: '7:05',
        timeKnown: true,
        isLeapMonth: true,
        sex: 'male',
      }),
    ).toEqual({
      label: null,
      input: {
        calendarType: 'solar',
        birthDate: '1995-08-17',
        birthTime: '07:05',
        timeKnown: true,
        isLeapMonth: false,
        sex: 'male',
      },
    });
  });

  it('preserves lunar leap-month input and unknown birth time', () => {
    expect(
      buildMobileBirthProfileCreateRequestV1({
        calendarType: 'lunar',
        year: '2000',
        month: '2',
        day: '30',
        birthTime: '',
        timeKnown: false,
        isLeapMonth: true,
        sex: 'unspecified',
      }),
    ).toMatchObject({
      input: {
        birthDate: '2000-02-30',
        birthTime: null,
        timeKnown: false,
        isLeapMonth: true,
      },
    });
  });

  it('rejects impossible solar dates and malformed time', () => {
    expect(() =>
      buildMobileBirthProfileCreateRequestV1({
        calendarType: 'solar',
        year: '2026',
        month: '2',
        day: '31',
        birthTime: '12:00',
        timeKnown: true,
        isLeapMonth: false,
        sex: null,
      }),
    ).toThrow(MobileBirthInputValidationErrorV1);

    expect(() =>
      buildMobileBirthProfileCreateRequestV1({
        calendarType: 'solar',
        year: '2026',
        month: '2',
        day: '28',
        birthTime: '24:00',
        timeKnown: true,
        isLeapMonth: false,
        sex: null,
      }),
    ).toThrow('출생시간을 확인해 주세요.');
  });
});
