import type { CharacterSajuProfileContent } from '../../character-content/src/index.js';
import { SAJU_GROUNDING_AXIS_REGISTRY_VERSION_V1 } from './character-saju-grounding-admission.js';

export const CHARACTER_PERSPECTIVE_SCHEMA_VERSION_V1 =
  'myeongha-character-perspective-v1' as const;

export const SAJU_GROUNDING_AXIS_KEYS_V1 = Object.freeze([
  'core_identity',
  'structure',
  'action_style',
  'decision_style',
  'strength',
  'tension',
  'work',
  'wealth',
  'relationship',
  'health_tendency',
  'timing',
  'compatibility',
  'responsibility',
  'learning',
  'expression',
  'boundary',
  'custom',
] as const);

export type CharacterPerspectiveGroundingAxisKeyV1 =
  (typeof SAJU_GROUNDING_AXIS_KEYS_V1)[number];

export const CHARACTER_PERSPECTIVE_NARRATIVE_ROLES_V1 = Object.freeze([
  'primary',
  'supporting',
  'tension',
  'limitation',
] as const);

export type CharacterPerspectiveNarrativeRoleV1 =
  (typeof CHARACTER_PERSPECTIVE_NARRATIVE_ROLES_V1)[number];

export type CharacterPerspectiveContradictionHandlingV1 =
  | 'lead_with_it'
  | 'surface_after_strength'
  | 'only_when_material';

export type CharacterPerspectiveUncertaintyHandlingV1 =
  | 'state_directly'
  | 'soften_but_preserve'
  | 'ask_before_extending';

export type CharacterPerspectiveAdviceStyleV1 =
  | 'action_first'
  | 'reflection_first'
  | 'tradeoff_first'
  | 'question_first';

export interface CharacterPerspectiveAxisBindingV1 {
  readonly authoredAttentionAxis: string;
  readonly groundingAxis: CharacterPerspectiveGroundingAxisKeyV1;
}

export interface CharacterPerspectiveSelectionPolicyV1 {
  readonly maxPrimaryUnits: number;
  readonly maxSupportingUnits: number;
  readonly maxTensionUnits: number;
  readonly maxLimitationUnits: number;
  readonly avoidSameAxisRepetition: boolean;
}

export interface CharacterPerspectiveInterpretationBehaviorV1 {
  readonly contradictionHandling: CharacterPerspectiveContradictionHandlingV1;
  readonly uncertaintyHandling: CharacterPerspectiveUncertaintyHandlingV1;
  readonly adviceStyle: CharacterPerspectiveAdviceStyleV1;
}

/**
 * Delivery remains owned by the already-published Character content/runtime state.
 * The perspective profile may point to those authorities, but cannot invent numeric
 * voice weights or an independent Character persona.
 */
export interface CharacterPerspectiveDeliveryAuthorityV1 {
  readonly speech: 'published_character_speech';
  readonly communication: 'published_character_persona_communication';
  readonly relationship: 'active_relationship_projection';
}

export interface CharacterPerspectiveProfileV1 {
  readonly schemaVersion: typeof CHARACTER_PERSPECTIVE_SCHEMA_VERSION_V1;
  readonly perspectiveVersion: string;
  readonly characterId: string;
  readonly sourceContentVersion: string;
  readonly sourceSajuProfileVersion: string;
  readonly groundingAxisRegistryVersion: typeof SAJU_GROUNDING_AXIS_REGISTRY_VERSION_V1;
  readonly attentionBindings: readonly CharacterPerspectiveAxisBindingV1[];
  readonly attentionOrder: readonly CharacterPerspectiveGroundingAxisKeyV1[];
  readonly preferredNarrativeRoles: readonly CharacterPerspectiveNarrativeRoleV1[];
  readonly selection: CharacterPerspectiveSelectionPolicyV1;
  readonly interpretationBehavior: CharacterPerspectiveInterpretationBehaviorV1;
  readonly deliveryAuthority: CharacterPerspectiveDeliveryAuthorityV1;
}

export interface CharacterPerspectiveSourceV1 {
  readonly characterId: string;
  readonly contentVersion: string;
  readonly sajuProfile: CharacterSajuProfileContent;
}

export class CharacterPerspectiveAdmissionErrorV1 extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = 'CharacterPerspectiveAdmissionErrorV1';
  }
}

