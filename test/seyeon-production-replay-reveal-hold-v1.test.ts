import { describe, expect, it } from 'vitest';
import {
  resolveSeyeonProductionCommittedReplayV1,
  SeyeonProductionChatExecutionErrorV1,
  SeyeonCommittedReplayRevealHoldV1,
  type SeyeonProductionChatReceivedTurnV1,
} from '../apps/api/src/seyeon-production-chat-execution-v1.js';

const secret = 'UNAUTHORIZED_PRIOR_ASSISTANT_PRIVATE_CANARY';

function received(
  turnState: string,
  replayed = true,
  committedTurn: SeyeonProductionChatReceivedTurnV1['committedTurn'] = {
    attemptId: 'attempt-old',
    assistantMessageId: 'assistant-old',
    assistantText: secret,
    sequenceNo: 3,
    committedAt: '2026-10-16T00:00:00.000Z',
  },
): SeyeonProductionChatReceivedTurnV1 {
  return {
    turnId: 'turn-old',
    userMessageId: 'user-old',
    userText: 'prior turn',
    threadCharacterId: 'thread-character',
    contentReleaseId: 'release',
    contentBundleId: 'bundle',
    turnState,
    committedTurn,
    replayed,
  };
}

describe('Se-yeon Production committed replay Reveal HOLD', () => {
  it.each(['committed', 'delivered'])(
    'does not re-expose %s assistant bytes without current authority',
    (state) => {
      const candidate = received(state);
      expect(() => resolveSeyeonProductionCommittedReplayV1(candidate))
        .toThrow(SeyeonProductionChatExecutionErrorV1);
      try {
        resolveSeyeonProductionCommittedReplayV1(candidate);
        throw new Error('Expected replay hold');
      } catch (error) {
        expect(error).toBeInstanceOf(SeyeonCommittedReplayRevealHoldV1);
        expect((error as SeyeonCommittedReplayRevealHoldV1).code)
          .toBe('SEYEON_REPLAY_REVEAL_HOLD');
        expect((error as Error).message).toContain('requires current source authorization');
        expect((error as Error).message).not.toContain(secret);
      }
    },
  );

  it('does not treat newly issued consent or a persisted old answer as current Reveal authority', () => {
    for (const state of ['committed', 'delivered']) {
      expect(() => resolveSeyeonProductionCommittedReplayV1(
        received(state, true, {
          attemptId: 'revoked-old-attempt',
          assistantMessageId: 'old-assistant',
          assistantText: 'OLD_GRANT_PRIVATE_REPLAY_CANARY',
          sequenceNo: 1,
          committedAt: '2026-10-15T00:00:00.000Z',
        }),
      )).toThrow('requires current source authorization');
    }
  });

  it('preserves the missing-material and terminal-state rejection boundaries', () => {
    expect(() => resolveSeyeonProductionCommittedReplayV1(
      received('committed', true, null),
    )).toThrow('missing authoritative assistant material');
    for (const state of ['failed_final', 'abandoned']) {
      expect(() => resolveSeyeonProductionCommittedReplayV1(
        received(state),
      )).toThrow('Terminal Chat replay');
    }
  });

  it('does not claim a non-replay or pending retry was already revealed', () => {
    expect(resolveSeyeonProductionCommittedReplayV1(
      received('committed', false),
    )).toBeNull();
    expect(resolveSeyeonProductionCommittedReplayV1(
      received('context_ready'),
    )).toBeNull();
  });
});
