import { describe, expect, it } from 'vitest';
import { CHARACTER_RUNTIME_AUTHORING_V1 } from './runtime-authoring-v1.js';
import { resolveCharacterVoiceAuthorityV1 } from './character-voice-continuity-v1.js';
import {
  READER_VOICE_ALIGNMENT_DIAGNOSTICS_V1,
  READER_LANGUAGE_NEUTRAL_VOICE_HANDOFF_VERSION_V1,
  prepareReaderLanguageNeutralVoiceHandoffV1,
} from './reader-language-neutral-voice-handoff-v1.js';

const published = CHARACTER_RUNTIME_AUTHORING_V1.map(authoring => ({
  characterId: authoring.characterId,
  contentVersion: `test-published-${authoring.characterId}-v1`,
  speech: authoring.speech,
  persona: authoring.persona,
}));

describe('I18N-06 nine-Character language-neutral Reader voice handoff', () => {
  it('keeps nine legacy source identities but admits only source-backed voice decisions', () => {
    expect(published).toHaveLength(9);
    expect(Object.keys(READER_VOICE_ALIGNMENT_DIAGNOSTICS_V1)).toEqual(
      published.map(entry => entry.characterId),
    );
    for (const character of published) {
      for (const surface of ['general_chat', 'saju_product', 'face_product'] as const) {
        const source = resolveCharacterVoiceAuthorityV1(character, surface);
        const result = prepareReaderLanguageNeutralVoiceHandoffV1({
          selectedCharacterId: character.characterId,
          voiceAuthority: source,
        });
        if (character.characterId === 'seorin' || character.characterId === 'mira') {
          expect(result).toEqual({ state: 'hold', reason: 'character_voice_cleared' });
          continue;
        }
        if (character.characterId === 'doyun') {
          expect(result).toEqual({ state: 'hold', reason: 'bible_source_not_available' });
          continue;
        }
        expect(result.state).toBe('prepared');
        if (result.state !== 'prepared') throw new Error('Expected source-backed handoff');
        expect(result.schemaVersion).toBe(READER_LANGUAGE_NEUTRAL_VOICE_HANDOFF_VERSION_V1);
        expect(result.voiceAuthority).toBe(source);
        expect(result.voiceAuthority.speech).toBe(character.speech);
        expect(result.voiceAuthority.communication).toBe(character.persona.communication);
        expect(result.contentVersion).toBe(character.contentVersion);
        expect(result.outputAuthority).toBe('existing_published_character_content_only');
        expect(result.foreignLanguageRelease).toBe('hold');
        expect(result.localeStyle).toBe('not_authored');
        expect('pronoun' in result).toBe(false);
        expect('prompt' in result).toBe(false);
        expect('newClaim' in result).toBe(false);
      }
    }
  });

  it('tracks the user decision instead of preserving stale reconciliation blockers', () => {
    expect(
      Object.entries(READER_VOICE_ALIGNMENT_DIAGNOSTICS_V1)
        .filter(([, state]) => state === 'bible_aligned')
        .map(([id]) => id),
    ).toEqual(['seyeon', 'yeoul', 'baekheon']);
    expect(
      Object.entries(READER_VOICE_ALIGNMENT_DIAGNOSTICS_V1)
        .filter(([, state]) => state === 'settings_cleared')
        .map(([id]) => id),
    ).toEqual(['seorin', 'mira']);
    expect(READER_VOICE_ALIGNMENT_DIAGNOSTICS_V1.doyun).toBe('bible_only');
    expect(
      Object.entries(READER_VOICE_ALIGNMENT_DIAGNOSTICS_V1)
        .filter(([, state]) => state === 'no_material_difference_flagged')
        .map(([id]) => id),
    ).toEqual(['rahyeon', 'taegyeom', 'yunho']);
  });

  it('holds unknown, mismatched, and forged voices', () => {
    const source = resolveCharacterVoiceAuthorityV1(published[0]!, 'general_chat');
    expect(prepareReaderLanguageNeutralVoiceHandoffV1({
      selectedCharacterId: 'unknown',
      voiceAuthority: source,
    })).toEqual({ state: 'hold', reason: 'unknown_character' });
    expect(prepareReaderLanguageNeutralVoiceHandoffV1({
      selectedCharacterId: 'yeoul',
      voiceAuthority: source,
    })).toEqual({ state: 'hold', reason: 'voice_identity_mismatch' });
    expect(prepareReaderLanguageNeutralVoiceHandoffV1({
      selectedCharacterId: 'seyeon',
      voiceAuthority: { ...source, source: 'request_header' } as unknown as typeof source,
    })).toEqual({ state: 'hold', reason: 'invalid_published_voice' });
    expect(prepareReaderLanguageNeutralVoiceHandoffV1({
      selectedCharacterId: 'seyeon',
      voiceAuthority: { ...source, contentVersion: '  ' },
    })).toEqual({ state: 'hold', reason: 'invalid_published_voice' });
  });
});
