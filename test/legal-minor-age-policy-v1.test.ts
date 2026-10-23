import { describe, expect, it } from 'vitest';
import { LEGAL_MINOR_AGE_POLICY_V1, resolveSelfBirthAgeAdmissionV1 } from '../apps/api/src/legal-minor-age-policy-v1.js';

const time = '2026-10-23T06:00:00.000Z'; // 2026-10-23 15:00 KST
const classify = (birthDate: string, calendarType: 'solar' | 'lunar' = 'solar', serverTime = time) =>
  resolveSelfBirthAgeAdmissionV1({ birthDate, calendarType, serverTime });

describe('LEGAL L2: conservative age boundary using the server calendar day in Korea', () => {
  it('pins free age 14, direct-purchase age 19, no approved guardian verification', () => {
    expect(LEGAL_MINOR_AGE_POLICY_V1).toEqual({
      minimumFreeAge: 14,
      minimumDirectPurchaseAge: 19,
      guardianConsentVerificationAvailable: false,
      directMinorCheckoutAllowed: false,
    });
  });

  it('admits exactly 14 and 19 on their birthday, not the day before', () => {
    expect(classify('2012-10-23')).toBe('free_minor');
    expect(classify('2012-10-24')).toBe('under14_denied');
    expect(classify('2007-10-23')).toBe('adult');
    expect(classify('2007-10-24')).toBe('free_minor');
  });

  it('distinguishes a Korea midnight boundary rather than trusting the browser clock', () => {
    expect(classify('2012-10-24', 'solar', '2026-10-23T14:59:59.000Z')).toBe('under14_denied');
    expect(classify('2012-10-24', 'solar', '2026-10-23T15:00:00.000Z')).toBe('free_minor');
  });

  it('holds lunar birth in the precise 14-year boundary instead of assuming Gregorian equivalence', () => {
    expect(classify('2012-01-01', 'lunar')).toBe('age_boundary_unverified');
    expect(classify('2013-01-01', 'lunar')).toBe('under14_denied');
    expect(classify('2011-12-01', 'lunar')).toBe('free_minor');
  });

  it('fails on fabricated dates and future dates before any storage', () => {
    for (const birthDate of ['2012-02-30', '2012-13-01', '0000-01-01', '2027-01-01', 'tomorrow']) {
      expect(classify(birthDate)).toBe('invalid');
    }
    expect(resolveSelfBirthAgeAdmissionV1({ birthDate: '1999-01-01', calendarType: 'invalid', serverTime: time })).toBe('invalid');
    expect(resolveSelfBirthAgeAdmissionV1({ birthDate: '1999-01-01', calendarType: 'solar', serverTime: 'invalid' })).toBe('invalid');
  });
});
