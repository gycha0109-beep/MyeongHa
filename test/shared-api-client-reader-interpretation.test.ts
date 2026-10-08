import { describe, expect, it, vi } from 'vitest';
import {
  MyeongHaApiClientV1,
  parseReaderInterpretationPreviewV1,
  readReaderInterpretationPreviewV1,
} from '../packages/api-client/src/index.js';

const threadId = '33333333-3333-4333-8333-333333333333';
const officialReadingId = '44444444-4444-4444-8444-444444444444';
const interpretationHash = 'sha256:v1:' + 'a'.repeat(64);

function interpretation() {
  return {
    schemaVersion: 'myeongha-reader-interpretation-preview-http-v1',
    lifecycle: 'preview', mode: 'reader_interpretation',
    officialReadingId, readerCharacterId: 'seyeon',
    domain: 'general', interpretationHash,
    utterance: {
      characterId: 'seyeon', requestedDomain: 'general',
      segments: [{ kind: 'character_reaction', text: '이야기를 시작해 볼까요?' }],
    },
  };
}
function client(fetchImpl: typeof fetch) {
  return new MyeongHaApiClientV1({ origin: 'https://myeongha.test', fetchImpl });
}
function success(data: unknown) { return Response.json({ ok: true, data }); }

describe('shared Reader Interpretation transport, server-authored identity only', () => {
  it('fails closed with no request when public Reader route has not been released', async () => {
    const fetchImpl = vi.fn();
    await expect(readReaderInterpretationPreviewV1(client(fetchImpl), 'member-token',
      { threadId, officialReadingId })).rejects.toMatchObject({
        code: 'CLIENT_READER_SCENE_UNAVAILABLE',
      });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('sends only canonical identifiers with bearer after explicit activation', async () => {
    let headers: Headers | null = null;
    let body: unknown = null;
    let method = '';
    let path = '';
    const fetchImpl: typeof fetch = async (url, init) => {
      headers = new Headers(init?.headers);
      body = JSON.parse(String(init?.body));
      method = init?.method ?? '';
      path = new URL(String(url)).pathname;
      return success(interpretation());
    };
    await expect(readReaderInterpretationPreviewV1(client(fetchImpl), 'member-token',
      { threadId, officialReadingId }, { publicRouteActivated: true }))
      .resolves.toMatchObject({ mode: 'reader_interpretation', readerCharacterId: 'seyeon' });
    expect(method).toBe('POST');
    expect(path).toBe('/api/me/readings/reader-interpretation/preview');
    expect((headers as Headers | null)?.get('Authorization')).toBe('Bearer member-token');
    expect(body).toEqual({ threadId, officialReadingId });
  });

  it('rejects any presentation hint or privilege claim before contacting the server', async () => {
    const fetchImpl = vi.fn();
    await expect(readReaderInterpretationPreviewV1(client(fetchImpl), 'bearer',
      { threadId, officialReadingId, readerCharacterId: 'baekheon' },
      { publicRouteActivated: true })).rejects.toMatchObject({
        code: 'API_READER_SCENE_RESPONSE_INVALID',
      });
    await expect(readReaderInterpretationPreviewV1(client(fetchImpl), 'bearer',
      { threadId: 'forged', officialReadingId },
      { publicRouteActivated: true })).rejects.toMatchObject({
        code: 'CLIENT_READER_SCENE_REQUEST_INVALID',
      });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('preserves protected fallback without creating any interpretation text', () => {
    const { utterance: _utterance, ...base } = interpretation();
    const result = parseReaderInterpretationPreviewV1({
      ...base, mode: 'protected_fallback', fallbackReason: 'semantic_guard_failed',
    }, officialReadingId);
    expect(result).toMatchObject({ mode: 'protected_fallback', fallbackReason: 'semantic_guard_failed' });
    expect(result).not.toHaveProperty('utterance');
  });

  it('fails on reading substitution, Reader mismatch, domain mismatch, or private provenance', () => {
    const base = interpretation();
    const wrongId = '55555555-5555-4555-8555-555555555555';
    const payloads = [
      { ...base, officialReadingId: wrongId },
      { ...base, utterance: { ...base.utterance, characterId: 'baekheon' } },
      { ...base, utterance: { ...base.utterance, requestedDomain: 'career' } },
      { ...base, groundingHash: 'secret' },
      { ...base, interpretationHash: 'invalid' },
      { ...base, utterance: { ...base.utterance, segments: [{ kind: 'unknown', text: 'oops' }] } },
    ];
    for (const payload of payloads) {
      expect(() => parseReaderInterpretationPreviewV1(payload, officialReadingId))
        .toThrowError();
    }
  });
});
