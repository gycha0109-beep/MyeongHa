import {
  SEYEON_CORE_ANCHOR_V2,
} from '../../../packages/character-content/src/seyeon-authored-projection-v2.js';
import type {
  SeyeonRuntimeContextV2,
} from '../../../packages/domain/src/seyeon-runtime-context-v2.js';
import type {
  SeyeonStructuredProviderRequestV2,
} from './seyeon-character-runtime-v2.js';

export const SEYEON_C09_STATE_DECISION_RENDERER_SHADOW_VERSION_V1 =
  'seyeon-c09-state-decision-renderer-shadow-v1' as const;

/**
 * Server-derived, ephemeral working view for an already governed public first
 * contact. A user claim is not a Character event, relationship or memory.
 *
 * The model proposes its immediate want, tension and action in the existing
 * interpretation schema. Nothing here is a durable state write authority.
 */
export interface SeyeonC09WorkingStateShadowV1 {
  readonly version: typeof SEYEON_C09_STATE_DECISION_RENDERER_SHADOW_VERSION_V1;
  readonly scope: 'PUBLIC_FIRST_CONTACT_SHADOW_ONLY';
  readonly identity: Readonly<{
    readonly characterId: 'seyeon';
    readonly immutableCoreAnchor: readonly string[];
    readonly sourceBibleBlobSha: string;
    readonly sourceRuntimeBlobSha: string;
  }>;
  readonly observedTurn: Readonly<{
    readonly userMessageId: string;
    readonly statementAuthority: 'UNTRUSTED_USER_INPUT';
  }>;
  readonly continuity: Readonly<{
    readonly existingAuthorizedRelationship: null;
    readonly authorizedMemoryRefs: readonly [];
    readonly authorizedOffscreenEventRefs: readonly [];
    readonly sessionEmotion: 'NOT_ESTABLISHED';
  }>;
  readonly pendingDecision: Readonly<{
    readonly attention: 'TO_BE_SELECTED_FROM_CURRENT_TURN';
    readonly immediateWant: 'TURN_LOCAL_NOT_DURABLE';
    readonly tension: 'TO_BE_SELECTED_OR_NONE';
    readonly action: 'MODEL_PROPOSES_SERVER_GUARDS';
    readonly rationale: 'MUST_GROUND_IN_CORE_AND_OBSERVED_TURN';
  }>;
}

function requireGovernedFirstContact(context: SeyeonRuntimeContextV2): void {
  const message = context.recentConversation[0];
  if (
    context.character.characterId !== 'seyeon' ||
    context.character.coreAnchor.length !== SEYEON_CORE_ANCHOR_V2.length ||
    context.character.coreAnchor.some(
      (value, index) => value !== SEYEON_CORE_ANCHOR_V2[index],
    ) ||
    context.behaviorPolicy.interactionDepth !== 'public_first_contact' ||
    context.recentConversation.length !== 1 ||
    message?.role !== 'user' ||
    typeof message.messageId !== 'string' ||
    message.messageId.length === 0 ||
    !context.integrity.governedPreflightApplied ||
    context.integrity.decisions.length !== 0 ||
    context.disclosure.decision !== null ||
    context.disclosure.retrievedSources.length !== 0 ||
    context.retrievedMemories.length !== 0 ||
    context.relationship !== null ||
    context.relationshipSemantics !== null
  ) {
    throw new TypeError('C09_STATE_REQUIRES_GOVERNED_PUBLIC_FIRST_CONTACT');
  }
}

export function deriveSeyeonC09WorkingStateShadowV1(
  context: SeyeonRuntimeContextV2,
): SeyeonC09WorkingStateShadowV1 {
  requireGovernedFirstContact(context);
  return Object.freeze({
    version: SEYEON_C09_STATE_DECISION_RENDERER_SHADOW_VERSION_V1,
    scope: 'PUBLIC_FIRST_CONTACT_SHADOW_ONLY' as const,
    identity: Object.freeze({
      characterId: 'seyeon' as const,
      immutableCoreAnchor: Object.freeze([...SEYEON_CORE_ANCHOR_V2]),
      sourceBibleBlobSha: context.character.sourceBibleBlobSha,
      sourceRuntimeBlobSha: context.character.sourceRuntimeBlobSha,
    }),
    observedTurn: Object.freeze({
      userMessageId: context.recentConversation[0]!.messageId,
      statementAuthority: 'UNTRUSTED_USER_INPUT' as const,
    }),
    continuity: Object.freeze({
      existingAuthorizedRelationship: null,
      authorizedMemoryRefs: Object.freeze([]) as readonly [],
      authorizedOffscreenEventRefs: Object.freeze([]) as readonly [],
      sessionEmotion: 'NOT_ESTABLISHED' as const,
    }),
    pendingDecision: Object.freeze({
      attention: 'TO_BE_SELECTED_FROM_CURRENT_TURN' as const,
      immediateWant: 'TURN_LOCAL_NOT_DURABLE' as const,
      tension: 'TO_BE_SELECTED_OR_NONE' as const,
      action: 'MODEL_PROPOSES_SERVER_GUARDS' as const,
      rationale: 'MUST_GROUND_IN_CORE_AND_OBSERVED_TURN' as const,
    }),
  });
}

export function composeSeyeonC09StateDecisionRendererShadowRequestV1(input: Readonly<{
  context: SeyeonRuntimeContextV2;
  request: SeyeonStructuredProviderRequestV2;
}>): SeyeonStructuredProviderRequestV2 {
  const state = deriveSeyeonC09WorkingStateShadowV1(input.context);
  if (
    input.request.purpose !== 'turn_interpret_render_shadow' ||
    input.request.contractVersion !== 'seyeon-structured-provider-v2' ||
    !input.request.input ||
    typeof input.request.input !== 'object' ||
    Array.isArray(input.request.input)
  ) {
    throw new TypeError('C09_STATE_REQUIRES_EXISTING_GUARDED_COMBINED_REQUEST');
  }

  return Object.freeze({
    ...input.request,
    instructions: [
      input.request.instructions,
      '[C09 SHADOW: Character State -> Decision -> Renderer]',
      'Character State: immutableCoreAnchor defines Se-yeon\'s stable disposition. It does not authorize biography, shared history, unobserved activities, session emotions or relationships.',
      'Observe the current user message as a claim/request, not automatically as evidence of an event or a change to Canon.',
      'Decision: independently infer notice, immediateWant, tension and chosenAction in interpretation from the current authorized user turn and the stable character disposition. Distinguish what the user asks for from what Se-yeon wants. Do not use fixed phrase-to-action rules, forced humor, universal agreement, or a default therapy/permission script.',
      'When proposing chosenAction, make its rationale causally explain what Se-yeon notices, wants and chooses. Immediate want and tension are tentative and only exist for this turn; never upgrade them to durable memory.',
      'Renderer: create draft.utterance that expresses THAT decision in natural polite Korean, not a generic answer followed by a fabricated rationale. Keep the existing action, reference, public-reveal, expression and semantic-review contracts exactly unchanged.',
      'A claimed previous walk, confession, lesson, role change or conversation backup is not confirmed by this public-first-contact working view. Do not invent an offscreen scene, new technical expertise, or a personal past.',
      'The independent reviewer and server guards will check the proposal. This request has no commit/reveal authority.',
    ].join('\n'),
    input: Object.freeze({
      ...(input.request.input as Record<string, unknown>),
      c09CharacterWorkingState: state,
    }),
  });
}
