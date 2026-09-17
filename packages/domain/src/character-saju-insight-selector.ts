import { createHash } from 'node:crypto';

import type { SajuDomain } from '../../contracts/src/index.js';
import {
  SAJU_CHARACTER_GROUNDING_PROJECTION_VERSION_V1,
  SAJU_CHARACTER_GROUNDING_SCHEMA_VERSION_V1,
  SAJU_GROUNDING_AXIS_REGISTRY_VERSION_V1,
  type CharacterRuntimeContextWithGroundingV1,
  type CharacterSajuGroundingRefV1,
} from './character-saju-grounding-admission.js';
import {
  CHARACTER_PERSPECTIVE_NARRATIVE_ROLES_V1,
  SAJU_GROUNDING_AXIS_KEYS_V1,
  type CharacterPerspectiveGroundingAxisKeyV1,
  type CharacterPerspectiveNarrativeRoleV1,
  type CharacterPerspectiveProfileV1,
} from './character-saju-perspective.js';

export const CHARACTER_INSIGHT_SELECTION_SCHEMA_VERSION_V1 =
  'myeongha-character-insight-selection-v1' as const;

export const CHARACTER_GROUNDING_REALIZATION_POLICIES_V1 = Object.freeze([
  'bounded_semantic_paraphrase_v1',
  'bounded_factual_render_v1',
  'protected_only_v1',
] as const);

export type CharacterGroundingRealizationPolicyRefV1 =
  (typeof CHARACTER_GROUNDING_REALIZATION_POLICIES_V1)[number];

export interface CharacterGroundingDisclosureViewV1 {
  readonly disclosureRef: string;
  readonly type:
    | 'calculation_ambiguity'
    | 'methodology_difference'
    | 'insufficient_evidence'
    | 'scope_limitation';
  readonly text: string;
  readonly sourceDisclosureIndex: number;
}

export interface CharacterGroundingAmbiguityViewV1 {
  readonly ambiguityRef: string;
  readonly kind: 'calculation' | 'reading_block';
  readonly sourceRef: string;
  readonly title?: string;
  readonly summary: string;
  readonly scenarios?: readonly { readonly label: string; readonly text: string }[];
}

export interface CharacterGroundingUnitViewV1 {
  readonly unitId: string;
  readonly domain: SajuDomain;
  readonly axis: CharacterPerspectiveGroundingAxisKeyV1;
  readonly narrativeRole: CharacterPerspectiveNarrativeRoleV1;
  readonly semanticKey: string;
  readonly canonicalMeaning: string;
  readonly sourceBlockRefs: readonly string[];
  readonly qualifiers?: readonly string[];
  readonly prohibitedExtensions?: readonly string[];
  readonly ambiguityRef?: string;
  readonly requiredCompanionUnitRefs: readonly string[];
  readonly requiredDisclosureRefs: readonly string[];
  readonly realizationPolicyRef: CharacterGroundingRealizationPolicyRefV1;
}

export interface CharacterSajuGroundingBundleViewV1 {
  readonly schemaVersion: typeof SAJU_CHARACTER_GROUNDING_SCHEMA_VERSION_V1;
  readonly groundingProjectionVersion: typeof SAJU_CHARACTER_GROUNDING_PROJECTION_VERSION_V1;
  readonly axisRegistryVersion: typeof SAJU_GROUNDING_AXIS_REGISTRY_VERSION_V1;
  readonly readingRef: string;
  readonly productResponseVersion: string;
  readonly engineVersion: string;
  readonly readingDomain: SajuDomain;
  readonly sourceResponseHash: string;
  readonly groundingHash: string;
  readonly units: readonly CharacterGroundingUnitViewV1[];
  readonly disclosures: readonly CharacterGroundingDisclosureViewV1[];
  readonly ambiguities: readonly CharacterGroundingAmbiguityViewV1[];
}

export type CharacterSelectionReasonCodeV1 =
  | 'selected_primary'
  | 'selected_role_fill'
  | 'selected_required_tension'
  | 'selected_required_limitation'
  | 'selected_required_companion'
  | 'attention_axis_preferred'
  | 'protected_only_non_limitation'
  | 'ambiguity_requires_limitation'
  | 'same_axis_deduplicated'
  | 'role_quota_exhausted'
  | 'required_companion_unavailable'
  | 'not_selected_by_perspective';

