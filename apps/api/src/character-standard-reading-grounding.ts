import type { SajuDomain } from '../../../packages/contracts/src/index.js';
import {
  SAJU_CHARACTER_GROUNDING_PROJECTION_VERSION_V1,
  SAJU_CHARACTER_GROUNDING_SCHEMA_VERSION_V1,
  SAJU_GROUNDING_AXIS_REGISTRY_VERSION_V1,
  admitCharacterRuntimeSajuGroundingV1,
  admitCharacterSajuGroundingBundleViewV1,
  type CharacterRuntimeContextV1,
  type CharacterRuntimeContextWithGroundingV1,
  type CharacterSajuGroundingBundleViewV1,
  type CharacterSajuGroundingRefV1,
} from '../../../packages/domain/src/index.js';
import type { CharacterStandardReadingKnowledgeSourceV1 } from './character-standard-reading-knowledge.js';

type Awaitable<T> = T | Promise<T>;

export interface SajuCharacterGroundingProjectionPortV1 {
  projectOfficialReading(input: {
    readonly response: unknown;
    readonly engineVersion: string;
    readonly readingDomain: SajuDomain;
  }): Awaitable<unknown>;
}

export interface ProjectCharacterStandardReadingGroundingInputV1 {
  readonly source: CharacterStandardReadingKnowledgeSourceV1;
  readonly projectionPort: SajuCharacterGroundingProjectionPortV1;
}

export interface CharacterStandardReadingGroundingProjectionV1 {
  readonly source: CharacterStandardReadingKnowledgeSourceV1;
  readonly groundingRef: CharacterSajuGroundingRefV1;
  readonly grounding: CharacterSajuGroundingBundleViewV1;
}

export class CharacterStandardReadingGroundingBridgeErrorV1 extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CharacterStandardReadingGroundingBridgeErrorV1';
  }
}

function requireNonEmpty(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new CharacterStandardReadingGroundingBridgeErrorV1(
      `Official Reading grounding bridge received an invalid ${name}.`,
    );
  }
  return value.trim();
}

function requireSha256Hex(name: string, value: unknown): string {
  const hash = requireNonEmpty(name, value);
  if (!/^[0-9a-f]{64}$/u.test(hash)) {
    throw new CharacterStandardReadingGroundingBridgeErrorV1(
      `Official Reading grounding bridge requires ${name} to be a lower-case SHA-256 digest.`,
    );
  }
  return hash;
}

function requireDeliveredState(value: unknown): 'delivered' | 'delivered_with_fallback' {
  if (value !== 'delivered' && value !== 'delivered_with_fallback') {
    throw new CharacterStandardReadingGroundingBridgeErrorV1(
      'Only a delivered official ProductReadingResponse can enter Reader Knowledge grounding.',
    );
  }
  return value;
}

function requireGroundingHash(candidate: unknown): string {
  if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) {
    throw new CharacterStandardReadingGroundingBridgeErrorV1(
      'Saju grounding projection must return an object.',
    );
  }
  return requireSha256Hex(
    'groundingHash',
    (candidate as Record<string, unknown>).groundingHash,
  );
}

function expectedGroundingRef(
  source: CharacterStandardReadingKnowledgeSourceV1,
  groundingHash: string,
): CharacterSajuGroundingRefV1 {
  return Object.freeze({
    schemaVersion: SAJU_CHARACTER_GROUNDING_SCHEMA_VERSION_V1,
    groundingProjectionVersion: SAJU_CHARACTER_GROUNDING_PROJECTION_VERSION_V1,
    axisRegistryVersion: SAJU_GROUNDING_AXIS_REGISTRY_VERSION_V1,
    readingRef: requireNonEmpty('Reading id', source.readingId),
    productResponseVersion: requireNonEmpty(
      'Reading contract version',
      source.readingContractVersion,
    ),
    engineVersion: requireNonEmpty('Saju engine version', source.sajuEngineVersion),
    readingDomain: source.sajuDomain,
    sourceResponseHash: requireSha256Hex('response hash', source.responseHash),
    groundingHash,
  });
}

/**
 * Project one already-authorized Official Reading into the Saju-owned Character
 * grounding contract.
 *
 * Semantic projection authority remains outside MyeongHa. This bridge sends the
 * immutable server-read ProductReadingResponse snapshot to an injected Saju source
 * projector, then admits the returned bundle only when it matches the exact Official
 * Reading / engine / domain / response-hash provenance.
 *
 * No client Reading text, topic, scope, sessionStorage payload, or Character-authored
 * semantic material participates in this projection.
 */
export async function projectCharacterStandardReadingGroundingV1(
  input: ProjectCharacterStandardReadingGroundingInputV1,
): Promise<CharacterStandardReadingGroundingProjectionV1> {
  const source = input.source;
  requireDeliveredState(source.productResponseState);
  const responseHash = requireSha256Hex('response hash', source.responseHash);
  const readingId = requireNonEmpty('Reading id', source.readingId);
  const engineVersion = requireNonEmpty('Saju engine version', source.sajuEngineVersion);
  const productResponseVersion = requireNonEmpty(
    'Reading contract version',
    source.readingContractVersion,
  );

  const candidate = await input.projectionPort.projectOfficialReading({
    response: source.responseSnapshotJsonb,
    engineVersion,
    readingDomain: source.sajuDomain,
  });

  const groundingHash = requireGroundingHash(candidate);
  const groundingRef = expectedGroundingRef(
    Object.freeze({
      ...source,
      readingId,
      sajuEngineVersion: engineVersion,
      readingContractVersion: productResponseVersion,
      responseHash,
    }),
    groundingHash,
  );
  const grounding = admitCharacterSajuGroundingBundleViewV1({
    candidate,
    expectedRef: groundingRef,
  });

  return Object.freeze({
    source,
    groundingRef,
    grounding,
  });
}

export interface AttachCharacterStandardReadingGroundingInputV1 {
  readonly context: CharacterRuntimeContextV1;
  readonly projection: CharacterStandardReadingGroundingProjectionV1;
}

/**
 * Attach only the already-admitted grounding identity to an already-assembled
 * Character runtime context.
 *
 * This is deliberately not a production context assembler. Existing direct-Saju
 * admission guards remain intact; the caller must already hold a governed Saju-bearing
 * Character context for the same Reader and Official Reading.
 */
export function attachCharacterStandardReadingGroundingV1(
  input: AttachCharacterStandardReadingGroundingInputV1,
): CharacterRuntimeContextWithGroundingV1 {
  const { context, projection } = input;
  if (context.characterId !== projection.source.readerCharacterId) {
    throw new CharacterStandardReadingGroundingBridgeErrorV1(
      'Official Reading Reader does not match the active Character runtime.',
    );
  }
  if (context.saju === null) {
    throw new CharacterStandardReadingGroundingBridgeErrorV1(
      'Official Reading grounding requires a Saju-bearing Character runtime context.',
    );
  }
  if (
    context.saju.readingRef !== projection.source.readingId ||
    context.saju.domain !== projection.source.sajuDomain
  ) {
    throw new CharacterStandardReadingGroundingBridgeErrorV1(
      'Official Reading grounding does not match the active Character Saju context.',
    );
  }

  return admitCharacterRuntimeSajuGroundingV1({
    context,
    groundingRef: projection.groundingRef,
  });
}
