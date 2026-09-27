import {
  PRODUCTION_RELATIONSHIP_POLICY_ARTIFACT_V1,
  PRODUCTION_RELATIONSHIP_POLICY_VERSION_V1,
  type ProductionRelationshipBehaviorAccessV1,
  type ProductionRelationshipConditionV1,
  type ProductionRelationshipScoreVectorV1,
  type ProductionRelationshipStageGateV1,
  type ProductionRelationshipStageRouteGateV1,
  type ProductionRelationshipStageV1,
} from './relationship-policy-artifact-v1.js';
import {
  resolveProductionRelationshipEventRuleV1,
  validateProductionRelationshipEventV1,
  type ProductionRelationshipEventV1,
  type ProductionRelationshipFamilyV1,
  type ProductionRelationshipMilestoneKindV1,
  type ProductionRelationshipScoreDeltaV1,
} from './relationship-event-registry-v1.js';

export type ProductionRelationshipEffectDispositionV1 =
  | 'APPLIED'
  | 'SUPPRESSED_POSITIVE_CREDIT'
  | 'NON_PROGRESSION'
  | 'NEGATIVE';

export interface ProductionRelationshipEventDecisionV1 {
  readonly eventId: string;
  readonly dedupeKey: string;
  readonly applied: boolean;
  readonly duplicateRetry: boolean;
  readonly evaluationSequenceBefore: number;
  readonly evaluationSequenceAfter: number;
  readonly episodeId: string | null;
  readonly family: ProductionRelationshipFamilyV1;
  readonly effectDisposition: ProductionRelationshipEffectDispositionV1 | null;
  readonly effectiveDelta: ProductionRelationshipScoreDeltaV1;
  readonly creditedPositiveEpisode: boolean;
  readonly milestoneKind: ProductionRelationshipMilestoneKindV1 | null;
}

export interface ProductionRelationshipEpisodeProfileV1 {
  readonly familyCounts: Readonly<Record<ProductionRelationshipFamilyV1, number>>;
  readonly creditedPositiveEpisodes: number;
  readonly suppressedPositiveEpisodes: number;
  readonly distinctPositiveDays: number;
  readonly distinctPositiveWeeks: number;
  readonly distinctPositiveFamilies: number;
  readonly milestoneCount: number;
  readonly milestoneKinds: readonly ProductionRelationshipMilestoneKindV1[];
}

export interface ProductionRelationshipProjectionV1 {
  readonly policyVersion: typeof PRODUCTION_RELATIONSHIP_POLICY_VERSION_V1;
  readonly policyContentHash: string;
  readonly revision: number;
  readonly evaluatedEventCount: number;
  readonly scores: ProductionRelationshipScoreVectorV1;
  readonly attainedStage: ProductionRelationshipStageV1;
  readonly currentCandidateStage: ProductionRelationshipStageV1;
  readonly currentCondition: ProductionRelationshipConditionV1;
  readonly behaviorAccess: ProductionRelationshipBehaviorAccessV1;
  readonly episodeProfile: ProductionRelationshipEpisodeProfileV1;
  readonly creditedEpisodeIds: readonly string[];
  readonly suppressedEpisodeIds: readonly string[];
  readonly unresolvedConflictEventIds: readonly string[];
  readonly decisions: readonly ProductionRelationshipEventDecisionV1[];
}

export class ProductionRelationshipPolicyEvaluationErrorV1 extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProductionRelationshipPolicyEvaluationErrorV1';
  }
}

const STAGE_ORDER: Readonly<Record<ProductionRelationshipStageV1, number>> =
  Object.freeze({
    S0_FIRST_MEETING: 0,
    S1_FAMILIAR: 1,
    S2_REGULAR: 2,
    S3_OPENED: 3,
    S4_SPECIAL: 4,
  });

const ZERO_DELTA: ProductionRelationshipScoreDeltaV1 = Object.freeze({
  closeness: 0,
  trust: 0,
  friction: 0,
});

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function applyDelta(
  scores: ProductionRelationshipScoreVectorV1,
  delta: ProductionRelationshipScoreDeltaV1,
): ProductionRelationshipScoreVectorV1 {
  return Object.freeze({
    closeness: clampScore(scores.closeness + delta.closeness),
    trust: clampScore(scores.trust + delta.trust),
    friction: clampScore(scores.friction + delta.friction),
  });
}

