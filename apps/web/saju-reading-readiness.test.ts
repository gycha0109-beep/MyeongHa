import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const html = [
  readFileSync(new URL('./reading.html', import.meta.url), 'utf8'),
  readFileSync(new URL('./src/reading/ReadingPage.tsx', import.meta.url), 'utf8'),
].join('\n');

describe('Saju hub target product discovery', () => {
  it('keeps full product discovery and report structure, independent of runtime activation gates', () => {
    expect(html).toContain('사주 해석 상품');
    for (const topic of ['전체 사주 해석', '직업 · 커리어', '재물', '연애 · 관계']) {
      expect(html).toContain(topic);
    }
    expect(html).toContain('이 해석 선택하기');
    expect(html).toContain('보고서 구성 미리보기');
    expect(html).toContain('다른 사주 주제 둘러보기');
  });

  it('keeps current chart, free preview and distinct actual route availability', () => {
    expect(html).toContain('나의 사주 기본 정보');
    expect(html).toContain('reading-detail.html?topic=temperament&scope=original');
    expect(html).toContain('reading-detail.html?topic=love');
    expect(html).toContain('reading-detail.html?scope=year');
    expect(html).toContain('resolveReadingAvailabilityV1(href).label');
  });
});