const PROFILE_KEYS = Object.freeze([
  'schemaVersion',
  'perspectiveVersion',
  'characterId',
  'sourceContentVersion',
  'sourceSajuProfileVersion',
  'groundingAxisRegistryVersion',
  'attentionBindings',
  'attentionOrder',
  'preferredNarrativeRoles',
  'selection',
  'interpretationBehavior',
  'deliveryAuthority',
] as const);

const BINDING_KEYS = Object.freeze(['authoredAttentionAxis', 'groundingAxis'] as const);
const SELECTION_KEYS = Object.freeze([
  'maxPrimaryUnits',
  'maxSupportingUnits',
  'maxTensionUnits',
  'maxLimitationUnits',
  'avoidSameAxisRepetition',
] as const);
const INTERPRETATION_KEYS = Object.freeze([
  'contradictionHandling',
  'uncertaintyHandling',
  'adviceStyle',
] as const);
const DELIVERY_KEYS = Object.freeze(['speech', 'communication', 'relationship'] as const);

const CONTRADICTION_HANDLING = Object.freeze([
  'lead_with_it',
  'surface_after_strength',
  'only_when_material',
] as const);
const UNCERTAINTY_HANDLING = Object.freeze([
  'state_directly',
  'soften_but_preserve',
  'ask_before_extending',
] as const);
const ADVICE_STYLES = Object.freeze([
  'action_first',
  'reflection_first',
  'tradeoff_first',
  'question_first',
] as const);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertRecord(value: unknown, path: string): asserts value is Record<string, unknown> {
  if (!isRecord(value)) {
    throw new CharacterPerspectiveAdmissionErrorV1(`${path} must be an object.`);
  }
}

function assertOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
): void {
  const allowedSet = new Set(allowed);
  const unexpected = Object.keys(value).find((key) => !allowedSet.has(key));
  if (unexpected !== undefined) {
    throw new CharacterPerspectiveAdmissionErrorV1(
      `${path} contains unexpected field: ${unexpected}.`,
    );
  }
}

function requireString(value: unknown, path: string, maxLength = 256): string {
  if (typeof value !== 'string') {
    throw new CharacterPerspectiveAdmissionErrorV1(`${path} must be a string.`);
  }
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maxLength) {
    throw new CharacterPerspectiveAdmissionErrorV1(`${path} is outside the supported bounds.`);
  }
  return normalized;
}

function requireEnum<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
  path: string,
): T[number] {
  if (typeof value !== 'string' || !allowed.includes(value as T[number])) {
    throw new CharacterPerspectiveAdmissionErrorV1(`${path} contains an unsupported value.`);
  }
  return value as T[number];
}

function requireBoundedInteger(value: unknown, path: string): number {
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 16) {
    throw new CharacterPerspectiveAdmissionErrorV1(
      `${path} must be an integer between 0 and 16.`,
    );
  }
  return value as number;
}

function requireArray(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new CharacterPerspectiveAdmissionErrorV1(`${path} must be an array.`);
  }
  return value;
}

function assertUnique(values: readonly string[], path: string): void {
  if (new Set(values).size !== values.length) {
    throw new CharacterPerspectiveAdmissionErrorV1(`${path} must not contain duplicates.`);
  }
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((value) => rightSet.has(value));
}

/**
 * CSR-04 admission boundary.
 *
 * Legacy Character `sajuProfile.attentionAxes` are character-authored concepts and
 * are not automatically equivalent to the Saju-owned GroundingAxisKey registry.
 * A perspective candidate therefore has to provide an explicit one-to-one binding.
 * The runtime validates that binding but never invents or guesses one.
 */
