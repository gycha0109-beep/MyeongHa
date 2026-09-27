import { createHash } from 'node:crypto';

import {
  CHARACTER_FACE_CONTEXT_SCHEMA_VERSION_V1,
  FACE_CHARACTER_GROUNDING_PROJECTION_VERSION_V1,
  FACE_CHARACTER_GROUNDING_REF_SCHEMA_VERSION_V1,
  type CharacterFaceGroundingRefV1,
  type CharacterFaceRuntimeContextV1,
} from './character-face-grounding-admission.js';

export const FACE_CHARACTER_GROUNDING_SCHEMA_VERSION_V1 =
  'face-character-grounding-v1' as const;

export const FACE_CHARACTER_REALIZATION_POLICY_REGISTRY_VERSION_V1 =
  'face-character-realization-policy-v1' as const;

export const FACE_CHARACTER_NEUTRAL_REALIZATION_POLICY_V1 =
  'bounded_neutral_fact_render_v1' as const;

export type CharacterFaceDisplayUnitV1 =
  | 'ratio'
  | 'degree'
  | 'radian'
  | 'centimeter';

export interface CharacterFaceScalarDisplayValueV1 {
  readonly kind: 'scalar';
  readonly value: number;
  readonly unit: CharacterFaceDisplayUnitV1;
}

export interface CharacterFaceDisplayAxisV1 {
  readonly axisKey: string;
  readonly value: number;
  readonly unit: CharacterFaceDisplayUnitV1;
  readonly sourceMetricRef: string;
}

export interface CharacterFaceAxesDisplayValueV1 {
  readonly kind:
    | 'continuous_axes'
    | 'composite_visible_nasal_geometry';
  readonly axes:
    readonly CharacterFaceDisplayAxisV1[];
}

export type CharacterFaceDisplayValueV1 =
  | CharacterFaceScalarDisplayValueV1
  | CharacterFaceAxesDisplayValueV1;

export interface CharacterFaceObservationUnitViewV1 {
  readonly unitId: string;
  readonly kind: 'neutral_observation';
  readonly capabilityKey: string;
  readonly observationRef: string;
  readonly displayFactRef: string;
  readonly displayValue:
    CharacterFaceDisplayValueV1;
  readonly qualifiers: readonly string[];
  readonly prohibitedExtensions:
    readonly string[];
  readonly realizationPolicyRef:
    typeof FACE_CHARACTER_NEUTRAL_REALIZATION_POLICY_V1;
}

export interface CharacterFaceGroundingBundleViewV1 {
  readonly schemaVersion:
    typeof FACE_CHARACTER_GROUNDING_SCHEMA_VERSION_V1;
  readonly projectionVersion:
    typeof FACE_CHARACTER_GROUNDING_PROJECTION_VERSION_V1;
  readonly realizationPolicyRegistryVersion:
    typeof FACE_CHARACTER_REALIZATION_POLICY_REGISTRY_VERSION_V1;
  readonly topicKey: string;
  readonly readinessState:
    | 'available'
    | 'partial';
  readonly faceEngineVersion: string;
  readonly sourceResultHash: string;
  readonly projectionHash: string;
  readonly groundingHash: string;
  readonly displayFactsHash: string;
  readonly units:
    readonly CharacterFaceObservationUnitViewV1[];
  readonly unavailableSections:
    readonly string[];
  readonly prohibitedInferences:
    readonly string[];
  readonly bundleHash: string;
}

export interface CharacterFaceGroundingBundleProviderV1 {
  load(
    ref: CharacterFaceGroundingRefV1,
  ): Promise<unknown>;
}

export class CharacterFaceGroundingBundleAdmissionErrorV1
  extends TypeError {
  constructor(message: string) {
    super(message);
    this.name =
      'CharacterFaceGroundingBundleAdmissionErrorV1';
  }
}

const BUNDLE_KEYS = Object.freeze([
  'schemaVersion',
  'projectionVersion',
  'realizationPolicyRegistryVersion',
  'topicKey',
  'readinessState',
  'faceEngineVersion',
  'sourceResultHash',
  'projectionHash',
  'groundingHash',
  'displayFactsHash',
  'units',
  'unavailableSections',
  'prohibitedInferences',
  'bundleHash',
] as const);

