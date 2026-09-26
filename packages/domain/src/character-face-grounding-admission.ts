import type { CharacterRuntimeContextV1 } from './character-runtime-context.js';

export const FACE_CHARACTER_GROUNDING_REF_SCHEMA_VERSION_V1 =
  'face-character-grounding-ref-v1' as const;

export const FACE_CHARACTER_GROUNDING_PROJECTION_VERSION_V1 =
  'face-character-grounding-projection-v1' as const;

export const CHARACTER_FACE_SOURCE_BINDING_SCHEMA_VERSION_V1 =
  'character-face-source-binding-v1' as const;

export const CHARACTER_FACE_CONTEXT_SCHEMA_VERSION_V1 =
  'character-face-context-v1' as const;

export const CHARACTER_FACE_REALIZATION_MODE_V1 =
  'neutral_fact_realization' as const;

export interface CharacterFaceGroundingRefV1 {
  readonly schemaVersion:
    typeof FACE_CHARACTER_GROUNDING_REF_SCHEMA_VERSION_V1;
  readonly topicKey: string;
  readonly sourceResultHash: string;
  readonly projectionHash: string;
  readonly groundingHash: string;
  readonly displayFactsHash: string;
  readonly bundleHash: string;
  readonly projectionVersion:
    typeof FACE_CHARACTER_GROUNDING_PROJECTION_VERSION_V1;
}

export interface CharacterFaceSourceBindingV1 {
  readonly schemaVersion:
    typeof CHARACTER_FACE_SOURCE_BINDING_SCHEMA_VERSION_V1;
  readonly topicKey: string;
  readonly readinessState: 'available' | 'partial';
  readonly mode:
    typeof CHARACTER_FACE_REALIZATION_MODE_V1;
  readonly sourceResultHash: string;
  readonly projectionHash: string;
  readonly groundingHash: string;
  readonly displayFactsHash: string;
  readonly bundleHash: string;
  readonly projectionVersion:
    typeof FACE_CHARACTER_GROUNDING_PROJECTION_VERSION_V1;
  readonly unavailableSections: readonly string[];
}

export interface CharacterFaceRuntimeContextV1 {
  readonly schemaVersion:
    typeof CHARACTER_FACE_CONTEXT_SCHEMA_VERSION_V1;
  readonly topicKey: string;
  readonly readinessState: 'available' | 'partial';
  readonly mode:
    typeof CHARACTER_FACE_REALIZATION_MODE_V1;
  readonly unavailableSections: readonly string[];
  readonly groundingRef:
    CharacterFaceGroundingRefV1;
}

export interface CharacterRuntimeContextWithFaceGroundingV1
  extends CharacterRuntimeContextV1 {
  readonly face: CharacterFaceRuntimeContextV1 | null;
}

export class CharacterFaceGroundingAdmissionErrorV1 extends TypeError {
  constructor(message: string) {
    super(message);
    this.name =
      'CharacterFaceGroundingAdmissionErrorV1';
  }
}

const GROUNDING_REF_KEYS = Object.freeze([
  'schemaVersion',
  'topicKey',
  'sourceResultHash',
  'projectionHash',
  'groundingHash',
  'displayFactsHash',
  'bundleHash',
  'projectionVersion',
] as const);

const SOURCE_BINDING_KEYS = Object.freeze([
  'schemaVersion',
  'topicKey',
  'readinessState',
  'mode',
  'sourceResultHash',
  'projectionHash',
  'groundingHash',
  'displayFactsHash',
  'bundleHash',
  'projectionVersion',
  'unavailableSections',
] as const);

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

function assertOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
): void {
  const allowedSet = new Set(allowed);
  const unexpected = Object.keys(value).find(
    (key) => !allowedSet.has(key),
  );
  if (unexpected !== undefined) {
    throw new CharacterFaceGroundingAdmissionErrorV1(
      `${label} contains unexpected field: ${unexpected}.`,
    );
  }
}

function requireNonEmptyString(
  value: unknown,
  path: string,
  maxLength = 512,
): string {
  if (typeof value !== 'string') {
    throw new CharacterFaceGroundingAdmissionErrorV1(
      `${path} must be a string.`,
    );
  }

  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized.length > maxLength
  ) {
    throw new CharacterFaceGroundingAdmissionErrorV1(
      `${path} is outside the supported bounds.`,
    );
  }
  return normalized;
}

