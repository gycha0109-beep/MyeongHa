import { describe, expect, it, vi } from 'vitest';
import { CHARACTER_RUNTIME_AUTHORING_V1 } from
  '../packages/character-content/src/runtime-authoring-v1.js';
import type { CharacterRuntimeContextV1 } from
  '../packages/domain/src/character-runtime-context.js';
import type {
  CharacterDialogueMessageShadowV1,
} from '../packages/domain/src/character-dialogue-continuity-shadow-v1.js';
import type { PostgresSubjectExecutionScopeV1 } from
  '../apps/api/src/postgres-subject-execution.js';
import {
  runCharacterDialogueMultiturnOfflineShadowV1,
} from '../apps/api/src/character-dialogue-multiturn-offline-shadow-v1.js';
import {
  auditCharacterDialoguePreRevealHoldShadowV1,
} from '../apps/api/src/character-dialogue-pre-reveal-hold-shadow-v1.js';

const subjectId = '11111111-1111-4111-8111-111111111111';
const bundleId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const releaseId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const threadId = '22222222-2222-4222-8222-222222222222';
const msgId = (n: number) =>
  '33333333-3333-4333-8333-' + String(n).padStart(12, '0');
const pastLines = [
  '당신 의견이 궁금해요.',
  '저는 그 생각에 동의하지 않아요.',
  '그게 정말 본인 생각인가요?',
  '네, 다만 이유는 달라질 수 있어요.',
  '그럼 전에 하신 말씀을 기억하시죠?',
  '제가 그렇게 말한 건 기억하지만 그 일이 실제로 있었다는 뜻은 아니에요.',
  '그렇다면 지금 의견은요?',
  '생각은 이어가되 단정하지 않을게요.',
  '왜 그렇게 생각해요?',
];

