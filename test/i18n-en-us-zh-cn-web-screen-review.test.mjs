import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import {
  REVIEWED_WEB_SCREEN_STATIC_UI_KEYS_V1,
  auditReviewedWebScreenSourceV1,
  auditCurrentReviewedWebScreensV1,
} from '../scripts/i18n/planned-ui-web-screen-review-v1.mjs';

describe('I18N-07 English and Simplified Chinese web screen subset', () => {
  it('checks seven authored route modules against the staged fixed UI keys', async () => {
    const root = fileURLToPath(new URL('../', import.meta.url));
    const result = await auditCurrentReviewedWebScreensV1(root);
    expect(result.screens).toHaveLength(7);
    expect(result.selectedLiteralsAligned).toBe(true);
    expect(REVIEWED_WEB_SCREEN_STATIC_UI_KEYS_V1.reduce(
      (count, screen) => count + screen.keys.length, 0,
    )).toBe(101);
    expect(new Set(REVIEWED_WEB_SCREEN_STATIC_UI_KEYS_V1.map(x => x.path)).size).toBe(7);
    for (const screen of result.screens) {
      expect(screen.sourceMissingKeys).toEqual([]);
      expect(screen.unstagedKeys).toEqual([]);
      expect(screen.renderedStateReviewComplete).toBe(false);
      expect(screen.readyForRelease).toBe(false);
    }
    expect(REVIEWED_WEB_SCREEN_STATIC_UI_KEYS_V1.map(r => r.screen))
      .toEqual(['home','auth','chat-hub','chat','my','reading','records']);
    expect(result.pageRouteClassificationComplete).toBe(false);
    expect(result.privateDynamicDataInspected).toBe(false);
    expect(result.readyForRelease).toBe(false);
  });
  it('fails visibly on unstaged or absent strings and duplicate review keys', () => {
    const screen = { screen: 'example', keys: ['홈', '검토 누락'] };
    const result = auditReviewedWebScreenSourceV1(screen, '<p>홈</p>', ['홈']);
    expect(result.sourceMissingKeys).toEqual(['검토 누락']);
    expect(result.unstagedKeys).toEqual(['검토 누락']);
    expect(result.readyForRelease).toBe(false);
    expect(() => auditReviewedWebScreenSourceV1(
      { screen: 'duplicate', keys: ['홈','홈'] }, '홈', ['홈'],
    )).toThrow(/Duplicate reviewed key/);
  });
});
