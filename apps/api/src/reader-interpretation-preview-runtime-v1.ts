import { createHash } from 'node:crypto';
import type { SajuDomain } from '../../../packages/contracts/src/index.js';
import {
  SAJU_CHARACTER_GROUNDING_PROJECTION_VERSION_V1,
  SAJU_CHARACTER_GROUNDING_SCHEMA_VERSION_V1,
  SAJU_GROUNDING_AXIS_REGISTRY_VERSION_V1,
  admitCharacterRuntimeSajuGroundingV1,
  admitCharacterSajuGroundingBundleViewV1,
  canonicalJson,
  guardCharacterSajuSemanticPreservationV1,
  renderCharacterSajuBoundedExactCoreV1,
  resolveCharacterSajuFirstSlicePerspectiveV1,
  type CharacterPerspectiveProfileV1,
  type CharacterRuntimeContextV1,
  type CharacterRuntimeContextWithGroundingV1,
  type CharacterSajuGroundingBundleViewV1,
  type CharacterSajuGroundingRefV1,
  type CharacterSajuUtteranceV1,
} from '../../../packages/domain/src/index.js';
import { ApiCommandError } from './api-error.js';
import {
  projectOfficialStandardReadingToProtectedCharacterSajuContextV1,
} from './character-standard-reading-protected-context.js';
import {
  resolveCharacterStandardReadingKnowledgeV1,
  type CharacterStandardReadingAccessAuthorityPortV1,
  type CharacterStandardReadingArtifactAuthorityPortV1,
  type CharacterStandardReadingKnowledgeSourceV1,
} from './character-standard-reading-knowledge.js';
import type { ContentReleaseRuntime } from '../../../packages/world-content/src/index.js';
import {
  getChatThreadRuntimeBinding,
  type ChatThreadRuntimeBindingReadAuthorityPortV1,
} from './chat-thread-runtime-binding-read.js';
import type {
  CharacterRelationshipReadAuthorityPortV1,
} from './character-relationship-read.js';
import type {
  MemoryItemsReadAuthorityPortV1,
} from './memory-items-read.js';
import type {
  MemoryGrantsReadAuthorityPortV1,
} from './memory-grants-read.js';
import type {
  ReaderContextLifeFactsReadAuthorityPortV1,
} from './reader-context-non-memory-read.js';
import {
  CharacterStandardReadingServerRuntimeAuthorityErrorV1,
  prepareCharacterStandardReadingServerRuntimeV1,
  type CharacterStandardReadingServerContextInputV1,
} from './character-standard-reading-server-runtime-authority.js';

export const READER_INTERPRETATION_PREVIEW_SCHEMA_VERSION_V1 =
  'myeongha-reader-interpretation-envelope-v1' as const;
export const READER_INTERPRETATION_PREVIEW_CONTRACT_VERSION_V1 =
  'reader-interpretation-preview-v1' as const;

export type ReaderInterpretationPreviewEnvelopeV1 =
  | {
      readonly schemaVersion: typeof READER_INTERPRETATION_PREVIEW_SCHEMA_VERSION_V1;
      readonly contractVersion: typeof READER_INTERPRETATION_PREVIEW_CONTRACT_VERSION_V1;
      readonly lifecycle: 'preview';
      readonly mode: 'reader_interpretation';
      readonly officialReadingId: string;
      readonly readerCharacterId: string;
      readonly readerContentBundleId: string;
      readonly requestedDomain: SajuDomain;
      readonly officialArtifactResponseHash: string;
      readonly sourceResponseHash: string;
      readonly groundingHash: string;
      readonly interpretationHash: string;
      readonly utterance: CharacterSajuUtteranceV1;
    }
  | {
      readonly schemaVersion: typeof READER_INTERPRETATION_PREVIEW_SCHEMA_VERSION_V1;
      readonly contractVersion: typeof READER_INTERPRETATION_PREVIEW_CONTRACT_VERSION_V1;
      readonly lifecycle: 'preview';
      readonly mode: 'protected_fallback';
      readonly officialReadingId: string;
      readonly readerCharacterId: string;
      readonly readerContentBundleId: string;
      readonly requestedDomain: SajuDomain;
      readonly officialArtifactResponseHash: string;
      readonly sourceResponseHash: string;
      readonly groundingHash: string;
      readonly interpretationHash: string;
      readonly fallbackReason: 'renderer_protected_fallback' | 'semantic_guard_failed';
    };

