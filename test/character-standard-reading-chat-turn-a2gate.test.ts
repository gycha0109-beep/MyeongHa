import { describe, expect, it } from 'vitest';
import {
  prepareCharacterStandardReadingChatTurnPreflightV1,
} from '../apps/api/src/character-standard-reading-chat-turn-preflight.js';

describe('A3-gamma Reader follow-up Chat Product admission (public Chat OFF)', () => {
  it('fails closed before reading any receive plan when Product policy authority is absent', async () => {
    await expect(prepareCharacterStandardReadingChatTurnPreflightV1(
      {} as Parameters<typeof prepareCharacterStandardReadingChatTurnPreflightV1>[0],
    )).rejects.toThrow('Approved Product Reader policy authority is required');
  });
});
