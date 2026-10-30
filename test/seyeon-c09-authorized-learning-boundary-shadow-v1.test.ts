import { describe, expect, it, vi } from 'vitest';
import {
  assembleSeyeonRuntimeContextV2,
  type SeyeonRuntimeContextV2,
} from '../packages/domain/src/index.js';
import {
  createSeyeonC09EpistemicAuthorityShadowPortV1,
  type SeyeonC09ApprovedLearningReadAuthorityV1,
} from '../apps/api/src/seyeon-c09-epistemic-authority-shadow-v1.js';
import {
  createSeyeonC09ContinuityShadowV1,
  fingerprintSeyeonC09ContinuityContextV1,
  SEYEON_C09_CONTINUITY_SHADOW_VERSION_V1,
} from '../apps/api/src/seyeon-c09-continuity-shadow-v1.js';

const ASOF = '2026-10-29T06:45:00.000Z';
const LEARNED = '2026-10-28T06:45:00.000Z';

function context(
  latestMessageId = 'u3',
  latestText = '파이썬으로 프로그램을 작성해 보세요.',
): SeyeonRuntimeContextV2 {
  return assembleSeyeonRuntimeContextV2({
    relationship: null,
    recentMessages: [
      { messageId: 'u1', role: 'user', text: '안녕하세요.' },
      { messageId: 'a2', role: 'assistant', text: '저는 오늘 조금 궁금한 게 많아요.' },
      { messageId: latestMessageId, role: 'user', text: latestText },
    ],
    retrievedMemories: [],
    integrityDecisions: [],
    governedPreflightApplied: true,
    disclosure: { decision: null, retrievedSources: [] },
  });
}

function snapshot(c: SeyeonRuntimeContextV2) {
  return {
    schemaVersion: SEYEON_C09_CONTINUITY_SHADOW_VERSION_V1,
    subjectId: 'subject-A',
    threadId: 'thread-A',
    currentUserMessageId: c.recentConversation.at(-1)!.messageId,
    complete: true,
    latestSenderType: 'user',
    fullThreadMessageCount: 3,
    contextSha256: fingerprintSeyeonC09ContinuityContextV1(c),
    grantSetFingerprint: 'sha256:' + 'a'.repeat(64),
    relationshipRevision: null,
    authorizedMemoryIds: [],
  };
}

function learningHistory(
  overrides: Record<string, unknown> = {},
) {
  return [{
    evidenceId: 'lesson-v1',
    characterId: 'seyeon' as const,
    topicKey: 'python.programming',
    sourceKind: 'user_taught_verified' as const,
    authorityRef: 'server:approved-lesson:one',
    verifiedByServer: true as const,
    awareness: 'heard_of' as const,
    visibility: 'character_shared' as const,
    subjectId: null,
    approvedForCharacterSharing: true,
    privacyReviewed: true,
    learnedAt: LEARNED,
    validAt: LEARNED,
    supersededAt: null,
    ...overrides,
  }];
}

function source(input: {
  requestKind?: 'technical_execution' | 'general_question' | 'learning_offer';
  learning?: boolean;
  changeAfterFirst?: boolean;
  invalidProof?: boolean;
  missingPolicy?: boolean;
  wrongTopic?: boolean;
  privateOtherSubject?: boolean;
} = {}) {
  let reads = 0;
  let verifies = 0;
  const authority = {
    async readServerClassifiedTurn(request) {
      expect(request).toEqual({ subjectId: 'subject-A', currentUserMessageId: 'u3' });
      return {
        subjectId: 'subject-A',
        currentUserMessageId: 'u3',
        topicKey: 'python.programming',
        requestKind: input.requestKind ?? 'technical_execution',
        asOfTurn: ASOF,
      };
    },
    async readAuthoritativeTopicPolicy() {
      if (input.missingPolicy) return null;
      return {
        characterId: 'seyeon',
        topicKey: input.wrongTopic ? 'another.topic' : 'python.programming',
        policyVersion: 'fixture-canon-1',
        authoritySourceRef: 'fixture:author-policy',
        baseline: 'explicit_unaware',
        domainPolicy: 'bounded',
      };
    },
    async readVerifiedLearningHistory() {
      reads++;
      if (!input.learning || input.changeAfterFirst && reads > 1) return [];
      if (input.privateOtherSubject) {
        return learningHistory({
          visibility: 'user_private',
          subjectId: 'subject-B',
          approvedForCharacterSharing: false,
          privacyReviewed: false,
        });
      }
      return learningHistory();
    },
    async verifyLearningEvidence() {
      verifies++;
      return !input.invalidProof;
    },
  } satisfies SeyeonC09ApprovedLearningReadAuthorityV1;
  return { authority, getReads: () => reads, getVerifies: () => verifies };
}

