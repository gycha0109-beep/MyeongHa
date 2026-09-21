import type { SajuDomain } from '../../../packages/contracts/src/index.js';
import { ApiCommandError } from './api-error.js';

export const CHARACTER_STANDARD_READING_ACCESS_AUTHORITY_BINDING_V1 =
  'public.qry_character_standard_reading_access_runtime_v2' as const;
export const CHARACTER_STANDARD_READING_ARTIFACT_SOURCE_AUTHORITY_BINDING_V1 =
  'public.qry_standard_reading_artifact_source_runtime_v1' as const;

type Awaitable<T> = T | Promise<T>;

export interface CharacterStandardReadingAccessAuthorityRowV1 {
  readonly subjectId: string;
  readonly readingId: string;
  readonly readingSessionId: string;
  readonly productId: string;
  readonly readerCharacterId: string;
  readonly readerContentBundleId: string;
  readonly topicKey: string;
  readonly sajuDomain: string;
  readonly readingPeriod: string;
  readonly readingVariant: string;
  readonly sourceBirthRevisionId: string;
  readonly productSpecVersion: string;
  readonly domainCapabilityVersion: string;
  readonly readingContractVersion: string;
  readonly sajuEngineVersion: string;
  readonly responseHash: string;
}

export interface CharacterStandardReadingArtifactAuthorityRowV1 {
  readonly readingId: string;
  readonly productId: string;
  readonly readerCharacterId: string;
  readonly readingContractVersion: string;
  readonly productResponseState: string;
  readonly responseSnapshotJsonb: unknown;
  readonly responseHash: string;
  readonly completedAt: string;
}

export type CharacterStandardReadingKnowledgeAuthorityFailureCodeV1 =
  | 'SUBJECT_INELIGIBLE'
  | 'INVALID_INPUT';

export class CharacterStandardReadingKnowledgeAuthorityPortErrorV1 extends Error {
  constructor(
    readonly code: CharacterStandardReadingKnowledgeAuthorityFailureCodeV1,
    message: string,
  ) {
    super(message);
    this.name = 'CharacterStandardReadingKnowledgeAuthorityPortErrorV1';
  }
}

export interface CharacterStandardReadingAccessAuthorityPortV1 {
  readAccessibleReadings(input: {
    readonly subjectId: string;
    readonly readerCharacterId: string;
    readonly effectiveAt: string;
  }): Awaitable<readonly CharacterStandardReadingAccessAuthorityRowV1[]>;
}

export interface CharacterStandardReadingArtifactAuthorityPortV1 {
  readArtifactSource(input: {
    readonly subjectId: string;
    readonly readingId: string;
    readonly readerCharacterId: string;
    readonly effectiveAt: string;
  }): Awaitable<readonly CharacterStandardReadingArtifactAuthorityRowV1[]>;
}

export interface ResolveCharacterStandardReadingKnowledgeInputV1 {
  readonly resolvedSubjectId?: string;
  readonly readerCharacterId: unknown;
  readonly readingId: unknown;
  readonly effectiveAt: unknown;
  readonly accessAuthorityPort: CharacterStandardReadingAccessAuthorityPortV1;
  readonly artifactAuthorityPort: CharacterStandardReadingArtifactAuthorityPortV1;
}

export interface CharacterStandardReadingKnowledgeSourceV1 {
  readonly subjectId: string;
  readonly readingId: string;
  readonly readingSessionId: string;
  readonly productId: string;
  readonly readerCharacterId: string;
  readonly readerContentBundleId: string;
  readonly topicKey: string;
  readonly sajuDomain: SajuDomain;
  readonly readingPeriod: string;
  readonly readingVariant: string;
  readonly sourceBirthRevisionId: string;
  readonly productSpecVersion: string;
  readonly domainCapabilityVersion: string;
  readonly readingContractVersion: string;
  readonly sajuEngineVersion: string;
  readonly responseHash: string;
  readonly productResponseState: string;
  readonly responseSnapshotJsonb: unknown;
  readonly completedAt: string;
}

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