const UNIT_KEYS = Object.freeze([
  'unitId',
  'kind',
  'capabilityKey',
  'observationRef',
  'displayFactRef',
  'displayValue',
  'qualifiers',
  'prohibitedExtensions',
  'realizationPolicyRef',
] as const);

const SCALAR_VALUE_KEYS = Object.freeze([
  'kind',
  'value',
  'unit',
] as const);

const AXES_VALUE_KEYS = Object.freeze([
  'kind',
  'axes',
] as const);

const AXIS_KEYS = Object.freeze([
  'axisKey',
  'value',
  'unit',
  'sourceMetricRef',
] as const);

const DISPLAY_UNITS = Object.freeze([
  'ratio',
  'degree',
  'radian',
  'centimeter',
] as const);

const REQUIRED_NEUTRAL_PROHIBITION =
  'traditional_semantic_promotion_without_governed_claim';

function fail(message: string): never {
  throw new CharacterFaceGroundingBundleAdmissionErrorV1(
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
  maxLength = 1024,
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

function requirePrefixedSha256(
  value: unknown,
  prefix: string,
  path: string,
): string {
  if (
    typeof value !== 'string' ||
    !value.startsWith(prefix) ||
    !/^[0-9a-f]{64}$/u.test(
      value.slice(prefix.length),
    )
  ) {
    fail(
      `${path} must be ${prefix}<64 lower-case hex>.`,
    );
  }
  return value;
}

function requireFiniteNumber(
  value: unknown,
  path: string,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value)
  ) {
    fail(
      `${path} must be a finite number.`,
    );
  }
  return value;
}

function requireDisplayUnit(
  value: unknown,
  path: string,
): CharacterFaceDisplayUnitV1 {
  if (
    typeof value !== 'string' ||
    !(DISPLAY_UNITS as readonly string[])
      .includes(value)
  ) {
    fail(
      `${path} contains an unsupported display unit.`,
    );
  }
  return value as CharacterFaceDisplayUnitV1;
}

function requireSortedUniqueStrings(
  value: unknown,
  path: string,
): readonly string[] {
  if (!Array.isArray(value)) {
    fail(`${path} must be an array.`);
  }

  const values = value.map(
    (entry, index) =>
      requireString(
        entry,
        `${path}[${index}]`,
        512,
      ),
  );

  if (
    new Set(values).size !==
    values.length
  ) {
    fail(
      `${path} must not contain duplicate values.`,
    );
  }

  const sorted = [...values].sort();
  if (
    sorted.some(
      (entry, index) =>
        entry !== values[index],
    )
  ) {
    fail(
      `${path} must preserve source deterministic sort order.`,
    );
  }

  return Object.freeze(values);
}

function admitDisplayValue(
  candidate: unknown,
  path: string,
): CharacterFaceDisplayValueV1 {
  const value =
    requireRecord(candidate, path);

  if (value.kind === 'scalar') {
    assertOnlyKeys(
      value,
      SCALAR_VALUE_KEYS,
      path,
    );

    return Object.freeze({
      kind: 'scalar' as const,
      value: requireFiniteNumber(
        value.value,
        `${path}.value`,
      ),
      unit: requireDisplayUnit(
        value.unit,
        `${path}.unit`,
      ),
    });
  }

  if (
    value.kind !== 'continuous_axes' &&
    value.kind !==
      'composite_visible_nasal_geometry'
  ) {
    fail(
      `${path}.kind is not supported.`,
    );
  }

  assertOnlyKeys(
    value,
    AXES_VALUE_KEYS,
    path,
  );

  if (
    !Array.isArray(value.axes) ||
    value.axes.length === 0
  ) {
    fail(
      `${path}.axes must contain at least one axis.`,
    );
  }

  const axes = value.axes.map(
    (rawAxis, index) => {
      const axis = requireRecord(
        rawAxis,
        `${path}.axes[${index}]`,
      );
      assertOnlyKeys(
        axis,
        AXIS_KEYS,
        `${path}.axes[${index}]`,
      );

      return Object.freeze({
        axisKey: requireString(
          axis.axisKey,
          `${path}.axes[${index}].axisKey`,
          256,
        ),
        value: requireFiniteNumber(
          axis.value,
          `${path}.axes[${index}].value`,
        ),
        unit: requireDisplayUnit(
          axis.unit,
          `${path}.axes[${index}].unit`,
        ),
        sourceMetricRef: requireString(
          axis.sourceMetricRef,
          `${path}.axes[${index}].sourceMetricRef`,
          512,
        ),
      });
    },
  );

  const axisKeys =
    axes.map((axis) => axis.axisKey);
  if (
    new Set(axisKeys).size !==
    axisKeys.length
  ) {
    fail(
      `${path}.axes contains duplicate axisKey values.`,
    );
  }

  const sortedAxisKeys =
    [...axisKeys].sort();
  if (
    sortedAxisKeys.some(
      (axisKey, index) =>
        axisKey !== axisKeys[index],
    )
  ) {
    fail(
      `${path}.axes must preserve source deterministic sort order.`,
    );
  }

  return Object.freeze({
    kind: value.kind,
    axes: Object.freeze(axes),
  });
}