export interface CharacterSelectionReasonV1 {
  readonly unitId: string;
  readonly disposition: 'selected' | 'omitted';
  readonly codes: readonly CharacterSelectionReasonCodeV1[];
}

export interface CharacterInsightSelectionV1 {
  readonly schemaVersion: typeof CHARACTER_INSIGHT_SELECTION_SCHEMA_VERSION_V1;
  readonly characterId: string;
  readonly readingRef: string;
  readonly requestedDomain: SajuDomain;
  readonly perspectiveVersion: string;
  readonly selectedUnitIds: readonly string[];
  readonly orderedUnitIds: readonly string[];
  readonly omittedUnitIds: readonly string[];
  readonly selectionReasons: readonly CharacterSelectionReasonV1[];
}

export class CharacterInsightSelectionErrorV1 extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = 'CharacterInsightSelectionErrorV1';
  }
}

const BUNDLE_KEYS = Object.freeze([
  'schemaVersion',
  'groundingProjectionVersion',
  'axisRegistryVersion',
  'readingRef',
  'productResponseVersion',
  'engineVersion',
  'readingDomain',
  'sourceResponseHash',
  'groundingHash',
  'units',
  'disclosures',
  'ambiguities',
] as const);
const UNIT_KEYS = Object.freeze([
  'unitId',
  'domain',
  'axis',
  'narrativeRole',
  'semanticKey',
  'canonicalMeaning',
  'sourceBlockRefs',
  'qualifiers',
  'prohibitedExtensions',
  'ambiguityRef',
  'requiredCompanionUnitRefs',
  'requiredDisclosureRefs',
  'realizationPolicyRef',
] as const);
const DISCLOSURE_KEYS = Object.freeze([
  'disclosureRef',
  'type',
  'text',
  'sourceDisclosureIndex',
] as const);
const AMBIGUITY_KEYS = Object.freeze([
  'ambiguityRef',
  'kind',
  'sourceRef',
  'title',
  'summary',
  'scenarios',
] as const);
const SCENARIO_KEYS = Object.freeze(['label', 'text'] as const);
const DISCLOSURE_TYPES = Object.freeze([
  'calculation_ambiguity',
  'methodology_difference',
  'insufficient_evidence',
  'scope_limitation',
] as const);
const AMBIGUITY_KINDS = Object.freeze(['calculation', 'reading_block'] as const);
const SAJU_DOMAINS = Object.freeze([
  'general',
  'family',
  'relationship',
  'compatibility',
  'career',
  'business',
  'wealth',
  'life_stage',
  'question_specific',
] as const satisfies readonly SajuDomain[]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertRecord(value: unknown, path: string): asserts value is Record<string, unknown> {
  if (!isRecord(value)) {
    throw new CharacterInsightSelectionErrorV1(`${path} must be an object.`);
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
    throw new CharacterInsightSelectionErrorV1(`${path} contains unexpected field: ${unexpected}.`);
  }
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new CharacterInsightSelectionErrorV1(`${path} must be a non-empty string.`);
  }
  return value;
}

function requireHash(value: unknown, path: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/u.test(value)) {
    throw new CharacterInsightSelectionErrorV1(`${path} must be a lower-case SHA-256 digest.`);
  }
  return value;
}

function requireArray(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new CharacterInsightSelectionErrorV1(`${path} must be an array.`);
  }
  return value;
}

function requireEnum<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
  path: string,
): T[number] {
  if (typeof value !== 'string' || !allowed.includes(value as T[number])) {
    throw new CharacterInsightSelectionErrorV1(`${path} contains an unsupported value.`);
  }
  return value as T[number];
}

function requireNonNegativeInteger(value: unknown, path: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new CharacterInsightSelectionErrorV1(`${path} must be a non-negative integer.`);
  }
  return value as number;
}

function readUniqueStringArray(value: unknown, path: string): readonly string[] {
  const raw = requireArray(value, path);
  const result = raw.map((item, index) => requireString(item, `${path}[${index}]`));
  if (new Set(result).size !== result.length) {
    throw new CharacterInsightSelectionErrorV1(`${path} must not contain duplicates.`);
  }
  return Object.freeze(result);
}

