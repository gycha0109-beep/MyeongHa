import { describe, expect, it, vi } from 'vitest';
import {
  assembleSeyeonRuntimeContextV2,
  type SeyeonRuntimeContextV2,
} from '../packages/domain/src/index.js';
import {
  createSeyeonC09ContinuityShadowV1,
  fingerprintSeyeonC09ContinuityContextV1,
  SEYEON_C09_CONTINUITY_SHADOW_VERSION_V1,
  type SeyeonC09ContinuityAuthoritySnapshotV1,
} from '../apps/api/src/seyeon-c09-continuity-shadow-v1.js';

function context(withMemory = true): SeyeonRuntimeContextV2 {
  return assembleSeyeonRuntimeContextV2({
    relationship: {
      stageKey: 'familiar',
      closenessBand: 'medium',
      trustBand: 'medium',
      frictionBand: 'low',
      revision: 12,
      policyVersion: 'test-relationship-policy',
    },
    recentMessages: [
      { messageId: 'u1', role: 'user', text: '지난번에 알려드린 취향은요.' },
      { messageId: 'a2', role: 'assistant', text: '어느 쪽을 말씀하시는지요?' },
      { messageId: 'u3', role: 'user', text: '제가 매운 음식을 좋아한다고 배웠잖아요.' },
    ],
    retrievedMemories: withMemory ? [{
      memoryId: 'm1',
      kind: 'memory',
      claimKind: 'fact',
      summary: '사용자는 매운 음식을 좋아한다고 승인하여 말했다.',
      sourceRef: 'approved-memory:1',
      relevance: 0.9,
      salience: 0.7,
    }] : [],
    integrityDecisions: [],
    governedPreflightApplied: true,
    disclosure: { decision: null, retrievedSources: [] },
  });
}

function snapshot(ctx: SeyeonRuntimeContextV2): SeyeonC09ContinuityAuthoritySnapshotV1 {
  return {
    schemaVersion: SEYEON_C09_CONTINUITY_SHADOW_VERSION_V1,
    subjectId: 'subject-1',
    threadId: 'thread-1',
    currentUserMessageId: 'u3',
    complete: true,
    latestSenderType: 'user',
    fullThreadMessageCount: 3,
    contextSha256: fingerprintSeyeonC09ContinuityContextV1(ctx),
    grantSetFingerprint: 'sha256:' + 'a'.repeat(64),
    relationshipRevision: ctx.relationship?.revision ?? null,
    authorizedMemoryIds: ctx.retrievedMemories.map((m) => m.memoryId),
  };
}

function result(memory = true) {
  return {
    interpretation: {
      schemaVersion: 'seyeon-turn-interpretation-v2',
      userMove: 'remembered_seyeon_detail',
      notice: { summary: '사용자가 선호 기억을 물었다.', evidenceRefs: ['u3'] },
      immediateWant: { key: 'check_if_remembered', summary: '승인된 정보를 사용하되 과장하지 않는다.' },
      tension: { key: 'remember_vs_memory_showoff', summary: '기억을 뽐내지 않는다.' },
      chosenAction: { key: memory ? 'remember_naturally' : 'approach', rationale: '승인된 사용자 선호에 한해서 짧게 답한다.' },
      expressionState: 'baseline',
      reveal: { level: 'public', triggerRef: null, supportingHistoryRefs: [] },
      memoryRefsUsed: memory ? ['m1'] : [],
    },
    draft: {
      schemaVersion: 'seyeon-renderer-draft-v2',
      utterance: '매운 음식을 좋아하신다고 하셨지요. 그 취향은 기억하고 있어요.',
      expressionState: 'baseline',
      revealLevel: 'public',
      memoryRefsMentioned: memory ? ['m1'] : [],
      privateSourceRefsMentioned: [],
      disclosureSliceIds: [],
    },
  };
}

