import type { CharacterIntegrityDecisionV1 } from './character-integrity-gate-v1.js';
import type {
  SeyeonEventExtractionCandidateV2,
  SeyeonEventExtractionContextV2,
} from './seyeon-event-extraction-v2.js';
import {
  SEYEON_EVENT_LEDGER_SCHEMA_VERSION_V2,
  type SeyeonCharacterInterpretationV2,
  type SeyeonEventFactV2,
  type SeyeonExperimentalEventKindV2,
  type SeyeonRelationshipEventV2,
} from './seyeon-event-ledger-v2.js';
import type { SeyeonRiskActionCausalityDecisionV1 } from './seyeon-risk-action-causality-v1.js';

export const SEYEON_EVENT_AUTHORITY_VERSION_V1 =
  'seyeon-event-authority-v1' as const;
export const SEYEON_EVENT_AUTHORITY_MARKER_V1 =
  'experimental_event_admission_not_production_relationship_authority' as const;

export const SEYEON_EVENT_AUTHORITY_REASON_CODES_V1 = Object.freeze([
  'OBSERVED_CURRENT_TURN_INTERACTION',
  'VERIFIED_INTEGRITY_CLAIM',
  'GUARDED_CHARACTER_OUTPUT',
  'AUTHORIZED_CAUSAL_PREDECESSOR',
  'RISK_CAUSALITY_CONSISTENT',
  'USER_ASSERTION_NOT_TRUTH_AUTHORITY',
  'UNVERIFIED_CLAIM',
  'CONTRADICTED_CLAIM',
  'NON_AUTHORITATIVE_CLAIM',
  'AUTHORITY_REJECTED_CLAIM',
  'MISSING_VERIFIED_OUTCOME_AUTHORITY',
  'MISSING_SERVER_OBSERVATION_AUTHORITY',
  'CHARACTER_OUTPUT_MISMATCH',
  'MISSING_CAUSAL_PREDECESSOR',
  'RISK_CAUSALITY_MISMATCH',
] as const);

export type SeyeonEventAuthorityReasonCodeV1 =
  (typeof SEYEON_EVENT_AUTHORITY_REASON_CODES_V1)[number];

type EventCandidateV2 = Extract<
  SeyeonEventExtractionCandidateV2,
  { readonly decision: 'event' }
>;

export interface SeyeonEventAuthorityEvidenceV1 {
  readonly integrityDecisions: readonly CharacterIntegrityDecisionV1[];
  readonly serverObservationRefs?: readonly string[];
  readonly riskCausality?: SeyeonRiskActionCausalityDecisionV1 | null;
}

export interface SeyeonEventAuthorityDecisionV1 {
  readonly schemaVersion: typeof SEYEON_EVENT_AUTHORITY_VERSION_V1;
  readonly authority: typeof SEYEON_EVENT_AUTHORITY_MARKER_V1;
  readonly decision: 'ADMIT_EXPERIMENTAL' | 'REJECT';
  readonly eventKind: SeyeonExperimentalEventKindV2;
  readonly reasonCodes: readonly SeyeonEventAuthorityReasonCodeV1[];
  readonly evidence: Readonly<{
    readonly currentTurnId: string;
    readonly observedMessageRefs: readonly string[];
    readonly verifiedClaimIds: readonly string[];
    readonly authorityRefs: readonly string[];
    readonly causalPredecessorEventIds: readonly string[];
    readonly guardedCharacterOutputRef: string | null;
    readonly serverObservationRefs: readonly string[];
    readonly riskCausality: SeyeonRiskActionCausalityDecisionV1 | null;
  }>;
  readonly candidateSignal: Readonly<{
    readonly salience: number;
    readonly confidence: number;
  }>;
  readonly admittedFacts: readonly SeyeonEventFactV2[];
  readonly characterInterpretation: SeyeonCharacterInterpretationV2 | null;
  readonly constraints: Readonly<{
    readonly mayAppendExperimentalLedger: boolean;
    readonly mayAppendProductionRelationshipEvent: false;
    readonly mayMutateProductionRelationshipState: false;
    readonly mayCreateDurableMemory: false;
    readonly mayGrantTruthAuthority: false;
    readonly mayOverrideIntegrity: false;
    readonly mayOverrideDisclosure: false;
  }>;
}

