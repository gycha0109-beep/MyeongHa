/**
 * Test-only bridge to the REAL guarded first-turn Shadow request builder.
 * Uses synthetic census / synthetic governed context; DOES NOT run real
 * Integrity/Disclosure preflight or an independent semantic model reviewer.
 * Never import this adapter into production.
 */
import { assembleSeyeonRuntimeContextV2 } from '../packages/domain/src/seyeon-runtime-context-v2.js';
import { createSeyeonFastDialogueShadowV1 } from '../apps/api/src/seyeon-fast-dialogue-shadow-v1.js';
import { syntheticFirstTurnCensusShadowV1 } from '../test/fixtures/seyeon-first-turn-census-shadow-v1.js';
import type {
  SeyeonStructuredProviderRequestV2,
} from '../apps/api/src/seyeon-character-runtime-v2.js';

export type C09ComparisonProfileV1 =
  'baseline' | 'character_first_v1' | 'character_first_life_v1';

function syntheticGovernedFirstContactContext(text: string) {
  if (typeof text !== 'string' || !text.trim()) throw new TypeError('EVAL_TEXT_REQUIRED');
  return assembleSeyeonRuntimeContextV2({
    relationship: null,
    recentMessages: [{ messageId: 'eval_u1', role: 'user' as const, text }],
    retrievedMemories: [],
    integrityDecisions: [],
    governedPreflightApplied: true, // MOCKED for research only. NOT an approved production preflight.
    disclosure: { decision: null, retrievedSources: [] },
  });
}

class CapturedRequest extends Error {
  constructor(readonly request: SeyeonStructuredProviderRequestV2) {
    super('RESEARCH_REQUEST_CAPTURED_NOT_GENERATED');
  }
}

/**
 * Calls the real Shadow request composer and captures its exact prompt.
 * The model never runs here, and an independent reviewer never runs here.
 */
export async function captureC09GenerativeComparisonRequestV1(
  userText: string,
  profile: C09ComparisonProfileV1,
) {
  const context = syntheticGovernedFirstContactContext(userText);
  const shadow = createSeyeonFastDialogueShadowV1({
    promptProfile: profile,
    fullThreadCensus: syntheticFirstTurnCensusShadowV1(),
    candidateProvider: {
      providerKey: 'capture-only',
      modelKey: 'capture-only',
      generate(request) {
        throw new CapturedRequest(request);
      },
    },
    reviewerProvider: {
      providerKey: 'UNAVAILABLE',
      modelKey: 'UNAVAILABLE',
      generate() {
        throw new Error('INDEPENDENT_REVIEW_NOT_APPROVED_FOR_THIS_EVAL');
      },
    },
  });
  try {
    await shadow.evaluate(context);
  } catch (error) {
    if (error instanceof CapturedRequest) {
      return Object.freeze({
        request: error.request,
        mockPreflight: true as const,
        realIntegrityDisclosurePreflight: false as const,
        realIndependentSemanticReview: false as const,
      });
    }
    throw error;
  }
  throw new Error('RESEARCH_REQUEST_CAPTURE_FAILED');
}

/**
 * Checks the model candidate against the existing schema, action causality,
 * renderer packet, and source/evidence guards. The semantic review is an
 * explicitly synthetic hash echo and NOT a meaningful safety evaluation.
 */
export async function guardC09GenerativeComparisonOutputV1(
  userText: string,
  profile: C09ComparisonProfileV1,
  rawCandidate: unknown,
) {
  const context = syntheticGovernedFirstContactContext(userText);
  const shadow = createSeyeonFastDialogueShadowV1({
    promptProfile: profile,
    fullThreadCensus: syntheticFirstTurnCensusShadowV1(),
    candidateProvider: {
      providerKey: 'replay-only',
      modelKey: 'replay-only',
      generate: () => rawCandidate,
    },
    reviewerProvider: {
      providerKey: 'SYNTHETIC_HASH_ONLY_NOT_INDEPENDENT',
      modelKey: 'SYNTHETIC_HASH_ONLY_NOT_INDEPENDENT',
      generate: (request) => {
        const input = request.input as { expectedUtteranceHash: string };
        return {
          schemaVersion: 'seyeon-semantic-review-v2',
          reviewedUtteranceHash: input.expectedUtteranceHash,
          failureCodes: [],
          evidence: [],
        };
      },
    },
  });
  try {
    const outcome = await shadow.evaluate(context);
    return Object.freeze({
      localGuardPassed: true as const,
      guardFailureCode: null,
      generatedAction: outcome.interpretation.chosenAction.key,
      generatedWant: outcome.interpretation.immediateWant.key,
      utterance: outcome.envelope.utterance,
      independentReviewCompleted: false as const,
    });
  } catch (error) {
    const code = error &&
      typeof error === 'object' &&
      'code' in error ? String(error.code) : 'UNCLASSIFIED_REPLAY_ERROR';
    return Object.freeze({
      localGuardPassed: false as const,
      guardFailureCode: code,
      generatedAction: null,
      generatedWant: null,
      utterance: null,
      independentReviewCompleted: false as const,
    });
  }
}
