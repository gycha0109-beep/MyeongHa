import { createHash } from 'node:crypto';

export const CHARACTER_FACE_GOVERNED_INTERPRETATION_SCHEMA_VERSION_V1 =
  'character-face-governed-interpretation-v1' as const;

export const CHARACTER_FACE_GOVERNED_INTERPRETATION_AUTHORIZATION_STATE_V1 =
  'product_authorized' as const;

export const CHARACTER_FACE_GOVERNED_INTERPRETATION_AUTHORIZATION_SCOPE_V1 =
  'character_public_reading' as const;

export const CHARACTER_FACE_GOVERNED_INTERPRETATION_HASH_PREFIX_V1 =
  'face-governed-interpretation:' as const;

export const CHARACTER_FACE_GOVERNED_INTERPRETATION_REQUIRED_PROHIBITIONS_V1 =
  Object.freeze([
    'no_new_face_claims',
    'no_topic_remapping',
    'no_direction_mutation',
    'no_condition_removal',
    'no_conflict_resolution_without_upstream_authority',
  ] as const);

export type CharacterFaceGovernedInterpretationDirectionV1 =
  | 'favorable'
  | 'challenging'
  | 'mixed_or_conditional'
  | 'uncertain'
  | 'non_directional'
  | 'source_conflict';

export type CharacterFaceGovernedInterpretationEvidenceStatusV1 =
  | 'direct_evidence'
  | 'direct_relation'
  | 'direct_combination'
  | 'parallel_evidence'
  | 'source_conflict';

export interface CharacterFaceGovernedInterpretationSourceBindingV1 {
  readonly sourceContractVersion: string;
  readonly sourceAuthorityRef: string;
  readonly sourceResultHash: string;
  readonly topicKey: string;
}

export interface CharacterFaceGovernedInterpretationUnitV1 {
  readonly interpretationId: string;
  readonly lensKey: string;
  readonly direction: CharacterFaceGovernedInterpretationDirectionV1;
  readonly evidenceStatus: CharacterFaceGovernedInterpretationEvidenceStatusV1;
  readonly protectedMeaningText: string;
  readonly observationRefs: readonly string[];
  readonly bindingRefs: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly sourceRefs: readonly string[];
  readonly conditions: readonly string[];
  readonly qualifiers: readonly string[];
  readonly prohibitedExtensions: readonly string[];
}

export interface CharacterFaceGovernedInterpretationHandoffV1 {
  readonly schemaVersion:
    typeof CHARACTER_FACE_GOVERNED_INTERPRETATION_SCHEMA_VERSION_V1;
  readonly sourceContractVersion: string;
  readonly sourceAuthorityRef: string;
  readonly sourceResultHash: string;
  readonly topicKey: string;
  readonly authorizationState:
    typeof CHARACTER_FACE_GOVERNED_INTERPRETATION_AUTHORIZATION_STATE_V1;
  readonly authorizationScope:
    typeof CHARACTER_FACE_GOVERNED_INTERPRETATION_AUTHORIZATION_SCOPE_V1;
  readonly authorizationReceiptRef: string;
  readonly units: readonly CharacterFaceGovernedInterpretationUnitV1[];
  readonly handoffHash: string;
}

export interface CharacterFaceGovernedInterpretationSelectionV1 {
  readonly schemaVersion: 'character-face-governed-interpretation-selection-v1';
  readonly handoffHash: string;
  readonly availableLensKeys: readonly string[];
  readonly selectedInterpretationIds: readonly string[];
  readonly orderedInterpretationIds: readonly string[];
  readonly selectedLensKeys: readonly string[];
  readonly omittedInterpretationIds: readonly string[];
  readonly unavailablePreferredLensKeys: readonly string[];
}

