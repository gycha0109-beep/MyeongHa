import { describe, expect, it, vi } from 'vitest';
import type { ContentReleaseRuntime } from '../packages/world-content/src/index.js';

import {
  ReaderInterpretationPreviewHttpErrorV1,
  parseReaderInterpretationPreviewHttpRequestV1,
  projectReaderInterpretationPreviewHttpResponseV1,
  runReaderInterpretationPreviewHttpV1,
  type ReaderInterpretationPreviewContextAuthorityPortV1,
} from '../apps/api/src/reader-interpretation-preview-http.js';
import type {
  ReaderInterpretationPreviewEnvelopeV1,
} from '../apps/api/src/reader-interpretation-preview-runtime-v1.js';
import type {
  CharacterStandardReadingAccessAuthorityPortV1,
  CharacterStandardReadingArtifactAuthorityPortV1,
} from '../apps/api/src/character-standard-reading-knowledge.js';
import type {
  ChatThreadRuntimeBindingReadAuthorityPortV1,
} from '../apps/api/src/chat-thread-runtime-binding-read.js';
import type {
  CharacterRelationshipReadAuthorityPortV1,
} from '../apps/api/src/character-relationship-read.js';
import type {
  MemoryItemsReadAuthorityPortV1,
} from '../apps/api/src/memory-items-read.js';
import type {
  MemoryGrantsReadAuthorityPortV1,
} from '../apps/api/src/memory-grants-read.js';
import type {
  ReaderContextNonMemoryReadAuthorityPortV1,
} from '../apps/api/src/reader-context-non-memory-read.js';

