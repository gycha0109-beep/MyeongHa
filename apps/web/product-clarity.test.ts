import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(process.cwd(), 'apps/web/product-clarity.css'), 'utf8');

function hexDeclaration(selector: string, name: string): string {
  const marker = `${selector} {`;
  const start = css.indexOf(marker);
  if (start === -1) throw new Error(`Missing CSS selector: ${selector}`);
  const end = css.indexOf('}', start);
  const block = css.slice(start + marker.length, end);
  const declaration = block.match(new RegExp(`(?:^|;)\\s*${name}:\\s*(#[0-9a-f]{6})\\s*(?:;|$)`, 'i'));
  const value = declaration?.[1];
  if (!value) throw new Error(`Missing hex declaration: ${selector} / ${name}`);
  return value;
}

function relativeLuminance(hex: string): number {
  const channel = (offset: number): number => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return channel(1) * 0.2126 + channel(3) * 0.7152 + channel(5) * 0.0722;
}

function contrastRatio(foreground: string, background: string): number {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

describe('Product reading clarity', () => {
  it('keeps muted copy readable on both canonical light/dark surfaces', () => {
    const lightText = hexDeclaration(':root', '--mh-copy-muted');
    const darkText = hexDeclaration('html[data-theme="dark"]', '--mh-copy-muted');
    expect(contrastRatio(lightText, '#f7f0e7')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(darkText, '#393038')).toBeGreaterThanOrEqual(4.5);
    expect(css).toContain('font-size: max(14px, .875rem);');
  });

  it('keeps previously tone-on-tone controls and Saju badge legible', () => {
    const inactiveDarkTab = 'html[data-theme="dark"] body.product-page .saju-design-chart-tabs button:not(.is-selected)';
    const badge = 'body.product-page .saju-design-example h2 span';
    const darkBadge = 'html[data-theme="dark"] body.product-page .saju-design-example h2 span';
    const darkAction = 'html[data-theme="dark"] body.product-page .saju-design-product-card a';
    expect(contrastRatio(hexDeclaration(inactiveDarkTab, 'color'), hexDeclaration(inactiveDarkTab, 'background'))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(hexDeclaration(badge, 'color'), hexDeclaration(badge, 'background'))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(hexDeclaration(badge, 'color'), hexDeclaration(darkBadge, 'background'))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(hexDeclaration(darkAction, 'color'), hexDeclaration(darkAction, 'background'))).toBeGreaterThanOrEqual(4.5);
  });
});
