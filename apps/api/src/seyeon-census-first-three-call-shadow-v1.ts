import {
  assembleSeyeonRuntimeContextV2,
} from '../../../packages/domain/src/index.js';
import {
  runCharacterGovernedPreflightV1,
} from './character-governed-preflight-v1.js';
import {
  createSeyeonUnifiedGovernanceCandidateV1,
} from './seyeon-unified-governance-candidate-v1.js';
import {
  createSeyeonFastDialogueShadowV1,
  requireAuthoritativeFirstTurnCensusShadowV1,
  SeyeonFastDialogueShadowStageErrorV1,
  type SeyeonFullThreadCensusShadowPortV1,
} from './seyeon-fast-dialogue-shadow-v1.js';
import type {
  RunSeyeonCharacterTurnV2Input,
  SeyeonStructuredProviderPortV2,
} from './seyeon-character-runtime-v2.js';

export const SEYEON_CENSUS_FIRST_THREE_CALL_SHADOW_VERSION_V1 =
  'seyeon-census-first-three-call-shadow-v1' as const;

/**
 * Pure opt-in Shadow orchestration. No production endpoint uses it.
 * The first full-thread census is mandatory BEFORE even the first
 * AI preflight classification. A second census is performed by the
 * existing fast-dialogue guard BEFORE the second model request.
 * A third census runs immediately before the independent semantic review;
 * a fourth runs after review and output guards, before returning the Shadow
 * result. Sensitive preflight stops BEFORE Source Descriptor/fact lookup.
 *
 * No census read pins a transaction, grants memory access, or
 * guarantees safety against changes after the final read. No fallback,
 * persistence, replay or model-network adapter is installed.
 */
export async function runSeyeonCensusFirstThreeCallShadowV1(input: Readonly<{
  userMessageRef: string;
  userText: string;
  contextInput: RunSeyeonCharacterTurnV2Input['contextInput'];
  governance: RunSeyeonCharacterTurnV2Input['governance'];
  fullThreadCensus: SeyeonFullThreadCensusShadowPortV1;
  unifiedPreflightProvider: SeyeonStructuredProviderPortV2;
  candidateDialogueProvider: SeyeonStructuredProviderPortV2;
  independentSemanticReviewer: SeyeonStructuredProviderPortV2;
  /** Optional evaluation-only compact instructions; never selected by default. */
  promptProfile?: 'baseline' | 'compact_v1';
}>) {
  const messages = input.contextInput?.recentMessages;
  const current = Array.isArray(messages) && messages.length === 1
    ? messages[0] : undefined;
  if (!current || current.role !== 'user' ||
      current.messageId !== input.userMessageRef ||
      current.text !== input.userText ||
      input.contextInput.relationship !== null ||
      !Array.isArray(input.contextInput.retrievedMemories) ||
      input.contextInput.retrievedMemories.length !== 0 ||
      input.governance.relationship.gate !== 'PUBLIC' ||
      input.userText.trim().length === 0 ||
      input.userText.length > 4000) {
    throw new TypeError('Census-first Shadow requires one exact public user turn with no relationship or memories.');
  }

  // Important: this is BEFORE creating/invoking the unified provider.
  // Missing/mismatched/unavailable census => zero provider calls.
  await requireAuthoritativeFirstTurnCensusShadowV1({
    port: input.fullThreadCensus,
    currentUserMessageId: input.userMessageRef,
  });

  const governance = createSeyeonUnifiedGovernanceCandidateV1({
    governance: input.governance,
    provider: input.unifiedPreflightProvider,
  });
  const preflight = await runCharacterGovernedPreflightV1({
    characterId: 'seyeon',
    userMessageRef: input.userMessageRef,
    userText: input.userText,
    relationship: governance.relationship,
    integrity: governance.integrity,
    disclosure: governance.disclosure,
    // First-contact public Shadow has no G0 authority to read sensitive
    // Se-yeon source metadata or private facts. Refuse before even the
    // Source Descriptor lookup, not merely before dialogue generation.
    beforeSourceDescriptorRead: () => {
      throw new SeyeonFastDialogueShadowStageErrorV1(
        'FAST_SENSITIVE_PREFLIGHT_REJECTED',
      );
    },
  });

  const context = assembleSeyeonRuntimeContextV2({
    ...input.contextInput,
    integrityDecisions: preflight.integrity.decisions,
    governedPreflightApplied: true,
    disclosure: {
      decision: preflight.disclosure.status === 'sensitive'
        ? preflight.disclosure.decision
        : null,
      retrievedSources: preflight.retrievedPrivateSources,
    },
  });
  const result = await createSeyeonFastDialogueShadowV1({
    candidateProvider: input.candidateDialogueProvider,
    reviewerProvider: input.independentSemanticReviewer,
    fullThreadCensus: input.fullThreadCensus,
    ...(input.promptProfile === undefined ? {} : { promptProfile: input.promptProfile }),
  }).evaluate(context);
  return Object.freeze({
    version: SEYEON_CENSUS_FIRST_THREE_CALL_SHADOW_VERSION_V1,
    scope: 'SHADOW_ONLY_NOT_PRODUCTION' as const,
    preflight,
    context,
    interpretation: result.interpretation,
    envelope: result.envelope,
  });
}
