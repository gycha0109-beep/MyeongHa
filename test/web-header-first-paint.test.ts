import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFile(new URL('../apps/web/' + path, import.meta.url), 'utf8');
const routes = ['hall','reading','face-reading','chat-hub','chat','records','my','reading-detail','auth','contact'];

describe('first-paint header controls', () => {
  it.each(routes)('%s pre-renders theme, notification, My icon, and globe select in order', async (page) => {
    const html = await read(page + '.html');
    const header = html.slice(html.indexOf('<header class="product-header'),html.indexOf('</header>'));
    const controls = ['product-theme-toggle','product-icon-button','product-profile','ui-locale-picker'];
    const indices = controls.map(name => header.indexOf('class="' + name + '"'));
    expect(indices.every((value,index) => value >= 0 && (index===0 || value>indices[index-1]!))).toBe(true);
    expect(header).toContain('class="product-theme-toggle-mark"');
    expect(header).toContain('class="ui-locale-select"');
    for (const tooltip of ['다크 모드', '알림', '마이페이지', '언어 변경']) {
      expect(header).toContain('title="' + tooltip + '"');
    }
    expect(header.match(/<option value=/g)).toHaveLength(5);
    expect(header).not.toContain('product-report-link');
    expect(header).not.toMatch(/<span(?: id="home-profile-name")?>마이<\/span>/);
  });
  it('hydrates theme and locale while keeping first-paint positions stable', async () => {
    const [theme,locale,css] = await Promise.all([read('product-theme.js'),read('ui-i18n.js'),read('shared-product-header.css')]);
    expect(theme).toContain("utilities.querySelector('.product-theme-toggle')");
    expect(theme).toContain("button.dataset.themeBound !== 'true'");
    expect(theme).toContain("button.addEventListener('click'");
    expect(locale).toContain("existing.querySelector('.ui-locale-select')");
    expect(locale).toContain("select.addEventListener('change'");
    expect(locale).toContain("wrap.dataset.uiLocaleMounted = 'true'");
    expect(css).toContain('html { overflow-y: scroll; }');
    expect(css).not.toContain('scrollbar-gutter: stable both-edges;');
    expect(css).toContain('grid-template-columns: 205px minmax(335px, 1fr) 274px !important;');
    expect(css).toContain('background-position: -28px var(--mh-glyph-row) !important;');
    expect(css).toContain('background-image: url("assets/header/header-bell-light.svg") !important;');
    expect(css).toContain('background-image: url("assets/header/header-bell-dark.svg") !important;');
    expect(css).not.toContain('translate(calc(-50% + 3px), -50%)');
    expect(theme).not.toContain("mark.textContent = dark ? '☀' : '☾'");
  });
});
