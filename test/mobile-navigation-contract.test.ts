import { describe, expect, it } from 'vitest';

import {
  MOBILE_PRIMARY_TABS,
  MOBILE_READING_DEFAULT_SUBTAB,
  MOBILE_READING_SUBTABS,
  MOBILE_READING_SUBTAB_ROUTES,
  primaryTabReselectTarget,
  resolveMobilePrimaryTab,
  resolveMobileReadingSubtab,
} from '../apps/mobile/src/navigation/mobile-navigation-contract.js';

describe('mobile navigation contract', () => {
  it('keeps exactly five primary tabs in product order', () => {
    expect(MOBILE_PRIMARY_TABS).toEqual([
      'home',
      'reading',
      'chat',
      'records',
      'my',
    ]);
    expect(MOBILE_PRIMARY_TABS).not.toContain('face');
  });

  it('keeps Saju as the default Reading subtab', () => {
    expect(MOBILE_READING_SUBTABS).toEqual(['saju', 'face']);
    expect(MOBILE_READING_DEFAULT_SUBTAB).toBe('saju');
    expect(MOBILE_READING_SUBTAB_ROUTES.saju).toBe('/reading');
  });

  it('keeps Face Reading nested under the Saju primary tab', () => {
    expect(resolveMobilePrimaryTab('/reading/face')).toBe('reading');
    expect(resolveMobilePrimaryTab('/reading/face/result/123')).toBe('reading');
    expect(resolveMobileReadingSubtab('/reading/face')).toBe('face');
  });

  it('resolves non-face Reading paths to the Saju default', () => {
    expect(resolveMobileReadingSubtab('/reading')).toBe('saju');
    expect(resolveMobileReadingSubtab('/reading/abc')).toBe('saju');
  });

  it('resets a reselected Saju primary tab to the Saju root', () => {
    expect(primaryTabReselectTarget('reading')).toBe('/reading');
  });
});
