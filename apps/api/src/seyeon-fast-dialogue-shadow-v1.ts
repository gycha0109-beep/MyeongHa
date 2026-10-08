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
export type SeyeonFastDialogueShadowStageFailureCodeV1 =
  | 'FAST_INTERPRETATION_GUARD_REJECTED'
  | 'FAST_RISK_CAUSALITY_REJECTED'
  | 'FAST_RENDERER_PACKET_REJECTED'
  | 'FAST_RENDERER_GUARD_REJECTED'
  | 'FAST_SEMANTIC_OUTPUT_REJECTED';

/** Fixed stage codes only: never copy generated text or private context into logs. */
export class SeyeonFastDialogueShadowStageErrorV1 extends Error {
  constructor(readonly code: SeyeonFastDialogueShadowStageFailureCodeV1) {
    super('Fast-dialogue Shadow server guard rejected stage: ' + code);
    this.name = 'SeyeonFastDialogueShadowStageErrorV1';
  }
}

function admitStage<T>(code: SeyeonFastDialogueShadowStageFailureCodeV1, run: () => T): T {
  try {
    return run();
  } catch {
    throw new SeyeonFastDialogueShadowStageErrorV1(code);
  }
}


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
          'Public first contact only: interpretation.reveal.level MUST be public; reveal.triggerRef MUST be null; reveal.supportingHistoryRefs and memoryRefsUsed MUST be empty. Never choose self_disclose, remember_naturally, jealousy, over-care, or relationship escalation.',
          'Choose action and expression only from allowedInterpretationVocabulary in the input. Notice evidenceRefs may cite only recent user message IDs provided; never invent references.',
          'For low_intensity_state_share, choose action approach, activate, tease, or invite. Choose baseline or playful expression so the server first-contact emotion clamp cannot make the draft inconsistent.',
          'For asked_seyeon_current_want, immediateWant.key MUST equal disclose_desire and action must be approach, activate, or invite. State Se-yeon present moment want directly; do not imply stable personal history.',
          'For stated_conversation_pace, choose approach with a concise self-contained Se-yeon stance. For asked_conversation_boundary, choose admit_boundary with one character-owned boundary, not a permission menu.',
          'Draft MUST use polite natural Korean, must satisfy the selected guarded action without inventing Canon, shared user experiences, relationship closeness, or facts about the user. No generic therapy, rest advice, or pointless option lists.',
          'Keep interpretation.expressionState baseline or playful and draft.expressionState exactly the same. Draft.revealLevel MUST be public. Draft memoryRefsMentioned, privateSourceRefsMentioned, and disclosureSliceIds MUST be empty.',

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
      const interpretation = admitStage('FAST_INTERPRETATION_GUARD_REJECTED', () =>
        guardSeyeonTurnInterpretationV2({
          rawOutput: obj.interpretation,
          context,
        }));
      const riskCausality = admitStage('FAST_RISK_CAUSALITY_REJECTED', () =>
        guardSeyeonRiskBearingActionCausalityV1({
          context,
          interpretation,
        }));
      const packet = admitStage('FAST_RENDERER_PACKET_REJECTED', () =>
        buildSeyeonRendererPacketV2({
          context,
          interpretation,
          riskCausality,
        }));
      const draft = admitStage('FAST_RENDERER_GUARD_REJECTED', () =>
        admitSeyeonRendererDraftV2({
          rawOutput: obj.draft,
          packet,
        }));
      const review: unknown = await input.reviewerProvider.generate(
        buildSeyeonSemanticReviewRequestV2({
          packet,
          rendererDraft: draft,
          utteranceHash: hashSeyeonRendererUtteranceV2(draft.utterance),
        }),
      );
      const envelope = admitStage('FAST_SEMANTIC_OUTPUT_REJECTED', () =>
        guardSeyeonRendererOutputV2({
          rawOutput: draft,
          packet,
          semanticReview: review,
        }));
      return Object.freeze({
        version: SEYEON_FAST_DIALOGUE_SHADOW_VERSION_V1,
        scope: 'SHADOW_ONLY_NOT_PRODUCTION' as const,
        interpretation,
        envelope,
      });
    },
  });
}
