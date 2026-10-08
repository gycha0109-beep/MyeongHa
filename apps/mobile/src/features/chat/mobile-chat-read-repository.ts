import type {
  ChatMessageV1,
  ChatRelationshipV1,
  ChatThreadPageV1,
} from '@myeongha/api-client';

import type { MobileChatReadServiceV1 } from './mobile-chat-read-service.js';

export type MobileChatThreadStatusV1 =
  | 'idle'
  | 'loading_initial'
  | 'ready'
  | 'loading_more'
  | 'error';

export interface MobileChatThreadSnapshotV1 {
  readonly status: MobileChatThreadStatusV1;
  readonly threadId: string;
  readonly characterId: string | null;
  readonly messages: readonly ChatMessageV1[];
  readonly relationship: ChatRelationshipV1 | null;
  readonly hasMore: boolean;
  readonly nextAfterSequenceNo: number | null;
  readonly contentReleaseId: string | null;
  readonly contentBundleId: string | null;
  readonly contentRevision: number | null;
  readonly errorCode: string | null;
}

export class MobileChatReadRepositoryErrorV1 extends Error {
  constructor(
    readonly code: 'CHAT_PAGINATION_PROTOCOL_ERROR' | 'CHAT_THREAD_BINDING_CHANGED',
    message: string,
  ) {
    super(message);
    this.name = 'MobileChatReadRepositoryErrorV1';
  }
}

export interface MobileChatReadRepositoryV1 {
  getSnapshot(): MobileChatThreadSnapshotV1;
  loadInitial(): Promise<MobileChatThreadSnapshotV1>;
  loadMore(): Promise<MobileChatThreadSnapshotV1>;
}

export function createMobileChatReadRepositoryV1(input: {
  readonly threadId: string;
  readonly service: MobileChatReadServiceV1;
  readonly pageSize?: number;
}): MobileChatReadRepositoryV1 {
  const pageSize = input.pageSize ?? 30;
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 50) {
    throw new RangeError('Mobile Chat pageSize must be between 1 and 50.');
  }

  let snapshot: MobileChatThreadSnapshotV1 = Object.freeze({
    status: 'idle',
    threadId: input.threadId,
    characterId: null,
    messages: Object.freeze([]),
    relationship: null,
    hasMore: true,
    nextAfterSequenceNo: 0,
    contentReleaseId: null,
    contentBundleId: null,
    contentRevision: null,
    errorCode: null,
  });
  let inFlight: Promise<MobileChatThreadSnapshotV1> | null = null;

  function publish(next: MobileChatThreadSnapshotV1) {
    snapshot = Object.freeze({
      ...next,
      messages: Object.freeze([...next.messages]),
    });
    return snapshot;
  }

  function protocolError(
    code: MobileChatReadRepositoryErrorV1['code'],
    message: string,
  ): never {
    throw new MobileChatReadRepositoryErrorV1(code, message);
  }

  function bindPage(
    current: readonly ChatMessageV1[],
    page: ChatThreadPageV1,
    expectedAfter: number,
  ): MobileChatThreadSnapshotV1 {
    if (page.threadId !== input.threadId || page.afterSequenceNo !== expectedAfter) {
      protocolError('CHAT_PAGINATION_PROTOCOL_ERROR', 'Chat page cursor binding changed.');
    }
    if (snapshot.characterId !== null && page.characterId !== snapshot.characterId) {
      protocolError('CHAT_THREAD_BINDING_CHANGED', 'Chat Character binding changed.');
    }
    if (
      snapshot.contentReleaseId !== null &&
      (
        page.contentReleaseId !== snapshot.contentReleaseId ||
        page.contentBundleId !== snapshot.contentBundleId ||
        page.contentRevision !== snapshot.contentRevision
      )
    ) {
      protocolError('CHAT_THREAD_BINDING_CHANGED', 'Chat content binding changed.');
    }

    const ids = new Set(current.map((message) => message.messageId));
    const sequenceNos = new Set(current.map((message) => message.sequenceNo));
    for (const message of page.messages) {
      if (ids.has(message.messageId) || sequenceNos.has(message.sequenceNo)) {
        protocolError('CHAT_PAGINATION_PROTOCOL_ERROR', 'Chat page repeats a message identity.');
      }
      ids.add(message.messageId);
      sequenceNos.add(message.sequenceNo);
    }

    if (
      page.pagination.hasMore &&
      (
        page.pagination.nextAfterSequenceNo === null ||
        page.pagination.nextAfterSequenceNo <= expectedAfter
      )
    ) {
      protocolError('CHAT_PAGINATION_PROTOCOL_ERROR', 'Chat cursor did not advance.');
    }

    return Object.freeze({
      status: 'ready',
      threadId: page.threadId,
      characterId: page.characterId,
      messages: Object.freeze([...current, ...page.messages]),
      relationship: page.relationship,
      hasMore: page.pagination.hasMore,
      nextAfterSequenceNo: page.pagination.nextAfterSequenceNo,
      contentReleaseId: page.contentReleaseId,
      contentBundleId: page.contentBundleId,
      contentRevision: page.contentRevision,
      errorCode: null,
    });
  }

  async function loadInitial(): Promise<MobileChatThreadSnapshotV1> {
    if (inFlight !== null) return inFlight;
    // Clear previously displayed owner data before the next Member/Guest read.
    // On account changes, an old owner's messages must not remain on screen.
    publish({
      ...snapshot,
      status: 'loading_initial',
      characterId: null,
      messages: Object.freeze([]),
      relationship: null,
      hasMore: true,
      nextAfterSequenceNo: 0,
      contentReleaseId: null,
      contentBundleId: null,
      contentRevision: null,
      errorCode: null,
    });
    const pending = (async () => {
      try {
        const page = await input.service.readThreadPage(input.threadId, {
          afterSequenceNo: 0,
          pageSize,
        });
        return publish(bindPage(Object.freeze([]), page, 0));
      } catch (error) {
        publish({
          ...snapshot,
          status: 'error',
          errorCode:
            error instanceof MobileChatReadRepositoryErrorV1
              ? error.code
              : 'CHAT_READ_FAILED',
        });
        throw error;
      } finally {
        inFlight = null;
      }
    })();
    inFlight = pending;
    return pending;
  }

  async function loadMore(): Promise<MobileChatThreadSnapshotV1> {
    if (inFlight !== null) return inFlight;
    if (!snapshot.hasMore) return snapshot;
    const cursor = snapshot.nextAfterSequenceNo;
    if (cursor === null) {
      if (snapshot.status === 'idle') return loadInitial();
      const error = new MobileChatReadRepositoryErrorV1(
        'CHAT_PAGINATION_PROTOCOL_ERROR',
        'Chat continuation cursor is missing.',
      );
      publish({ ...snapshot, status: 'error', errorCode: error.code });
      throw error;
    }

    publish({ ...snapshot, status: 'loading_more', errorCode: null });
    const pending = (async () => {
      try {
        const page = await input.service.readThreadPage(input.threadId, {
          afterSequenceNo: cursor,
          pageSize,
        });
        return publish(bindPage(snapshot.messages, page, cursor));
      } catch (error) {
        publish({
          ...snapshot,
          status: 'error',
          errorCode:
            error instanceof MobileChatReadRepositoryErrorV1
              ? error.code
              : 'CHAT_READ_FAILED',
        });
        throw error;
      } finally {
        inFlight = null;
      }
    })();
    inFlight = pending;
    return pending;
  }

  return Object.freeze({
    getSnapshot: () => snapshot,
    loadInitial,
    loadMore,
  });
}
