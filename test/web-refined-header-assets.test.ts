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
    for (const page of ['hall','reading','face-reading','chat-hub','chat','records','my','reading-detail','auth']) {
      const html = await read(page + '.html');
      expect(html).not.toMatch(/class="product-nav-link" href="my\.html"/);
      expect(html).toContain('class="product-profile"');
      expect(html).toContain('class="product-nav"');
      expect(html).toContain('ui-i18n.css');
      expect(html).toContain('shared-product-header.css');
      expect(html.indexOf('shared-product-header.css')).toBeGreaterThan(html.indexOf('ui-i18n.css'));
    }
    expect(await read('my.html')).toContain('aria-current="page"');
  });
});
