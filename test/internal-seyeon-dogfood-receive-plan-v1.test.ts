import { describe, expect, it } from 'vitest';

import {
  assertServerPreparedChatReceivePlanV1,
  getServerPreparedChatReceiveContentEntryV1,
  prepareInternalPinnedSeyeonDogfoodReceivePlanV1,
} from '../apps/api/src/chat-receive.js';

function request(overrides: Record<string, unknown> = {}) {
  return {
    threadId: '11111111-1111-4111-8111-111111111111',
    characterId: 'seyeon',
    clientTurnId: 'dogfood-turn-1',
    text: '안녕하세요.',
    clientCapability: 'internal-dogfood-v1',
    ...overrides,
  };
}

const trustedThread = Object.freeze({
  threadId: '11111111-1111-4111-8111-111111111111',
  pinnedReleaseId: '22222222-2222-4222-8222-222222222222',
  participantCharacterIds: Object.freeze(['seyeon']),
});

describe('internal pinned Se-yeon dogfood receive plan V1', () => {
  it('mints a trusted existing-thread plan without claiming SRC-15 compatibility authority', () => {
    const plan = prepareInternalPinnedSeyeonDogfoodReceivePlanV1({
      request: request(),
      trustedThread,
      pinnedBundleId: '33333333-3333-4333-8333-333333333333',
      contentVersion: 'internal-pinned-content-v1',
    });

    expect(() => assertServerPreparedChatReceivePlanV1(plan)).not.toThrow();
    expect(plan).toEqual(expect.objectContaining({
      isNewThread: false,
      requestedCharacterId: 'seyeon',
      resolvedContent: {
        releaseId: trustedThread.pinnedReleaseId,
        bundleId: '33333333-3333-4333-8333-333333333333',
        contentVersion: 'internal-pinned-content-v1',
      },
    }));
    expect(() => getServerPreparedChatReceiveContentEntryV1(plan))
      .toThrow(/intentionally has no public client-compatibility/i);
  });

  it('rejects another Character and multi-character threads', () => {
    expect(() => prepareInternalPinnedSeyeonDogfoodReceivePlanV1({
      request: request({ characterId: 'yeoul' }),
      trustedThread,
      pinnedBundleId: '33333333-3333-4333-8333-333333333333',
      contentVersion: 'v1',
    })).toThrow(/another Character/i);

    expect(() => prepareInternalPinnedSeyeonDogfoodReceivePlanV1({
      request: request(),
      trustedThread: {
        ...trustedThread,
        participantCharacterIds: ['seyeon', 'yeoul'],
      },
      pinnedBundleId: '33333333-3333-4333-8333-333333333333',
      contentVersion: 'v1',
    })).toThrow(/single-character Se-yeon thread/i);
  });

  it('rejects new-thread and structured-action attempts', () => {
    const { threadId: _threadId, ...newThread } = request();
    expect(() => prepareInternalPinnedSeyeonDogfoodReceivePlanV1({
      request: newThread,
      trustedThread,
      pinnedBundleId: '33333333-3333-4333-8333-333333333333',
      contentVersion: 'v1',
    })).toThrow(/does not match the owned pinned thread/i);

    expect(() => prepareInternalPinnedSeyeonDogfoodReceivePlanV1({
      request: {
        threadId: trustedThread.threadId,
        characterId: 'seyeon',
        clientTurnId: 'dogfood-turn-2',
        structuredAction: {
          type: 'SELECT_SAJU_DOMAIN',
          domain: 'general',
        },
        clientCapability: 'internal-dogfood-v1',
      },
      trustedThread,
      pinnedBundleId: '33333333-3333-4333-8333-333333333333',
      contentVersion: 'v1',
    })).toThrow(/text turns only/i);
  });
});
