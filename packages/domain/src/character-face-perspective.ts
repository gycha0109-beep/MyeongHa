import {
  FACE_CHARACTER_GROUNDING_PROJECTION_VERSION_V1,
} from './character-face-grounding-admission.js';
import type {
  CharacterFaceCapabilityProfileV1,
} from './character-face-capability.js';

export const CHARACTER_FACE_PERSPECTIVE_SOURCE_SCHEMA_VERSION_V1 =
  'character-face-perspective-source-v1' as const;

export const CHARACTER_FACE_PERSPECTIVE_SCHEMA_VERSION_V1 =
  'character-face-perspective-v1' as const;

export const CHARACTER_FACE_ATTENTION_REGISTRY_VERSION_V1 =
  'character-face-attention-registry-v1' as const;

export const CHARACTER_FACE_ATTENTION_KEYS_V1 = Object.freeze([
  'eye.width_height_ratio',
  'nose.alar_width_and_nostril_geometry',
  'mouth.width_and_relative_size',
  'chin_lower_face.visible_width_ratio',
  'forehead.visible_width_shape',
] as const);

export const CHARACTER_FACE_UNCERTAINTY_HANDLING_V1 =
  Object.freeze([
    'state_directly',
    'soften_but_preserve',
    'ask_before_extending',
  ] as const);

export type CharacterFaceAttentionKeyV1 =
  (typeof CHARACTER_FACE_ATTENTION_KEYS_V1)[number];

export type CharacterFaceUncertaintyHandlingV1 =
  (typeof CHARACTER_FACE_UNCERTAINTY_HANDLING_V1)[number];

export interface CharacterFacePerspectiveSourceV1 {
  readonly schemaVersion:
    typeof CHARACTER_FACE_PERSPECTIVE_SOURCE_SCHEMA_VERSION_V1;
  readonly perspectiveVersion: string;
  readonly characterId: string;
  readonly contentVersion: string;
  readonly faceProfileVersion: string;
  readonly attentionOrder:
    readonly CharacterFaceAttentionKeyV1[];
  readonly maxUnits: number;
  readonly uncertaintyHandling:
    CharacterFaceUncertaintyHandlingV1;
}

export interface CharacterFacePerspectiveSelectionV1 {
  readonly maxUnits: number;
  readonly avoidDuplicateCapability: true;
  readonly preserveSourceOrderForTies: true;
}

export interface CharacterFacePerspectiveDeliveryAuthorityV1 {
  readonly speech:
    'published_character_speech';
  readonly communication:
    'published_character_persona_communication';
  readonly relationship:
    'active_relationship_projection';
}

export interface CharacterFacePerspectiveProfileV1 {
  readonly schemaVersion:
    typeof CHARACTER_FACE_PERSPECTIVE_SCHEMA_VERSION_V1;
  readonly perspectiveVersion: string;
  readonly characterId: string;
  readonly sourceContentVersion: string;
  readonly sourceFaceProfileVersion: string;
  readonly groundingProjectionVersion:
    typeof FACE_CHARACTER_GROUNDING_PROJECTION_VERSION_V1;
  readonly attentionRegistryVersion:
    typeof CHARACTER_FACE_ATTENTION_REGISTRY_VERSION_V1;
  readonly attentionOrder:
    readonly CharacterFaceAttentionKeyV1[];
  readonly selection:
    CharacterFacePerspectiveSelectionV1;
  readonly uncertaintyHandling:
    CharacterFaceUncertaintyHandlingV1;
  readonly deliveryAuthority:
    CharacterFacePerspectiveDeliveryAuthorityV1;
}

export class CharacterFacePerspectiveAdmissionErrorV1
  extends TypeError {
  constructor(message: string) {
    super(message);
    this.name =
      'CharacterFacePerspectiveAdmissionErrorV1';
  }
}

const SOURCE_KEYS = Object.freeze([
  'schemaVersion',
  'perspectiveVersion',
  'characterId',
  'contentVersion',
  'faceProfileVersion',
  'attentionOrder',
  'maxUnits',
  'uncertaintyHandling',
] as const);

const PROFILE_KEYS = Object.freeze([
  'schemaVersion',
  'perspectiveVersion',
  'characterId',
  'sourceContentVersion',
  'sourceFaceProfileVersion',
  'groundingProjectionVersion',
  'attentionRegistryVersion',
  'attentionOrder',
  'selection',
  'uncertaintyHandling',
  'deliveryAuthority',
] as const);

const SELECTION_KEYS = Object.freeze([
  'maxUnits',
  'avoidDuplicateCapability',
  'preserveSourceOrderForTies',
] as const);

const DELIVERY_KEYS = Object.freeze([
  'speech',
  'communication',
  'relationship',
] as const);

function fail(message: string): never {
  throw new CharacterFacePerspectiveAdmissionErrorV1(
    message,
  );
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value)
  );
}

