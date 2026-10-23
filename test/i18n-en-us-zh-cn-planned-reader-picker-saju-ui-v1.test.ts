import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  PLANNED_READER_PICKER_LOCALES_V1,
  projectPlannedReaderPickerUiV1,
} from '../apps/mobile/src/features/reading/mobile-planned-reader-picker-ui-v1.js';
import {
  PLANNED_SAJU_PREVIEW_UI_LOCALES_V1,
  projectPlannedSajuPreviewUiV1,
  projectPlannedSajuPreviewNotDeliveredV1,
  projectPlannedSajuPreviewErrorV1,
} from '../apps/mobile/src/features/saju/mobile-planned-saju-preview-ui-v1.js';
import { projectMobileReaderPickerUiV1 } from '../apps/mobile/src/features/reading/mobile-reader-picker-ui-locale-v1.js';
import { normalizeMobileUiLocale } from '../apps/mobile/src/ui/mobile-ui-copy.js';
import {
  MOBILE_READER_INTERPRETATION_PUBLIC_V1,
  MOBILE_READER_PRESENTATIONS_V1,
  isMobileReaderPreviewSelectableV1,
} from '../apps/mobile/src/features/reading/mobile-reader-presentation.js';

const source = (path: string) => readFile(new URL('../' + path, import.meta.url), 'utf8');