function shadow(c: SeyeonRuntimeContextV2, authority: SeyeonC09ApprovedLearningReadAuthorityV1) {
  const candidateGenerate = vi.fn(async () => {
    throw new Error('Unrestricted model must not be called');
  });
  const reviewerGenerate = vi.fn(async () => {
    throw new Error('Free-form reviewer must not be called');
  });
  const readSnapshot = vi.fn(async () => snapshot(c));
  const port = createSeyeonC09EpistemicAuthorityShadowPortV1({
    subjectId: 'subject-A', authority,
  });
  const runner = createSeyeonC09ContinuityShadowV1({
    candidateProvider: { providerKey: 'test', modelKey: 'test', generate: candidateGenerate },
    reviewerProvider: { providerKey: 'test', modelKey: 'test', generate: reviewerGenerate },
    authoritySnapshotPort: {
      subjectId: 'subject-A', threadId: 'thread-A',
      readAuthoritativeSnapshot: readSnapshot,
    },
    epistemicAuthorityPort: port,
  });
  return { runner, readSnapshot, candidateGenerate, reviewerGenerate, port };
}

describe('C09 trusted learning-source reader + character-owned bounded response', () => {
  it('returns a natural, source-authored knowledge boundary instead of technical execution', async () => {
    const c = context();
    const s = source();
    const runner = shadow(c, s.authority);
    const response = await runner.runner.evaluateKnowledgeBoundary(c);
    expect(response.scope).toBe('SHADOW_ONLY_NOT_PRODUCTION');
    expect(response.kind).toBe('BOUNDED_EPISTEMIC_RESPONSE');
    expect(response.decision.chosenAction).toMatch(/admit_limit|express_curiosity|keep_independent_stance/u);
    expect(response.decision.authority).toBe('SERVER_OWNED_NON_CANONICAL');
    expect(response.utterance).toContain('요');
    expect(response.utterance).not.toMatch(/def |print\(|for \w+ in|while \(/iu);
    expect(response.memoryWrites).toBe(0);
    expect(runner.candidateGenerate).not.toHaveBeenCalled();
    expect(runner.reviewerGenerate).not.toHaveBeenCalled();
    expect(runner.readSnapshot).toHaveBeenCalledTimes(3);
    expect(s.getReads()).toBe(3);
  });

  it('for a general inquiry, an explicitly unknown topic permits a curious Se-yeon-owned move', async () => {
    const c = context();
    const s = source({ requestKind: 'general_question' });
    const runner = shadow(c, s.authority);
    const response = await runner.runner.evaluateKnowledgeBoundary(c);
    expect(response.decision.chosenAction).toMatch(/express_curiosity|ask_to_learn|keep_independent_stance/u);
    expect(response.utterance).not.toContain('fixture');
    expect(response.utterance).not.toContain('subject-');
  });

  it('uses independently verified approved learning without leaking its teacher or source', async () => {
    const s = source({ requestKind: 'technical_execution', learning: true });
    const port = createSeyeonC09EpistemicAuthorityShadowPortV1({
      subjectId: 'subject-A', authority: s.authority,
    });
    const decision = await port.readCurrentKnowledgeDecision({
      subjectId: 'subject-A', currentUserMessageId: 'u3',
    }) as { responsePermission: string; characterKnowledgeLevel: string; allowedEvidenceIds: string[] };
    expect(decision.characterKnowledgeLevel).toBe('heard_of');
    expect(decision.responsePermission).toBe('withhold');
    expect(decision.allowedEvidenceIds).toEqual(['lesson-v1']);
    expect(s.getVerifies()).toBe(1);
    expect(JSON.stringify(decision)).not.toContain('server:approved-lesson:one');
  });

  it('rejects missing Canon policy, false verification, wrong topic and another subject private lessons', async () => {
    for (const options of [
      { missingPolicy: true }, { invalidProof: true, learning: true },
      { wrongTopic: true }, { privateOtherSubject: true, learning: true },
    ]) {
      const s = source(options);
      const port = createSeyeonC09EpistemicAuthorityShadowPortV1({
        subjectId: 'subject-A', authority: s.authority,
      });
      await expect(port.readCurrentKnowledgeDecision({
        subjectId: 'subject-A', currentUserMessageId: 'u3',
      })).rejects.toMatchObject({ code: 'C09_EPISTEMIC_SOURCE_UNVERIFIABLE' });
    }
  });

  it('fails before any user or model call if the requested subject identity differs', async () => {
    const s = source();
    const port = createSeyeonC09EpistemicAuthorityShadowPortV1({
      subjectId: 'subject-A', authority: s.authority,
    });
    await expect(port.readCurrentKnowledgeDecision({
      subjectId: 'subject-B', currentUserMessageId: 'u3',
    })).rejects.toMatchObject({ code: 'C09_EPISTEMIC_SOURCE_UNVERIFIABLE' });
    expect(s.getReads()).toBe(0);
  });

  it('revocation during the bounded answer discards the response', async () => {
    const c = context();
    const s = source({ requestKind: 'technical_execution', learning: true, changeAfterFirst: true });
    const runner = shadow(c, s.authority);
    await expect(runner.runner.evaluateKnowledgeBoundary(c)).rejects.toMatchObject({
      code: 'C09_KNOWLEDGE_AUTHORITY_MISMATCH',
    });
    expect(runner.candidateGenerate).not.toHaveBeenCalled();
    expect(runner.reviewerGenerate).not.toHaveBeenCalled();
  });

  it('new full-thread message during bounded response is not returned', async () => {
    const c = context();
    const s = source();
    let count = 3;
    const runner = createSeyeonC09ContinuityShadowV1({
      candidateProvider: { providerKey: 'test', modelKey: 'test', generate: vi.fn(async () => null) },
      reviewerProvider: { providerKey: 'test', modelKey: 'test', generate: vi.fn(async () => null) },
      authoritySnapshotPort: {
        subjectId: 'subject-A',
        threadId: 'thread-A',
        readAuthoritativeSnapshot: async () => ({
          ...snapshot(c), fullThreadMessageCount: count++,
        }),
      },
      epistemicAuthorityPort: createSeyeonC09EpistemicAuthorityShadowPortV1({
        subjectId: 'subject-A', authority: s.authority,
      }),
    });
    await expect(runner.evaluateKnowledgeBoundary(c)).rejects.toMatchObject({
      code: 'C09_AUTHORITY_SNAPSHOT_MISMATCH',
    });
  });

  it('rejects a normal topic on the special bounded response endpoint', async () => {
    const c = context();
    const s = source({ learning: true, requestKind: 'general_question' });
    const runner = shadow(c, s.authority);
    await expect(runner.runner.evaluateKnowledgeBoundary(c)).rejects.toMatchObject({
      code: 'C09_KNOWLEDGE_RESTRICTED',
    });
    expect(runner.candidateGenerate).not.toHaveBeenCalled();
  });

  it('avoids repeating an identical canned line if it appeared in the last assistant turn', async () => {
    const c = context();
    const s = source({ requestKind: 'general_question' });
    const runner = shadow(c, s.authority);
    const first = await runner.runner.evaluateKnowledgeBoundary(c);
    const other = assembleSeyeonRuntimeContextV2({
      relationship: null,
      recentMessages: [
        { messageId: 'u1', role: 'user', text: '안녕하세요.' },
        { messageId: 'a2', role: 'assistant', text: first.utterance },
        { messageId: 'u3', role: 'user', text: '파이썬으로 프로그램을 작성해 보세요.' },
      ],
      retrievedMemories: [],
      integrityDecisions: [],
      governedPreflightApplied: true,
      disclosure: { decision: null, retrievedSources: [] },
    });
    const secondRunner = shadow(other, s.authority);
    const second = await secondRunner.runner.evaluateKnowledgeBoundary(other);
    expect(second.utterance).not.toBe(first.utterance);
  });
});
