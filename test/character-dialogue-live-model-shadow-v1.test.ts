import { describe, expect, it, vi } from 'vitest';
import { CHARACTER_RUNTIME_AUTHORING_V1 } from
  '../packages/character-content/src/runtime-authoring-v1.js';
import type { CharacterRuntimeContextV1 } from
  '../packages/domain/src/character-runtime-context.js';
import {
  composeCharacterDialogueContinuityPlanShadowV1,
  type CharacterDialogueMessageShadowV1,
} from '../packages/domain/src/character-dialogue-continuity-shadow-v1.js';
import type { PostgresSubjectExecutionScopeV1 } from
  '../apps/api/src/postgres-subject-execution.js';
import type { SeyeonStructuredProviderRequestV2 } from
  '../apps/api/src/seyeon-character-runtime-v2.js';
import {
  createCharacterDialogueLiveModelStageAdaptersShadowV1,
  createCharacterDialogueLiveOpenAiStageAdaptersShadowV1,
  runCharacterDialogueLiveModelShadowV1,
} from '../apps/api/src/character-dialogue-live-model-shadow-v1.js';
import { runCharacterDialogueMultiturnOfflineShadowV1 } from
  '../apps/api/src/character-dialogue-multiturn-offline-shadow-v1.js';

const subjectId = '11111111-1111-4111-8111-111111111111';
const threadId = '22222222-2222-4222-8222-222222222222';
const bundleId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const releaseId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const conversation: readonly CharacterDialogueMessageShadowV1[] = [
  { messageId: '33333333-3333-4333-8333-333333333333', role: 'user', text: '제 의견이 맞다고 생각하세요?' },
  { messageId: '44444444-4444-4444-8444-444444444444', role: 'assistant', text: '그 생각은 좀 다르게 보고 있어요.' },
  { messageId: '55555555-5555-4555-8555-555555555555', role: 'user', text: '왜 그런 생각을 하셨나요?' },
];

function fixture(characterId: string, badReview = false) {
  const authored = CHARACTER_RUNTIME_AUTHORING_V1.find((c) => c.characterId === characterId);
  if (!authored) throw new TypeError('test authoring missing');
  const runtime = {
    schemaVersion: 'v1',
    characterId,
    contentBundleId: bundleId,
    contentVersion: 'test-content-v1',
    speech: authored.speech,
    persona: authored.persona,
    behavior: authored.behavior,
    rendererPolicy: { allowedEmotionIds: ['neutral'], allowedAnimationCueIds: [] },
    memories: [], lifeFacts: [], saju: null,
    recentMessages: conversation.map((m) => m.text),
  } as unknown as CharacterRuntimeContextV1;
  const query = vi.fn(async (_sql: string, _params?: readonly unknown[]) => ({
    rows: [{
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
        bodyText: m.text, redacted: false,
      })),
    }],
  }));
  const scope = {
    resolvedSubject: { subjectId, subjectKind: 'member' },
    client: { query },
  } as unknown as PostgresSubjectExecutionScopeV1;
  const generated = vi.fn(async (request: SeyeonStructuredProviderRequestV2) => {
    expect(request.purpose).toBe('turn_interpret_render_shadow');
    const source = request.input as Record<string, any>;
    expect(source.selectedCharacterId).toBe(characterId);
    const profile = source.publicDecisionProfile;
    expect(profile.behaviorRules).not.toHaveLength(0);
    expect(profile.questionPriorities).toEqual(authored.behavior.questionPriorities);
    expect(source.boundedDialogue[1].text).toBe(conversation[1]!.text);
    const current = source.currentUserMessageRef;
    return {
      schemaVersion: 'character-multiturn-interpret-render-shadow-v1',
      decision: {
        schemaVersion: 'character-multiturn-decision-shadow-v1',
        characterId,
        currentUserMessageRef: current,
        noticeEvidenceRefs: [current, conversation[1]!.messageId],
        presentWant: '이전 입장을 유지할지 고민하고 근거를 말하고 싶다',
        tension: '다른 의견을 말하면서 상대의 의사도 존중해야 한다',
        chosenAction: 'state_a_reasoned_view',
        rationale: profile.behaviorRules[0].preferredResponse,
        memoryRefsUsed: [],
        disclosureLevel: 'public',
      },
      draft: {
        schemaVersion: 'character-multiturn-draft-shadow-v1',
        characterId,
        utterance: '제가 왜 다르게 보는지 제 생각을 조금 더 설명해 볼게요.',
        memoryRefsMentioned: [],
        privateSourceRefsMentioned: [],
        cosmetic: {
          schemaVersion: 'v1', emotion: 'neutral',
          memoryProposals: [], relationshipEventProposals: [], suggestedActions: [],
        },
      },
    };
  });
  const review = vi.fn(async (request: SeyeonStructuredProviderRequestV2) => {
    expect(request.purpose).toBe('semantic_review');
    const source = request.input as Record<string, any>;
    expect(source.selectedCharacterId).toBe(characterId);
    expect(source.reviewCriteria.length).toBeGreaterThan(3);
    return {
      schemaVersion: 'character-multiturn-semantic-review-shadow-v1',
      characterId,
      reviewedUtteranceHash: source.utteranceHash,
      reviewedDecisionHash: source.decisionHash,
      failureCodes: badReview ? ['CHARACTER_VOICE_COLLAPSE'] : [],
      evidence: badReview ? [{
        code: 'CHARACTER_VOICE_COLLAPSE',
        excerpt: '모든 캐릭터의 같은 답변',
        reason: '이 상황의 고유 가치·행동이 실제 대사에 나타나지 않음',
      }] : [],
    };
  });
  const providers = createCharacterDialogueLiveModelStageAdaptersShadowV1({
    generator: { providerKey: 'openai-responses', modelKey: 'generator-model', generate: generated },
    semanticReviewer: { providerKey: 'openai-responses', modelKey: 'review-model', generate: review },
  });
  return { runtime, scope, query, generated, review, providers };
}

