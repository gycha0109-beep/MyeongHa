import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RECORDS_HUB_STATIC_UI_COPY_V1 } from './ui-records-hub-copy.js';

const html = [
  readFileSync(new URL('./reading.html', import.meta.url), 'utf8'),
  readFileSync(new URL('./src/reading/ReadingPage.tsx', import.meta.url), 'utf8'),
].join('\n');

describe('Saju hub target product discovery', () => {
  it('localizes the example report aria-label without modifying official result source', () => {
    const translations = RECORDS_HUB_STATIC_UI_COPY_V1.get('공식 보고서 구성 예시. 개인별 해석이 아닙니다.');
    expect(html).toContain('aria-label="공식 보고서 구성 예시. 개인별 해석이 아닙니다."');
    for (const locale of ['ja-JP', 'zh-TW', 'en-US', 'zh-CN'] as const) {
      expect(translations?.[locale]).toBeTruthy();
      expect(translations?.[locale]).not.toMatch(/[가-힣]/u);
    }
  });

  it('keeps full product discovery and report structure, independent of runtime activation gates', () => {
    expect(html).toContain('사주 해석 상품');
    for (const topic of [
      '전체 사주 해석', '직업 · 커리어', '재물', '연애 · 관계',
      '사업', '가족', '삶의 단계', '올해', '이번 달',
      '배우자', '궁합', '지금 고민으로 보기',
    ]) {
      expect(html).toContain(topic);
    }
    expect(html).toContain('allProductTopics.map((topic) => (');
    expect(html).toContain('className="saju-design-product-card"');
    expect(html).not.toContain('다른 사주 주제 둘러보기');
    expect(html).toContain('이 해석 선택하기');
    expect(html).toContain('보고서 구성 미리보기');
  });

  it('keeps current chart, free preview and distinct actual route availability', () => {
    expect(html).toContain('나의 사주 기본 정보');
    expect(html).toContain('reading-detail.html?topic=temperament&scope=original');
    expect(html).toContain('reading-detail.html?topic=love');
    expect(html).toContain('reading-detail.html?scope=year');
    expect(html).toContain('resolveReadingAvailabilityV1(topic.href).label');
  });
});