function requirePrefixedSha256(
  value: unknown,
  prefix: string,
  path: string,
): string {
  if (
    typeof value !== 'string' ||
    !value.startsWith(prefix)
  ) {
    throw new CharacterFaceGroundingAdmissionErrorV1(
      `${path} must start with ${prefix}.`,
    );
  }

  const digest = value.slice(prefix.length);
  if (!/^[0-9a-f]{64}$/u.test(digest)) {
    throw new CharacterFaceGroundingAdmissionErrorV1(
      `${path} must contain a lower-case SHA-256 hex digest.`,
    );
  }
  return value;
}

function requireUnavailableSections(
  value: unknown,
): readonly string[] {
  if (!Array.isArray(value)) {
    throw new CharacterFaceGroundingAdmissionErrorV1(
      'unavailableSections must be an array.',
    );
  }

  const normalized = value.map((entry, index) =>
    requireNonEmptyString(
      entry,
      `unavailableSections[${index}]`,
      256,
    ),
  );

  if (
    new Set(normalized).size !==
    normalized.length
  ) {
    throw new CharacterFaceGroundingAdmissionErrorV1(
      'unavailableSections must not contain duplicate values.',
    );
  }

  return Object.freeze([...normalized].sort());
}

function normalizeSourceBinding(
  candidate: unknown,
): CharacterFaceSourceBindingV1 {
  if (!isRecord(candidate)) {
    throw new CharacterFaceGroundingAdmissionErrorV1(
      'Character Face source binding must be an object.',
    );
  }

  assertOnlyKeys(
    candidate,
    SOURCE_BINDING_KEYS,
    'Character Face source binding',
  );

  if (
    candidate.schemaVersion !==
    CHARACTER_FACE_SOURCE_BINDING_SCHEMA_VERSION_V1
  ) {
    throw new CharacterFaceGroundingAdmissionErrorV1(
      'Character Face source binding schemaVersion is not supported.',
    );
  }

  if (
    candidate.projectionVersion !==
    FACE_CHARACTER_GROUNDING_PROJECTION_VERSION_V1
  ) {
    throw new CharacterFaceGroundingAdmissionErrorV1(
      'Character Face source projection version is not supported.',
    );
  }

  if (
    candidate.readinessState !== 'available' &&
    candidate.readinessState !== 'partial'
  ) {
    throw new CharacterFaceGroundingAdmissionErrorV1(
      'Character Face source readinessState must be available or partial.',
    );
  }

  if (
    candidate.mode !==
    CHARACTER_FACE_REALIZATION_MODE_V1
  ) {
    throw new CharacterFaceGroundingAdmissionErrorV1(
      'Character Face source realization mode is not supported.',
    );
  }

  return Object.freeze({
    schemaVersion:
      CHARACTER_FACE_SOURCE_BINDING_SCHEMA_VERSION_V1,
    topicKey: requireNonEmptyString(
      candidate.topicKey,
      'source.topicKey',
      256,
    ),
    readinessState:
      candidate.readinessState,
    mode:
      CHARACTER_FACE_REALIZATION_MODE_V1,
    sourceResultHash:
      requirePrefixedSha256(
        candidate.sourceResultHash,
        'face-topic-source-result:',
        'source.sourceResultHash',
      ),
    projectionHash:
      requirePrefixedSha256(
        candidate.projectionHash,
        'face-product-projection:',
        'source.projectionHash',
      ),
    groundingHash:
      requirePrefixedSha256(
        candidate.groundingHash,
        'face-grounding:',
        'source.groundingHash',
      ),
    displayFactsHash:
      requirePrefixedSha256(
        candidate.displayFactsHash,
        'face-display-facts:',
        'source.displayFactsHash',
      ),
    bundleHash:
      requirePrefixedSha256(
        candidate.bundleHash,
        'face-character-grounding:',
        'source.bundleHash',
      ),
    projectionVersion:
      FACE_CHARACTER_GROUNDING_PROJECTION_VERSION_V1,
    unavailableSections:
      requireUnavailableSections(
        candidate.unavailableSections,
      ),
  });
}

