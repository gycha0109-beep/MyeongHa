import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const hallPath = new URL('../apps/web/hall.html', import.meta.url);
const homePagePath = new URL('../apps/web/src/home/HomePage.tsx', import.meta.url);
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

  it('preserves the approved topic-first Home hierarchy without sidebars', async () => {
    const [html, page] = await Promise.all([readFile(hallPath, 'utf8'), readFile(homePagePath, 'utf8')]);
    const homeSource = `${html}\n${page}`;
    const topicHero = page.indexOf('className="mhx-hero"');
    const characters = page.indexOf('className="mhx-characters"');
    const content = page.indexOf('id="mhx-today-title"');
    const recent = page.indexOf('id="mhx-recent-title"');

    expect(topicHero).toBeGreaterThan(-1);
    expect(characters).toBeGreaterThan(topicHero);
    expect(content).toBeGreaterThan(characters);
    expect(recent).toBeGreaterThan(content);
    expect(homeSource).not.toContain('home-sidebar');
    expect(homeSource).not.toContain('gm-sidebar');
  });

  it('loads the base product system plus the approved Golden Master refinement layer', async () => {
    const [html, page, productCss, goldenCss] = await Promise.all([
      readFile(hallPath, 'utf8'),
      readFile(homePagePath, 'utf8'),
      readFile(productCssPath, 'utf8'),
      readFile(goldenCssPath, 'utf8'),
    ]);
    const homeSource = `${html}\n${page}`;

    expect(html).toContain('href="product.css"');
    expect(html).toContain('href="golden-master.css"');
    expect(homeSource).not.toContain('John Doe');
    expect(homeSource).not.toContain('DEMO');

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
    const [html, page] = await Promise.all([readFile(hallPath, 'utf8'), readFile(homePagePath, 'utf8')]);
    const homeSource = `${html}\n${page}`;

    expect(homeSource).toContain('href="reading.html"');
    expect(homeSource).toContain('href="records.html"');
    expect(homeSource).toContain('href="chat-hub.html"');
    expect(homeSource).toContain('사주 관심 주제');
    expect(homeSource).toContain('mhx-characters');
    expect(homeSource).not.toContain('href="chat.html?character=');
    expect(homeSource).not.toContain('세연');
  });
});
