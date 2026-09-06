import { describe, expect, it } from 'vitest';
import {
  resolveMeDispatchTargetForTestV1,
  toCanonicalMeRequestForTestV1,
} from '../../../api/me.js';

const THREAD_ID = '33333333-3333-4333-8333-333333333333';

function openRequest(url = 'https://myeongha.vercel.app/api/me?__myeongha_chat_open=1') {
  return new Request(url, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer member-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ characterId: 'seyeon' }),
  });
}

describe('POST /api/chat Vercel dispatch', () => {
  it('resolves the exact rewrite marker to canonical chat open without runtime initialization', () => {
    expect(resolveMeDispatchTargetForTestV1(openRequest())).toEqual({
      kind: 'chat-open',
      route: '/api/chat',
    });
  });

  it('preserves method, authorization and request body while stripping rewrite metadata', async () => {
    const request = openRequest();
    const target = resolveMeDispatchTargetForTestV1(request);
    expect(target).not.toBeNull();

    const canonical = await toCanonicalMeRequestForTestV1(request, target ?? undefined);

    expect(canonical.url).toBe('https://myeongha.internal/api/chat');
    expect(canonical.method).toBe('POST');
    expect(canonical.headers.get('authorization')).toBe('Bearer member-token');
    expect(await canonical.json()).toEqual({ characterId: 'seyeon' });
    expect(new URL(canonical.url).search).toBe('');
  });

  it.each([
    `https://myeongha.vercel.app/api/me?__myeongha_chat_open=2`,
    `https://myeongha.vercel.app/api/me?__myeongha_chat_open=1&__myeongha_chat_open=1`,
    `https://myeongha.vercel.app/api/me?__myeongha_chat_open=1&__myeongha_chat_thread_id=${THREAD_ID}`,
    `https://myeongha.vercel.app/api/me?__myeongha_chat_open=1&threadId=${THREAD_ID}`,
    `https://myeongha.vercel.app/api/me?__myeongha_chat_open=1&afterSequenceNo=1`,
    `https://myeongha.vercel.app/api/me?__myeongha_chat_open=1&__myeongha_records_read=life-record`,
    `https://myeongha.vercel.app/api/me?__myeongha_chat_open=1&subjectId=client-owned`,
  ])('fails closed for mixed or unsupported rewrite authority: %s', (url) => {
    expect(resolveMeDispatchTargetForTestV1(openRequest(url))).toBeNull();
  });

  it('keeps the existing owner-scoped Chat read dispatch unchanged', async () => {
    const request = new Request(
      `https://myeongha.vercel.app/api/me?__myeongha_chat_thread_id=${THREAD_ID}&afterSequenceNo=7`,
      { headers: { Authorization: 'Bearer member-token' } },
    );
    const target = resolveMeDispatchTargetForTestV1(request);

    expect(target).toEqual({
      kind: 'chat-read',
      route: `/api/chat/${THREAD_ID}`,
      afterSequenceNo: '7',
    });

    const canonical = await toCanonicalMeRequestForTestV1(request, target ?? undefined);
    expect(canonical.url).toBe(
      `https://myeongha.internal/api/chat/${THREAD_ID}?afterSequenceNo=7`,
    );
    expect(canonical.method).toBe('GET');
  });
});
