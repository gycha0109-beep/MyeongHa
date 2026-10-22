import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import {
  MOBILE_CHAT_LAUNCH_ROSTER_V1,
  MOBILE_CHAT_PENDING_ROSTER_V1,
} from '../apps/mobile/src/features/chat/chat-launch-roster.js';

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

describe('premium mobile Home and character roster', () => {
  it('uses only the bundled canonical portrait resolver in the Home hero', async () => {
    const home = await read('apps/mobile/src/app/(tabs)/index.tsx');
    const hero = await read('apps/mobile/src/features/home/HomeCharacterFeature.tsx');
    expect(home).toContain('<HomeCharacterFeature />');
    expect(home).toContain('<HomeTodayCard card={view.today} />');
    expect(home).toContain('<MobileFortuneCookie />');
    expect(hero).toContain("resolveMobileChatPortraitV1('seyeon')");
    expect(hero).toContain("router.push('/chat')");
    expect(hero).toContain("router.push('/reading')");
    expect(hero).toContain("router.push('/records')");
    expect(hero).not.toMatch(/https?:\/\//);
    expect(hero).not.toContain('AI 대화 가능');
    expect(hero).toContain('대화 가능 여부와 기록 접근');
  });

  it('renders the approved six launch characters with real registered portraits', async () => {
    const hub = await read('apps/mobile/src/app/(tabs)/chat/index.tsx');
    const portraits = await read('apps/mobile/src/features/chat/chat-character-portraits.ts');
    expect(MOBILE_CHAT_LAUNCH_ROSTER_V1.map(x => x.characterId)).toEqual([
      'seyeon', 'yeoul', 'rahyeon', 'taegyeom', 'yunho', 'baekheon',
    ]);
    for (const character of MOBILE_CHAT_LAUNCH_ROSTER_V1) {
      expect(portraits).toContain(`${character.characterId}-portrait.webp`);
    }
    expect(hub).toContain('MOBILE_CHAT_LAUNCH_ROSTER_V1.map');
    expect(hub).toContain('resolveMobileChatPortraitV1(character.characterId)');
    expect(hub).toContain("const featured = character.characterId === 'seyeon'");
    expect(hub).toContain('style={styles.characterPortrait}');
    expect(hub).not.toContain('AI 대화 가능');
    expect(hub).toContain('이용 상태는 대화방에서 확인');
  });

  it('preserves member gating, pending identities and server-only Chat Open', async () => {
    const hub = await read('apps/mobile/src/app/(tabs)/chat/index.tsx');
    expect(hub).toContain("const canOpen = state.access === 'member'");
    expect(hub).toContain("const disabled = !canOpen");
    expect(hub).toContain('disabled={disabled}');
    expect(hub).toContain("state.access === 'guest'");
    expect(hub).toContain("router.push('/my')");
    expect(hub).toContain('MOBILE_CHAT_PENDING_ROSTER_V1.map');
    expect(hub).toContain('연결자 등록 중');
    expect(MOBILE_CHAT_PENDING_ROSTER_V1.map(x => x.characterId)).toEqual([
      'doyun', 'seorin', 'mira',
    ]);
    expect(hub).not.toContain('fetch(');
    expect(hub).not.toContain('SecureStore');
  });

  it('styles each theme without shipping mockup-generated characters', async () => {
    const hero = await read('apps/mobile/src/features/home/HomeCharacterFeature.tsx');
    const hub = await read('apps/mobile/src/app/(tabs)/chat/index.tsx');
    expect(hero).toContain('useMobileTheme()');
    expect(hub).toContain('useMobileThemedStyles(staticStyles)');
    expect(hero).not.toContain('.png');
    expect(hub).not.toContain('.png');
  });
});
