import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  prepareReaderConversationConsentContinuityShadowV1 as prepare,
  ReaderConversationConsentContinuityHoldV1,
} from '../apps/api/src/reader-conversation-consent-continuity-shadow-v1.js';
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

const subjectId = 'subject-one';
const threadId = 'thread-one';
const readerCharacterId = 'reader-one';
const otherReaderId = 'reader-two';
const memoryId = 'memory-one';
const grantId = 'grant-for-reader-one';
const releaseId = 'released-character-content-1';

const thread = {
  threadId, status: 'active', activeContentReleaseId: releaseId,
  activeContentBundleId: 'character-bundle-1',
  contentRevision: 4, participantCharacterIds: [readerCharacterId],
} as const;
const relationship = {
  stateId: 'relationship-one', characterId: readerCharacterId,
  closeness: 2, trust: 1, friction: 0,
  relationshipStage: 'initial', policyVersion: 'policy-1',
  revision: 7, lastInteractionAt: null,
  updatedAt: '2026-10-21T11:00:00Z',
} as const;
const memory = {
  memoryItemId: memoryId, memoryType: 'conversation_recall',
  schemaVersion: 'v1',
  contentJsonb: { summary: 'PRIVATE_CONTENT_SHOULD_NEVER_LEAVE_READER_BOUNDARY' },
  createdByCharacterId: null,
  createdAt: '2026-10-21T12:00:00Z',
} as const;
const grant = {
  grantId, characterId: readerCharacterId,
  grantReason: 'explicit_user_consent',
  grantedAt: '2026-10-21T12:01:00Z',
} as const;

function fixture() {
  const threadBindingAuthorityPort: ChatThreadRuntimeBindingReadAuthorityPortV1 = {
    readRuntimeBinding: vi.fn(async () => [thread]),
  };
  const relationshipAuthorityPort: CharacterRelationshipReadAuthorityPortV1 = {
    readCurrentRelationship: vi.fn(async () => [relationship]),
  };
  const memoryItemsAuthorityPort: MemoryItemsReadAuthorityPortV1 = {
    readCurrentItems: vi.fn(async () => [memory]),
  };
  const memoryGrantsAuthorityPort: MemoryGrantsReadAuthorityPortV1 = {
    readActiveGrants: vi.fn(async () => [grant]),
  };
  return {
    resolvedSubjectId: subjectId, threadId,
    threadBindingAuthorityPort, relationshipAuthorityPort,
    memoryItemsAuthorityPort, memoryGrantsAuthorityPort,
  };
}

async function holdCode(
  input: Parameters<typeof prepare>[0],
  code: ReaderConversationConsentContinuityHoldV1['code'],
) {
  await expect(prepare(input)).rejects.toMatchObject({
    name: 'ReaderConversationConsentContinuityHoldV1', code,
  });
}

