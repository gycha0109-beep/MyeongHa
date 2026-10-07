import {
  createImmutableArtifact,
  type ImmutableArtifact,
} from './registry.js';
import {
  PRODUCTION_RELATIONSHIP_EVENT_REGISTRY_V1,
  type ProductionRelationshipEventRuleV1,
} from './relationship-event-registry-v1.js';

export const PRODUCTION_RELATIONSHIP_POLICY_SCHEMA_VERSION_V1 =
  'relationship-policy-definition-v1' as const;
export const PRODUCTION_RELATIONSHIP_POLICY_VERSION_V1 =
  'relationship-policy-v1' as const;

export const PRODUCTION_RELATIONSHIP_STAGES_V1 = Object.freeze([
  'S0_FIRST_MEETING',
  'S1_FAMILIAR',
  'S2_REGULAR',
  'S3_OPENED',
  'S4_SPECIAL',
] as const);

export type ProductionRelationshipStageV1 =
  (typeof PRODUCTION_RELATIONSHIP_STAGES_V1)[number];

export type ProductionRelationshipConditionV1 =
  | 'STABLE'
  | 'OPEN_CONFLICT'
  | 'RESOLVED_RECENTLY';

export type ProductionRelationshipBehaviorAccessV1 =
  | 'STAGE_ALIGNED'
  | 'RESTRICTED_BY_CONFLICT'
  | 'CAUTIOUS_AFTER_REPAIR';

export interface ProductionRelationshipScoreVectorV1 {
  readonly closeness: number;
  readonly trust: number;
  readonly friction: number;
}

export interface ProductionRelationshipStageRouteGateV1 {
  readonly positiveWeeks?: number;
  readonly positiveFamilies?: number;
  readonly creditedPositiveEpisodes?: number;
  readonly milestones?: number;
  readonly distinctPositiveDays?: number;
}

export interface ProductionRelationshipStageGateV1 {
  readonly scoreFloor: Readonly<{
    readonly closeness: number;
    readonly trust: number;
  }>;
  readonly common?: ProductionRelationshipStageRouteGateV1;
  readonly diverseOrganic?: ProductionRelationshipStageRouteGateV1;
  readonly sustainedNarrow?: ProductionRelationshipStageRouteGateV1;
}

export interface ProductionRelationshipPolicyDefinitionV1 {
  readonly schemaVersion: typeof PRODUCTION_RELATIONSHIP_POLICY_SCHEMA_VERSION_V1;
  readonly authority: 'source_owner_frozen_production_policy';
  readonly policyVersion: typeof PRODUCTION_RELATIONSHIP_POLICY_VERSION_V1;
  readonly scores: Readonly<{
    readonly bounds: Readonly<{
      readonly closeness: readonly [0, 100];
      readonly trust: readonly [0, 100];
      readonly friction: readonly [0, 100];
    }>;
    readonly positiveSoftCap: 'DISABLED';
    readonly automaticInactivityDecay: false;
    readonly qualitativeHistoryAuthority: 'CAUSAL_EPISODE_PROFILE';
  }>;
  readonly stages: Readonly<{
    readonly order: readonly ProductionRelationshipStageV1[];
    readonly semantics: Readonly<Record<ProductionRelationshipStageV1, string>>;
    readonly s4IsRomanceConfirmation: false;
    readonly ordinaryConflictMayRegressAttainedStage: false;
    readonly correctionRetractionReplayMayLowerAttainedStage: true;
  }>;
  readonly stageGates: Readonly<
    Record<Exclude<ProductionRelationshipStageV1, 'S0_FIRST_MEETING'>, ProductionRelationshipStageGateV1>
  >;
  readonly antiFarming: Readonly<{
    readonly unit: 'CAUSAL_EPISODE';
    readonly rollingWindowDays: 7;
    readonly maxPositiveCreditsPerFamilyWindow: 2;
    readonly rawMessageVolumeCreatesProgression: false;
    readonly visitOnlyCreatesProgression: false;
    readonly calendarAgeAloneCreatesProgression: false;
  }>;
  readonly condition: Readonly<{
    readonly values: readonly ProductionRelationshipConditionV1[];
    readonly promotionRequires: 'STABLE';
    readonly repairMovesTo: 'RESOLVED_RECENTLY';
    readonly resolvedRecentlyReturnsToStableOn:
      'NEXT_NON_REPAIR_CREDITED_POSITIVE_CAUSAL_EPISODE';
  }>;
  readonly behaviorAccess: Readonly<{
    readonly STABLE: 'STAGE_ALIGNED';
    readonly OPEN_CONFLICT: 'RESTRICTED_BY_CONFLICT';
    readonly RESOLVED_RECENTLY: 'CAUTIOUS_AFTER_REPAIR';
  }>;
  readonly repair: Readonly<{
    readonly positiveProgressionCredit: 0;
    readonly milestoneCredit: 0;
    readonly advancesAttainedDepthDirectly: false;
  }>;
  readonly eventRegistry: readonly ProductionRelationshipEventRuleV1[];
  readonly replay: Readonly<{
    readonly strategy: 'SNAPSHOT_ASSISTED_APPEND_ONLY_DETERMINISTIC_REPLAY';
    readonly llmInsideReplay: false;
    readonly policyUpgradeDefault: 'PROSPECTIVE_ONLY';
    readonly historicalEventRewriteAllowed: false;
    readonly zeroPositiveEffectEventConsumesRevision: true;
  }>;
}

