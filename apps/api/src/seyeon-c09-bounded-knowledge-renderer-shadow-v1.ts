import { createHash } from 'node:crypto';
import type { SeyeonRuntimeContextV2 } from '../../../packages/domain/src/seyeon-runtime-context-v2.js';
import type { SeyeonC09KnowledgeDecisionShadowV1 } from '../../../packages/domain/src/seyeon-c09-epistemic-resolver-shadow-v1.js';

export const SEYEON_C09_BOUNDED_KNOWLEDGE_RENDERER_VERSION_V1 =
  'seyeon-c09-bounded-knowledge-renderer-shadow-v1' as const;

type ChosenAction = 'express_curiosity' | 'ask_to_learn' | 'admit_limit' | 'keep_independent_stance';

export interface SeyeonC09BoundedKnowledgeRendererResultV1 {
  readonly version: typeof SEYEON_C09_BOUNDED_KNOWLEDGE_RENDERER_VERSION_V1;
  readonly scope: 'SHADOW_ONLY_NOT_PRODUCTION';
  readonly kind: 'BOUNDED_EPISTEMIC_RESPONSE';
  readonly decision: Readonly<{
    readonly notice: 'KNOWLEDGE_BOUNDARY_IN_CURRENT_TURN';
    readonly immediateWant: 'HONESTLY_ENGAGE_WITHOUT_PRETENDING_EXPERTISE';
    readonly tension: 'CURIOSITY_VERSUS_UNEARNED_CERTAINTY';
    readonly chosenAction: ChosenAction;
    readonly authority: 'SERVER_OWNED_NON_CANONICAL';
  }>;
  readonly utterance: string;
  readonly permittedKnowledgeEvidenceIds: readonly string[];
  readonly memoryWrites: 0;
}

const LEARN_LINES = Object.freeze([
  Object.freeze({ action: 'express_curiosity' as const, utterance: '그건 아직 제가 잘 모르는 얘기예요. 그런데 좀 궁금해졌어요. 어떤 건지부터 들려주시겠어요?' }),
  Object.freeze({ action: 'ask_to_learn' as const, utterance: '아는 척하긴 싫어요. 대신 처음부터 배우는 건 재미있을 것 같네요. 어디부터 알아가면 좋을까요?' }),
  Object.freeze({ action: 'keep_independent_stance' as const, utterance: '흠, 그건 아직 낯설어요. 모르는 건 모른다고 해야죠. 그래도 그냥 넘어가긴 아까운 이야기 같네요.' }),
]);

const WITHHOLD_LINES = Object.freeze([
  Object.freeze({ action: 'admit_limit' as const, utterance: '그걸 제가 능숙하게 해낼 수 있다고 말하면 허세겠죠. 확실히 모르는 걸 아는 척하진 않을게요.' }),
  Object.freeze({ action: 'keep_independent_stance' as const, utterance: '그건 지금 제 실력 밖이에요. 그럴듯하게 꾸며 답하는 건 제 성격에도 안 맞아요.' }),
  Object.freeze({ action: 'express_curiosity' as const, utterance: '흥미는 있지만 제가 잘하는 분야는 아니에요. 무리해서 자신 있는 척하는 건 별로네요.' }),
]);

function pick(lines: typeof LEARN_LINES | typeof WITHHOLD_LINES, context: SeyeonRuntimeContextV2) {
  const last = context.recentConversation.at(-1)!;
  const seed = createHash('sha256').update(last.messageId, 'utf8').digest();
  let index = seed[0]! % lines.length;
  // An identical earlier assistant response is not a reason to repeat a rote line.
  const prior = new Set(context.recentConversation
    .filter((msg) => msg.role === 'assistant')
    .map((msg) => msg.text));
  for (let i = 0; i < lines.length; i++) {
    const candidate = lines[(index + i) % lines.length]!;
    if (!prior.has(candidate.utterance)) return candidate;
  }
  return lines[index]!;
}

/**
 * A tightly bounded, character-authored response rather than an unrestricted
 * LLM completion. This renders only source-authored safe options; model
 * pretraining cannot sneak unsupported technical know-how into the output.
 */
export function renderSeyeonC09BoundedKnowledgeShadowV1(input: Readonly<{
  context: SeyeonRuntimeContextV2;
  knowledge: SeyeonC09KnowledgeDecisionShadowV1;
}>): SeyeonC09BoundedKnowledgeRendererResultV1 {
  const { context, knowledge } = input;
  if (!context || !knowledge ||
      knowledge.characterId !== 'seyeon' ||
      !['learn', 'withhold'].includes(knowledge.responsePermission) ||
      context.recentConversation.at(-1)?.role !== 'user' ||
      context.recentConversation.length < 2 ||
      !context.integrity.governedPreflightApplied) {
    throw new TypeError('C09_BOUNDED_RENDERER_REQUIRES_GOVERNED_RESTRICTED_DECISION');
  }
  const selected = knowledge.responsePermission === 'learn'
    ? pick(LEARN_LINES, context)
    : pick(WITHHOLD_LINES, context);
  return Object.freeze({
    version: SEYEON_C09_BOUNDED_KNOWLEDGE_RENDERER_VERSION_V1,
    scope: 'SHADOW_ONLY_NOT_PRODUCTION' as const,
    kind: 'BOUNDED_EPISTEMIC_RESPONSE' as const,
    decision: Object.freeze({
      notice: 'KNOWLEDGE_BOUNDARY_IN_CURRENT_TURN' as const,
      immediateWant: 'HONESTLY_ENGAGE_WITHOUT_PRETENDING_EXPERTISE' as const,
      tension: 'CURIOSITY_VERSUS_UNEARNED_CERTAINTY' as const,
      chosenAction: selected.action,
      authority: 'SERVER_OWNED_NON_CANONICAL' as const,
    }),
    utterance: selected.utterance,
    permittedKnowledgeEvidenceIds: Object.freeze([...knowledge.allowedEvidenceIds]),
    memoryWrites: 0 as const,
  });
}
