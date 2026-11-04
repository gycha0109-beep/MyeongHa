import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFile(new URL('../apps/web/' + path, import.meta.url), 'utf8');
const routes = ['hall', 'reading', 'face-reading', 'chat-hub', 'chat', 'records', 'my', 'reading-detail', 'auth', 'contact'];

describe('first-paint header controls', () => {
  it.each(routes)('%s pre-renders complete right-side controls before scripts load', async (page) => {
    const html = await read(page + '.html');
    const header = html.slice(html.indexOf('<header class="product-header'), html.indexOf('</header>'));
    expect(header).toContain('class="product-theme-toggle"');
    expect(header).toContain('class="product-theme-toggle-mark"');
    expect(header).toContain('class="product-report-link"');
    expect(header).toContain('href="contact.html?report=content"');
    expect(header).toContain('data-ui-locale-picker');
    expect(header).toContain('class="ui-locale-select"');
    expect(header.match(/<option value=/g)).toHaveLength(5);
    expect(header.indexOf('class="product-theme-toggle"')).toBeLessThan(header.indexOf('class="product-profile"'));
    expect(header.indexOf('class="product-report-link"')).toBeGreaterThan(header.indexOf('class="product-profile"'));
    expect(header.indexOf('class="ui-locale-picker"')).toBeLessThan(header.indexOf('class="product-profile"'));
  });

  it('hydrates the static controls and preserves legacy fallback and interaction', async () => {
    const [theme, locale, css] = await Promise.all([read('product-theme.js'), read('ui-i18n.js'), read('shared-product-header.css')]);
    expect(theme).toContain("utilities.querySelector('.product-theme-toggle')");
    expect(theme).toContain("button.dataset.themeBound !== 'true'");
    expect(theme).toContain("button.addEventListener('click'");
    expect(locale).toContain("existing.querySelector('.ui-locale-select')");
    expect(locale).toContain("select.addEventListener('change'");
    expect(locale).toContain("wrap.dataset.uiLocaleMounted = 'true'");
    expect(css).toContain('html { overflow-y: scroll; }');
    expect(css).not.toContain('scrollbar-gutter: stable both-edges;');
    expect(css).not.toContain('grid-template-columns: 205px minmax(335px, 1fr) max-content !important;\n/* First-paint geometry');
    expect(css).toContain('grid-template-columns: 205px minmax(335px, 1fr) 382px !important;');
    expect(css).toContain('background-position: -112px var(--mh-glyph-row) !important;');
    expect(theme).not.toContain("mark.textContent = dark ? '☀' : '☾'");
  });
});
