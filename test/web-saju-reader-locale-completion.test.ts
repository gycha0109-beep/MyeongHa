import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { SAJU_READER_SURFACE_COPY_V1 } from '../apps/web/ui-i18n-saju-reader-surface-copy-v1.js';
import { translateStaticUi, SUPPORTED_UI_LOCALES } from '../apps/web/ui-i18n.js';
import { SAJU_DISPLAY_LOCALES_V1, sajuPillarLabelV1, localizeSajuCopyV1,
  sajuElementLabelV1, sajuYinYangLabelV1, sajuCompletenessLabelV1 } from '../apps/web/saju-calculation-locale.js';
import { READER_PRESENTATIONS } from '../apps/web/reader-presentation-catalog.js';

describe('five-language Saju and Reader surface completion', () => {
  it('fills each authored Saju/product/picker label without Korean leakage', () => {
    expect(SUPPORTED_UI_LOCALES).toEqual(['ko-KR','ja-JP','zh-TW','en-US','zh-CN']);
    expect(SAJU_READER_SURFACE_COPY_V1.size).toBeGreaterThan(100);
    for (const [source] of SAJU_READER_SURFACE_COPY_V1) {
      expect(translateStaticUi(source, 'ko-KR')).toBe(source);
      for (const locale of ['ja-JP','zh-TW','en-US','zh-CN'] as const) {
        const translated = translateStaticUi(source, locale);
        expect(translated, `Missing ${locale} for ${source}`).not.toBe(source);
        expect(translated, `Korean leak: ${locale}/${source}`).not.toMatch(/[가-힣]/u);
      }
    }
  });
  it('localizes source-owned calculated Saju facts in all five languages', () => {
    expect(SAJU_DISPLAY_LOCALES_V1).toEqual(SUPPORTED_UI_LOCALES);
    expect(sajuPillarLabelV1('day', 'en-US')).toBe('Day pillar');
    expect(sajuPillarLabelV1('hour', 'zh-CN')).toBe('时柱');
    expect(sajuElementLabelV1('목', 'en-US')).toBe('Wood');
    expect(sajuYinYangLabelV1('음', 'zh-CN')).toBe('阴');
    expect(sajuCompletenessLabelV1(3,false,'en-US')).toBe('3/4 pillars confirmed');
    expect(localizeSajuCopyV1('양력','en-US')).toBe('Solar');
    expect(localizeSajuCopyV1('음력','zh-CN')).toBe('农历');
  });
  it('hides only the three requested public Reader cards without deleting canonical entries', async () => {
    const js = await readFile(new URL('../apps/web/reader-picker-dialog.js', import.meta.url), 'utf8');
    expect(js).toContain("new Set(['doyun', 'mira', 'seorin'])");
    expect(js).toContain('if (hiddenPublicReaders.has(reader.key)) continue;');
    for (const key of ['doyun','mira','seorin']) {
      expect(READER_PRESENTATIONS.some(reader => reader.key === key)).toBe(true);
    }
    expect(READER_PRESENTATIONS.filter(reader => !['doyun','mira','seorin'].includes(reader.key)).map(reader => reader.key))
      .toEqual(['seyeon','baekheon','yeoul','rahyeon','taegyeom','yunho']);
  });
});