type Awaitable<T> = T | Promise<T>;

export interface OfficialReadingCharacterGroundingProjectionInputV1 {
  readonly readingId: string;
  readonly readingContractVersion: string;
  readonly productResponseState: string;
  readonly responseSnapshotJsonb: unknown;
  readonly officialArtifactResponseHash: string;
  readonly sajuEngineVersion: string;
  readonly sajuDomain: SajuDomain;
}

export interface OfficialReadingCharacterGroundingProjectionPortV1 {
  projectGrounding(
    input: OfficialReadingCharacterGroundingProjectionInputV1,
  ): Awaitable<unknown>;
}

export interface RunReaderInterpretationPreviewInputV1 {
  readonly resolvedSubjectId?: string;
  readonly officialReadingId: string;
  readonly readerCharacterId: string;
  readonly effectiveAt: string;
  readonly requestedDomain: SajuDomain;
  readonly context: CharacterRuntimeContextV1;
  readonly accessAuthorityPort: CharacterStandardReadingAccessAuthorityPortV1;
  readonly artifactAuthorityPort: CharacterStandardReadingArtifactAuthorityPortV1;
  readonly groundingProjectionPort: OfficialReadingCharacterGroundingProjectionPortV1;
}

export interface RunThreadBoundReaderInterpretationPreviewInputV1 {
  readonly resolvedSubjectId?: string;
  readonly threadId: unknown;
  readonly officialReadingId: string;
  readonly effectiveAt: string;
  readonly contentReleaseRuntime: ContentReleaseRuntime;
  readonly contextInput: CharacterStandardReadingServerContextInputV1;
  readonly threadBindingAuthorityPort: ChatThreadRuntimeBindingReadAuthorityPortV1;
  readonly accessAuthorityPort: CharacterStandardReadingAccessAuthorityPortV1;
  readonly artifactAuthorityPort: CharacterStandardReadingArtifactAuthorityPortV1;
  readonly relationshipAuthorityPort: CharacterRelationshipReadAuthorityPortV1;
  readonly memoryItemsAuthorityPort: MemoryItemsReadAuthorityPortV1;
  readonly memoryGrantsAuthorityPort: MemoryGrantsReadAuthorityPortV1;
  readonly nonMemoryContextAuthorityPort: ReaderContextLifeFactsReadAuthorityPortV1;
  readonly groundingProjectionPort: OfficialReadingCharacterGroundingProjectionPortV1;
}

export class ReaderInterpretationPreviewRuntimeErrorV1 extends Error {
  constructor(
    readonly code:
      | 'AUTH_REQUIRED'
      | 'INVALID_INPUT'
      | 'ACCESS_DENIED'
      | 'AUTHORITY_CONFLICT'
      | 'CONTEXT_MISMATCH'
      | 'SOURCE_MISMATCH'
      | 'PERSPECTIVE_UNAVAILABLE',
    message: string,
  ) {
    super(message);
    this.name = 'ReaderInterpretationPreviewRuntimeErrorV1';
  }
}

function requiredString(value: string | undefined, name: string): string {
  if (value === undefined || value.trim().length === 0 || value.trim().length > 512) {
    throw new ReaderInterpretationPreviewRuntimeErrorV1(
      name === 'resolvedSubjectId' ? 'AUTH_REQUIRED' : 'INVALID_INPUT',
      `Reader Interpretation Preview ${name} is invalid.`,
    );
  }
  return value.trim();
}

function requiredTimestamp(value: string): string {
  const normalized = requiredString(value, 'effectiveAt');
  if (!Number.isFinite(Date.parse(normalized))) {
    throw new ReaderInterpretationPreviewRuntimeErrorV1(
      'INVALID_INPUT',
      'Reader Interpretation Preview effectiveAt must be an ISO-compatible timestamp.',
    );
  }
  return normalized;
}

