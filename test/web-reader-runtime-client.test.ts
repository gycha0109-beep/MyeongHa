import { describe, expect, it, vi } from 'vitest';
import { handleApprovedSajuReaderQuestionHttpV1 } from '../apps/api/src/approved-saju-reader-question-http-v1.js';

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
    domain: 'general',
    interpretationHash: 'sha256:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    utterance: {
      characterId: 'baekheon',
      requestedDomain: 'general',
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
  it('connects to the private HTTP route and fails closed before identity lookup for invalid scope', async () => {
    const origin = 'http://localhost';
    const path = origin + '/api/me/readings/reader-questions';
    const body = { threadId: '33333333-3333-4333-8333-333333333333',
      readingId: '44444444-4444-4444-8444-444444444444',
      clientTurnId: '66666666-6666-4666-8666-666666666666', text: '그 부분을 더 설명해 주세요.' };
    const makeRequest = (value: unknown, requestOrigin = origin) => new Request(path, {
      method: 'POST', headers: { Origin: requestOrigin, 'Content-Type': 'application/json' },
      body: JSON.stringify(value),
    });
    const verifyRequestIdentity = vi.fn(async () => null);
    const runtime = { identityEvidenceVerifier: { verifyRequestIdentity } } as never;
    expect((await handleApprovedSajuReaderQuestionHttpV1({ request: makeRequest(body) }))?.status).toBe(503);
    expect((await handleApprovedSajuReaderQuestionHttpV1({
      runtime, request: makeRequest(body, 'https://example.invalid'),
    }))?.status).toBe(403);
    expect((await handleApprovedSajuReaderQuestionHttpV1({
      runtime, request: makeRequest({ ...body, sourceUnitRefs: ['untrusted'] }),
    }))?.status).toBe(400);
    expect(verifyRequestIdentity).not.toHaveBeenCalled();
    const client = createReaderRuntimeClientV1({
      enabled: true, resolveBearer: () => ({ kind: 'member', token: 'isolated' }),
      fetchImpl: async (endpoint, init) => {
        const headers = new Headers(init?.headers);
        headers.set('Origin', origin);
        return (await handleApprovedSajuReaderQuestionHttpV1({
          runtime, request: new Request(new URL(String(endpoint), origin), { ...init, headers }),
        }))!;
      },
      invalidateMember: () => {},
    });
    await expect(client.askPurchasedReading({
      ...body, officialReadingId: body.readingId,
    })).rejects.toMatchObject({ code: 'READER_SESSION_REQUIRED' });
    expect(verifyRequestIdentity).toHaveBeenCalledOnce();
  });

  it('sends the selected scene and reuses the same question identity on retry', async () => {
    const threadId = '33333333-3333-4333-8333-333333333333';
    const readingId = '44444444-4444-4444-8444-444444444444';
    const safeMessageId = '55555555-5555-4555-8555-555555555555';
    const clientTurnId = '66666666-6666-4666-8666-666666666666';
    const firstSceneQuestion = { interpretationHash: sceneData().interpretationHash, segmentIndex: 2 };
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(errorResponse(409, 'QUESTION_IN_PROGRESS'))
      .mockResolvedValueOnce(Response.json({ ok: true, data: { threadId, safeMessageId } }));
    const client = createReaderRuntimeClientV1({
      enabled: true, fetchImpl, resolveBearer: () => ({ kind: 'member', token: 'buyer-token' }),
    });
    const input = { threadId, officialReadingId: readingId, clientTurnId,
      text: '그 부분을 더 설명해 주세요.', firstSceneQuestion };
    await expect(client.askPurchasedReading(input)).rejects.toMatchObject({ retryable: true });
    await expect(client.askPurchasedReading(input)).resolves.toEqual({ threadId, safeMessageId });
    expect(fetchImpl.mock.calls[0]).toEqual(fetchImpl.mock.calls[1]);
    const [endpoint, init] = fetchImpl.mock.calls[1]!;
    expect(endpoint).toBe('/api/me/readings/reader-questions');
    expect(init).toMatchObject({ credentials: 'same-origin', cache: 'no-store',
      headers: { Authorization: 'Bearer buyer-token' } });
    expect(JSON.parse(init.body)).toEqual({ threadId, readingId, clientTurnId, text: input.text, firstSceneQuestion });
  });

  it('denies guests and rejects unexpected paid plaintext in a question response', async () => {
    const input = {
      threadId: '33333333-3333-4333-8333-333333333333',
      officialReadingId: '44444444-4444-4444-8444-444444444444',
      clientTurnId: '66666666-6666-4666-8666-666666666666', text: '그 부분을 더 설명해 주세요.',
    };
    const fetchImpl = vi.fn().mockResolvedValue(Response.json({ ok: true, data: {
      threadId: input.threadId, safeMessageId: '55555555-5555-4555-8555-555555555555', body: 'unexpected',
    } }));
    const guest = createReaderRuntimeClientV1({
      enabled: true, fetchImpl, resolveBearer: () => ({ kind: 'guest', token: 'guest-token' }),
    });
    await expect(guest.askPurchasedReading(input)).rejects.toMatchObject({ code: 'READER_SESSION_REQUIRED' });
    expect(fetchImpl).not.toHaveBeenCalled();
    const member = createReaderRuntimeClientV1({
      enabled: true, fetchImpl, resolveBearer: () => ({ kind: 'member', token: 'member-token' }),
    });
    await expect(member.askPurchasedReading(input)).rejects.toMatchObject({ code: 'READER_MALFORMED_RESPONSE' });
  });

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
