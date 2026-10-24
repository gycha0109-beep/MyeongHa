import { describe, expect, it } from 'vitest';
import { isSajuAbuseAdmissionEnabledV1 } from '../apps/api/src/saju-abuse-admission-activation.js';

describe('server-owned Saju admission release switch', () => {
  it('keeps existing deployments off until explicitly activated', () => {
    expect(isSajuAbuseAdmissionEnabledV1({})).toBe(false);
    expect(isSajuAbuseAdmissionEnabledV1({ MYEONGHA_SAJU_ABUSE_ADMISSION_ENABLED: 'false' })).toBe(false);
  });
  it('activates only the exact server value and rejects invalid configuration', () => {
    expect(isSajuAbuseAdmissionEnabledV1({ MYEONGHA_SAJU_ABUSE_ADMISSION_ENABLED: 'true' })).toBe(true);
    for (const value of ['', '1', 'TRUE', 'yes']) expect(() => isSajuAbuseAdmissionEnabledV1({ MYEONGHA_SAJU_ABUSE_ADMISSION_ENABLED: value })).toThrow();
  });
});
