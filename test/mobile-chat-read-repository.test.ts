import { describe, expect, it } from 'vitest';
import { MyeongHaApiClientErrorV1 } from '../packages/api-client/src/http.js';

import {
  MobileChatReadRepositoryErrorV1,
  createMobileChatReadRepositoryV1,
} from '../apps/mobile/src/features/chat/mobile-chat-read-repository.js';
import type { MobileChatReadServiceV1 } from '../apps/mobile/src/features/chat/mobile-chat-read-service.js';

const threadId = '123e4567-e89b-42d3-a456-426614174000';

function msg(sequenceNo: number) {
  return {
    messageId: `message-${sequenceNo}`,
    sequenceNo,
    senderType: 'character' as const,
    characterId: 'baekheon',
    bodyText: `body ${sequenceNo}`,
    messagePayloadJsonb: null,
    messageSchemaVersion: null,
    createdAt: '2026-09-29T00:00:00.000Z',
    redacted: false,
    redactedAt: null,
  };
}

function threadPage(afterSequenceNo: number, messages: readonly ReturnType<typeof msg>[], hasMore: boolean) {
  const lastSequenceNo = messages.at(-1)?.sequenceNo ?? afterSequenceNo;
  return {
    threadId,
    characterId: 'baekheon',
    contentReleaseId: 'release-1',
    contentBundleId: 'bundle-1',
    contentRevision: 1,
    afterSequenceNo,
    lastSequenceNo,
    messages,
    pagination: {
      pageSize: 2,
      hasMore,
      nextAfterSequenceNo: hasMore ? lastSequenceNo : null,
    },
    latestCharacterMessage: messages.at(-1) ?? null,
    relationship: null,
  };
}

