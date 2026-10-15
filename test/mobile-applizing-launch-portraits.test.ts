import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import {
  MOBILE_CHAT_KNOWN_CHARACTERS_V1,
  MOBILE_CHAT_LAUNCH_ROSTER_V1,
} from '../apps/mobile/src/features/chat/chat-launch-roster.js';

const ids = ['seyeon', 'yeoul', 'rahyeon', 'taegyeom', 'yunho', 'baekheon'] as const;

async function source(path: string): Promise<string> {
  return readFile(new URL('../' + path, import.meta.url), 'utf8');
}

describe('Mobile launch visibility, portrait assets and notification UI', () => {
  it('shows six launch Characters without deleting retired canonical identities', () => {
    expect(MOBILE_CHAT_LAUNCH_ROSTER_V1.map(({ characterId }) => characterId)).toEqual(ids);
    expect(MOBILE_CHAT_KNOWN_CHARACTERS_V1).toHaveLength(9);
    for (const id of ['seorin', 'mira', 'doyun']) {
      expect(MOBILE_CHAT_LAUNCH_ROSTER_V1.some(({ characterId }) => characterId === id)).toBe(false);
      expect(MOBILE_CHAT_KNOWN_CHARACTERS_V1.some(({ characterId }) => characterId === id)).toBe(true);
    }
  });

  it('keeps Reader history metadata while hiding delisted characters from the public picker', async () => {
    const [
      presentation,
      picker,
    ] = await Promise.all([
      import('../apps/mobile/src/features/reading/mobile-reader-presentation.js'),
      source('apps/mobile/src/features/reading/MobileReaderPicker.tsx'),
    ]);
    expect(presentation.MOBILE_READER_PRESENTATIONS_V1).toHaveLength(9);
    expect(presentation.MOBILE_READER_VISIBLE_LAUNCH_PRESENTATIONS_V1.map(({ key }) => key)).toEqual([
      'seyeon', 'baekheon', 'yeoul', 'rahyeon', 'taegyeom', 'yunho',
    ]);
    expect(picker).toContain('MOBILE_READER_VISIBLE_LAUNCH_PRESENTATIONS_V1.map');
  });

  it('keeps web discovery at six without deleting historical Character presentation source', async () => {
    const web = await source('apps/web/chat-hub.js');
    expect(web).toContain("key: 'seorin'");
    expect(web).toContain("key: 'mira'");
    expect(web).toContain("key: 'doyun'");
    expect(web).toContain("key !== 'seorin' && key !== 'mira' && key !== 'doyun'");
    expect(web).toContain('if (!searchTerm) return launchPeople;');
    expect(web).toContain('return launchPeople.filter(');
  });

  it('bundles real WebP portrait bytes for every launch Character', async () => {
    const resolver = await source('apps/mobile/src/features/chat/chat-character-portraits.ts');
    const hub = await source('apps/mobile/src/app/(tabs)/chat/index.tsx');
    const room = await source('apps/mobile/src/features/chat/ChatReadComponents.tsx');
    expect(hub).toContain('<Image');
    expect(hub).toContain('resolveMobileChatPortraitV1');
    expect(room).toContain('resolveMobileChatPortraitV1');
    for (const id of ids) {
      const portraitPath = `apps/mobile/assets/characters/${id}-portrait.webp`;
      expect(resolver).toContain(`/characters/${id}-portrait.webp`);
      const bytes = await readFile(new URL('../' + portraitPath, import.meta.url));
      expect(bytes.length).toBeGreaterThan(5_000);
      expect(bytes.toString('ascii', 0, 4)).toBe('RIFF');
      expect(bytes.toString('ascii', 8, 12)).toBe('WEBP');
    }
  });

  it('hides all My push registration controls but leaves the lifecycle service untouched', async () => {
    const my = await source('apps/mobile/src/app/(tabs)/my/index.tsx');
    const auth = await source('apps/mobile/src/features/my/use-mobile-member-auth.tsx');
    expect(my).not.toContain('MyPushNotifications');
    expect(my).not.toContain('useMobilePushV1');
    expect(my).toContain('<MyMemberAuthCard');
    expect(auth).toContain('nativeMobilePushServiceV1.prepareForSubjectChange');
    expect(auth).toContain('nativeMobilePushServiceV1.syncEnabledNoPrompt');
  });

  it('keeps guest launch previews independent from authenticated Chat send', async () => {
    const open = await source('apps/mobile/src/features/chat/mobile-chat-open-service.ts');
    const send = await source('apps/mobile/src/features/chat/mobile-chat-turn-send-service.ts');
    expect(open).toContain('withMemberBearer');
    expect(send).toContain("turn.characterId !== 'seyeon'");
    expect(send).toContain('withMemberBearer');
  });
});