function providers(options?: {
  onCandidate?: () => void;
  onReview?: () => void;
  candidateResult?: () => unknown;
}) {
  const generate = vi.fn(async (_request: unknown) => {
    options?.onCandidate?.();
    return options?.candidateResult ? options.candidateResult() : result();
  });
  const review = vi.fn(async (request: unknown) => {
    options?.onReview?.();
    const r = request as { input: { expectedUtteranceHash: string } };
    return {
      schemaVersion: 'seyeon-semantic-review-v2',
      reviewedUtteranceHash: r.input.expectedUtteranceHash,
      failureCodes: [],
      evidence: [],
    };
  });
  return { generate, review };
}

describe('C09 governed continuity State -> Decision -> Renderer Shadow', () => {
  it('uses approved memory and relationship state but preserves independent reviewer and zero writes', async () => {
    const ctx = context();
    const read = vi.fn(async () => snapshot(ctx));
    const { generate, review } = providers();
    const shadow = createSeyeonC09ContinuityShadowV1({
      candidateProvider: { providerKey: 'fake', modelKey: 'fake', generate },
      reviewerProvider: { providerKey: 'fake', modelKey: 'fake', generate: review },
      authoritySnapshotPort: { subjectId: 'subject-1', threadId: 'thread-1', readAuthoritativeSnapshot: read },
    });
    const envelope = await shadow.evaluate(ctx);
    expect(envelope.scope).toBe('SHADOW_ONLY_NOT_PRODUCTION');
    expect(envelope.interpretation.memoryRefsUsed).toEqual(['m1']);
    expect(envelope.envelope.memoryRefsMentioned).toEqual(['m1']);
    expect(read).toHaveBeenCalledTimes(3);
    expect(generate).toHaveBeenCalledOnce();
    expect(review).toHaveBeenCalledOnce();
    const candidateRequest = generate.mock.calls[0]![0] as unknown as {
      input: Record<string, unknown>;
      purpose: string;
      responseSchema: object;
    };
    expect(candidateRequest.purpose).toBe('turn_interpret_render_shadow');
    expect(candidateRequest.input.c09ContinuityWorkingState).toMatchObject({
      scope: 'GOVERNED_MULTI_TURN_SHADOW_ONLY',
      relationshipRevision: 12,
      authorizedMemoryIds: ['m1'],
      mayMutateCanonicalState: false,
    });
  });

  it('blocks an absent authority port before making any model request', async () => {
    const { generate, review } = providers();
    const shadow = createSeyeonC09ContinuityShadowV1({
      candidateProvider: { providerKey: 'fake', modelKey: 'fake', generate },
      reviewerProvider: { providerKey: 'fake', modelKey: 'fake', generate: review },
    });
    await expect(shadow.evaluate(context())).rejects.toMatchObject({
      code: 'C09_AUTHORITY_SNAPSHOT_MISMATCH',
    });
    expect(generate).not.toHaveBeenCalled();
  });

  it('rejects forged or omitted grants, stale relationship, stale context digest and unknown extra fields', async () => {
    const ctx = context();
    const correct = snapshot(ctx);
    for (const invalid of [
      { ...correct, authorizedMemoryIds: [] },
      { ...correct, authorizedMemoryIds: ['another-subject-memory'] },
      { ...correct, contextSha256: 'sha256:forged' },
      { ...correct, relationshipRevision: 999 },
      { ...correct, extra: 'untrusted' },
      { ...correct, complete: false },
      { ...correct, latestSenderType: 'assistant' },
    ]) {
      const { generate, review } = providers();
      const shadow = createSeyeonC09ContinuityShadowV1({
        candidateProvider: { providerKey: 'fake', modelKey: 'fake', generate },
        reviewerProvider: { providerKey: 'fake', modelKey: 'fake', generate: review },
        authoritySnapshotPort: {
          subjectId: 'subject-1',
          threadId: 'thread-1',
          readAuthoritativeSnapshot: async () => invalid,
        },
      });
      await expect(shadow.evaluate(ctx)).rejects.toMatchObject({
        code: 'C09_AUTHORITY_SNAPSHOT_MISMATCH',
      });
      expect(generate).not.toHaveBeenCalled();
    }
  });

  it('discards results when memory is revoked between generation and semantic review', async () => {
    const ctx = context();
    let grantRevision = 4;
    const { generate, review } = providers({ onCandidate: () => { grantRevision++; } });
    const shadow = createSeyeonC09ContinuityShadowV1({
      candidateProvider: { providerKey: 'fake', modelKey: 'fake', generate },
      reviewerProvider: { providerKey: 'fake', modelKey: 'fake', generate: review },
      authoritySnapshotPort: {
        subjectId: 'subject-1',
        threadId: 'thread-1',
        readAuthoritativeSnapshot: async () => ({
          ...snapshot(ctx),
          grantSetFingerprint: 'sha256:' + (grantRevision === 4 ? 'a' : 'b').repeat(64),
          authorizedMemoryIds: grantRevision === 4 ? ['m1'] : [],
        }),
      },
    });
    await expect(shadow.evaluate(ctx)).rejects.toMatchObject({
      code: 'C09_AUTHORITY_SNAPSHOT_MISMATCH',
    });
    expect(generate).toHaveBeenCalledOnce();
    expect(review).not.toHaveBeenCalled();
  });

  it('discards results if a new user message is received during independent review', async () => {
    const ctx = context();
    let count = 3;
    const { generate, review } = providers({ onReview: () => { count++; } });
    const shadow = createSeyeonC09ContinuityShadowV1({
      candidateProvider: { providerKey: 'fake', modelKey: 'fake', generate },
      reviewerProvider: { providerKey: 'fake', modelKey: 'fake', generate: review },
      authoritySnapshotPort: {
        subjectId: 'subject-1',
        threadId: 'thread-1',
        readAuthoritativeSnapshot: async () => ({ ...snapshot(ctx), fullThreadMessageCount: count }),
      },
    });
    await expect(shadow.evaluate(ctx)).rejects.toMatchObject({
      code: 'C09_AUTHORITY_SNAPSHOT_MISMATCH',
    });
    expect(review).toHaveBeenCalledOnce();
  });

  it('rejects invented memory references before independent review', async () => {
    const ctx = context();
    const { generate, review } = providers({
      candidateResult: () => ({
        ...result(),
        interpretation: { ...result().interpretation, memoryRefsUsed: ['not-granted'] },
      }),
    });
    const shadow = createSeyeonC09ContinuityShadowV1({
      candidateProvider: { providerKey: 'fake', modelKey: 'fake', generate },
      reviewerProvider: { providerKey: 'fake', modelKey: 'fake', generate: review },
      authoritySnapshotPort: {
        subjectId: 'subject-1',
        threadId: 'thread-1',
        readAuthoritativeSnapshot: async () => snapshot(ctx),
      },
    });
    await expect(shadow.evaluate(ctx)).rejects.toMatchObject({
      code: 'C09_INTERPRETATION_REJECTED',
    });
    expect(review).not.toHaveBeenCalled();
  });

  it('requires a governed multi-turn context, including no private disclosure material', async () => {
    const ctx = context();
    const { generate, review } = providers();
    const shadow = createSeyeonC09ContinuityShadowV1({
      candidateProvider: { providerKey: 'fake', modelKey: 'fake', generate },
      reviewerProvider: { providerKey: 'fake', modelKey: 'fake', generate: review },
    });
    for (const invalid of [
      { ...ctx, recentConversation: [ctx.recentConversation.at(-1)] },
      { ...ctx, recentConversation: [...ctx.recentConversation.slice(0, -1), { messageId: 'a3', role: 'assistant', text: 'wrong' }] },
      { ...ctx, integrity: { ...ctx.integrity, governedPreflightApplied: false } },
      { ...ctx, disclosure: { decision: {}, retrievedSources: [] } },
      { ...ctx, character: { ...ctx.character, coreAnchor: ['forged'] } },
    ]) {
      await expect(shadow.evaluate(invalid as SeyeonRuntimeContextV2)).rejects.toMatchObject({
        code: 'C09_CONTEXT_NOT_ADMITTED',
      });
    }
    expect(generate).not.toHaveBeenCalled();
  });
});
