import { describe, expect, it } from 'vitest';

import {
  MyeongHaApiClientV1,
  readChatThreadPageV1,
} from '../packages/api-client/src/index.js';

function success(data: unknown): Response {
  return Response.json(
    { ok: true, data, meta: { apiContractVersion: 'v0.9', requestId: 'req-chat' } },
    { status: 200 },
  );
}

const threadId = '123e4567-e89b-42d3-a456-426614174000';

function message(sequenceNo: number, overrides: Record<string, unknown> = {}) {
  return {
    messageId: `message-${sequenceNo}`,
    sequenceNo,
    senderType: 'character',
    characterId: 'baekheon',
    bodyText: `message ${sequenceNo}`,
    messagePayloadJsonb: null,
    messageSchemaVersion: null,
    createdAt: '2026-09-29T00:00:00.000Z',
    redacted: false,
    redactedAt: null,
    ...overrides,
  };
}

function page(overrides: Record<string, unknown> = {}) {
  return {
    threadId,
    characterId: 'baekheon',
    contentReleaseId: 'release-1',
    contentBundleId: 'bundle-1',
    contentRevision: 1,
    afterSequenceNo: 0,
    lastSequenceNo: 2,
    messages: [message(1), message(2)],
    pagination: {
      pageSize: 30,
      hasMore: false,
      nextAfterSequenceNo: null,
    },
    latestCharacterMessage: message(2),
    relationship: {
      stateId: 'state-1',
      characterId: 'baekheon',
      closeness: 3,
      trust: 4,
      friction: 1,
      relationshipStage: 'acquainted',
      policyVersion: 'v1',
      revision: 2,
      lastInteractionAt: '2026-09-29T00:00:00.000Z',
      updatedAt: '2026-09-29T00:00:00.000Z',
    },
    ...overrides,
  };
}

describe('shared Chat read API client', () => {
  it('requests the owner-scoped thread route with numeric stream cursor', async () => {
    let requested = '';
    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async (input) => {
        requested = String(input);
        return success(page());
      },
    });

    const result = await readChatThreadPageV1(client, 'guest-token', threadId, {
      afterSequenceNo: 0,
      pageSize: 30,
    });

    const url = new URL(requested);
    expect(url.pathname).toBe(`/api/chat/${threadId}`);
    expect(url.searchParams.get('afterSequenceNo')).toBe('0');
    expect(url.searchParams.get('pageSize')).toBe('30');
    expect(result.relationship?.characterId).toBe('baekheon');
  });

  it('rejects malformed thread id before network access', async () => {
    let calls = 0;
    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async () => {
        calls += 1;
        return success(page());
      },
    });

    await expect(
      readChatThreadPageV1(client, 'guest-token', 'not-a-thread'),
    ).rejects.toMatchObject({ code: 'CLIENT_CHAT_READ_INVALID' });
    expect(calls).toBe(0);
  });

  it('rejects non-increasing message sequences and inconsistent latest Character message', async () => {
    const badSequence = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async () => success(page({
        messages: [message(2), message(1)],
      })),
    });
    await expect(
      readChatThreadPageV1(badSequence, 'guest-token', threadId),
    ).rejects.toMatchObject({ code: 'API_CHAT_RESPONSE_INVALID' });

    const badLatest = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async () => success(page({
        latestCharacterMessage: message(3),
      })),
    });
    await expect(
      readChatThreadPageV1(badLatest, 'guest-token', threadId),
    ).rejects.toMatchObject({ code: 'API_CHAT_RESPONSE_INVALID' });
  });

  it('requires terminal pagination to expose a null continuation cursor', async () => {
    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async () => success(page({
        pagination: { pageSize: 30, hasMore: false, nextAfterSequenceNo: 2 },
      })),
    });

    await expect(
      readChatThreadPageV1(client, 'guest-token', threadId),
    ).rejects.toMatchObject({ code: 'API_CHAT_RESPONSE_INVALID' });
  });
});
