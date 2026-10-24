import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const html = [
  readFileSync(new URL('./reading.html', import.meta.url), 'utf8'),
  readFileSync(new URL('./src/reading/ReadingPage.tsx', import.meta.url), 'utf8'),
].join('\n');

describe('Saju hub Reading readiness presentation', () => {
  it('does not hardcode Product Reading completion or resume claims while runtime authority is blocked', () => {
    expect(html).not.toContain('<span class="gm-chip is-green">완료</span>');
    expect(html).not.toContain('<span class="gm-chip">이어보기</span>');
    expect(html).not.toContain('<span class="gm-chip">추천</span>');
    expect(html).not.toContain('<span class="gm-chip">새로 보기</span>');
  });

  it('keeps route discovery available without presenting Reading as already available', () => {
    expect(html).toContain('나의 사주 기본 정보');
    expect(html).toContain('다른 사주 주제 둘러보기');
    expect(html).toContain('reading-detail.html?topic=temperament&scope=original');
    expect(html).toContain('reading-detail.html?topic=love');
    expect(html).toContain('reading-detail.html?scope=year');
    expect(html).toContain('reading-detail.html?scope=month');
  });
});
