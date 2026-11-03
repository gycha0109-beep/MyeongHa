import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const root = new URL('../apps/web/', import.meta.url);
const read = (path: string) => readFile(new URL(path, root), 'utf8');

describe('shared refined header', () => {
  it('keeps the paper-textured header local, theme-aware, and compact', async () => {
    const css = await read('shared-product-header.css');
    expect(css).toContain('myeongha-header-light-texture-v2.webp');
    expect(css).toContain('myeongha-header-dark-texture-v2.webp');
    expect(css).toContain('--mh-header-height-desktop: 92px;');
    expect(css).toContain('--mh-header-height-mobile: 86px;');
    expect(css).toContain('height: 100%;');
    expect(css).toContain('html { overflow-y: scroll; }');
    expect(css).not.toContain('scrollbar-gutter: stable both-edges;');
    expect(css).toContain('grid-template-columns: 205px minmax(335px, 1fr) 382px !important;');
    expect(css).toContain('grid-template-columns: 146px minmax(200px, 1fr) 322px !important;');
    expect(css).toContain('flex: 0 0 112px;');
    expect(css).toContain('header-ui-glyphs-v1.png');
    expect(css).toContain('background-size: 140px 56px !important;');
    expect(css).toContain('--mh-glyph-row: -28px;');
    expect(css).toContain('.product-report-link::before');
    expect(css).not.toContain('--mh-header-bell');
    for (const legacy of ['golden-master.css', 'golden-master-lock.css', 'home-moonlight.css']) {
      expect(await read(legacy)).not.toMatch(/body\.gm-page(?:\[data-page="home"\])? \.product-(?:header|brand|nav|utilities|profile|icon-button|theme-toggle)/);
    }
    expect(await read('ui-i18n.css')).not.toContain('body.product-page .product-header');
    for (const filename of ['light', 'dark']) {
      const file = new URL(`assets/header/myeongha-header-${filename}-texture-v2.webp`, root);
      const bytes = await readFile(file);
      expect(bytes.byteLength).toBeGreaterThan(1000);
      expect(bytes.toString('ascii', 0, 4)).toBe('RIFF');
      expect(bytes.toString('ascii', 8, 12)).toBe('WEBP');
    }
  });

  it('uses five section links, with My represented by the real profile link', async () => {
    for (const page of ['hall','reading','face-reading','chat-hub','chat','records','my','reading-detail','auth','contact']) {
      const html = await read(page + '.html');
      expect(html).not.toMatch(/class="product-nav-link" href="my\.html"/);
      expect(html).not.toContain('<span aria-hidden="true">⌄</span>');
      expect(html).toContain('class="product-profile"');
      expect(html).toContain('class="product-nav"');
      expect(html).toContain('class="product-report-link"');
      expect(html).toContain('href="contact.html?report=content"');
      expect((html.match(/class="product-theme-toggle"/g) ?? []).length).toBe(1);
      expect((html.match(/data-ui-locale-picker/g) ?? []).length).toBe(1);
      expect((html.match(/class="ui-locale-select"/g) ?? []).length).toBe(1);
      expect(html.indexOf('class="product-theme-toggle"')).toBeLessThan(html.indexOf('class="product-profile"'));
      expect(html.indexOf('class="ui-locale-picker"')).toBeLessThan(html.indexOf('class="product-icon-button"') < 0 ? html.indexOf('class="product-profile"') : html.indexOf('class="product-profile"'));
      expect(html.indexOf('class="product-report-link"')).toBeGreaterThan(html.indexOf('class="product-profile"'));
      expect(html).toContain('ui-i18n.css');
      expect(html).toContain('shared-product-header.css');
      expect(html.indexOf('shared-product-header.css')).toBeGreaterThan(html.indexOf('ui-i18n.css'));
    }
    expect(await read('my.html')).toContain('aria-current="page"');
    const png = await readFile(new URL('assets/header/header-ui-glyphs-v1.png', root));
    expect(png.toString('hex', 0, 8)).toBe('89504e470d0a1a0a');
    expect(png.readUInt32BE(16)).toBe(240);
    expect(png.readUInt32BE(20)).toBe(96);
    const theme = await read('product-theme.js');
    expect(theme).not.toContain("mark.textContent = dark ? '☀' : '☾'");
    const contact = await read('contact.js');
    expect(contact).toContain("searchParams.get('report') === 'content'");
    expect(contact).toContain("category.value = 'other'");
  });
});
