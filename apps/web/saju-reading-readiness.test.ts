import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const html = readFileSync(new URL('./reading.html', import.meta.url), 'utf8');

describe('Saju hub Reading readiness presentation', () => {
  it('does not hardcode Product Reading completion or resume claims while runtime authority is blocked', () => {
    expect(html).not.toContain('<span class="gm-chip is-green">완료</span>');
    expect(html).not.toContain('<span class="gm-chip">이어보기</span>');
    expect(html).not.toContain('<span class="gm-chip">추천</span>');
    expect(html).not.toContain('<span class="gm-chip">새로 보기</span>');
  });

  it('keeps route discovery available without presenting Reading as already available', () => {
    expect(html).toContain('내 명식과 사주 읽기 주제를 한곳에 모아봤어요.');
    expect(html).toContain('reading-detail.html?topic=temperament&scope=original');
    expect(html).toContain('reading-detail.html?topic=love');
    expect(html).toContain('reading-detail.html?scope=year');
    expect(html).toContain('reading-detail.html?scope=month');
  });
});