function requireRecord(
  value: unknown,
  path: string,
): Record<string, unknown> {
  if (!isRecord(value)) {
    fail(`${path} must be an object.`);
  }
  return value;
}

function assertOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
): void {
  const allowedSet = new Set(allowed);
  const unexpected =
    Object.keys(value).find(
      (key) => !allowedSet.has(key),
    );

  if (unexpected !== undefined) {
    fail(
      `${path} contains unexpected field: ${unexpected}.`,
    );
  }
}

function requireString(
  value: unknown,
  path: string,
  maxLength = 512,
): string {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    value.length > maxLength
  ) {
    fail(
      `${path} must be a non-empty bounded string.`,
    );
  }
  return value;
}

function requireAttentionOrder(
  value: unknown,
  path: string,
): readonly CharacterFaceAttentionKeyV1[] {
  if (!Array.isArray(value) || value.length === 0) {
    fail(
      `${path} must contain at least one source capability key.`,
    );
  }

  const values = value.map(
    (entry, index) => {
      if (
        typeof entry !== 'string' ||
        !(
          CHARACTER_FACE_ATTENTION_KEYS_V1 as readonly string[]
        ).includes(entry)
      ) {
        fail(
          `${path}[${index}] is not a supported Face attention key.`,
        );
      }
      return entry as CharacterFaceAttentionKeyV1;
    },
  );

  if (
    new Set(values).size !==
    values.length
  ) {
    fail(
      `${path} must not contain duplicate attention keys.`,
    );
  }

  return Object.freeze(values);
}

function requireMaxUnits(
  value: unknown,
  path: string,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > 4
  ) {
    fail(
      `${path} must be an integer between 1 and 4.`,
    );
  }
  return value;
}

function requireUncertaintyHandling(
  value: unknown,
  path: string,
): CharacterFaceUncertaintyHandlingV1 {
  if (
    typeof value !== 'string' ||
    !(
      CHARACTER_FACE_UNCERTAINTY_HANDLING_V1 as readonly string[]
    ).includes(value)
  ) {
    fail(
      `${path} is not a supported uncertainty handling policy.`,
    );
  }

  return value as CharacterFaceUncertaintyHandlingV1;
}

function sameOrderedStrings(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (value, index) =>
        value === right[index],
    )
  );
}

export function admitCharacterFacePerspectiveSourceV1(
  candidate: unknown,
): CharacterFacePerspectiveSourceV1 {
  const source = requireRecord(
    candidate,
    'CharacterFacePerspectiveSourceV1',
  );
  assertOnlyKeys(
    source,
    SOURCE_KEYS,
    'CharacterFacePerspectiveSourceV1',
  );

  if (
    source.schemaVersion !==
    CHARACTER_FACE_PERSPECTIVE_SOURCE_SCHEMA_VERSION_V1
  ) {
    fail(
      'Character Face Perspective source schemaVersion is not supported.',
    );
  }

  return Object.freeze({
    schemaVersion:
      CHARACTER_FACE_PERSPECTIVE_SOURCE_SCHEMA_VERSION_V1,
    perspectiveVersion: requireString(
      source.perspectiveVersion,
      'source.perspectiveVersion',
    ),
    characterId: requireString(
      source.characterId,
      'source.characterId',
    ),
    contentVersion: requireString(
      source.contentVersion,
      'source.contentVersion',
    ),
    faceProfileVersion: requireString(
      source.faceProfileVersion,
      'source.faceProfileVersion',
    ),
    attentionOrder:
      requireAttentionOrder(
        source.attentionOrder,
        'source.attentionOrder',
      ),
    maxUnits: requireMaxUnits(
      source.maxUnits,
      'source.maxUnits',
    ),
    uncertaintyHandling:
      requireUncertaintyHandling(
        source.uncertaintyHandling,
        'source.uncertaintyHandling',
      ),
  });
}