function canonicalizeSourceHash(value: unknown): unknown {
  if (value === undefined) return { $undefined: true };
  if (typeof value === 'number' && !Number.isFinite(value)) {
    return { $number: String(value) };
  }
  if (Array.isArray(value)) return value.map(canonicalizeSourceHash);
  if (value === null || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .map((key) => [key, canonicalizeSourceHash(record[key])]),
  );
}

export function hashCharacterSajuGroundingBundleMaterialV1(value: unknown): string {
  const serialized = JSON.stringify(canonicalizeSourceHash(value));
  return createHash('sha256').update(serialized).digest('hex');
}

function assertIdentityMatches(
  bundle: Omit<CharacterSajuGroundingBundleViewV1, 'groundingHash'> & {
    readonly groundingHash: string;
  },
  expected: CharacterSajuGroundingRefV1,
): void {
  const identityFields = [
    ['schemaVersion', bundle.schemaVersion, expected.schemaVersion],
    ['groundingProjectionVersion', bundle.groundingProjectionVersion, expected.groundingProjectionVersion],
    ['axisRegistryVersion', bundle.axisRegistryVersion, expected.axisRegistryVersion],
    ['readingRef', bundle.readingRef, expected.readingRef],
    ['productResponseVersion', bundle.productResponseVersion, expected.productResponseVersion],
    ['engineVersion', bundle.engineVersion, expected.engineVersion],
    ['readingDomain', bundle.readingDomain, expected.readingDomain],
    ['sourceResponseHash', bundle.sourceResponseHash, expected.sourceResponseHash],
    ['groundingHash', bundle.groundingHash, expected.groundingHash],
  ] as const;
  for (const [field, actual, expectedValue] of identityFields) {
    if (actual !== expectedValue) {
      throw new CharacterInsightSelectionErrorV1(
        `Character Saju grounding bundle ${field} does not match admitted grounding identity.`,
      );
    }
  }
}

function admitDisclosure(
  raw: unknown,
  index: number,
): CharacterGroundingDisclosureViewV1 {
  const path = `CharacterGroundingBundleV1.disclosures[${index}]`;
  assertRecord(raw, path);
  assertOnlyKeys(raw, DISCLOSURE_KEYS, path);
  return Object.freeze({
    disclosureRef: requireString(raw.disclosureRef, `${path}.disclosureRef`),
    type: requireEnum(raw.type, DISCLOSURE_TYPES, `${path}.type`),
    text: requireString(raw.text, `${path}.text`),
    sourceDisclosureIndex: requireNonNegativeInteger(
      raw.sourceDisclosureIndex,
      `${path}.sourceDisclosureIndex`,
    ),
  });
}

function admitAmbiguity(raw: unknown, index: number): CharacterGroundingAmbiguityViewV1 {
  const path = `CharacterGroundingBundleV1.ambiguities[${index}]`;
  assertRecord(raw, path);
  assertOnlyKeys(raw, AMBIGUITY_KEYS, path);
  const scenarios =
    raw.scenarios === undefined
      ? undefined
      : Object.freeze(
          requireArray(raw.scenarios, `${path}.scenarios`).map((scenario, scenarioIndex) => {
            const scenarioPath = `${path}.scenarios[${scenarioIndex}]`;
            assertRecord(scenario, scenarioPath);
            assertOnlyKeys(scenario, SCENARIO_KEYS, scenarioPath);
            return Object.freeze({
              label: requireString(scenario.label, `${scenarioPath}.label`),
              text: requireString(scenario.text, `${scenarioPath}.text`),
            });
          }),
        );
  return Object.freeze({
    ambiguityRef: requireString(raw.ambiguityRef, `${path}.ambiguityRef`),
    kind: requireEnum(raw.kind, AMBIGUITY_KINDS, `${path}.kind`),
    sourceRef: requireString(raw.sourceRef, `${path}.sourceRef`),
    ...(raw.title === undefined ? {} : { title: requireString(raw.title, `${path}.title`) }),
    summary: requireString(raw.summary, `${path}.summary`),
    ...(scenarios === undefined ? {} : { scenarios }),
  });
}

