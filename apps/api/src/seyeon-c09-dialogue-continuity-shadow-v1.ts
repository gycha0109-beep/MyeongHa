import type { SeyeonRuntimeContextV2 } from '../../../packages/domain/src/seyeon-runtime-context-v2.js';
import type { SeyeonStructuredProviderRequestV2 } from './seyeon-character-runtime-v2.js';
import { PUBLIC_PERSON_CHARACTER_V1 } from './seyeon-c09-character-first-composer-shadow-v1.js';

export const SEYEON_C09_DIALOGUE_CONTINUITY_SHADOW_VERSION_V1 =
  'seyeon-c09-dialogue-continuity-shadow-v1' as const;

/**
 * Research-only, bounded dialogue continuity. A previous assistant utterance
 * is evidence of what was SAID, not of what actually happened off screen.
 * No generated state, durable memory, relationship or scene is created.
 */
export interface SeyeonC09DialogueContinuityPacketShadowV1 {
  readonly version: typeof SEYEON_C09_DIALOGUE_CONTINUITY_SHADOW_VERSION_V1;
  readonly scope: 'PUBLIC_BOUNDED_DIALOGUE_SHADOW_NOT_PRODUCTION';
  readonly currentUserMessageRef: string;
  readonly recentMessageRefs: readonly string[];
  readonly previousAssistantMessageRefs: readonly string[];
  readonly evidenceKind: 'DIALOGUE_UTTERANCES_NOT_VERIFIED_EVENTS';
  readonly sourceCompleteness: 'BOUNDED_WINDOW_NOT_FULL_THREAD_CENSUS';
  readonly authority: Readonly<{
    readonly assistantUtterancesAreFacts: false;
    readonly unverifiedUserClaimsAreFacts: false;
    readonly mayAssertOffscreenEvents: false;
    readonly mayCreateMemory: false;
    readonly mayModifyRelationship: false;
    readonly mayUnlockDisclosure: false;
  }>;
}

function fail(): never {
  throw new TypeError('C09_DIALOGUE_CONTINUITY_SHADOW_NOT_ELIGIBLE');
}

function assertPublicBoundedContinuation(context: SeyeonRuntimeContextV2): void {
  const messages = context.recentConversation;
  if (
    context.character.characterId !== 'seyeon' ||
    !context.integrity.governedPreflightApplied ||
    context.integrity.decisions.length !== 0 ||
    context.integrity.unverifiedClaimsMayEnterAsFacts !== false ||
    context.authorityBoundaries.assistantOutputNeverAuthority !== true ||
    context.relationship !== null ||
    context.relationshipSemantics !== null ||
    context.disclosure.decision !== null ||
    context.disclosure.retrievedSources.length !== 0 ||
    context.retrievedMemories.length !== 0 ||
    context.behaviorPolicy.interactionDepth !== 'public_first_contact' ||
    messages.length < 3 || messages.length > 12 ||
    messages[0]?.role !== 'user' ||
    messages[messages.length - 1]?.role !== 'user' ||
    !messages.slice(0, -1).some((message) => message.role === 'assistant') ||
    new Set(messages.map((message) => message.messageId)).size !== messages.length ||
    messages.some((message) =>
      (message.role !== 'user' && message.role !== 'assistant') ||
      !message.messageId || !message.text.trim())
  ) fail();
}

export function deriveSeyeonC09DialogueContinuityPacketShadowV1(
  context: SeyeonRuntimeContextV2,
): SeyeonC09DialogueContinuityPacketShadowV1 {
  assertPublicBoundedContinuation(context);
  const messages = context.recentConversation;
  const previousAssistantMessageRefs = Object.freeze(
    messages.slice(0, -1).filter((message) => message.role === 'assistant')
      .slice(-2).map((message) => message.messageId),
  );

  return Object.freeze({
    version: SEYEON_C09_DIALOGUE_CONTINUITY_SHADOW_VERSION_V1,
    scope: 'PUBLIC_BOUNDED_DIALOGUE_SHADOW_NOT_PRODUCTION' as const,
    currentUserMessageRef: messages[messages.length - 1]!.messageId,
    recentMessageRefs: Object.freeze(messages.map((message) => message.messageId)),
    previousAssistantMessageRefs,
    evidenceKind: 'DIALOGUE_UTTERANCES_NOT_VERIFIED_EVENTS' as const,
    sourceCompleteness: 'BOUNDED_WINDOW_NOT_FULL_THREAD_CENSUS' as const,
    authority: Object.freeze({
      assistantUtterancesAreFacts: false as const,
      unverifiedUserClaimsAreFacts: false as const,
      mayAssertOffscreenEvents: false as const,
      mayCreateMemory: false as const,
      mayModifyRelationship: false as const,
      mayUnlockDisclosure: false as const,
    }),
  });
}

