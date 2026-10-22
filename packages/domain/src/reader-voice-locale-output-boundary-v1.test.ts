import { describe, expect, it } from 'vitest';
import {
  CHARACTER_RUNTIME_AUTHORING_V1,
  resolveCharacterVoiceAuthorityV1,
  type CharacterConversationSurfaceV1,
} from '../../character-content/src/index.js';
import {
  inspectReaderVoiceLocaleOutputBoundaryV1,
  type ReaderVoiceLocaleOfficialSourceEvidenceV1,
  type ReaderVoiceLocaleOutputEvidenceV1,
} from './reader-voice-locale-output-boundary-v1.js';

const source = Object.freeze({
  readingRef: 'official-reading-42',
  officialArtifactResponseHash: 'sha256:v1:abc123',
  sourceSemanticHash: 'semantic-original-v1',
  scopedSourceUnitRefs: Object.freeze(['unit-a', 'unit-b']),
  requiredQualifierRefs: Object.freeze(['epistemic-may']),
  requiredConditionRefs: Object.freeze(['period-limited']),
  requiredAmbiguityRefs: Object.freeze(['birth-time-uncertain']),
  requiredDisclosureRefs: Object.freeze(['method-limit']),
});
const official: ReaderVoiceLocaleOfficialSourceEvidenceV1 = Object.freeze({
  channel: 'reader_follow_up',
  officialSource: source,
  presentedSource: source,
});

function makeFixture(
  characterId = 'seyeon',
  surface: CharacterConversationSurfaceV1 = 'general_chat',
  locale = 'ko-KR',
) {
  const character = CHARACTER_RUNTIME_AUTHORING_V1.find(
    candidate => candidate.characterId === characterId,
  );
  if (!character) throw new Error('Unknown test Character');
  const published = {
    characterId: character.characterId,
    contentVersion: `test-published-${character.characterId}-v1`,
    speech: character.speech,
    persona: character.persona,
  };
  const voiceAuthority = resolveCharacterVoiceAuthorityV1(published, surface);
  const evidence: ReaderVoiceLocaleOutputEvidenceV1 = {
    characterId: published.characterId,
    sourceContentVersion: published.contentVersion,
    surface,
    responseLocale: locale,
    appliedStyleRefs: [],
    activeContextRuleRefs: [],
    introducedRealityFactKeys: [],
    authorizedRealityFactKeys: [],
    proseStageDirections: [],
  };
  return {
    selectedCharacterId: published.characterId,
    voiceAuthority,
    requestedVoiceLocale: locale,
    evidence,
    ...(surface === 'saju_product' ? { officialReading: official } : {}),
  };
}

