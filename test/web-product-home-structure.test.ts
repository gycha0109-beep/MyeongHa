import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const hallPath = new URL('../apps/web/hall.html', import.meta.url);
const productCssPath = new URL('../apps/web/product.css', import.meta.url);

describe('MyeongHa product Home v1', () => {
  it('keeps the approved five-destination IA in both desktop and mobile navigation', async () => {
    const html = await readFile(hallPath, 'utf8');

    expect(html).toContain('class="product-nav"');
    expect(html).toContain('class="mobile-bottom-nav"');

    for (const label of ['홈', '사주', '대화', '기록', '마이']) {
      expect(html).toContain(`>${label}<`);
    }
  });

  it('preserves the Home information hierarchy instead of turning into a dashboard', async () => {
    const html = await readFile(hallPath, 'utf8');

    const today = html.indexOf('오늘의 흐름');
    const continuingStory = html.indexOf('이어지는 이야기');
    const topics = html.indexOf('무엇을 보고 싶으세요?');
    const person = html.indexOf('오늘 이야기할 사람');

    expect(today).toBeGreaterThan(-1);
    expect(continuingStory).toBeGreaterThan(today);
    expect(topics).toBeGreaterThan(continuingStory);
    expect(person).toBeGreaterThan(topics);
  });

  it('uses the product visual system and removes legacy placeholder roster content', async () => {
    const [html, css] = await Promise.all([
      readFile(hallPath, 'utf8'),
      readFile(productCssPath, 'utf8'),
    ]);

    expect(html).toContain('href="product.css"');
    expect(html).not.toContain('John Doe');
    expect(html).not.toContain('DEMO');

    for (const token of [
      '--mh-paper-base',
      '--mh-ink-strong',
      '--mh-night-900',
      '--mh-brass',
      '--mh-seal',
    ]) {
      expect(css).toContain(token);
    }
  });

  it('keeps Saju and relationship surfaces as separate Home entry points', async () => {
    const html = await readFile(hallPath, 'utf8');

    expect(html).toContain('href="reading.html"');
    expect(html).toContain('href="records.html"');
    expect(html).toContain('href="chat.html?character=seyeon"');
  });
});
