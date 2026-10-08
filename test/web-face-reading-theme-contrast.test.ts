import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const pagePath = new URL('../apps/web/face-reading.html', import.meta.url);
const faceCssPath = new URL('../apps/web/face-reading.css', import.meta.url);
const themeJsPath = new URL('../apps/web/product-theme.js', import.meta.url);

describe('Face Reading light/dark theme contrast', () => {
  it('uses the common product theme selector and loads page styles after it', async () => {
    const [page, themeRuntime] = await Promise.all([
      readFile(pagePath, 'utf8'),
      readFile(themeJsPath, 'utf8'),
    ]);
    expect(page.indexOf('href="face-reading.css"')).toBeGreaterThan(page.indexOf('href="product-theme.css"'));
    expect(page).toContain('class="product-page face-reading-page"');
    expect(themeRuntime).toContain('root.dataset.theme = theme');
  });

  it('gives each light-mode surface its own readable foreground and background', async () => {
    const css = await readFile(faceCssPath, 'utf8');
    expect(css).toContain('html[data-theme="light"] body.face-reading-page {');
    expect(css).toContain('--face-ivory: #252c30;');
    expect(css).toContain('--face-muted: #536067;');

    for (const selector of [
      '.face-hero',
      '.face-hero h1',
      '.face-hero-copy > strong',
      '.face-reader-bar',
      '.face-reader-heading strong',
      '.face-workspace',
      '.face-control h2',
      '.face-guide-list',
      '.face-secondary',
      '.face-status strong',
      '.face-flow-grid article',
      '.face-flow-grid article > strong',
      '.reading-reader-picker',
      '.reading-reader-picker-intro h2',
      '.reading-reader-option.is-selected',
      '.face-reader-picker-search',
      '.mobile-bottom-nav',
    ]) {
      expect(css).toContain(`html[data-theme="light"] body.face-reading-page ${selector}`);
    }
  });

  it('uses a light photo stage without changing the dark stage or upload behavior', async () => {
    const css = await readFile(faceCssPath, 'utf8');
    const page = await readFile(pagePath, 'utf8');

    expect(css).toContain('linear-gradient(145deg,#09181e,#0a2027)');
    for (const selector of [
      '.face-preview-panel',
      '.face-preview',
      '.face-preview img',
      '.face-placeholder > b',
      '.face-placeholder small',
      '.face-guide',
      '.face-guide::before',
      '.face-preview-meta',
    ]) {
      expect(css).toContain(`html[data-theme="light"] body.face-reading-page ${selector}`);
    }
    expect(css).toContain('linear-gradient(180deg, #f8f5ee, #ede8de)');
    expect(page).toContain('data-face-preview');
    expect(page).toContain('data-face-image');
    expect(css).toContain('.face-reader-picker .reading-reader-option[hidden]');
    expect(css).toContain('.face-reading-page .reading-reader-option.is-selected');
    expect(css).toContain('.face-primary { border:1px solid #d8aa61');
  });
});
