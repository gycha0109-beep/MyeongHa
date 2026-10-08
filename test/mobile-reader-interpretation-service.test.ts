import { describe, expect, it, vi } from 'vitest';
import { MyeongHaApiClientV1 } from '../packages/api-client/src/index.js';
import {
  createMobileReaderInterpretationServiceV1,
} from '../apps/mobile/src/features/reading/mobile-reader-interpretation-service.js';

const request = {
  threadId: '33333333-3333-4333-8333-333333333333',
  officialReadingId: '44444444-4444-4444-8444-444444444444',
};
const data = {
  schemaVersion: 'myeongha-reader-interpretation-preview-http-v1',
  lifecycle: 'preview', mode: 'reader_interpretation',
  officialReadingId: request.officialReadingId,
  readerCharacterId: 'baekheon', domain: 'general',
  interpretationHash: 'sha256:v1:' + 'b'.repeat(64),
  utterance: {
    characterId: 'baekheon', requestedDomain: 'general',
    segments: [{ kind: 'character_reaction', text: '핵심부터 짚겠습니다.' }],
  },
};

describe('native Reader Interpretation contract boundary', () => {
  it('does not resolve Guest/Member or fetch while public activation is absent', async () => {
    const fetchImpl = vi.fn();
    const withActiveBearer = vi.fn();
    const service = createMobileReaderInterpretationServiceV1({
      client: new MyeongHaApiClientV1({ origin: 'https://myeongha.test', fetchImpl }),
      session: { withActiveBearer },
    });
    await expect(service.read(request)).rejects.toMatchObject({
      code: 'CLIENT_READER_SCENE_UNAVAILABLE',
    });
    expect(withActiveBearer).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('uses active subject bearer and no guessed Reader identity in a gated test', async () => {
    let observedBody: unknown;
    let auth: string | null = null;
    const service = createMobileReaderInterpretationServiceV1({
      publicRouteActivated: true,
      client: new MyeongHaApiClientV1({
        origin: 'https://myeongha.test',
        fetchImpl: async (_, init) => {
          auth = new Headers(init?.headers).get('Authorization');
          observedBody = JSON.parse(String(init?.body));
          return Response.json({ ok: true, data });
        },
      }),
      session: {
        async withActiveBearer(operation) {
          return operation('current-member-token');
        },
      },
    });
    await expect(service.read(request)).resolves.toMatchObject({
      mode: 'reader_interpretation', readerCharacterId: 'baekheon',
    });
    expect(auth).toBe('Bearer current-member-token');
    expect(observedBody).toEqual(request);
  });

  it('native singleton remains hard-disabled even if web Reader display is selectable', async () => {
    const src = await import('node:fs/promises').then(({ readFile }) =>
      readFile(new URL('../apps/mobile/src/features/reading/native-mobile-reader-interpretation-service.ts', import.meta.url), 'utf8'));
    expect(src).toContain('createMobileReaderInterpretationServiceV1');
    expect(src).not.toContain('publicRouteActivated: true');
    const config = await import('node:fs/promises').then(({ readFile }) =>
      readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
    const rewrites = (JSON.parse(config) as { rewrites?: { source: string }[] }).rewrites ?? [];
    expect(rewrites.some((item) =>
      item.source === '/api/me/readings/reader-interpretation/preview')).toBe(false);
  });
});
