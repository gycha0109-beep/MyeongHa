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
    expect(css).toContain('grid-template-columns: 205px minmax(335px, 1fr) 274px !important;');
    expect(css).toContain('grid-template-columns: 146px minmax(200px, 1fr) 244px !important;');
    expect(css).not.toContain('header-ui-glyphs-v2.png');
    expect(css).toContain('--mh-header-icon: url("data:image/svg+xml,');
    expect(css).toContain('-webkit-mask: var(--mh-header-icon) center / 24px 24px no-repeat !important;');
    expect(css).toContain('transform: translate(-50%, -50%) !important;');
    expect(css).toContain('.product-icon-button[data-unread="true"]::after');
    expect(css).toMatch(/\.product-icon-button\[data-unread="true"\]::after\s*\{[^}]*top: calc\(15% - 4px\);[^}]*right: calc\(15% - 4px\);/);
    expect(css).toContain('padding: 0 27px 0 43px !important;');
    expect(css).toContain('background-position: right 11px center !important;');
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
      expect(header).toContain('title="다크 모드"');
      expect(header).toContain('title="알림"');
      expect(header).toContain('title="마이페이지"');
      expect(header).toContain('title="언어 변경"');
      expect(header).not.toContain('data-unread="true"');
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

  it('draws all controls as equally sized vectors', async () => {
    const css = await read('shared-product-header.css');
    expect(css.match(/--mh-header-icon: url\("data:image\/svg\+xml,/g)).toHaveLength(5);
    expect(css).toContain('background: currentColor !important;');
    expect(css).not.toContain('header-bell-light.svg');
    expect(css).not.toContain('header-bell-dark.svg');
  });
});