describe('Reader Interpretation Preview HTTP seam', () => {
  it('accepts only threadId + officialReadingId and normalizes them', () => {
    expect(
      parseReaderInterpretationPreviewHttpRequestV1({
        threadId: '  thread-1  ',
        officialReadingId: '  reading-1  ',
      }),
    ).toEqual({
      threadId: 'thread-1',
      officialReadingId: 'reading-1',
    });
  });

  it.each([
    'readerCharacterId',
    'readerContentBundleId',
    'requestedDomain',
    'context',
    'grounding',
    'groundingRef',
    'perspective',
    'responseSnapshotJsonb',
  ])('rejects client authority field %s', (field) => {
    expect(() =>
      parseReaderInterpretationPreviewHttpRequestV1({
        threadId: 'thread-1',
        officialReadingId: 'reading-1',
        [field]: 'forged',
      }),
    ).toThrow(ReaderInterpretationPreviewHttpErrorV1);
  });

  it('projects only bounded Reader Scene output and strips internal provenance', () => {
    const envelope = {
      schemaVersion: 'myeongha-reader-interpretation-envelope-v1',
      contractVersion: 'reader-interpretation-preview-v1',
      lifecycle: 'preview',
      mode: 'reader_interpretation',
      officialReadingId: 'reading-1',
      readerCharacterId: 'baekheon',
      readerContentBundleId: 'bundle-private',
      requestedDomain: 'career',
      officialArtifactResponseHash: 'sha256:opaque-db-artifact',
      sourceResponseHash: 'a'.repeat(64),
      groundingHash: 'b'.repeat(64),
      interpretationHash: 'sha256:v1:interpretation',
      utterance: {
        schemaVersion: 'myeongha-character-saju-utterance-v1',
        rendererVersion: 'myeongha-character-saju-bounded-renderer-v1',
        characterId: 'baekheon',
        requestedDomain: 'career',
        utteranceId: 'private-utterance-id',
        readingRef: 'private-reading-ref',
        readingPlanRef: 'private-reading-plan-ref',
        renderedUnitIds: ['private-unit-1'],
        segments: [{
          kind: 'character_reaction',
          text: '장기 흐름은 참고하되 지금의 선택 가능성은 남겨 두겠습니다.',
          sourceUnitRefs: ['private-unit-1'],
          framingKey: 'private-framing-key',
        }],
      },
    } as unknown as ReaderInterpretationPreviewEnvelopeV1;

    const response = projectReaderInterpretationPreviewHttpResponseV1(envelope);

    expect(response).toMatchObject({
      lifecycle: 'preview',
      mode: 'reader_interpretation',
      officialReadingId: 'reading-1',
      readerCharacterId: 'baekheon',
      domain: 'career',
      interpretationHash: 'sha256:v1:interpretation',
    });
    expect(response).not.toHaveProperty('readerContentBundleId');
    expect(response).not.toHaveProperty('officialArtifactResponseHash');
    expect(response).not.toHaveProperty('sourceResponseHash');
    expect(response).not.toHaveProperty('groundingHash');
    expect(response).not.toHaveProperty('responseSnapshotJsonb');
    expect(response).toMatchObject({
      utterance: {
        characterId: 'baekheon',
        requestedDomain: 'career',
        segments: [{
          kind: 'character_reaction',
          text: '장기 흐름은 참고하되 지금의 선택 가능성은 남겨 두겠습니다.',
        }],
      },
    });
    expect(JSON.stringify(response)).not.toContain('private-utterance-id');
    expect(JSON.stringify(response)).not.toContain('private-reading-ref');
    expect(JSON.stringify(response)).not.toContain('private-reading-plan-ref');
    expect(JSON.stringify(response)).not.toContain('private-unit-1');
    expect(JSON.stringify(response)).not.toContain('private-framing-key');
    expect(JSON.stringify(response)).not.toContain('sourceUnitRefs');
  });

  it('rejects unauthenticated requests before resolving server Character context', async () => {
    const contextAuthorityPort: ReaderInterpretationPreviewContextAuthorityPortV1 = {
      resolveContext: vi.fn(),
    };
    const threadBindingAuthorityPort = {
      readRuntimeBinding: vi.fn(),
    } as unknown as ChatThreadRuntimeBindingReadAuthorityPortV1;
    const accessAuthorityPort = {
      readAccessibleReadings: vi.fn(),
    } as unknown as CharacterStandardReadingAccessAuthorityPortV1;
    const artifactAuthorityPort = {
      readArtifactSource: vi.fn(),
    } as unknown as CharacterStandardReadingArtifactAuthorityPortV1;
    const contentReleaseRuntime = {} as unknown as ContentReleaseRuntime;
    const relationshipAuthorityPort = {
      readCurrentRelationship: vi.fn(),
    } as unknown as CharacterRelationshipReadAuthorityPortV1;
    const memoryItemsAuthorityPort = {
      readCurrentItems: vi.fn(),
    } as unknown as MemoryItemsReadAuthorityPortV1;
    const memoryGrantsAuthorityPort = {
      readActiveGrants: vi.fn(),
    } as unknown as MemoryGrantsReadAuthorityPortV1;
    const nonMemoryContextAuthorityPort = {
      readGrantedLifeFacts: vi.fn(),
      readRelationshipEvents: vi.fn(),
      readRecentMessages: vi.fn(),
    } as unknown as ReaderContextNonMemoryReadAuthorityPortV1;

    await expect(
      runReaderInterpretationPreviewHttpV1({
        resolvedSubjectId: ' ',
        effectiveAt: '2026-09-21T01:00:00.000Z',
        body: {
          threadId: 'thread-1',
          officialReadingId: 'reading-1',
        },
        contextAuthorityPort,
        contentReleaseRuntime,
        threadBindingAuthorityPort,
        accessAuthorityPort,
        artifactAuthorityPort,
        relationshipAuthorityPort,
        memoryItemsAuthorityPort,
        memoryGrantsAuthorityPort,
        nonMemoryContextAuthorityPort,
        groundingProjectionPort: { projectGrounding: vi.fn() },
      }),
    ).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });

    expect(contextAuthorityPort.resolveContext).not.toHaveBeenCalled();
    expect(threadBindingAuthorityPort.readRuntimeBinding).not.toHaveBeenCalled();
  });

  it('rejects forged authority fields before server Character context resolution', async () => {
    const contextAuthorityPort: ReaderInterpretationPreviewContextAuthorityPortV1 = {
      resolveContext: vi.fn(),
    };
    const threadBindingAuthorityPort = {
      readRuntimeBinding: vi.fn(),
    } as unknown as ChatThreadRuntimeBindingReadAuthorityPortV1;
    const accessAuthorityPort = {
      readAccessibleReadings: vi.fn(),
    } as unknown as CharacterStandardReadingAccessAuthorityPortV1;
    const artifactAuthorityPort = {
      readArtifactSource: vi.fn(),
    } as unknown as CharacterStandardReadingArtifactAuthorityPortV1;
    const contentReleaseRuntime = {} as unknown as ContentReleaseRuntime;
    const relationshipAuthorityPort = {
      readCurrentRelationship: vi.fn(),
    } as unknown as CharacterRelationshipReadAuthorityPortV1;
    const memoryItemsAuthorityPort = {
      readCurrentItems: vi.fn(),
    } as unknown as MemoryItemsReadAuthorityPortV1;
    const memoryGrantsAuthorityPort = {
      readActiveGrants: vi.fn(),
    } as unknown as MemoryGrantsReadAuthorityPortV1;
    const nonMemoryContextAuthorityPort = {
      readGrantedLifeFacts: vi.fn(),
      readRelationshipEvents: vi.fn(),
      readRecentMessages: vi.fn(),
    } as unknown as ReaderContextNonMemoryReadAuthorityPortV1;

    await expect(
      runReaderInterpretationPreviewHttpV1({
        resolvedSubjectId: 'subject-1',
        effectiveAt: '2026-09-21T01:00:00.000Z',
        body: {
          threadId: 'thread-1',
          officialReadingId: 'reading-1',
          readerCharacterId: 'taegyeom',
        },
        contextAuthorityPort,
        contentReleaseRuntime,
        threadBindingAuthorityPort,
        accessAuthorityPort,
        artifactAuthorityPort,
        relationshipAuthorityPort,
        memoryItemsAuthorityPort,
        memoryGrantsAuthorityPort,
        nonMemoryContextAuthorityPort,
        groundingProjectionPort: { projectGrounding: vi.fn() },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST' });

    expect(contextAuthorityPort.resolveContext).not.toHaveBeenCalled();
    expect(threadBindingAuthorityPort.readRuntimeBinding).not.toHaveBeenCalled();
  });
});
