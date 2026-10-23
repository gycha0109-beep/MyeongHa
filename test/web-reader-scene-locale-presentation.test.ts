import { describe, expect, it, vi } from 'vitest';
import { ReaderRuntimeClientErrorV1 } from '../apps/web/reader-runtime-client.js';
import {
  projectReaderSceneLocalePresentationV1,
} from '../apps/web/reader-scene-locale-presentation-v1.js';
import {
  createReaderSceneControllerV1,
} from '../apps/web/reader-scene-controller.js';
import {
  projectReaderSceneViewModelV1,
  parseReaderSceneEnvelopeV1,
} from '../apps/web/reader-scene-contract.js';

const source = {
  schemaVersion: 'myeongha-reader-interpretation-preview-http-v1',
  lifecycle: 'preview',
  mode: 'reader_interpretation',
  officialReadingId: '44444444-4444-4444-8444-444444444444',
  readerCharacterId: 'taegyeom',
  domain: 'career',
  interpretationHash: 'sha256:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  utterance: {
    characterId: 'taegyeom',
    requestedDomain: 'career',
    segments: [
      { kind: 'semantic_realization', text: '원문 명리 해석입니다.' },
      { kind: 'protected_disclosure', text: '확정적 결론이 아닙니다.' },
    ],
  },
} as const;

