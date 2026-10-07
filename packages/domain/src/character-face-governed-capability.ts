import type {
  CharacterGovernedFaceRuntimeContextV1,
} from './character-face-governed-runtime.js';

export const CHARACTER_FACE_GOVERNED_CAPABILITY_SCHEMA_VERSION_V1 =
  'character-face-governed-capability-v1' as const;
export const CHARACTER_FACE_GOVERNED_CAPABILITY_SOURCE_SCHEMA_VERSION_V1 =
  'character-face-governed-capability-source-v1' as const;
export const CHARACTER_FACE_GOVERNED_SUPPORTED_TOPIC_KEYS_V1 =
  Object.freeze(['face.reading.three_divisions'] as const);

export interface CharacterFaceGovernedCapabilitySourceV1 {
  readonly schemaVersion:
    typeof CHARACTER_FACE_GOVERNED_CAPABILITY_SOURCE_SCHEMA_VERSION_V1;
  readonly capabilityVersion: string;
  readonly characterId: string;
  readonly contentVersion: string;
  readonly faceProfileVersion: string;
  readonly allowedTopicKeys:
    readonly (typeof CHARACTER_FACE_GOVERNED_SUPPORTED_TOPIC_KEYS_V1)[number][];
  readonly canInitiate: false;
}

export interface CharacterFaceGovernedCapabilityProfileV1 {
  readonly schemaVersion:
    typeof CHARACTER_FACE_GOVERNED_CAPABILITY_SCHEMA_VERSION_V1;
  readonly capabilityVersion: string;
  readonly characterId: string;
  readonly sourceContentVersion: string;
  readonly sourceFaceProfileVersion: string;
  readonly allowedTopicKeys:
    readonly (typeof CHARACTER_FACE_GOVERNED_SUPPORTED_TOPIC_KEYS_V1)[number][];
  readonly canInitiate: false;
}

function required(value: unknown, path: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(`${path} is required.`);
  }
  return value;
}
function topics(value: unknown): CharacterFaceGovernedCapabilityProfileV1['allowedTopicKeys'] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError('Governed Face capability requires at least one supported topic.');
  }
  if (
    value.some(
      (entry) =>
        typeof entry !== 'string' ||
        !(CHARACTER_FACE_GOVERNED_SUPPORTED_TOPIC_KEYS_V1 as readonly string[]).includes(entry),
    ) ||
    new Set(value).size !== value.length
  ) {
    throw new TypeError('Governed Face capability contains unsupported or duplicate topics.');
  }
  return Object.freeze([...value]) as CharacterFaceGovernedCapabilityProfileV1['allowedTopicKeys'];
}

export function admitCharacterFaceGovernedCapabilityProfileV1(input: Readonly<{
  source: CharacterFaceGovernedCapabilitySourceV1;
  candidate: unknown;
}>): CharacterFaceGovernedCapabilityProfileV1 {
  const candidate = input.candidate as Partial<CharacterFaceGovernedCapabilityProfileV1>;
  if (
    input.source.schemaVersion !== CHARACTER_FACE_GOVERNED_CAPABILITY_SOURCE_SCHEMA_VERSION_V1 ||
    candidate.schemaVersion !== CHARACTER_FACE_GOVERNED_CAPABILITY_SCHEMA_VERSION_V1 ||
    input.source.canInitiate !== false ||
    candidate.canInitiate !== false
  ) {
    throw new TypeError('Governed Face capability contract is invalid.');
  }
  const profile = Object.freeze({
    schemaVersion: CHARACTER_FACE_GOVERNED_CAPABILITY_SCHEMA_VERSION_V1,
    capabilityVersion: required(candidate.capabilityVersion, 'capabilityVersion'),
    characterId: required(candidate.characterId, 'characterId'),
    sourceContentVersion: required(candidate.sourceContentVersion, 'sourceContentVersion'),
    sourceFaceProfileVersion: required(candidate.sourceFaceProfileVersion, 'sourceFaceProfileVersion'),
    allowedTopicKeys: topics(candidate.allowedTopicKeys),
    canInitiate: false as const,
  });
  if (
    profile.capabilityVersion !== input.source.capabilityVersion ||
    profile.characterId !== input.source.characterId ||
    profile.sourceContentVersion !== input.source.contentVersion ||
    profile.sourceFaceProfileVersion !== input.source.faceProfileVersion ||
    JSON.stringify(profile.allowedTopicKeys) !== JSON.stringify(input.source.allowedTopicKeys)
  ) {
    throw new TypeError('Governed Face capability does not exactly match authored source.');
  }
  return profile;
}

export function evaluateCharacterFaceGovernedCapabilityV1(input: Readonly<{
  characterId: string;
  characterContentVersion: string;
  faceContext: CharacterGovernedFaceRuntimeContextV1 | null;
  capability: CharacterFaceGovernedCapabilityProfileV1;
}>): Readonly<{ allowed: true }> | Readonly<{
  allowed: false;
  reason:
    | 'NO_ADMITTED_GOVERNED_FACE_CONTEXT'
    | 'CHARACTER_ID_MISMATCH'
    | 'CONTENT_VERSION_MISMATCH'
    | 'TOPIC_NOT_ALLOWED';
}> {
  if (input.faceContext === null) return Object.freeze({
    allowed: false as const,
    reason: 'NO_ADMITTED_GOVERNED_FACE_CONTEXT' as const,
  });
  if (input.characterId !== input.capability.characterId) return Object.freeze({
    allowed: false as const,
    reason: 'CHARACTER_ID_MISMATCH' as const,
  });
  if (input.characterContentVersion !== input.capability.sourceContentVersion) return Object.freeze({
    allowed: false as const,
    reason: 'CONTENT_VERSION_MISMATCH' as const,
  });
  if (!input.capability.allowedTopicKeys.includes(
    input.faceContext.topicKey as CharacterFaceGovernedCapabilityProfileV1['allowedTopicKeys'][number],
  )) return Object.freeze({
    allowed: false as const,
    reason: 'TOPIC_NOT_ALLOWED' as const,
  });
  return Object.freeze({ allowed: true as const });
}