function admitObservationUnit(
  candidate: unknown,
  index: number,
  bundleProhibitions:
    readonly string[],
): CharacterFaceObservationUnitViewV1 {
  const path =
    `FaceCharacterGroundingBundleV1.units[${index}]`;
  const unit =
    requireRecord(candidate, path);
  assertOnlyKeys(
    unit,
    UNIT_KEYS,
    path,
  );

  if (
    unit.kind !==
    'neutral_observation'
  ) {
    fail(
      `${path}.kind must remain neutral_observation.`,
    );
  }

  if (
    unit.realizationPolicyRef !==
    FACE_CHARACTER_NEUTRAL_REALIZATION_POLICY_V1
  ) {
    fail(
      `${path}.realizationPolicyRef is not source-authorized.`,
    );
  }

  const qualifiers =
    requireSortedUniqueStrings(
      unit.qualifiers,
      `${path}.qualifiers`,
    );
  const prohibitedExtensions =
    requireSortedUniqueStrings(
      unit.prohibitedExtensions,
      `${path}.prohibitedExtensions`,
    );

  for (
    const prohibited
    of bundleProhibitions
  ) {
    if (
      !prohibitedExtensions.includes(
        prohibited,
      )
    ) {
      fail(
        `${path} removed bundle prohibition: ${prohibited}.`,
      );
    }
  }

  if (
    !prohibitedExtensions.includes(
      REQUIRED_NEUTRAL_PROHIBITION,
    )
  ) {
    fail(
      `${path} removed the neutral-to-traditional promotion prohibition.`,
    );
  }

  return Object.freeze({
    unitId: requireString(
      unit.unitId,
      `${path}.unitId`,
      512,
    ),
    kind:
      'neutral_observation' as const,
    capabilityKey: requireString(
      unit.capabilityKey,
      `${path}.capabilityKey`,
      512,
    ),
    observationRef: requireString(
      unit.observationRef,
      `${path}.observationRef`,
      1024,
    ),
    displayFactRef: requireString(
      unit.displayFactRef,
      `${path}.displayFactRef`,
      1024,
    ),
    displayValue:
      admitDisplayValue(
        unit.displayValue,
        `${path}.displayValue`,
      ),
    qualifiers,
    prohibitedExtensions,
    realizationPolicyRef:
      FACE_CHARACTER_NEUTRAL_REALIZATION_POLICY_V1,
  });
}

function canonicalizeSourceHash(
  value: unknown,
): unknown {
  if (value === undefined) {
    return { $undefined: true };
  }

  if (
    typeof value === 'number' &&
    !Number.isFinite(value)
  ) {
    return {
      $number: String(value),
    };
  }

  if (Array.isArray(value)) {
    return value.map(
      canonicalizeSourceHash,
    );
  }

  if (
    value === null ||
    typeof value !== 'object'
  ) {
    return value;
  }

  const record =
    value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .map((key) => [
        key,
        canonicalizeSourceHash(
          record[key],
        ),
      ]),
  );
}

export function hashCharacterFaceGroundingBundleMaterialV1(
  value: unknown,
): string {
  const serialized = JSON.stringify(
    canonicalizeSourceHash(value),
  );
  return createHash('sha256')
    .update(serialized, 'utf8')
    .digest('hex');
}

