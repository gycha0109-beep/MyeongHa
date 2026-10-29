import { describe, expect, it, vi } from 'vitest';
import {
  assembleSeyeonRuntimeContextV2,
  type SeyeonRuntimeContextV2,
} from '../packages/domain/src/index.js';
import {
  createSeyeonC09ContinuityShadowV1,
} from '../apps/api/src/seyeon-c09-continuity-shadow-v1.js';
import {
  createPostgresSeyeonC09ContinuityShadowV1,
  createPostgresSeyeonC09ContinuitySnapshotPortV1,
  POSTGRES_SEYEON_C09_CONTINUITY_CENSUS_SQL_V1,
} from '../apps/api/src/postgres-seyeon-c09-continuity-shadow-v1.js';
import type { PostgresSubjectExecutionScopeV1 } from '../apps/api/src/postgres-subject-execution.js';

const SUBJECT = '11111111-1111-4111-8111-111111111111';
const THREAD = '22222222-2222-4222-8222-222222222222';
const U1 = '33333333-3333-4333-8333-333333333333';
const A2 = '44444444-4444-4444-8444-444444444444';
const U3 = '55555555-5555-4555-8555-555555555555';
const NOW = '2026-10-29T03:00:00.000Z';
const MEMORY_ID = '66666666-6666-4666-8666-666666666666';
const GRANT_ID = '77777777-7777-4777-8777-777777777777';

function context(withMemory = false): SeyeonRuntimeContextV2 {
  return assembleSeyeonRuntimeContextV2({
    relationship: null,
    recentMessages: [
      { messageId: U1, role: 'user', text: '안녕하세요' },
      { messageId: A2, role: 'assistant', text: '안녕하세요. 무슨 생각 하셨어요?' },
      { messageId: U3, role: 'user', text: '세연이는 어떤 생각을 해요?' },
    ],
    retrievedMemories: withMemory ? [{
      memoryId: 'memory:pretend',
      kind: 'memory',
      claimKind: 'fact',
      summary: '내가 임의로 만든 기억',
      sourceRef: 'memory:pretend:grant:fake',
      relevance: 1,
      salience: 1,
    }] : [],
    integrityDecisions: [],
    governedPreflightApplied: true,
    disclosure: { decision: null, retrievedSources: [] },
  });
}

function fakeScope(options: {
  staleLatest?: boolean;
  changedText?: boolean;
  extraMessage?: boolean;
  relationshipRow?: boolean;
  memoryRecord?: boolean;
  revokeAfterFirstSnapshot?: boolean;
} = {}) {
  let personalReads = 0;
  const query = vi.fn(async (sql: string, args?: readonly unknown[]) => {
    if (sql === POSTGRES_SEYEON_C09_CONTINUITY_CENSUS_SQL_V1) {
      expect(args).toEqual([SUBJECT, THREAD]);
      return { rows: [{
        threadStatus: 'active',
        participantCharacterIds: ['seyeon'],
        fullThreadMessageCount: options.extraMessage ? '4' : '3',
        latestMessageId: options.staleLatest ? A2 : U3,
        latestSenderType: 'user',
        latestRedactedAt: null,
        latestMessageText: options.changedText ? 'changed' : '세연이는 어떤 생각을 해요?',
      }] };
    }
    if (sql.includes('from public.qry_production_relationship_runtime_v1')) {
      return { rows: options.relationshipRow ? [{ revision: '99' }] : [] };
    }
    if (sql.includes('from public.qry_seyeon_production_personal_record_context_v1')) {
      personalReads++;
      return { rows: options.memoryRecord &&
        !(options.revokeAfterFirstSnapshot && personalReads > 1) ? [{
        recordKind: 'memory', recordId: MEMORY_ID,
        recordType: 'test_recall', schemaVersion: 'v1',
        payload: { summary: '사용자는 국화를 좋아한다고 승인해 말했다.' },
        grantId: GRANT_ID, grantReason: 'consented_recall', grantedAt: NOW,
        rawRecordPgDigest: 'sha256:pg-jsonb:v1:' + 'a'.repeat(64),
      }] : [] };
    }
    if (sql.includes('from public.qry_production_relationship_history_runtime_v1')) {
      return { rows: [{ historyRecordsJsonb: [] }] };
    }
    if (sql.includes('from public.qry_reader_context_recent_messages_v1')) {
      return { rows: [
        { messageId: U1, sequenceNo: '1', senderType: 'user', characterId: null, text: '안녕하세요', createdAt: NOW },
        { messageId: A2, sequenceNo: '2', senderType: 'character', characterId: 'seyeon', text: '안녕하세요. 무슨 생각 하셨어요?', createdAt: NOW },
        { messageId: U3, sequenceNo: '3', senderType: 'user', characterId: null, text: '세연이는 어떤 생각을 해요?', createdAt: NOW },
      ] };
    }
    throw new Error('Unexpected query');
  });
  const scope = {
    resolvedSubject: { subjectId: SUBJECT, subjectKind: 'member' },
    client: { query },
  } as unknown as PostgresSubjectExecutionScopeV1;
  return { scope, query };
}

