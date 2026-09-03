import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const hallPath = new URL('../apps/web/hall.html', import.meta.url);
const cssPath = new URL('../apps/web/home-assets-v5.css', import.meta.url);
const assets = [
  'home-v5-orbit.webp',
  'home-v5-mountain.webp',
  'home-v5-wealth.webp',
  'home-v5-compass.webp',
  'home-v5-plum-corner.webp',
];

describe('Home approved illustration assets v5', () => {
  it('loads the approved-art presentation layer after showcase v4', async () => {
    const html = await readFile(hallPath, 'utf8');
    const v4Index = html.indexOf('home-showcase-v4.css');
    const v5Index = html.indexOf('home-assets-v5.css');

    expect(v4Index).toBeGreaterThan(-1);
    expect(v5Index).toBeGreaterThan(v4Index);
  });

  it('binds direct approved illustration assets instead of the rejected sprite', async () => {
    const css = await readFile(cssPath, 'utf8');

    for (const asset of assets) {
      expect(css).toContain(asset);
    }
    expect(css).not.toContain('home-v5-art-sprite.webp');
    expect(css).not.toContain('home-v5-plum.webp');
    for (const motif of ['花', '山', '財', '命']) {
      expect(css).toContain(`.home-topic[data-motif="${motif}"]::before`);
    }
  });

  it('ships independently decodable WebP artwork files', async () => {
    for (const asset of assets) {
      const bytes = await readFile(new URL(`../apps/web/${asset}`, import.meta.url));
      expect(bytes.byteLength).toBeGreaterThan(1_000);
      expect(bytes.subarray(0, 4).toString('ascii')).toBe('RIFF');
      expect(bytes.subarray(8, 12).toString('ascii')).toBe('WEBP');
    }
  });

  it('does not use artwork integration to fabricate personalized authority', async () => {
    const html = await readFile(hallPath, 'utf8');

    expect(html).not.toContain('오늘은 움직이기보다');
    expect(html).not.toContain('퇴사를 고민했던 이야기');
    expect(html).not.toContain('세연');
    expect(html).not.toContain('chat.html?character=');
  });
});
