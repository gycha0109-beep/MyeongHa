import { describe, expect, it } from 'vitest';

import {
  ReaderSceneContractErrorV1,
  parseReaderSceneEnvelopeV1,
  projectReaderSceneViewModelV1,
} from '../apps/web/reader-scene-contract.js';

const base = {
  schemaVersion: 'myeongha-reader-interpretation-preview-http-v1',
  lifecycle: 'preview',
  mode: 'reader_interpretation',
  officialReadingId: '44444444-4444-4444-8444-444444444444',
  readerCharacterId: 'taegyeom',
  domain: 'career',
  interpretationHash: 'sha256:v1:reader-result',
  utterance: {
    characterId: 'taegyeom',
    requestedDomain: 'career',
    segments: [
      { kind: 'character_reaction', text: '확인된 구조부터 보겠습니다.' },
      { kind: 'bounded_guidance', text: '선택 가능성은 남겨 두겠습니다.' },
    ],
  },
};

describe('web Reader Scene contract', () => {
  it('accepts the bounded Reader Interpretation browser DTO', () => {
    expect(parseReaderSceneEnvelopeV1(base)).toEqual(base);
  });

  it('accepts a protected fallback without inventing semantic text', () => {
    const scene = parseReaderSceneEnvelopeV1({
      schemaVersion: base.schemaVersion,
      lifecycle: 'preview',
      mode: 'protected_fallback',
      officialReadingId: '44444444-4444-4444-8444-444444444444',
      readerCharacterId: 'taegyeom',
      domain: 'career',
      interpretationHash: 'sha256:v1:fallback',
      fallbackReason: 'semantic_guard_failed',
    });

    expect(scene).toMatchObject({
      mode: 'protected_fallback',
      fallbackReason: 'semantic_guard_failed',
    });
    expect(scene).not.toHaveProperty('utterance');
  });

  it.each([
    { groundingHash: 'private' },
    { sourceResponseHash: 'private' },
    { readerContentBundleId: 'private' },
  ])('rejects leaked internal provenance fields: %o', (extra) => {
    expect(() => parseReaderSceneEnvelopeV1({ ...base, ...extra })).toThrow(
      ReaderSceneContractErrorV1,
    );
  });

  it('rejects a malformed Official Reading identity at the browser response boundary', () => {
    expect(() => parseReaderSceneEnvelopeV1({
      ...base,
      officialReadingId: 'reading-1',
    })).toThrow(/officialReadingId must be a UUID/u);
  });

  it('rejects non-canonical Saju domains', () => {
    expect(() => parseReaderSceneEnvelopeV1({
      ...base,
      domain: 'general_natal',
      utterance: { ...base.utterance, requestedDomain: 'general_natal' },
    })).toThrow(/domain is unsupported/u);

    expect(() => parseReaderSceneEnvelopeV1({
      ...base,
      utterance: { ...base.utterance, requestedDomain: 'annual' },
    })).toThrow(/requestedDomain is unsupported/u);
  });

  it('rejects Reader identity and domain mismatches inside the utterance', () => {
    expect(() =>
      parseReaderSceneEnvelopeV1({
        ...base,
        utterance: { ...base.utterance, characterId: 'baekheon' },
      }),
    ).toThrow(/character does not match/u);

    expect(() =>
      parseReaderSceneEnvelopeV1({
        ...base,
        utterance: { ...base.utterance, requestedDomain: 'wealth' },
      }),
    ).toThrow(/domain does not match/u);
  });

  it('uses the resolved SRC-36 presentation mapping without promoting presentation identity into runtime authority', () => {
    const viewModel = projectReaderSceneViewModelV1(parseReaderSceneEnvelopeV1(base));

    expect(viewModel).toMatchObject({
      state: 'ready',
      readerCharacterId: 'taegyeom',
      presentation: {
        name: '태겸',
        title: '대리자',
        intro: '',
        generic: false,
      },
    });
    expect(viewModel.presentation).not.toHaveProperty('id');
    expect(viewModel).not.toHaveProperty('presentationHint');
    expect(viewModel).not.toHaveProperty('presentationHintMismatch');
  });
});
