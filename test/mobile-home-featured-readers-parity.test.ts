import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import { MOBILE_READER_VISIBLE_LAUNCH_PRESENTATIONS_V1 } from '../apps/mobile/src/features/reading/mobile-reader-presentation.js';

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

describe('mobile Home Reader introduction follows the current Web featured trio', () => {
  it('shows only Seyeon, Baekheon, and Yeoul without including dormant identities', async () => {
    const [web, native] = await Promise.all([
      read('apps/web/src/home/HomePage.tsx'),
      read('apps/mobile/src/features/home/HomeCharacterFeature.tsx'),
    ]);
    expect(web).toContain("const featuredReaders = ['seyeon', 'baekheon', 'yeoul']");
    expect(native).toContain("resolveMobileChatPortraitV1('seyeon')");
    expect(native).toContain("key === 'baekheon' || key === 'yeoul'");
    expect(native).toContain('resolveMobileChatPortraitV1(reader.key)');
    expect(MOBILE_READER_VISIBLE_LAUNCH_PRESENTATIONS_V1
      .filter(({key}) => key === 'baekheon' || key === 'yeoul')
      .map(({key}) => key)).toEqual(['baekheon','yeoul']);
    for (const id of ['doyun','mira','seorin']) {
      expect(MOBILE_READER_VISIBLE_LAUNCH_PRESENTATIONS_V1.some(r => r.key === id)).toBe(false);
    }
  });

  it('keeps featured cards as presentation and navigates via Chat Hub rather than opening an unauthorized Thread', async () => {
    const native = await read('apps/mobile/src/features/home/HomeCharacterFeature.tsx');
    expect(native).toContain('MOBILE_READER_VISIBLE_LAUNCH_PRESENTATIONS_V1.filter');
    expect(native).toContain("onPress={() => router.push('/chat')}");
    expect(native).toContain('accessibilityRole="button"');
    expect(native).not.toContain('openCharacter(');
    expect(native).not.toContain('memberSession');
    expect(native).not.toContain('fetch(');
    expect(native).not.toContain('https://');
  });
});
