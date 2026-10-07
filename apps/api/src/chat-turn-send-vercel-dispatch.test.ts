import { describe, expect, it } from 'vitest';
import {
  resolveMeDispatchTargetForTestV1,
  toCanonicalMeRequestForTestV1,
} from '../../../api/me.js';

const THREAD_ID = '33333333-3333-4333-8333-333333333333';

function request(url: string) {
  return new Request(url, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer member-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      clientTurnId: '44444444-4444-4444-8444-444444444444',
      text: '안녕하세요.',
    }),
  });
}

describe('POST /api/chat/:threadId/turns Vercel dispatch', () => {
  it('resolves the canonical rewrite marker', async () => {
    const source = request(
      `https://myeongha.vercel.app/api/me?__myeongha_chat_turn_send=1&__myeongha_chat_thread_id=${THREAD_ID}`,
    );
    const target = resolveMeDispatchTargetForTestV1(source);
    expect(target).toEqual({
      kind: 'chat-turn-send',
      route: `/api/chat/${THREAD_ID}/turns`,
      threadId: THREAD_ID,
    });

    const canonical = await toCanonicalMeRequestForTestV1(source, target ?? undefined);
    expect(canonical.url).toBe(
      `https://myeongha.internal/api/chat/${THREAD_ID}/turns`,
    );
    expect(canonical.method).toBe('POST');
    expect(canonical.headers.get('authorization')).toBe('Bearer member-token');
    await expect(canonical.json()).resolves.toEqual({
      clientTurnId: '44444444-4444-4444-8444-444444444444',
      text: '안녕하세요.',
    });
  });

  it('accepts the preserved source pathname only with the exact rewrite marker', () => {
    expect(resolveMeDispatchTargetForTestV1(request(
      `https://myeongha.vercel.app/api/chat/${THREAD_ID}/turns?__myeongha_chat_turn_send=1&__myeongha_chat_thread_id=${THREAD_ID}`,
    ))).toMatchObject({
      kind: 'chat-turn-send',
      threadId: THREAD_ID,
    });

    expect(resolveMeDispatchTargetForTestV1(request(
      `https://myeongha.vercel.app/api/chat/${THREAD_ID}/turns`,
    ))).toBeNull();
  });

  it.each([
    `https://myeongha.vercel.app/api/me?__myeongha_chat_turn_send=2&__myeongha_chat_thread_id=${THREAD_ID}`,
    `https://myeongha.vercel.app/api/me?__myeongha_chat_turn_send=1&__myeongha_chat_thread_id=${THREAD_ID}&afterSequenceNo=1`,
    `https://myeongha.vercel.app/api/me?__myeongha_chat_turn_send=1&__myeongha_chat_thread_id=${THREAD_ID}&__myeongha_chat_open=1`,
    `https://myeongha.vercel.app/api/me?__myeongha_chat_turn_send=1&__myeongha_chat_thread_id=11111111-1111-4111-8111-111111111111&threadId=${THREAD_ID}`,
  ])('fails closed for mixed rewrite authority: %s', (url) => {
    expect(resolveMeDispatchTargetForTestV1(request(url))).toBeNull();
  });
});
