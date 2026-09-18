import { describe, expect, it } from 'vitest';

import type { CharacterPerspectiveSourceV1 } from './character-saju-perspective.js';
import {
  CHARACTER_SAJU_FIRST_SLICE_PERSPECTIVE_VERSION_V1,
  resolveCharacterSajuFirstSlicePerspectiveV1,
} from './character-saju-perspective-registry.js';

function source(
  characterId: string,
  attentionAxes: readonly string[],
): CharacterPerspectiveSourceV1 {
  return {
    characterId,
    contentVersion: 'fixture-content-v1',
    sajuProfile: {
      profileVersion: 'character-saju-profile-v1',
      attentionAxes,
      followUpQuestionStrategies: ['fixture_question'],
      framingStyle: 'fixture framing',
      uncertaintyResponseStyle: 'fixture uncertainty',
      insufficientEvidenceResponseStyle: 'fixture evidence boundary',
      referralBehavior: {
        maySuggestAnotherCharacter: false,
        conditions: [],
      },
    },
  } as CharacterPerspectiveSourceV1;
}

describe('first-slice Character Saju perspective registry v1', () => {
  it('maps Taegyeom authored attention to explicit grounding axes', () => {
    const profile = resolveCharacterSajuFirstSlicePerspectiveV1(
      source('taegyeom', ['responsibility', 'boundary', 'consequence']),
    );

    expect(profile).not.toBeNull();
    expect(profile?.perspectiveVersion).toBe(CHARACTER_SAJU_FIRST_SLICE_PERSPECTIVE_VERSION_V1);
    expect(profile?.attentionBindings).toEqual([
      { authoredAttentionAxis: 'responsibility', groundingAxis: 'responsibility' },
      { authoredAttentionAxis: 'boundary', groundingAxis: 'boundary' },
      { authoredAttentionAxis: 'consequence', groundingAxis: 'decision_style' },
    ]);
    expect(profile?.attentionOrder).toEqual(['responsibility', 'boundary', 'decision_style']);
    expect(profile?.interpretationBehavior).toEqual({
      contradictionHandling: 'lead_with_it',
      uncertaintyHandling: 'state_directly',
      adviceStyle: 'action_first',
    });
  });

  it('maps Baekheon authored long-horizon attention to a distinct grounding order', () => {
    const profile = resolveCharacterSajuFirstSlicePerspectiveV1(
      source('baekheon', ['long_cycle', 'accumulated_consequence', 'endurance']),
    );

    expect(profile).not.toBeNull();
    expect(profile?.attentionBindings).toEqual([
      { authoredAttentionAxis: 'long_cycle', groundingAxis: 'timing' },
      { authoredAttentionAxis: 'accumulated_consequence', groundingAxis: 'tension' },
      { authoredAttentionAxis: 'endurance', groundingAxis: 'strength' },
    ]);
    expect(profile?.attentionOrder).toEqual(['timing', 'tension', 'strength']);
    expect(profile?.interpretationBehavior).toEqual({
      contradictionHandling: 'only_when_material',
      uncertaintyHandling: 'state_directly',
      adviceStyle: 'tradeoff_first',
    });
  });

  it('uses the same bounded selection policy while preserving different Character attention', () => {
    const taegyeom = resolveCharacterSajuFirstSlicePerspectiveV1(
      source('taegyeom', ['responsibility', 'boundary', 'consequence']),
    );
    const baekheon = resolveCharacterSajuFirstSlicePerspectiveV1(
      source('baekheon', ['long_cycle', 'accumulated_consequence', 'endurance']),
    );
    if (taegyeom === null || baekheon === null) throw new Error('fixtures must resolve');

    expect(taegyeom.selection).toEqual(baekheon.selection);
    expect(taegyeom.preferredNarrativeRoles).toEqual(baekheon.preferredNarrativeRoles);
    expect(taegyeom.attentionOrder).not.toEqual(baekheon.attentionOrder);
  });

  it('fails closed if published Character attention axes drift instead of guessing a replacement mapping', () => {
    expect(() =>
      resolveCharacterSajuFirstSlicePerspectiveV1(
        source('taegyeom', ['responsibility', 'boundary', 'changed_consequence_axis']),
      ),
    ).toThrow(/not present|must explicitly bind/u);
  });

  it('returns null for Characters not yet admitted to the first vertical slice', () => {
    expect(
      resolveCharacterSajuFirstSlicePerspectiveV1(
        source('seyeon', ['whole_pattern', 'competing_signals', 'long_horizon_balance']),
      ),
    ).toBeNull();
  });
});
