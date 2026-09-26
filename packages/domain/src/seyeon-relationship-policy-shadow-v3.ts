import {
  SEYEON_EVENT_AUTHORITY_MARKER_V1,
  type SeyeonEventAuthorityDecisionV1,
} from './seyeon-event-authority-v1.js';
import type { SeyeonRelationshipEventV2 } from './seyeon-event-ledger-v2.js';
import {
  buildSeyeonRelationshipEvidenceEpisodesV2,
  creditSeyeonRelationshipEpisodesV2,
  projectSeyeonRelationshipStateShadowV2,
  summarizeSeyeonRelationshipEpisodeProfileV2,
  type SeyeonEpisodeCreditResultV2,
  type SeyeonRelationshipEpisodeProfileV2,
  type SeyeonRelationshipEvidenceEpisodeV2,
  type SeyeonRelationshipStageShadowV2,
  type SeyeonRelationshipStateShadowV2,
} from './seyeon-relationship-semantics-v2.js';

export const SEYEON_RELATIONSHIP_POLICY_SHADOW_VERSION_V3 =
  'seyeon-relationship-policy-shadow-v3' as const;
export const SEYEON_RELATIONSHIP_POLICY_SHADOW_AUTHORITY_V3 =
  'calibration_only_not_production_relationship_authority' as const;

export interface SeyeonAuthorizedRelationshipEvidenceV3 {
  readonly schemaVersion: typeof SEYEON_RELATIONSHIP_POLICY_SHADOW_VERSION_V3;
  readonly authority: typeof SEYEON_RELATIONSHIP_POLICY_SHADOW_AUTHORITY_V3;
  readonly event: SeyeonRelationshipEventV2;
  readonly eventAuthority: SeyeonEventAuthorityDecisionV1;
  readonly constraints: Readonly<{
    readonly mayMutateProductionRelationshipState: false;
    readonly mayAppendProductionRelationshipEvent: false;
    readonly mayCreateDurableMemory: false;
  }>;
}

export interface SeyeonRelationshipPolicyShadowProjectionV3 {
  readonly schemaVersion: typeof SEYEON_RELATIONSHIP_POLICY_SHADOW_VERSION_V3;
  readonly authority: typeof SEYEON_RELATIONSHIP_POLICY_SHADOW_AUTHORITY_V3;
  readonly admittedEventIds: readonly string[];
  readonly episodes: readonly SeyeonRelationshipEvidenceEpisodeV2[];
  readonly credits: SeyeonEpisodeCreditResultV2;
  readonly profile: SeyeonRelationshipEpisodeProfileV2;
  readonly state: SeyeonRelationshipStateShadowV2;
  readonly constraints: Readonly<{
    readonly productionPolicyApproved: false;
    readonly mayMutateProductionRelationshipState: false;
    readonly mayAppendProductionRelationshipEvent: false;
    readonly mayCreateDurableMemory: false;
    readonly src22Status: 'OPEN';
  }>;
}

export class SeyeonRelationshipPolicyShadowErrorV3 extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SeyeonRelationshipPolicyShadowErrorV3';
  }
}

