import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const root = new URL('../apps/web/', import.meta.url);
const read = (path: string) => readFile(new URL(path, root), 'utf8');
const routes = ['hall','reading','face-reading','chat-hub','chat','records','my','reading-detail','auth','contact'];

describe('shared refined header', () => {
  it('keeps approved paper texture and compact four-button geometry', async () => {
    const css = await read('shared-product-header.css');
    expect(css).toContain('myeongha-header-light-texture-v2.webp');
    expect(css).toContain('myeongha-header-dark-texture-v2.webp');
    expect(css).toContain('--mh-header-height-desktop: 92px;');
    expect(css).toContain('--mh-header-height-mobile: 86px;');
    expect(css).toContain('html { overflow-y: scroll; }');
    expect(css).not.toContain('scrollbar-gutter: stable both-edges;');
    expect(css).toContain('grid-template-columns: 205px minmax(335px, 1fr) 250px !important;');
    expect(css).toContain('grid-template-columns: 146px minmax(200px, 1fr) 219px !important;');
    expect(css).toContain('header-ui-glyphs-v2.png');
    expect(css).toContain('background-size: 140px 56px !important;');
    expect(css).toContain('background-position: -28px var(--mh-glyph-row) !important;');
    expect(css).not.toContain('.product-report-link');
    for (const legacy of ['golden-master.css','golden-master-lock.css','home-moonlight.css']) {
      expect(await read(legacy)).not.toMatch(/body\.gm-page(?:\[data-page="home"\])? \.product-(?:header|brand|nav|utilities|profile|icon-button|theme-toggle)/);
    }
    expect(await read('ui-i18n.css')).not.toContain('body.product-page .product-header');
    for (const name of ['light','dark']) {
      const bytes = await readFile(new URL('assets/header/myeongha-header-' + name + '-texture-v2.webp', root));
      expect(bytes.byteLength).toBeGreaterThan(1000);
      expect(bytes.toString('ascii', 0, 4)).toBe('RIFF');
      expect(bytes.toString('ascii', 8, 12)).toBe('WEBP');
    }
  });

  it('renders requested order, icon-only My and real language select across ten routes', async () => {
    for (const page of routes) {
      const html = await read(page + '.html');
      const header = html.slice(html.indexOf('<header class="product-header'), html.indexOf('</header>'));
      const controls = ['product-theme-toggle','product-icon-button','product-profile','ui-locale-picker'];
      for (const item of controls) expect((header.match(new RegExp('class="' + item + '"','g')) ?? []).length).toBe(1);
      const positions = controls.map(item => header.indexOf('class="' + item + '"'));
      expect(positions.every((value,index) => value >= 0 && (index === 0 || value > positions[index-1]!))).toBe(true);
      expect(header).toContain('class="product-nav"');
      expect(header).not.toContain('product-report-link');
      expect(header).not.toContain('contact.html?report=content');
      expect(header).not.toMatch(/<span(?: id="home-profile-name")?>마이<\/span>/);
      expect(header.match(/<option value=/g)).toHaveLength(5);
      expect(html.indexOf('shared-product-header.css')).toBeGreaterThan(html.indexOf('ui-i18n.css'));
    }
    expect(await read('my.html')).toContain('aria-current="page"');
    const auth = await read('product-auth-ui.js');
    expect(auth).not.toContain("label.textContent = '마이'");
    expect(auth).not.toContain("label.textContent = '로그인'");
    expect(auth).toContain("profile.setAttribute('aria-label', '로그인')");
    const contact = await read('contact.js');
    expect(contact).not.toContain("searchParams.get('report')");
    expect(contact).toContain("fetch('/api/contact'");
  });

  it('makes pink unread-dot palette entries fully transparent in the supplied light/dark icon', async () => {
    const png = await readFile(new URL('assets/header/header-ui-glyphs-v2.png', root));
    expect(png.toString('hex',0,8)).toBe('89504e470d0a1a0a');
    expect(png.readUInt32BE(16)).toBe(240);
    expect(png.readUInt32BE(20)).toBe(96);
    let offset = 8;
    let palette: Uint8Array | null = null;
    let opacity: Uint8Array | null = null;
    while (offset < png.byteLength) {
      const len = png.readUInt32BE(offset);
      const tag = png.toString('ascii',offset+4,offset+8);
      if (tag === 'PLTE') palette = png.subarray(offset+8,offset+8+len);
      if (tag === 'tRNS') opacity = png.subarray(offset+8,offset+8+len);
      offset += 12+len;
    }
    expect(palette).not.toBeNull();
    expect(opacity).not.toBeNull();
    const colors = palette as Uint8Array;
    const alphas = opacity as Uint8Array;
    for (let index = 0; index < colors.length/3; index++) {
      const r=colors[3*index]!,g=colors[3*index+1]!,b=colors[3*index+2]!;
      if (r>g+15 && r>b+7) expect(alphas[index]).toBe(0);
    }
  });
});
