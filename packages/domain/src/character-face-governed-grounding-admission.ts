import {
  admitCharacterFaceGovernedInterpretationHandoffV1,
  hashCharacterFaceGovernedInterpretationMaterialV1,
  type CharacterFaceGovernedInterpretationSourceBindingV1,
} from './character-face-governed-interpretation.js';
import {
  CHARACTER_FACE_GOVERNED_GROUNDING_PROJECTION_VERSION_V1,
  CHARACTER_FACE_GOVERNED_GROUNDING_REF_SCHEMA_VERSION_V1,
  CHARACTER_FACE_GOVERNED_GROUNDING_SCHEMA_VERSION_V1,
  CHARACTER_FACE_GOVERNED_MODE_V1,
  CHARACTER_FACE_GOVERNED_REALIZATION_POLICY_REGISTRY_VERSION_V1,
  CHARACTER_FACE_GOVERNED_REALIZATION_POLICY_V1,
  type CharacterFaceGovernedGroundingAdmissionV1,
  type CharacterFaceGovernedGroundingBundleV1,
  type CharacterFaceGovernedGroundingRefV1,
  type CharacterFaceGovernedGroundingUnitV1,
} from './character-face-governed-grounding.js';

export class CharacterFaceGovernedGroundingAdmissionErrorV1 extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = 'CharacterFaceGovernedGroundingAdmissionErrorV1';
  }
}

const BUNDLE_KEYS = new Set([
  'schemaVersion','projectionVersion','realizationPolicyRegistryVersion','mode',
  'topicKey','sourceContractVersion','sourceAuthorityRef','sourceResultHash',
  'authorizationReceiptRef','handoffHash','faceEngineVersion','faceReadingRef',
  'methodologyPackRefs','bindingGroupRefs','units','unavailableSections',
  'prohibitedInferences','provenanceRefs','bundleHash',
]);
const REF_KEYS = new Set([
  'schemaVersion','projectionVersion','mode','topicKey','sourceContractVersion',
  'sourceAuthorityRef','sourceResultHash','authorizationReceiptRef','handoffHash',
  'faceEngineVersion','faceReadingRef','methodologyPackRefs','bundleHash',
]);
const UNIT_KEYS = new Set([
  'interpretationId','lensKey','direction','evidenceStatus','protectedMeaningText',
  'observationRefs','bindingRefs','evidenceRefs','sourceRefs','conditions',
  'qualifiers','prohibitedExtensions','realizationPolicyRef',
]);
const PRIVATE = [
  'rawimage','rawphoto','rawjpeg','rawlandmark','landmarkindex','mediapipe',
  'posematrix','faceembedding','identitytemplate','highresolutioncrop','hirescrop',
] as const;

