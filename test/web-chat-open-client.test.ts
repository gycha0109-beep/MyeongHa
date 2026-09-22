import { describe, expect, it, vi } from 'vitest';

import {
  ChatOpenClientErrorV1,
  buildChatThreadUrlV1,
  createChatOpenClientV1,
} from '../apps/web/chat-open-client.js';

const THREAD_ID = '123e4567-e89b-42d3-a456-426614174000';

function successEnvelope(characterId = 'baekheon') {
  return {
    ok: true,
    data: {
      threadId: THREAD_ID,
      characterId,
      created: true,
    },
    meta: {
      apiContractVersion: 'v0.9',
      requestId: 'request-1',
      serverTime: '2026-09-22T00:00:00.000Z',
    },
  };
}

function response(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('Chat open browser client', () => {
  it('opens a Member thread using only the server-authoritative Reader character id', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(200, successEnvelope()));
    const client = createChatOpenClientV1({
      fetchImpl,
      resolveBearer: () => ({ kind: 'member', token: 'member-token' }),
    });

    await expect(client.openForServerCharacter({
      readerCharacterId: ' baekheon ',
    })).resolves.toEqual({
      threadId: THREAD_ID,
      characterId: 'baekheon',
      created: true,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [endpoint, init] = fetchImpl.mock.calls[0]!;
    expect(endpoint).toBe('/api/chat');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe(JSON.stringify({ characterId: 'baekheon' }));
    expect(String(init?.body)).not.toContain('readerCharacterId');
    expect(String(init?.body)).not.toContain('threadId');
    expect(String(init?.body)).not.toContain('topic');
    expect(String(init?.body)).not.toContain('scope');
  });

  it('navigates by the authoritative thread id without carrying Character hints', () => {
    const url = buildChatThreadUrlV1(THREAD_ID);
    expect(url).toBe('chat.html?threadId=123e4567-e89b-42d3-a456-426614174000');
    expect(url).not.toContain('character=');
    expect(url).not.toContain('reader=');
  });

  it('rejects a server Character mismatch instead of accepting another identity', async () => {
    const client = createChatOpenClientV1({
      fetchImpl: vi.fn().mockResolvedValue(response(200, successEnvelope('seyeon'))),
      resolveBearer: () => ({ kind: 'member', token: 'member-token' }),
    });

    await expect(client.openForServerCharacter({
      readerCharacterId: 'baekheon',
    })).rejects.toMatchObject({
      code: 'CHAT_OPEN_MALFORMED_RESPONSE',
      retryable: false,
    });
  });

  it('maps Member-only and unavailable content failures without inventing fallback Chat', async () => {
    const memberRequired = createChatOpenClientV1({
      fetchImpl: vi.fn().mockResolvedValue(response(403, {
        ok: false,
        error: { code: 'FORBIDDEN', messageKey: 'chat.member_required', retryable: false },
        meta: { apiContractVersion: 'v0.9', requestId: 'request-1' },
      })),
      resolveBearer: () => ({ kind: 'guest', token: 'guest-token' }),
    });
    await expect(memberRequired.openForServerCharacter({
      readerCharacterId: 'baekheon',
    })).rejects.toMatchObject({
      code: 'CHAT_OPEN_MEMBER_REQUIRED',
      retryable: false,
    });

    const unavailable = createChatOpenClientV1({
      fetchImpl: vi.fn().mockResolvedValue(response(503, {
        ok: false,
        error: { code: 'CAPABILITY_UNAVAILABLE', messageKey: 'chat.content_unavailable', retryable: true },
        meta: { apiContractVersion: 'v0.9', requestId: 'request-2' },
      })),
      resolveBearer: () => ({ kind: 'member', token: 'member-token' }),
    });
    await expect(unavailable.openForServerCharacter({
      readerCharacterId: 'baekheon',
    })).rejects.toMatchObject({
      code: 'CHAT_OPEN_CONTENT_UNAVAILABLE',
      retryable: true,
    });
  });

  it('invalidates only a rejected authentication bearer on 401', async () => {
    const invalidateMember = vi.fn();
    const invalidateGuest = vi.fn();
    const client = createChatOpenClientV1({
      fetchImpl: vi.fn().mockResolvedValue(response(401, {
        ok: false,
        error: { code: 'AUTH_REQUIRED', messageKey: 'auth.required', retryable: false },
        meta: { apiContractVersion: 'v0.9', requestId: 'request-1' },
      })),
      resolveBearer: () => ({ kind: 'member', token: 'expired-member' }),
      invalidateMember,
      invalidateGuest,
    });

    await expect(client.openForServerCharacter({
      readerCharacterId: 'baekheon',
    })).rejects.toBeInstanceOf(ChatOpenClientErrorV1);
    expect(invalidateMember).toHaveBeenCalledWith('expired-member');
    expect(invalidateGuest).not.toHaveBeenCalled();
  });

  it('rejects presentation-only or malformed inputs before transport', async () => {
    const fetchImpl = vi.fn();
    const client = createChatOpenClientV1({
      fetchImpl,
      resolveBearer: () => ({ kind: 'member', token: 'member-token' }),
    });

    await expect(client.openForServerCharacter({
      readerCharacterId: '',
    })).rejects.toMatchObject({ code: 'CHAT_OPEN_REQUEST_INVALID' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
