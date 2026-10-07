import {
  SEYEON_RELATIONSHIP_STATE_SHADOW_VERSION_V2,
  type SeyeonCurrentRelationshipConditionV2,
  type SeyeonRelationshipBehaviorAccessV2,
} from './seyeon-relationship-semantics-v2.js';

export const SEYEON_RELATIONSHIP_RUNTIME_OVERLAY_VERSION_V2 =
  'seyeon-relationship-runtime-overlay-v2' as const;

export const SEYEON_RELATIONSHIP_RUNTIME_OVERLAY_AUTHORITY_V2 =
  'experimental_behavior_overlay_not_relationship_authority' as const;

const CURRENT_CONDITIONS = Object.freeze([
  'STABLE',
  'OPEN_CONFLICT',
  'RESOLVED_RECENTLY',
] as const satisfies readonly SeyeonCurrentRelationshipConditionV2[]);

const BEHAVIOR_ACCESS = Object.freeze([
  'STAGE_ALIGNED',
  'RESTRICTED_BY_CONFLICT',
  'CAUTIOUS_AFTER_REPAIR',
] as const satisfies readonly SeyeonRelationshipBehaviorAccessV2[]);

export interface SeyeonRelationshipRuntimeOverlayV2 {
  readonly schemaVersion: typeof SEYEON_RELATIONSHIP_RUNTIME_OVERLAY_VERSION_V2;
  readonly authority: typeof SEYEON_RELATIONSHIP_RUNTIME_OVERLAY_AUTHORITY_V2;
  readonly source: Readonly<{
    readonly schemaVersion: typeof SEYEON_RELATIONSHIP_STATE_SHADOW_VERSION_V2;
    readonly authority: 'experimental_shadow_not_production_authority';
  }>;
  readonly characterId: 'seyeon';
  readonly currentCondition: SeyeonCurrentRelationshipConditionV2;
  readonly behaviorAccess: SeyeonRelationshipBehaviorAccessV2;
  readonly constraints: Readonly<{
    readonly mayOverrideRelationshipState: false;
    readonly mayOverrideRelationshipBands: false;
    readonly mayUnlockDisclosure: false;
    readonly mayCreateCharacterFact: false;
    readonly mayCreateSharedHistory: false;
    readonly mayCreateRelationshipEvent: false;
    readonly mayMutateRelationshipState: false;
    readonly mayAppendDurableMemory: false;
  }>;
}

export class SeyeonRelationshipRuntimeOverlayErrorV2 extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SeyeonRelationshipRuntimeOverlayErrorV2';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function oneOf<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
  path: string,
): T[number] {
  if (typeof value !== 'string' || !allowed.includes(value as T[number])) {
    throw new SeyeonRelationshipRuntimeOverlayErrorV2(
      `${path} is outside the experimental relationship runtime vocabulary.`,
    );
  }
  return value as T[number];
}

export function projectSeyeonRelationshipRuntimeOverlayV2(
  shadow: unknown,
): SeyeonRelationshipRuntimeOverlayV2 {
  if (!isRecord(shadow)) {
    throw new SeyeonRelationshipRuntimeOverlayErrorV2(
      'Relationship semantics shadow must be an object.',
    );
  }
  if (shadow.schemaVersion !== SEYEON_RELATIONSHIP_STATE_SHADOW_VERSION_V2) {
    throw new SeyeonRelationshipRuntimeOverlayErrorV2(
      'Relationship semantics shadow schemaVersion is invalid.',
    );
  }
  if (shadow.authority !== 'experimental_shadow_not_production_authority') {
    throw new SeyeonRelationshipRuntimeOverlayErrorV2(
      'Relationship semantics must remain explicitly experimental/non-production.',
    );
  }
  if (shadow.characterId !== 'seyeon') {
    throw new SeyeonRelationshipRuntimeOverlayErrorV2(
      'Relationship semantics shadow must belong to Se-yeon.',
    );
  }

  return Object.freeze({
    schemaVersion: SEYEON_RELATIONSHIP_RUNTIME_OVERLAY_VERSION_V2,
    authority: SEYEON_RELATIONSHIP_RUNTIME_OVERLAY_AUTHORITY_V2,
    source: Object.freeze({
      schemaVersion: SEYEON_RELATIONSHIP_STATE_SHADOW_VERSION_V2,
      authority: 'experimental_shadow_not_production_authority' as const,
    }),
    characterId: 'seyeon' as const,
    currentCondition: oneOf(
      shadow.currentCondition,
      CURRENT_CONDITIONS,
      'relationshipSemantics.currentCondition',
    ),
    behaviorAccess: oneOf(
      shadow.behaviorAccess,
      BEHAVIOR_ACCESS,
      'relationshipSemantics.behaviorAccess',
    ),
    constraints: Object.freeze({
      mayOverrideRelationshipState: false as const,
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