export function admitCharacterFaceGroundingRefV1(input: {
  readonly candidate: unknown;
  readonly source: unknown;
}): CharacterFaceGroundingRefV1 {
  const source =
    normalizeSourceBinding(input.source);

  if (!isRecord(input.candidate)) {
    throw new CharacterFaceGroundingAdmissionErrorV1(
      'Character Face grounding ref must be an object.',
    );
  }

  assertOnlyKeys(
    input.candidate,
    GROUNDING_REF_KEYS,
    'Character Face grounding ref',
  );

  if (
    input.candidate.schemaVersion !==
    FACE_CHARACTER_GROUNDING_REF_SCHEMA_VERSION_V1
  ) {
    throw new CharacterFaceGroundingAdmissionErrorV1(
      'Character Face grounding schemaVersion is not supported.',
    );
  }

  if (
    input.candidate.projectionVersion !==
    FACE_CHARACTER_GROUNDING_PROJECTION_VERSION_V1
  ) {
    throw new CharacterFaceGroundingAdmissionErrorV1(
      'Character Face grounding projection version is not supported.',
    );
  }

  const admitted = Object.freeze({
    schemaVersion:
      FACE_CHARACTER_GROUNDING_REF_SCHEMA_VERSION_V1,
    topicKey: requireNonEmptyString(
      input.candidate.topicKey,
      'groundingRef.topicKey',
      256,
    ),
    sourceResultHash:
      requirePrefixedSha256(
        input.candidate.sourceResultHash,
        'face-topic-source-result:',
        'groundingRef.sourceResultHash',
      ),
    projectionHash:
      requirePrefixedSha256(
        input.candidate.projectionHash,
        'face-product-projection:',
        'groundingRef.projectionHash',
      ),
    groundingHash:
      requirePrefixedSha256(
        input.candidate.groundingHash,
        'face-grounding:',
        'groundingRef.groundingHash',
      ),
    displayFactsHash:
      requirePrefixedSha256(
        input.candidate.displayFactsHash,
        'face-display-facts:',
        'groundingRef.displayFactsHash',
      ),
    bundleHash:
      requirePrefixedSha256(
        input.candidate.bundleHash,
        'face-character-grounding:',
        'groundingRef.bundleHash',
      ),
    projectionVersion:
      FACE_CHARACTER_GROUNDING_PROJECTION_VERSION_V1,
  }) satisfies CharacterFaceGroundingRefV1;

  const bindings = [
    ['topicKey', admitted.topicKey, source.topicKey],
    [
      'sourceResultHash',
      admitted.sourceResultHash,
      source.sourceResultHash,
    ],
    [
      'projectionHash',
      admitted.projectionHash,
      source.projectionHash,
    ],
    [
      'groundingHash',
      admitted.groundingHash,
      source.groundingHash,
    ],
    [
      'displayFactsHash',
      admitted.displayFactsHash,
      source.displayFactsHash,
    ],
    [
      'bundleHash',
      admitted.bundleHash,
      source.bundleHash,
    ],
    [
      'projectionVersion',
      admitted.projectionVersion,
      source.projectionVersion,
    ],
  ] as const;

  const mismatch = bindings.find(
    ([, actual, expected]) =>
      actual !== expected,
  );

  if (mismatch !== undefined) {
    throw new CharacterFaceGroundingAdmissionErrorV1(
      `Character Face grounding ${mismatch[0]} does not match the active Face source binding.`,
    );
  }

  return admitted;
}

/**
 * TOPIC-FACE-005B Character-side admission boundary.
 *
 * This layer attaches only a source-admitted production-neutral Face
 * grounding identity to an already assembled Character runtime context.
 * It does not receive grounding units, display values, claims, approved
 * research narrative blocks, Character perspective, relationship-owned
 * meaning, Commerce data, or raw biometric material.
 */
export function admitCharacterRuntimeFaceGroundingV1(input: {
  readonly context: CharacterRuntimeContextV1;
  readonly source?: unknown;
  readonly groundingRef?: unknown;
}): CharacterRuntimeContextWithFaceGroundingV1 {
  if (input.source === undefined) {
    if (input.groundingRef !== undefined) {
      throw new CharacterFaceGroundingAdmissionErrorV1(
        'Character Face grounding cannot be attached without an active Face source binding.',
      );
    }

    return Object.freeze({
      ...input.context,
      face: null,
    });
  }

  if (input.groundingRef === undefined) {
    throw new CharacterFaceGroundingAdmissionErrorV1(
      'An active Face source binding requires an admitted Character Face grounding ref.',
    );
  }

  const source =
    normalizeSourceBinding(input.source);
  const groundingRef =
    admitCharacterFaceGroundingRefV1({
      candidate: input.groundingRef,
      source,
    });

  const face = Object.freeze({
    schemaVersion:
      CHARACTER_FACE_CONTEXT_SCHEMA_VERSION_V1,
    topicKey: source.topicKey,
    readinessState:
      source.readinessState,
    mode:
      CHARACTER_FACE_REALIZATION_MODE_V1,
    unavailableSections:
      source.unavailableSections,
    groundingRef,
  }) satisfies CharacterFaceRuntimeContextV1;

  return Object.freeze({
    ...input.context,
    face,
  });
}
