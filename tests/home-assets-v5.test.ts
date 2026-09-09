import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const hallPath = new URL('../apps/web/hall.html', import.meta.url);
const goldenPath = new URL('../apps/web/golden-master.css', import.meta.url);
const lockPath = new URL('../apps/web/golden-master-lock.css', import.meta.url);
const assets = [
  'home-v5-orbit.webp',
  'home-v5-mountain.webp',
  'home-v5-wealth.webp',
  'home-v5-compass.webp',
  'home-v5-plum-corner.webp',
];

describe('Home approved illustration assets — Golden Master', () => {
  it('loads the Golden Master presentation layer after the shared product system', async () => {
    const html = await readFile(hallPath, 'utf8');
    const productIndex = html.indexOf('product.css');
    const goldenIndex = html.indexOf('golden-master.css');

    expect(productIndex).toBeGreaterThan(-1);
    expect(goldenIndex).toBeGreaterThan(productIndex);
    expect(html).not.toContain('home-showcase-v4.css');
    expect(html).not.toContain('home-assets-v5.css');
  });

  it('uses approved artwork without assigning a browser-inferred Character identity', async () => {
    const [golden, lock] = await Promise.all([
      readFile(goldenPath, 'utf8'),
      readFile(lockPath, 'utf8'),
    ]);

    expect(golden).toContain('home-v5-plum-corner.webp');
    expect(golden).toContain('home-v5-compass.webp');
    expect(lock).toContain('home-v5-orbit.webp');
    expect(lock).toContain('identity-neutral approved artwork');
  });

  it('ships independently decodable approved WebP artwork files', async () => {
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
    expect(html).toContain('오늘 이야기할 사람');
    expect(html).toContain('캐릭터 선택');
  });
});
