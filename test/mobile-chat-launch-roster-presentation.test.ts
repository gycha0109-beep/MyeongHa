import { describe, expect, it } from 'vitest';

import { CHAT_LAUNCH_CHARACTER_IDS_V1 } from '../packages/api-client/src/chat.js';
import {
  MOBILE_CHAT_CHARACTER_PRESENTATION_BY_ID_V1,
} from '../apps/mobile/src/features/chat/chat-character-presentation.js';
import {
  MOBILE_CHAT_KNOWN_CHARACTERS_V1,
  MOBILE_CHAT_LAUNCH_ROSTER_V1,
} from '../apps/mobile/src/features/chat/chat-launch-roster.js';

describe('mobile chat Launch roster presentation', () => {
  it('keeps presentation metadata separate from the canonical launch authority list', () => {
    expect(MOBILE_CHAT_KNOWN_CHARACTERS_V1).toHaveLength(9);
    expect(MOBILE_CHAT_LAUNCH_ROSTER_V1).toHaveLength(6);
    expect(MOBILE_CHAT_KNOWN_CHARACTERS_V1.map((character) => character.characterId))
      .toEqual([...CHAT_LAUNCH_CHARACTER_IDS_V1]);
    expect(MOBILE_CHAT_LAUNCH_ROSTER_V1.map(({ characterId }) => characterId)).toEqual([
      'seyeon', 'yeoul', 'rahyeon', 'taegyeom', 'yunho', 'baekheon',
    ]);
    // The removed public pending section must not delete historical identities.
    for (const id of ['doyun', 'mira', 'seorin']) {
      expect(MOBILE_CHAT_KNOWN_CHARACTERS_V1.some(({ characterId }) => characterId === id)).toBe(true);
      expect(MOBILE_CHAT_LAUNCH_ROSTER_V1.some(({ characterId }) => characterId === id)).toBe(false);
    }
  });

  it('covers all nine approved character ids with complete card copy', () => {
    expect(Object.keys(MOBILE_CHAT_CHARACTER_PRESENTATION_BY_ID_V1))
      .toEqual([...CHAT_LAUNCH_CHARACTER_IDS_V1]);

    for (const character of MOBILE_CHAT_KNOWN_CHARACTERS_V1) {
      const presentation = MOBILE_CHAT_CHARACTER_PRESENTATION_BY_ID_V1[character.characterId];
      expect(presentation.title.trim()).not.toBe('');
      expect(presentation.openingLine.trim()).not.toBe('');
      expect(presentation.tags).toHaveLength(3);
      expect(presentation.tags.every((tag) => tag.trim().length > 0)).toBe(true);
    }
  });

  it('excludes dormant characters from every visible Chat Hub section without losing history identity resolution', async () => {
    const { readFile } = await import('node:fs/promises');
    const [hub, roster] = await Promise.all([
      readFile(new URL('../apps/mobile/src/app/(tabs)/chat/index.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../apps/mobile/src/features/chat/chat-launch-roster.ts', import.meta.url), 'utf8'),
    ]);
    expect(hub).toContain('MOBILE_CHAT_LAUNCH_ROSTER_V1.map');
    expect(hub).not.toContain('MOBILE_CHAT_PENDING_ROSTER_V1');
    expect(hub).not.toContain('styles.pendingSection');
    expect(hub).not.toContain('COMING SOON');
    expect(hub).not.toContain('연결자 등록 중');
    expect(roster).toContain('MOBILE_CHAT_PENDING_ROSTER_V1');
    expect(roster).toContain('MOBILE_CHAT_KNOWN_CHARACTERS_V1');
  });
});