describe('mobile Chat read repository', () => {
  it('appends forward stream pages in canonical sequence order', async () => {
    const calls: number[] = [];
    const service: MobileChatReadServiceV1 = {
      async readThreadPage(_threadId, options = {}) {
        const after = options.afterSequenceNo ?? 0;
        calls.push(after);
        return after === 0
          ? threadPage(0, [msg(1), msg(2)], true)
          : threadPage(2, [msg(3)], false);
      },
    };
    const repository = createMobileChatReadRepositoryV1({
      threadId,
      service,
      pageSize: 2,
    });

    await repository.loadInitial();
    const final = await repository.loadMore();

    expect(calls).toEqual([0, 2]);
    expect(final.messages.map((item) => item.sequenceNo)).toEqual([1, 2, 3]);
    expect(final.hasMore).toBe(false);
  });

  it('discards earlier transcript and Relationship metadata if later pagination returns G3 HOLD', async () => {
    const calls: number[] = [];
    const privateCanary = 'FORMER_SEYEON_DERIVED_PRIVATE_CONTENT';
    const service: MobileChatReadServiceV1 = {
      async readThreadPage(_threadId, options = {}) {
        const after = options.afterSequenceNo ?? 0;
        calls.push(after);
        if (after !== 0) {
          throw new MyeongHaApiClientErrorV1(
            'http', 'SEYEON_HISTORY_REVEAL_HOLD',
            'Authoritative history rights unavailable.', 503, false,
          );
        }
        return {
          ...threadPage(0, [{ ...msg(1), bodyText: privateCanary }, msg(2)], true),
          relationship: {
            stateId: 'state-private',
            characterId: 'baekheon',
            closeness: 12,
            trust: 13,
            friction: 0,
            relationshipStage: 'private-stage',
            policyVersion: 'v1',
            revision: 1,
            lastInteractionAt: null,
            updatedAt: '2026-10-29T00:00:00.000Z',
          },
        };
      },
    };
    const repository = createMobileChatReadRepositoryV1({ threadId, service, pageSize: 2 });
    const first = await repository.loadInitial();
    expect(first.messages[0]?.bodyText).toBe(privateCanary);
    expect(first.relationship?.stateId).toBe('state-private');
    await expect(repository.loadMore()).rejects.toMatchObject({
      code: 'SEYEON_HISTORY_REVEAL_HOLD',
    });
    const held = repository.getSnapshot();
    expect(held).toMatchObject({
      status: 'error',
      errorCode: 'SEYEON_HISTORY_REVEAL_HOLD',
      threadId,
      characterId: null,
      relationship: null,
      hasMore: false,
      nextAfterSequenceNo: null,
      contentReleaseId: null,
      contentBundleId: null,
      contentRevision: null,
      messages: [],
    });
    expect(JSON.stringify(held)).not.toContain(privateCanary);
    expect(JSON.stringify(held)).not.toContain('state-private');
    const after = await repository.loadMore();
    expect(after).toBe(held);
    expect(calls).toEqual([0, 2]);
  });

  it('keeps previously verified pages for ordinary transient continuation errors', async () => {
    const service: MobileChatReadServiceV1 = {
      async readThreadPage(_threadId, options = {}) {
        const after = options.afterSequenceNo ?? 0;
        if (after !== 0) {
          throw new MyeongHaApiClientErrorV1(
            'network', 'API_NETWORK_ERROR', 'Temporary transport loss.',
          );
        }
        return threadPage(0, [msg(1), msg(2)], true);
      },
    };
    const repository = createMobileChatReadRepositoryV1({ threadId, service, pageSize: 2 });
    await repository.loadInitial();
    await expect(repository.loadMore()).rejects.toMatchObject({
      code: 'API_NETWORK_ERROR',
    });
    const transient = repository.getSnapshot();
    expect(transient.status).toBe('error');
    expect(transient.errorCode).toBe('API_NETWORK_ERROR');
    expect(transient.messages.map(message => message.sequenceNo)).toEqual([1, 2]);
    expect(transient.hasMore).toBe(true);
  });

  it('fails closed if a later page repeats a message identity', async () => {
    const service: MobileChatReadServiceV1 = {
      async readThreadPage(_threadId, options = {}) {
        const after = options.afterSequenceNo ?? 0;
        return after === 0
          ? threadPage(0, [msg(1), msg(2)], true)
          : {
              ...threadPage(2, [msg(3)], false),
              messages: [{ ...msg(3), messageId: 'message-1' }],
            };
      },
    };
    const repository = createMobileChatReadRepositoryV1({ threadId, service, pageSize: 2 });

    await repository.loadInitial();
    await expect(repository.loadMore()).rejects.toBeInstanceOf(
      MobileChatReadRepositoryErrorV1,
    );
    expect(repository.getSnapshot()).toMatchObject({
      status: 'error',
      errorCode: 'CHAT_PAGINATION_PROTOCOL_ERROR',
    });
  });

  it('fails closed if Character/content binding changes between pages', async () => {
    const service: MobileChatReadServiceV1 = {
      async readThreadPage(_threadId, options = {}) {
        const after = options.afterSequenceNo ?? 0;
        return after === 0
          ? threadPage(0, [msg(1), msg(2)], true)
          : { ...threadPage(2, [msg(3)], false), characterId: 'seyeon' };
      },
    };
    const repository = createMobileChatReadRepositoryV1({ threadId, service, pageSize: 2 });

    await repository.loadInitial();
    await expect(repository.loadMore()).rejects.toMatchObject({
      code: 'CHAT_THREAD_BINDING_CHANGED',
    });
  });

  it('single-flights concurrent initial reads', async () => {
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const service: MobileChatReadServiceV1 = {
      async readThreadPage() {
        calls += 1;
        await gate;
        return threadPage(0, [], false);
      },
    };
    const repository = createMobileChatReadRepositoryV1({ threadId, service, pageSize: 2 });

    const first = repository.loadInitial();
    const second = repository.loadInitial();
    release();
    await Promise.all([first, second]);

    expect(calls).toBe(1);
  });
});