function hashEnvelope(value: unknown): string {
  return `sha256:v1:${createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')}`;
}

function mapKnowledgeAuthorityError(error: unknown): never {
  if (error instanceof ApiCommandError) {
    switch (error.code) {
      case 'AUTH_REQUIRED':
        throw new ReaderInterpretationPreviewRuntimeErrorV1('AUTH_REQUIRED', error.message);
      case 'INVALID_REQUEST':
        throw new ReaderInterpretationPreviewRuntimeErrorV1('INVALID_INPUT', error.message);
      case 'NOT_FOUND':
        throw new ReaderInterpretationPreviewRuntimeErrorV1(
          'ACCESS_DENIED',
          'The selected Reader has no active access to this official Reading.',
        );
      default:
        throw error;
    }
  }
  throw new ReaderInterpretationPreviewRuntimeErrorV1(
    'AUTHORITY_CONFLICT',
    error instanceof Error
      ? error.message
      : 'Reader Knowledge authority failed without a bounded error.',
  );
}

async function projectAndAdmitGrounding(input: {
  readonly source: CharacterStandardReadingKnowledgeSourceV1;
  readonly context: CharacterRuntimeContextV1;
  readonly projectionPort: OfficialReadingCharacterGroundingProjectionPortV1;
}): Promise<{
  readonly grounding: CharacterSajuGroundingBundleViewV1;
  readonly runtimeContext: CharacterRuntimeContextWithGroundingV1;
}> {
  if (input.context.saju === null) {
    throw new ReaderInterpretationPreviewRuntimeErrorV1(
      'SOURCE_MISMATCH',
      'Reader Interpretation requires an active server-owned Saju context.',
    );
  }
  if (
    input.context.saju.readingRef !== input.source.readingId ||
    input.context.saju.domain !== input.source.sajuDomain ||
    input.context.saju.capability.domain !== input.source.sajuDomain
  ) {
    throw new ReaderInterpretationPreviewRuntimeErrorV1(
      'SOURCE_MISMATCH',
      'Reader Interpretation base Saju context does not match the authorized Official Reading.',
    );
  }

  try {
    // Validate and project exact protected text from the committed Official Reading.
    // Semantic grounding remains Saju-owned and is requested only after this check.
    const protectedSaju =
      projectOfficialStandardReadingToProtectedCharacterSajuContextV1(input.source);

    const candidate = await input.projectionPort.projectGrounding(
      Object.freeze({
        readingId: input.source.readingId,
        readingContractVersion: input.source.readingContractVersion,
        productResponseState: input.source.productResponseState,
        responseSnapshotJsonb: input.source.responseSnapshotJsonb,
        officialArtifactResponseHash: input.source.responseHash,
        sajuEngineVersion: input.source.sajuEngineVersion,
        sajuDomain: input.source.sajuDomain,
      }),
    );

    if (
      typeof candidate !== 'object' ||
      candidate === null ||
      Array.isArray(candidate) ||
      typeof (candidate as { groundingHash?: unknown }).groundingHash !== 'string' ||
      !/^[0-9a-f]{64}$/u.test(
        (candidate as { groundingHash: string }).groundingHash,
      ) ||
      typeof (candidate as { sourceResponseHash?: unknown }).sourceResponseHash !== 'string' ||
      !/^[0-9a-f]{64}$/u.test(
        (candidate as { sourceResponseHash: string }).sourceResponseHash,
      )
    ) {
      throw new TypeError(
        'Saju grounding projection did not return valid source and grounding hashes.',
      );
    }

    const expectedRef = Object.freeze({
      schemaVersion: SAJU_CHARACTER_GROUNDING_SCHEMA_VERSION_V1,
      groundingProjectionVersion: SAJU_CHARACTER_GROUNDING_PROJECTION_VERSION_V1,
      axisRegistryVersion: SAJU_GROUNDING_AXIS_REGISTRY_VERSION_V1,
      readingRef: input.source.readingId,
      productResponseVersion: input.source.readingContractVersion,
      engineVersion: input.source.sajuEngineVersion,
      readingDomain: input.source.sajuDomain,
      sourceResponseHash: (candidate as { sourceResponseHash: string }).sourceResponseHash,
      groundingHash: (candidate as { groundingHash: string }).groundingHash,
    }) satisfies CharacterSajuGroundingRefV1;

    const grounding = admitCharacterSajuGroundingBundleViewV1({
      candidate,
      expectedRef,
    });

    const sourceContext = Object.freeze({
      ...input.context,
      saju: Object.freeze({
        ...protectedSaju,
        capability: input.context.saju.capability,
      }),
    }) satisfies CharacterRuntimeContextV1;
    const runtimeContext = admitCharacterRuntimeSajuGroundingV1({
      context: sourceContext,
      groundingRef: expectedRef,
    });

    return Object.freeze({ grounding, runtimeContext });
  } catch (error) {
    if (error instanceof ReaderInterpretationPreviewRuntimeErrorV1) throw error;
    throw new ReaderInterpretationPreviewRuntimeErrorV1(
      'SOURCE_MISMATCH',
      error instanceof Error
        ? error.message
        : 'Official Reading grounding projection failed without a bounded error.',
    );
  }
}

