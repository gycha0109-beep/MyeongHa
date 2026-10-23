import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import { projectMobileReaderPickerUiV1 } from '../apps/mobile/src/features/reading/mobile-reader-picker-ui-locale-v1.js';
import {
  MOBILE_READER_INTERPRETATION_PUBLIC_V1,
  MOBILE_READER_PRESENTATIONS_V1,
  isMobileReaderPreviewSelectableV1,
} from '../apps/mobile/src/features/reading/mobile-reader-presentation.js';

describe('I18N-07 mobile Saju/Face Reader picker UI locale only', () => {
  it('renders authored labels in KO/JA/zh-TW without authorizing Reader output', () => {
    for (const locale of ['ko-KR', 'ja-JP', 'zh-TW'] as const) {
      const ui = projectMobileReaderPickerUiV1(locale);
      expect(ui.uiLocale).toBe(locale);
      expect(Object.isFrozen(ui)).toBe(true);
      expect(ui.readerOutputLocalized).toBe(false);
      expect(ui.interpretationReleased).toBe(false);
      expect(ui.selectionLimit.length).toBeGreaterThan(20);
      expect(ui.authorityBoundary.length).toBeGreaterThan(25);
      expect(ui.saju.length).toBeGreaterThan(20);
      expect(ui.face.length).toBeGreaterThan(20);
      expect(ui).not.toHaveProperty('readerLocale');
      expect(ui).not.toHaveProperty('readingLocale');
      expect(ui).not.toHaveProperty('threadId');
    }
    expect(projectMobileReaderPickerUiV1('ja-JP').selectionLimit).toContain('セヨン');
    expect(projectMobileReaderPickerUiV1('zh-TW').selectionLimit).toContain('世妍');
    expect(projectMobileReaderPickerUiV1('ja-JP').sourceNotice).toContain('翻訳されません');
    expect(projectMobileReaderPickerUiV1('zh-TW').sourceNotice).toContain('保留原文');
    expect(projectMobileReaderPickerUiV1('ko-KR').sourceNotice).toBe('');
  });

  it('defaults to Korean without enabling unsupported language, and preserves the Seyeon-only preview filter', () => {
    const ko = projectMobileReaderPickerUiV1('ko-KR');
    for (const unsupported of ['ja', 'zh-CN', 'en-US', '', null, undefined]) {
      expect(projectMobileReaderPickerUiV1(unsupported)).toEqual(ko);
    }
    expect(MOBILE_READER_INTERPRETATION_PUBLIC_V1).toBe(false);
    expect(MOBILE_READER_PRESENTATIONS_V1).toHaveLength(9);
    for (const reader of MOBILE_READER_PRESENTATIONS_V1) {
      expect(isMobileReaderPreviewSelectableV1(reader.key)).toBe(reader.key === 'seyeon');
    }
  });

  it('wires only shell/accessibility copy and leaves Character persona, selection and Saju/Face server sources unchanged', async () => {
    const [picker, saju, face] = await Promise.all([
      readFile(new URL('../apps/mobile/src/features/reading/MobileReaderPicker.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../apps/mobile/src/app/(tabs)/reading/index.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../apps/mobile/src/app/(tabs)/reading/face.tsx', import.meta.url), 'utf8'),
    ]);
    expect(picker).toContain('const ui = projectMobileReaderPickerUiV1(locale)');
    expect(picker).toContain('{reader.name}');
    expect(picker).toContain('{reader.title}');
    expect(picker).toContain('{reader.tone}');
    expect(picker).toContain('{option.name}');
    expect(picker).toContain('{option.title}');
    expect(picker).toContain('{option.tone}');
    expect(picker).toContain('disabled={!available}');
    expect(picker).toContain('if (!available) return;');
    expect(picker).toContain('{ui.selectionLimit}');
    expect(picker).toContain('{ui.authorityBoundary}');
    expect(picker).toContain('ui.saju : ui.face');
    expect(saju).toContain('<MobileReaderPicker');
    expect(face).toContain('<MobileReaderPicker');
    expect(picker).not.toContain('mobileReaderInterpretationServiceV1.read(');
    expect(picker).not.toContain('openCharacter(');
    expect(picker).not.toContain('router.push(');
    expect(picker).not.toContain('readerLocale: locale');
    expect(picker).not.toContain('t(reader.tone)');
  });
});