function admitUnit(raw: unknown, index: number): CharacterGroundingUnitViewV1 {
  const path = `CharacterGroundingBundleV1.units[${index}]`;
  assertRecord(raw, path);
  assertOnlyKeys(raw, UNIT_KEYS, path);
  const unitId = requireString(raw.unitId, `${path}.unitId`);
  if (!/^grounding_unit_[0-9a-f]{24}$/u.test(unitId)) {
    throw new CharacterInsightSelectionErrorV1(`${path}.unitId is invalid.`);
  }
  return Object.freeze({
    unitId,
    domain: requireEnum(raw.domain, SAJU_DOMAINS, `${path}.domain`),
    axis: requireEnum(raw.axis, SAJU_GROUNDING_AXIS_KEYS_V1, `${path}.axis`),
    narrativeRole: requireEnum(
      raw.narrativeRole,
      CHARACTER_PERSPECTIVE_NARRATIVE_ROLES_V1,
      `${path}.narrativeRole`,
    ),
    semanticKey: requireString(raw.semanticKey, `${path}.semanticKey`),
    canonicalMeaning: requireString(raw.canonicalMeaning, `${path}.canonicalMeaning`),
    sourceBlockRefs: readUniqueStringArray(raw.sourceBlockRefs, `${path}.sourceBlockRefs`),
    ...(raw.qualifiers === undefined
      ? {}
      : { qualifiers: readUniqueStringArray(raw.qualifiers, `${path}.qualifiers`) }),
    ...(raw.prohibitedExtensions === undefined
      ? {}
      : {
          prohibitedExtensions: readUniqueStringArray(
            raw.prohibitedExtensions,
            `${path}.prohibitedExtensions`,
          ),
        }),
    ...(raw.ambiguityRef === undefined
      ? {}
      : { ambiguityRef: requireString(raw.ambiguityRef, `${path}.ambiguityRef`) }),
    requiredCompanionUnitRefs: readUniqueStringArray(
      raw.requiredCompanionUnitRefs,
      `${path}.requiredCompanionUnitRefs`,
    ),
    requiredDisclosureRefs: readUniqueStringArray(
      raw.requiredDisclosureRefs,
      `${path}.requiredDisclosureRefs`,
    ),
    realizationPolicyRef: requireEnum(
      raw.realizationPolicyRef,
      CHARACTER_GROUNDING_REALIZATION_POLICIES_V1,
      `${path}.realizationPolicyRef`,
    ),
  });
}

