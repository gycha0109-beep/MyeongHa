import {
  CHARACTER_PERSPECTIVE_SCHEMA_VERSION_V1,
  admitCharacterPerspectiveProfileV1,
  type CharacterPerspectiveAdviceStyleV1,
  type CharacterPerspectiveContradictionHandlingV1,
  type CharacterPerspectiveGroundingAxisKeyV1,
  type CharacterPerspectiveProfileV1,
  type CharacterPerspectiveSourceV1,
  type CharacterPerspectiveUncertaintyHandlingV1,
} from './character-saju-perspective.js';
import { SAJU_GROUNDING_AXIS_REGISTRY_VERSION_V1 } from './character-saju-grounding-admission.js';

export const CHARACTER_SAJU_FIRST_SLICE_PERSPECTIVE_VERSION_V1 =
  'character-saju-first-slice-perspective-v1' as const;

export const CHARACTER_SAJU_FIRST_SLICE_CHARACTER_IDS_V1 = Object.freeze([
  'taegyeom',
  'baekheon',
] as const);

export type CharacterSajuFirstSliceCharacterIdV1 =
  (typeof CHARACTER_SAJU_FIRST_SLICE_CHARACTER_IDS_V1)[number];

interface FirstSlicePerspectiveConfigV1 {
  readonly characterId: CharacterSajuFirstSliceCharacterIdV1;
  readonly attentionBindings: readonly {
    readonly authoredAttentionAxis: string;
    readonly groundingAxis: CharacterPerspectiveGroundingAxisKeyV1;
  }[];
  readonly contradictionHandling: CharacterPerspectiveContradictionHandlingV1;
  readonly uncertaintyHandling: CharacterPerspectiveUncertaintyHandlingV1;
  readonly adviceStyle: CharacterPerspectiveAdviceStyleV1;
}

const SHARED_SELECTION_POLICY_V1 = Object.freeze({
  maxPrimaryUnits: 2,
  maxSupportingUnits: 1,
  maxTensionUnits: 1,
  maxLimitationUnits: 1,
  avoidSameAxisRepetition: true,
});

const SHARED_NARRATIVE_ROLE_ORDER_V1 = Object.freeze([
  'primary',
  'supporting',
  'tension',
  'limitation',
] as const);

/**
 * Explicit bridge from already-authored Character Saju attention concepts to the
 * source-owned Grounding Axis registry. These bindings are intentionally authored,
 * not inferred at runtime.
 *
 * Taegyeom:
 * - responsibility -> responsibility
 * - boundary -> boundary
 * - consequence -> decision_style, because his authored behavior frames consequence
 *   as the direct result/cost of a user decision.
 *
 * Baekheon:
 * - long_cycle -> timing
 * - accumulated_consequence -> tension, preserving accumulated cost/friction as the
 *   second lens instead of duplicating timing
 * - endurance -> strength
 */
const FIRST_SLICE_CONFIG_V1: Readonly<
  Record<CharacterSajuFirstSliceCharacterIdV1, FirstSlicePerspectiveConfigV1>
> = Object.freeze({
  taegyeom: Object.freeze({
    characterId: 'taegyeom',
    attentionBindings: Object.freeze([
      Object.freeze({ authoredAttentionAxis: 'responsibility', groundingAxis: 'responsibility' }),
      Object.freeze({ authoredAttentionAxis: 'boundary', groundingAxis: 'boundary' }),
      Object.freeze({ authoredAttentionAxis: 'consequence', groundingAxis: 'decision_style' }),
    ]),
    contradictionHandling: 'lead_with_it',
    uncertaintyHandling: 'state_directly',
    adviceStyle: 'action_first',
  }),
  baekheon: Object.freeze({
    characterId: 'baekheon',
    attentionBindings: Object.freeze([
      Object.freeze({ authoredAttentionAxis: 'long_cycle', groundingAxis: 'timing' }),
      Object.freeze({ authoredAttentionAxis: 'accumulated_consequence', groundingAxis: 'tension' }),
      Object.freeze({ authoredAttentionAxis: 'endurance', groundingAxis: 'strength' }),
    ]),
    contradictionHandling: 'only_when_material',
    uncertaintyHandling: 'state_directly',
    adviceStyle: 'tradeoff_first',
  }),
});

function isFirstSliceCharacterId(value: string): value is CharacterSajuFirstSliceCharacterIdV1 {
  return (CHARACTER_SAJU_FIRST_SLICE_CHARACTER_IDS_V1 as readonly string[]).includes(value);
}

export function resolveCharacterSajuFirstSlicePerspectiveV1(
  source: CharacterPerspectiveSourceV1,
): CharacterPerspectiveProfileV1 | null {
  if (!isFirstSliceCharacterId(source.characterId)) return null;
  const config = FIRST_SLICE_CONFIG_V1[source.characterId];
  const attentionOrder = config.attentionBindings.map((binding) => binding.groundingAxis);

  return admitCharacterPerspectiveProfileV1({
    source,
    candidate: {
      schemaVersion: CHARACTER_PERSPECTIVE_SCHEMA_VERSION_V1,
      perspectiveVersion: CHARACTER_SAJU_FIRST_SLICE_PERSPECTIVE_VERSION_V1,
      characterId: source.characterId,
      sourceContentVersion: source.contentVersion,
      sourceSajuProfileVersion: source.sajuProfile.profileVersion,
      groundingAxisRegistryVersion: SAJU_GROUNDING_AXIS_REGISTRY_VERSION_V1,
      attentionBindings: config.attentionBindings,
      attentionOrder,
      preferredNarrativeRoles: SHARED_NARRATIVE_ROLE_ORDER_V1,
      selection: SHARED_SELECTION_POLICY_V1,
      interpretationBehavior: {
        contradictionHandling: config.contradictionHandling,
        uncertaintyHandling: config.uncertaintyHandling,
        adviceStyle: config.adviceStyle,
      },
      deliveryAuthority: {
        speech: 'published_character_speech',
        communication: 'published_character_persona_communication',
        relationship: 'active_relationship_projection',
      },
    },
  });
}
