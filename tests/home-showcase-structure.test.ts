import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const hallPath = new URL('../apps/web/hall.html', import.meta.url);
const goldenPath = new URL('../apps/web/golden-master.css', import.meta.url);

describe('Home Golden Master showcase structure', () => {
  it('keeps the approved Golden Master sections and interaction labels', async () => {
    const html = await readFile(hallPath, 'utf8');

    for (const label of [
      '좋은 저녁이에요',
      '오늘 이야기할 사람',
      '캐릭터 선택',
      '이번 달 사주 읽기',
      '사주 읽기 주제',
      '전체 사주',
      '직업 · 커리어',
      '재물',
      '연애 · 관계',
      '최근 이야기',
    ]) {
      expect(html).toContain(label);
    }

    expect(html).toContain('제공 상태 확인');
    expect(html).toContain('읽기 확인');
    expect(html).toContain('전체 주제 보기');
    expect(html).not.toContain('이달의 운세 전체보기');
    expect(html).not.toContain('오늘의 흐름은 사주 화면에서 직접 펼쳐볼 수 있습니다.');
    expect(html).toContain('golden-master.css');
    expect(html).toContain('href="chat-hub.html">대화로 가기 →</a>');
  });

  it('pins the approved centered proportions without fabricating personalized authority', async () => {
    const [html, css] = await Promise.all([
      readFile(hallPath, 'utf8'),
      readFile(goldenPath, 'utf8'),
    ]);

    expect(css).toContain('--gm-max: 1240px;');
    expect(css).toMatch(/\.gm-home-products\s*\{[\s\S]*?grid-template-columns:\s*repeat\(4,/u);
    expect(html).not.toContain('home-sidebar');
    expect(html).not.toContain('gm-sidebar');
    expect(html).not.toContain('오늘은 움직이기보다');
    expect(html).not.toContain('퇴사를 고민했던 이야기');
    expect(html).not.toContain('세연');
    expect(html).not.toContain('chat.html?character=');
  });
});
