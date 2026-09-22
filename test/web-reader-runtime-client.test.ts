import { describe, expect, it, vi } from 'vitest';

import {
  ReaderRuntimeClientErrorV1,
  createReaderRuntimeClientV1,
} from '../apps/web/reader-runtime-client.js';

function sceneData() {
  return {
    schemaVersion: 'myeongha-reader-interpretation-preview-http-v1',
    lifecycle: 'preview',
    mode: 'reader_interpretation',
    officialReadingId: '44444444-4444-4444-8444-444444444444',
    readerCharacterId: 'baekheon',
    domain: 'general_natal',
    interpretationHash: 'sha256:v1:reader-result',
    utterance: {
      characterId: 'baekheon',
      requestedDomain: 'general_natal',
      segments: [{ kind: 'character_reaction', text: '핵심부터 보겠습니다.' }],
    },
  };
}

function successResponse(data = sceneData()) {
  return new Response(JSON.stringify({
    ok: true,
    data,
    meta: {
      apiContractVersion: 'v0.9',
      requestId: 'req-1',
      serverTime: '2026-09-22T00:00:00.000Z',
    },
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function errorResponse(status: number, code: string, retryable = false) {
  return new Response(JSON.stringify({
    ok: false,
    error: { code, messageKey: 'reader.failure', retryable },
    meta: { apiContractVersion: 'v0.9', requestId: 'req-1' },
  }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('web Reader runtime client', () => {
  it('keeps the Production Reader transport disabled by default', async () => {
    const fetchImpl = vi.fn();
    const client = createReaderRuntimeClientV1({
      fetchImpl,
      resolveBearer: vi.fn(),
    });

    await expect(client.readReaderScene({
      threadId: '33333333-3333-4333-8333-333333333333',
      officialReadingId: '44444444-4444-4444-8444-444444444444',
    })).rejects.toMatchObject({ code: 'READER_FEATURE_UNAVAILABLE' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('sends only threadId + officialReadingId with the current bearer', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(successResponse());
    const client = createReaderRuntimeClientV1({
      enabled: true,
      fetchImpl,
      resolveBearer: vi.fn().mockResolvedValue({ kind: 'member', token: 'member-token' }),
    });

    const scene = await client.readReaderScene({
      threadId: ' 33333333-3333-4333-8333-333333333333 ',
      officialReadingId: ' 44444444-4444-4444-8444-444444444444 ',
    });

    expect(scene.readerCharacterId).toBe('baekheon');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [endpoint, init] = fetchImpl.mock.calls[0]!;
    expect(endpoint).toBe('/api/me/readings/reader-interpretation/preview');
    expect(init).toMatchObject({
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
    });
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer member-token',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(init.body)).toEqual({
      threadId: '33333333-3333-4333-8333-333333333333',
      officialReadingId: '44444444-4444-4444-8444-444444444444',
    });
  });

  it('rejects malformed Reader request identities before transport', async () => {
    const fetchImpl = vi.fn();
    const client = createReaderRuntimeClientV1({
      enabled: true,
      fetchImpl,
      resolveBearer: vi.fn().mockResolvedValue({ kind: 'member', token: 'member-token' }),
    });

    await expect(client.readReaderScene({
      threadId: 'not-a-thread',
      officialReadingId: '44444444-4444-4444-8444-444444444444',
    })).rejects.toMatchObject({ code: 'READER_REQUEST_INVALID' });

    await expect(client.readReaderScene({
      threadId: '33333333-3333-4333-8333-333333333333',
      officialReadingId: 'not-a-reading',
    })).rejects.toMatchObject({ code: 'READER_REQUEST_INVALID' });

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('invalidates a rejected member bearer on 401', async () => {
    const invalidateMember = vi.fn();
    const client = createReaderRuntimeClientV1({
      enabled: true,
      fetchImpl: vi.fn().mockResolvedValue(errorResponse(401, 'AUTH_REQUIRED')),
      resolveBearer: vi.fn().mockResolvedValue({ kind: 'member', token: 'expired' }),
      invalidateMember,
    });

    await expect(client.readReaderScene({
      threadId: '33333333-3333-4333-8333-333333333333',
      officialReadingId: '44444444-4444-4444-8444-444444444444',
    })).rejects.toMatchObject({ code: 'READER_SESSION_REQUIRED', retryable: false });

    expect(invalidateMember).toHaveBeenCalledWith('expired');
  });

  it('maps temporary server failure to an explicit retryable error', async () => {
    const client = createReaderRuntimeClientV1({
      enabled: true,
      fetchImpl: vi.fn().mockResolvedValue(errorResponse(503, 'CAPABILITY_UNAVAILABLE', true)),
      resolveBearer: vi.fn().mockResolvedValue({ kind: 'guest', token: 'guest-token' }),
    });

    await expect(client.readReaderScene({
      threadId: '33333333-3333-4333-8333-333333333333',
      officialReadingId: '44444444-4444-4444-8444-444444444444',
    })).rejects.toMatchObject({
      code: 'READER_SERVICE_UNAVAILABLE',
      retryable: true,
    });
  });

  it('rejects a success payload bound to a different Official Reading', async () => {
    const client = createReaderRuntimeClientV1({
      enabled: true,
      fetchImpl: vi.fn().mockResolvedValue(successResponse({
        ...sceneData(),
        officialReadingId: '44444444-4444-4444-8444-444444444445',
      })),
      resolveBearer: vi.fn().mockResolvedValue({ kind: 'member', token: 'member-token' }),
    });

    await expect(client.readReaderScene({
      threadId: '33333333-3333-4333-8333-333333333333',
      officialReadingId: '44444444-4444-4444-8444-444444444444',
    })).rejects.toMatchObject({ code: 'READER_MALFORMED_RESPONSE' });
  });

  it('rejects malformed or provenance-leaking success payloads', async () => {
    const client = createReaderRuntimeClientV1({
      enabled: true,
      fetchImpl: vi.fn().mockResolvedValue(successResponse({
        ...sceneData(),
        ...({ groundingHash: 'private' } as Record<string, unknown>),
      })),
      resolveBearer: vi.fn().mockResolvedValue({ kind: 'member', token: 'member-token' }),
    });

    await expect(client.readReaderScene({
      threadId: '33333333-3333-4333-8333-333333333333',
      officialReadingId: '44444444-4444-4444-8444-444444444444',
    })).rejects.toMatchObject({ code: 'READER_MALFORMED_RESPONSE' });
  });

  it('classifies aborted fetches without making them retryable', async () => {
    const client = createReaderRuntimeClientV1({
      enabled: true,
      fetchImpl: vi.fn().mockRejectedValue(
        typeof DOMException === 'undefined'
          ? Object.assign(new Error('aborted'), { name: 'AbortError' })
          : new DOMException('aborted', 'AbortError'),
      ),
      resolveBearer: vi.fn().mockResolvedValue({ kind: 'member', token: 'member-token' }),
    });

    await expect(client.readReaderScene({
      threadId: '33333333-3333-4333-8333-333333333333',
      officialReadingId: '44444444-4444-4444-8444-444444444444',
    })).rejects.toMatchObject({
      code: 'READER_REQUEST_ABORTED',
      retryable: false,
    });
  });

  it('fails closed on client authority fields by not accepting them into the request body', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(successResponse());
    const client = createReaderRuntimeClientV1({
      enabled: true,
      fetchImpl,
      resolveBearer: vi.fn().mockResolvedValue({ kind: 'member', token: 'member-token' }),
    });

    await client.readReaderScene({
      threadId: '33333333-3333-4333-8333-333333333333',
      officialReadingId: '44444444-4444-4444-8444-444444444444',
      readerCharacterId: 'forged-reader',
      grounding: { forged: true },
    });

    const [, init] = fetchImpl.mock.calls[0]!;
    expect(JSON.parse(init.body)).toEqual({
      threadId: '33333333-3333-4333-8333-333333333333',
      officialReadingId: '44444444-4444-4444-8444-444444444444',
    });
  });
});