function meetsRouteGate(
  gate: ProductionRelationshipStageRouteGateV1,
  stats: {
    readonly creditedPositiveEpisodes: number;
    readonly distinctPositiveDays: number;
    readonly distinctPositiveWeeks: number;
    readonly distinctPositiveFamilies: number;
    readonly milestoneCount: number;
  },
): boolean {
  return (
    stats.creditedPositiveEpisodes >= (gate.creditedPositiveEpisodes ?? 0) &&
    stats.distinctPositiveDays >= (gate.distinctPositiveDays ?? 0) &&
    stats.distinctPositiveWeeks >= (gate.positiveWeeks ?? 0) &&
    stats.distinctPositiveFamilies >= (gate.positiveFamilies ?? 0) &&
    stats.milestoneCount >= (gate.milestones ?? 0)
  );
}

function meetsStageGate(
  gate: ProductionRelationshipStageGateV1,
  scores: ProductionRelationshipScoreVectorV1,
  stats: {
    readonly creditedPositiveEpisodes: number;
    readonly distinctPositiveDays: number;
    readonly distinctPositiveWeeks: number;
    readonly distinctPositiveFamilies: number;
    readonly milestoneCount: number;
  },
): boolean {
  if (
    scores.closeness < gate.scoreFloor.closeness ||
    scores.trust < gate.scoreFloor.trust
  ) {
    return false;
  }

  if (gate.common !== undefined) {
    return meetsRouteGate(gate.common, stats);
  }

  return (
    (gate.diverseOrganic !== undefined &&
      meetsRouteGate(gate.diverseOrganic, stats)) ||
    (gate.sustainedNarrow !== undefined &&
      meetsRouteGate(gate.sustainedNarrow, stats))
  );
}

function resolveCandidateStage(
  scores: ProductionRelationshipScoreVectorV1,
  stats: {
    readonly creditedPositiveEpisodes: number;
    readonly distinctPositiveDays: number;
    readonly distinctPositiveWeeks: number;
    readonly distinctPositiveFamilies: number;
    readonly milestoneCount: number;
  },
): ProductionRelationshipStageV1 {
  const gates = PRODUCTION_RELATIONSHIP_POLICY_ARTIFACT_V1.payload.stageGates;
  if (meetsStageGate(gates.S4_SPECIAL, scores, stats)) {
    return 'S4_SPECIAL';
  }
  if (meetsStageGate(gates.S3_OPENED, scores, stats)) {
    return 'S3_OPENED';
  }
  if (meetsStageGate(gates.S2_REGULAR, scores, stats)) {
    return 'S2_REGULAR';
  }
  if (meetsStageGate(gates.S1_FAMILIAR, scores, stats)) {
    return 'S1_FAMILIAR';
  }
  return 'S0_FIRST_MEETING';
}

function behaviorAccessFor(
  condition: ProductionRelationshipConditionV1,
): ProductionRelationshipBehaviorAccessV1 {
  return PRODUCTION_RELATIONSHIP_POLICY_ARTIFACT_V1.payload.behaviorAccess[
    condition
  ];
}

function payloadValue(
  event: ProductionRelationshipEventV1,
  key: string,
): string {
  const value = event.payload[key];
  if (value === undefined) {
    throw new ProductionRelationshipPolicyEvaluationErrorV1(
      'Validated payload is missing required key ' + key + '.',
    );
  }
  return value;
}

function onePredecessor(
  event: ProductionRelationshipEventV1,
): string {
  if (event.causalPredecessorEventIds.length !== 1) {
    throw new ProductionRelationshipPolicyEvaluationErrorV1(
      event.eventKind + ' requires exactly one causal predecessor.',
    );
  }
  return event.causalPredecessorEventIds[0]!;
}

function makeFamilyCounts(): Record<ProductionRelationshipFamilyV1, number> {
  return {
    commitment: 0,
    recognition: 0,
    care: 0,
    disclosure: 0,
    vulnerability: 0,
    conflict_repair: 0,
    return: 0,
  };
}