export class SeyeonEventAuthorityErrorV1 extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SeyeonEventAuthorityErrorV1';
  }
}

const VERIFIED_OUTCOME_EVENTS = new Set<SeyeonExperimentalEventKindV2>([
  'PROMISE_KEPT',
  'PROMISE_BROKEN',
  'USER_REMEMBERED_SEYEON_DETAIL',
]);

const SERVER_OBSERVED_EVENTS = new Set<SeyeonExperimentalEventKindV2>([
  'RETURNED_AFTER_ABSENCE',
]);

const CHARACTER_OUTPUT_EVENTS = new Set<SeyeonExperimentalEventKindV2>([
  'SEYEON_ACCEPTED_HELP',
  'SEYEON_REQUESTED_HELP',
  'SEYEON_SELF_DISCLOSED',
  'SEYEON_ADMITTED_WAITING',
]);

const RISK_BOUND_CHARACTER_EVENTS = new Set<SeyeonExperimentalEventKindV2>([
  'SEYEON_SELF_DISCLOSED',
  'SEYEON_ADMITTED_WAITING',
]);

function unique<T extends string>(values: readonly T[]): readonly T[] {
  return Object.freeze(
    values.filter((value, index, all) => all.indexOf(value) === index),
  );
}

function rejectReasonForIntegrity(
  decisions: readonly CharacterIntegrityDecisionV1[],
): SeyeonEventAuthorityReasonCodeV1 | null {
  if (decisions.some((decision) => decision.result === 'AUTHORITY_REJECT')) {
    return 'AUTHORITY_REJECTED_CLAIM';
  }
  if (decisions.some((decision) => decision.result === 'CONTRADICTED')) {
    return 'CONTRADICTED_CLAIM';
  }
  if (decisions.some((decision) => decision.result === 'NON_AUTHORITATIVE')) {
    return 'NON_AUTHORITATIVE_CLAIM';
  }
  if (decisions.some((decision) => decision.result === 'UNVERIFIED')) {
    return 'UNVERIFIED_CLAIM';
  }
  if (decisions.some((decision) => decision.result === 'USER_ASSERTED')) {
    return 'USER_ASSERTION_NOT_TRUTH_AUTHORITY';
  }
  return null;
}

function currentMessagesByRef(
  context: SeyeonEventExtractionContextV2,
): ReadonlyMap<string, SeyeonEventExtractionContextV2['messages'][number]> {
  return new Map(
    context.messages.map((message) => [message.messageId, message] as const),
  );
}

function currentAssistantMessageRef(
  context: SeyeonEventExtractionContextV2,
): string | null {
  const assistants = context.messages.filter(
    (message) => message.role === 'assistant',
  );
  if (assistants.length === 0) return null;
  const assistant = assistants[assistants.length - 1]!;
  if (assistant.text !== context.envelope.utterance) {
    throw new SeyeonEventAuthorityErrorV1(
      'Current assistant message must exactly match the guarded dialogue envelope.',
    );
  }
  return assistant.messageId;
}

function integrityForCandidate(
  candidate: EventCandidateV2,
  decisions: readonly CharacterIntegrityDecisionV1[],
): readonly CharacterIntegrityDecisionV1[] {
  const sourceRefs = new Set(candidate.sourceMessageRefs);
  return Object.freeze(
    decisions.filter((decision) => sourceRefs.has(decision.claim.sourceRef)),
  );
}

function verifiedAuthoritativeClaims(
  eventKind: SeyeonExperimentalEventKindV2,
  decisions: readonly CharacterIntegrityDecisionV1[],
): readonly CharacterIntegrityDecisionV1[] {
  const allowedKinds =
    eventKind === 'USER_REMEMBERED_SEYEON_DETAIL'
      ? new Set(['CHARACTER_FACT_CLAIM'])
      : new Set(['SHARED_EVENT_CLAIM']);
  return Object.freeze(
    decisions.filter(
      (decision) =>
        decision.result === 'VERIFIED' &&
        allowedKinds.has(decision.claim.kind) &&
        decision.mayEnterWorkingContextAsFact,
    ),
  );
}

