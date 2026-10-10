import { describe, expect, it, vi } from 'vitest';

import { MyeongHaApiClientV1 } from '../packages/api-client/src/index.js';
import {
  createMobileReaderInterpretationServiceV1,
} from '../apps/mobile/src/features/reading/mobile-reader-interpretation-service.js';

const threadId = '33333333-3333-4333-8333-333333333333';
const readingId = '44444444-4444-4444-8444-444444444444';
const binding = Object.freeze({
  threadId,
  officialReading: Object.freeze({ readingId, sajuDomain: 'general' }),
  expectedReaderId: 'seyeon' as const,
});
const threadResponse = Object.freeze({
  threadId, characterId: 'seyeon', contentReleaseId: 'pinned-release',
  contentBundleId: 'pinned-bundle', contentRevision: 1,
  afterSequenceNo: 0, lastSequenceNo: 0, messages: [],
  pagination: { pageSize: 1, hasMore: false, nextAfterSequenceNo: null },
  latestCharacterMessage: null, relationship: null,
});
const previewResponse = Object.freeze({
  schemaVersion: 'myeongha-reader-interpretation-preview-http-v1',
  lifecycle: 'preview', mode: 'reader_interpretation',
  officialReadingId: readingId, readerCharacterId: 'seyeon', domain: 'general',
  interpretationHash: 'sha256:v1:' + 'a'.repeat(64),
  utterance: {
    characterId: 'seyeon', requestedDomain: 'general',
    segments: [{ kind: 'character_reaction', text: '하나씩 살펴볼게요.' }],
  },
});

function deferred() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}

function fixture(blockAt?: 'thread' | 'preview', publicRouteActivated = true) {
  const entered = deferred();
  const blocked = deferred();
  let activeBearer = 'subject-A-session';
  let sessionCalls = 0;
  const paths: string[] = [];
  const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
    const path = new URL(String(url)).pathname;
    paths.push(path);
    if (blockAt === 'thread' && path === '/api/chat/' + threadId) {
      entered.release();
      await blocked.promise;
    }
    if (blockAt === 'preview' && path === '/api/me/readings/reader-interpretation/preview') {
      entered.release();
      await blocked.promise;
    }
    const data = path === '/api/chat/' + threadId ? threadResponse : previewResponse;
    return Response.json({ ok: true, data });
  });
  const service = createMobileReaderInterpretationServiceV1({
    client: new MyeongHaApiClientV1({ origin: 'https://myeongha.test', fetchImpl }),
    publicRouteActivated,
    session: {
      async withActiveBearer<T>(operation: (bearer: string) => Promise<T>): Promise<T> {
        sessionCalls += 1;
        return operation(activeBearer);
      },
    },
  });
  return {
    service, paths, fetchImpl, entered: entered.promise, release: blocked.release,
    changeSession: (bearer: string) => { activeBearer = bearer; },
    sessionCalls: () => sessionCalls,
  };
}

describe('M3-beta-2b mobile Reader session-race suppression', () => {
  it('does not reach Reader interpretation after a Subject switch during Thread preflight', async () => {
    const f = fixture('thread');
    const pending = f.service.readForOfficialReading(binding);
    await f.entered;
    f.changeSession('subject-B-session');
    f.release();

    await expect(pending).rejects.toMatchObject({ code: 'CLIENT_READER_SESSION_CHANGED' });
    expect(f.paths).toEqual(['/api/chat/' + threadId]);
    expect(f.sessionCalls()).toBe(2);
  });

  it('discards a valid Reader scene after sign-out or account switch during generation', async () => {
    const f = fixture('preview');
    const pending = f.service.readForOfficialReading(binding);
    await f.entered;
    f.changeSession('subject-B-session');
    f.release();

    await expect(pending).rejects.toMatchObject({ code: 'CLIENT_READER_SESSION_CHANGED' });
    expect(f.paths).toEqual([
      '/api/chat/' + threadId,
      '/api/me/readings/reader-interpretation/preview',
    ]);
    expect(f.sessionCalls()).toBe(3);
  });

  it('discards the standalone preview result if the active bearer changes in-flight', async () => {
    const f = fixture('preview');
    const pending = f.service.read({ threadId, officialReadingId: readingId });
    await f.entered;
    f.changeSession('subject-B-session');
    f.release();

    await expect(pending).rejects.toMatchObject({ code: 'CLIENT_READER_SESSION_CHANGED' });
    expect(f.paths).toEqual(['/api/me/readings/reader-interpretation/preview']);
    expect(f.sessionCalls()).toBe(2);
  });

  it('preserves a response only if all phases retain the active bearer', async () => {
    const f = fixture();
    await expect(f.service.readForOfficialReading(binding)).resolves.toMatchObject({
      lifecycle: 'preview',
      readerCharacterId: 'seyeon',
      officialReadingId: readingId,
    });
    expect(f.sessionCalls()).toBe(3);
    expect(f.paths).toHaveLength(2);
  });

  it('remains public OFF with zero Subject resolution or network requests', async () => {
    const f = fixture(undefined, false);
    await expect(f.service.readForOfficialReading(binding)).rejects.toMatchObject({
      code: 'CLIENT_READER_SCENE_UNAVAILABLE',
    });
    expect(f.sessionCalls()).toBe(0);
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });
});