export function evaluateProductionRelationshipHistoryV1(
  inputEvents: readonly ProductionRelationshipEventV1[],
  options: { readonly physicalRevision?: number } = {},
): ProductionRelationshipProjectionV1 {
  const seenDedupeKeys = new Set<string>();
  const eventsById = new Map<string, ProductionRelationshipEventV1>();
  const eventToEpisodeId = new Map<string, string>();
  const episodeFamily = new Map<string, ProductionRelationshipFamilyV1>();
  const profileEpisodes = new Set<string>();
  const familyCounts = makeFamilyCounts();
  const familyCreditTimes = new Map<ProductionRelationshipFamilyV1, number[]>();
  const creditedEpisodeIds: string[] = [];
  const suppressedEpisodeIds: string[] = [];
  const positiveDays = new Set<string>();
  const positiveWeeks = new Set<number>();
  const positiveFamilies = new Set<ProductionRelationshipFamilyV1>();
  const milestoneKinds: ProductionRelationshipMilestoneKindV1[] = [];
  const resolvedCommitmentRoots = new Set<string>();
  const openConflictEventIds = new Set<string>();
  const resolvedConflictEventIds = new Set<string>();
  const decisions: ProductionRelationshipEventDecisionV1[] = [];

  let relationshipSubjectId: string | null = null;
  let relationshipCharacterId: string | null = null;
  let firstPositiveCreditAt: number | null = null;
  let scores: ProductionRelationshipScoreVectorV1 = Object.freeze({
    closeness: 0,
    trust: 0,
    friction: 0,
  });
  let attainedStage: ProductionRelationshipStageV1 = 'S0_FIRST_MEETING';
  let currentCandidateStage: ProductionRelationshipStageV1 =
    'S0_FIRST_MEETING';
  let currentCondition: ProductionRelationshipConditionV1 = 'STABLE';
  let evaluationSequence = 0;

  const registerEpisode = (
    episodeId: string,
    family: ProductionRelationshipFamilyV1,
  ): void => {
    if (!profileEpisodes.has(episodeId)) {
      profileEpisodes.add(episodeId);
      episodeFamily.set(episodeId, family);
      familyCounts[family] += 1;
    }
  };

  for (const rawEvent of inputEvents) {
    const event = validateProductionRelationshipEventV1(rawEvent);
    const rule = resolveProductionRelationshipEventRuleV1(
      event.eventKind,
      event.eventSchemaVersion,
    );

    if (relationshipSubjectId === null) {
      relationshipSubjectId = event.subjectId;
      relationshipCharacterId = event.characterId;
    } else if (
      event.subjectId !== relationshipSubjectId ||
      event.characterId !== relationshipCharacterId
    ) {
      throw new ProductionRelationshipPolicyEvaluationErrorV1(
        'One policy evaluation may contain only one subject-character relationship.',
      );
    }

    if (seenDedupeKeys.has(event.dedupeKey)) {
      decisions.push(
        Object.freeze({
          eventId: event.eventId,
          dedupeKey: event.dedupeKey,
          applied: false,
          duplicateRetry: true,
          evaluationSequenceBefore: evaluationSequence,
          evaluationSequenceAfter: evaluationSequence,
          episodeId: null,
          family: rule.family,
          effectDisposition: null,
          effectiveDelta: ZERO_DELTA,
          creditedPositiveEpisode: false,
          milestoneKind: null,
        }),
      );
      continue;
    }
    seenDedupeKeys.add(event.dedupeKey);

    if (eventsById.has(event.eventId)) {
      throw new ProductionRelationshipPolicyEvaluationErrorV1(
        'eventId must be unique in relationship history.',
      );
    }

    const evaluationSequenceBefore = evaluationSequence;
    evaluationSequence += 1;
    eventsById.set(event.eventId, event);

    let episodeId: string | null = null;
    let effectiveDelta = ZERO_DELTA;
    let effectDisposition: ProductionRelationshipEffectDispositionV1 =
      'NON_PROGRESSION';
    let creditedPositiveEpisode = false;
    let creditedMilestone: ProductionRelationshipMilestoneKindV1 | null = null;

    if (event.eventKind === 'COMMITMENT_MADE') {
      if (event.causalPredecessorEventIds.length !== 0) {
        throw new ProductionRelationshipPolicyEvaluationErrorV1(
          'COMMITMENT_MADE cannot have a causal predecessor.',
        );
      }
      episodeId = 'episode:' + event.eventId;
      eventToEpisodeId.set(event.eventId, episodeId);
      registerEpisode(episodeId, 'commitment');
    } else if (
      event.eventKind === 'COMMITMENT_KEPT' ||
      event.eventKind === 'COMMITMENT_BROKEN'
    ) {
      const predecessorId = onePredecessor(event);
      const predecessor = eventsById.get(predecessorId);
      if (
        predecessor === undefined ||
        predecessor.eventKind !== 'COMMITMENT_MADE'
      ) {
        throw new ProductionRelationshipPolicyEvaluationErrorV1(
          event.eventKind + ' requires a prior COMMITMENT_MADE predecessor.',
        );
      }
      if (
        payloadValue(predecessor, 'commitmentKey') !==
        payloadValue(event, 'commitmentKey')
      ) {
        throw new ProductionRelationshipPolicyEvaluationErrorV1(
          'Commitment outcome must match the predecessor commitmentKey.',
        );
      }
      if (resolvedCommitmentRoots.has(predecessorId)) {
        throw new ProductionRelationshipPolicyEvaluationErrorV1(
          'A commitment Episode may have only one terminal outcome.',
        );
      }
      resolvedCommitmentRoots.add(predecessorId);
      episodeId = eventToEpisodeId.get(predecessorId) ?? null;
      if (episodeId === null) {
        throw new ProductionRelationshipPolicyEvaluationErrorV1(
          'Commitment predecessor is missing its causal Episode.',
        );
      }
      eventToEpisodeId.set(event.eventId, episodeId);

      if (event.eventKind === 'COMMITMENT_BROKEN') {
        effectiveDelta = rule.scoreDelta;
        effectDisposition = 'NEGATIVE';
        openConflictEventIds.add(event.eventId);
        currentCondition = 'OPEN_CONFLICT';
      }
    } else if (
      event.eventKind === 'CONFLICT_OPENED' ||
      event.eventKind === 'RELATIONAL_EXPECTATION_INVALIDATED'
    ) {
      if (event.causalPredecessorEventIds.length !== 0) {
        throw new ProductionRelationshipPolicyEvaluationErrorV1(
          event.eventKind + ' cannot have a causal predecessor in V1.',
        );
      }
      episodeId = 'episode:' + event.eventId;
      eventToEpisodeId.set(event.eventId, episodeId);
      registerEpisode(episodeId, 'conflict_repair');
      effectiveDelta = rule.scoreDelta;
      effectDisposition = 'NEGATIVE';
      openConflictEventIds.add(event.eventId);
      currentCondition = 'OPEN_CONFLICT';
    } else if (event.eventKind === 'RECONCILIATION') {
      const predecessorId = onePredecessor(event);
      const predecessor = eventsById.get(predecessorId);
      if (
        predecessor === undefined ||
        ![
          'COMMITMENT_BROKEN',
          'CONFLICT_OPENED',
          'RELATIONAL_EXPECTATION_INVALIDATED',
        ].includes(predecessor.eventKind)
      ) {
        throw new ProductionRelationshipPolicyEvaluationErrorV1(
          'RECONCILIATION requires a prior open conflict Event predecessor.',
        );
      }
      episodeId = eventToEpisodeId.get(predecessorId) ?? null;
      if (episodeId === null) {
        throw new ProductionRelationshipPolicyEvaluationErrorV1(
          'Reconciliation predecessor is missing its causal Episode.',
        );
      }
      eventToEpisodeId.set(event.eventId, episodeId);

      if (openConflictEventIds.has(predecessorId)) {
        openConflictEventIds.delete(predecessorId);
        resolvedConflictEventIds.add(predecessorId);
        effectiveDelta = rule.scoreDelta;
        currentCondition =
          openConflictEventIds.size > 0
            ? 'OPEN_CONFLICT'
            : 'RESOLVED_RECENTLY';
      }
    } else {
      if (event.causalPredecessorEventIds.length !== 0) {
        throw new ProductionRelationshipPolicyEvaluationErrorV1(
          event.eventKind + ' cannot have a causal predecessor in V1.',
        );
      }
      episodeId = 'episode:' + event.eventId;
      eventToEpisodeId.set(event.eventId, episodeId);
      registerEpisode(episodeId, rule.family);
    }

    if (rule.polarity === 'positive' && rule.progressionEligible) {
      if (episodeId === null) {
        throw new ProductionRelationshipPolicyEvaluationErrorV1(
          'Positive progression Event is missing its causal Episode.',
        );
      }

      const at = Date.parse(event.occurredAt);
      const lowerExclusive =
        at -
        PRODUCTION_RELATIONSHIP_POLICY_ARTIFACT_V1.payload.antiFarming
          .rollingWindowDays *
          DAY_MS;
      const activeFamilyCredits = (
        familyCreditTimes.get(rule.family) ?? []
      ).filter((timestamp) => timestamp > lowerExclusive);

      if (
        activeFamilyCredits.length >=
        PRODUCTION_RELATIONSHIP_POLICY_ARTIFACT_V1.payload.antiFarming
          .maxPositiveCreditsPerFamilyWindow
      ) {
        effectDisposition = 'SUPPRESSED_POSITIVE_CREDIT';
        suppressedEpisodeIds.push(episodeId);
        familyCreditTimes.set(rule.family, activeFamilyCredits);
      } else {
        activeFamilyCredits.push(at);
        familyCreditTimes.set(rule.family, activeFamilyCredits);
        creditedPositiveEpisode = true;
        creditedEpisodeIds.push(episodeId);
        positiveFamilies.add(rule.family);
        positiveDays.add(new Date(at).toISOString().slice(0, 10));
        if (firstPositiveCreditAt === null) {
          firstPositiveCreditAt = at;
        }
        positiveWeeks.add(
          Math.floor((at - firstPositiveCreditAt) / WEEK_MS),
        );
        if (rule.milestoneKind !== null) {
          milestoneKinds.push(rule.milestoneKind);
          creditedMilestone = rule.milestoneKind;
        }
        effectiveDelta = rule.scoreDelta;
        effectDisposition = 'APPLIED';

        if (
          currentCondition === 'RESOLVED_RECENTLY' &&
          rule.family !== 'conflict_repair'
        ) {
          currentCondition = 'STABLE';
        }
      }
    } else if (
      rule.polarity === 'negative' &&
      effectDisposition !== 'NEGATIVE'
    ) {
      effectiveDelta = rule.scoreDelta;
      effectDisposition = 'NEGATIVE';
    } else if (
      rule.polarity === 'repair' ||
      rule.polarity === 'neutral'
    ) {
      effectDisposition = 'NON_PROGRESSION';
    }

    scores = applyDelta(scores, effectiveDelta);

    const stats = {
      creditedPositiveEpisodes: creditedEpisodeIds.length,
      distinctPositiveDays: positiveDays.size,
      distinctPositiveWeeks: positiveWeeks.size,
      distinctPositiveFamilies: positiveFamilies.size,
      milestoneCount: milestoneKinds.length,
    };
    currentCandidateStage = resolveCandidateStage(scores, stats);

    if (
      currentCondition ===
        PRODUCTION_RELATIONSHIP_POLICY_ARTIFACT_V1.payload.condition
          .promotionRequires &&
      STAGE_ORDER[currentCandidateStage] > STAGE_ORDER[attainedStage]
    ) {
      attainedStage = currentCandidateStage;
    }

    decisions.push(
      Object.freeze({
        eventId: event.eventId,
        dedupeKey: event.dedupeKey,
        applied: true,
        duplicateRetry: false,
        evaluationSequenceBefore,
        evaluationSequenceAfter: evaluationSequence,
        episodeId,
        family: rule.family,
        effectDisposition,
        effectiveDelta,
        creditedPositiveEpisode,
        milestoneKind: creditedMilestone,
      }),
    );
  }

  const profile: ProductionRelationshipEpisodeProfileV1 = Object.freeze({
    familyCounts: Object.freeze({ ...familyCounts }),
    creditedPositiveEpisodes: creditedEpisodeIds.length,
    suppressedPositiveEpisodes: suppressedEpisodeIds.length,
    distinctPositiveDays: positiveDays.size,
    distinctPositiveWeeks: positiveWeeks.size,
    distinctPositiveFamilies: positiveFamilies.size,
    milestoneCount: milestoneKinds.length,
    milestoneKinds: Object.freeze([...milestoneKinds]),
  });

  return Object.freeze({
    policyVersion: PRODUCTION_RELATIONSHIP_POLICY_VERSION_V1,
    policyContentHash:
      PRODUCTION_RELATIONSHIP_POLICY_ARTIFACT_V1.contentHash,
    revision: options.physicalRevision ?? evaluationSequence,
    evaluatedEventCount: evaluationSequence,
    scores,
    attainedStage,
    currentCandidateStage,
    currentCondition,
    behaviorAccess: behaviorAccessFor(currentCondition),
    episodeProfile: profile,
    creditedEpisodeIds: Object.freeze([...creditedEpisodeIds]),
    suppressedEpisodeIds: Object.freeze([...suppressedEpisodeIds]),
    unresolvedConflictEventIds: Object.freeze([...openConflictEventIds]),
    decisions: Object.freeze([...decisions]),
  });
}

export function evaluateProductionRelationshipIncrementV1(input: {
  readonly history: readonly ProductionRelationshipEventV1[];
  readonly event: ProductionRelationshipEventV1;
}): ProductionRelationshipProjectionV1 {
  return evaluateProductionRelationshipHistoryV1([
    ...input.history,
    input.event,
  ]);
}
