import { createHash } from 'node:crypto';
import {
  assembleSeyeonRuntimeContextV2,
  canonicalJson,
  type SeyeonRuntimeContextV2,
} from '../../../packages/domain/src/index.js';
import type {
  CharacterGovernedPreflightResultV1,
} from './character-governed-preflight-v1.js';
import {
  buildSeyeonTurnInterpreterRequestV2,
  type SeyeonStructuredProviderPortV2,
} from './seyeon-character-runtime-v2.js';
import {
  admitSeyeonOfflineS0ContextCandidateV1,
  type SeyeonOfflineS0ContextCandidateV1,
} from './seyeon-offline-s0-context-admission-v1.js';
import {
  auditSeyeonOfflineR2ProviderRequestV1,
} from './seyeon-offline-r2-provider-ingress-audit-v1.js';

/**
 * R2 evidence-only post-preflight gate: compares a *real* result from
 * runCharacterGovernedPreflightV1 with the actual native Working Context
 * immediately before the synthetic Interpreter. This gate cannot establish
 * signed Bible/source authority or verify unstructured hidden provenance.
 * NEVER use its verdict to enable a Production Provider or Reveal.
 */
export const SEYEON_OFFLINE_R2_POST_PREFLIGHT_CLOSURE_V1 =
  'seyeon-offline-r2-post-preflight-closure-v1' as const;

const HELD = Object.freeze({
  state: 'held' as const,
  permitsProductionProvider: false as const,
  permitsProductionReveal: false as const,
});

function same(a: unknown, b: unknown): boolean {
  try {
    return canonicalJson(a) === canonicalJson(b);
  } catch {
    return false;
  }
}

export function observeSeyeonOfflineR2PostPreflightClosureV1(input: Readonly<{
  candidate: SeyeonOfflineS0ContextCandidateV1;
  preflight: CharacterGovernedPreflightResultV1;
  actualContext: SeyeonRuntimeContextV2;
}>):
  | typeof HELD
  | Readonly<{
      state: 'post_preflight_context_observed_synthetic_only';
      contextDigest: string;
      interpreterRequestDigest: string;
      permitsProductionProvider: false;
      permitsProductionReveal: false;
    }> {
  try {
    const { candidate, preflight, actualContext } = input;
    if (admitSeyeonOfflineS0ContextCandidateV1(candidate).state !==
          'eligible_offline_synthetic_only' ||
        preflight?.schemaVersion !== 'character-governed-preflight-v1' ||
        preflight.integrity?.schemaVersion !== 'character-integrity-preflight-v1' ||
        preflight.integrity.characterId !== 'seyeon' ||
        preflight.integrity.userMessageRef !== candidate.currentUserMessage.messageId ||
        !Array.isArray(preflight.integrity.classification?.claims) ||
        preflight.integrity.classification.claims.length !== 0 ||
        !Array.isArray(preflight.integrity.decisions) ||
        preflight.integrity.decisions.length !== 0 ||
        preflight.disclosure?.schemaVersion !== 'character-disclosure-preflight-v2' ||
        preflight.disclosure.status !== 'not_sensitive' ||
        preflight.disclosure.classification?.topicKey !== null ||
        preflight.disclosure.source !== null ||
        preflight.disclosure.factAuthority !== null ||
        preflight.disclosure.decision !== null ||
        !Array.isArray(preflight.retrievedPrivateSources) ||
        preflight.retrievedPrivateSources.length !== 0) {
      return HELD;
    }

    // Deterministically reconstruct the canonical S0 context using ONLY the
    // originally selected turn and empty governed source channels. A legal
    // Preflight classification with a VERIFIED fact is still OUT OF SCOPE
    // until it has DB Owner provenance/Grant closure: therefore HOLD above.
    const expected = assembleSeyeonRuntimeContextV2({
      relationship: null,
      relationshipSemantics: null,
      recentMessages: candidate.finalContext.recentMessages,
      retrievedMemories: candidate.finalContext.retrievedMemories,
      integrityDecisions: [],
      governedPreflightApplied: true,
      disclosure: { decision: null, retrievedSources: [] },
      ...(candidate.finalContext.maxRetrievedMemories === undefined
        ? {} : { maxRetrievedMemories: candidate.finalContext.maxRetrievedMemories }),
    });
    if (!same(actualContext, expected)) return HELD;

    const nativeRequest = buildSeyeonTurnInterpreterRequestV2(actualContext);
    const audited = auditSeyeonOfflineR2ProviderRequestV1({
      candidate, request: nativeRequest,
    });
    if (audited.state !== 'observed_synthetic_only') return HELD;
    return Object.freeze({
      state: 'post_preflight_context_observed_synthetic_only' as const,
      contextDigest: 'sha256:v1:' + createHash('sha256')
        .update(canonicalJson({
          version: SEYEON_OFFLINE_R2_POST_PREFLIGHT_CLOSURE_V1,
          identity: candidate.identity,
          context: expected,
        })).digest('hex'),
      interpreterRequestDigest: audited.requestDigest,
      permitsProductionProvider: false as const,
      permitsProductionReveal: false as const,
    });
  } catch {
    return HELD;
  }
}

/**
 * An offline test harness which first confirms actual post-Preflight input
 * closure and ONLY THEN delegates to the existing synthetic model. It is
 * intentionally NOT installed in runSeyeonCharacterTurnV2 Production.
 */
export function createSeyeonOfflineR2PostPreflightSyntheticProviderV1(input: Readonly<{
  candidate: SeyeonOfflineS0ContextCandidateV1;
  preflight: CharacterGovernedPreflightResultV1;
  actualContext: SeyeonRuntimeContextV2;
  delegate: SeyeonStructuredProviderPortV2;
}>): SeyeonStructuredProviderPortV2 {
  const verdict = observeSeyeonOfflineR2PostPreflightClosureV1(input);
  return Object.freeze({
    providerKey: input.delegate.providerKey,
    modelKey: input.delegate.modelKey,
    generate(request) {
      if (verdict.state !== 'post_preflight_context_observed_synthetic_only' ||
          !same(request, buildSeyeonTurnInterpreterRequestV2(input.actualContext)) ||
          auditSeyeonOfflineR2ProviderRequestV1({
            candidate: input.candidate, request,
          }).state !== 'observed_synthetic_only') {
        throw new Error('Seyeon offline R2 post-Preflight source closure held');
      }
      return input.delegate.generate(request);
    },
  });
}
