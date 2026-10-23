import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { PLANNED_MOBILE_STATIC_UI_COPY_V1 } from '../apps/mobile/src/ui/mobile-planned-ui-copy-v1.js';
import {
  REVIEWED_MOBILE_SCREEN_STATIC_UI_KEYS_V1,
  auditReviewedMobileScreenSourceV1,
  auditCurrentReviewedMobileScreensV1,
} from '../scripts/i18n/planned-ui-mobile-screen-review-v1.mjs';

describe('I18N-07 EN/CN curated mobile screen source review', () => {
  it('keeps six real mobile screens and both staged catalogues aligned without authorizing release', async () => {
    const report = await auditCurrentReviewedMobileScreensV1(
      fileURLToPath(new URL('../', import.meta.url)),
    );
    expect(report.screens).toHaveLength(6);
    expect(report.selectedLiteralsAligned).toBe(true);
    expect(REVIEWED_MOBILE_SCREEN_STATIC_UI_KEYS_V1.map(s => s.screen))
      .toEqual(['my','saju','face','records','chat','birth']);
    expect(REVIEWED_MOBILE_SCREEN_STATIC_UI_KEYS_V1.reduce((n,s) => n + s.keys.length, 0))
      .toBe(64);
    for (const screen of REVIEWED_MOBILE_SCREEN_STATIC_UI_KEYS_V1) {
      for (const key of screen.keys) {
        expect(PLANNED_MOBILE_STATIC_UI_COPY_V1.has(key), screen.screen + ':' + key).toBe(true);
      }
    }
    for (const screen of report.screens) {
      expect(screen.sourceMissingKeys).toEqual([]);
      expect(screen.unstagedKeys).toEqual([]);
      expect(screen.renderedStateReviewComplete).toBe(false);
      expect(screen.readyForRelease).toBe(false);
    }
    expect(report.privateDynamicDataInspected).toBe(false);
    expect(REVIEWED_MOBILE_SCREEN_STATIC_UI_KEYS_V1.find(s => s.screen === 'face')?.keys)
      .toContain('사진 준비');
    expect(REVIEWED_MOBILE_SCREEN_STATIC_UI_KEYS_V1.find(s => s.screen === 'chat')?.keys)
      .toContain('로그인 후 열기  →');
    expect(report.pageRouteClassificationComplete).toBe(false);
    expect(report.readyForRelease).toBe(false);
  });

  it('flags absent source/staging and duplicates rather than inferring rendered coverage', () => {
    const check = auditReviewedMobileScreenSourceV1(
      { screen: 'missing', keys: ['출생정보', '없던 문구'] }, '출생정보', ['출생정보'],
    );
    expect(check.sourceMissingKeys).toEqual(['없던 문구']);
    expect(check.unstagedKeys).toEqual(['없던 문구']);
    expect(check.readyForRelease).toBe(false);
    expect(() => auditReviewedMobileScreenSourceV1(
      { screen: 'duplicate', keys: ['출생정보', '출생정보'] }, '출생정보', ['출생정보'],
    )).toThrow(/Duplicate reviewed mobile key/);
  });
});
