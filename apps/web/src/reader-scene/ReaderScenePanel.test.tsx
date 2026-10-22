import { readFile } from 'node:fs/promises';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { parseReaderSceneEnvelopeV1, projectReaderSceneViewModelV1 } from '../../reader-scene-contract.js';
import { projectReaderSceneLocalePresentationV1 } from '../../reader-scene-locale-presentation-v1.js';
import { ReaderScenePanel } from './ReaderScenePanel.js';

const original = {
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
      { kind: 'semantic_realization', text: '서버가 제공한 원문입니다. <script>alert(1)</script>' },
      { kind: 'protected_disclosure', text: '반드시 이루어진다는 의미는 아닙니다.' },
    ],
  },
} as const;

function ready(locale: string) {
  return projectReaderSceneLocalePresentationV1(
    projectReaderSceneViewModelV1(parseReaderSceneEnvelopeV1(original)),
    locale,
  );
}

describe('I18N-06e inert Reader Scene panel consumer', () => {
  it('preserves the source segments verbatim and escapes markup rather than translating', () => {
    const state = ready('ja-JP');
    const html = renderToStaticMarkup(createElement(ReaderScenePanel, {
      state,
      uiLocale: 'zh-TW', // newer shell choice must not relabel the original response
    }));
    expect(html).toContain('data-reader-scene-state="ready"');
    expect(html).toContain('data-reader-output-language="source_unasserted"');
    expect(html).toContain('data-reader-output-localized="false"');
    expect(html).toContain('data-reader-scene-source-language-notice');
    expect(html).toContain('data-reader-scene-source-segment="semantic_realization"');
    expect(html).toContain('data-reader-scene-source-segment="protected_disclosure"');
    expect(html).toContain('data-reading-content');
    expect(html).toContain('テギョム'); // approved temporary display-only name, not Reader identity
    expect(html).toContain('翻訳されません');
    expect(html).toContain('서버가 제공한 원문입니다. &lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('반드시 이루어진다는 의미는 아닙니다.');
    expect(html).not.toContain('<script>');
    expect(state.segments[0]?.text).toContain('<script>');
    expect(state.readerCharacterId).toBe('taegyeom');
  });

  it('never displays source utterances when the server responds with protected fallback', () => {
    const { utterance: _omitted, ...base } = original;
    const scene = parseReaderSceneEnvelopeV1({
      ...base, mode: 'protected_fallback', fallbackReason: 'semantic_guard_failed',
    });
    const state = projectReaderSceneLocalePresentationV1(
      projectReaderSceneViewModelV1(scene), 'zh-TW',
    );
    const html = renderToStaticMarkup(createElement(ReaderScenePanel, { state }));
    expect(html).toContain('data-reader-scene-state="protected_fallback"');
    expect(html).toContain('data-reader-scene-protected-fallback');
    expect(html).toContain('引路人');
    expect(html).toContain('原文');
    expect(html).not.toContain('data-reader-scene-segments');
    expect(html).not.toContain('서버가 제공한 원문');
    expect(html).not.toContain('protected_disclosure');
  });

  it('renders failures as UI status only and never enables retry for blocked admission', () => {
    const retry = vi.fn();
    const retryable = renderToStaticMarkup(createElement(ReaderScenePanel, {
      state: { state: 'retryable_error', canRetry: true, code: 'READER_SERVICE_UNAVAILABLE' },
      uiLocale: 'ja-JP',
      onRetry: retry,
    }));
    expect(retryable).toContain('再試行');
    expect(retryable).toContain('<button');
    const denied = renderToStaticMarkup(createElement(ReaderScenePanel, {
      state: { state: 'access_denied', canRetry: false, code: 'READER_ACCESS_DENIED' },
      uiLocale: 'zh-TW',
      onRetry: retry,
    }));
    expect(denied).toContain('沒有權限');
    expect(denied).not.toContain('<button');
    expect(denied).not.toContain('data-reader-scene-segments');
    const unavailable = renderToStaticMarkup(createElement(ReaderScenePanel, {
      state: { state: 'feature_unavailable', canRetry: false, code: 'READER_FEATURE_UNAVAILABLE' },
      uiLocale: 'zh-CN',
    }));
    expect(unavailable).toContain('현재 이 대리자 풀이는 제공되지 않습니다.');
    expect(retry).not.toHaveBeenCalled();
  });

  it('remains an inert component, protecting source text from global static-UI painting', async () => {
    const [i18n, reading, chat, panel] = await Promise.all([
      readFile(new URL('../../ui-i18n.js', import.meta.url), 'utf8'),
      readFile(new URL('../reading-detail/ReadingDetailPage.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../chat/ChatPage.tsx', import.meta.url), 'utf8'),
      readFile(new URL('./ReaderScenePanel.tsx', import.meta.url), 'utf8'),
    ]);
    expect(i18n).toContain('[data-reading-content]');
    expect(panel).toContain('data-reading-content');
    expect(panel).not.toContain('createReaderRuntimeClientV1');
    expect(panel).not.toContain('createReaderSceneControllerV1');
    expect(panel).not.toContain('router.push(');
    expect(reading).not.toContain('ReaderScenePanel');
    expect(chat).not.toContain('ReaderScenePanel');
  });
});
