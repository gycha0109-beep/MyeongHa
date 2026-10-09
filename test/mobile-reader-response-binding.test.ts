import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';

import { MyeongHaApiClientErrorV1, MyeongHaApiClientV1 } from '../packages/api-client/src/index.js';
import {
  createMobileReaderInterpretationServiceV1,
} from '../apps/mobile/src/features/reading/mobile-reader-interpretation-service.js';
import {
  classifyMobileReaderVerificationFailureV1,
} from '../apps/mobile/src/features/reading/mobile-reader-response-binding.js';

const threadId = '33333333-3333-4333-8333-333333333333';
const readingId = '44444444-4444-4444-8444-444444444444';
const request = {
  threadId,
  officialReading: { readingId, sajuDomain: 'general' },
  expectedReaderId: 'seyeon' as const,
};
const response = {
  schemaVersion: 'myeongha-reader-interpretation-preview-http-v1',
  lifecycle: 'preview',
  mode: 'reader_interpretation',
  officialReadingId: readingId,
  readerCharacterId: 'seyeon',
  domain: 'general',
  interpretationHash: 'sha256:v1:' + 'a'.repeat(64),
  utterance: {
    characterId: 'seyeon',
    requestedDomain: 'general',
    segments: [{ kind: 'character_reaction', text: '하나씩 살펴볼게요.' }],
  },
};

function testService(serverResponse: unknown) {
  const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json({ ok: true, data: serverResponse }));
  const withActiveBearer = vi.fn(async <T>(operation: (token: string) => Promise<T>) =>
    operation('server-authenticated-subject-token'));
  const service = createMobileReaderInterpretationServiceV1({
    client: new MyeongHaApiClientV1({ origin: 'https://myeongha.test', fetchImpl }),
    session: { withActiveBearer },
    publicRouteActivated: true,
  });
  return { service, fetchImpl, withActiveBearer };
}

describe('mobile M3-beta-1 Reader response authority matching', () => {
  it('keeps the native Reader route OFF even when reading identity is known', async () => {
    const fetchImpl = vi.fn();
    const withActiveBearer = vi.fn();
    const service = createMobileReaderInterpretationServiceV1({
      client: new MyeongHaApiClientV1({ origin: 'https://myeongha.test', fetchImpl }),
      session: { withActiveBearer },
    });
    await expect(service.readForOfficialReading(request)).rejects.toMatchObject({
      code: 'CLIENT_READER_SCENE_UNAVAILABLE',
    });
    expect(withActiveBearer).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('matches server response to exact Official Reading, Reader and Saju domain', async () => {
    const { service, fetchImpl, withActiveBearer } = testService(response);
    await expect(service.readForOfficialReading(request)).resolves.toMatchObject({
      mode: 'reader_interpretation',
      readerCharacterId: 'seyeon',
      officialReadingId: readingId,
      domain: 'general',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(withActiveBearer).toHaveBeenCalledTimes(1);
    const init = fetchImpl.mock.calls[0]?.[1];
    expect(init).toBeDefined();
    expect(JSON.parse(String(init?.body))).toEqual({
      threadId,
      officialReadingId: readingId,
    });
  });

  it('rejects another Reader without interpreting a valid transport result as a grant', async () => {
    const { service } = testService({ ...response, readerCharacterId: 'baekheon',
      utterance: { ...response.utterance, characterId: 'baekheon' } });
    await expect(service.readForOfficialReading(request)).rejects.toMatchObject({
      code: 'CLIENT_READER_SCENE_BINDING_MISMATCH',
    });
  });

  it('rejects changed domain and stale Official Reading identity', async () => {
    const wrongDomain = testService({ ...response, domain: 'family',
      utterance: { ...response.utterance, requestedDomain: 'family' } });
    await expect(wrongDomain.service.readForOfficialReading(request)).rejects.toMatchObject({
      code: 'CLIENT_READER_SCENE_BINDING_MISMATCH',
    });
    const wrongReading = testService({ ...response,
      officialReadingId: '55555555-5555-4555-8555-555555555555' });
    await expect(wrongReading.service.readForOfficialReading(request)).rejects.toMatchObject({
      code: 'API_READER_SCENE_RESPONSE_INVALID',
    });
  });

  it('preserves protected fallback as fallback rather than fabricated interpretation', async () => {
    const fallback = testService({
      ...response,
      mode: 'protected_fallback',
      fallbackReason: 'semantic_guard_failed',
      utterance: response.utterance,
    });
    await expect(fallback.service.readForOfficialReading(request)).rejects.toMatchObject({
      code: 'API_READER_SCENE_RESPONSE_INVALID',
    });
    const { utterance: _unused, ...noUtterance } = response;
    const validFallback = testService({
      ...noUtterance,
      mode: 'protected_fallback',
      fallbackReason: 'semantic_guard_failed',
    });
    await expect(validFallback.service.readForOfficialReading(request)).resolves.toMatchObject({
      mode: 'protected_fallback',
      fallbackReason: 'semantic_guard_failed',
    });
  });

  it('uses generic failure presentation rather than inferring product or purchase denials', async () => {
    expect(classifyMobileReaderVerificationFailureV1(
      new MyeongHaApiClientErrorV1('network', 'API_NETWORK_FAILED', 'network', null, true),
    )).toBe('retryable_failure');
    expect(classifyMobileReaderVerificationFailureV1(
      new MyeongHaApiClientErrorV1('http', 'ACCESS_DENIED', 'denied', 403),
    )).toBe('protected_failure');
    expect(classifyMobileReaderVerificationFailureV1(new Error('unknown'))).toBe('protected_failure');
    const [native, entry] = await Promise.all([
      readFile(new URL('../apps/mobile/src/features/reading/native-mobile-reader-interpretation-service.ts', import.meta.url), 'utf8'),
      readFile(new URL('../apps/mobile/src/features/reading/MobileOfficialReadingReaderEntry.tsx', import.meta.url), 'utf8'),
    ]);
    expect(native).not.toContain('publicRouteActivated: true');
    expect(entry).not.toContain('readForOfficialReading(');
  });
});
