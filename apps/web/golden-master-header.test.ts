import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = resolve(process.cwd(), 'apps/web');
const readWeb = (name: string) => readFileSync(resolve(webRoot, name), 'utf8');

describe('Home/Saju shared product header', () => {
  const lock = readWeb('golden-master-lock.css');
  const authUi = readWeb('product-auth-ui.js');

  it('restores the shared desktop header geometry instead of the Golden Master mini header', () => {
    expect(lock).toMatch(/@media \(min-width: 768px\)[\s\S]*body\.gm-page \.product-header-inner \{[\s\S]*width: min\(var\(--mh-max\), calc\(100% - 64px\)\);[\s\S]*margin: 0 auto;[\s\S]*min-height: 92px;/);
    expect(lock).toMatch(/@media \(min-width: 1100px\)[\s\S]*grid-template-columns: 220px minmax\(420px, 1fr\) 220px;/);
    expect(lock).toMatch(/body\.gm-page \.product-nav \{[\s\S]*height: 92px;/);
    expect(lock).toMatch(/body\.gm-page \.product-brand-seal \{[\s\S]*display: grid;/);
  });

  it('keeps the shared profile/login control visible on desktop Golden Master pages', () => {
    expect(lock).toMatch(/@media \(min-width: 768px\)[\s\S]*body\.gm-page \.product-profile \{[\s\S]*display: inline-flex;/);
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
  });
});