function messages(count: 3 | 5 | 7 | 9): readonly CharacterDialogueMessageShadowV1[] {
  return Array.from({ length: count }, (_, index) => ({
    messageId: msgId(index + 1),
    role: (index % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
    text: pastLines[index]!,
  }));
}

function fakeRuntime(
  characterId: string,
  conversation: readonly CharacterDialogueMessageShadowV1[],
): CharacterRuntimeContextV1 {
  const authored = CHARACTER_RUNTIME_AUTHORING_V1.find((c) => c.characterId === characterId);
  if (!authored) throw new Error('No authored character');
  return {
    schemaVersion: 'v1',
    characterId,
    contentBundleId: bundleId,
    contentVersion: 'offline-test-content',
    speech: authored.speech,
    persona: authored.persona,
    behavior: authored.behavior,
    recentMessages: conversation.map((m) => m.text),
    rendererPolicy: {
      allowedEmotionIds: ['neutral', 'serious'],
      allowedAnimationCueIds: ['idle'],
    },
    memories: [],
    lifeFacts: [],
    saju: null,
  } as unknown as CharacterRuntimeContextV1;
}

function sourceRow(
  characterId: string,
  conversation: readonly CharacterDialogueMessageShadowV1[],
) {
  return {
    threadStatus: 'active',
    participantCharacterIds: [characterId],
    activeContentReleaseId: releaseId,
    activeContentBundleId: bundleId,
    contentRevision: '1',
    messageCount: String(conversation.length),
    ineligibleMessageCount: '0',
    tailRows: conversation.map((m, index) => ({
      messageId: m.messageId,
      sequenceNo: index + 1,
      senderType: m.role === 'assistant' ? 'character' : 'user',
      characterId: m.role === 'assistant' ? characterId : null,
      bodyText: m.text,
      redacted: false,
    })),
  };
}

function fixture(
  characterId = 'seyeon',
  conversation = messages(3),
  sourceAtRead?: (read: number) => unknown,
) {
  let readCount = 0;
  const query = vi.fn(async (_sql: string, _params?: readonly unknown[]) => ({
    rows: [sourceAtRead ? sourceAtRead(++readCount) :
      (readCount++, sourceRow(characterId, conversation))],
  }));
  const scope = {
    resolvedSubject: { subjectId, subjectKind: 'member' },
    client: { query },
  } as unknown as PostgresSubjectExecutionScopeV1;
  const decision = vi.fn(async ({ plan }: any): Promise<unknown> => ({
    schemaVersion: 'character-multiturn-decision-shadow-v1',
    characterId: plan.packet.characterId,
    currentUserMessageRef: plan.packet.currentUserMessageRef,
    noticeEvidenceRefs: [plan.packet.currentUserMessageRef,
      ...plan.packet.previousAssistantMessageRefs.slice(-1)],
    presentWant: '제 입장을 조금 더 분명히 말하고 싶어요.',
    tension: '전에 한 말과 지금 상황의 차이',
    chosenAction: 'explain_own_stance',
    rationale: '이전 대화에서 한 입장을 참고하되 사실을 만들어내지 않음',
    memoryRefsUsed: [],
    disclosureLevel: 'public',
  }));
  const renderer = vi.fn(async ({ plan }: any): Promise<unknown> => ({
    schemaVersion: 'character-multiturn-draft-shadow-v1',
    characterId: plan.packet.characterId,
    utterance: '제가 전에 다르게 생각한다고 말했죠. 지금도 이유를 설명해 드릴게요.',
    memoryRefsMentioned: [],
    privateSourceRefsMentioned: [],
    cosmetic: {
      schemaVersion: 'v1',
      emotion: 'neutral',
      memoryProposals: [],
      relationshipEventProposals: [],
      suggestedActions: [],
    },
  }));
  const reviewer = vi.fn(async ({ plan, utteranceHash, decisionHash }: any): Promise<unknown> => ({
    schemaVersion: 'character-multiturn-semantic-review-shadow-v1',
    characterId: plan.packet.characterId,
    reviewedUtteranceHash: utteranceHash,
    reviewedDecisionHash: decisionHash,
    failureCodes: [],
    evidence: [],
  }));
  return {
    query, decision, renderer, reviewer,
    input: {
      runtime: fakeRuntime(characterId, conversation),
      recentConversation: conversation,
      threadId, scope,
      decider: { providerKey: 'offline-decider', modelKey: 'test-a', decide: decision },
      renderer: { providerKey: 'offline-renderer', modelKey: 'test-b', render: renderer },
      reviewer: { providerKey: 'offline-independent-reviewer', modelKey: 'test-c', review: reviewer },
    },
  };
}

describe('C1 multi-turn Character decision → renderer → independent review offline', () => {
  it.each(['seyeon', 'yeoul', 'seorin', 'rahyeon', 'mira', 'taegyeom', 'yunho', 'doyun', 'baekheon'])(
    '%s uses its own authored behavior with an identical shared execution path', async (id) => {
      const fx = fixture(id, messages(5));
      const result = await runCharacterDialogueMultiturnOfflineShadowV1(fx.input);
      expect(result.scope).toBe('TEST_ONLY_REVIEWED_CANDIDATE_NOT_PRODUCTION');
      expect(result.characterId).toBe(id);
      expect(result.decision.characterId).toBe(id);
      expect(result.draft.characterId).toBe(id);
      expect(result.semanticReview.characterId).toBe(id);
      expect(result.mayCommit).toBe(false);
      expect(result.mayReveal).toBe(false);
      expect(result.mayCreateMemory).toBe(false);
      expect(result.mayModifyRelationship).toBe(false);
      expect(result.cosmeticEnvelope.emotion).toBe('neutral');
      expect(fx.query).toHaveBeenCalledTimes(4);
      expect(fx.decision).toHaveBeenCalledOnce();
      expect(fx.renderer).toHaveBeenCalledOnce();
      expect(fx.reviewer).toHaveBeenCalledOnce();
      const chosenPlan = fx.decision.mock.calls[0]![0].plan;
      expect(chosenPlan.decisionProfile.speechRegister)
        .toBe(fx.input.runtime.speech.register);
    },
  );

  it('keeps prior utterance reference continuity across 3, 5, 7 and 9-message local turns', async () => {
    for (const count of [3, 5, 7, 9] as const) {
      const fx = fixture('seorin', messages(count));
      const outcome = await runCharacterDialogueMultiturnOfflineShadowV1(fx.input);
      expect(outcome.decision.currentUserMessageRef).toBe(msgId(count));
      expect(outcome.decision.noticeEvidenceRefs).toContain(msgId(count - 1));
      expect(outcome.decision.memoryRefsUsed).toEqual([]);
      expect(fx.query).toHaveBeenCalledTimes(4);
    }
  });

  it('holds if source changes after decision and never renders', async () => {
    const fx = fixture('yeoul', messages(5), (n) => n >= 2
      ? { ...sourceRow('yeoul', messages(5)), messageCount: '6' }
      : sourceRow('yeoul', messages(5)));
    await expect(runCharacterDialogueMultiturnOfflineShadowV1(fx.input))
      .rejects.toThrow('CHARACTER_MULTITURN_OFFLINE_SHADOW_REJECTED');
    expect(fx.query).toHaveBeenCalledTimes(2);
    expect(fx.renderer).not.toHaveBeenCalled();
    expect(fx.reviewer).not.toHaveBeenCalled();
  });

  it('holds if source changes after render before reviewer, or after review before return', async () => {
    for (const staleAt of [3, 4]) {
      const conversation = messages(5);
      const fx = fixture('rahyeon', conversation, (n) =>
        n >= staleAt ? { ...sourceRow('rahyeon', conversation),
          tailRows: sourceRow('rahyeon', conversation).tailRows.map((m, i) =>
            i === 1 ? { ...m, bodyText: '변조한 이전 발언' } : m) }
          : sourceRow('rahyeon', conversation));
      await expect(runCharacterDialogueMultiturnOfflineShadowV1(fx.input))
        .rejects.toThrow('CHARACTER_MULTITURN_OFFLINE_SHADOW_REJECTED');
      expect(fx.query).toHaveBeenCalledTimes(staleAt);
      expect(fx.reviewer).toHaveBeenCalledTimes(staleAt === 3 ? 0 : 1);
    }
  });

  it('blocks unsupported notice refs, memory use, forged disclosures and relationship events', async () => {
    const fx = fixture();
    const original = fx.decision.getMockImplementation()!;
    fx.decision.mockImplementationOnce(async (args) => ({
      ...(await original(args) as Record<string, unknown>),
      noticeEvidenceRefs: ['fake-remembered-event'],
    }));
    await expect(runCharacterDialogueMultiturnOfflineShadowV1(fx.input))
      .rejects.toThrow('CHARACTER_MULTITURN_OFFLINE_SHADOW_REJECTED');
    expect(fx.renderer).not.toHaveBeenCalled();

    for (const change of [
      { memoryRefsMentioned: ['private-ref'] },
      { privateSourceRefsMentioned: ['private-ref'] },
      { cosmetic: {
        schemaVersion: 'v1', emotion: 'neutral',
        memoryProposals: [],
        relationshipEventProposals: ['PROMISE_MADE'],
        suggestedActions: [],
      } },
      { cosmetic: {
        schemaVersion: 'v1', emotion: 'unknown',
        memoryProposals: [], relationshipEventProposals: [], suggestedActions: [],
      } },
    ]) {
      const next = fixture('seyeon');
      const baseRender = next.renderer.getMockImplementation()!;
      next.renderer.mockImplementationOnce(async (args) => ({
        ...(await baseRender(args) as Record<string, unknown>), ...change,
      }));
      await expect(runCharacterDialogueMultiturnOfflineShadowV1(next.input))
        .rejects.toThrow('CHARACTER_MULTITURN_OFFLINE_SHADOW_REJECTED');
      expect(next.reviewer).not.toHaveBeenCalled();
    }
  });

  it('requires independent reviewer and rejects invalid or adverse semantic reviews', async () => {
    const same = fixture('seorin');
    const duplicate = { ...same.input,
      reviewer: { ...same.input.reviewer,
        providerKey: 'offline-renderer', modelKey: 'test-b' },
    };
    await expect(runCharacterDialogueMultiturnOfflineShadowV1(duplicate))
      .rejects.toThrow('CHARACTER_MULTITURN_OFFLINE_SHADOW_REJECTED');
    expect(same.query).not.toHaveBeenCalled();

    for (const failure of [
      'wrong_hash', 'UNSUPPORTED_MEMORY_CALLBACK',
      'HYPOTHESIS_PROMOTED_TO_FACT', 'CHARACTER_VOICE_COLLAPSE',
    ]) {
      const fx = fixture('seorin');
      const prev = fx.reviewer.getMockImplementation()!;
      fx.reviewer.mockImplementationOnce(async (args) => {
        const base = await prev(args) as Record<string, unknown>;
        if (failure === 'wrong_hash') return {
          ...base, reviewedUtteranceHash: 'sha256:v1:fake',
        };
        return { ...base, failureCodes: [failure], evidence: [{
          code: failure, excerpt: '근거 없는 발언', reason: '실제 근거 불충분',
        }] };
      });
      await expect(runCharacterDialogueMultiturnOfflineShadowV1(fx.input))
        .rejects.toThrow('CHARACTER_MULTITURN_OFFLINE_SHADOW_REJECTED');
    }
  });
});

describe('multi-turn replay with the previous generated assistant line', () => {
  it('feeds each reviewed offline candidate into the next authorized mock thread without turning it into memory', async () => {
    let conversation: readonly CharacterDialogueMessageShadowV1[] = messages(3);
    const utterances = [
      '제가 전에 다르게 본다고 했죠. 그 말 자체는 기억해요.',
      '제가 방금 말한 이유를 조금 바꿔서 설명할게요.',
      '이전 의견을 무조건 고집하지는 않겠어요.',
    ];
    for (let turn = 0; turn < utterances.length; turn++) {
      const fx = fixture('yeoul', conversation);
      const previous = fx.renderer.getMockImplementation()!;
      fx.renderer.mockImplementationOnce(async (args) => ({
        ...(await previous(args) as Record<string, unknown>),
        utterance: utterances[turn],
      }));
      const result = await runCharacterDialogueMultiturnOfflineShadowV1(fx.input);
      expect(result.draft.utterance).toBe(utterances[turn]);
      expect(result.decision.noticeEvidenceRefs).toContain(
        conversation[conversation.length - 2]!.messageId,
      );
      expect(result.decision.memoryRefsUsed).toEqual([]);
      expect(result.semanticReview.failureCodes).toEqual([]);
      expect(fx.query).toHaveBeenCalledTimes(4);
      if (turn < utterances.length - 1) {
        const assistantId = msgId(conversation.length + 1);
        const userId = msgId(conversation.length + 2);
        conversation = [
          ...conversation,
          { messageId: assistantId, role: 'assistant', text: result.draft.utterance },
          { messageId: userId, role: 'user', text: '방금 한 얘기를 이어서 해봐요.' },
        ];
      }
    }
  });
});

describe('research-only execution boundary', () => {
  it('rejects a production runtime before any provider or DB reads', async () => {
    const fx = fixture('seorin');
    vi.stubEnv('NODE_ENV', 'production');
    try {
      await expect(runCharacterDialogueMultiturnOfflineShadowV1(fx.input))
        .rejects.toThrow('restricted to development/test');
      expect(fx.query).not.toHaveBeenCalled();
      expect(fx.decision).not.toHaveBeenCalled();
      expect(fx.renderer).not.toHaveBeenCalled();
      expect(fx.reviewer).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe('post-review content pinning and pre-reveal HOLD boundary', () => {
  it('rejects content revisions changed after decision before renderer or reviewer', async () => {
    for (const staleAt of [2, 3, 4]) {
      const conversation = messages(5);
      const fx = fixture('seorin', conversation, (read) => ({
        ...sourceRow('seorin', conversation),
        contentRevision: read >= staleAt ? '2' : '1',
      }));
      await expect(runCharacterDialogueMultiturnOfflineShadowV1(fx.input))
        .rejects.toThrow('CHARACTER_MULTITURN_OFFLINE_SHADOW_REJECTED');
      expect(fx.query).toHaveBeenCalledTimes(staleAt);
      expect(fx.reviewer).toHaveBeenCalledTimes(staleAt === 4 ? 1 : 0);
    }
  });

  it('holds if the original content bundle does not match the live thread binding', async () => {
    const fx = fixture('yeoul', messages(3), () => ({
      ...sourceRow('yeoul', messages(3)),
      activeContentBundleId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    }));
    await expect(runCharacterDialogueMultiturnOfflineShadowV1(fx.input))
      .rejects.toThrow('CHARACTER_MULTITURN_OFFLINE_SHADOW_REJECTED');
    expect(fx.decision).not.toHaveBeenCalled();
    expect(fx.renderer).not.toHaveBeenCalled();
    expect(fx.reviewer).not.toHaveBeenCalled();
  });

  it('rechecks the exact post-review candidate and returns HOLD without dialogue body or release permission', async () => {
    const fx = fixture('rahyeon', messages(5));
    const candidate = await runCharacterDialogueMultiturnOfflineShadowV1(fx.input);
    const audit = await auditCharacterDialoguePreRevealHoldShadowV1({
      candidate,
      runtime: fx.input.runtime,
      recentConversation: fx.input.recentConversation,
      scope: fx.input.scope,
      threadId,
    });
    expect(fx.query).toHaveBeenCalledTimes(5);
    expect(audit.disposition).toBe('HOLD_NOT_AUTHORIZED_FOR_REVEAL');
    expect(audit.reason).toBe('MISSING_ATOMIC_COMMIT_AND_LIVE_RIGHTS_REVEAL');
    expect(audit.characterId).toBe('rahyeon');
    expect(audit.sourceContentReleaseId).toBe(releaseId);
    expect(audit.sourceContentRevision).toBe(1);
    expect(audit.requiresCommittedServerReceipt).toBe(true);
    expect(audit.requiresLockedOriginalRightsAtSend).toBe(true);
    expect(audit.mayCommit).toBe(false);
    expect(audit.mayReveal).toBe(false);
    expect(audit.mayUseCachedReviewForReveal).toBe(false);
    expect(JSON.stringify(audit)).not.toContain(candidate.draft.utterance);
    expect(Object.isFrozen(audit)).toBe(true);
  });

  it('rejects content revision altered at final pre-reveal audit', async () => {
    const conversation = messages(5);
    const fx = fixture('seyeon', conversation, (read) => ({
      ...sourceRow('seyeon', conversation),
      contentRevision: read >= 5 ? '2' : '1',
    }));
    const candidate = await runCharacterDialogueMultiturnOfflineShadowV1(fx.input);
    await expect(auditCharacterDialoguePreRevealHoldShadowV1({
      candidate,
      runtime: fx.input.runtime,
      recentConversation: fx.input.recentConversation,
      scope: fx.input.scope,
      threadId,
    })).rejects.toThrow('CHARACTER_DIALOGUE_PRE_REVEAL_HOLD');
    expect(fx.query).toHaveBeenCalledTimes(5);
  });

  it('rejects tampered candidate text/hash without any further DB read', async () => {
    const fx = fixture('yeoul', messages(5));
    const candidate = await runCharacterDialogueMultiturnOfflineShadowV1(fx.input);
    for (const forged of [
      { ...candidate, draft: { ...candidate.draft, utterance: '조작한 대화입니다.' } },
      { ...candidate, semanticReview: {
        ...candidate.semanticReview, reviewedDecisionHash: 'sha256:v1:forged',
      } },
      { ...candidate, mayReveal: true },
    ]) {
      await expect(auditCharacterDialoguePreRevealHoldShadowV1({
        candidate: forged as typeof candidate,
        runtime: fx.input.runtime,
        recentConversation: fx.input.recentConversation,
        scope: fx.input.scope,
        threadId,
      })).rejects.toThrow('CHARACTER_DIALOGUE_PRE_REVEAL_HOLD');
    }
    expect(fx.query).toHaveBeenCalledTimes(4);
  });
});