export interface CharacterFaceProtectedInterpretationSegmentV1 {
  readonly interpretationId: string;
  readonly lensKey: string;
  readonly direction: CharacterFaceGovernedInterpretationDirectionV1;
  readonly evidenceStatus: CharacterFaceGovernedInterpretationEvidenceStatusV1;
  readonly text: string;
  readonly conditions: readonly string[];
  readonly qualifiers: readonly string[];
  readonly observationRefs: readonly string[];
  readonly bindingRefs: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly sourceRefs: readonly string[];
}

export class CharacterFaceGovernedInterpretationAdmissionErrorV1
  extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = 'CharacterFaceGovernedInterpretationAdmissionErrorV1';
  }
}

const HANDOFF_KEYS = Object.freeze([
  'schemaVersion',
  'sourceContractVersion',
  'sourceAuthorityRef',
  'sourceResultHash',
  'topicKey',
  'authorizationState',
  'authorizationScope',
  'authorizationReceiptRef',
  'units',
  'handoffHash',
] as const);

const UNIT_KEYS = Object.freeze([
  'interpretationId',
  'lensKey',
  'direction',
  'evidenceStatus',
  'protectedMeaningText',
  'observationRefs',
  'bindingRefs',
  'evidenceRefs',
  'sourceRefs',
  'conditions',
  'qualifiers',
  'prohibitedExtensions',
] as const);

const DIRECTIONS = Object.freeze([
  'favorable',
  'challenging',
  'mixed_or_conditional',
  'uncertain',
  'non_directional',
  'source_conflict',
] as const);

const EVIDENCE_STATUSES = Object.freeze([
  'direct_evidence',
  'direct_relation',
  'direct_combination',
  'parallel_evidence',
  'source_conflict',
] as const);

function fail(message: string): never {
  throw new CharacterFaceGovernedInterpretationAdmissionErrorV1(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
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
  const unexpected = Object.keys(value).find((key) => !allowedSet.has(key));
  if (unexpected !== undefined) {
    fail(`${path} contains unexpected field: ${unexpected}.`);
  }
}

function requireString(
  value: unknown,
  path: string,
  maxLength = 4096,
): string {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    value.length > maxLength
  ) {
    fail(`${path} must be a non-empty bounded string.`);
  }
  return value;
}

function requireSortedUniqueStrings(
  value: unknown,
  path: string,
  options: Readonly<{ allowEmpty: boolean }> = { allowEmpty: true },
): readonly string[] {
  if (!Array.isArray(value)) {
    fail(`${path} must be an array.`);
  }

  const values = value.map((entry, index) =>
    requireString(entry, `${path}[${index}]`, 2048),
  );

  if (!options.allowEmpty && values.length === 0) {
    fail(`${path} must contain at least one value.`);
  }

  if (new Set(values).size !== values.length) {
    fail(`${path} must not contain duplicate values.`);
  }

  const sorted = [...values].sort();
  if (sorted.some((entry, index) => entry !== values[index])) {
    fail(`${path} must preserve deterministic sort order.`);
  }

  return Object.freeze(values);
}

function canonicalize(value: unknown): unknown {
  if (value === undefined) return { $undefined: true };

  if (typeof value === 'number' && !Number.isFinite(value)) {
    return { $number: String(value) };
  }

  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (value === null || typeof value !== 'object') {
    return value;
  }

  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .map((key) => [key, canonicalize(record[key])]),
  );
}

export function hashCharacterFaceGovernedInterpretationMaterialV1(
  value: unknown,
): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(value)), 'utf8')
    .digest('hex');
}

