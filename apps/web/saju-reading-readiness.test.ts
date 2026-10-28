import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const html = [
  readFileSync(new URL('./reading.html', import.meta.url), 'utf8'),
  readFileSync(new URL('./src/reading/ReadingPage.tsx', import.meta.url), 'utf8'),
].join('\n');

describe('Saju hub current service readiness', () => {
  it('does not present retired or unapproved paid products as purchasable', () => {
    for (const obsolete of ['유료 사주 해석에서 제공되는 내용', '이 해석 선택하기', '예시 결과물 미리보기', '실제 구매 시', '구매하시면']) {
      expect(html).not.toContain(obsolete);
    }
    expect(html).not.toContain('<span class="gm-chip is-green">완료</span>');
    expect(html).not.toContain('<span class="gm-chip">이어보기</span>');
  });

  it('shows actual chart and stored records while preserving free preview', () => {
    expect(html).toContain('지금 이용할 수 있는 사주 기능');
    expect(html).toContain('records.html?tab=birth');
    expect(html).toContain('records.html?tab=saju');
    expect(html).toContain('reading-detail.html?topic=temperament&scope=original');
    expect(html).toContain('상품별 확정 전까지 안내하거나 구매받지 않습니다');
  });
});