describe('RR-08 Reader consent continuity metadata only; no positive provider or official source', () => {
  it('reuses the server current Thread/Reader/Relationship and consented Memory Grant, without copying content', async () => {
    const input = fixture();
    const result = await prepare(input);
    expect(result).toMatchObject({
      schemaVersion: 'reader-conversation-consent-continuity-shadow-v1',
      mode: 'non_authorizing_source_candidate',
      subjectId, threadId, readerCharacterId,
      contentReleaseId: releaseId, contentRevision: 4,
      relationship: {
        revision: 7, policyVersion: 'policy-1',
        sourceKind: 'current_reader_relationship_projection',
      },
      officialReadingRef: null,
      officialSajuSourceUnitRefs: [],
      modelContextPinned: false,
      permitsModelInjection: false,
      permitsCommit: false,
      permitsHttpReveal: false,
      addedModelCalls: 0,
    });
    expect(result.consentMemoryRefs).toEqual([{
      memoryItemId: memoryId, grantId,
      memoryType: 'conversation_recall', schemaVersion: 'v1',
      sourceKind: 'owner_memory_item_and_reader_current_grant',
      officialSajuEvidence: false,
      permitsModelInjection: false,
    }]);
    expect(result.sourceDigest).toMatch(/^sha256:v1:[0-9a-f]{64}$/u);
    expect(JSON.stringify(result)).not.toContain(memory.contentJsonb.summary);
    expect(input.threadBindingAuthorityPort.readRuntimeBinding)
      .toHaveBeenCalledTimes(2);
    expect(input.relationshipAuthorityPort.readCurrentRelationship)
      .toHaveBeenCalledTimes(2);
    expect(input.memoryGrantsAuthorityPort.readActiveGrants)
      .toHaveBeenCalledTimes(2);
  });

  it('returns an empty consent set with only other Reader grants, keeping relationship continuity', async () => {
    const input = fixture();
    const different = { ...grant, characterId: otherReaderId };
    input.memoryGrantsAuthorityPort.readActiveGrants = vi.fn(async () => [different]);
    const result = await prepare(input);
    expect(result.consentMemoryRefs).toEqual([]);
    expect(result.relationship.revision).toBe(7);
    expect(result.officialReadingRef).toBeNull();
  });

  it('rejects mismatched caller subject, bad thread, stale binding and unexpected Reader switch', async () => {
    const invalid = fixture();
    await holdCode({ ...invalid, resolvedSubjectId: ' ' }, 'INVALID_SCOPE');
    await holdCode({ ...invalid, threadId: '../x' + 'a'.repeat(140) }, 'INVALID_SCOPE');
    const moved = fixture();
    let count = 0;
    moved.threadBindingAuthorityPort.readRuntimeBinding = vi.fn(async () =>
      ++count === 1 ? [thread] : [{
        ...thread, participantCharacterIds: [otherReaderId],
      }]);
    await holdCode(moved, 'SOURCE_CHANGED');
    const multi = fixture();
    multi.threadBindingAuthorityPort.readRuntimeBinding =
      vi.fn(async () => [{ ...thread, participantCharacterIds: [
        readerCharacterId, otherReaderId,
      ] }]);
    await holdCode(multi, 'READER_MISMATCH');
  });

  it('detects current Grant revocation between candidate construction and final read', async () => {
    const input = fixture();
    let count = 0;
    input.memoryGrantsAuthorityPort.readActiveGrants =
      vi.fn(async () => ++count === 1 ? [grant] : []);
    await holdCode(input, 'SOURCE_CHANGED');
  });

  it('detects invalid multiple same-Reader current Grants and reused Grant IDs', async () => {
    const input = fixture();
    const secondGrant = {
      ...grant, grantId: 'another-reader-grant',
      grantedAt: '2026-10-21T12:02:00Z',
    };
    input.memoryGrantsAuthorityPort.readActiveGrants =
      vi.fn(async () => [grant, secondGrant]);
    await holdCode(input, 'GRANT_CONFLICT');
  });

  it('rejects current relationship revision change during the source read', async () => {
    const input = fixture();
    let count = 0;
    input.relationshipAuthorityPort.readCurrentRelationship =
      vi.fn(async () => ++count === 1
        ? [relationship] : [{ ...relationship, revision: 8 }]);
    await holdCode(input, 'SOURCE_CHANGED');
  });

  it('holds unavailable Memory/Thread authority instead of returning partial evidence', async () => {
    const input = fixture();
    input.memoryItemsAuthorityPort.readCurrentItems =
      vi.fn(async () => { throw Error('PRIVATE_DB_EXCEPTION'); });
    await holdCode(input, 'SOURCE_UNAVAILABLE');
    const second = fixture();
    second.threadBindingAuthorityPort.readRuntimeBinding =
      vi.fn(async () => []);
    await holdCode(second, 'SOURCE_UNAVAILABLE');
  });

  it('does not import Official Reading, Output/Memory projector, Provider or access-positive APIs', () => {
    const source = readFileSync(new URL(
      '../apps/api/src/reader-conversation-consent-continuity-shadow-v1.ts',
      import.meta.url,
    ), 'utf8');
    for (const dependency of [
      'getChatThreadRuntimeBinding', 'getCharacterRelationship',
      'getMemoryItems', 'getMemoryGrants',
    ]) expect(source).toContain(dependency);
    expect(source).not.toContain('resolveCharacterStandardReadingKnowledgeV1');
    expect(source).not.toContain('assembleOfficialStandardReaderRuntimeV2');
    expect(source).not.toContain('OPENAI_API_KEY');
    expect(source).not.toContain('fetch(');
    expect(source).not.toContain('.generate(');
    expect(source).not.toContain('memory.contentJsonb.summary');
    expect(source).toContain('modelContextPinned: false');
    expect(source).toContain('permitsHttpReveal: false');
  });
});
