import {
  CHARACTER_FACE_REALIZATION_MODE_V1,
  FACE_CHARACTER_GROUNDING_PROJECTION_VERSION_V1,
  type CharacterFaceRuntimeContextV1,
} from './character-face-grounding-admission.js';
import type {
  CharacterFaceGroundingBundleViewV1,
} from './character-face-grounding-bundle.js';

export const CHARACTER_FACE_CAPABILITY_SOURCE_SCHEMA_VERSION_V1 =
  'character-face-capability-source-v1' as const;

export const CHARACTER_FACE_CAPABILITY_SCHEMA_VERSION_V1 =
  'character-face-capability-v1' as const;

export const CHARACTER_FACE_SUPPORTED_TOPIC_KEYS_V1 = Object.freeze([
  'face.discover.structure',
  'face.discover.extended',
] as const);

export const CHARACTER_FACE_SUPPORTED_REALIZATION_MODES_V1 =
  Object.freeze([
    CHARACTER_FACE_REALIZATION_MODE_V1,
  ] as const);

export type CharacterFaceSupportedTopicKeyV1 =
  (typeof CHARACTER_FACE_SUPPORTED_TOPIC_KEYS_V1)[number];

export type CharacterFaceSupportedRealizationModeV1 =
  (typeof CHARACTER_FACE_SUPPORTED_REALIZATION_MODES_V1)[number];

export interface CharacterFaceCapabilitySourceV1 {
  readonly schemaVersion:
    typeof CHARACTER_FACE_CAPABILITY_SOURCE_SCHEMA_VERSION_V1;
  readonly capabilityVersion: string;
  readonly characterId: string;
  readonly contentVersion: string;
  readonly faceProfileVersion: string;
  readonly allowedTopicKeys:
    readonly CharacterFaceSupportedTopicKeyV1[];
  readonly allowedModes:
    readonly CharacterFaceSupportedRealizationModeV1[];
  readonly allowPartial: boolean;
  readonly canInitiate: boolean;
}

export interface CharacterFaceCapabilityProfileV1 {
  readonly schemaVersion:
    typeof CHARACTER_FACE_CAPABILITY_SCHEMA_VERSION_V1;
  readonly capabilityVersion: string;
  readonly characterId: string;
  readonly sourceContentVersion: string;
  readonly sourceFaceProfileVersion: string;
  readonly allowedTopicKeys:
    readonly CharacterFaceSupportedTopicKeyV1[];
  readonly allowedModes:
    readonly CharacterFaceSupportedRealizationModeV1[];
  readonly allowPartial: boolean;
  readonly canInitiate: boolean;
}

export type CharacterFaceCapabilityDecisionV1 =
  | Readonly<{
      allowed: true;
      coverage: 'full' | 'partial';
    }>
  | Readonly<{
      allowed: false;
      reason:
        | 'NO_ADMITTED_FACE_CONTEXT'
        | 'NO_ADMITTED_FACE_GROUNDING'
        | 'CHARACTER_ID_MISMATCH'
        | 'CONTENT_VERSION_MISMATCH'
        | 'GROUNDING_CONTEXT_MISMATCH'
        | 'TOPIC_NOT_ALLOWED'
        | 'MODE_NOT_ALLOWED'
        | 'PARTIAL_NOT_ALLOWED';
    }>;

export class CharacterFaceCapabilityAdmissionErrorV1
  extends TypeError {
  constructor(message: string) {
    super(message);
    this.name =
      'CharacterFaceCapabilityAdmissionErrorV1';
  }
}

const SOURCE_KEYS = Object.freeze([
  'schemaVersion',
  'capabilityVersion',
  'characterId',
  'contentVersion',
  'faceProfileVersion',
  'allowedTopicKeys',
  'allowedModes',
  'allowPartial',
  'canInitiate',
] as const);

const PROFILE_KEYS = Object.freeze([
  'schemaVersion',
  'capabilityVersion',
  'characterId',
  'sourceContentVersion',
  'sourceFaceProfileVersion',
  'allowedTopicKeys',
  'allowedModes',
  'allowPartial',
  'canInitiate',
] as const);

