import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = resolve(process.cwd(), 'apps/web');
const readWeb = (name: string) => readFileSync(resolve(webRoot, name), 'utf8');

describe('Home/Saju shared product header', () => {
  const shared = readWeb('shared-product-header.css');
  const lock = readWeb('golden-master-lock.css');
  const golden = readWeb('golden-master.css');
  const authUi = readWeb('product-auth-ui.js');

  it('uses the same authoritative header geometry on every product page, not a Golden Master mini header', () => {
    expect(shared).toContain('--mh-header-height-desktop: 92px;');
    expect(shared).toContain('--mh-header-height-mobile: 86px;');
    expect(shared).toContain('height: var(--mh-header-height-desktop);');
    expect(shared).toContain('width: min(var(--mh-max), calc(100% - 64px));');
    expect(shared).toContain('grid-template-columns: 205px minmax(335px, 1fr) max-content !important;');
    expect(shared).toContain('body.product-page .product-header .product-nav { height: 100%; }');
    expect(shared).toContain('body.product-page .product-header .product-brand-seal');
    expect(shared).toContain('display: grid !important;');
    expect(lock).not.toMatch(/body\.gm-page \.product-(?:header|nav|brand|profile|theme-toggle)/);
    expect(golden).not.toMatch(/body\.gm-page \.product-(?:header|nav|brand|profile|theme-toggle)/);
  });

  it('keeps the desktop profile/login link visible under the common header rule', () => {
    expect(shared).toContain('body.product-page .product-header .product-profile {');
    expect(shared).toContain('display: inline-flex !important;');
    expect(shared).toContain('body.product-page .product-header .product-profile { display: none !important; }');
    expect(authUi).toContain("profile.href = `auth.html?next=${encodeURIComponent(safeNextHref())}`;");
    expect(authUi).toContain("profile.setAttribute('aria-label', '로그인');");
    expect(authUi).toContain("label.textContent = '로그인';");
  });

  it.each(['hall.html', 'reading.html'])('%s uses the same header shell/brand contract as Chat', (page) => {
    const html = readWeb(page);
    expect(html).toContain('<header class="product-header">');
    expect(html).toContain('<div class="product-shell product-header-inner">');
    expect(html).toContain('<span class="product-brand-sub">MyeongHa</span>');
    expect(html).toContain('class="product-profile"');
    expect(html).toContain('<script src="product-theme.js"></script>');
    expect(html).toContain('href="shared-product-header.css"');
    expect(html.indexOf('shared-product-header.css')).toBeGreaterThan(html.indexOf('ui-i18n.css'));
  });
});
