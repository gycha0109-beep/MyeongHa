import { describe, expect, it } from 'vitest';

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
