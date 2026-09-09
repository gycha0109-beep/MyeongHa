import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const hallPath = new URL('../apps/web/hall.html', import.meta.url);
const productCssPath = new URL('../apps/web/product.css', import.meta.url);
const goldenCssPath = new URL('../apps/web/golden-master.css', import.meta.url);
const landscapePath = new URL('../apps/web/home-landscape.svg', import.meta.url);
const mountainsPath = new URL('../apps/web/home-paper-mountains.svg', import.meta.url);
const plumPath = new URL('../apps/web/home-plum-branch.svg', import.meta.url);

describe('MyeongHa product Home — Golden Master', () => {
  it('keeps the approved five-destination IA in both desktop and mobile navigation', async () => {
    const html = await readFile(hallPath, 'utf8');

    expect(html).toContain('class="product-nav"');
    expect(html).toContain('class="mobile-bottom-nav"');

    for (const label of ['홈', '사주', '대화', '기록', '마이']) {
      expect(html).toContain(`>${label}<`);
    }
  });

  it('preserves the approved Golden Master Home hierarchy without sidebars', async () => {
    const html = await readFile(hallPath, 'utf8');

    const greeting = html.indexOf('class="gm-home-head"');
    const character = html.indexOf('class="gm-home-hero"');
    const month = html.indexOf('id="home-month-title"');
    const products = html.indexOf('id="home-products-title"');
    const recent = html.indexOf('id="home-recent-title"');

    expect(greeting).toBeGreaterThan(-1);
    expect(character).toBeGreaterThan(greeting);
    expect(month).toBeGreaterThan(character);
    expect(products).toBeGreaterThan(month);
    expect(recent).toBeGreaterThan(products);
    expect(html).not.toContain('home-sidebar');
    expect(html).not.toContain('gm-sidebar');
  });

  it('loads the base product system plus the approved Golden Master refinement layer', async () => {
    const [html, productCss, goldenCss] = await Promise.all([
      readFile(hallPath, 'utf8'),
      readFile(productCssPath, 'utf8'),
      readFile(goldenCssPath, 'utf8'),
    ]);

    expect(html).toContain('href="product.css"');
    expect(html).toContain('href="golden-master.css"');
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

    expect(goldenCss).toContain('--gm-max: 1240px;');
    expect(goldenCss).toMatch(/\.gm-home-products\s*\{[\s\S]*?grid-template-columns:\s*repeat\(4,/u);
  });

  it('keeps reusable decorative artwork as static SVG assets rather than screenshot slices', async () => {
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

  it('keeps Saju, records, and Character surfaces separate without hardcoding a recommended Character', async () => {
    const html = await readFile(hallPath, 'utf8');

    expect(html).toContain('href="reading.html"');
    expect(html).toContain('href="records.html"');
    expect(html).toContain('href="chat-hub.html">대화로 가기 →</a>');
    expect(html).toContain('오늘 이야기할 사람');
    expect(html).toContain('캐릭터 선택');
    expect(html).not.toContain('href="chat.html?character=');
    expect(html).not.toContain('세연');
  });
});
