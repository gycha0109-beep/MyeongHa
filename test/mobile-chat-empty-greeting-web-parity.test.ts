import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { MOBILE_CHAT_LAUNCH_ROSTER_V1 } from '../apps/mobile/src/features/chat/chat-launch-roster.js';
import { resolveMobileChatCharacterPresentationV1 } from '../apps/mobile/src/features/chat/chat-character-presentation.js';
import { projectMobileChatEmptyGreetingV1 } from '../apps/mobile/src/features/chat/mobile-chat-empty-greeting.js';
import type { MobileChatEmptyGreetingInputV1 } from '../apps/mobile/src/features/chat/mobile-chat-empty-greeting.js';

function snapshot(overrides: Partial<MobileChatEmptyGreetingInputV1> = {}): MobileChatEmptyGreetingInputV1 {
  return {
    status: 'ready',
    characterId: 'seyeon',
    messages: [],
    hasMore: false,
    ...overrides,
  };
}

describe('mobile Character Room verified-empty greeting matches web', () => {
  it('shows each canonical Character greeting for an authenticated, server-verified empty room', async () => {
    const webRoster = await readFile(new URL('../apps/web/chat-hub.js', import.meta.url), 'utf8');
    for (const character of MOBILE_CHAT_LAUNCH_ROSTER_V1) {
      const expected = resolveMobileChatCharacterPresentationV1(character.characterId);
      const result = projectMobileChatEmptyGreetingV1(snapshot({
        characterId: character.characterId,
      }));
      expect(result).toEqual({
        characterId: character.characterId,
        displayName: character.displayName,
        openingLine: expected.openingLine,
      });
      expect(webRoster).toContain(expected.openingLine);
      expect(Object.isFrozen(result)).toBe(true);
    }
  });

  it('never substitutes a greeting for loading, error, unknown ownership or paged history', () => {
    for (const state of [
      snapshot({ status: 'idle' }),
      snapshot({ status: 'loading_initial' }),
      snapshot({ status: 'loading_more' }),
      snapshot({ status: 'error' }),
      snapshot({ characterId: null }),
      snapshot({ characterId: 'not-a-launch-character' }),
      snapshot({ hasMore: true }),
      snapshot({ messages: [{}] as unknown as MobileChatEmptyGreetingInputV1['messages'] }),
    ]) {
      expect(projectMobileChatEmptyGreetingV1(state)).toBeNull();
    }
  });

  it('renders only an ephemeral introduction and preserves guarded existing Chat open/send and Reader HOLD', async () => {
    const read = (path: string) => readFile(new URL('../' + path, import.meta.url), 'utf8');
    const [components, hub, serverOpen, readRoom, readerEntry, webRuntime] = await Promise.all([
      read('apps/mobile/src/features/chat/ChatReadComponents.tsx'),
      read('apps/mobile/src/app/(tabs)/chat/index.tsx'),
      read('apps/mobile/src/features/chat/mobile-chat-open-service.ts'),
      read('apps/mobile/src/features/chat/use-mobile-chat-thread.tsx'),
      read('apps/mobile/src/features/reading/MobileOfficialReadingReaderEntry.tsx'),
      read('apps/web/chat-runtime-client.js'),
    ]);
    expect(webRuntime).toContain('chatStream.replaceChildren(chatIntro)');
    expect(webRuntime).toContain('void ensureRoomReady()');
    expect(components).toContain('projectMobileChatEmptyGreetingV1(snapshot)');
    expect(components).toContain('{greeting.openingLine}');
    expect(components).toContain('const allowed = ready && seyeon');
    expect(hub).toContain('const result = await openCharacter(characterId)');
    expect(serverOpen).toContain('openMemberCharacterThreadV1');
    expect(serverOpen).toContain('withMemberBearer');
    expect(readRoom).toContain("if (current.status !== 'ready' || current.characterId !== 'seyeon') return");
    expect(readerEntry).toContain('Reader 해설 진입 비활성');
    expect(components).not.toContain('openMemberCharacterThreadV1');
    expect(components).not.toContain('officialReadingId');
  });
});
