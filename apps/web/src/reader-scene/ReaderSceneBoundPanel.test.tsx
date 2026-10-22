import { readFile } from 'node:fs/promises';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { createReaderRuntimeClientV1 } from '../../reader-runtime-client.js';
import { parseReaderSceneEnvelopeV1, projectReaderSceneViewModelV1 } from '../../reader-scene-contract.js';
import { projectReaderSceneLocalePresentationV1 } from '../../reader-scene-locale-presentation-v1.js';
import {
  ReaderSceneBoundPanel,
  selectReaderSceneDisplayStateV1,
} from './ReaderSceneBoundPanel.js';

const officialReadingId = '44444444-4444-4444-8444-444444444444';
const threadId = '33333333-3333-4333-8333-333333333333';
const scene = parseReaderSceneEnvelopeV1({
  schemaVersion: 'myeongha-reader-interpretation-preview-http-v1',
  lifecycle: 'preview',
  mode: 'reader_interpretation',
  officialReadingId,
  readerCharacterId: 'baekheon',
  domain: 'general',
  interpretationHash: 'sha256:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  utterance: {
    characterId: 'baekheon',
    requestedDomain: 'general',
    segments: [{ kind: 'protected_disclosure', text: '과거 원문 — 변경하면 안 됩니다.' }],
  },
});
const ready = projectReaderSceneLocalePresentationV1(projectReaderSceneViewModelV1(scene), 'ja-JP');

function readerClient(enabled: boolean, fetchImpl = vi.fn()) {
  return createReaderRuntimeClientV1({
    enabled,
    fetchImpl,
    resolveBearer: vi.fn().mockResolvedValue({ kind: 'member', token: 'not-used' }),
  });
}

describe('I18N-06e Reader Scene controller→panel integration seam', () => {
  it('starts in an inert state without owner admission and makes no Reader request', () => {
    const fetchImpl = vi.fn();
    const client = readerClient(true, fetchImpl);
    const html = renderToStaticMarkup(createElement(ReaderSceneBoundPanel, {
      client,
      ownerBinding: null,
      displayScopeRevision: 'current-session-1',
      getUiLocale: () => 'ja-JP',
    }));
    expect(html).toContain('data-reader-scene-state="idle"');
    expect(html).toContain('表示できる案内人');
    expect(html).not.toContain('data-reader-scene-segments');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('never activates a disabled Reader transport even if someone supplies an owner binding', () => {
    const client = readerClient(false);
    const html = renderToStaticMarkup(createElement(ReaderSceneBoundPanel, {
      client,
      ownerBinding: { threadId, officialReadingId },
      displayScopeRevision: 'current-session-1',
      getUiLocale: () => 'zh-TW',
    }));
    expect(html).toContain('data-reader-scene-state="feature_unavailable"');
    expect(html).toContain('目前尚未提供');
    expect(html).not.toContain('data-reader-scene-segments');
    expect(html).not.toContain('<button');
  });

  it('does not make requests during rendering, even for enabled transport plus owner binding', () => {
    const fetchImpl = vi.fn();
    const client = readerClient(true, fetchImpl);
    const html = renderToStaticMarkup(createElement(ReaderSceneBoundPanel, {
      client,
      ownerBinding: { threadId, officialReadingId },
      displayScopeRevision: 'current-session-1',
      getUiLocale: () => 'zh-TW',
    }));
    expect(html).toContain('data-reader-scene-state="loading"');
    expect(html).not.toContain('과거 원문');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('masks stale source synchronously when the owner scope, client or permission changes', () => {
    const client = readerClient(true);
    const differentClient = readerClient(true);
    const key = JSON.stringify(['session-1', threadId, officialReadingId]);
    const oldView = { client, key, state: ready };
    expect(selectReaderSceneDisplayStateV1(client, key, oldView)).toBe(ready);
    expect(selectReaderSceneDisplayStateV1(client,
      JSON.stringify(['session-2', threadId, officialReadingId]), oldView
    ).state).toBe('loading');
    expect(selectReaderSceneDisplayStateV1(client,
      JSON.stringify(['session-1', threadId, '55555555-5555-4555-8555-555555555555']), oldView
    ).state).toBe('loading');
    expect(selectReaderSceneDisplayStateV1(differentClient, key, oldView).state).toBe('loading');
    expect(selectReaderSceneDisplayStateV1(client, null, oldView).state).toBe('idle');
    const disabled = readerClient(false);
    expect(selectReaderSceneDisplayStateV1(disabled, key, oldView).state).toBe('feature_unavailable');
  });

  it('keeps public Chat and Reading routes disconnected and uses only the owner-supplied ids', async () => {
    const [bound, panel, chat, reading] = await Promise.all([
      readFile(new URL('./ReaderSceneBoundPanel.tsx', import.meta.url), 'utf8'),
      readFile(new URL('./ReaderScenePanel.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../chat/ChatPage.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../reading-detail/ReadingDetailPage.tsx', import.meta.url), 'utf8'),
    ]);
    expect(bound).toContain('createReaderSceneControllerV1({');
    expect(bound).toContain('controller.load({ threadId, officialReadingId })');
    expect(bound).toContain('controller.cancel()');
    expect(bound).toContain('if (active) setSnapshot({ client, key, state });');
    expect(bound).toContain('void controllerRef.current?.retry()');
    expect(bound).not.toContain('enabled: true');
    expect(bound).not.toContain('createReaderRuntimeClientV1');
    expect(bound).not.toContain("window.location");
    expect(bound).not.toContain('readerCharacterId:');
    expect(panel).toContain('data-reading-content');
    expect(chat).not.toContain('ReaderSceneBoundPanel');
    expect(reading).not.toContain('ReaderSceneBoundPanel');
  });
});
