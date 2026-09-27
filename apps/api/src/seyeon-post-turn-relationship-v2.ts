import {
  materializeSeyeonAuthorizedExperimentalEventV1,
  rankSeyeonEventRetrievalV2,
  validateSeyeonEventAuthorityV1,
  type SeyeonDialogueEnvelopeV2,
  type SeyeonEventExtractionMessageV2,
  type SeyeonEventAuthorityDecisionV1,
  type SeyeonEventAuthorityEvidenceV1,
  type SeyeonEventExtractionCandidateV2,
  type SeyeonEventLedgerEntryV2,
  type SeyeonRelationshipEventV2,
  type SeyeonRelationshipProjectionV2,
  type SeyeonTurnInterpretationV2,
} from '../../../packages/domain/src/index.js';
import {
  extractSeyeonEventCandidateV2,
} from './seyeon-event-extractor-v2.js';
import type {
  SeyeonStructuredProviderPortV2,
} from './seyeon-character-runtime-v2.js';

export const SEYEON_POST_TURN_RELATIONSHIP_RUNTIME_VERSION_V2 =
  'seyeon-post-turn-relationship-exp-v2' as const;

export interface SeyeonEventLedgerPortV2 {
  readonly authority: 'experimental_non_production';
  activeEvents(): readonly SeyeonRelationshipEventV2[];
  appendEvent(input: {
    readonly ledgerEntryId: string;
    readonly recordedAt: string;
    readonly event: SeyeonRelationshipEventV2;
  }): SeyeonEventLedgerEntryV2;
  projectRelationship(): SeyeonRelationshipProjectionV2;
}

export interface RunSeyeonPostTurnRelationshipV2Input {
  readonly turnId: string;
  readonly messages: readonly SeyeonEventExtractionMessageV2[];
  readonly interpretation: SeyeonTurnInterpretationV2;
  readonly envelope: SeyeonDialogueEnvelopeV2;
  readonly ledger: SeyeonEventLedgerPortV2;
  readonly extractorProvider: SeyeonStructuredProviderPortV2;
  readonly eventAuthorityEvidence: SeyeonEventAuthorityEvidenceV1;
  readonly semanticRelevanceByEventId: Readonly<Record<string, number>>;
  readonly recentlyMentionedEventIds?: readonly string[];
  readonly identity: Readonly<{
    readonly eventId: string;
    readonly eventDedupeKey: string;
    readonly ledgerEntryId: string;
    readonly occurredAt: string;
    readonly recordedAt: string;
  }>;
}

export type RunSeyeonPostTurnRelationshipV2Result =
  | Readonly<{
      readonly runtimeVersion: typeof SEYEON_POST_TURN_RELATIONSHIP_RUNTIME_VERSION_V2;
      readonly decision: 'none';
      readonly priorCausalEventIds: readonly string[];
      readonly relationshipBefore: SeyeonRelationshipProjectionV2;
      readonly relationshipAfter: SeyeonRelationshipProjectionV2;
    }>
  | Readonly<{
      readonly runtimeVersion: typeof SEYEON_POST_TURN_RELATIONSHIP_RUNTIME_VERSION_V2;
      readonly decision: 'rejected';
      readonly priorCausalEventIds: readonly string[];
      readonly candidate: Extract<SeyeonEventExtractionCandidateV2, { readonly decision: 'event' }>;
      readonly authorityDecision: SeyeonEventAuthorityDecisionV1;
      readonly relationshipBefore: SeyeonRelationshipProjectionV2;
      readonly relationshipAfter: SeyeonRelationshipProjectionV2;
    }>
  | Readonly<{
      readonly runtimeVersion: typeof SEYEON_POST_TURN_RELATIONSHIP_RUNTIME_VERSION_V2;
      readonly decision: 'event';
      readonly priorCausalEventIds: readonly string[];
      readonly event: SeyeonRelationshipEventV2;
      readonly authorityDecision: SeyeonEventAuthorityDecisionV1;
      readonly ledgerEntry: SeyeonEventLedgerEntryV2;
      readonly relationshipBefore: SeyeonRelationshipProjectionV2;
      readonly relationshipAfter: SeyeonRelationshipProjectionV2;
    }>;

function resolveUnresolvedConflictEventIds(
  relationship: SeyeonRelationshipProjectionV2,
): readonly string[] {
  if (
    relationship.conflictState !== 'open' &&
    relationship.repairState !== 'needed' &&
    relationship.repairState !== 'in_progress'
  ) {
    return Object.freeze([]);
  }
  return relationship.causalEventIds.conflict;
}