export function admitCharacterFacePerspectiveProfileV1(
  input: Readonly<{
    source: unknown;
    candidate: unknown;
  }>,
): CharacterFacePerspectiveProfileV1 {
  const source =
    admitCharacterFacePerspectiveSourceV1(
      input.source,
    );
  const candidate = requireRecord(
    input.candidate,
    'CharacterFacePerspectiveProfileV1',
  );
  assertOnlyKeys(
    candidate,
    PROFILE_KEYS,
    'CharacterFacePerspectiveProfileV1',
  );

  if (
    candidate.schemaVersion !==
    CHARACTER_FACE_PERSPECTIVE_SCHEMA_VERSION_V1
  ) {
    fail(
      'Character Face Perspective schemaVersion is not supported.',
    );
  }

  if (
    candidate.groundingProjectionVersion !==
    FACE_CHARACTER_GROUNDING_PROJECTION_VERSION_V1
  ) {
    fail(
      'Character Face Perspective grounding projection version is not supported.',
    );
  }

  if (
    candidate.attentionRegistryVersion !==
    CHARACTER_FACE_ATTENTION_REGISTRY_VERSION_V1
  ) {
    fail(
      'Character Face Perspective attention registry version is not supported.',
    );
  }

  const selection = requireRecord(
    candidate.selection,
    'perspective.selection',
  );
  assertOnlyKeys(
    selection,
    SELECTION_KEYS,
    'perspective.selection',
  );

  if (
    selection.avoidDuplicateCapability !==
      true ||
    selection.preserveSourceOrderForTies !==
      true
  ) {
    fail(
      'Character Face Perspective deterministic selection safeguards must remain enabled.',
    );
  }

  const delivery = requireRecord(
    candidate.deliveryAuthority,
    'perspective.deliveryAuthority',
  );
  assertOnlyKeys(
    delivery,
    DELIVERY_KEYS,
    'perspective.deliveryAuthority',
  );

  if (
    delivery.speech !==
      'published_character_speech' ||
    delivery.communication !==
      'published_character_persona_communication' ||
    delivery.relationship !==
      'active_relationship_projection'
  ) {
    fail(
      'Character Face Perspective delivery authority is not supported.',
    );
  }

  const profile = Object.freeze({
    schemaVersion:
      CHARACTER_FACE_PERSPECTIVE_SCHEMA_VERSION_V1,
    perspectiveVersion: requireString(
      candidate.perspectiveVersion,
      'perspective.perspectiveVersion',
    ),
    characterId: requireString(
      candidate.characterId,
      'perspective.characterId',
    ),
    sourceContentVersion: requireString(
      candidate.sourceContentVersion,
      'perspective.sourceContentVersion',
    ),
    sourceFaceProfileVersion: requireString(
      candidate.sourceFaceProfileVersion,
      'perspective.sourceFaceProfileVersion',
    ),
    groundingProjectionVersion:
      FACE_CHARACTER_GROUNDING_PROJECTION_VERSION_V1,
    attentionRegistryVersion:
      CHARACTER_FACE_ATTENTION_REGISTRY_VERSION_V1,
    attentionOrder:
      requireAttentionOrder(
        candidate.attentionOrder,
        'perspective.attentionOrder',
      ),
    selection: Object.freeze({
      maxUnits: requireMaxUnits(
        selection.maxUnits,
        'perspective.selection.maxUnits',
      ),
      avoidDuplicateCapability:
        true as const,
      preserveSourceOrderForTies:
        true as const,
    }),
    uncertaintyHandling:
      requireUncertaintyHandling(
        candidate.uncertaintyHandling,
        'perspective.uncertaintyHandling',
      ),
    deliveryAuthority:
      Object.freeze({
        speech:
          'published_character_speech' as const,
        communication:
          'published_character_persona_communication' as const,
        relationship:
          'active_relationship_projection' as const,
      }),
  }) satisfies CharacterFacePerspectiveProfileV1;

  if (
    profile.perspectiveVersion !==
    source.perspectiveVersion
  ) {
    fail(
      'Character Face Perspective version does not match the authored source.',
    );
  }
  if (
    profile.characterId !==
    source.characterId
  ) {
    fail(
      'Character Face Perspective characterId does not match the authored source.',
    );
  }
  if (
    profile.sourceContentVersion !==
    source.contentVersion
  ) {
    fail(
      'Character Face Perspective contentVersion is stale.',
    );
  }
  if (
    profile.sourceFaceProfileVersion !==
    source.faceProfileVersion
  ) {
    fail(
      'Character Face Perspective faceProfileVersion is stale.',
    );
  }
  if (
    !sameOrderedStrings(
      profile.attentionOrder,
      source.attentionOrder,
    )
  ) {
    fail(
      'Character Face Perspective attentionOrder does not exactly match the authored source.',
    );
  }
  if (
    profile.selection.maxUnits !==
    source.maxUnits
  ) {
    fail(
      'Character Face Perspective maxUnits does not match the authored source.',
    );
  }
  if (
    profile.uncertaintyHandling !==
    source.uncertaintyHandling
  ) {
    fail(
      'Character Face Perspective uncertainty handling does not match the authored source.',
    );
  }

  return profile;
}

export function assertCharacterFacePerspectiveCapabilityCompatibilityV1(
  input: Readonly<{
    capability:
      CharacterFaceCapabilityProfileV1;
    perspective:
      CharacterFacePerspectiveProfileV1;
  }>,
): void {
  if (
    input.capability.characterId !==
    input.perspective.characterId
  ) {
    fail(
      'Character Face Capability and Perspective characterId must match.',
    );
  }

  if (
    input.capability.sourceContentVersion !==
    input.perspective.sourceContentVersion
  ) {
    fail(
      'Character Face Capability and Perspective contentVersion must match.',
    );
  }

  if (
    input.capability.sourceFaceProfileVersion !==
    input.perspective.sourceFaceProfileVersion
  ) {
    fail(
      'Character Face Capability and Perspective faceProfileVersion must match.',
    );
  }
}