describe('I18N-06d Reader voice/locale/source output evidence boundary', () => {
  it('preserves existing Korean pipeline for nine Characters on every product surface', () => {
    expect(CHARACTER_RUNTIME_AUTHORING_V1).toHaveLength(9);
    for (const character of CHARACTER_RUNTIME_AUTHORING_V1) {
      for (const surface of [
        'general_chat', 'saju_product', 'face_product',
      ] as const) {
        const input = makeFixture(character.characterId, surface);
        expect(inspectReaderVoiceLocaleOutputBoundaryV1(input)).toEqual({
          state: 'korean_existing_unchanged',
          schemaVersion: 'reader-voice-locale-output-boundary-v1',
          characterId: character.characterId,
          sourceContentVersion: input.voiceAuthority.contentVersion,
          release: 'existing_owner_guards_only',
          semanticValidity: 'not_attested_by_i18n',
        });
      }
    }
  });

  it('never grants Japanese or Taiwan Traditional Chinese Reader output', () => {
    for (const character of CHARACTER_RUNTIME_AUTHORING_V1) {
      for (const locale of ['ja-JP', 'zh-TW']) {
        const decision = inspectReaderVoiceLocaleOutputBoundaryV1(
          makeFixture(character.characterId, 'saju_product', locale),
        );
        expect(decision).toEqual({
          state: 'hold',
          reason: 'non_korean_release_not_admitted',
          foreignRelease: 'hold',
        });
        expect('text' in decision).toBe(false);
        expect('prompt' in decision).toBe(false);
        expect('releaseAuthorized' in decision).toBe(false);
      }
    }
  });

  it('rejects attempts to apply an unapproved locale style or pseudo-Character persona', () => {
    const input = makeFixture('yeoul', 'general_chat', 'ja-JP');
    for (const ref of [
      'ja.first_person.guessed',
      'ja.gendered_sentence_final',
      'zh_tw.nickname.guessed',
    ]) {
      expect(inspectReaderVoiceLocaleOutputBoundaryV1({
        ...input,
        evidence: { ...input.evidence, appliedStyleRefs: [ref] },
      })).toEqual({
        state: 'hold',
        reason: 'unapproved_style_reference',
        foreignRelease: 'hold',
      });
    }
    expect(inspectReaderVoiceLocaleOutputBoundaryV1({
      ...makeFixture(),
      evidence: { ...makeFixture().evidence, appliedStyleRefs: ['unapproved-ko-style'] },
    })).toMatchObject({ state: 'hold', reason: 'unapproved_style_reference' });
  });

  it('rejects a guessed situation condition and cannot activate style by assertion', () => {
    const input = makeFixture('rahyeon', 'general_chat', 'ja-JP');
    expect(inspectReaderVoiceLocaleOutputBoundaryV1({
      ...input,
      evidence: {
        ...input.evidence,
        activeContextRuleRefs: ['unapproved.relationship.familiar'],
      },
    })).toMatchObject({ state: 'hold', reason: 'unapproved_context_condition' });
    expect(inspectReaderVoiceLocaleOutputBoundaryV1({
      ...input,
      evidence: {
        ...input.evidence,
        activeContextRuleRefs: ['unapproved.relationship.familiar'],
        appliedStyleRefs: ['ja.styled-familiar'],
      },
    })).toMatchObject({ state: 'hold', reason: 'unapproved_context_condition' });
  });

  it('holds forged Character ID, stale Bible and a different product voice surface', () => {
    const input = makeFixture('taegyeom', 'face_product');
    expect(inspectReaderVoiceLocaleOutputBoundaryV1({
      ...input,
      evidence: { ...input.evidence, characterId: 'yunho' },
    })).toMatchObject({ state: 'hold', reason: 'voice_identity_mismatch' });
    expect(inspectReaderVoiceLocaleOutputBoundaryV1({
      ...input,
      evidence: { ...input.evidence, sourceContentVersion: 'stale-v0' },
    })).toMatchObject({ state: 'hold', reason: 'voice_identity_mismatch' });
    expect(inspectReaderVoiceLocaleOutputBoundaryV1({
      ...input,
      evidence: { ...input.evidence, surface: 'saju_product' },
    })).toMatchObject({ state: 'hold', reason: 'voice_surface_mismatch' });
    expect(inspectReaderVoiceLocaleOutputBoundaryV1({
      ...input,
      selectedCharacterId: 'other',
    })).toMatchObject({ state: 'hold', reason: 'neutral_voice_unavailable' });
  });

  it('refuses language evidence inconsistent with the server-owned response locale', () => {
    const input = makeFixture('yunho', 'general_chat', 'ja-JP');
    expect(inspectReaderVoiceLocaleOutputBoundaryV1({
      ...input,
      evidence: { ...input.evidence, responseLocale: 'ko-KR' },
    })).toMatchObject({ state: 'hold', reason: 'locale_evidence_mismatch' });

    expect(inspectReaderVoiceLocaleOutputBoundaryV1({
      ...input, requestedVoiceLocale: 'zh-CN',
    })).toMatchObject({ state: 'hold', reason: 'neutral_voice_unavailable' });
  });

  it('refuses new reality facts, invented stage directions, and product-voice overrides', () => {
    const input = makeFixture('doyun', 'saju_product');
    for (const evidence of [
      { introducedRealityFactKeys: ['invented-house'], authorizedRealityFactKeys: [] },
      { proseStageDirections: ['*grabs user*'] },
      { sajuVoiceOverrideRequested: true },
    ]) {
      expect(inspectReaderVoiceLocaleOutputBoundaryV1({
        ...input, evidence: { ...input.evidence, ...evidence },
      })).toMatchObject({ state: 'hold', reason: 'voice_continuity_failed' });
    }
  });

  it('holds missing, unrelated or mutated Official Reading meaning witnesses', () => {
    const input = makeFixture('seyeon', 'saju_product', 'zh-TW');
    const { officialReading: _omitted, ...noSource } = input;
    expect(inspectReaderVoiceLocaleOutputBoundaryV1(noSource)).toMatchObject({
      state: 'hold', reason: 'official_source_evidence_missing',
    });

    for (const changed of [
      { officialArtifactResponseHash: 'sha256:v1:other' },
      { scopedSourceUnitRefs: ['unit-a'] },
      { requiredQualifierRefs: [] },
      { requiredConditionRefs: [] },
      { requiredAmbiguityRefs: [] },
      { requiredDisclosureRefs: [] },
    ]) {
      expect(inspectReaderVoiceLocaleOutputBoundaryV1({
        ...input,
        officialReading: {
          ...official,
          presentedSource: { ...source, ...changed },
        },
      })).toEqual({
        state: 'hold',
        reason: 'official_source_meaning_changed',
        foreignRelease: 'hold',
      });
    }
    expect(inspectReaderVoiceLocaleOutputBoundaryV1({
      ...makeFixture('seyeon', 'general_chat'),
      officialReading: official,
    })).toMatchObject({ state: 'hold', reason: 'official_source_evidence_unexpected' });
  });

  it('rejects malformed evidence instead of treating empty or duplicate refs as approval', () => {
    const input = makeFixture();
    for (const evidence of [
      { appliedStyleRefs: ['duplicate', 'duplicate'] },
      { activeContextRuleRefs: ['same', 'same'] },
      { activeContextRuleRefs: undefined },
      { unauthorizedRelease: true },
      { authorizedRealityFactKeys: ['duplicate', 'duplicate'] },
      { responseLocale: '' },
      { appliedStyleRefs: 'claimed-by-browser' },
      { sajuVoiceOverrideRequested: 'true' },
    ]) {
      expect(inspectReaderVoiceLocaleOutputBoundaryV1({
        ...input,
        evidence: { ...input.evidence, ...evidence } as ReaderVoiceLocaleOutputEvidenceV1,
      })).toMatchObject({ state: 'hold', reason: 'invalid_output_evidence' });
    }
  });

  it('remains metadata-only even if all Saju source reference sets agree', () => {
    const ko = inspectReaderVoiceLocaleOutputBoundaryV1(
      makeFixture('baekheon', 'saju_product', 'ko-KR'),
    );
    expect(ko.state).toBe('korean_existing_unchanged');
    if (ko.state !== 'korean_existing_unchanged') throw new Error('Unexpected state');
    expect(ko.semanticValidity).toBe('not_attested_by_i18n');
    expect(ko.release).toBe('existing_owner_guards_only');
  });
});