function admitUnit(
  candidate: unknown,
  index: number,
): CharacterFaceGovernedInterpretationUnitV1 {
  const path = `CharacterFaceGovernedInterpretationHandoffV1.units[${index}]`;
  const unit = requireRecord(candidate, path);
  assertOnlyKeys(unit, UNIT_KEYS, path);

  const direction = requireString(unit.direction, `${path}.direction`, 64);
  if (!(DIRECTIONS as readonly string[]).includes(direction)) {
    fail(`${path}.direction is not supported.`);
  }

  const evidenceStatus = requireString(
    unit.evidenceStatus,
    `${path}.evidenceStatus`,
    64,
  );
  if (!(EVIDENCE_STATUSES as readonly string[]).includes(evidenceStatus)) {
    fail(`${path}.evidenceStatus is not supported.`);
  }

  if (
    (direction === 'source_conflict') !==
    (evidenceStatus === 'source_conflict')
  ) {
    fail(
      `${path} must keep source_conflict direction and evidenceStatus aligned.`,
    );
  }

  const prohibitedExtensions = requireSortedUniqueStrings(
    unit.prohibitedExtensions,
    `${path}.prohibitedExtensions`,
    { allowEmpty: false },
  );

  for (const required of CHARACTER_FACE_GOVERNED_INTERPRETATION_REQUIRED_PROHIBITIONS_V1) {
    if (!prohibitedExtensions.includes(required)) {
      fail(`${path} removed required prohibition: ${required}.`);
    }
  }

  return Object.freeze({
    interpretationId: requireString(
      unit.interpretationId,
      `${path}.interpretationId`,
      512,
    ),
    lensKey: requireString(unit.lensKey, `${path}.lensKey`, 256),
    direction:
      direction as CharacterFaceGovernedInterpretationDirectionV1,
    evidenceStatus:
      evidenceStatus as CharacterFaceGovernedInterpretationEvidenceStatusV1,
    protectedMeaningText: requireString(
      unit.protectedMeaningText,
      `${path}.protectedMeaningText`,
      8000,
    ),
    observationRefs: requireSortedUniqueStrings(
      unit.observationRefs,
      `${path}.observationRefs`,
      { allowEmpty: false },
    ),
    bindingRefs: requireSortedUniqueStrings(
      unit.bindingRefs,
      `${path}.bindingRefs`,
      { allowEmpty: false },
    ),
    evidenceRefs: requireSortedUniqueStrings(
      unit.evidenceRefs,
      `${path}.evidenceRefs`,
      { allowEmpty: false },
    ),
    sourceRefs: requireSortedUniqueStrings(
      unit.sourceRefs,
      `${path}.sourceRefs`,
      { allowEmpty: false },
    ),
    conditions: requireSortedUniqueStrings(
      unit.conditions,
      `${path}.conditions`,
    ),
    qualifiers: requireSortedUniqueStrings(
      unit.qualifiers,
      `${path}.qualifiers`,
    ),
    prohibitedExtensions,
  });
}

function assertExactSourceBinding(
  handoff: Omit<CharacterFaceGovernedInterpretationHandoffV1, 'handoffHash'>,
  expected: CharacterFaceGovernedInterpretationSourceBindingV1,
): void {
  const fields = [
    ['sourceContractVersion', handoff.sourceContractVersion, expected.sourceContractVersion],
    ['sourceAuthorityRef', handoff.sourceAuthorityRef, expected.sourceAuthorityRef],
    ['sourceResultHash', handoff.sourceResultHash, expected.sourceResultHash],
    ['topicKey', handoff.topicKey, expected.topicKey],
  ] as const;

  const mismatch = fields.find(([, actual, expectedValue]) => actual !== expectedValue);
  if (mismatch !== undefined) {
    fail(`Governed Face interpretation ${mismatch[0]} does not match the trusted upstream binding.`);
  }
}

