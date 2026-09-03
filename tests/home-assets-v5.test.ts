import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const hallPath = new URL('../apps/web/hall.html', import.meta.url);
const cssPath = new URL('../apps/web/home-assets-v5.css', import.meta.url);
const spritePath = new URL('../apps/web/home-v5-art-sprite.webp', import.meta.url);

describe('Home approved illustration assets v5', () => {
  it('loads the dedicated approved-art presentation layer after showcase v4', async () => {
    const html = await readFile(hallPath, 'utf8');
    const v4Index = html.indexOf('home-showcase-v4.css');
    const v5Index = html.indexOf('home-assets-v5.css');

    expect(v4Index).toBeGreaterThan(-1);
    expect(v5Index).toBeGreaterThan(v4Index);
  });

  it('uses the approved sprite for the orbit and all four topic motifs', async () => {
    const css = await readFile(cssPath, 'utf8');

    expect(css).toContain('--home-v5-sprite: url("home-v5-art-sprite.webp")');
    expect(css).toContain('.home-orbit-art');
    for (const motif of ['花', '山', '財', '命']) {
      expect(css).toContain(`.home-topic[data-motif="${motif}"]::before`);
    }
    expect(css).toContain('.home-person::after');
    expect(css).toContain('.product-footer::before');
    expect(css).toContain('.product-footer::after');
  });

  it('ships a real WebP asset rather than recreating the supplied illustrations as CSS geometry', async () => {
    const sprite = await readFile(spritePath);

    expect(sprite.byteLength).toBeGreaterThan(100_000);
    expect(sprite.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(sprite.subarray(8, 12).toString('ascii')).toBe('WEBP');
  });

  it('does not use artwork integration to fabricate personalized authority', async () => {
    const html = await readFile(hallPath, 'utf8');

    expect(html).not.toContain('오늘은 움직이기보다');
    expect(html).not.toContain('퇴사를 고민했던 이야기');
    expect(html).not.toContain('세연');
    expect(html).not.toContain('chat.html?character=');
  });
});