function candidate() {
  return {
    interpretation: {
      schemaVersion: 'seyeon-turn-interpretation-v2',
      userMove: 'neutral_or_other',
      notice: { summary: '세연 자신의 생각을 물었다.', evidenceRefs: [U3] },
      immediateWant: { key: 'disclose_desire', summary: '지금 느끼는 호기심을 말하고 싶다.' },
      tension: { key: 'none_material', summary: '지금은 별다른 갈등이 없다.' },
      chosenAction: { key: 'approach', rationale: '자신의 현재 생각을 직접 말하기로 했다.' },
      expressionState: 'baseline',
      reveal: { level: 'public', triggerRef: null, supportingHistoryRefs: [] },
      memoryRefsUsed: [],
    },
    draft: {
      schemaVersion: 'seyeon-renderer-draft-v2',
      utterance: '저는 지금 어떤 대화를 하면 좋을지 궁금해요. 제 생각부터 이야기해볼게요.',
      expressionState: 'baseline',
      revealLevel: 'public',
      memoryRefsMentioned: [],
      privateSourceRefsMentioned: [],
      disclosureSliceIds: [],
    },
  };
}

describe('C09 independent PostgreSQL continuity snapshot adapter (mock DB)', () => {
  it('independently recomputes thread, current user, relationship, and empty approved memory', async () => {
    const ctx = context();
    const { scope, query } = fakeScope();
    const port = createPostgresSeyeonC09ContinuitySnapshotPortV1({
      scope, threadId: THREAD, context: ctx,
    });
    const result = await port.readAuthoritativeSnapshot({
      subjectId: SUBJECT, threadId: THREAD, currentUserMessageId: U3,
    });
    expect(result).toMatchObject({
      subjectId: SUBJECT,
      threadId: THREAD,
      fullThreadMessageCount: 3,
      authorizedMemoryIds: [],
      relationshipRevision: null,
    });
    expect((result as { grantSetFingerprint: string }).grantSetFingerprint)
      .toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(query.mock.calls).toHaveLength(5);
  });

  it('passes through all existing candidate guards and independent semantic review', async () => {
    const ctx = context();
    const { scope, query } = fakeScope();
    const generate = vi.fn(async (_request: unknown) => candidate());
    const review = vi.fn(async (request: unknown) => ({
      schemaVersion: 'seyeon-semantic-review-v2',
      reviewedUtteranceHash: (request as { input: { expectedUtteranceHash: string } }).input.expectedUtteranceHash,
      failureCodes: [],
      evidence: [],
    }));
    const shadow = createSeyeonC09ContinuityShadowV1({
      candidateProvider: { providerKey: 'mock', modelKey: 'mock', generate },
      reviewerProvider: { providerKey: 'mock', modelKey: 'mock', generate: review },
      authoritySnapshotPort: createPostgresSeyeonC09ContinuitySnapshotPortV1({
        scope, threadId: THREAD, context: ctx,
      }),
    });
    const answer = await shadow.evaluate(ctx);
    expect(answer.scope).toBe('SHADOW_ONLY_NOT_PRODUCTION');
    expect(query.mock.calls).toHaveLength(15);
    expect(generate).toHaveBeenCalledOnce();
    expect(review).toHaveBeenCalledOnce();
  });

  it('fails closed when current message is stale, changed, or unavailable', async () => {
    for (const options of [
      { staleLatest: true },
      { changedText: true },
      { relationshipRow: true },
    ]) {
      const { scope } = fakeScope(options);
      const ctx = context();
      const port = createPostgresSeyeonC09ContinuitySnapshotPortV1({
        scope, threadId: THREAD, context: ctx,
      });
      await expect(port.readAuthoritativeSnapshot({
        subjectId: SUBJECT, threadId: THREAD, currentUserMessageId: U3,
      })).rejects.toMatchObject({ code: 'C09_DB_AUTHORITY_UNVERIFIABLE' });
    }
  });

  it('does not accept fabricated memory without the independently approved source projector', async () => {
    const ctx = context(true);
    const { scope } = fakeScope();
    const port = createPostgresSeyeonC09ContinuitySnapshotPortV1({
      scope, threadId: THREAD, context: ctx,
    });
    await expect(port.readAuthoritativeSnapshot({
      subjectId: SUBJECT, threadId: THREAD, currentUserMessageId: U3,
    })).rejects.toMatchObject({ code: 'C09_DB_AUTHORITY_UNVERIFIABLE' });
  });

  it('does not accept a client-provided identity or mismatched subject/thread', async () => {
    const ctx = context();
    const { scope, query } = fakeScope();
    const port = createPostgresSeyeonC09ContinuitySnapshotPortV1({
      scope, threadId: THREAD, context: ctx,
    });
    await expect(port.readAuthoritativeSnapshot({
      subjectId: 'not-the-subject', threadId: THREAD, currentUserMessageId: U3,
    })).rejects.toMatchObject({ code: 'C09_DB_AUTHORITY_UNVERIFIABLE' });
    expect(query).not.toHaveBeenCalled();
  });
});


