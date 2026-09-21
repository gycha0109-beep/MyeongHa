import type {
  CharacterSajuUtteranceV1,
} from '../../../packages/domain/src/index.js';
import type { ContentReleaseRuntime } from '../../../packages/world-content/src/index.js';
import type {
  ChatThreadRuntimeBindingReadAuthorityPortV1,
} from './chat-thread-runtime-binding-read.js';
import type {
  CharacterStandardReadingAccessAuthorityPortV1,
  CharacterStandardReadingArtifactAuthorityPortV1,
} from './character-standard-reading-knowledge.js';
import type {
  CharacterStandardReadingServerContextInputV1,
} from './character-standard-reading-server-runtime-authority.js';
import type {
  CharacterRelationshipReadAuthorityPortV1,
} from './character-relationship-read.js';
import type {
  MemoryItemsReadAuthorityPortV1,
} from './memory-items-read.js';
import type {
  MemoryGrantsReadAuthorityPortV1,
} from './memory-grants-read.js';
import {
  runThreadBoundReaderInterpretationPreviewV1,
  type OfficialReadingCharacterGroundingProjectionPortV1,
  type ReaderInterpretationPreviewEnvelopeV1,
} from './reader-interpretation-preview-runtime-v1.js';

export const READER_INTERPRETATION_PREVIEW_HTTP_PATH_V1 =
  '/api/me/readings/reader-interpretation/preview' as const;
export const READER_INTERPRETATION_PREVIEW_HTTP_SCHEMA_VERSION_V1 =
  'myeongha-reader-interpretation-preview-http-v1' as const;

type Awaitable<T> = T | Promise<T>;

export interface ReaderInterpretationPreviewContextAuthorityPortV1 {
  resolveContext(input: {
    readonly subjectId: string;
    readonly threadId: string;
    readonly effectiveAt: string;
  }): Awaitable<CharacterStandardReadingServerContextInputV1>;
}

export interface ReaderInterpretationPreviewSceneSegmentV1 {
  readonly kind: CharacterSajuUtteranceV1['segments'][number]['kind'];
  readonly text: string;
}

export interface ReaderInterpretationPreviewSceneUtteranceV1 {
  readonly characterId: string;
  readonly requestedDomain: ReaderInterpretationPreviewEnvelopeV1['requestedDomain'];
  readonly segments: readonly ReaderInterpretationPreviewSceneSegmentV1[];
}

export type ReaderInterpretationPreviewHttpResponseV1 =
  | {
      readonly schemaVersion: typeof READER_INTERPRETATION_PREVIEW_HTTP_SCHEMA_VERSION_V1;
      readonly lifecycle: 'preview';
      readonly mode: 'reader_interpretation';
      readonly officialReadingId: string;
      readonly readerCharacterId: string;
      readonly domain: ReaderInterpretationPreviewEnvelopeV1['requestedDomain'];
      readonly interpretationHash: string;
      readonly utterance: ReaderInterpretationPreviewSceneUtteranceV1;
    }
  | {
      readonly schemaVersion: typeof READER_INTERPRETATION_PREVIEW_HTTP_SCHEMA_VERSION_V1;
      readonly lifecycle: 'preview';
      readonly mode: 'protected_fallback';
      readonly officialReadingId: string;
      readonly readerCharacterId: string;
      readonly domain: ReaderInterpretationPreviewEnvelopeV1['requestedDomain'];
      readonly interpretationHash: string;
      readonly fallbackReason:
        | 'renderer_protected_fallback'
        | 'semantic_guard_failed';
    };

export class ReaderInterpretationPreviewHttpErrorV1 extends TypeError {
  constructor(
    readonly code: 'AUTH_REQUIRED' | 'INVALID_REQUEST',
    message: string,
  ) {
    super(message);
    this.name = 'ReaderInterpretationPreviewHttpErrorV1';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireIdentifier(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new ReaderInterpretationPreviewHttpErrorV1(
      'INVALID_REQUEST',
      `${field} must be a string.`,
    );
  }
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > 512) {
    throw new ReaderInterpretationPreviewHttpErrorV1(
      'INVALID_REQUEST',
      `${field} is outside the supported bounds.`,
    );
  }
  return normalized;
}

function requireSubject(value: string | undefined): string {
  if (value === undefined || value.trim().length === 0) {
    throw new ReaderInterpretationPreviewHttpErrorV1(
      'AUTH_REQUIRED',
      'Reader Interpretation Preview requires an authenticated subject.',
    );
  }
  return value.trim();
}

function requireEffectiveAt(value: string): string {
  const normalized = requireIdentifier(value, 'effectiveAt');
  if (!Number.isFinite(Date.parse(normalized))) {
    throw new ReaderInterpretationPreviewHttpErrorV1(
      'INVALID_REQUEST',
      'effectiveAt must be an ISO-compatible timestamp.',
    );
  }
  return normalized;
}

