import { describe, expect, it } from 'vitest';
import {
  CHARACTER_SAJU_COMMON_PERSPECTIVE_VERSION_V1,
  resolveCharacterSajuCommonPerspectiveV1,
} from './character-saju-common-perspective.js';
import type { CharacterPerspectiveSourceV1 } from './character-saju-perspective.js';

const ALL_READER_IDS = Object.freeze([
  'seyeon', 'baekheon', 'yeoul', 'seorin', 'rahyeon',
  'mira', 'taegyeom', 'yunho', 'doyun',
] as const);

function source(characterId: string, axes: readonly string[]): CharacterPerspectiveSourceV1 {
  return {
    characterId,
    contentVersion: 'pinned-fixture-content-v1',
    sajuProfile: {
      profileVersion: 'pinned-fixture-saju-v1',
      attentionAxes: axes,
      followUpQuestionStrategies: ['fixture_question'],
      framingStyle: 'fixture',
      uncertaintyResponseStyle: 'fixture',
      insufficientEvidenceResponseStyle: 'fixture',
      referralBehavior: { maySuggestAnotherCharacter: false, conditions: [] },
    },
  } as CharacterPerspectiveSourceV1;
}

describe('common bounded Reader Saju perspective', () => {
  it.each(ALL_READER_IDS)('%s receives the SAME source-neutral selection without special axes', (characterId) => {
    const p = resolveCharacterSajuCommonPerspectiveV1(
      source(characterId, ['some_authored_attention_axis', 'another_unrelated_attention']),
    );
    expect(p.characterId).toBe(characterId);
    expect(p.perspectiveVersion).toBe(CHARACTER_SAJU_COMMON_PERSPECTIVE_VERSION_V1);
    expect(p.attentionBindings).toEqual([]);
    expect(p.attentionOrder).toEqual([]);
    expect(p.preferredNarrativeRoles).toEqual(['primary', 'supporting', 'tension', 'limitation']);
    expect(Object.isFrozen(p)).toBe(true);
  });

  it('does not derive Saju meaning from published Character attention axes', () => {
    const first = resolveCharacterSajuCommonPerspectiveV1(
      source('seyeon', ['long_horizon_balance']),
    );
    const changed = resolveCharacterSajuCommonPerspectiveV1(
      source('seyeon', ['totally_different_character_attention']),
    );
    expect(first).toEqual(changed);
  });

  it('keeps perspective identity bound to the pinned Character and content versions', () => {
    const first = resolveCharacterSajuCommonPerspectiveV1(source('seyeon', []));
    const other = resolveCharacterSajuCommonPerspectiveV1(source('baekheon', []));
    expect(first.selection).toEqual(other.selection);
    expect(first.characterId).not.toBe(other.characterId);
    expect(first.deliveryAuthority.speech).toBe('published_character_speech');
  });

  it('fails when the trusted published Character identity or profile is missing', () => {
    expect(() => resolveCharacterSajuCommonPerspectiveV1(source('', []))).toThrow();
    expect(() => resolveCharacterSajuCommonPerspectiveV1({
      ...source('seyeon', []),
      contentVersion: '',
    })).toThrow();
    expect(() => resolveCharacterSajuCommonPerspectiveV1({
      ...source('seyeon', []),
      sajuProfile: { ...source('seyeon', []).sajuProfile, profileVersion: '' },
    })).toThrow();
  });
});
