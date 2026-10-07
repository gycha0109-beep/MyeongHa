import { describe, expect, it } from 'vitest';

import { CHAT_LAUNCH_CHARACTER_IDS_V1 } from '../packages/api-client/src/chat.js';
import { MOBILE_CHAT_LAUNCH_ROSTER_V1 } from '../apps/mobile/src/features/chat/chat-launch-roster.js';

describe('mobile chat Launch roster presentation', () => {
  it('renders the exact approved nine Launch Character IDs in canonical order', () => {
    expect(MOBILE_CHAT_LAUNCH_ROSTER_V1.map((character) => character.characterId))
      .toEqual([...CHAT_LAUNCH_CHARACTER_IDS_V1]);
    expect(MOBILE_CHAT_LAUNCH_ROSTER_V1).toHaveLength(9);
  });

  it('gives every mobile character card complete presentation copy', () => {
    for (const character of MOBILE_CHAT_LAUNCH_ROSTER_V1) {
      expect(character.displayName.trim()).not.toBe('');
      expect(character.title.trim()).not.toBe('');
      expect(character.openingLine.trim()).not.toBe('');
      expect(character.tags).toHaveLength(3);
      expect(character.tags.every((tag) => tag.trim().length > 0)).toBe(true);
    }
  });

  it('pins the approved display-name roster', () => {
    expect(MOBILE_CHAT_LAUNCH_ROSTER_V1.map((character) => character.displayName)).toEqual([
      '세연',
      '여울',
      '서린',
      '라현',
      '미라',
      '태겸',
      '윤호',
      '도윤',
      '백헌',
    ]);
  });
});