describe('I18N-07 staged EN-US/ZH-CN Reader picker and Saju preview UI', () => {
  it('matches each existing Reader picker copy key without changing Character or source identity', async () => {
    expect(PLANNED_READER_PICKER_LOCALES_V1).toEqual(['en-US', 'zh-CN']);
    const ko = projectMobileReaderPickerUiV1('ko-KR');
    const expectedKeys = Object.keys(ko).filter(
      (key) => !['uiLocale', 'readerOutputLocalized', 'interpretationReleased'].includes(key),
    ).sort();
    for (const locale of PLANNED_READER_PICKER_LOCALES_V1) {
      const ui = projectPlannedReaderPickerUiV1(locale);
      if (ui === null) throw new Error('Missing staged Reader picker UI');
      const keys = Object.keys(ui).filter((key) => [
        ...expectedKeys,
      ].includes(key)).sort();
      expect(keys).toEqual(expectedKeys);
      for (const key of expectedKeys) {
        const text = ui[key as keyof typeof ui];
        expect(typeof text, key).toBe('string');
        if (typeof text !== 'string') throw new Error('Expected authored label');
        expect(text.length, key).toBeGreaterThan(0);
        expect(text, key).not.toMatch(/[가-힣]/u);
      }
      expect(ui.activeUiLocaleAdmitted).toBe(false);
      expect(ui.characterIdentityLocalized).toBe(false);
      expect(ui.sourceTextTranslated).toBe(false);
      expect(ui.previewSelectionExpanded).toBe(false);
      expect(ui.purchaseAccessGranted).toBe(false);
      expect(ui.readerOutputLocalized).toBe(false);
      expect(ui.interpretationReleased).toBe(false);
      expect(Object.isFrozen(ui)).toBe(true);
      expect(ui).not.toHaveProperty('characterId');
      expect(ui).not.toHaveProperty('grantId');
      expect(ui).not.toHaveProperty('readingId');
    }
    expect(MOBILE_READER_INTERPRETATION_PUBLIC_V1).toBe(false);
    expect(MOBILE_READER_PRESENTATIONS_V1).toHaveLength(9);
    for (const reader of MOBILE_READER_PRESENTATIONS_V1) {
      expect(isMobileReaderPreviewSelectableV1(reader.key)).toBe(reader.key === 'seyeon');
    }
  });

  it('authors every Saju preview UI state without passing through source interpretation text', () => {
    expect(PLANNED_SAJU_PREVIEW_UI_LOCALES_V1).toEqual(['en-US', 'zh-CN']);
    const reasons = [
      'partial_evidence', 'insufficient_evidence',
      'temporarily_unavailable', 'clarification_required',
    ];
    const errors = [
      'NOT_FOUND', 'SAJU_PREVIEW_READING_UNAVAILABLE',
      'API_SAJU_PREVIEW_RESPONSE_INVALID', 'NETWORK',
    ];
    for (const locale of PLANNED_SAJU_PREVIEW_UI_LOCALES_V1) {
      const ui = projectPlannedSajuPreviewUiV1(locale);
      if (ui === null) throw new Error('Missing staged Saju preview UI');
      for (const [key, text] of Object.entries(ui)) {
        if (typeof text !== 'string' || key === 'uiLocale') continue;
        expect(text.trim().length, key).toBeGreaterThan(0);
        expect(text, key).not.toMatch(/[가-힣]/u);
      }
      for (const state of reasons) {
        const text = projectPlannedSajuPreviewNotDeliveredV1(locale, state);
        expect(text).toBeTruthy();
        expect(text).not.toMatch(/[가-힣]/u);
      }
      expect(projectPlannedSajuPreviewNotDeliveredV1(locale, '__proto__'))
        .toBe(ui.other_not_delivered);
      expect(projectPlannedSajuPreviewNotDeliveredV1(locale, 'private server message'))
        .toBe(ui.other_not_delivered);
      for (const code of errors) {
        const text = projectPlannedSajuPreviewErrorV1(locale, code);
        expect(text).toBeTruthy();
        expect(text).not.toMatch(/[가-힣]/u);
      }
      expect(projectPlannedSajuPreviewErrorV1(locale, '__proto__'))
        .toBe(ui.error_generic);
      expect(projectPlannedSajuPreviewErrorV1(locale, 'user private payload'))
        .toBe(ui.error_generic);
      expect(ui.activeUiLocaleAdmitted).toBe(false);
      expect(ui.sourceInterpretationTranslated).toBe(false);
      expect(ui.readingLocaleAuthorized).toBe(false);
      expect(ui.originalPreviewResponseMutated).toBe(false);
      expect(ui.deliveryStatusOverridden).toBe(false);
      expect(ui).not.toHaveProperty('readingText');
      expect(ui).not.toHaveProperty('step.primary');
    }
  });

  it('keeps live KO/JA/ZH-TW UI and Reader/Saju admission unchanged', async () => {
    for (const locale of ['en-US', 'zh-CN']) {
      expect(normalizeMobileUiLocale(locale)).toBe(locale);
      expect(projectMobileReaderPickerUiV1(locale)).toEqual(projectMobileReaderPickerUiV1('ko-KR'));
    }
    for (const invalid of [null, undefined, 'zh', 'zh-Hans', 'en-GB', 'en', 'JA-JP']) {
      expect(projectPlannedReaderPickerUiV1(invalid)).toBeNull();
      expect(projectPlannedSajuPreviewUiV1(invalid)).toBeNull();
      expect(projectPlannedSajuPreviewNotDeliveredV1(invalid, 'partial_evidence')).toBeNull();
      expect(projectPlannedSajuPreviewErrorV1(invalid, 'NETWORK')).toBeNull();
    }
    const [picker, preview, plannedPicker, plannedSaju, api] = await Promise.all([
      source('apps/mobile/src/features/reading/MobileReaderPicker.tsx'),
      source('apps/mobile/src/features/saju/SajuPreviewReadingView.tsx'),
      source('apps/mobile/src/features/reading/mobile-planned-reader-picker-ui-v1.ts'),
      source('apps/mobile/src/features/saju/mobile-planned-saju-preview-ui-v1.ts'),
      source('apps/api/src/request-ui-locale-v1.ts'),
    ]);
    expect(picker).toContain('const ui = projectMobileReaderPickerUiV1(locale)');
    expect(picker).toContain('{reader.name}');
    expect(picker).toContain('{reader.title}');
    expect(picker).toContain('disabled={!available}');
    expect(preview).toContain('mobileSajuPreviewServiceV1.read(readingText)');
    expect(preview).toContain('>{step.primary}</Text>');
    expect(preview).toContain('{notice}');
    expect(preview).not.toContain('projectPlannedSajuPreviewUiV1');
    expect(picker).not.toContain('projectPlannedReaderPickerUiV1');
    expect(api).not.toContain("selected === 'zh-CN'");
    expect(api).not.toContain("selected === 'en-US'");
    expect(plannedPicker).not.toContain('fetch(');
    expect(plannedSaju).not.toContain('fetch(');
    expect(plannedPicker).not.toContain('responseVoiceLocale');
    expect(plannedSaju).not.toContain('responseVoiceLocale');
  });
});
