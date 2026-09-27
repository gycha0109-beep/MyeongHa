import {
  PRODUCTION_RELATIONSHIP_POLICY_ARTIFACT_V1,
  PRODUCTION_RELATIONSHIP_POLICY_VERSION_V1,
  type ProductionRelationshipBehaviorAccessV1,
  type ProductionRelationshipConditionV1,
  type ProductionRelationshipStageV1,
} from './relationship-policy-artifact-v1.js';

export const SEYEON_PRODUCTION_RELATIONSHIP_RUNTIME_OVERLAY_VERSION_V1 =
  'seyeon-production-relationship-runtime-overlay-v1' as const;

export const SEYEON_PRODUCTION_RELATIONSHIP_RUNTIME_AUTHORITY_V1 =
  'production_relationship_behavior_authority_v1' as const;

export interface SeyeonProductionRelationshipRuntimeStateV1 {
  readonly stateId: string;
  readonly subjectId: string;
  readonly characterId: 'seyeon';
  readonly closeness: number;
  readonly trust: number;
  readonly friction: number;
  readonly attainedStage: ProductionRelationshipStageV1;
  readonly currentCandidateStage: ProductionRelationshipStageV1;
  readonly currentCondition: ProductionRelationshipConditionV1;
  readonly policyVersion: string;
  readonly policyContentHash: string;
  readonly policyStateSchemaVersion: string;
  readonly policyStateJsonb: unknown;
  readonly revision: number;
  readonly lastInteractionAt: string | null;
  readonly updatedAt: string;
}

export interface SeyeonProductionRelationshipRuntimeOverlayV1 {
  readonly schemaVersion:
    typeof SEYEON_PRODUCTION_RELATIONSHIP_RUNTIME_OVERLAY_VERSION_V1;
  readonly authority:
    typeof SEYEON_PRODUCTION_RELATIONSHIP_RUNTIME_AUTHORITY_V1;
  readonly characterId: 'seyeon';
  readonly source: Readonly<{
    readonly policyVersion: typeof PRODUCTION_RELATIONSHIP_POLICY_VERSION_V1;
    readonly policyContentHash: string;
    readonly relationshipRevision: number;
    readonly attainedStage: ProductionRelationshipStageV1;
    readonly currentCandidateStage: ProductionRelationshipStageV1;
  }>;
  readonly currentCondition: ProductionRelationshipConditionV1;
  readonly behaviorAccess: ProductionRelationshipBehaviorAccessV1;
  readonly constraints: Readonly<{
    readonly mayOverrideRelationshipState: true;
    readonly mayOverrideRelationshipBands: false;
    readonly mayUnlockDisclosure: false;
    readonly mayCreateCharacterFact: false;
    readonly mayCreateSharedHistory: false;
    readonly mayCreateRelationshipEvent: false;
    readonly mayMutateRelationshipState: false;
    readonly mayAppendDurableMemory: false;
  }>;
}

export class SeyeonProductionRelationshipRuntimeErrorV1 extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SeyeonProductionRelationshipRuntimeErrorV1';
  }
}

const STAGES = Object.freeze([
  'S0_FIRST_MEETING',
  'S1_FAMILIAR',
  'S2_REGULAR',
  'S3_OPENED',
  'S4_SPECIAL',
] as const satisfies readonly ProductionRelationshipStageV1[]);

const CONDITIONS = Object.freeze([
  'STABLE',
  'OPEN_CONFLICT',
  'RESOLVED_RECENTLY',
] as const satisfies readonly ProductionRelationshipConditionV1[]);

function requireString(value: unknown, path: string, max = 256): string {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    value.trim().length > max
  ) {
    throw new SeyeonProductionRelationshipRuntimeErrorV1(
      path + ' must be bounded non-empty text.',
    );
  }
  return value.trim();
}

function requireScore(value: unknown, path: string): number {
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 100) {
    throw new SeyeonProductionRelationshipRuntimeErrorV1(
      path + ' must be an integer from 0 to 100.',
    );
  }
  return value as number;
}

function requireRevision(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new SeyeonProductionRelationshipRuntimeErrorV1(
      'relationship revision must be a non-negative safe integer.',
    );
  }
  return value as number;
}

function requireStage(
  value: unknown,
  path: string,
): ProductionRelationshipStageV1 {
  if (
    typeof value !== 'string' ||
    !STAGES.includes(value as ProductionRelationshipStageV1)
  ) {
    throw new SeyeonProductionRelationshipRuntimeErrorV1(
      path + ' is outside Production relationship stages.',
    );
  }
  return value as ProductionRelationshipStageV1;
}

