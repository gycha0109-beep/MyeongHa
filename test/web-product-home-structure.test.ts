import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const hallPath = new URL('../apps/web/hall.html', import.meta.url);
const productCssPath = new URL('../apps/web/product.css', import.meta.url);
const homeV2CssPath = new URL('../apps/web/home-v2.css', import.meta.url);
const landscapePath = new URL('../apps/web/home-landscape.svg', import.meta.url);
const mountainsPath = new URL('../apps/web/home-paper-mountains.svg', import.meta.url);
const plumPath = new URL('../apps/web/home-plum-branch.svg', import.meta.url);

describe('MyeongHa product Home web v2', () => {
  it('keeps the approved five-destination IA in both desktop and mobile navigation', async () => {
    const html = await readFile(hallPath, 'utf8');

    expect(html).toContain('class="product-nav"');
    expect(html).toContain('class="mobile-bottom-nav"');

    for (const label of ['홈', '사주', '대화', '기록', '마이']) {
      expect(html).toContain(`>${label}<`);
    }
  });

  it('preserves the Home hierarchy instead of turning the page into a dashboard', async () => {
    const html = await readFile(hallPath, 'utf8');

    const today = html.indexOf('class="home-today"');
    const continuingStory = html.indexOf('class="paper-card home-thread"');
    const topics = html.indexOf('id="topics-title"');
    const person = html.indexOf('id="person-title"');

    expect(today).toBeGreaterThan(-1);
    expect(continuingStory).toBeGreaterThan(today);
    expect(topics).toBeGreaterThan(continuingStory);
    expect(person).toBeGreaterThan(topics);
  });

  it('loads the base product system plus the approved Home v2 refinement layer', async () => {
    const [html, productCss, homeV2Css] = await Promise.all([
      readFile(hallPath, 'utf8'),
      readFile(productCssPath, 'utf8'),
      readFile(homeV2CssPath, 'utf8'),
    ]);

    expect(html).toContain('href="product.css"');
    expect(html).toContain('href="home-v2.css"');
    expect(html).not.toContain('John Doe');
    expect(html).not.toContain('DEMO');

    for (const token of [
      '--mh-paper-base',
      '--mh-ink-strong',
      '--mh-night-900',
      '--mh-brass',
      '--mh-seal',
    ]) {
      expect(productCss).toContain(token);
    }

    expect(homeV2Css).toContain('grid-template-columns: minmax(0, 1.305fr)');
    expect(homeV2Css).toContain('url("home-landscape.svg")');
    expect(homeV2Css).toContain('url("home-paper-mountains.svg")');
    expect(homeV2Css).toContain('url("home-plum-branch.svg")');
  });

  it('ships the decorative reference artwork as static SVG assets rather than screenshot slices', async () => {
    const [landscape, mountains, plum] = await Promise.all([
      readFile(landscapePath, 'utf8'),
      readFile(mountainsPath, 'utf8'),
      readFile(plumPath, 'utf8'),
    ]);

    expect(landscape).toContain('<svg');
    expect(landscape).toContain('오늘의 흐름 산수 장식');
    expect(mountains).toContain('<svg');
    expect(plum).toContain('<svg');
  });

  it('keeps Saju, records, and character surfaces separate without hardcoding a recommended character', async () => {
    const html = await readFile(hallPath, 'utf8');

    expect(html).toContain('href="reading.html"');
    expect(html).toContain('href="records.html"');
    expect(html).toContain('class="home-person-action" href="chat.html"');
    expect(html).toContain('class="home-person-tag">캐릭터 선택</span>');
    expect(html).toContain('캐릭터와 이야기하기');
    expect(html).not.toContain('href="chat.html?character=seyeon"');
  });
});
