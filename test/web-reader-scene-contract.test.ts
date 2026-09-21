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
  officialReadingId: 'reading-1',
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
      officialReadingId: 'reading-1',
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

  it('uses the server Reader identity even when the presentation hint disagrees', () => {
    const scene = parseReaderSceneEnvelopeV1(base);
    const viewModel = projectReaderSceneViewModelV1(scene, {
      presentationHint: 'baekheon',
      resolvePresentation(characterId) {
        return characterId === 'taegyeom'
          ? { name: '태겸', title: '대리자', intro: '근거부터 보겠습니다.' }
          : null;
      },
    });

    expect(viewModel).toMatchObject({
      state: 'ready',
      readerCharacterId: 'taegyeom',
      presentationHint: 'baekheon',
      presentationHintMismatch: true,
      presentation: {
        id: 'taegyeom',
        name: '태겸',
      },
    });
  });

  it('uses identity-neutral presentation when the server Reader has no web decoration', () => {
    const viewModel = projectReaderSceneViewModelV1(
      parseReaderSceneEnvelopeV1(base),
      { presentationHint: 'taegyeom' },
    );

    expect(viewModel.presentation).toEqual({
      id: 'taegyeom',
      name: '대리자',
      title: '',
      intro: '',
      generic: true,
    });
  });
});