describe('common C1 live structured LLM boundary (network-fake only)', () => {
  it.each(CHARACTER_RUNTIME_AUTHORING_V1.map((c) => c.characterId))(
    '%s has one shared generation and one independent review with its own public behavior inputs',
    async (id) => {
      const f = fixture(id);
      const result = await runCharacterDialogueMultiturnOfflineShadowV1({
        runtime: f.runtime, scope: f.scope, threadId,
        recentConversation: conversation,
        ...f.providers,
      });
      expect(result.characterId).toBe(id);
      expect(result.mayReveal).toBe(false);
      expect(result.mayCommit).toBe(false);
      expect(f.generated).toHaveBeenCalledOnce();
      expect(f.review).toHaveBeenCalledOnce();
      expect(f.query).toHaveBeenCalledTimes(4);
      expect(result.decision.rationale)
        .toBe(f.runtime.behavior.rules[0]!.preferredResponse);
      const generativeRequest = f.generated.mock.calls[0]![0];
      expect(generativeRequest.instructions).toContain('character');
      expect(JSON.stringify(generativeRequest.input)).not.toContain('hiddenMotivation');
      expect((generativeRequest.responseSchema as Record<string, any>)
        .properties.decision.properties.noticeEvidenceRefs.items.enum)
        .toContain(conversation[1]!.messageId);
    },
  );

  it('independent reviewer rejection blocks the generated utterance', async () => {
    const f = fixture('seorin', true);
    await expect(runCharacterDialogueMultiturnOfflineShadowV1({
      runtime: f.runtime, scope: f.scope, threadId,
      recentConversation: conversation,
      ...f.providers,
    })).rejects.toThrow('CHARACTER_MULTITURN_OFFLINE_SHADOW_REJECTED');
    expect(f.generated).toHaveBeenCalledOnce();
    expect(f.review).toHaveBeenCalledOnce();
    expect(f.query).toHaveBeenCalledTimes(3);
  });

  it('requires distinct reviewer identity and no pending draft may be replayed', async () => {
    const f = fixture('yeoul');
    const plan = composeCharacterDialogueContinuityPlanShadowV1({
      voice: f.runtime, recentConversation: conversation,
    });
    const rawDecision = await f.providers.decider.decide({
      plan, conversation, allowedEmotionIds: ['neutral'],
    });
    const draft = await f.providers.renderer.render({
      plan, conversation,
      decision: rawDecision as any,
    });
    expect((draft as Record<string, unknown>).characterId).toBe('yeoul');
    await expect(Promise.resolve().then(() => f.providers.renderer.render({
      plan, conversation, decision: rawDecision as any,
    }))).rejects.toThrow('CHARACTER_DIALOGUE_LIVE_MODEL_SHADOW_HOLD');
    expect(f.review).not.toHaveBeenCalled();
    expect(() => createCharacterDialogueLiveModelStageAdaptersShadowV1({
      generator: { providerKey: 'x', modelKey: 'same', generate: f.generated },
      semanticReviewer: { providerKey: 'x', modelKey: 'same', generate: f.review },
    })).toThrow('CHARACTER_DIALOGUE_LIVE_MODEL_SHADOW_HOLD');
  });

  it('constructing the existing metered OpenAI transport never dispatches; without admission/outcome it fails', () => {
    const fakeFetch = vi.fn(async (): Promise<Response> => {
      throw new Error('unexpected network dispatch');
    });
    const base = {
      apiKey: 'test-only-not-a-real-secret-abcdef',
      maxOutputTokens: 384,
      fetchImpl: fakeFetch,
    };
    expect(() => createCharacterDialogueLiveOpenAiStageAdaptersShadowV1({
      generator: { ...base, model: 'generator-model' },
      semanticReviewer: { ...base, model: 'review-model' },
    })).toThrow('CHARACTER_DIALOGUE_LIVE_MODEL_SHADOW_HOLD');
    const beforeDispatch = vi.fn(async () => {});
    const meteredAfterOutcome = vi.fn(async () => {});
    const connected = createCharacterDialogueLiveOpenAiStageAdaptersShadowV1({
      generator: { ...base, model: 'generator-model', beforeDispatch, meteredAfterOutcome },
      semanticReviewer: { ...base, model: 'review-model', beforeDispatch, meteredAfterOutcome },
    });
    expect(connected.decider.modelKey).toBe('generator-model');
    expect(connected.reviewer.modelKey).toBe('review-model');
    expect(fakeFetch).not.toHaveBeenCalled();
    expect(beforeDispatch).not.toHaveBeenCalled();
  });
});

