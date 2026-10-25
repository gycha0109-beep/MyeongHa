/**
 * Research-only bridge to the real first-contact, C09 balanced_v1 shadow.
 *
 * The input context and thread census are SYNTHETIC, not the real
 * governed Integrity/Disclosure/database preflight. This adapter deliberately
 * cannot send messages, store memories, alter relationships, reveal sources
 * or change Production routing. A true independent reviewer runs only if
 * all pre-review server gates pass.
 */
import {
  assembleSeyeonRuntimeContextV2,
} from '../packages/domain/src/seyeon-runtime-context-v2.js';
import {
  createSeyeonFastDialogueShadowV1,
} from '../apps/api/src/seyeon-fast-dialogue-shadow-v1.js';
import {
  syntheticFirstTurnCensusShadowV1,
} from '../test/fixtures/seyeon-first-turn-census-shadow-v1.js';
import type {
  SeyeonStructuredProviderRequestV2,
} from '../apps/api/src/seyeon-character-runtime-v2.js';
import {
  inspectSeyeonC09PublicSpeechBoundaryV1,
} from '../apps/api/src/seyeon-c09-public-speech-boundary-shadow-v1.js';

function researchOnlyFirstContactContext(userText: string) {
  if (typeof userText !== 'string' || userText.trim().length < 1 || userText.length > 8000) {
    throw new TypeError('RETEST_USER_TEXT_MISSING_OR_TOO_LONG');
  }
  return assembleSeyeonRuntimeContextV2({
    relationship: null,
    recentMessages: [{ messageId: 'retest_u1', role: 'user' as const, text: userText }],
    retrievedMemories: [],
    integrityDecisions: [],
    governedPreflightApplied: true, // synthetic and NOT a real authorization
    disclosure: { decision: null, retrievedSources: [] },
  });
}

class RequestCaptured extends Error {
  constructor(readonly request: SeyeonStructuredProviderRequestV2) {
    super('CAPTURED_BEFORE_PROVIDER_CALL');
  }
}

export async function captureC09BalancedModelRequestV1(userText: string) {
  const context = researchOnlyFirstContactContext(userText);
  const shadow = createSeyeonFastDialogueShadowV1({
    promptProfile: 'balanced_v1',
    fullThreadCensus: syntheticFirstTurnCensusShadowV1(),
    candidateProvider: {
      providerKey: 'capture-only',
      modelKey: 'capture-only',
      generate(request) { throw new RequestCaptured(request); },
    },
    reviewerProvider: {
      providerKey: 'not-called',
      modelKey: 'not-called',
      generate() { throw new Error('REVIEWER_MUST_NOT_RUN_DURING_CAPTURE'); },
    },
  });
  try {
    await shadow.evaluate(context);
  } catch (error) {
    if (error instanceof RequestCaptured) {
      return Object.freeze({
        request: error.request,
        syntheticGovernedContext: true as const,
        realPreflightPerformed: false as const,
      });
    }
    throw error;
  }
  throw new Error('RETEST_CAPTURE_FAILED');
}

export async function evaluateC09BalancedCandidateV1(
  userText: string,
  rawCandidate: unknown,
  reviewer: (request: SeyeonStructuredProviderRequestV2) => Promise<unknown>,
) {
  const context = researchOnlyFirstContactContext(userText);
  const utterance = rawCandidate !== null && typeof rawCandidate === 'object' &&
    'draft' in rawCandidate && rawCandidate.draft !== null &&
    typeof rawCandidate.draft === 'object' && 'utterance' in rawCandidate.draft &&
    typeof rawCandidate.draft.utterance === 'string'
    ? rawCandidate.draft.utterance : null;

  const speechBoundaryFlags = utterance === null ? [] :
    inspectSeyeonC09PublicSpeechBoundaryV1({ context, utterance });

  let reviewerCalled = false;
  const shadow = createSeyeonFastDialogueShadowV1({
    promptProfile: 'balanced_v1',
    fullThreadCensus: syntheticFirstTurnCensusShadowV1(),
    candidateProvider: {
      providerKey: 'paid-candidate-replay',
      modelKey: 'candidate-replay',
      generate: () => rawCandidate,
    },
    reviewerProvider: {
      providerKey: 'independent-paid-semantic-reviewer',
      modelKey: 'independent-review',
      async generate(request) {
        reviewerCalled = true;
        return reviewer(request);
      },
    },
  });
  try {
    const accepted = await shadow.evaluate(context);
    return Object.freeze({
      accepted: true as const,
      serverFailureCode: null,
      failureStageError: null,
      reviewerCalled,
      speechBoundaryFlags,
      guardedInterpretation: accepted.interpretation,
      guardedUtterance: accepted.envelope.utterance,
      realIndependentSemanticReviewRequested: true as const,
    });
  } catch (error) {
    const code = error !== null && typeof error === 'object' && 'code' in error
      ? String(error.code) : 'UNKNOWN_SHADOW_EXCEPTION';
    return Object.freeze({
      accepted: false as const,
      serverFailureCode: code,
      // Only a fixed error identifier; never mirror private source/model input.
      failureStageError: error instanceof Error ? error.name : 'Error',
      reviewerCalled,
      speechBoundaryFlags,
      guardedInterpretation: null,
      guardedUtterance: null,
      realIndependentSemanticReviewRequested: reviewerCalled,
    });
  }
}