function assertRuntimeIdentity(input: {
  readonly source: CharacterStandardReadingKnowledgeSourceV1;
  readonly context: CharacterRuntimeContextWithGroundingV1;
  readonly grounding: CharacterSajuGroundingBundleViewV1;
  readonly perspective: CharacterPerspectiveProfileV1;
  readonly requestedDomain: SajuDomain;
}): void {
  const { source, context, grounding, perspective, requestedDomain } = input;
  const groundingRef = context.saju?.groundingRef ?? null;

  if (
    context.characterId !== source.readerCharacterId ||
    context.contentBundleId !== source.readerContentBundleId ||
    perspective.characterId !== source.readerCharacterId ||
    perspective.sourceContentVersion !== context.contentVersion ||
    perspective.sourceSajuProfileVersion !== context.sajuProfile.profileVersion
  ) {
    throw new ReaderInterpretationPreviewRuntimeErrorV1(
      'CONTEXT_MISMATCH',
      'Reader Interpretation context is not the exact authorized Reader context.',
    );
  }

  if (
    context.saju === null ||
    groundingRef === null ||
    context.saju.readingRef !== source.readingId ||
    context.saju.domain !== requestedDomain ||
    source.sajuDomain !== requestedDomain ||
    grounding.readingRef !== source.readingId ||
    grounding.readingDomain !== requestedDomain ||
    context.saju.capability.domain !== requestedDomain
  ) {
    throw new ReaderInterpretationPreviewRuntimeErrorV1(
      'SOURCE_MISMATCH',
      'Reader Interpretation Saju context does not match the authorized official Reading.',
    );
  }

  if (
    source.productResponseState !== 'delivered' &&
    source.productResponseState !== 'delivered_with_fallback'
  ) {
    throw new ReaderInterpretationPreviewRuntimeErrorV1(
      'SOURCE_MISMATCH',
      'Reader Interpretation requires a delivered official Product Reading source.',
    );
  }

  if (
    groundingRef.productResponseVersion !== source.readingContractVersion ||
    grounding.productResponseVersion !== source.readingContractVersion ||
    groundingRef.sourceResponseHash !== grounding.sourceResponseHash ||
    groundingRef.groundingHash !== grounding.groundingHash ||
    groundingRef.engineVersion !== source.sajuEngineVersion ||
    grounding.engineVersion !== source.sajuEngineVersion
  ) {
    throw new ReaderInterpretationPreviewRuntimeErrorV1(
      'SOURCE_MISMATCH',
      'Reader Interpretation grounding provenance does not match the authorized Source Truth.',
    );
  }
}