function fail(message: string): never {
  throw new CharacterFaceCapabilityAdmissionErrorV1(
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

function requireBoolean(
  value: unknown,
  path: string,
): boolean {
  if (typeof value !== 'boolean') {
    fail(`${path} must be boolean.`);
  }
  return value;
}

function requireExactSupportedTopics(
  value: unknown,
  path: string,
): readonly CharacterFaceSupportedTopicKeyV1[] {
  if (!Array.isArray(value) || value.length === 0) {
    fail(
      `${path} must contain at least one production-neutral Face topic.`,
    );
  }

  const values = value.map(
    (entry, index) => {
      if (
        typeof entry !== 'string' ||
        !(
          CHARACTER_FACE_SUPPORTED_TOPIC_KEYS_V1
            as readonly string[]
        ).includes(entry)
      ) {
        fail(
          `${path}[${index}] is not a supported production-neutral Face topic.`,
        );
      }
      return entry as CharacterFaceSupportedTopicKeyV1;
    },
  );

  if (
    new Set(values).size !==
    values.length
  ) {
    fail(
      `${path} must not contain duplicate topics.`,
    );
  }

  return Object.freeze(values);
}

function requireExactSupportedModes(
  value: unknown,
  path: string,
): readonly CharacterFaceSupportedRealizationModeV1[] {
  if (!Array.isArray(value) || value.length === 0) {
    fail(
      `${path} must contain at least one supported realization mode.`,
    );
  }

  const values = value.map(
    (entry, index) => {
      if (
        typeof entry !== 'string' ||
        !(
          CHARACTER_FACE_SUPPORTED_REALIZATION_MODES_V1
            as readonly string[]
        ).includes(entry)
      ) {
        fail(
          `${path}[${index}] is not a supported Face realization mode.`,
        );
      }
      return entry as CharacterFaceSupportedRealizationModeV1;
    },
  );

  if (
    new Set(values).size !==
    values.length
  ) {
    fail(
      `${path} must not contain duplicate modes.`,
    );
  }

  return Object.freeze(values);
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

export function admitCharacterFaceCapabilitySourceV1(
  candidate: unknown,
): CharacterFaceCapabilitySourceV1 {
  const source = requireRecord(
    candidate,
    'CharacterFaceCapabilitySourceV1',
  );
  assertOnlyKeys(
    source,
    SOURCE_KEYS,
    'CharacterFaceCapabilitySourceV1',
  );

  if (
    source.schemaVersion !==
    CHARACTER_FACE_CAPABILITY_SOURCE_SCHEMA_VERSION_V1
  ) {
    fail(
      'Character Face capability source schemaVersion is not supported.',
    );
  }

  return Object.freeze({
    schemaVersion:
      CHARACTER_FACE_CAPABILITY_SOURCE_SCHEMA_VERSION_V1,
    capabilityVersion: requireString(
      source.capabilityVersion,
      'source.capabilityVersion',
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
    allowedTopicKeys:
      requireExactSupportedTopics(
        source.allowedTopicKeys,
        'source.allowedTopicKeys',
      ),
    allowedModes:
      requireExactSupportedModes(
        source.allowedModes,
        'source.allowedModes',
      ),
    allowPartial: requireBoolean(
      source.allowPartial,
      'source.allowPartial',
    ),
    canInitiate: requireBoolean(
      source.canInitiate,
      'source.canInitiate',
    ),
  });
}

export function admitCharacterFaceCapabilityProfileV1(
  input: Readonly<{
    source: unknown;
    candidate: unknown;
  }>,
): CharacterFaceCapabilityProfileV1 {
  const source =
    admitCharacterFaceCapabilitySourceV1(
      input.source,
    );
  const candidate = requireRecord(
    input.candidate,
    'CharacterFaceCapabilityProfileV1',
  );
  assertOnlyKeys(
    candidate,
    PROFILE_KEYS,
    'CharacterFaceCapabilityProfileV1',
  );

  if (
    candidate.schemaVersion !==
    CHARACTER_FACE_CAPABILITY_SCHEMA_VERSION_V1
  ) {
    fail(
      'Character Face capability profile schemaVersion is not supported.',
    );
  }

  const profile = Object.freeze({
    schemaVersion:
      CHARACTER_FACE_CAPABILITY_SCHEMA_VERSION_V1,
    capabilityVersion: requireString(
      candidate.capabilityVersion,
      'capability.capabilityVersion',
    ),
    characterId: requireString(
      candidate.characterId,
      'capability.characterId',
    ),
    sourceContentVersion: requireString(
      candidate.sourceContentVersion,
      'capability.sourceContentVersion',
    ),
    sourceFaceProfileVersion: requireString(
      candidate.sourceFaceProfileVersion,
      'capability.sourceFaceProfileVersion',
    ),
    allowedTopicKeys:
      requireExactSupportedTopics(
        candidate.allowedTopicKeys,
        'capability.allowedTopicKeys',
      ),
    allowedModes:
      requireExactSupportedModes(
        candidate.allowedModes,
        'capability.allowedModes',
      ),
    allowPartial: requireBoolean(
      candidate.allowPartial,
      'capability.allowPartial',
    ),
    canInitiate: requireBoolean(
      candidate.canInitiate,
      'capability.canInitiate',
    ),
  }) satisfies CharacterFaceCapabilityProfileV1;

  if (
    profile.capabilityVersion !==
    source.capabilityVersion
  ) {
    fail(
      'Character Face capabilityVersion does not match the authored source.',
    );
  }
  if (
    profile.characterId !==
    source.characterId
  ) {
    fail(
      'Character Face capability characterId does not match the authored source.',
    );
  }
  if (
    profile.sourceContentVersion !==
    source.contentVersion
  ) {
    fail(
      'Character Face capability contentVersion is stale.',
    );
  }
  if (
    profile.sourceFaceProfileVersion !==
    source.faceProfileVersion
  ) {
    fail(
      'Character Face capability faceProfileVersion is stale.',
    );
  }
  if (
    !sameOrderedStrings(
      profile.allowedTopicKeys,
      source.allowedTopicKeys,
    )
  ) {
    fail(
      'Character Face capability topics do not exactly match the authored source.',
    );
  }
  if (
    !sameOrderedStrings(
      profile.allowedModes,
      source.allowedModes,
    )
  ) {
    fail(
      'Character Face capability modes do not exactly match the authored source.',
    );
  }
  if (
    profile.allowPartial !==
    source.allowPartial ||
    profile.canInitiate !==
    source.canInitiate
  ) {
    fail(
      'Character Face capability behavior does not exactly match the authored source.',
    );
  }

  return profile;
}

function groundingMatchesContext(
  context: CharacterFaceRuntimeContextV1,
  grounding:
    CharacterFaceGroundingBundleViewV1,
): boolean {
  const ref =
    context.groundingRef;

  return (
    context.topicKey ===
      grounding.topicKey &&
    context.readinessState ===
      grounding.readinessState &&
    ref.topicKey ===
      grounding.topicKey &&
    ref.sourceResultHash ===
      grounding.sourceResultHash &&
    ref.projectionHash ===
      grounding.projectionHash &&
    ref.groundingHash ===
      grounding.groundingHash &&
    ref.displayFactsHash ===
      grounding.displayFactsHash &&
    ref.bundleHash ===
      grounding.bundleHash &&
    ref.projectionVersion ===
      grounding.projectionVersion &&
    grounding.projectionVersion ===
      FACE_CHARACTER_GROUNDING_PROJECTION_VERSION_V1 &&
    sameOrderedStrings(
      context.unavailableSections,
      grounding.unavailableSections,
    )
  );
}

export function evaluateCharacterFaceCapabilityV1(
  input: Readonly<{
    characterId: string;
    characterContentVersion: string;
    faceContext:
      CharacterFaceRuntimeContextV1 | null;
    grounding:
      CharacterFaceGroundingBundleViewV1 | null;
    capability:
      CharacterFaceCapabilityProfileV1;
  }>,
): CharacterFaceCapabilityDecisionV1 {
  if (input.faceContext === null) {
    return Object.freeze({
      allowed: false,
      reason:
        'NO_ADMITTED_FACE_CONTEXT',
    });
  }

  if (input.grounding === null) {
    return Object.freeze({
      allowed: false,
      reason:
        'NO_ADMITTED_FACE_GROUNDING',
    });
  }

  if (
    !groundingMatchesContext(
      input.faceContext,
      input.grounding,
    )
  ) {
    return Object.freeze({
      allowed: false,
      reason:
        'GROUNDING_CONTEXT_MISMATCH',
    });
  }

  if (
    input.characterId !==
      input.capability.characterId
  ) {
    return Object.freeze({
      allowed: false,
      reason:
        'CHARACTER_ID_MISMATCH',
    });
  }

  if (
    input.characterContentVersion !==
      input.capability.sourceContentVersion
  ) {
    return Object.freeze({
      allowed: false,
      reason:
        'CONTENT_VERSION_MISMATCH',
    });
  }

  if (
    !input.capability.allowedTopicKeys.includes(
      input.faceContext
        .topicKey as CharacterFaceSupportedTopicKeyV1,
    )
  ) {
    return Object.freeze({
      allowed: false,
      reason:
        'TOPIC_NOT_ALLOWED',
    });
  }

  if (
    !input.capability.allowedModes.includes(
      input.faceContext
        .mode as CharacterFaceSupportedRealizationModeV1,
    )
  ) {
    return Object.freeze({
      allowed: false,
      reason:
        'MODE_NOT_ALLOWED',
    });
  }

  if (
    input.faceContext.readinessState ===
      'partial' &&
    !input.capability.allowPartial
  ) {
    return Object.freeze({
      allowed: false,
      reason:
        'PARTIAL_NOT_ALLOWED',
    });
  }

  return Object.freeze({
    allowed: true,
    coverage:
      input.faceContext.readinessState ===
      'partial'
        ? 'partial'
        : 'full',
  });
}