function requireResolvedSubjectId(value: string | undefined): string {
  if (value === undefined || value.trim().length === 0) {
    throw new ApiCommandError('AUTH_REQUIRED', 'A current resolved subject is required.');
  }
  return value.trim();
}

function requireRequestIdentifier(name: string, value: unknown): string {
  if (typeof value !== 'string') {
    throw new ApiCommandError('INVALID_REQUEST', `${name} must be a string.`);
  }
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > 200) {
    throw new ApiCommandError('INVALID_REQUEST', `${name} is outside the supported bounds.`);
  }
  return normalized;
}

function requireEffectiveAt(value: unknown): string {
  const effectiveAt = requireRequestIdentifier('effectiveAt', value);
  if (!Number.isFinite(Date.parse(effectiveAt))) {
    throw new ApiCommandError('INVALID_REQUEST', 'effectiveAt must be a timestamp.');
  }
  return effectiveAt;
}

function requireStoredString(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Character Standard Reading authority returned an invalid ${name}.`);
  }
  return value.trim();
}

function requireTimestamp(name: string, value: unknown): string {
  const timestamp = requireStoredString(name, value);
  if (!Number.isFinite(Date.parse(timestamp))) {
    throw new Error(`Character Standard Reading authority returned an invalid ${name} timestamp.`);
  }
  return timestamp;
}

function requireSajuDomain(value: unknown): SajuDomain {
  const domain = requireStoredString('Saju domain', value);
  if (!SAJU_DOMAINS.includes(domain as SajuDomain)) {
    throw new Error('Character Standard Reading authority returned an unsupported Saju domain.');
  }
  return domain as SajuDomain;
}

function requireArtifactSnapshot(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(
      'Character Standard Reading artifact authority returned an invalid response snapshot.',
    );
  }
  return value;
}

function mapAuthorityError(error: unknown): never {
  if (!(error instanceof CharacterStandardReadingKnowledgeAuthorityPortErrorV1)) {
    throw error;
  }
  switch (error.code) {
    case 'SUBJECT_INELIGIBLE':
      throw new ApiCommandError(
        'NOT_FOUND',
        'Official Reading is unavailable for the current subject and Reader.',
      );
    case 'INVALID_INPUT':
      throw new ApiCommandError('INVALID_REQUEST', error.message);
  }
}

function selectExactAccess(
  rows: readonly CharacterStandardReadingAccessAuthorityRowV1[],
  requestedReadingId: string,
): CharacterStandardReadingAccessAuthorityRowV1 {
  const matching = rows.filter((row) => row.readingId === requestedReadingId);
  if (matching.length === 0) {
    throw new ApiCommandError(
      'NOT_FOUND',
      'Official Reading is unavailable for the current subject and Reader.',
    );
  }
  if (matching.length !== 1 || matching[0] === undefined) {
    throw new Error(
      'Character Standard Reading access authority returned duplicate official Reading identity.',
    );
  }
  return matching[0];
}

function selectExactArtifact(
  rows: readonly CharacterStandardReadingArtifactAuthorityRowV1[],
): CharacterStandardReadingArtifactAuthorityRowV1 {
  if (rows.length === 0) {
    throw new ApiCommandError(
      'NOT_FOUND',
      'Official Reading artifact is unavailable for the current subject and Reader.',
    );
  }
  if (rows.length !== 1 || rows[0] === undefined) {
    throw new Error(
      'Character Standard Reading artifact authority must return exactly one source row.',
    );
  }
  return rows[0];
}

/**
 * Server-only Reader Knowledge source admission.
 *
 * The caller supplies only an already server-resolved subject plus the requested
 * Character/Reading identities. Effective Reader access and the raw official Reading
 * source are re-resolved independently from DB authority. Client sessionStorage,
 * query-string topic/scope labels, and client-carried Reading prose are not accepted
 * as Source Truth.
 *
 * This boundary does not itself authorize public Chat injection. The underlying DB
 * functions remain INTERNAL/HOLD until the separate Production Saju/Character
 * authority gates are promoted. Access metadata also carries the exact server-owned
 * Reader content-bundle id so semantic runtimes cannot swap Character content.
 */
export async function resolveCharacterStandardReadingKnowledgeV1(
  input: ResolveCharacterStandardReadingKnowledgeInputV1,
): Promise<CharacterStandardReadingKnowledgeSourceV1> {
  const subjectId = requireResolvedSubjectId(input.resolvedSubjectId);
  const readerCharacterId = requireRequestIdentifier(
    'readerCharacterId',
    input.readerCharacterId,
  );
  const readingId = requireRequestIdentifier('readingId', input.readingId);
  const effectiveAt = requireEffectiveAt(input.effectiveAt);

  try {
    const accessRows = await input.accessAuthorityPort.readAccessibleReadings({
      subjectId,
      readerCharacterId,
      effectiveAt,
    });
    const access = selectExactAccess(accessRows, readingId);

    const artifactRows = await input.artifactAuthorityPort.readArtifactSource({
      subjectId,
      readingId,
      readerCharacterId,
      effectiveAt,
    });
    const artifact = selectExactArtifact(artifactRows);

    const accessSubjectId = requireStoredString('subject id', access.subjectId);
    const accessReadingId = requireStoredString('Reading id', access.readingId);
    const accessProductId = requireStoredString('Product id', access.productId);
    const accessReaderCharacterId = requireStoredString(
      'Reader Character id',
      access.readerCharacterId,
    );
    const accessReaderContentBundleId = requireStoredString(
      'Reader content bundle id',
      access.readerContentBundleId,
    );
    const accessContractVersion = requireStoredString(
      'Reading contract version',
      access.readingContractVersion,
    );
    const accessResponseHash = requireStoredString('response hash', access.responseHash);

    if (
      accessSubjectId !== subjectId ||
      accessReadingId !== readingId ||
      accessReaderCharacterId !== readerCharacterId ||
      requireStoredString('artifact Reading id', artifact.readingId) !== readingId ||
      requireStoredString('artifact Reader Character id', artifact.readerCharacterId) !==
        readerCharacterId ||
      requireStoredString('artifact Product id', artifact.productId) !== accessProductId ||
      requireStoredString(
        'artifact Reading contract version',
        artifact.readingContractVersion,
      ) !== accessContractVersion ||
      requireStoredString('artifact response hash', artifact.responseHash) !== accessResponseHash
    ) {
      throw new Error(
        'Character Standard Reading metadata and artifact authorities disagree on source provenance.',
      );
    }

    return Object.freeze({
      subjectId,
      readingId,
      readingSessionId: requireStoredString('Reading Session id', access.readingSessionId),
      productId: accessProductId,
      readerCharacterId,
      readerContentBundleId: accessReaderContentBundleId,
      topicKey: requireStoredString('topic key', access.topicKey),
      sajuDomain: requireSajuDomain(access.sajuDomain),
      readingPeriod: requireStoredString('reading period', access.readingPeriod),
      readingVariant: requireStoredString('reading variant', access.readingVariant),
      sourceBirthRevisionId: requireStoredString(
        'source Birth revision id',
        access.sourceBirthRevisionId,
      ),
      productSpecVersion: requireStoredString(
        'Product spec version',
        access.productSpecVersion,
      ),
      domainCapabilityVersion: requireStoredString(
        'domain capability version',
        access.domainCapabilityVersion,
      ),
      readingContractVersion: accessContractVersion,
      sajuEngineVersion: requireStoredString('Saju engine version', access.sajuEngineVersion),
      responseHash: accessResponseHash,
      productResponseState: requireStoredString(
        'Product response state',
        artifact.productResponseState,
      ),
      responseSnapshotJsonb: requireArtifactSnapshot(artifact.responseSnapshotJsonb),
      completedAt: requireTimestamp('completedAt', artifact.completedAt),
    });
  } catch (error) {
    return mapAuthorityError(error);
  }
}