function assertExactArray(
  actual: readonly string[],
  expected: readonly string[],
  path: string,
): void {
  if (
    actual.length !== expected.length ||
    actual.some(
      (value, index) =>
        value !== expected[index],
    )
  ) {
    fail(
      `${path} does not match the admitted Face context.`,
    );
  }
}

function assertBundleMatchesRef(
  bundle:
    CharacterFaceGroundingBundleViewV1,
  ref: CharacterFaceGroundingRefV1,
): void {
  const bindings = [
    [
      'topicKey',
      bundle.topicKey,
      ref.topicKey,
    ],
    [
      'sourceResultHash',
      bundle.sourceResultHash,
      ref.sourceResultHash,
    ],
    [
      'projectionHash',
      bundle.projectionHash,
      ref.projectionHash,
    ],
    [
      'groundingHash',
      bundle.groundingHash,
      ref.groundingHash,
    ],
    [
      'displayFactsHash',
      bundle.displayFactsHash,
      ref.displayFactsHash,
    ],
    [
      'bundleHash',
      bundle.bundleHash,
      ref.bundleHash,
    ],
    [
      'projectionVersion',
      bundle.projectionVersion,
      ref.projectionVersion,
    ],
  ] as const;

  const mismatch = bindings.find(
    ([, actual, expected]) =>
      actual !== expected,
  );

  if (mismatch !== undefined) {
    fail(
      `Face grounding bundle ${mismatch[0]} does not match the admitted grounding ref.`,
    );
  }
}

function assertContextContract(
  context: CharacterFaceRuntimeContextV1,
): void {
  if (
    context.schemaVersion !==
    CHARACTER_FACE_CONTEXT_SCHEMA_VERSION_V1
  ) {
    fail(
      'Face runtime context schemaVersion is not supported.',
    );
  }

  if (
    context.groundingRef.schemaVersion !==
      FACE_CHARACTER_GROUNDING_REF_SCHEMA_VERSION_V1 ||
    context.groundingRef.projectionVersion !==
      FACE_CHARACTER_GROUNDING_PROJECTION_VERSION_V1
  ) {
    fail(
      'Face runtime context grounding ref version is not supported.',
    );
  }

  if (
    context.readinessState !==
      'available' &&
    context.readinessState !== 'partial'
  ) {
    fail(
      'Face runtime context readinessState is not supported.',
    );
  }

  if (
    context.mode !==
    'neutral_fact_realization'
  ) {
    fail(
      'Face runtime context mode is not supported.',
    );
  }
}

