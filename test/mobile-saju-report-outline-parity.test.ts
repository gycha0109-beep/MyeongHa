import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { SAJU_READER_SURFACE_COPY_V1 } from '../apps/web/ui-i18n-saju-reader-surface-copy-v1.js';
import { MOBILE_SAJU_REPORT_OUTLINE_COPY_V1, mobileSajuReportOutlineCopyV1 } from '../apps/mobile/src/features/saju/mobile-saju-report-outline-copy.js';

const keys = [
  [
    "heading",
    "보고서 구성 미리보기"
  ],
  [
    "example",
    "구성 예시"
  ],
  [
    "description",
    "공식 보고서는 구매한 상품의 해석 범위에 따라 목차와 근거가 구성됩니다. 이 영역은 실제 개인별 결과가 아닌 문서 구성 안내입니다."
  ],
  [
    "notResult",
    "공식 보고서 구성 예시. 개인별 해석이 아닙니다."
  ],
  [
    "chapter",
    "1. 핵심 해석 및 명식 근거"
  ],
  [
    "contents",
    "개인별 공식 해석 · 주제별 상세 내용 · 근거와 한계 · 발행 버전 · 기록 재열람"
  ]
] as const;
const locales = ['ja-JP','zh-TW','en-US','zh-CN'] as const;

describe('mobile Saju report outline preview matches Web without paid result', () => {
  it('preserves all six authored Web report-example sections in five languages', () => {
    for (const [key, source] of keys) {
      expect(MOBILE_SAJU_REPORT_OUTLINE_COPY_V1[key]['ko-KR']).toBe(source);
      const web = SAJU_READER_SURFACE_COPY_V1.get(source);
      expect(web).toBeDefined();
      for (const locale of locales) {
        expect(MOBILE_SAJU_REPORT_OUTLINE_COPY_V1[key][locale]).toBe(web?.[locale]);
        expect(MOBILE_SAJU_REPORT_OUTLINE_COPY_V1[key][locale]).not.toMatch(/[가-힣]/u);
      }
    }
    expect(mobileSajuReportOutlineCopyV1('en-US').example).toBe('Example structure');
  });

  it('shows only the static document outline below eleven topic cards', async () => {
    const [mobile, component, service] = await Promise.all([
      readFile(new URL('../apps/mobile/src/features/saju/SajuPreviewReadingView.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../apps/mobile/src/features/saju/SajuReportStructurePreview.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../apps/mobile/src/features/saju/native-mobile-saju-preview-service.ts', import.meta.url), 'utf8'),
    ]);
    expect(mobile).toContain('<SajuReportStructurePreview />');
    expect(mobile.indexOf('MOBILE_SAJU_TOPIC_SECTIONS_V1.map')).toBeLessThan(mobile.indexOf('<SajuReportStructurePreview />'));
    expect(component).toContain('copy.notResult');
    expect(component).not.toContain('fetch(');
    expect(component).not.toContain('onPress');
    expect(service).toContain('mobileSajuPreviewServiceV1');
  });
});