function authorizedMemoryContext(): SeyeonRuntimeContextV2 {
  const base = context();
  return assembleSeyeonRuntimeContextV2({
    relationship: null,
    recentMessages: base.recentConversation,
    retrievedMemories: [{
      memoryId: 'memory:' + MEMORY_ID,
      kind: 'memory',
      claimKind: 'fact',
      summary: '사용자는 국화를 좋아한다고 승인해 말했다.',
      sourceRef: 'memory:' + MEMORY_ID + ':grant:' + GRANT_ID,
      relevance: 1,
      salience: 1,
    }],
    integrityDecisions: [],
    governedPreflightApplied: true,
    disclosure: { decision: null, retrievedSources: [] },
  });
}

const approvedTestProjector = Object.freeze({
  recordKind: 'memory' as const,
  recordType: 'test_recall',
  schemaVersion: 'v1',
  projectorVersion: 'test-projector-v1',
  project(input: { recordId: string; payload: unknown }) {
    const row = input.payload as { summary: string };
    return {
      summary: row.summary,
      claimKind: 'fact' as const,
      relevance: 1,
      salience: 1,
    };
  },
});

describe('C09 real read adapters and positive Memory Grant lifecycle (mock DB)', () => {
  it('matches source-owned projection, exact grant ID, and selected memory content', async () => {
    const ctx = authorizedMemoryContext();
    const { scope } = fakeScope({ memoryRecord: true });
    const port = createPostgresSeyeonC09ContinuitySnapshotPortV1({
      scope, threadId: THREAD, context: ctx,
      serverOwnedPersonalRecordProjectors: [approvedTestProjector],
    });
    const source = await port.readAuthoritativeSnapshot({
      subjectId: SUBJECT, threadId: THREAD, currentUserMessageId: U3,
    }) as { grantSetFingerprint: string; authorizedMemoryIds: readonly string[] };
    expect(source.authorizedMemoryIds).toEqual(['memory:' + MEMORY_ID]);
    expect(source.grantSetFingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('rejects a revoked grant while a candidate is generating, without semantic review', async () => {
    const ctx = authorizedMemoryContext();
    const { scope } = fakeScope({ memoryRecord: true, revokeAfterFirstSnapshot: true });
    const generate = vi.fn(async () => ({
      ...candidate(),
      interpretation: {
        ...candidate().interpretation,
        chosenAction: { key: 'remember_naturally', rationale: '승인된 기억으로 회상한다.' },
        memoryRefsUsed: ['memory:' + MEMORY_ID],
      },
      draft: {
        ...candidate().draft,
        utterance: '국화를 좋아하신다고 하셨지요.',
        memoryRefsMentioned: ['memory:' + MEMORY_ID],
      },
    }));
    const review = vi.fn(async () => ({
      schemaVersion: 'seyeon-semantic-review-v2',
      reviewedUtteranceHash: 'irrelevant',
      failureCodes: [],
      evidence: [],
    }));
    const shadow = createSeyeonC09ContinuityShadowV1({
      candidateProvider: { providerKey: 'mock', modelKey: 'mock', generate },
      reviewerProvider: { providerKey: 'mock', modelKey: 'mock', generate: review },
      authoritySnapshotPort: createPostgresSeyeonC09ContinuitySnapshotPortV1({
        scope, threadId: THREAD, context: ctx,
        serverOwnedPersonalRecordProjectors: [approvedTestProjector],
      }),
    });
    await expect(shadow.evaluate(ctx)).rejects.toMatchObject({
      code: 'C09_AUTHORITY_SNAPSHOT_MISMATCH',
    });
    expect(generate).toHaveBeenCalledOnce();
    expect(review).not.toHaveBeenCalled();
  });
});


describe('PostgreSQL C09 opt-in Shadow composition', () => {
  it('wires the existing subject-scoped SQL adapter to a guarded model/reviewer pair', async () => {
    const ctx = context();
    const { scope, query } = fakeScope();
    const generate = vi.fn(async () => candidate());
    const review = vi.fn(async (request: unknown) => ({
      schemaVersion: 'seyeon-semantic-review-v2',
      reviewedUtteranceHash: (request as { input: { expectedUtteranceHash: string } }).input.expectedUtteranceHash,
      failureCodes: [],
      evidence: [],
    }));
    const shadow = createPostgresSeyeonC09ContinuityShadowV1({
      scope, threadId: THREAD, context: ctx,
      candidateProvider: { providerKey: 'fake', modelKey: 'fake', generate },
      reviewerProvider: { providerKey: 'fake', modelKey: 'fake', generate: review },
    });
    const envelope = await shadow.evaluate(ctx);
    expect(envelope.scope).toBe('SHADOW_ONLY_NOT_PRODUCTION');
    expect(query.mock.calls).toHaveLength(15);
    expect(generate).toHaveBeenCalledOnce();
    expect(review).toHaveBeenCalledOnce();
  });
});


describe('PostgreSQL C09 opt-in governed learning authority wiring', () => {
  it('binds classified topic evidence to the verified Subject in the existing DB Shadow factory', async () => {
    const ctx = context();
    const { scope, query } = fakeScope();
    const generate = vi.fn(async () => {
      throw new Error('No unrestricted model generation for bounded knowledge');
    });
    const review = vi.fn(async () => {
      throw new Error('No unrestricted semantic reviewer for source-authored bounded response');
    });
    const sourceRead = vi.fn(async (input: unknown) => {
      expect(input).toEqual({ subjectId: SUBJECT, currentUserMessageId: U3 });
      return {
        subjectId: SUBJECT,
        currentUserMessageId: U3,
        topicKey: 'python.programming',
        requestKind: 'technical_execution' as const,
        asOfTurn: '2026-10-29T06:50:00.000Z',
      };
    });
    const authority = {
      readServerClassifiedTurn: sourceRead,
      readAuthoritativeTopicPolicy: vi.fn(async () => ({
        characterId: 'seyeon' as const,
        topicKey: 'python.programming',
        policyVersion: 'synthetic-canon-fixture-v1',
        authoritySourceRef: 'test:canon-fixture',
        baseline: 'explicit_unaware' as const,
        domainPolicy: 'bounded' as const,
      })),
      readVerifiedLearningHistory: vi.fn(async () => []),
      verifyLearningEvidence: vi.fn(async () => {
        throw new Error('No evidence, verification should not be called');
      }),
    };
    const runner = createPostgresSeyeonC09ContinuityShadowV1({
      scope, threadId: THREAD, context: ctx,
      candidateProvider: { providerKey: 'mock', modelKey: 'mock', generate },
      reviewerProvider: { providerKey: 'mock', modelKey: 'mock', generate: review },
      approvedLearningAuthority: authority,
    });
    const bounded = await runner.evaluateKnowledgeBoundary(ctx);
    expect(bounded.scope).toBe('SHADOW_ONLY_NOT_PRODUCTION');
    expect(bounded.kind).toBe('BOUNDED_EPISTEMIC_RESPONSE');
    expect(bounded.utterance).toBeTruthy();
    expect(bounded.memoryWrites).toBe(0);
    expect(sourceRead).toHaveBeenCalledTimes(3);
    expect(query.mock.calls).toHaveLength(15);
    expect(generate).not.toHaveBeenCalled();
    expect(review).not.toHaveBeenCalled();
  });
});