function withHash<T extends object>(value: T): T & { readonly interpretationHash: string } {
  return Object.freeze({
    ...value,
    interpretationHash: hashEnvelope(value),
  });
}

/**
 * Preview-only Reader Interpretation execution boundary.
 *
 * Reader access and the raw Official Reading source are re-resolved through the
 * server-only Reader Knowledge authority introduced by the Official Reading source
 * boundary. This runtime adds no second access authority and never trusts browser
 * handoff state as Source Truth.
 *
 * Grounding is requested only through the Saju-owned projection port after the exact
 * Official Reading source has been re-resolved. MyeongHa admits and verifies the
 * returned bundle; it never constructs semantic grounding units from Product blocks.
 * Production activation remains HOLD until a real Saju projection adapter is wired
 * and separately promoted.
 */
function resolveRuntimePerspective(
  context: CharacterRuntimeContextV1,
): CharacterPerspectiveProfileV1 {
  const perspective = resolveCharacterSajuFirstSlicePerspectiveV1({
    characterId: context.characterId,
    contentVersion: context.contentVersion,
    sajuProfile: context.sajuProfile,
  });
  if (perspective === null) {
    throw new ReaderInterpretationPreviewRuntimeErrorV1(
      'PERSPECTIVE_UNAVAILABLE',
      'Reader Interpretation has no reviewed Character grounding-axis perspective for this Reader.',
    );
  }
  return perspective;
}

async function renderResolvedReaderInterpretationPreviewV1(input: {
  readonly source: CharacterStandardReadingKnowledgeSourceV1;
  readonly context: CharacterRuntimeContextV1;
  readonly requestedDomain: SajuDomain;
  readonly groundingProjectionPort: OfficialReadingCharacterGroundingProjectionPortV1;
}): Promise<ReaderInterpretationPreviewEnvelopeV1> {
  // Perspective admission is content-only and must happen before the cross-service
  // Saju call. Unsupported Readers fail closed without spending grounding transport
  // or exposing an unreviewed Character interpretation path.
  const perspective = resolveRuntimePerspective(input.context);
  const { grounding, runtimeContext } = await projectAndAdmitGrounding({
    source: input.source,
    context: input.context,
    projectionPort: input.groundingProjectionPort,
  });

  assertRuntimeIdentity({
    source: input.source,
    context: runtimeContext,
    grounding,
    perspective,
    requestedDomain: input.requestedDomain,
  });

  const rendered = renderCharacterSajuBoundedExactCoreV1({
    context: runtimeContext,
    grounding,
    perspective,
    requestedDomain: input.requestedDomain,
  });

  const common = {
    schemaVersion: READER_INTERPRETATION_PREVIEW_SCHEMA_VERSION_V1,
    contractVersion: READER_INTERPRETATION_PREVIEW_CONTRACT_VERSION_V1,
    lifecycle: 'preview' as const,
    officialReadingId: input.source.readingId,
    readerCharacterId: input.source.readerCharacterId,
    readerContentBundleId: input.source.readerContentBundleId,
    requestedDomain: input.requestedDomain,
    officialArtifactResponseHash: input.source.responseHash,
    sourceResponseHash: grounding.sourceResponseHash,
    groundingHash: grounding.groundingHash,
  };

  if (rendered.mode === 'protected_fallback') {
    return withHash({
      ...common,
      mode: 'protected_fallback' as const,
      fallbackReason: 'renderer_protected_fallback' as const,
    });
  }

  const guarded = guardCharacterSajuSemanticPreservationV1({
    candidate: rendered.utterance,
    context: runtimeContext,
    grounding,
    perspective,
    requestedDomain: input.requestedDomain,
  });

  if (guarded.mode !== 'accepted') {
    return withHash({
      ...common,
      mode: 'protected_fallback' as const,
      fallbackReason: 'semantic_guard_failed' as const,
    });
  }

  return withHash({
    ...common,
    mode: 'reader_interpretation' as const,
    utterance: guarded.utterance,
  });
}