function assertCompanionGraph(units: readonly CharacterGroundingUnitViewV1[]): void {
  const byId = new Map(units.map((unit) => [unit.unitId, unit]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (unitId: string): void => {
    if (visited.has(unitId)) return;
    if (visiting.has(unitId)) {
      throw new CharacterInsightSelectionErrorV1(
        'Character Saju grounding companion graph must be acyclic.',
      );
    }
    const unit = byId.get(unitId);
    if (unit === undefined) {
      throw new CharacterInsightSelectionErrorV1(
        'Character Saju grounding contains a dangling companion unit reference.',
      );
    }
    visiting.add(unitId);
    unit.requiredCompanionUnitRefs.forEach(visit);
    visiting.delete(unitId);
    visited.add(unitId);
  };
  units.forEach((unit) => visit(unit.unitId));
}

export function admitCharacterSajuGroundingBundleViewV1(input: {
  readonly candidate: unknown;
  readonly expectedRef: CharacterSajuGroundingRefV1;
}): CharacterSajuGroundingBundleViewV1 {
  assertRecord(input.candidate, 'CharacterGroundingBundleV1');
  assertOnlyKeys(input.candidate, BUNDLE_KEYS, 'CharacterGroundingBundleV1');

  if (input.candidate.schemaVersion !== SAJU_CHARACTER_GROUNDING_SCHEMA_VERSION_V1) {
    throw new CharacterInsightSelectionErrorV1('Character Saju grounding schemaVersion is invalid.');
  }
  if (
    input.candidate.groundingProjectionVersion !==
    SAJU_CHARACTER_GROUNDING_PROJECTION_VERSION_V1
  ) {
    throw new CharacterInsightSelectionErrorV1(
      'Character Saju grounding projection version is invalid.',
    );
  }
  if (input.candidate.axisRegistryVersion !== SAJU_GROUNDING_AXIS_REGISTRY_VERSION_V1) {
    throw new CharacterInsightSelectionErrorV1(
      'Character Saju grounding axis registry version is invalid.',
    );
  }

  const readingDomain = requireEnum(
    input.candidate.readingDomain,
    SAJU_DOMAINS,
    'CharacterGroundingBundleV1.readingDomain',
  );
  const disclosures = Object.freeze(
    requireArray(input.candidate.disclosures, 'CharacterGroundingBundleV1.disclosures').map(
      admitDisclosure,
    ),
  );
  const ambiguities = Object.freeze(
    requireArray(input.candidate.ambiguities, 'CharacterGroundingBundleV1.ambiguities').map(
      admitAmbiguity,
    ),
  );
  const units = Object.freeze(
    requireArray(input.candidate.units, 'CharacterGroundingBundleV1.units').map(admitUnit),
  );
  if (units.length === 0) {
    throw new CharacterInsightSelectionErrorV1(
      'Character Saju grounding bundle must contain at least one unit.',
    );
  }

  const unitIds = new Set<string>();
  const disclosureRefs = new Set(disclosures.map((item) => item.disclosureRef));
  const ambiguityRefs = new Set(ambiguities.map((item) => item.ambiguityRef));
  for (const unit of units) {
    if (unit.domain !== readingDomain) {
      throw new CharacterInsightSelectionErrorV1(
        `Grounding unit ${unit.unitId} domain does not match bundle readingDomain.`,
      );
    }
    if (unitIds.has(unit.unitId)) {
      throw new CharacterInsightSelectionErrorV1('Character Saju grounding unit ids must be unique.');
    }
    unitIds.add(unit.unitId);
    for (const disclosureRef of unit.requiredDisclosureRefs) {
      if (!disclosureRefs.has(disclosureRef)) {
        throw new CharacterInsightSelectionErrorV1(
          `Grounding unit ${unit.unitId} contains a dangling disclosure reference.`,
        );
      }
    }
    if (unit.ambiguityRef !== undefined && !ambiguityRefs.has(unit.ambiguityRef)) {
      throw new CharacterInsightSelectionErrorV1(
        `Grounding unit ${unit.unitId} contains a dangling ambiguity reference.`,
      );
    }
  }
  if (new Set(disclosures.map((item) => item.disclosureRef)).size !== disclosures.length) {
    throw new CharacterInsightSelectionErrorV1(
      'Character Saju grounding disclosure refs must be unique.',
    );
  }
  if (new Set(ambiguities.map((item) => item.ambiguityRef)).size !== ambiguities.length) {
    throw new CharacterInsightSelectionErrorV1(
      'Character Saju grounding ambiguity refs must be unique.',
    );
  }
  assertCompanionGraph(units);

  const readingRef = requireString(input.candidate.readingRef, 'CharacterGroundingBundleV1.readingRef');
  const productResponseVersion = requireString(
    input.candidate.productResponseVersion,
    'CharacterGroundingBundleV1.productResponseVersion',
  );
  const engineVersion = requireString(
    input.candidate.engineVersion,
    'CharacterGroundingBundleV1.engineVersion',
  );
  const sourceResponseHash = requireHash(
    input.candidate.sourceResponseHash,
    'CharacterGroundingBundleV1.sourceResponseHash',
  );
  const groundingHash = requireHash(
    input.candidate.groundingHash,
    'CharacterGroundingBundleV1.groundingHash',
  );

  const withoutHash = {
    schemaVersion: SAJU_CHARACTER_GROUNDING_SCHEMA_VERSION_V1,
    groundingProjectionVersion: SAJU_CHARACTER_GROUNDING_PROJECTION_VERSION_V1,
    axisRegistryVersion: SAJU_GROUNDING_AXIS_REGISTRY_VERSION_V1,
    readingRef,
    productResponseVersion,
    engineVersion,
    readingDomain,
    sourceResponseHash,
    units,
    disclosures,
    ambiguities,
  } as const;
  const expectedHash = hashCharacterSajuGroundingBundleMaterialV1(withoutHash);
  if (groundingHash !== expectedHash) {
    throw new CharacterInsightSelectionErrorV1(
      'Character Saju grounding bundle hash does not match bundle content.',
    );
  }

  const admitted = Object.freeze({ ...withoutHash, groundingHash });
  assertIdentityMatches(admitted, input.expectedRef);
  return admitted;
}

type CandidateMeta = {
  readonly unit: CharacterGroundingUnitViewV1;
  readonly sourceIndex: number;
  readonly attentionRank: number;
  readonly roleRank: number;
};

type SelectionState = {
  readonly selected: Set<string>;
  readonly selectedAxes: Set<CharacterPerspectiveGroundingAxisKeyV1>;
  readonly roleCounts: Map<CharacterPerspectiveNarrativeRoleV1, number>;
  readonly reasonCodes: Map<string, CharacterSelectionReasonCodeV1[]>;
};

function roleLimit(
  profile: CharacterPerspectiveProfileV1,
  role: CharacterPerspectiveNarrativeRoleV1,
): number {
  switch (role) {
    case 'primary':
      return profile.selection.maxPrimaryUnits;
    case 'supporting':
      return profile.selection.maxSupportingUnits;
    case 'tension':
      return profile.selection.maxTensionUnits;
    case 'limitation':
      return profile.selection.maxLimitationUnits;
  }
}

function roleOrder(profile: CharacterPerspectiveProfileV1): readonly CharacterPerspectiveNarrativeRoleV1[] {
  const fallback = ['primary', 'supporting', 'tension', 'limitation'] as const;
  return Object.freeze([
    ...profile.preferredNarrativeRoles,
    ...fallback.filter((role) => !profile.preferredNarrativeRoles.includes(role)),
  ]);
}

function candidateComparator(left: CandidateMeta, right: CandidateMeta): number {
  return (
    left.attentionRank - right.attentionRank ||
    left.roleRank - right.roleRank ||
    left.sourceIndex - right.sourceIndex ||
    left.unit.unitId.localeCompare(right.unit.unitId)
  );
}

function collectCompanionClosure(
  rootId: string,
  byId: ReadonlyMap<string, CandidateMeta>,
): readonly CandidateMeta[] | null {
  const result = new Map<string, CandidateMeta>();
  const visit = (unitId: string): boolean => {
    if (result.has(unitId)) return true;
    const candidate = byId.get(unitId);
    if (candidate === undefined) return false;
    result.set(unitId, candidate);
    return candidate.unit.requiredCompanionUnitRefs.every(visit);
  };
  if (!visit(rootId)) return null;
  return Object.freeze([...result.values()].sort((a, b) => a.sourceIndex - b.sourceIndex));
}

function addReason(
  state: SelectionState,
  unitId: string,
  code: CharacterSelectionReasonCodeV1,
): void {
  const existing = state.reasonCodes.get(unitId) ?? [];
  if (!existing.includes(code)) existing.push(code);
  state.reasonCodes.set(unitId, existing);
}

function attemptSelect(input: {
  readonly candidate: CandidateMeta;
  readonly byId: ReadonlyMap<string, CandidateMeta>;
  readonly profile: CharacterPerspectiveProfileV1;
  readonly state: SelectionState;
  readonly reason: CharacterSelectionReasonCodeV1;
  readonly forceAxisRepeat?: boolean;
}): boolean {
  if (input.state.selected.has(input.candidate.unit.unitId)) return true;
  const closure = collectCompanionClosure(input.candidate.unit.unitId, input.byId);
  if (closure === null) {
    addReason(input.state, input.candidate.unit.unitId, 'required_companion_unavailable');
    return false;
  }

  const additions = closure.filter((item) => !input.state.selected.has(item.unit.unitId));
  const roleAdds = new Map<CharacterPerspectiveNarrativeRoleV1, number>();
  for (const item of additions) {
    roleAdds.set(item.unit.narrativeRole, (roleAdds.get(item.unit.narrativeRole) ?? 0) + 1);
  }
  for (const [role, count] of roleAdds) {
    const current = input.state.roleCounts.get(role) ?? 0;
    if (current + count > roleLimit(input.profile, role)) return false;
  }

  if (input.profile.selection.avoidSameAxisRepetition && input.forceAxisRepeat !== true) {
    if (additions.some((item) => input.state.selectedAxes.has(item.unit.axis))) return false;
    const axes = additions.map((item) => item.unit.axis);
    if (new Set(axes).size !== axes.length) return false;
  }

  additions.forEach((item) => {
    input.state.selected.add(item.unit.unitId);
    input.state.selectedAxes.add(item.unit.axis);
    input.state.roleCounts.set(
      item.unit.narrativeRole,
      (input.state.roleCounts.get(item.unit.narrativeRole) ?? 0) + 1,
    );
    addReason(
      input.state,
      item.unit.unitId,
      item.unit.unitId === input.candidate.unit.unitId ? input.reason : 'selected_required_companion',
    );
    if (Number.isFinite(item.attentionRank)) {
      addReason(input.state, item.unit.unitId, 'attention_axis_preferred');
    }
  });
  return true;
}

function assertSelectorContext(input: {
  readonly context: CharacterRuntimeContextWithGroundingV1;
  readonly perspective: CharacterPerspectiveProfileV1;
  readonly requestedDomain: SajuDomain;
}): CharacterSajuGroundingRefV1 {
  const saju = input.context.saju;
  if (saju === null) {
    throw new CharacterInsightSelectionErrorV1(
      'Character Insight Selector requires an active Saju runtime context.',
    );
  }
  if (saju.groundingRef === null) {
    throw new CharacterInsightSelectionErrorV1(
      'Character Insight Selector requires an admitted Saju grounding ref; use protected fallback otherwise.',
    );
  }
  if (input.requestedDomain !== saju.domain || input.requestedDomain !== saju.capability.domain) {
    throw new CharacterInsightSelectionErrorV1(
      'Requested Saju domain is not admitted by the active Character capability.',
    );
  }
  if (input.perspective.characterId !== input.context.characterId) {
    throw new CharacterInsightSelectionErrorV1(
      'Perspective profile does not belong to the active Character.',
    );
  }
  if (input.perspective.sourceContentVersion !== input.context.contentVersion) {
    throw new CharacterInsightSelectionErrorV1(
      'Perspective profile is stale for the active Character content version.',
    );
  }
  if (input.perspective.sourceSajuProfileVersion !== input.context.sajuProfile.profileVersion) {
    throw new CharacterInsightSelectionErrorV1(
      'Perspective profile is stale for the active Character Saju profile.',
    );
  }
  return saju.groundingRef;
}

export function selectCharacterInsightsV1(input: {
  readonly context: CharacterRuntimeContextWithGroundingV1;
  readonly grounding: unknown;
  readonly perspective: CharacterPerspectiveProfileV1;
  readonly requestedDomain: SajuDomain;
}): CharacterInsightSelectionV1 {
  const groundingRef = assertSelectorContext(input);
  const grounding = admitCharacterSajuGroundingBundleViewV1({
    candidate: input.grounding,
    expectedRef: groundingRef,
  });
  if (grounding.readingDomain !== input.requestedDomain) {
    throw new CharacterInsightSelectionErrorV1(
      'Grounding bundle domain does not match the requested Character Saju domain.',
    );
  }

  const roleRanks = new Map(roleOrder(input.perspective).map((role, index) => [role, index]));
  const attentionRanks = new Map(
    input.perspective.attentionOrder.map((axis, index) => [axis, index]),
  );
  const metas: CandidateMeta[] = grounding.units.map((unit, sourceIndex) => ({
    unit,
    sourceIndex,
    attentionRank: attentionRanks.get(unit.axis) ?? Number.POSITIVE_INFINITY,
    roleRank: roleRanks.get(unit.narrativeRole) ?? Number.POSITIVE_INFINITY,
  }));

  const state: SelectionState = {
    selected: new Set<string>(),
    selectedAxes: new Set<CharacterPerspectiveGroundingAxisKeyV1>(),
    roleCounts: new Map<CharacterPerspectiveNarrativeRoleV1, number>(),
    reasonCodes: new Map<string, CharacterSelectionReasonCodeV1[]>(),
  };
  const eligible: CandidateMeta[] = [];
  for (const meta of metas) {
    if (
      meta.unit.realizationPolicyRef === 'protected_only_v1' &&
      meta.unit.narrativeRole !== 'limitation'
    ) {
      addReason(state, meta.unit.unitId, 'protected_only_non_limitation');
      continue;
    }
    if (meta.unit.ambiguityRef !== undefined && meta.unit.narrativeRole !== 'limitation') {
      addReason(state, meta.unit.unitId, 'ambiguity_requires_limitation');
      continue;
    }
    eligible.push(meta);
  }

  const eligibleById = new Map(eligible.map((meta) => [meta.unit.unitId, meta]));
  const byRole = (role: CharacterPerspectiveNarrativeRoleV1): CandidateMeta[] =>
    eligible.filter((meta) => meta.unit.narrativeRole === role).sort(candidateComparator);

  for (const candidate of byRole('primary')) {
    if ((state.roleCounts.get('primary') ?? 0) >= input.perspective.selection.maxPrimaryUnits) break;
    attemptSelect({
      candidate,
      byId: eligibleById,
      profile: input.perspective,
      state,
      reason: 'selected_primary',
    });
  }

  const preserveAtLeastOne = (
    role: 'tension' | 'limitation',
    reason: 'selected_required_tension' | 'selected_required_limitation',
  ): void => {
    if (roleLimit(input.perspective, role) === 0 || (state.roleCounts.get(role) ?? 0) > 0) return;
    const candidates = byRole(role);
    for (const candidate of candidates) {
      if (
        attemptSelect({
          candidate,
          byId: eligibleById,
          profile: input.perspective,
          state,
          reason,
          forceAxisRepeat: true,
        })
      ) {
        return;
      }
    }
  };
  preserveAtLeastOne('tension', 'selected_required_tension');
  preserveAtLeastOne('limitation', 'selected_required_limitation');

  for (const role of roleOrder(input.perspective)) {
    const limit = roleLimit(input.perspective, role);
    for (const candidate of byRole(role)) {
      if ((state.roleCounts.get(role) ?? 0) >= limit) break;
      attemptSelect({
        candidate,
        byId: eligibleById,
        profile: input.perspective,
        state,
        reason: role === 'primary' ? 'selected_primary' : 'selected_role_fill',
      });
    }
  }

  if (state.selected.size === 0) {
    throw new CharacterInsightSelectionErrorV1(
      'No source-grounded Saju unit is selectable for this Character perspective.',
    );
  }

  for (const meta of metas) {
    if (state.selected.has(meta.unit.unitId) || state.reasonCodes.has(meta.unit.unitId)) continue;
    if ((state.roleCounts.get(meta.unit.narrativeRole) ?? 0) >= roleLimit(input.perspective, meta.unit.narrativeRole)) {
      addReason(state, meta.unit.unitId, 'role_quota_exhausted');
    } else if (
      input.perspective.selection.avoidSameAxisRepetition &&
      state.selectedAxes.has(meta.unit.axis)
    ) {
      addReason(state, meta.unit.unitId, 'same_axis_deduplicated');
    } else if (
      meta.unit.requiredCompanionUnitRefs.some((ref) => !eligibleById.has(ref))
    ) {
      addReason(state, meta.unit.unitId, 'required_companion_unavailable');
    } else {
      addReason(state, meta.unit.unitId, 'not_selected_by_perspective');
    }
  }

  const selectedUnitIds = Object.freeze(
    metas.filter((meta) => state.selected.has(meta.unit.unitId)).map((meta) => meta.unit.unitId),
  );
  const orderedUnitIds = Object.freeze(
    metas
      .filter((meta) => state.selected.has(meta.unit.unitId))
      .sort(candidateComparator)
      .map((meta) => meta.unit.unitId),
  );
  const omittedUnitIds = Object.freeze(
    metas.filter((meta) => !state.selected.has(meta.unit.unitId)).map((meta) => meta.unit.unitId),
  );
  const selectionReasons = Object.freeze(
    metas.map((meta) =>
      Object.freeze({
        unitId: meta.unit.unitId,
        disposition: state.selected.has(meta.unit.unitId) ? ('selected' as const) : ('omitted' as const),
        codes: Object.freeze([...(state.reasonCodes.get(meta.unit.unitId) ?? [])]),
      }),
    ),
  );

  return Object.freeze({
    schemaVersion: CHARACTER_INSIGHT_SELECTION_SCHEMA_VERSION_V1,
    characterId: input.context.characterId,
    readingRef: grounding.readingRef,
    requestedDomain: input.requestedDomain,
    perspectiveVersion: input.perspective.perspectiveVersion,
    selectedUnitIds,
    orderedUnitIds,
    omittedUnitIds,
    selectionReasons,
  });
}
