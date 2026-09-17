import type { SajuDomain } from '../../contracts/src/index.js';
import type {
  CharacterRuntimeContextV1,
  CharacterSajuRuntimeContextV1,
} from './character-runtime-context.js';

export const SAJU_CHARACTER_GROUNDING_SCHEMA_VERSION_V1 =
  'myeonghwa-character-grounding-v1' as const;
export const SAJU_CHARACTER_GROUNDING_PROJECTION_VERSION_V1 =
  'myeonghwa-character-grounding-projection-v1' as const;
export const SAJU_GROUNDING_AXIS_REGISTRY_VERSION_V1 =
  'myeonghwa-grounding-axis-v1' as const;

export interface CharacterSajuGroundingRefV1 {
  readonly schemaVersion: typeof SAJU_CHARACTER_GROUNDING_SCHEMA_VERSION_V1;
  readonly groundingProjectionVersion: typeof SAJU_CHARACTER_GROUNDING_PROJECTION_VERSION_V1;
  readonly axisRegistryVersion: typeof SAJU_GROUNDING_AXIS_REGISTRY_VERSION_V1;
  readonly readingRef: string;
  readonly productResponseVersion: string;
  readonly engineVersion: string;
  readonly readingDomain: SajuDomain;
  readonly sourceResponseHash: string;
  readonly groundingHash: string;
}

export interface CharacterSajuRuntimeContextWithGroundingV1
  extends CharacterSajuRuntimeContextV1 {
  readonly groundingRef: CharacterSajuGroundingRefV1 | null;
}

export interface CharacterRuntimeContextWithGroundingV1
  extends Omit<CharacterRuntimeContextV1, 'saju'> {
  readonly saju: CharacterSajuRuntimeContextWithGroundingV1 | null;
}

export class CharacterSajuGroundingAdmissionErrorV1 extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = 'CharacterSajuGroundingAdmissionErrorV1';
  }
}

const GROUNDING_REF_KEYS = Object.freeze([
  'schemaVersion',
  'groundingProjectionVersion',
  'axisRegistryVersion',
  'readingRef',
  'productResponseVersion',
  'engineVersion',
  'readingDomain',
  'sourceResponseHash',
  'groundingHash',
] as const);

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
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertOnlyGroundingRefKeys(value: Record<string, unknown>): void {
  const allowed = new Set<string>(GROUNDING_REF_KEYS);
  const unexpected = Object.keys(value).find((key) => !allowed.has(key));
  if (unexpected !== undefined) {
    throw new CharacterSajuGroundingAdmissionErrorV1(
      `Character Saju grounding ref contains unexpected field: ${unexpected}.`,
    );
  }
}

function requireNonEmptyString(value: unknown, path: string, maxLength = 512): string {
  if (typeof value !== 'string') {
    throw new CharacterSajuGroundingAdmissionErrorV1(`${path} must be a string.`);
  }
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maxLength) {
    throw new CharacterSajuGroundingAdmissionErrorV1(`${path} is outside the supported bounds.`);
  }
  return normalized;
}

function requireSha256Hex(value: unknown, path: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/u.test(value)) {
    throw new CharacterSajuGroundingAdmissionErrorV1(
      `${path} must be a lower-case SHA-256 hex digest.`,
    );
  }
  return value;
}

function requireSajuDomain(value: unknown): SajuDomain {
  if (typeof value !== 'string' || !SAJU_DOMAINS.includes(value as SajuDomain)) {
    throw new CharacterSajuGroundingAdmissionErrorV1(
      'readingDomain must be a supported Saju domain.',
    );
  }
  return value as SajuDomain;
}

