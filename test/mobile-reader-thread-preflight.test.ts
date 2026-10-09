import { describe, expect, it, vi } from 'vitest';

import { MyeongHaApiClientV1 } from '../packages/api-client/src/index.js';
import { createMobileReaderInterpretationServiceV1 } from '../apps/mobile/src/features/reading/mobile-reader-interpretation-service.js';

const threadId = '33333333-3333-4333-8333-333333333333';
const readingId = '44444444-4444-4444-8444-444444444444';
const binding = Object.freeze({
  threadId,
  officialReading: Object.freeze({ readingId, sajuDomain: 'general' }),
  expectedReaderId: 'seyeon' as const,
});

const thread = Object.freeze({
  threadId,
  characterId: 'seyeon',
  contentReleaseId: 'release-pinned-by-server',
  contentBundleId: 'bundle-pinned-by-server',
  contentRevision: 1,
  afterSequenceNo: 0,
  lastSequenceNo: 0,
  messages: [],
  pagination: { pageSize: 1, hasMore: false, nextAfterSequenceNo: null },
  latestCharacterMessage: null,
  relationship: null,
});

function fixture(chat: unknown, status = 200) {
  const fetchImpl = vi.fn(async () => {
    if (status !== 200) {
      return Response.json({
        ok: false,
        error: { code: 'ACCESS_DENIED', retryable: false },
      }, { status });
    }
    return Response.json({ ok: true, data: chat });
  });
  let bearerCalls = 0;
  const withActiveBearer = async <T>(operation: (bearer: string) => Promise<T>): Promise<T> => {
    bearerCalls += 1;
    return operation('server-owned-active-subject');
  };
  const service = createMobileReaderInterpretationServiceV1({
    publicRouteActivated: true,
    client: new MyeongHaApiClientV1({ origin: 'https://myeongha.test', fetchImpl }),
    session: { withActiveBearer },
  });
  return { fetchImpl, bearerCalls: () => bearerCalls, service };
}

describe('mobile M3-beta-2a Reader preflight', () => {
  it('denies cross-Reader Thread before calling interpretation', async () => {
    const { fetchImpl, service, bearerCalls } = fixture({ ...thread, characterId: 'baekheon' });
    await expect(service.readForOfficialReading(binding)).rejects.toMatchObject({
      code: 'CLIENT_READER_THREAD_BINDING_MISMATCH',
    });
    expect(bearerCalls()).toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('denies invalid or swapped server Thread responses before interpretation', async () => {
    const { fetchImpl, service } = fixture({
      ...thread,
      threadId: '55555555-5555-4555-8555-555555555555',
    });
    await expect(service.readForOfficialReading(binding)).rejects.toMatchObject({
      code: 'API_CHAT_RESPONSE_INVALID',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('denies revoked or unauthorized server Thread access before interpretation', async () => {
    const { fetchImpl, service } = fixture(thread, 403);
    await expect(service.readForOfficialReading(binding)).rejects.toMatchObject({
      code: 'ACCESS_DENIED',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid Thread ids before bearer resolution or network requests', async () => {
    const { fetchImpl, service, bearerCalls } = fixture(thread);
    await expect(service.readForOfficialReading({ ...binding, threadId: 'not-a-uuid' })).rejects.toMatchObject({
      code: 'CLIENT_CHAT_READ_INVALID',
    });
    expect(bearerCalls()).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('does not confuse the server Thread read with a Product or purchase grant', async () => {
    const { fetchImpl, service } = fixture(thread);
    await expect(service.readForOfficialReading(binding)).rejects.toMatchObject({
      code: 'API_READER_SCENE_RESPONSE_INVALID',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
