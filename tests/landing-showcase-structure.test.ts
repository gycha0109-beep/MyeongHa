import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const indexPath = new URL('../apps/web/index.html', import.meta.url);
const landingPagePath = new URL('../apps/web/src/landing/LandingPage.tsx', import.meta.url);
const showcaseCssPath = new URL('../apps/web/landing-showcase.css', import.meta.url);

describe('landing showcase structure', () => {
  it('keeps the approved hero, reading preview, ambassador row and experience grid', async () => {
    const [html, page] = await Promise.all([
      readFile(indexPath, 'utf8'),
      readFile(landingPagePath, 'utf8'),
    ]);
    const source = `${html}\n${page}`;

    expect(source).toContain('태어난 순간부터');
    expect(source).toContain('대리자와 함께 읽습니다.');
    expect(source).toContain('세계관 둘러보기');
    expect(source).toContain('landing-ambassadors');
    expect(source).toContain('7명의 신의 대리자가');
    expect(source).toContain('landing-reading-preview');
    expect(source).toContain('명식은 하나,');
    expect(source).toContain('읽는 관계는 여러 갈래.');
    expect(source).toContain('내 명식 미리보기');
    expect(source).toContain('명하에서는 이런 경험을 할 수 있습니다');
    expect(source).toContain('나의 기록 열기');
    expect(source).toContain('여러 관점으로 읽기');
    expect(source).toContain('대리자와 대화하기');
    expect(source).toContain('관계와 기록이 쌓이기');
  });

  it('keeps the target header navigation and verified landing artwork path', async () => {
    const [html, page, css] = await Promise.all([
      readFile(indexPath, 'utf8'),
      readFile(landingPagePath, 'utf8'),
      readFile(showcaseCssPath, 'utf8'),
    ]);
    const source = `${html}\n${page}`;

    for (const label of ['세계관', '대리자들', '기록의 방식', '이용 안내', '로그인', '명하에 들어가기']) {
      expect(source).toContain(label);
    }

    expect(html).toContain('landing-showcase.css');
    expect(page).toContain('landing-art-dark-01.js');
    expect(page).toContain('landing-art-light-01.js');
    expect(page).toContain('landing-art-init.js');
    expect(css).toContain('grid-template-columns: repeat(4, minmax(0, 1fr));');
    expect(css).toContain('.landing-reading-preview');
    expect(css).toContain('.landing-showcase-hero');
  });
});
