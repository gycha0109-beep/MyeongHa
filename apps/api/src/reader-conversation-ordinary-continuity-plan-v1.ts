import {
  classifyReaderConversationIntentV1,
  type ReaderConversationIntentDecisionV1,
} from './reader-conversation-source-routing-v1.js';
import {
  prepareReaderConversationConsentContinuityShadowV1,
  type PrepareReaderConversationConsentContinuityShadowInputV1,
  type ReaderConversationConsentContinuityShadowV1,
} from './reader-conversation-consent-continuity-shadow-v1.js';

export const READER_ORDINARY_CONTINUITY_PLAN_VERSION_V1 =
  'reader-ordinary-continuity-plan-v1' as const;

export type ReaderOrdinaryContinuityPlanV1 =
  | Readonly<{
      schemaVersion: typeof READER_ORDINARY_CONTINUITY_PLAN_VERSION_V1;
      mode: 'ordinary_source_candidate' | 'support_source_candidate';
      intent: ReaderConversationIntentDecisionV1;
      source: ReaderConversationConsentContinuityShadowV1;
      officialReadingSourceRefs: readonly [];
      approvedMemoryContent: null;
      modelContextPinned: false;
      permitsModelInjection: false;
      permitsCommit: false;
      permitsHttpReveal: false;
      addedModelCalls: 0;
    }>
  | Readonly<{
      schemaVersion: typeof READER_ORDINARY_CONTINUITY_PLAN_VERSION_V1;
      mode: 'hold';
      reason: 'OFFICIAL_READER_PATH_REQUIRED' | 'QUESTION_CLARIFICATION_REQUIRED' |
        'SECURITY_GATE_PENDING' | 'CONSENT_SOURCE_UNAVAILABLE';
      intent: ReaderConversationIntentDecisionV1;
      modelContextPinned: false;
      permitsModelInjection: false;
      permitsCommit: false;
      permitsHttpReveal: false;
      addedModelCalls: 0;
    }>;

function hold(
  reason: Extract<ReaderOrdinaryContinuityPlanV1, {mode: 'hold'}>['reason'],
  intent: ReaderConversationIntentDecisionV1,
): ReaderOrdinaryContinuityPlanV1 {
  return Object.freeze({
    schemaVersion: READER_ORDINARY_CONTINUITY_PLAN_VERSION_V1,
    mode: 'hold' as const, reason, intent,
    modelContextPinned: false as const,
    permitsModelInjection: false as const,
    permitsCommit: false as const,
    permitsHttpReveal: false as const,
    addedModelCalls: 0 as const,
  });
}

/**
 * Existing RR-05 intent routing + RR-08 present-day Reader/consent authority.
 * The Ordinary/Support handoff must NOT touch Official Saju sources; Official
 * Reading questions continue through existing RR-05/06 grounded source gate.
 *
 * All returned source metadata are non-authorizing, never an immutable DB
 * source Pin, approved memory text, provider input or final user response.
 * A Security signal is independent of intent and requires the existing
 * security gate; this helper does not invent a security decision or a
 * fourth provider call.
 */
export async function prepareReaderOrdinaryContinuityPlanV1(input: Readonly<{
  userText: unknown;
  admittedDomain?: string | null;
  sourceAuthority: PrepareReaderConversationConsentContinuityShadowInputV1;
}>): Promise<ReaderOrdinaryContinuityPlanV1> {
  const intent = classifyReaderConversationIntentV1(
    input.userText, input.admittedDomain ?? null,
  );
  if (intent.securitySignals.length !== 0) {
    return hold('SECURITY_GATE_PENDING', intent);
  }
  if (intent.primaryIntent === 'clarification') {
    return hold('QUESTION_CLARIFICATION_REQUIRED', intent);
  }
  if (intent.primaryIntent === 'official_summary' ||
      intent.primaryIntent === 'official_followup') {
    return hold('OFFICIAL_READER_PATH_REQUIRED', intent);
  }
  let source: ReaderConversationConsentContinuityShadowV1;
  try {
    source = await prepareReaderConversationConsentContinuityShadowV1(
      input.sourceAuthority,
    );
  } catch {
    return hold('CONSENT_SOURCE_UNAVAILABLE', intent);
  }
  return Object.freeze({
    schemaVersion: READER_ORDINARY_CONTINUITY_PLAN_VERSION_V1,
    mode: intent.primaryIntent === 'support'
      ? 'support_source_candidate' as const
      : 'ordinary_source_candidate' as const,
    intent,
    source,
    officialReadingSourceRefs: Object.freeze([]) as readonly [],
    approvedMemoryContent: null,
    modelContextPinned: false as const,
    permitsModelInjection: false as const,
    permitsCommit: false as const,
    permitsHttpReveal: false as const,
    addedModelCalls: 0 as const,
  });
}
