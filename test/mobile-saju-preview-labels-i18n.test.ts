import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import { translateMobileUiCopy } from '../apps/mobile/src/ui/mobile-ui-copy.js';

describe('I18N-07 mobile Saju preview UI labels, source held unchanged', () => {
  it('localizes authored topic and progress labels with the existing approved UI dictionary', () => {
    expect(translateMobileUiCopy('읽기', 'ko-KR')).toBe('읽기');
    expect(translateMobileUiCopy('읽기', 'ja-JP')).toBe('鑑定');
    expect(translateMobileUiCopy('읽기', 'zh-TW')).toBe('解讀');
    expect(translateMobileUiCopy('전체 사주', 'ja-JP')).not.toBe('전체 사주');
    expect(translateMobileUiCopy('전체 사주', 'zh-TW')).not.toBe('전체 사주');
  });

  it('translates only local UI topic identifiers while leaving both preview source channels unaltered', async () => {
    const [preview, scene] = await Promise.all([
      readFile(new URL('../apps/mobile/src/features/saju/SajuPreviewReadingView.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../apps/mobile/src/app/reading/scene.tsx', import.meta.url), 'utf8'),
    ]);
    expect(preview).toContain('{t(state.topic.label)}');
    expect(preview).toContain("{t('읽기')} {index + 1}");
    expect(scene).toContain("{t(admission.topic.label)} · {t('읽기')}");
    expect(preview).toContain('>{step.title}</Text>');
    expect(preview).toContain('>{step.primary}</Text>');
    expect(preview).toContain('{notice}');
    expect(scene).toContain('{currentStep.title}');
    expect(scene).toContain('{currentStep.primary}');
    expect(scene).toContain('{text}');
    expect(preview).toContain('mobileSajuPreviewServiceV1.read(readingText)');
    expect(scene).toContain('mobileSajuPreviewServiceV1.read(admission.readingText)');
    expect(preview).not.toContain('t(step.primary)');
    expect(scene).not.toContain('t(currentStep.primary)');
    expect(preview).not.toContain('readingLocale: locale');
    expect(scene).not.toContain('readingLocale: locale');
  });
});