export function admitCharacterFaceGovernedInterpretationHandoffV1(
  input: Readonly<{
    candidate: unknown;
    expectedSource: CharacterFaceGovernedInterpretationSourceBindingV1;
  }>,
): CharacterFaceGovernedInterpretationHandoffV1 {
  const raw = requireRecord(
    input.candidate,
    'CharacterFaceGovernedInterpretationHandoffV1',
  );
  assertOnlyKeys(
    raw,
    HANDOFF_KEYS,
    'CharacterFaceGovernedInterpretationHandoffV1',
  );

  if (
    raw.schemaVersion !==
    CHARACTER_FACE_GOVERNED_INTERPRETATION_SCHEMA_VERSION_V1
  ) {
    fail('Governed Face interpretation schemaVersion is not supported.');
  }

  if (
    raw.authorizationState !==
    CHARACTER_FACE_GOVERNED_INTERPRETATION_AUTHORIZATION_STATE_V1
  ) {
    fail('Governed Face interpretation is not product-authorized.');
  }

  if (
    raw.authorizationScope !==
    CHARACTER_FACE_GOVERNED_INTERPRETATION_AUTHORIZATION_SCOPE_V1
  ) {
    fail('Governed Face interpretation authorization scope is not supported.');
  }

  if (!Array.isArray(raw.units) || raw.units.length === 0) {
    fail('Governed Face interpretation handoff must contain at least one unit.');
  }

  const units = Object.freeze(
    raw.units.map((unit, index) => admitUnit(unit, index)),
  );

  const ids = units.map((unit) => unit.interpretationId);
  if (new Set(ids).size !== ids.length) {
    fail('Governed Face interpretation handoff contains duplicate interpretationId values.');
  }

  const lensKeys = units.map((unit) => unit.lensKey);
  if (new Set(lensKeys).size !== lensKeys.length) {
    fail(
      'Governed Face interpretation handoff must contain at most one upstream-resolved unit per lensKey.',
    );
  }

  const withoutHash = Object.freeze({
    schemaVersion:
      CHARACTER_FACE_GOVERNED_INTERPRETATION_SCHEMA_VERSION_V1,
    sourceContractVersion: requireString(
      raw.sourceContractVersion,
      'CharacterFaceGovernedInterpretationHandoffV1.sourceContractVersion',
      512,
    ),
    sourceAuthorityRef: requireString(
      raw.sourceAuthorityRef,
      'CharacterFaceGovernedInterpretationHandoffV1.sourceAuthorityRef',
      1024,
    ),
    sourceResultHash: requireString(
      raw.sourceResultHash,
      'CharacterFaceGovernedInterpretationHandoffV1.sourceResultHash',
      1024,
    ),
    topicKey: requireString(
      raw.topicKey,
      'CharacterFaceGovernedInterpretationHandoffV1.topicKey',
      512,
    ),
    authorizationState:
      CHARACTER_FACE_GOVERNED_INTERPRETATION_AUTHORIZATION_STATE_V1,
    authorizationScope:
      CHARACTER_FACE_GOVERNED_INTERPRETATION_AUTHORIZATION_SCOPE_V1,
    authorizationReceiptRef: requireString(
      raw.authorizationReceiptRef,
      'CharacterFaceGovernedInterpretationHandoffV1.authorizationReceiptRef',
      1024,
    ),
    units,
  } satisfies Omit<
    CharacterFaceGovernedInterpretationHandoffV1,
    'handoffHash'
  >);

  assertExactSourceBinding(withoutHash, input.expectedSource);

  const handoffHash = requireString(
    raw.handoffHash,
    'CharacterFaceGovernedInterpretationHandoffV1.handoffHash',
    256,
  );

  const expectedHash =
    CHARACTER_FACE_GOVERNED_INTERPRETATION_HASH_PREFIX_V1 +
    hashCharacterFaceGovernedInterpretationMaterialV1(withoutHash);

  if (handoffHash !== expectedHash) {
    fail('Governed Face interpretation handoff hash does not match admitted material.');
  }

  return Object.freeze({
    ...withoutHash,
    handoffHash,
  });
}