export function admitCharacterSajuGroundingRefV1(input: {
  readonly candidate: unknown;
  readonly expectedReadingRef: string;
  readonly expectedDomain: SajuDomain;
}): CharacterSajuGroundingRefV1 {
  if (!isRecord(input.candidate)) {
    throw new CharacterSajuGroundingAdmissionErrorV1(
      'Character Saju grounding ref must be an object.',
    );
  }
  assertOnlyGroundingRefKeys(input.candidate);

  if (input.candidate.schemaVersion !== SAJU_CHARACTER_GROUNDING_SCHEMA_VERSION_V1) {
    throw new CharacterSajuGroundingAdmissionErrorV1(
      'Character Saju grounding schemaVersion is not supported.',
    );
  }
  if (
    input.candidate.groundingProjectionVersion !==
    SAJU_CHARACTER_GROUNDING_PROJECTION_VERSION_V1
  ) {
    throw new CharacterSajuGroundingAdmissionErrorV1(
      'Character Saju grounding projection version is not supported.',
    );
  }
  if (input.candidate.axisRegistryVersion !== SAJU_GROUNDING_AXIS_REGISTRY_VERSION_V1) {
    throw new CharacterSajuGroundingAdmissionErrorV1(
      'Character Saju grounding axis registry version is not supported.',
    );
  }

  const readingRef = requireNonEmptyString(input.candidate.readingRef, 'readingRef');
  if (readingRef !== input.expectedReadingRef) {
    throw new CharacterSajuGroundingAdmissionErrorV1(
      'Character Saju grounding readingRef does not match the active Saju context.',
    );
  }

  const readingDomain = requireSajuDomain(input.candidate.readingDomain);
  if (readingDomain !== input.expectedDomain) {
    throw new CharacterSajuGroundingAdmissionErrorV1(
      'Character Saju grounding readingDomain does not match the active Saju context.',
    );
  }

  const admitted = Object.freeze({
    schemaVersion: SAJU_CHARACTER_GROUNDING_SCHEMA_VERSION_V1,
    groundingProjectionVersion: SAJU_CHARACTER_GROUNDING_PROJECTION_VERSION_V1,
    axisRegistryVersion: SAJU_GROUNDING_AXIS_REGISTRY_VERSION_V1,
    readingRef,
    productResponseVersion: requireNonEmptyString(
      input.candidate.productResponseVersion,
      'productResponseVersion',
      256,
    ),
    engineVersion: requireNonEmptyString(input.candidate.engineVersion, 'engineVersion', 256),
    readingDomain,
    sourceResponseHash: requireSha256Hex(
      input.candidate.sourceResponseHash,
      'sourceResponseHash',
    ),
    groundingHash: requireSha256Hex(input.candidate.groundingHash, 'groundingHash'),
  }) satisfies CharacterSajuGroundingRefV1;

  return admitted;
}

/**
 * CSR-03 admission boundary.
 *
 * This layer extends an already-assembled Character runtime context with only the
 * source-owned Saju grounding identity. It intentionally cannot receive semantic
 * units, disclosures, ambiguities, raw Product blocks, or Claim Graph material.
 * Those remain Saju-owned until a later source-approved retrieval boundary exists.
 */
export function admitCharacterRuntimeSajuGroundingV1(input: {
  readonly context: CharacterRuntimeContextV1;
  readonly groundingRef?: unknown;
}): CharacterRuntimeContextWithGroundingV1 {
  if (input.context.saju === null) {
    if (input.groundingRef !== undefined) {
      throw new CharacterSajuGroundingAdmissionErrorV1(
        'Character Saju grounding cannot be attached to a non-Saju runtime context.',
      );
    }
    return Object.freeze({ ...input.context, saju: null });
  }

  const groundingRef =
    input.groundingRef === undefined
      ? null
      : admitCharacterSajuGroundingRefV1({
          candidate: input.groundingRef,
          expectedReadingRef: input.context.saju.readingRef,
          expectedDomain: input.context.saju.domain,
        });

  return Object.freeze({
    ...input.context,
    saju: Object.freeze({
      ...input.context.saju,
      groundingRef,
    }),
  });
}