export function admitCharacterPerspectiveProfileV1(input: {
  readonly candidate: unknown;
  readonly source: CharacterPerspectiveSourceV1;
}): CharacterPerspectiveProfileV1 {
  assertRecord(input.candidate, 'CharacterPerspectiveProfileV1');
  assertOnlyKeys(input.candidate, PROFILE_KEYS, 'CharacterPerspectiveProfileV1');

  if (input.candidate.schemaVersion !== CHARACTER_PERSPECTIVE_SCHEMA_VERSION_V1) {
    throw new CharacterPerspectiveAdmissionErrorV1(
      'Character perspective schemaVersion is not supported.',
    );
  }
  if (input.candidate.groundingAxisRegistryVersion !== SAJU_GROUNDING_AXIS_REGISTRY_VERSION_V1) {
    throw new CharacterPerspectiveAdmissionErrorV1(
      'Character perspective grounding axis registry version is not supported.',
    );
  }

  const perspectiveVersion = requireString(
    input.candidate.perspectiveVersion,
    'perspectiveVersion',
  );
  const characterId = requireString(input.candidate.characterId, 'characterId');
  if (characterId !== input.source.characterId) {
    throw new CharacterPerspectiveAdmissionErrorV1(
      'Character perspective characterId does not match published Character content.',
    );
  }

  const sourceContentVersion = requireString(
    input.candidate.sourceContentVersion,
    'sourceContentVersion',
  );
  if (sourceContentVersion !== input.source.contentVersion) {
    throw new CharacterPerspectiveAdmissionErrorV1(
      'Character perspective sourceContentVersion is stale.',
    );
  }

  const sourceSajuProfileVersion = requireString(
    input.candidate.sourceSajuProfileVersion,
    'sourceSajuProfileVersion',
  );
  if (sourceSajuProfileVersion !== input.source.sajuProfile.profileVersion) {
    throw new CharacterPerspectiveAdmissionErrorV1(
      'Character perspective sourceSajuProfileVersion is stale.',
    );
  }

  const sourceAttentionAxes = input.source.sajuProfile.attentionAxes.map((axis, index) =>
    requireString(axis, `source.sajuProfile.attentionAxes[${index}]`, 128),
  );
  assertUnique(sourceAttentionAxes, 'source.sajuProfile.attentionAxes');

  const rawBindings = requireArray(input.candidate.attentionBindings, 'attentionBindings');
  const attentionBindings = rawBindings.map((raw, index) => {
    const path = `attentionBindings[${index}]`;
    assertRecord(raw, path);
    assertOnlyKeys(raw, BINDING_KEYS, path);
    const authoredAttentionAxis = requireString(
      raw.authoredAttentionAxis,
      `${path}.authoredAttentionAxis`,
      128,
    );
    if (!sourceAttentionAxes.includes(authoredAttentionAxis)) {
      throw new CharacterPerspectiveAdmissionErrorV1(
        `${path}.authoredAttentionAxis is not present in the published Character Saju profile.`,
      );
    }
    const groundingAxis = requireEnum(
      raw.groundingAxis,
      SAJU_GROUNDING_AXIS_KEYS_V1,
      `${path}.groundingAxis`,
    );
    return Object.freeze({ authoredAttentionAxis, groundingAxis });
  });

  const boundAuthoredAxes = attentionBindings.map((binding) => binding.authoredAttentionAxis);
  const boundGroundingAxes = attentionBindings.map((binding) => binding.groundingAxis);
  assertUnique(boundAuthoredAxes, 'attentionBindings.authoredAttentionAxis');
  assertUnique(boundGroundingAxes, 'attentionBindings.groundingAxis');
  if (!sameStringSet(boundAuthoredAxes, sourceAttentionAxes)) {
    throw new CharacterPerspectiveAdmissionErrorV1(
      'Character perspective must explicitly bind every published Saju attention axis exactly once.',
    );
  }

  const rawAttentionOrder = requireArray(input.candidate.attentionOrder, 'attentionOrder');
  const attentionOrder = rawAttentionOrder.map((axis, index) =>
    requireEnum(axis, SAJU_GROUNDING_AXIS_KEYS_V1, `attentionOrder[${index}]`),
  );
  assertUnique(attentionOrder, 'attentionOrder');
  if (!sameStringSet(attentionOrder, boundGroundingAxes)) {
    throw new CharacterPerspectiveAdmissionErrorV1(
      'attentionOrder must contain exactly the explicitly bound grounding axes.',
    );
  }

  const rawRoles = requireArray(
    input.candidate.preferredNarrativeRoles,
    'preferredNarrativeRoles',
  );
  if (rawRoles.length === 0) {
    throw new CharacterPerspectiveAdmissionErrorV1(
      'preferredNarrativeRoles must contain at least one role.',
    );
  }
  const preferredNarrativeRoles = rawRoles.map((role, index) =>
    requireEnum(
      role,
      CHARACTER_PERSPECTIVE_NARRATIVE_ROLES_V1,
      `preferredNarrativeRoles[${index}]`,
    ),
  );
  assertUnique(preferredNarrativeRoles, 'preferredNarrativeRoles');

  assertRecord(input.candidate.selection, 'selection');
  assertOnlyKeys(input.candidate.selection, SELECTION_KEYS, 'selection');
  const avoidSameAxisRepetition = input.candidate.selection.avoidSameAxisRepetition;
  if (typeof avoidSameAxisRepetition !== 'boolean') {
    throw new CharacterPerspectiveAdmissionErrorV1(
      'selection.avoidSameAxisRepetition must be boolean.',
    );
  }
  const selection = Object.freeze({
    maxPrimaryUnits: requireBoundedInteger(
      input.candidate.selection.maxPrimaryUnits,
      'selection.maxPrimaryUnits',
    ),
    maxSupportingUnits: requireBoundedInteger(
      input.candidate.selection.maxSupportingUnits,
      'selection.maxSupportingUnits',
    ),
    maxTensionUnits: requireBoundedInteger(
      input.candidate.selection.maxTensionUnits,
      'selection.maxTensionUnits',
    ),
    maxLimitationUnits: requireBoundedInteger(
      input.candidate.selection.maxLimitationUnits,
      'selection.maxLimitationUnits',
    ),
    avoidSameAxisRepetition,
  });
  const selectionTotal =
    selection.maxPrimaryUnits +
    selection.maxSupportingUnits +
    selection.maxTensionUnits +
    selection.maxLimitationUnits;
  if (selectionTotal < 1 || selectionTotal > 16) {
    throw new CharacterPerspectiveAdmissionErrorV1(
      'Character perspective selection total must be between 1 and 16 units.',
    );
  }

  assertRecord(input.candidate.interpretationBehavior, 'interpretationBehavior');
  assertOnlyKeys(
    input.candidate.interpretationBehavior,
    INTERPRETATION_KEYS,
    'interpretationBehavior',
  );
  const interpretationBehavior = Object.freeze({
    contradictionHandling: requireEnum(
      input.candidate.interpretationBehavior.contradictionHandling,
      CONTRADICTION_HANDLING,
      'interpretationBehavior.contradictionHandling',
    ),
    uncertaintyHandling: requireEnum(
      input.candidate.interpretationBehavior.uncertaintyHandling,
      UNCERTAINTY_HANDLING,
      'interpretationBehavior.uncertaintyHandling',
    ),
    adviceStyle: requireEnum(
      input.candidate.interpretationBehavior.adviceStyle,
      ADVICE_STYLES,
      'interpretationBehavior.adviceStyle',
    ),
  });

  assertRecord(input.candidate.deliveryAuthority, 'deliveryAuthority');
  assertOnlyKeys(input.candidate.deliveryAuthority, DELIVERY_KEYS, 'deliveryAuthority');
  if (input.candidate.deliveryAuthority.speech !== 'published_character_speech') {
    throw new CharacterPerspectiveAdmissionErrorV1(
      'Character perspective delivery must use published Character speech authority.',
    );
  }
  if (
    input.candidate.deliveryAuthority.communication !==
    'published_character_persona_communication'
  ) {
    throw new CharacterPerspectiveAdmissionErrorV1(
      'Character perspective delivery must use published Character communication authority.',
    );
  }
  if (input.candidate.deliveryAuthority.relationship !== 'active_relationship_projection') {
    throw new CharacterPerspectiveAdmissionErrorV1(
      'Character perspective delivery must use the active relationship projection.',
    );
  }
  const deliveryAuthority = Object.freeze({
    speech: 'published_character_speech',
    communication: 'published_character_persona_communication',
    relationship: 'active_relationship_projection',
  }) satisfies CharacterPerspectiveDeliveryAuthorityV1;

  return Object.freeze({
    schemaVersion: CHARACTER_PERSPECTIVE_SCHEMA_VERSION_V1,
    perspectiveVersion,
    characterId,
    sourceContentVersion,
    sourceSajuProfileVersion,
    groundingAxisRegistryVersion: SAJU_GROUNDING_AXIS_REGISTRY_VERSION_V1,
    attentionBindings: Object.freeze(attentionBindings),
    attentionOrder: Object.freeze([...attentionOrder]),
    preferredNarrativeRoles: Object.freeze([...preferredNarrativeRoles]),
    selection,
    interpretationBehavior,
    deliveryAuthority,
  });
}
