import { describe, expect, it } from 'vitest';

import {
  MyeongHaApiClientV1,
} from '../packages/api-client/src/index.js';
import {
  MobileChatTurnSendErrorV1,
  createMobileChatTurnSendServiceV1,
} from '../apps/mobile/src/features/chat/mobile-chat-turn-send-service.js';

const threadId = '123e4567-e89b-42d3-a456-426614174000';
const clientTurnId = '223e4567-e89b-42d3-a456-426614174000';
const turnId = '323e4567-e89b-42d3-a456-426614174000';
const assistantMessageId = '423e4567-e89b-42d3-a456-426614174000';
const request = { clientTurnId, text: '안녕하세요.' };

function success() {
  return Response.json({
    ok: true,
    data: {
      turnId,
      assistantMessageId,
      assistantText: '어서 와요.',
      sequenceNo: 2,
      replayed: false,
    },
  });
}

describe('mobile Se-yeon Chat turn send transport', () => {
  it('sends only the server-approved two-field payload through the Member session', async () => {
    let seenAuthorization: string | null = null;
    let seenPath = '';
    let seenBody: unknown = null;
    let memberCalls = 0;
    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async (url, init) => {
        seenAuthorization = new Headers(init?.headers).get('Authorization');
        seenPath = new URL(String(url)).pathname;
        seenBody = JSON.parse(String(init?.body));
        return success();
      },
    });
    const service = createMobileChatTurnSendServiceV1({
      client,
      memberSession: {
        async withMemberBearer(operation) {
          memberCalls += 1;
          return operation('member-only-token');
        },
      },
    });
    await expect(service.send({ threadId, characterId: 'seyeon', request }))
      .resolves.toMatchObject({ assistantText: '어서 와요.', replayed: false });
    expect(memberCalls).toBe(1);
    expect(seenAuthorization).toBe('Bearer member-only-token');
    expect(seenPath).toBe(`/api/chat/${threadId}/turns`);
    expect(seenBody).toEqual(request);
  });

  it('rejects any other Character before requesting a Member bearer', async () => {
    let bearerCalls = 0;
    let networkCalls = 0;
    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async () => { networkCalls += 1; return success(); },
    });
    const service = createMobileChatTurnSendServiceV1({
      client,
      memberSession: {
        async withMemberBearer(operation) {
          bearerCalls += 1;
          return operation('member-only-token');
        },
      },
    });
    for (const characterId of ['yeoul', 'baekheon', null]) {
      await expect(service.send({ threadId, characterId, request }))
        .rejects.toBeInstanceOf(MobileChatTurnSendErrorV1);
    }
    expect(bearerCalls).toBe(0);
    expect(networkCalls).toBe(0);
  });

  it('does not fall back to the Guest bearer when Member authentication fails', async () => {
    let calls = 0;
    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async () => { calls += 1; return success(); },
    });
    const service = createMobileChatTurnSendServiceV1({
      client,
      memberSession: {
        async withMemberBearer() {
          throw new Error('MOBILE_MEMBER_REQUIRED');
        },
      },
    });
    await expect(service.send({ threadId, characterId: 'seyeon', request }))
      .rejects.toThrow('MOBILE_MEMBER_REQUIRED');
    expect(calls).toBe(0);
  });

  it('passes the same clientTurnId unchanged on an explicit retry after network failure', async () => {
    const observed: unknown[] = [];
    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async (_, init) => {
        observed.push(JSON.parse(String(init?.body)));
        if (observed.length === 1) throw new Error('network unavailable');
        return success();
      },
    });
    const service = createMobileChatTurnSendServiceV1({
      client,
      memberSession: {
        async withMemberBearer(operation) {
          return operation('member-only-token');
        },
      },
    });
    const turn = { threadId, characterId: 'seyeon', request };
    await expect(service.send(turn)).rejects.toMatchObject({
      code: 'API_NETWORK_FAILED',
    });
    await expect(service.send(turn)).resolves.toMatchObject({
      assistantMessageId,
    });
    expect(observed).toEqual([request, request]);
  });
});