describe('I18N-06 Reader Scene UI vs source language handoff', () => {
  it('projects authored locale metadata but leaves source text and provenance unchanged', () => {
    const scene = parseReaderSceneEnvelopeV1(source);
    if (scene.mode !== 'reader_interpretation') {
      throw new Error('Expected source-owned Reader interpretation');
    }
    const view = projectReaderSceneViewModelV1(scene);
    for (const [requested, expected] of [
      ['ko-KR', 'ko-KR'], ['ja-JP', 'ja-JP'],
      ['zh-TW', 'zh-TW'], ['zh-CN', 'ko-KR'],
    ] as const) {
      const projected = projectReaderSceneLocalePresentationV1(view, requested);
      expect(projected.uiLocale).toBe(expected);
      expect(projected.contentLanguage).toBe('source_unasserted');
      expect(projected.localizedReaderOutput).toBe(false);
      expect(projected.originalContentPreserved).toBe(true);
      expect(projected.segments).toBe(view.segments);
      expect(projected.segments).toBe(scene.utterance.segments);
      expect(projected.readerCharacterId).toBe('taegyeom');
      expect(projected.officialReadingId).toBe(source.officialReadingId);
      expect(projected.interpretationHash).toBe(source.interpretationHash);
      expect(projected.sourceLanguageNotice.length).toBeGreaterThan(5);
      expect(Object.isFrozen(projected)).toBe(true);
    }
  });

  it('keeps protected fallback protected when UI language changes', () => {
    const { utterance: _omitted, ...base } = source;
    const fallback = parseReaderSceneEnvelopeV1({
      ...base, mode: 'protected_fallback', fallbackReason: 'semantic_guard_failed',
    });
    expect(fallback.mode).toBe('protected_fallback');
    if (fallback.mode !== 'protected_fallback') throw new Error('Expected fallback');
    const projected = projectReaderSceneLocalePresentationV1(
      projectReaderSceneViewModelV1(fallback), 'ja-JP',
    );
    expect(projected.state).toBe('protected_fallback');
    expect(projected.segments).toEqual([]);
    expect(projected.localizedReaderOutput).toBe(false);
  });

  it('captures UI locale at request start rather than relabeling late original messages', async () => {
    let resolve!: (value: ReturnType<typeof parseReaderSceneEnvelopeV1>) => void;
    const pending = new Promise<ReturnType<typeof parseReaderSceneEnvelopeV1>>(res => {
      resolve = res;
    });
    let uiLocale = 'ja-JP';
    const states: Array<{ state: string; [key: string]: unknown }> = [];
    const client = { readReaderScene: vi.fn().mockReturnValue(pending) };
    const controller = createReaderSceneControllerV1({
      client,
      getUiLocale: () => uiLocale,
      onState: state => states.push(state),
    });
    const completion = controller.load({
      threadId: 'thread-a', officialReadingId: source.officialReadingId,
    });
    uiLocale = 'zh-TW';
    resolve(parseReaderSceneEnvelopeV1(source));
    const result = await completion;
    expect(result.state).toBe('ready');
    if (result.state !== 'ready') throw new Error('Expected bounded scene');
    expect(result.uiLocale).toBe('ja-JP');
    expect(result.localizedReaderOutput).toBe(false);
    expect(result.segments.map(segment => segment.text)).toEqual([
      '원문 명리 해석입니다.', '확정적 결론이 아닙니다.',
    ]);
    expect(client.readReaderScene).toHaveBeenCalledTimes(1);
    expect(client.readReaderScene.mock.calls[0]?.[0].uiLocale).toBe('ja-JP');
    expect(states[0]?.state).toBe('loading');
  });

  it('takes a fresh UI-only locale snapshot on retry without modifying the original Reader source', async () => {
    let uiLocale = 'ja-JP';
    const client = {
      readReaderScene: vi.fn()
        .mockRejectedValueOnce(
          new ReaderRuntimeClientErrorV1('READER_SERVICE_UNAVAILABLE', 'temporary', true),
        )
        .mockResolvedValueOnce(parseReaderSceneEnvelopeV1(source)),
    };
    const controller = createReaderSceneControllerV1({
      client,
      getUiLocale: () => uiLocale,
      onState: vi.fn(),
    });
    const input = {
      threadId: 'thread-same',
      officialReadingId: source.officialReadingId,
    };

    expect((await controller.load(input)).state).toBe('retryable_error');
    uiLocale = 'zh-TW';
    const retried = await controller.retry();
    expect(retried.state).toBe('ready');
    if (retried.state !== 'ready') throw new Error('Expected original Reader response');
    expect(retried.uiLocale).toBe('zh-TW');
    expect(retried.localizedReaderOutput).toBe(false);
    expect(retried.segments.map(segment => segment.text)).toEqual([
      '원문 명리 해석입니다.', '확정적 결론이 아닙니다.',
    ]);
    expect(client.readReaderScene).toHaveBeenCalledTimes(2);
    expect(client.readReaderScene.mock.calls[0]?.[0]).toMatchObject(input);
    expect(client.readReaderScene.mock.calls[1]?.[0]).toMatchObject(input);
    expect(client.readReaderScene.mock.calls[0]?.[0].uiLocale).toBe('ja-JP');
    expect(client.readReaderScene.mock.calls[1]?.[0].uiLocale).toBe('zh-TW');
    expect(client.readReaderScene.mock.calls[1]?.[0]).not.toHaveProperty('readerLocale');
    expect(client.readReaderScene.mock.calls[1]?.[0]).not.toHaveProperty('readingLocale');
  });

  it('never replaces newer locale presentation with an older in-flight response', async () => {
    let resolveOld!: (value: ReturnType<typeof parseReaderSceneEnvelopeV1>) => void;
    const oldResponse = new Promise<ReturnType<typeof parseReaderSceneEnvelopeV1>>(
      resolve => { resolveOld = resolve; },
    );
    let uiLocale = 'ja-JP';
    const client = {
      readReaderScene: vi.fn()
        .mockReturnValueOnce(oldResponse)
        .mockResolvedValueOnce(parseReaderSceneEnvelopeV1(source)),
    };
    const controller = createReaderSceneControllerV1({
      client,
      getUiLocale: () => uiLocale,
      onState: vi.fn(),
    });
    const input = {
      threadId: 'thread-same',
      officialReadingId: source.officialReadingId,
    };
    const old = controller.load(input);
    uiLocale = 'zh-TW';
    const recent = await controller.load(input);
    expect(recent.state).toBe('ready');
    if (recent.state !== 'ready') throw new Error('Expected recent Reader response');
    expect(recent.uiLocale).toBe('zh-TW');
    resolveOld(parseReaderSceneEnvelopeV1(source));
    const settledOld = await old;
    expect(settledOld).toBe(recent);
    expect(controller.getState()).toBe(recent);
    expect(recent.segments.map(segment => segment.text)).toEqual([
      '원문 명리 해석입니다.', '확정적 결론이 아닙니다.',
    ]);
    expect(client.readReaderScene).toHaveBeenCalledTimes(2);
    expect(client.readReaderScene.mock.calls[0]?.[0].uiLocale).toBe('ja-JP');
    expect(client.readReaderScene.mock.calls[1]?.[0].uiLocale).toBe('zh-TW');
  });

  it('does not treat UI locale or character display hints as output-language authorization', async () => {
    const client = {
      readReaderScene: vi.fn().mockResolvedValue(parseReaderSceneEnvelopeV1(source)),
    };
    const controller = createReaderSceneControllerV1({
      client,
      getUiLocale: () => 'zh-TW',
      onState: vi.fn(),
    });
    const result = await controller.load({
      threadId: 'thread-b', officialReadingId: source.officialReadingId,
    });
    expect(result.state).toBe('ready');
    if (result.state !== 'ready') throw new Error('Expected bounded scene');
    expect(result.uiLocale).toBe('zh-TW');
    expect(result.readerCharacterId).toBe('taegyeom');
    expect(result.contentLanguage).toBe('source_unasserted');
    expect(result.localizedReaderOutput).toBe(false);
    expect(client.readReaderScene.mock.calls[0]?.[0]).toMatchObject({
      threadId: 'thread-b', officialReadingId: source.officialReadingId,
    });
    expect(client.readReaderScene.mock.calls[0]?.[0]).not.toHaveProperty('readingLocale');
    expect(client.readReaderScene.mock.calls[0]?.[0]).not.toHaveProperty('readerLocale');
  });
});