function admittedFactsFromVerifiedClaims(
  decisions: readonly CharacterIntegrityDecisionV1[],
): readonly SeyeonEventFactV2[] {
  return Object.freeze(
    decisions.map((decision) =>
      Object.freeze({
        factKey: `verified_claim:${decision.claim.claimId}`,
        statement: decision.claim.statement,
        sourceRefs: unique([
          decision.claim.sourceRef,
          ...decision.authorityRefs,
        ]),
      }),
    ),
  );
}

function observedInteractionFacts(input: {
  readonly candidate: EventCandidateV2;
  readonly context: SeyeonEventExtractionContextV2;
}): readonly SeyeonEventFactV2[] {
  const messages = currentMessagesByRef(input.context);
  return Object.freeze(
    input.candidate.sourceMessageRefs.map((ref) => {
      const message = messages.get(ref);
      if (!message) {
        throw new SeyeonEventAuthorityErrorV1(
          `Candidate source ref is absent from the current turn: ${ref}`,
        );
      }
      return Object.freeze({
        factKey: `observed_message:${ref}`,
        statement: `${message.role} said: ${message.text}`,
        sourceRefs: Object.freeze([ref]),
      });
    }),
  );
}

function baseDecision(input: {
  readonly candidate: EventCandidateV2;
  readonly context: SeyeonEventExtractionContextV2;
  readonly evidence: SeyeonEventAuthorityEvidenceV1;
  readonly decision: 'ADMIT_EXPERIMENTAL' | 'REJECT';
  readonly reasonCodes: readonly SeyeonEventAuthorityReasonCodeV1[];
  readonly admittedFacts: readonly SeyeonEventFactV2[];
  readonly guardedCharacterOutputRef: string | null;
  readonly relevantIntegrity: readonly CharacterIntegrityDecisionV1[];
}): SeyeonEventAuthorityDecisionV1 {
  const verified = verifiedAuthoritativeClaims(
    input.candidate.eventKind,
    input.relevantIntegrity,
  );
  const serverObservationRefs = unique(
    input.evidence.serverObservationRefs ?? [],
  );
  return Object.freeze({
    schemaVersion: SEYEON_EVENT_AUTHORITY_VERSION_V1,
    authority: SEYEON_EVENT_AUTHORITY_MARKER_V1,
    decision: input.decision,
    eventKind: input.candidate.eventKind,
    reasonCodes: Object.freeze(unique(input.reasonCodes)),
    evidence: Object.freeze({
      currentTurnId: input.context.turnId,
      observedMessageRefs: unique(input.candidate.sourceMessageRefs),
      verifiedClaimIds: Object.freeze(
        verified.map((decision) => decision.claim.claimId),
      ),
      authorityRefs: unique(
        verified.flatMap((decision) => decision.authorityRefs),
      ),
      causalPredecessorEventIds: unique(
        input.candidate.causalPredecessorEventIds,
      ),
      guardedCharacterOutputRef: input.guardedCharacterOutputRef,
      serverObservationRefs,
      riskCausality: input.evidence.riskCausality ?? null,
    }),
    candidateSignal: Object.freeze({
      salience: input.candidate.salience,
      confidence: input.candidate.confidence,
    }),
    admittedFacts: input.admittedFacts,
    characterInterpretation:
      input.decision === 'ADMIT_EXPERIMENTAL'
        ? input.candidate.characterInterpretation
        : null,
    constraints: Object.freeze({
      mayAppendExperimentalLedger: input.decision === 'ADMIT_EXPERIMENTAL',
      mayAppendProductionRelationshipEvent: false as const,
      mayMutateProductionRelationshipState: false as const,
      mayCreateDurableMemory: false as const,
      mayGrantTruthAuthority: false as const,
      mayOverrideIntegrity: false as const,
      mayOverrideDisclosure: false as const,
    }),
  });
}

