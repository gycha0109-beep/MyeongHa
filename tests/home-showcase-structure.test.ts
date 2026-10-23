import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const hallPath = new URL('../apps/web/hall.html', import.meta.url);
const homePagePath = new URL('../apps/web/src/home/HomePage.tsx', import.meta.url);
const goldenPath = new URL('../apps/web/golden-master.css', import.meta.url);

describe('Home Golden Master showcase structure', () => {
  it('keeps the approved Golden Master sections and interaction labels', async () => {
    const [html, page] = await Promise.all([
      readFile(hallPath, 'utf8'),
      readFile(homePagePath, 'utf8'),
    ]);
    const homeSource = `${html}\n${page}`;

    for (const label of [
      '요즘, 무엇이 가장',
      '궁금하세요?',
      '사주 관심 주제',
      '전체 사주',
      '직업 · 커리어',
      '재물',
      '연애 · 관계',
      '당신의 이야기를',
      '지금, 확인해 보세요',
      '이번 달 사주 읽기',
      '최근 이야기',
    ]) {
      expect(homeSource).toContain(label);
    }

    expect(homeSource).toContain('사주 프리뷰 보기');
    expect(homeSource).toContain('resolveReadingAvailabilityV1(topic.href).label');
    expect(homeSource).toContain('인물 둘러보기');
    expect(homeSource).not.toContain('이달의 운세 전체보기');
    expect(homeSource).not.toContain('오늘의 흐름은 사주 화면에서 직접 펼쳐볼 수 있습니다.');
    expect(homeSource).toContain('golden-master.css');
    expect(homeSource).toContain('href="chat-hub.html"');
  });

  it('pins the approved centered proportions without fabricating personalized authority', async () => {
    const [html, page, css] = await Promise.all([
      readFile(hallPath, 'utf8'),
      readFile(homePagePath, 'utf8'),
      readFile(goldenPath, 'utf8'),
    ]);
    const homeSource = `${html}\n${page}`;

    expect(css).toContain('--gm-max: 1240px;');
    expect(css).toMatch(/\.gm-home-products\s*\{[\s\S]*?grid-template-columns:\s*repeat\(4,/u);
    expect(homeSource).not.toContain('home-sidebar');
    expect(homeSource).not.toContain('gm-sidebar');
    expect(homeSource).not.toContain('오늘은 움직이기보다');
    expect(homeSource).not.toContain('퇴사를 고민했던 이야기');
    expect(homeSource).not.toContain('세연');
    expect(homeSource).not.toContain('chat.html?character=');
  });
});
