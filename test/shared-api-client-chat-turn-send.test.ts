import { describe, expect, it } from 'vitest';
import {
  MyeongHaApiClientV1,
  sendSeyeonChatTurnV1,
} from '../packages/api-client/src/index.js';

const THREAD_ID = '123e4567-e89b-42d3-a456-426614174000';
const CLIENT_TURN_ID = '223e4567-e89b-42d3-a456-426614174000';
const TURN_ID = '323e4567-e89b-42d3-a456-426614174000';
const MESSAGE_ID = '423e4567-e89b-42d3-a456-426614174000';

describe('shared Seyeon Chat turn-send client', () => {
  it('sends no browser-owned authority fields', async () => {
    let method = '';
    let path = '';
    let body: unknown;
    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async (input, init) => {
        const url = new URL(String(input));
        method = init?.method ?? '';
        path = url.pathname;
        body = JSON.parse(String(init?.body));
        return Response.json({
          ok: true,
          data: {
            turnId: TURN_ID,
            assistantMessageId: MESSAGE_ID,
            assistantText: '세연 답변',
            sequenceNo: 2,
            replayed: false,
          },
        });
      },
    });

    await expect(sendSeyeonChatTurnV1(
      client,
      'member-bearer',
      THREAD_ID,
      { clientTurnId: CLIENT_TURN_ID, text: '안녕하세요.' },
    )).resolves.toEqual({
      turnId: TURN_ID,
      assistantMessageId: MESSAGE_ID,
      assistantText: '세연 답변',
      sequenceNo: 2,
      replayed: false,
    });
    expect(method).toBe('POST');
    expect(path).toBe(`/api/chat/${THREAD_ID}/turns`);
    expect(body).toEqual({ clientTurnId: CLIENT_TURN_ID, text: '안녕하세요.' });
  });

  it('rejects authority injection before network access', async () => {
    let calls = 0;
    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async () => { calls += 1; return Response.json({ ok: true, data: {} }); },
    });
    await expect(sendSeyeonChatTurnV1(
      client,
      'member-bearer',
      THREAD_ID,
      { clientTurnId: CLIENT_TURN_ID, text: 'hello', releaseId: 'client-owned' },
    )).rejects.toMatchObject({ code: 'CLIENT_CHAT_TURN_INVALID' });
    expect(calls).toBe(0);
  });
});