export function validateSeyeonEventAuthorityV1(input: {
  readonly candidate: EventCandidateV2;
  readonly context: SeyeonEventExtractionContextV2;
  readonly evidence: SeyeonEventAuthorityEvidenceV1;
}): SeyeonEventAuthorityDecisionV1 {
  const relevantIntegrity = integrityForCandidate(
    input.candidate,
    input.evidence.integrityDecisions,
  );
  const verifiedClaims = verifiedAuthoritativeClaims(
    input.candidate.eventKind,
    relevantIntegrity,
  );
  const guardedCharacterOutputRef = currentAssistantMessageRef(input.context);
  const candidateRefs = new Set(input.candidate.sourceMessageRefs);
  const serverObservationRefs = unique(
    input.evidence.serverObservationRefs ?? [],
  );

  if (input.candidate.causalPredecessorEventIds.length > 0) {
    const priorIds = new Set(
      input.context.priorEvents.map((event) => event.eventId),
    );
    if (
      input.candidate.causalPredecessorEventIds.some(
        (eventId) => !priorIds.has(eventId),
      )
    ) {
      return baseDecision({
        ...input,
        decision: 'REJECT',
        reasonCodes: ['MISSING_CAUSAL_PREDECESSOR'],
        admittedFacts: Object.freeze([]),
        guardedCharacterOutputRef,
        relevantIntegrity,
      });
    }
  }

  if (VERIFIED_OUTCOME_EVENTS.has(input.candidate.eventKind)) {
    if (verifiedClaims.length === 0) {
      return baseDecision({
        ...input,
        decision: 'REJECT',
        reasonCodes: [
          rejectReasonForIntegrity(relevantIntegrity) ??
            'MISSING_VERIFIED_OUTCOME_AUTHORITY',
        ],
        admittedFacts: Object.freeze([]),
        guardedCharacterOutputRef,
        relevantIntegrity,
      });
    }
    return baseDecision({
      ...input,
      decision: 'ADMIT_EXPERIMENTAL',
      reasonCodes: [
        'VERIFIED_INTEGRITY_CLAIM',
        'AUTHORIZED_CAUSAL_PREDECESSOR',
      ],
      admittedFacts: admittedFactsFromVerifiedClaims(verifiedClaims),
      guardedCharacterOutputRef,
      relevantIntegrity,
    });
  }

  if (SERVER_OBSERVED_EVENTS.has(input.candidate.eventKind)) {
    if (serverObservationRefs.length === 0) {
      return baseDecision({
        ...input,
        decision: 'REJECT',
        reasonCodes: ['MISSING_SERVER_OBSERVATION_AUTHORITY'],
        admittedFacts: Object.freeze([]),
        guardedCharacterOutputRef,
        relevantIntegrity,
      });
    }
    return baseDecision({
      ...input,
      decision: 'ADMIT_EXPERIMENTAL',
      reasonCodes: ['OBSERVED_CURRENT_TURN_INTERACTION'],
      admittedFacts: Object.freeze([
        Object.freeze({
          factKey: 'server_observed_return',
          statement:
            'Server observation confirms the return-after-absence condition for this turn.',
          sourceRefs: serverObservationRefs,
        }),
      ]),
      guardedCharacterOutputRef,
      relevantIntegrity,
    });
  }

  if (CHARACTER_OUTPUT_EVENTS.has(input.candidate.eventKind)) {
    if (
      guardedCharacterOutputRef === null ||
      !candidateRefs.has(guardedCharacterOutputRef)
    ) {
      return baseDecision({
        ...input,
        decision: 'REJECT',
        reasonCodes: ['CHARACTER_OUTPUT_MISMATCH'],
        admittedFacts: Object.freeze([]),
        guardedCharacterOutputRef,
        relevantIntegrity,
      });
    }

    if (RISK_BOUND_CHARACTER_EVENTS.has(input.candidate.eventKind)) {
      const risk = input.evidence.riskCausality ?? null;
      if (risk !== null && risk.result !== 'ADMIT') {
        return baseDecision({
          ...input,
          decision: 'REJECT',
          reasonCodes: ['RISK_CAUSALITY_MISMATCH'],
          admittedFacts: Object.freeze([]),
          guardedCharacterOutputRef,
          relevantIntegrity,
        });
      }
    }

    const observed = observedInteractionFacts({
      candidate: input.candidate,
      context: input.context,
    }).filter((fact) =>
      fact.sourceRefs.includes(guardedCharacterOutputRef),
    );
    return baseDecision({
      ...input,
      decision: 'ADMIT_EXPERIMENTAL',
      reasonCodes: [
        'GUARDED_CHARACTER_OUTPUT',
        ...(input.evidence.riskCausality?.result === 'ADMIT'
          ? (['RISK_CAUSALITY_CONSISTENT'] as const)
          : []),
      ],
      admittedFacts: Object.freeze(observed),
      guardedCharacterOutputRef,
      relevantIntegrity,
    });
  }

  const integrityRejection = rejectReasonForIntegrity(relevantIntegrity);
  if (
    integrityRejection !== null &&
    input.candidate.sourceMessageRefs.some(
      (ref) => currentMessagesByRef(input.context).get(ref)?.role === 'user',
    )
  ) {
    return baseDecision({
      ...input,
      decision: 'REJECT',
      reasonCodes: [integrityRejection],
      admittedFacts: Object.freeze([]),
      guardedCharacterOutputRef,
      relevantIntegrity,
    });
  }

  return baseDecision({
    ...input,
    decision: 'ADMIT_EXPERIMENTAL',
    reasonCodes: ['OBSERVED_CURRENT_TURN_INTERACTION'],
    admittedFacts: observedInteractionFacts({
      candidate: input.candidate,
      context: input.context,
    }),
    guardedCharacterOutputRef,
    relevantIntegrity,
  });
}