function requireCondition(
  value: unknown,
): ProductionRelationshipConditionV1 {
  if (
    typeof value !== 'string' ||
    !CONDITIONS.includes(value as ProductionRelationshipConditionV1)
  ) {
    throw new SeyeonProductionRelationshipRuntimeErrorV1(
      'currentCondition is outside Production relationship conditions.',
    );
  }
  return value as ProductionRelationshipConditionV1;
}

function requireInstant(value: unknown, path: string): string {
  const text = requireString(value, path, 64);
  const timestamp = Date.parse(text);
  if (!Number.isFinite(timestamp)) {
    throw new SeyeonProductionRelationshipRuntimeErrorV1(
      path + ' must be an ISO-compatible instant.',
    );
  }
  return new Date(timestamp).toISOString();
}

export function validateSeyeonProductionRelationshipRuntimeStateV1(
  input: SeyeonProductionRelationshipRuntimeStateV1,
): SeyeonProductionRelationshipRuntimeStateV1 {
  const policyVersion = requireString(input.policyVersion, 'policyVersion', 128);
  const policyContentHash = requireString(
    input.policyContentHash,
    'policyContentHash',
    128,
  );

  if (
    policyVersion !== PRODUCTION_RELATIONSHIP_POLICY_VERSION_V1 ||
    policyContentHash !== PRODUCTION_RELATIONSHIP_POLICY_ARTIFACT_V1.contentHash ||
    input.policyStateSchemaVersion !== 'relationship-policy-state-v1'
  ) {
    throw new SeyeonProductionRelationshipRuntimeErrorV1(
      'Se-yeon runtime relationship state is not bound to the frozen Production V1 policy.',
    );
  }
  if (input.characterId !== 'seyeon') {
    throw new SeyeonProductionRelationshipRuntimeErrorV1(
      'Production Se-yeon relationship state must belong to seyeon.',
    );
  }
  if (
    typeof input.policyStateJsonb !== 'object' ||
    input.policyStateJsonb === null ||
    Array.isArray(input.policyStateJsonb)
  ) {
    throw new SeyeonProductionRelationshipRuntimeErrorV1(
      'policyStateJsonb must be a derived object projection.',
    );
  }

  return Object.freeze({
    stateId: requireString(input.stateId, 'stateId'),
    subjectId: requireString(input.subjectId, 'subjectId'),
    characterId: 'seyeon' as const,
    closeness: requireScore(input.closeness, 'closeness'),
    trust: requireScore(input.trust, 'trust'),
    friction: requireScore(input.friction, 'friction'),
    attainedStage: requireStage(input.attainedStage, 'attainedStage'),
    currentCandidateStage: requireStage(
      input.currentCandidateStage,
      'currentCandidateStage',
    ),
    currentCondition: requireCondition(input.currentCondition),
    policyVersion,
    policyContentHash,
    policyStateSchemaVersion: 'relationship-policy-state-v1',
    policyStateJsonb: Object.freeze({ ...(input.policyStateJsonb as Record<string, unknown>) }),
    revision: requireRevision(input.revision),
    lastInteractionAt:
      input.lastInteractionAt === null
        ? null
        : requireInstant(input.lastInteractionAt, 'lastInteractionAt'),
    updatedAt: requireInstant(input.updatedAt, 'updatedAt'),
  });
}

export function projectSeyeonProductionRelationshipRuntimeOverlayV1(
  input: SeyeonProductionRelationshipRuntimeStateV1,
): SeyeonProductionRelationshipRuntimeOverlayV1 {
  const state = validateSeyeonProductionRelationshipRuntimeStateV1(input);
  const behaviorAccess =
    PRODUCTION_RELATIONSHIP_POLICY_ARTIFACT_V1.payload.behaviorAccess[
      state.currentCondition
    ];

  return Object.freeze({
    schemaVersion:
      SEYEON_PRODUCTION_RELATIONSHIP_RUNTIME_OVERLAY_VERSION_V1,
    authority: SEYEON_PRODUCTION_RELATIONSHIP_RUNTIME_AUTHORITY_V1,
    characterId: 'seyeon' as const,
    source: Object.freeze({
      policyVersion: PRODUCTION_RELATIONSHIP_POLICY_VERSION_V1,
      policyContentHash: PRODUCTION_RELATIONSHIP_POLICY_ARTIFACT_V1.contentHash,
      relationshipRevision: state.revision,
      attainedStage: state.attainedStage,
      currentCandidateStage: state.currentCandidateStage,
    }),
    currentCondition: state.currentCondition,
    behaviorAccess,
    constraints: Object.freeze({
      mayOverrideRelationshipState: true as const,
      mayOverrideRelationshipBands: false as const,
      mayUnlockDisclosure: false as const,
      mayCreateCharacterFact: false as const,
      mayCreateSharedHistory: false as const,
      mayCreateRelationshipEvent: false as const,
      mayMutateRelationshipState: false as const,
      mayAppendDurableMemory: false as const,
    }),
  });
}