export async function runReaderInterpretationPreviewV1(
  input: RunReaderInterpretationPreviewInputV1,
): Promise<ReaderInterpretationPreviewEnvelopeV1> {
  const subjectId = requiredString(input.resolvedSubjectId, 'resolvedSubjectId');
  const officialReadingId = requiredString(input.officialReadingId, 'officialReadingId');
  const readerCharacterId = requiredString(input.readerCharacterId, 'readerCharacterId');
  const effectiveAt = requiredTimestamp(input.effectiveAt);

  let source: CharacterStandardReadingKnowledgeSourceV1;
  try {
    source = await resolveCharacterStandardReadingKnowledgeV1({
      resolvedSubjectId: subjectId,
      readerCharacterId,
      readingId: officialReadingId,
      effectiveAt,
      accessAuthorityPort: input.accessAuthorityPort,
      artifactAuthorityPort: input.artifactAuthorityPort,
    });
  } catch (error) {
    return mapKnowledgeAuthorityError(error);
  }

  return renderResolvedReaderInterpretationPreviewV1({
    source,
    context: input.context,
    requestedDomain: input.requestedDomain,
    groundingProjectionPort: input.groundingProjectionPort,
  });
}


/**
 * Server-only Reader Scene Preview seam.
 *
 * Reader identity and active content release come from the owner-authorized thread.
 * Exact Character/world canon is resolved from that pinned immutable release while
 * relationship state and Memory grants are independently re-read from server authority.
 * Official Reading access/source are then resolved by the existing Reader Knowledge
 * authority. No browser-provided Reader, bundle, Character profile, relationship,
 * Memory, perspective, grounding, or Official Reading prose is accepted here.
 */
export async function runThreadBoundReaderInterpretationPreviewV1(
  input: RunThreadBoundReaderInterpretationPreviewInputV1,
): Promise<ReaderInterpretationPreviewEnvelopeV1> {
  const subjectId = requiredString(input.resolvedSubjectId, 'resolvedSubjectId');
  const officialReadingId = requiredString(input.officialReadingId, 'officialReadingId');
  const effectiveAt = requiredTimestamp(input.effectiveAt);

  const initialThreadBinding = await getChatThreadRuntimeBinding({
    resolvedSubjectId: subjectId,
    threadId: input.threadId,
    authorityPort: input.threadBindingAuthorityPort,
  });

  let contentEntry;
  try {
    contentEntry = input.contentReleaseRuntime.resolvePinned(
      initialThreadBinding.activeContentReleaseId,
    );
  } catch (error) {
    throw new ReaderInterpretationPreviewRuntimeErrorV1(
      'AUTHORITY_CONFLICT',
      error instanceof Error
        ? error.message
        : 'Pinned Reader content release authority failed without a bounded error.',
    );
  }

  let prepared;
  try {
    prepared = await prepareCharacterStandardReadingServerRuntimeV1({
      resolvedSubjectId: subjectId,
      threadId: input.threadId,
      readingId: officialReadingId,
      effectiveAt,
      contentEntry,
      threadBindingAuthorityPort: input.threadBindingAuthorityPort,
      accessAuthorityPort: input.accessAuthorityPort,
      artifactAuthorityPort: input.artifactAuthorityPort,
      relationshipAuthorityPort: input.relationshipAuthorityPort,
      memoryItemsAuthorityPort: input.memoryItemsAuthorityPort,
      memoryGrantsAuthorityPort: input.memoryGrantsAuthorityPort,
      nonMemoryContextAuthorityPort: input.nonMemoryContextAuthorityPort,
      contextInput: input.contextInput,
    });
  } catch (error) {
    if (error instanceof CharacterStandardReadingServerRuntimeAuthorityErrorV1) {
      throw new ReaderInterpretationPreviewRuntimeErrorV1(
        'AUTHORITY_CONFLICT',
        error.message,
      );
    }
    throw error;
  }

  return renderResolvedReaderInterpretationPreviewV1({
    source: prepared.source,
    context: prepared.context,
    requestedDomain: prepared.source.sajuDomain,
    groundingProjectionPort: input.groundingProjectionPort,
  });
}