export function admitCharacterFaceGroundingBundleViewV1(
  input: {
    readonly candidate: unknown;
    readonly context:
      CharacterFaceRuntimeContextV1;
  },
): CharacterFaceGroundingBundleViewV1 {
  assertContextContract(input.context);

  const bundle = requireRecord(
    input.candidate,
    'FaceCharacterGroundingBundleV1',
  );
  assertOnlyKeys(
    bundle,
    BUNDLE_KEYS,
    'FaceCharacterGroundingBundleV1',
  );

  if (
    bundle.schemaVersion !==
    FACE_CHARACTER_GROUNDING_SCHEMA_VERSION_V1
  ) {
    fail(
      'Face grounding bundle schemaVersion is not supported.',
    );
  }

  if (
    bundle.projectionVersion !==
    FACE_CHARACTER_GROUNDING_PROJECTION_VERSION_V1
  ) {
    fail(
      'Face grounding bundle projectionVersion is not supported.',
    );
  }

  if (
    bundle.realizationPolicyRegistryVersion !==
    FACE_CHARACTER_REALIZATION_POLICY_REGISTRY_VERSION_V1
  ) {
    fail(
      'Face grounding bundle realization policy registry version is not supported.',
    );
  }

  if (
    bundle.readinessState !==
      'available' &&
    bundle.readinessState !== 'partial'
  ) {
    fail(
      'Face grounding bundle readinessState must be available or partial.',
    );
  }

  const prohibitedInferences =
    requireSortedUniqueStrings(
      bundle.prohibitedInferences,
      'FaceCharacterGroundingBundleV1.prohibitedInferences',
    );
  const unavailableSections =
    requireSortedUniqueStrings(
      bundle.unavailableSections,
      'FaceCharacterGroundingBundleV1.unavailableSections',
    );

  if (
    !Array.isArray(bundle.units) ||
    bundle.units.length === 0
  ) {
    fail(
      'Face grounding bundle must contain at least one source unit.',
    );
  }

  const units = Object.freeze(
    bundle.units.map(
      (unit, index) =>
        admitObservationUnit(
          unit,
          index,
          prohibitedInferences,
        ),
    ),
  );

  const identities = [
    [
      'unitId',
      units.map((unit) => unit.unitId),
    ],
    [
      'observationRef',
      units.map(
        (unit) => unit.observationRef,
      ),
    ],
    [
      'displayFactRef',
      units.map(
        (unit) => unit.displayFactRef,
      ),
    ],
  ] as const;

  for (
    const [field, values]
    of identities
  ) {
    if (
      new Set(values).size !==
      values.length
    ) {
      fail(
        `Face grounding bundle contains duplicate ${field} values.`,
      );
    }
  }

  const sortedUnitIds =
    units
      .map((unit) => unit.unitId)
      .slice()
      .sort();
  if (
    sortedUnitIds.some(
      (unitId, index) =>
        unitId !== units[index]?.unitId,
    )
  ) {
    fail(
      'Face grounding bundle units must preserve source deterministic order.',
    );
  }

  const withoutHash = Object.freeze({
    schemaVersion:
      FACE_CHARACTER_GROUNDING_SCHEMA_VERSION_V1,
    projectionVersion:
      FACE_CHARACTER_GROUNDING_PROJECTION_VERSION_V1,
    realizationPolicyRegistryVersion:
      FACE_CHARACTER_REALIZATION_POLICY_REGISTRY_VERSION_V1,
    topicKey: requireString(
      bundle.topicKey,
      'FaceCharacterGroundingBundleV1.topicKey',
      512,
    ),
    readinessState:
      bundle.readinessState,
    faceEngineVersion:
      requireString(
        bundle.faceEngineVersion,
        'FaceCharacterGroundingBundleV1.faceEngineVersion',
        512,
      ),
    sourceResultHash:
      requirePrefixedSha256(
        bundle.sourceResultHash,
        'face-topic-source-result:',
        'FaceCharacterGroundingBundleV1.sourceResultHash',
      ),
    projectionHash:
      requirePrefixedSha256(
        bundle.projectionHash,
        'face-product-projection:',
        'FaceCharacterGroundingBundleV1.projectionHash',
      ),
    groundingHash:
      requirePrefixedSha256(
        bundle.groundingHash,
        'face-grounding:',
        'FaceCharacterGroundingBundleV1.groundingHash',
      ),
    displayFactsHash:
      requirePrefixedSha256(
        bundle.displayFactsHash,
        'face-display-facts:',
        'FaceCharacterGroundingBundleV1.displayFactsHash',
      ),
    units,
    unavailableSections,
    prohibitedInferences,
  } satisfies Omit<
    CharacterFaceGroundingBundleViewV1,
    'bundleHash'
  >);

  const bundleHash =
    requirePrefixedSha256(
      bundle.bundleHash,
      'face-character-grounding:',
      'FaceCharacterGroundingBundleV1.bundleHash',
    );

  const expectedBundleHash =
    `face-character-grounding:${hashCharacterFaceGroundingBundleMaterialV1(
      withoutHash,
    )}`;

  if (
    bundleHash !== expectedBundleHash
  ) {
    fail(
      'Face grounding bundle hash does not match source-compatible bundle material.',
    );
  }

  const admitted = Object.freeze({
    ...withoutHash,
    bundleHash,
  });

  assertBundleMatchesRef(
    admitted,
    input.context.groundingRef,
  );

  if (
    admitted.topicKey !==
    input.context.topicKey
  ) {
    fail(
      'Face grounding bundle topicKey does not match the admitted Face context.',
    );
  }

  if (
    admitted.readinessState !==
    input.context.readinessState
  ) {
    fail(
      'Face grounding bundle readinessState does not match the admitted Face context.',
    );
  }

  assertExactArray(
    admitted.unavailableSections,
    input.context.unavailableSections,
    'Face grounding bundle unavailableSections',
  );

  return admitted;
}