export interface ReaderInterpretationPreviewHttpRequestV1 {
  readonly threadId: string;
  readonly officialReadingId: string;
}

export function parseReaderInterpretationPreviewHttpRequestV1(
  body: unknown,
): ReaderInterpretationPreviewHttpRequestV1 {
  if (!isRecord(body)) {
    throw new ReaderInterpretationPreviewHttpErrorV1(
      'INVALID_REQUEST',
      'Reader Interpretation Preview request body must be an object.',
    );
  }

  const allowed = new Set(['threadId', 'officialReadingId']);
  const unexpected = Object.keys(body).find((key) => !allowed.has(key));
  if (unexpected !== undefined) {
    throw new ReaderInterpretationPreviewHttpErrorV1(
      'INVALID_REQUEST',
      `Reader Interpretation Preview request contains unexpected field: ${unexpected}.`,
    );
  }

  return Object.freeze({
    threadId: requireIdentifier(body.threadId, 'threadId'),
    officialReadingId: requireIdentifier(
      body.officialReadingId,
      'officialReadingId',
    ),
  });
}

export function projectReaderInterpretationPreviewHttpResponseV1(
  envelope: ReaderInterpretationPreviewEnvelopeV1,
): ReaderInterpretationPreviewHttpResponseV1 {
  const common = {
    schemaVersion: READER_INTERPRETATION_PREVIEW_HTTP_SCHEMA_VERSION_V1,
    lifecycle: 'preview' as const,
    officialReadingId: envelope.officialReadingId,
    readerCharacterId: envelope.readerCharacterId,
    domain: envelope.requestedDomain,
    interpretationHash: envelope.interpretationHash,
  };

  return envelope.mode === 'reader_interpretation'
    ? Object.freeze({
        ...common,
        mode: 'reader_interpretation' as const,
        utterance: Object.freeze({
          characterId: envelope.utterance.characterId,
          requestedDomain: envelope.utterance.requestedDomain,
          segments: Object.freeze(
            envelope.utterance.segments.map((segment) =>
              Object.freeze({
                kind: segment.kind,
                text: segment.text,
              }),
            ),
          ),
        }),
      })
    : Object.freeze({
        ...common,
        mode: 'protected_fallback' as const,
        fallbackReason: envelope.fallbackReason,
      });
}

export async function runReaderInterpretationPreviewHttpV1(input: {
  readonly resolvedSubjectId?: string;
  readonly effectiveAt: string;
  readonly body: unknown;
  readonly contextAuthorityPort: ReaderInterpretationPreviewContextAuthorityPortV1;
  readonly contentReleaseRuntime: ContentReleaseRuntime;
  readonly threadBindingAuthorityPort: ChatThreadRuntimeBindingReadAuthorityPortV1;
  readonly accessAuthorityPort: CharacterStandardReadingAccessAuthorityPortV1;
  readonly artifactAuthorityPort: CharacterStandardReadingArtifactAuthorityPortV1;
  readonly relationshipAuthorityPort: CharacterRelationshipReadAuthorityPortV1;
  readonly memoryItemsAuthorityPort: MemoryItemsReadAuthorityPortV1;
  readonly memoryGrantsAuthorityPort: MemoryGrantsReadAuthorityPortV1;
  readonly groundingProjectionPort: OfficialReadingCharacterGroundingProjectionPortV1;
}): Promise<ReaderInterpretationPreviewHttpResponseV1> {
  const subjectId = requireSubject(input.resolvedSubjectId);
  const effectiveAt = requireEffectiveAt(input.effectiveAt);
  const request = parseReaderInterpretationPreviewHttpRequestV1(input.body);

  const contextInput = await input.contextAuthorityPort.resolveContext({
    subjectId,
    threadId: request.threadId,
    effectiveAt,
  });

  const envelope = await runThreadBoundReaderInterpretationPreviewV1({
    resolvedSubjectId: subjectId,
    threadId: request.threadId,
    officialReadingId: request.officialReadingId,
    effectiveAt,
    contentReleaseRuntime: input.contentReleaseRuntime,
    contextInput,
    threadBindingAuthorityPort: input.threadBindingAuthorityPort,
    accessAuthorityPort: input.accessAuthorityPort,
    artifactAuthorityPort: input.artifactAuthorityPort,
    relationshipAuthorityPort: input.relationshipAuthorityPort,
    memoryItemsAuthorityPort: input.memoryItemsAuthorityPort,
    memoryGrantsAuthorityPort: input.memoryGrantsAuthorityPort,
    groundingProjectionPort: input.groundingProjectionPort,
  });

  return projectReaderInterpretationPreviewHttpResponseV1(envelope);
}
