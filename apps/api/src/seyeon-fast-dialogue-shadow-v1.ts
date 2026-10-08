import {
  buildSeyeonTurnInterpreterRequestV2,
  buildSeyeonSemanticReviewRequestV2,
  RENDERER_RESPONSE_SCHEMA_V2,
  TURN_INTERPRETATION_RESPONSE_SCHEMA_V2,
  type SeyeonStructuredProviderPortV2,
} from './seyeon-character-runtime-v2.js';
import {
  admitSeyeonRendererDraftV2,
  buildSeyeonRendererPacketV2,
  guardSeyeonRendererOutputV2,
  guardSeyeonRiskBearingActionCausalityV1,
  guardSeyeonTurnInterpretationV2,
  hashSeyeonRendererUtteranceV2,
  type SeyeonRuntimeContextV2,
} from '../../../packages/domain/src/index.js';

export const SEYEON_FAST_DIALOGUE_SHADOW_VERSION_V1 =
  'seyeon-fast-dialogue-shadow-v1' as const;

export const SEYEON_FAST_DIALOGUE_SHADOW_RESPONSE_SCHEMA_V1 = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['interpretation', 'draft'],
  properties: Object.freeze({
    interpretation: TURN_INTERPRETATION_RESPONSE_SCHEMA_V2,
    draft: RENDERER_RESPONSE_SCHEMA_V2,
  }),
});

/**
 * Offline, opt-in candidate: one model request for interpretation + draft,
 * followed by the existing independent semantic reviewer and server guards.
 * Does NOT persist, send, update canon/memory, or switch production routing.
 */
export function createSeyeonFastDialogueShadowV1(input: {
  readonly candidateProvider: SeyeonStructuredProviderPortV2;
  readonly reviewerProvider: SeyeonStructuredProviderPortV2;
}) {
  return Object.freeze({
    async evaluate(context: SeyeonRuntimeContextV2) {
      // Eligibility is intentionally stricter than future general-chat routing.
      if (context.character.characterId !== 'seyeon' ||
          !context.integrity.governedPreflightApplied ||
          context.integrity.decisions.length !== 0 ||
          context.disclosure.decision !== null ||
          context.disclosure.retrievedSources.length !== 0 ||
          context.retrievedMemories.length !== 0 ||
          context.relationship !== null ||
          context.relationshipSemantics !== null) {
        throw new TypeError('Fast-dialogue Shadow requires a governed, public, first-contact ordinary turn.');
      }
      const request = buildSeyeonTurnInterpreterRequestV2(context);
      const raw: unknown = await input.candidateProvider.generate({
        contractVersion: 'seyeon-structured-provider-v2',
        purpose: 'turn_interpret_render_shadow',
        instructions: [
          request.instructions,
          'Produce interpretation and draft in one structured response. The server validates interpretation and causal eligibility AFTER your response.',
          'The draft is a proposed Korean polite utterance, NOT a verified conversation response.',
          'Keep expressionState and revealLevel of draft equal to interpretation.expressionState and interpretation.reveal.level.',
          'Do not disclose private source content, use memory refs, invent biographical history, assert user actions, or escalate jealousy, vulnerability or intimacy.',
          'The independent semantic reviewer and all server guards may reject this candidate. No output is authoritative.',
        ].join('\n'),
        input: request.input,
        responseSchema: SEYEON_FAST_DIALOGUE_SHADOW_RESPONSE_SCHEMA_V1,
      });
      if (typeof raw !== 'object' || raw === null || Array.isArray(raw) ||
          Object.keys(raw).length !== 2 ||
          !Object.hasOwn(raw, 'interpretation') || !Object.hasOwn(raw, 'draft')) {
        throw new TypeError('Fast-dialogue Shadow returned an invalid outer response.');
      }
      const obj = raw as Record<string, unknown>;
      const interpretation = guardSeyeonTurnInterpretationV2({
        rawOutput: obj.interpretation,
        context,
      });
      const riskCausality = guardSeyeonRiskBearingActionCausalityV1({
        context,
        interpretation,
      });
      const packet = buildSeyeonRendererPacketV2({
        context,
        interpretation,
        riskCausality,
      });
      const draft = admitSeyeonRendererDraftV2({
        rawOutput: obj.draft,
        packet,
      });
      const review: unknown = await input.reviewerProvider.generate(
        buildSeyeonSemanticReviewRequestV2({
          packet,
          rendererDraft: draft,
          utteranceHash: hashSeyeonRendererUtteranceV2(draft.utterance),
        }),
      );
      const envelope = guardSeyeonRendererOutputV2({
        rawOutput: draft,
        packet,
        semanticReview: review,
      });
      return Object.freeze({
        version: SEYEON_FAST_DIALOGUE_SHADOW_VERSION_V1,
        scope: 'SHADOW_ONLY_NOT_PRODUCTION' as const,
        interpretation,
        envelope,
      });
    },
  });
}