function sameStrings(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function assertMaterializedFromAuthority(input: {
  readonly event: SeyeonRelationshipEventV2;
  readonly decision: SeyeonEventAuthorityDecisionV1;
}): void {
  const { event, decision } = input;

  if (decision.authority !== SEYEON_EVENT_AUTHORITY_MARKER_V1) {
    throw new SeyeonRelationshipPolicyShadowErrorV3(
      'Relationship evidence requires the Event Authority V1 marker.',
    );
  }
  if (
    decision.decision !== 'ADMIT_EXPERIMENTAL' ||
    !decision.constraints.mayAppendExperimentalLedger
  ) {
    throw new SeyeonRelationshipPolicyShadowErrorV3(
      'Only ADMIT_EXPERIMENTAL Event Authority may enter the relationship shadow.',
    );
  }
  if (
    decision.constraints.mayAppendProductionRelationshipEvent ||
    decision.constraints.mayMutateProductionRelationshipState ||
    decision.constraints.mayCreateDurableMemory
  ) {
    throw new SeyeonRelationshipPolicyShadowErrorV3(
      'Experimental Event Authority must not carry production mutation authority.',
    );
  }
  if (
    event.authority !== 'experimental_non_canonical_event' ||
    event.characterId !== 'seyeon'
  ) {
    throw new SeyeonRelationshipPolicyShadowErrorV3(
      'Relationship shadow accepts only Se-yeon experimental events.',
    );
  }
  if (
    event.eventKind !== decision.eventKind ||
    event.sourceTurnId !== decision.evidence.currentTurnId
  ) {
    throw new SeyeonRelationshipPolicyShadowErrorV3(
      'Event identity does not match its Event Authority decision.',
    );
  }
  if (
    !sameStrings(
      event.sourceMessageRefs,
      decision.evidence.observedMessageRefs,
    ) ||
    !sameStrings(
      event.causalPredecessorEventIds,
      decision.evidence.causalPredecessorEventIds,
    )
  ) {
    throw new SeyeonRelationshipPolicyShadowErrorV3(
      'Event provenance does not match its Event Authority decision.',
    );
  }
  if (
    !sameJson(event.facts, decision.admittedFacts) ||
    !sameJson(
      event.characterInterpretation,
      decision.characterInterpretation,
    )
  ) {
    throw new SeyeonRelationshipPolicyShadowErrorV3(
      'Event semantic payload does not match authority-bound material.',
    );
  }
  if (
    event.salience !== decision.candidateSignal.salience ||
    event.confidence !== decision.candidateSignal.confidence
  ) {
    throw new SeyeonRelationshipPolicyShadowErrorV3(
      'Event candidate signal does not match its Event Authority decision.',
    );
  }
}

export function bindSeyeonAuthorizedRelationshipEvidenceV3(input: {
  readonly event: SeyeonRelationshipEventV2;
  readonly eventAuthority: SeyeonEventAuthorityDecisionV1;
}): SeyeonAuthorizedRelationshipEvidenceV3 | null {
  if (input.eventAuthority.decision === 'REJECT') return null;

  assertMaterializedFromAuthority({
    event: input.event,
    decision: input.eventAuthority,
  });

  return Object.freeze({
    schemaVersion: SEYEON_RELATIONSHIP_POLICY_SHADOW_VERSION_V3,
    authority: SEYEON_RELATIONSHIP_POLICY_SHADOW_AUTHORITY_V3,
    event: input.event,
    eventAuthority: input.eventAuthority,
    constraints: Object.freeze({
      mayMutateProductionRelationshipState: false as const,
      mayAppendProductionRelationshipEvent: false as const,
      mayCreateDurableMemory: false as const,
    }),
  });
}

export function projectSeyeonRelationshipPolicyShadowV3(input: {
  readonly evidence: readonly SeyeonAuthorizedRelationshipEvidenceV3[];
  readonly currentCandidateStage: SeyeonRelationshipStageShadowV2;
  readonly previousAttainedStage?: SeyeonRelationshipStageShadowV2;
  readonly maxPositiveCreditsPerFamilyRolling7Days?: number;
}): SeyeonRelationshipPolicyShadowProjectionV3 {
  const eventIds = new Set<string>();

  for (const item of input.evidence) {
    if (
      item.schemaVersion !== SEYEON_RELATIONSHIP_POLICY_SHADOW_VERSION_V3 ||
      item.authority !== SEYEON_RELATIONSHIP_POLICY_SHADOW_AUTHORITY_V3
    ) {
      throw new SeyeonRelationshipPolicyShadowErrorV3(
        'Relationship shadow evidence marker is invalid.',
      );
    }
    assertMaterializedFromAuthority({
      event: item.event,
      decision: item.eventAuthority,
    });
    if (eventIds.has(item.event.eventId)) {
      throw new SeyeonRelationshipPolicyShadowErrorV3(
        `Duplicate authority-bound eventId: ${item.event.eventId}`,
      );
    }
    eventIds.add(item.event.eventId);
  }

  const events = input.evidence.map((item) => item.event);
  const episodes = buildSeyeonRelationshipEvidenceEpisodesV2(events);
  const credits = creditSeyeonRelationshipEpisodesV2(
    episodes,
    input.maxPositiveCreditsPerFamilyRolling7Days === undefined
      ? {}
      : {
          maxPositiveCreditsPerFamilyRolling7Days:
            input.maxPositiveCreditsPerFamilyRolling7Days,
        },
  );
  const profile = summarizeSeyeonRelationshipEpisodeProfileV2(episodes);
  const state = projectSeyeonRelationshipStateShadowV2({
    ...(input.previousAttainedStage === undefined
      ? {}
      : { previousAttainedStage: input.previousAttainedStage }),
    currentCandidateStage: input.currentCandidateStage,
    episodes,
  });

  return Object.freeze({
    schemaVersion: SEYEON_RELATIONSHIP_POLICY_SHADOW_VERSION_V3,
    authority: SEYEON_RELATIONSHIP_POLICY_SHADOW_AUTHORITY_V3,
    admittedEventIds: Object.freeze([...eventIds]),
    episodes,
    credits,
    profile,
    state,
    constraints: Object.freeze({
      productionPolicyApproved: false as const,
      mayMutateProductionRelationshipState: false as const,
      mayAppendProductionRelationshipEvent: false as const,
      mayCreateDurableMemory: false as const,
      src22Status: 'OPEN' as const,
    }),
  });
}