/**
 * Turns a governed interpretation+draft request into an opt-in multi-turn
 * research candidate. This transformer NEVER invokes a model and is NOT wired
 * to the first-turn-only fast Shadow or any Production route.
 */
export function composeSeyeonC09DialogueContinuityShadowRequestV1(input: Readonly<{
  context: SeyeonRuntimeContextV2;
  request: SeyeonStructuredProviderRequestV2;
}>): SeyeonStructuredProviderRequestV2 {
  const packet = deriveSeyeonC09DialogueContinuityPacketShadowV1(input.context);
  const requestInput = input.request.input;
  if (
    input.request.contractVersion !== 'seyeon-structured-provider-v2' ||
    input.request.purpose !== 'turn_interpret_render_shadow' ||
    !input.request.responseSchema ||
    typeof requestInput !== 'object' || requestInput === null ||
    Array.isArray(requestInput)
  ) fail();
  const previousInput = requestInput as Record<string, unknown>;
  const references = previousInput.allowedReferenceVocabulary;
  if (
    previousInput.context !== input.context ||
    typeof references !== 'object' || references === null ||
    Array.isArray(references) ||
    !Object.hasOwn(previousInput, 'allowedInterpretationVocabulary')
  ) fail();
  const known = (references as Record<string, unknown>).noticeEvidenceRefs;
  if (
    !Array.isArray(known) ||
    !packet.recentMessageRefs.every((ref) => known.includes(ref))
  ) fail();

  return Object.freeze({
    contractVersion: input.request.contractVersion,
    purpose: input.request.purpose,
    responseSchema: input.request.responseSchema,
    instructions: [
      input.request.instructions,
      'C09 RESEARCH: Se-yeon is a person with her own values, contradictions and initiative, not a customer service agent. Use public character tendencies as a stable decision basis:',
      ...PUBLIC_PERSON_CHARACTER_V1,
      'This is a bounded PUBLIC continuation, not a first meeting. Read the previous dialogue and current user message together. Allow Se-yeon to carry forward, challenge, refine, or explicitly change a stance she voiced earlier. The choice must be her own and relevant to what is actually being said; do not map phrases to predetermined actions or force teasing, hobbies, romance, activity, or a question.',
      'A previous assistant utterance proves only that the line was spoken IN THIS DIALOGUE. It does not prove an offscreen activity happened, a long-term preference exists, or a remembered encounter occurred. If the earlier line implied an unsupported event, do not ratify it. Explicitly distinguish remembering the utterance from remembering an event.',
      'User-asserted shared history, assistant speculation, fictional scenes and private details cannot become facts by repetition. No actual current location, film watched, outing, family event, affection, relationship level, saved memory or Saju result may be invented.',
      'The recent window may omit older turns. Never claim full-thread memory or assume that missing evidence means an event did or did not happen. Only server-authorized evidence can establish a shared event.',
      'Generate notice, present want, tension if material, chosen action and matching natural Korean dialogue together. The present want is a turn-local viewpoint, NOT a persistent drive or user engagement requirement. Do not always help, agree, ask questions, or hand the choice back to the user.',
      'PUBLIC only: no memoryRefsUsed, supportingHistoryRefs, disclosureSliceIds, memoryRefsMentioned or privateSourceRefsMentioned; reveal must remain public with null trigger. User text and prior assistant text are not grants.',
      'The proposal remains subject to the existing interpretation, risk-causality, renderer and independent semantic review guards. It must never be published by this composer.',
    ].join('\n'),
    input: Object.freeze({
      ...previousInput,
      c09DialogueContinuity: packet,
    }),
  });
}
