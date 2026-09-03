import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const indexPath = new URL('../apps/web/index.html', import.meta.url);
const showcaseCssPath = new URL('../apps/web/landing-showcase.css', import.meta.url);

describe('landing showcase structure', () => {
  it('keeps the approved hero, reading preview, ambassador row and experience grid', async () => {
    const html = await readFile(indexPath, 'utf8');

    expect(html).toContain('태어난 순간부터');
    expect(html).toContain('대리자와 함께 읽습니다.');
    expect(html).toContain('세계관 둘러보기');
    expect(html).toContain('landing-ambassadors');
    expect(html).toContain('7명의 신의 대리자가');
    expect(html).toContain('landing-reading-preview');
    expect(html).toContain('명식은 하나,');
    expect(html).toContain('읽는 관계는 여러 갈래.');
    expect(html).toContain('내 명식 미리보기');
    expect(html).toContain('명하에서는 이런 경험을 할 수 있습니다');
    expect(html).toContain('나의 기록 열기');
    expect(html).toContain('여러 관점으로 읽기');
    expect(html).toContain('대리자와 대화하기');
    expect(html).toContain('관계와 기록이 쌓이기');
  });

  it('keeps the target header navigation and verified landing artwork path', async () => {
    const html = await readFile(indexPath, 'utf8');
    const css = await readFile(showcaseCssPath, 'utf8');

    for (const label of ['세계관', '대리자들', '기록의 방식', '이용 안내', '로그인', '명하에 들어가기']) {
      expect(html).toContain(label);
    }

    expect(html).toContain('landing-showcase.css');
    expect(html).toContain('landing-art-dark-01.js');
    expect(html).toContain('landing-art-light-01.js');
    expect(html).toContain('landing-art-init.js');
    expect(css).toContain('grid-template-columns: repeat(4, minmax(0, 1fr));');
    expect(css).toContain('.landing-reading-preview');
    expect(css).toContain('.landing-showcase-hero');
  });
});