export const PRODUCTION_RELATIONSHIP_POLICY_DEFINITION_V1: ProductionRelationshipPolicyDefinitionV1 =
  Object.freeze({
    schemaVersion: PRODUCTION_RELATIONSHIP_POLICY_SCHEMA_VERSION_V1,
    authority: 'source_owner_frozen_production_policy' as const,
    policyVersion: PRODUCTION_RELATIONSHIP_POLICY_VERSION_V1,
    scores: Object.freeze({
      bounds: Object.freeze({
        closeness: Object.freeze([0, 100] as const),
        trust: Object.freeze([0, 100] as const),
        friction: Object.freeze([0, 100] as const),
      }),
      positiveSoftCap: 'DISABLED' as const,
      automaticInactivityDecay: false as const,
      qualitativeHistoryAuthority: 'CAUSAL_EPISODE_PROFILE' as const,
    }),
    stages: Object.freeze({
      order: PRODUCTION_RELATIONSHIP_STAGES_V1,
      semantics: Object.freeze({
        S0_FIRST_MEETING: 'relationship formation not yet established',
        S1_FAMILIAR: 'familiar and recognized recurring counterpart',
        S2_REGULAR: 'sustained regular relationship',
        S3_OPENED: 'high openness and trust',
        S4_SPECIAL:
          'special relational importance distinct from ordinary relationships',
      }),
      s4IsRomanceConfirmation: false as const,
      ordinaryConflictMayRegressAttainedStage: false as const,
      correctionRetractionReplayMayLowerAttainedStage: true as const,
    }),
    stageGates: Object.freeze({
      S1_FAMILIAR: Object.freeze({
        scoreFloor: Object.freeze({ closeness: 10, trust: 5 }),
        common: Object.freeze({
          creditedPositiveEpisodes: 2,
          distinctPositiveDays: 2,
        }),
      }),
      S2_REGULAR: Object.freeze({
        scoreFloor: Object.freeze({ closeness: 25, trust: 20 }),
        diverseOrganic: Object.freeze({
          positiveWeeks: 4,
          positiveFamilies: 3,
          creditedPositiveEpisodes: 6,
        }),
        sustainedNarrow: Object.freeze({
          positiveWeeks: 8,
          positiveFamilies: 2,
        }),
      }),
      S3_OPENED: Object.freeze({
        scoreFloor: Object.freeze({ closeness: 55, trust: 50 }),
        diverseOrganic: Object.freeze({
          positiveWeeks: 10,
          positiveFamilies: 4,
          creditedPositiveEpisodes: 16,
          milestones: 1,
        }),
        sustainedNarrow: Object.freeze({
          positiveWeeks: 20,
          positiveFamilies: 2,
          milestones: 1,
        }),
      }),
      S4_SPECIAL: Object.freeze({
        scoreFloor: Object.freeze({ closeness: 80, trust: 75 }),
        diverseOrganic: Object.freeze({
          positiveWeeks: 20,
          positiveFamilies: 4,
          creditedPositiveEpisodes: 32,
          milestones: 3,
        }),
        sustainedNarrow: Object.freeze({
          positiveWeeks: 40,
          positiveFamilies: 2,
          milestones: 3,
        }),
      }),
    }),
    antiFarming: Object.freeze({
      unit: 'CAUSAL_EPISODE' as const,
      rollingWindowDays: 7 as const,
      maxPositiveCreditsPerFamilyWindow: 2 as const,
      rawMessageVolumeCreatesProgression: false as const,
      visitOnlyCreatesProgression: false as const,
      calendarAgeAloneCreatesProgression: false as const,
    }),
    condition: Object.freeze({
      values: Object.freeze([
        'STABLE',
        'OPEN_CONFLICT',
        'RESOLVED_RECENTLY',
      ] as const),
      promotionRequires: 'STABLE' as const,
      repairMovesTo: 'RESOLVED_RECENTLY' as const,
      resolvedRecentlyReturnsToStableOn:
        'NEXT_NON_REPAIR_CREDITED_POSITIVE_CAUSAL_EPISODE' as const,
    }),
    behaviorAccess: Object.freeze({
      STABLE: 'STAGE_ALIGNED' as const,
      OPEN_CONFLICT: 'RESTRICTED_BY_CONFLICT' as const,
      RESOLVED_RECENTLY: 'CAUTIOUS_AFTER_REPAIR' as const,
    }),
    repair: Object.freeze({
      positiveProgressionCredit: 0 as const,
      milestoneCredit: 0 as const,
      advancesAttainedDepthDirectly: false as const,
    }),
    eventRegistry: PRODUCTION_RELATIONSHIP_EVENT_REGISTRY_V1,
    replay: Object.freeze({
      strategy: 'SNAPSHOT_ASSISTED_APPEND_ONLY_DETERMINISTIC_REPLAY' as const,
      llmInsideReplay: false as const,
      policyUpgradeDefault: 'PROSPECTIVE_ONLY' as const,
      historicalEventRewriteAllowed: false as const,
      zeroPositiveEffectEventConsumesRevision: true as const,
    }),
  });

export const PRODUCTION_RELATIONSHIP_POLICY_ARTIFACT_V1: ImmutableArtifact<ProductionRelationshipPolicyDefinitionV1> =
  createImmutableArtifact(
    'production-relationship-policy',
    PRODUCTION_RELATIONSHIP_POLICY_VERSION_V1,
    PRODUCTION_RELATIONSHIP_POLICY_DEFINITION_V1,
  );
