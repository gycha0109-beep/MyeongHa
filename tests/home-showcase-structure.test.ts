import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const hallPath = new URL('../apps/web/hall.html', import.meta.url);
const showcaseCssPath = new URL('../apps/web/home-showcase-v4.css', import.meta.url);

describe('home showcase structure', () => {
  it('keeps the approved home sections and interaction labels', async () => {
    const html = await readFile(hallPath, 'utf8');

    for (const label of [
      '오늘은 무엇을 읽어볼까요?',
      '이어지는 이야기',
      '전체 보기 →',
      '연애',
      '직업',
      '금전',
      '올해 흐름',
      '오늘 이야기할 사람',
      '이야기하기',
    ]) {
      expect(html).toContain(label);
    }

    expect(html).toContain('home-showcase-v4.css');
    expect(html).toContain('home-thread-step is-future');
  });

  it('pins the approved proportions without fabricating personalized authority', async () => {
    const html = await readFile(hallPath, 'utf8');
    const css = await readFile(showcaseCssPath, 'utf8');

    expect(css).toContain('--home-shell-max: 1420px;');
    expect(css).toContain('grid-template-columns: minmax(0, 1.31fr) minmax(410px, 1fr);');
    expect(css).toContain('.home-person-avatar::before');

    expect(html).not.toContain('오늘은 움직이기보다');
    expect(html).not.toContain('퇴사를 고민했던 이야기');
    expect(html).not.toContain('세연');
  });
});