function fail(message: string): never {
  throw new CharacterFaceGovernedGroundingAdmissionErrorV1(message);
}
function rec(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${path} must be an object.`);
  }
  return value as Record<string, unknown>;
}
function exact(value: Record<string, unknown>, keys: ReadonlySet<string>, path: string): void {
  const extra = Object.keys(value).find((key) => !keys.has(key));
  if (extra !== undefined) fail(`${path} contains unexpected field: ${extra}.`);
}
function str(value: unknown, path: string, max = 4096): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    fail(`${path} must be bounded non-empty text.`);
  }
  return value;
}
function arr(value: unknown, path: string, required = false): readonly string[] {
  if (!Array.isArray(value)) fail(`${path} must be an array.`);
  const values = value.map((entry, index) => str(entry, `${path}[${index}]`, 2048));
  if (required && values.length === 0) fail(`${path} must not be empty.`);
  if (new Set(values).size !== values.length) fail(`${path} has duplicates.`);
  if ([...values].sort().some((entry, index) => entry !== values[index])) {
    fail(`${path} must be deterministically sorted.`);
  }
  return Object.freeze(values);
}
function privacy(value: unknown): void {
  if (Array.isArray(value)) return void value.forEach(privacy);
  if (value === null || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/gu, '');
    if (PRIVATE.some((fragment) => normalized.includes(fragment))) {
      fail(`Governed Face grounding contains privacy-forbidden field: ${key}.`);
    }
    privacy(child);
  }
}
function same(left: unknown, right: unknown): boolean {
  return hashCharacterFaceGovernedInterpretationMaterialV1(left) ===
    hashCharacterFaceGovernedInterpretationMaterialV1(right);
}

export function admitCharacterFaceGovernedGroundingV1(input: Readonly<{
  candidateGrounding: unknown;
  candidateGroundingRef: unknown;
  candidateHandoff: unknown;
  expectedSource: CharacterFaceGovernedInterpretationSourceBindingV1;
}>): CharacterFaceGovernedGroundingAdmissionV1 {
  privacy(input.candidateGrounding);
  privacy(input.candidateGroundingRef);
  const handoff = admitCharacterFaceGovernedInterpretationHandoffV1({
    candidate: input.candidateHandoff,
    expectedSource: input.expectedSource,
  });

  const raw = rec(input.candidateGrounding, 'governedGrounding');
  exact(raw, BUNDLE_KEYS, 'governedGrounding');
  if (
    raw.schemaVersion !== CHARACTER_FACE_GOVERNED_GROUNDING_SCHEMA_VERSION_V1 ||
    raw.projectionVersion !== CHARACTER_FACE_GOVERNED_GROUNDING_PROJECTION_VERSION_V1 ||
    raw.realizationPolicyRegistryVersion !==
      CHARACTER_FACE_GOVERNED_REALIZATION_POLICY_REGISTRY_VERSION_V1 ||
    raw.mode !== CHARACTER_FACE_GOVERNED_MODE_V1 ||
    !Array.isArray(raw.units) ||
    raw.units.length !== handoff.units.length
  ) {
    fail('Governed Face grounding contract identity or unit coverage is invalid.');
  }

  const units = Object.freeze(raw.units.map((candidate, index) => {
    const unit = rec(candidate, `grounding.units[${index}]`);
    exact(unit, UNIT_KEYS, `grounding.units[${index}]`);
    if (unit.realizationPolicyRef !== CHARACTER_FACE_GOVERNED_REALIZATION_POLICY_V1) {
      fail('Governed Face grounding realization policy is not supported.');
    }
    const { realizationPolicyRef: _policy, ...meaning } = unit;
    if (!same(meaning, handoff.units[index])) {
      fail('Governed Face grounding unit changed source meaning.');
    }
    return Object.freeze({
      ...handoff.units[index]!,
      realizationPolicyRef: CHARACTER_FACE_GOVERNED_REALIZATION_POLICY_V1,
    }) satisfies CharacterFaceGovernedGroundingUnitV1;
  }));

  const material = Object.freeze({
    schemaVersion: CHARACTER_FACE_GOVERNED_GROUNDING_SCHEMA_VERSION_V1,
    projectionVersion: CHARACTER_FACE_GOVERNED_GROUNDING_PROJECTION_VERSION_V1,
    realizationPolicyRegistryVersion:
      CHARACTER_FACE_GOVERNED_REALIZATION_POLICY_REGISTRY_VERSION_V1,
    mode: CHARACTER_FACE_GOVERNED_MODE_V1,
    topicKey: str(raw.topicKey, 'grounding.topicKey', 256),
    sourceContractVersion: str(raw.sourceContractVersion, 'grounding.sourceContractVersion', 256),
    sourceAuthorityRef: str(raw.sourceAuthorityRef, 'grounding.sourceAuthorityRef'),
    sourceResultHash: str(raw.sourceResultHash, 'grounding.sourceResultHash'),
    authorizationReceiptRef: str(raw.authorizationReceiptRef, 'grounding.authorizationReceiptRef'),
    handoffHash: str(raw.handoffHash, 'grounding.handoffHash'),
    faceEngineVersion: str(raw.faceEngineVersion, 'grounding.faceEngineVersion', 256),
    ...(raw.faceReadingRef === undefined ? {} : {
      faceReadingRef: str(raw.faceReadingRef, 'grounding.faceReadingRef'),
    }),
    methodologyPackRefs: arr(raw.methodologyPackRefs, 'grounding.methodologyPackRefs', true),
    bindingGroupRefs: arr(raw.bindingGroupRefs, 'grounding.bindingGroupRefs', true),
    units,
    unavailableSections: arr(raw.unavailableSections, 'grounding.unavailableSections'),
    prohibitedInferences: arr(raw.prohibitedInferences, 'grounding.prohibitedInferences', true),
    provenanceRefs: arr(raw.provenanceRefs, 'grounding.provenanceRefs', true),
  } as const);

  const identities = [
    ['topicKey', material.topicKey, handoff.topicKey],
    ['sourceContractVersion', material.sourceContractVersion, handoff.sourceContractVersion],
    ['sourceAuthorityRef', material.sourceAuthorityRef, handoff.sourceAuthorityRef],
    ['sourceResultHash', material.sourceResultHash, handoff.sourceResultHash],
    ['authorizationReceiptRef', material.authorizationReceiptRef, handoff.authorizationReceiptRef],
    ['handoffHash', material.handoffHash, handoff.handoffHash],
  ] as const;
  const mismatch = identities.find(([, actual, expected]) => actual !== expected);
  if (mismatch !== undefined) {
    fail(`Governed Face grounding ${mismatch[0]} does not match admitted handoff.`);
  }

  const bundleHash = str(raw.bundleHash, 'grounding.bundleHash');
  const expectedHash = 'face-governed-character-grounding:' +
    hashCharacterFaceGovernedInterpretationMaterialV1(material);
  if (bundleHash !== expectedHash) fail('Governed Face grounding bundleHash mismatch.');

  const grounding = Object.freeze({ ...material, bundleHash })
    satisfies CharacterFaceGovernedGroundingBundleV1;

  const rawRef = rec(input.candidateGroundingRef, 'governedGroundingRef');
  exact(rawRef, REF_KEYS, 'governedGroundingRef');
  const expectedRef = Object.freeze({
    schemaVersion: CHARACTER_FACE_GOVERNED_GROUNDING_REF_SCHEMA_VERSION_V1,
    projectionVersion: grounding.projectionVersion,
    mode: grounding.mode,
    topicKey: grounding.topicKey,
    sourceContractVersion: grounding.sourceContractVersion,
    sourceAuthorityRef: grounding.sourceAuthorityRef,
    sourceResultHash: grounding.sourceResultHash,
    authorizationReceiptRef: grounding.authorizationReceiptRef,
    handoffHash: grounding.handoffHash,
    faceEngineVersion: grounding.faceEngineVersion,
    ...(grounding.faceReadingRef === undefined ? {} : { faceReadingRef: grounding.faceReadingRef }),
    methodologyPackRefs: grounding.methodologyPackRefs,
    bundleHash: grounding.bundleHash,
  }) satisfies CharacterFaceGovernedGroundingRefV1;
  if (!same(rawRef, expectedRef)) fail('Governed Face grounding ref mismatch.');

  return Object.freeze({ handoff, grounding, groundingRef: expectedRef });
}
