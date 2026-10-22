import { describe, expect, it, vi } from 'vitest';
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
    const view = projectReaderSceneViewModelV1(scene);
    for (const [requested, expected] of [
      ['ko-KR', 'ko-KR'], ['ja-JP', 'ja-JP'],
      ['zh-TW', 'zh-TW'], ['zh-CN', 'ko-KR'],
    ]) {
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
    expect(states[0]?.state).toBe('loading');
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