function boundedIdentity(
  value: string,
  path: string,
  maxLength: number,
): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maxLength) {
    throw new SeyeonEventAuthorityErrorV1(
      `${path} must be non-empty text within ${maxLength} characters.`,
    );
  }
  return normalized;
}

export function materializeSeyeonAuthorizedExperimentalEventV1(input: {
  readonly authorityDecision: SeyeonEventAuthorityDecisionV1;
  readonly eventId: string;
  readonly dedupeKey: string;
  readonly occurredAt: string;
}): SeyeonRelationshipEventV2 {
  if (
    input.authorityDecision.authority !== SEYEON_EVENT_AUTHORITY_MARKER_V1 ||
    input.authorityDecision.decision !== 'ADMIT_EXPERIMENTAL' ||
    !input.authorityDecision.constraints.mayAppendExperimentalLedger
  ) {
    throw new SeyeonEventAuthorityErrorV1(
      'Only an admitted Event Authority decision may materialize an experimental Event.',
    );
  }
  if (input.authorityDecision.admittedFacts.length === 0) {
    throw new SeyeonEventAuthorityErrorV1(
      'Admitted Event Authority decision must contain at least one authority-bound fact.',
    );
  }

  return Object.freeze({
    schemaVersion: SEYEON_EVENT_LEDGER_SCHEMA_VERSION_V2,
    authority: 'experimental_non_canonical_event' as const,
    eventId: boundedIdentity(input.eventId, 'eventId', 256),
    dedupeKey: boundedIdentity(input.dedupeKey, 'dedupeKey', 256),
    characterId: 'seyeon' as const,
    eventKind: input.authorityDecision.eventKind,
    occurredAt: boundedIdentity(input.occurredAt, 'occurredAt', 64),
    sourceTurnId: input.authorityDecision.evidence.currentTurnId,
    sourceMessageRefs: input.authorityDecision.evidence.observedMessageRefs,
    causalPredecessorEventIds:
      input.authorityDecision.evidence.causalPredecessorEventIds,
    facts: input.authorityDecision.admittedFacts,
    characterInterpretation: input.authorityDecision.characterInterpretation,
    salience: input.authorityDecision.candidateSignal.salience,
    confidence: input.authorityDecision.candidateSignal.confidence,
  });
}
