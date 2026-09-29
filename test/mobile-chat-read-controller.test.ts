import { describe, expect, it } from 'vitest';

import { createMobileChatReadControllerV1 } from '../apps/mobile/src/features/chat/mobile-chat-read-controller.js';
import type {
  MobileChatReadRepositoryV1,
  MobileChatThreadSnapshotV1,
} from '../apps/mobile/src/features/chat/mobile-chat-read-repository.js';

const base: MobileChatThreadSnapshotV1 = {
  status: 'idle',
  threadId: '123e4567-e89b-42d3-a456-426614174000',
  characterId: null,
  messages: [],
  relationship: null,
  hasMore: true,
  nextAfterSequenceNo: 0,
  contentReleaseId: null,
  contentBundleId: null,
  contentRevision: null,
  errorCode: null,
};

describe('mobile Chat read controller', () => {
  it('returns repository error snapshot instead of throwing into the screen', async () => {
    let snapshot = base;
    const repository: MobileChatReadRepositoryV1 = {
      getSnapshot: () => snapshot,
      async loadInitial() {
        snapshot = { ...snapshot, status: 'error', errorCode: 'CHAT_READ_FAILED' };
        throw new Error('network');
      },
      async loadMore() {
        return snapshot;
      },
    };
    const controller = createMobileChatReadControllerV1(repository);

    await expect(controller.loadInitial()).resolves.toMatchObject({
      status: 'error',
      errorCode: 'CHAT_READ_FAILED',
    });
  });
});