describe('existing real OpenAI Responses transport integration, with intercepted network', () => {
  it('performs one combined generation POST and one independent review POST only after admission', async () => {
    const f = fixture('seorin');
    const admission: string[] = [];
    const outcomes: string[] = [];
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit): Promise<Response> => {
      const body = JSON.parse(String(init.body)) as Record<string, any>;
      const purpose = String(body.text.format.name).includes('turn_interpret_render_shadow')
        ? 'turn_interpret_render_shadow' : 'semantic_review';
      const modelInput = JSON.parse(body.input[0].content[0].text);
      expect(admission).toContain(body.model);
      expect(body.store).toBe(false);
      expect(body.text.format.strict).toBe(true);
      const generateRequest: SeyeonStructuredProviderRequestV2 = {
        contractVersion: 'seyeon-structured-provider-v2',
        purpose,
        instructions: body.instructions,
        input: modelInput,
        responseSchema: body.text.format.schema,
      };
      const output = purpose === 'turn_interpret_render_shadow'
        ? await f.generated(generateRequest)
        : await f.review(generateRequest);
      return new Response(JSON.stringify({
        status: 'completed',
        output: [{
          type: 'message',
          content: [{ type: 'output_text', text: JSON.stringify(output) }],
        }],
        usage: {
          input_tokens: 160,
          output_tokens: 80,
          input_tokens_details: { cached_tokens: 0 },
          output_tokens_details: { reasoning_tokens: 0 },
        },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    const beforeDispatch = vi.fn(async (meta: { modelKey: string }) => {
      admission.push(meta.modelKey);
    });
    const meteredAfterOutcome = vi.fn(async (metric: { modelKey: string; outcome: string }) => {
      expect(metric.outcome).toBe('response_received');
      outcomes.push(metric.modelKey);
    });
    const candidate = await runCharacterDialogueLiveModelShadowV1({
      runtime: f.runtime, scope: f.scope,
      threadId, recentConversation: conversation,
      generator: {
        apiKey: 'only-a-test-credential-never-sent',
        model: 'generator-model',
        fetchImpl, beforeDispatch, meteredAfterOutcome,
        maxOutputTokens: 1024,
      },
      semanticReviewer: {
        apiKey: 'only-a-test-credential-never-sent',
        model: 'review-model',
        fetchImpl, beforeDispatch, meteredAfterOutcome,
        maxOutputTokens: 1024,
      },
    });
    expect(candidate.mayCommit).toBe(false);
    expect(candidate.mayReveal).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(beforeDispatch).toHaveBeenCalledTimes(2);
    expect(meteredAfterOutcome).toHaveBeenCalledTimes(2);
    expect(admission).toEqual(['generator-model', 'review-model']);
    expect(outcomes).toEqual(['generator-model', 'review-model']);
    expect(f.query).toHaveBeenCalledTimes(4);
  });
});
