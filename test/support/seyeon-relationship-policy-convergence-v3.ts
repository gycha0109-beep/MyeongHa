import {
  SEYEON_EVENT_AUTHORITY_MARKER_V1,
  SEYEON_EVENT_AUTHORITY_VERSION_V1,
  bindSeyeonAuthorizedRelationshipEvidenceV3,
  type SeyeonAuthorizedRelationshipEvidenceV3,
  type SeyeonEventAuthorityDecisionV1,
  type SeyeonRelationshipEventV2,
} from '../../packages/domain/src/index.js';

export type SeyeonConvergenceFindingStatusV3 =
  | 'MITIGATED'
  | 'OPEN'
  | 'OWNER_DECISION_REQUIRED';

export interface SeyeonRelationshipPolicyConvergenceReportV3 {
  readonly schemaVersion: 'seyeon-relationship-policy-convergence-report-v3';
  readonly authority: 'calibration_evidence_only';
  readonly findings: Readonly<{
    F01_ROUTE_DEAD_END: SeyeonConvergenceFindingStatusV3;
    F02_BUCKET_EXPLOIT: SeyeonConvergenceFindingStatusV3;
    F03_STAGE_REGRESSION: SeyeonConvergenceFindingStatusV3;
    F04_REPAIR_FIFTH_FAMILY: SeyeonConvergenceFindingStatusV3;
    F05_REPAIR_MILESTONE_FARMING: SeyeonConvergenceFindingStatusV3;
    F06_SCORE_SATURATION: SeyeonConvergenceFindingStatusV3;
  }>;
  readonly production: Readonly<{
    relationshipEventAppend: false;
    relationshipStateMutation: false;
    policyApproved: false;
  }>;
  readonly src22: Readonly<{
    status: 'OPEN';
    ownerDecisionRequired: true;
  }>;
}

export function eventAuthorityFixtureV3(input: {
  readonly event: SeyeonRelationshipEventV2;
  readonly decision?: 'ADMIT_EXPERIMENTAL' | 'REJECT';
}): SeyeonEventAuthorityDecisionV1 {
  const decision = input.decision ?? 'ADMIT_EXPERIMENTAL';
  return Object.freeze({
    schemaVersion: SEYEON_EVENT_AUTHORITY_VERSION_V1,
    authority: SEYEON_EVENT_AUTHORITY_MARKER_V1,
    decision,
    eventKind: input.event.eventKind,
    reasonCodes: Object.freeze(
      decision === 'ADMIT_EXPERIMENTAL'
        ? (['OBSERVED_CURRENT_TURN_INTERACTION'] as const)
        : (['UNVERIFIED_CLAIM'] as const),
    ),
    evidence: Object.freeze({
      currentTurnId: input.event.sourceTurnId,
      observedMessageRefs: input.event.sourceMessageRefs,
      verifiedClaimIds: Object.freeze([]),
      authorityRefs: Object.freeze([]),
      causalPredecessorEventIds: input.event.causalPredecessorEventIds,
      guardedCharacterOutputRef: null,
      serverObservationRefs: Object.freeze([]),
      riskCausality: null,
    }),
    candidateSignal: Object.freeze({
      salience: input.event.salience,
      confidence: input.event.confidence,
    }),
    admittedFacts:
      decision === 'ADMIT_EXPERIMENTAL'
        ? input.event.facts
        : Object.freeze([]),
    characterInterpretation:
      decision === 'ADMIT_EXPERIMENTAL'
        ? input.event.characterInterpretation
        : null,
    constraints: Object.freeze({
      mayAppendExperimentalLedger: decision === 'ADMIT_EXPERIMENTAL',
      mayAppendProductionRelationshipEvent: false as const,
      mayMutateProductionRelationshipState: false as const,
      mayCreateDurableMemory: false as const,
      mayGrantTruthAuthority: false as const,
      mayOverrideIntegrity: false as const,
      mayOverrideDisclosure: false as const,
    }),
  });
}

export function bindAuthorizedEventFixturesV3(
  events: readonly SeyeonRelationshipEventV2[],
): readonly SeyeonAuthorizedRelationshipEvidenceV3[] {
  return Object.freeze(
    events.map((event) => {
      const evidence = bindSeyeonAuthorizedRelationshipEvidenceV3({
        event,
        eventAuthority: eventAuthorityFixtureV3({ event }),
      });
      if (evidence === null) {
        throw new Error('Authorized fixture unexpectedly failed to bind.');
      }
      return evidence;
    }),
  );
}

export function buildSeyeonRelationshipPolicyConvergenceReportV3(input: {
  readonly routeDeadEndMitigated: boolean;
  readonly bucketExploitMitigated: boolean;
  readonly stageRegressionMitigated: boolean;
  readonly repairFifthFamilyMitigated: boolean;
  readonly repairMilestoneFarmingMitigated: boolean;
  readonly scoreSaturationObserved: boolean;
}): SeyeonRelationshipPolicyConvergenceReportV3 {
  return Object.freeze({
    schemaVersion: 'seyeon-relationship-policy-convergence-report-v3',
    authority: 'calibration_evidence_only',
    findings: Object.freeze({
      F01_ROUTE_DEAD_END: input.routeDeadEndMitigated
        ? 'MITIGATED'
        : 'OPEN',
      F02_BUCKET_EXPLOIT: input.bucketExploitMitigated
        ? 'MITIGATED'
        : 'OPEN',
      F03_STAGE_REGRESSION: input.stageRegressionMitigated
        ? 'MITIGATED'
        : 'OPEN',
      F04_REPAIR_FIFTH_FAMILY: input.repairFifthFamilyMitigated
        ? 'MITIGATED'
        : 'OWNER_DECISION_REQUIRED',
      F05_REPAIR_MILESTONE_FARMING: input.repairMilestoneFarmingMitigated
        ? 'MITIGATED'
        : 'OPEN',
      F06_SCORE_SATURATION: input.scoreSaturationObserved
        ? 'OWNER_DECISION_REQUIRED'
        : 'OPEN',
    }),
    production: Object.freeze({
      relationshipEventAppend: false as const,
      relationshipStateMutation: false as const,
      policyApproved: false as const,
    }),
    src22: Object.freeze({
      status: 'OPEN' as const,
      ownerDecisionRequired: true as const,
    }),
  });
}
