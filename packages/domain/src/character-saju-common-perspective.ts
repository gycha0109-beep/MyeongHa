import {
  CHARACTER_PERSPECTIVE_SCHEMA_VERSION_V1,
  type CharacterPerspectiveProfileV1,
  type CharacterPerspectiveSourceV1,
} from './character-saju-perspective.js';
import { SAJU_GROUNDING_AXIS_REGISTRY_VERSION_V1 } from './character-saju-grounding-admission.js';

/**
 * Source-neutral bounded selection for ANY authorized Reader.
 *
 * This is a server-owned common strategy, not a Character-authored perspective
 * mapping. Published Character attentionAxes remain separate concepts, so the
 * runtime never guesses conversions into Saju-owned grounding axes.
 *
 * This does not grant Reading access, expand product eligibility, or publish
 * unapproved Character content. Those independent checks must precede rendering.
 */
export const CHARACTER_SAJU_COMMON_PERSPECTIVE_VERSION_V1 =
  'character-saju-common-bounded-v1' as const;

const COMMON_NARRATIVE_ROLES = Object.freeze([
  'primary',
  'supporting',
  'tension',
  'limitation',
] as const);

const COMMON_SELECTION = Object.freeze({
  maxPrimaryUnits: 2,
  maxSupportingUnits: 1,
  maxTensionUnits: 1,
  maxLimitationUnits: 1,
  avoidSameAxisRepetition: true,
} as const);

const COMMON_BEHAVIOR = Object.freeze({
  contradictionHandling: 'only_when_material',
  uncertaintyHandling: 'state_directly',
  adviceStyle: 'reflection_first',
} as const);

const PUBLISHED_DELIVERY = Object.freeze({
  speech: 'published_character_speech',
  communication: 'published_character_persona_communication',
  relationship: 'active_relationship_projection',
} as const);

function requirePublishedIdentity(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 256) {
    throw new TypeError(`Common Reader perspective requires a published ${name}.`);
  }
  return value.trim();
}

/**
 * The caller supplies server-resolved, pinned published Character content.
 * Reviewed character-specific perspective admission remains separate and
 * strict; this common strategy does not pretend to be an authored mapping.
 */
export function resolveCharacterSajuCommonPerspectiveV1(
  source: CharacterPerspectiveSourceV1,
): CharacterPerspectiveProfileV1 {
  const characterId = requirePublishedIdentity(source.characterId, 'Character identity');
  const contentVersion = requirePublishedIdentity(source.contentVersion, 'content version');
  const sajuProfileVersion = requirePublishedIdentity(
    source.sajuProfile?.profileVersion,
    'Saju profile version',
  );

  return Object.freeze({
    schemaVersion: CHARACTER_PERSPECTIVE_SCHEMA_VERSION_V1,
    perspectiveVersion: CHARACTER_SAJU_COMMON_PERSPECTIVE_VERSION_V1,
    characterId,
    sourceContentVersion: contentVersion,
    sourceSajuProfileVersion: sajuProfileVersion,
    groundingAxisRegistryVersion: SAJU_GROUNDING_AXIS_REGISTRY_VERSION_V1,
    attentionBindings: Object.freeze([]),
    attentionOrder: Object.freeze([]),
    preferredNarrativeRoles: COMMON_NARRATIVE_ROLES,
    selection: COMMON_SELECTION,
    interpretationBehavior: COMMON_BEHAVIOR,
    deliveryAuthority: PUBLISHED_DELIVERY,
  }) satisfies CharacterPerspectiveProfileV1;
}
