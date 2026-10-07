import { describe, expect, it } from 'vitest';

import { CHAT_LAUNCH_CHARACTER_IDS_V1 } from '../packages/api-client/src/chat.js';
import {
  MOBILE_CHAT_CHARACTER_PRESENTATION_BY_ID_V1,
} from '../apps/mobile/src/features/chat/chat-character-presentation.js';
import {
  MOBILE_CHAT_LAUNCH_ROSTER_V1,
} from '../apps/mobile/src/features/chat/chat-launch-roster.js';

describe('mobile chat Launch roster presentation', () => {
  it('keeps presentation metadata separate from the canonical launch authority list', () => {
    expect(MOBILE_CHAT_LAUNCH_ROSTER_V1).toHaveLength(9);
    expect(MOBILE_CHAT_LAUNCH_ROSTER_V1.map((character) => character.characterId))
      .toEqual([...CHAT_LAUNCH_CHARACTER_IDS_V1]);
  });

  it('covers all nine approved character ids with complete card copy', () => {
    expect(Object.keys(MOBILE_CHAT_CHARACTER_PRESENTATION_BY_ID_V1))
      .toEqual([...CHAT_LAUNCH_CHARACTER_IDS_V1]);

    for (const character of MOBILE_CHAT_LAUNCH_ROSTER_V1) {
      const presentation = MOBILE_CHAT_CHARACTER_PRESENTATION_BY_ID_V1[character.characterId];
      expect(presentation.title.trim()).not.toBe('');
      expect(presentation.openingLine.trim()).not.toBe('');
      expect(presentation.tags).toHaveLength(3);
      expect(presentation.tags.every((tag) => tag.trim().length > 0)).toBe(true);
    }
  });
});
