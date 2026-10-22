import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  prepareReaderConversationConsentContinuityShadowV1 as prepare,
  ReaderConversationConsentContinuityHoldV1,
} from '../apps/api/src/reader-conversation-consent-continuity-shadow-v1.js';
import {
  prepareReaderOrdinaryContinuityPlanV1 as preparePlan,
} from '../apps/api/src/reader-conversation-ordinary-continuity-plan-v1.js';
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

describe('RR-08 intent-conditioned Reader continuity plan (no fourth model)', () => {
  it('routes ordinary conversation to current Reader consent metadata without Official Saju data', async () => {
    const input = fixture();
    const plan = await preparePlan({
      userText: '오늘 있었던 얘기를 나누고 싶어.',
      admittedDomain: 'wealth',
      sourceAuthority: input,
    });
    expect(plan.mode).toBe('ordinary_source_candidate');
    if (plan.mode !== 'ordinary_source_candidate') return;
    expect(plan.intent.primaryIntent).toBe('ordinary');
    expect(plan.source.consentMemoryRefs).toHaveLength(1);
    expect(plan.officialReadingSourceRefs).toEqual([]);
    expect(plan.approvedMemoryContent).toBeNull();
    expect(plan.permitsModelInjection).toBe(false);
    expect(plan.modelContextPinned).toBe(false);
    expect(plan.permitsCommit).toBe(false);
    expect(plan.permitsHttpReveal).toBe(false);
    expect(plan.addedModelCalls).toBe(0);
  });

  it('routes concern to ordinary supportive source candidate without forced report narration', async () => {
    const plan = await preparePlan({
      userText: '요즘 일이 너무 힘들어서 이야기를 하고 싶어.',
      admittedDomain: 'wealth',
      sourceAuthority: fixture(),
    });
    expect(plan.mode).toBe('support_source_candidate');
    expect(JSON.stringify(plan)).not.toContain(memory.contentJsonb.summary);
  });

  it('never reads personal sources for Official Reading or ambiguous questions', async () => {
    const authority = fixture();
    authority.threadBindingAuthorityPort.readRuntimeBinding = vi.fn(async () => {
      throw Error('Official turn must not enter ordinary source collector.');
    });
    const official = await preparePlan({
      userText: '방금 본 재물 해석을 짧게 요약해 주세요.',
      admittedDomain: 'wealth',
      sourceAuthority: authority,
    });
    expect(official).toMatchObject({
      mode: 'hold', reason: 'OFFICIAL_READER_PATH_REQUIRED',
    });
    const uncertain = await preparePlan({
      userText: '내년 재물운도 계산해 줘.',
      admittedDomain: 'wealth',
      sourceAuthority: authority,
    });
    expect(uncertain).toMatchObject({
      mode: 'hold', reason: 'QUESTION_CLARIFICATION_REQUIRED',
    });
    expect(authority.threadBindingAuthorityPort.readRuntimeBinding).not.toHaveBeenCalled();
  });

  it('holds when risk flags coexist with ordinary/support intent; only existing Security gate may decide', async () => {
    const authority = fixture();
    authority.threadBindingAuthorityPort.readRuntimeBinding = vi.fn(async () => {
      throw Error('Security gate must run before personal data access.');
    });
    const risky = await preparePlan({
      userText: '요즘 우울해. 죽고 싶다는 생각이 들어.',
      admittedDomain: 'wealth',
      sourceAuthority: authority,
    });
    expect(risky).toMatchObject({
      mode: 'hold', reason: 'SECURITY_GATE_PENDING',
      intent: {primaryIntent: 'support'},
    });
    expect(authority.threadBindingAuthorityPort.readRuntimeBinding).not.toHaveBeenCalled();
  });

  it('fails closed if the current Reader is unavailable or a Grant is revoked', async () => {
    const authority = fixture();
    authority.memoryItemsAuthorityPort.readCurrentItems = vi.fn(async () => {
      throw Error('PRIVATE_CONTENT_MUST_NOT_LEAK');
    });
    const result = await preparePlan({
      userText: '오늘 있었던 일 얘기해줄게.',
      admittedDomain: 'wealth',
      sourceAuthority: authority,
    });
    expect(result).toMatchObject({
      mode: 'hold', reason: 'CONSENT_SOURCE_UNAVAILABLE',
    });
    expect(JSON.stringify(result)).not.toContain('PRIVATE_CONTENT_MUST_NOT_LEAK');
  });
});