function selectPriorCausalEvents(input: {
  readonly events: readonly SeyeonRelationshipEventV2[];
  readonly semanticRelevanceByEventId: Readonly<Record<string, number>>;
  readonly unresolvedConflictEventIds: readonly string[];
  readonly recentlyMentionedEventIds?: readonly string[];
  readonly now: string;
}): readonly SeyeonRelationshipEventV2[] {
  const ranked = rankSeyeonEventRetrievalV2({
    events: input.events,
    semanticRelevanceByEventId: input.semanticRelevanceByEventId,
    unresolvedConflictEventIds: input.unresolvedConflictEventIds,
    ...(input.recentlyMentionedEventIds === undefined
      ? {}
      : { recentlyMentionedEventIds: input.recentlyMentionedEventIds }),
    now: input.now,
    limit: 32,
  });

  return Object.freeze(
    ranked
      .filter(
        (candidate) =>
          candidate.semanticRelevance >= 0.2 ||
          candidate.unresolvedConflictBonus === 1,
      )
      .slice(0, 8)
      .map((candidate) => candidate.event),
  );
}

export async function runSeyeonPostTurnRelationshipV2(
  input: RunSeyeonPostTurnRelationshipV2Input,
): Promise<RunSeyeonPostTurnRelationshipV2Result> {
  if (input.ledger.authority !== 'experimental_non_production') {
    throw new TypeError(
      'Se-yeon V2 relationship persistence is experimental-only until SRC-22 is resolved.',
    );
  }

  const relationshipBefore = input.ledger.projectRelationship();
  const activeEvents = input.ledger.activeEvents();
  const priorEvents = selectPriorCausalEvents({
    events: activeEvents,
    semanticRelevanceByEventId: input.semanticRelevanceByEventId,
    unresolvedConflictEventIds:
      resolveUnresolvedConflictEventIds(relationshipBefore),
    ...(input.recentlyMentionedEventIds === undefined
      ? {}
      : { recentlyMentionedEventIds: input.recentlyMentionedEventIds }),
    now: input.identity.occurredAt,
  });
  const priorCausalEventIds = Object.freeze(
    priorEvents.map((event) => event.eventId),
  );

  const extractionContext = Object.freeze({
    turnId: input.turnId,
    messages: input.messages,
    priorEvents,
    interpretation: input.interpretation,
    envelope: input.envelope,
    relationshipBefore,
  });

  const candidate = await extractSeyeonEventCandidateV2({
    context: extractionContext,
    provider: input.extractorProvider,
  });

  if (candidate.decision === 'none') {
    return Object.freeze({
      runtimeVersion: SEYEON_POST_TURN_RELATIONSHIP_RUNTIME_VERSION_V2,
      decision: 'none' as const,
      priorCausalEventIds,
      relationshipBefore,
      relationshipAfter: relationshipBefore,
    });
  }

  const authorityDecision = validateSeyeonEventAuthorityV1({
    candidate,
    context: extractionContext,
    evidence: input.eventAuthorityEvidence,
  });

  if (authorityDecision.decision === 'REJECT') {
    return Object.freeze({
      runtimeVersion: SEYEON_POST_TURN_RELATIONSHIP_RUNTIME_VERSION_V2,
      decision: 'rejected' as const,
      priorCausalEventIds,
      candidate,
      authorityDecision,
      relationshipBefore,
      relationshipAfter: relationshipBefore,
    });
  }

  const event = materializeSeyeonAuthorizedExperimentalEventV1({
    authorityDecision,
    eventId: input.identity.eventId,
    dedupeKey: input.identity.eventDedupeKey,
    occurredAt: input.identity.occurredAt,
  });

  const ledgerEntry = input.ledger.appendEvent({
    ledgerEntryId: input.identity.ledgerEntryId,
    recordedAt: input.identity.recordedAt,
    event,
  });
  const relationshipAfter = input.ledger.projectRelationship();

  return Object.freeze({
    runtimeVersion: SEYEON_POST_TURN_RELATIONSHIP_RUNTIME_VERSION_V2,
    decision: 'event' as const,
    priorCausalEventIds,
    event,
    authorityDecision,
    ledgerEntry,
    relationshipBefore,
    relationshipAfter,
  });
}