export function selectCharacterFaceGovernedInterpretationsV1(
  input: Readonly<{
    handoff: CharacterFaceGovernedInterpretationHandoffV1;
    preferredLensOrder: readonly string[];
    maxUnits: number;
  }>,
): CharacterFaceGovernedInterpretationSelectionV1 {
  if (
    !Number.isInteger(input.maxUnits) ||
    input.maxUnits < 1 ||
    input.maxUnits > 4
  ) {
    fail('Governed Face interpretation selection maxUnits must remain within 1..4.');
  }

  const preferredLensOrder = input.preferredLensOrder.map(
    (lensKey, index) =>
      requireString(
        lensKey,
        `preferredLensOrder[${index}]`,
        256,
      ),
  );

  if (new Set(preferredLensOrder).size !== preferredLensOrder.length) {
    fail('preferredLensOrder must not contain duplicate lens keys.');
  }

  const byLens = new Map(
    input.handoff.units.map((unit) => [unit.lensKey, unit] as const),
  );
  const ordered: CharacterFaceGovernedInterpretationUnitV1[] = [];
  const seen = new Set<string>();

  for (const lensKey of input.preferredLensOrder) {
    const unit = byLens.get(lensKey);
    if (unit !== undefined && !seen.has(unit.interpretationId)) {
      ordered.push(unit);
      seen.add(unit.interpretationId);
    }
  }

  for (const unit of input.handoff.units) {
    if (!seen.has(unit.interpretationId)) {
      ordered.push(unit);
      seen.add(unit.interpretationId);
    }
  }

  const selected = ordered.slice(0, input.maxUnits);
  const selectedIds = new Set(selected.map((unit) => unit.interpretationId));

  return Object.freeze({
    schemaVersion:
      'character-face-governed-interpretation-selection-v1' as const,
    handoffHash: input.handoff.handoffHash,
    availableLensKeys: Object.freeze(
      input.handoff.units.map((unit) => unit.lensKey),
    ),
    selectedInterpretationIds: Object.freeze(
      input.handoff.units
        .filter((unit) => selectedIds.has(unit.interpretationId))
        .map((unit) => unit.interpretationId),
    ),
    orderedInterpretationIds: Object.freeze(
      selected.map((unit) => unit.interpretationId),
    ),
    selectedLensKeys: Object.freeze(
      selected.map((unit) => unit.lensKey),
    ),
    omittedInterpretationIds: Object.freeze(
      input.handoff.units
        .filter((unit) => !selectedIds.has(unit.interpretationId))
        .map((unit) => unit.interpretationId),
    ),
    unavailablePreferredLensKeys: Object.freeze(
      input.preferredLensOrder.filter((lensKey) => !byLens.has(lensKey)),
    ),
  });
}

export function buildCharacterFaceProtectedInterpretationSegmentsV1(
  input: Readonly<{
    handoff: CharacterFaceGovernedInterpretationHandoffV1;
    selection: CharacterFaceGovernedInterpretationSelectionV1;
  }>,
): readonly CharacterFaceProtectedInterpretationSegmentV1[] {
  if (input.selection.handoffHash !== input.handoff.handoffHash) {
    fail('Governed Face interpretation selection belongs to another handoff.');
  }

  const byId = new Map(
    input.handoff.units.map((unit) => [unit.interpretationId, unit] as const),
  );

  return Object.freeze(
    input.selection.orderedInterpretationIds.map((interpretationId) => {
      const unit = byId.get(interpretationId);
      if (unit === undefined) {
        fail(
          'Governed Face interpretation selection references an unknown interpretationId.',
        );
      }

      return Object.freeze({
        interpretationId: unit.interpretationId,
        lensKey: unit.lensKey,
        direction: unit.direction,
        evidenceStatus: unit.evidenceStatus,
        text: unit.protectedMeaningText,
        conditions: unit.conditions,
        qualifiers: unit.qualifiers,
        observationRefs: unit.observationRefs,
        bindingRefs: unit.bindingRefs,
        evidenceRefs: unit.evidenceRefs,
        sourceRefs: unit.sourceRefs,
      });
    }),
  );
}
