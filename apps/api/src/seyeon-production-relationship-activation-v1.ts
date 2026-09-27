import type {
  SeyeonProductionRelationshipRuntimeOverlayV1,
} from '../../../packages/domain/src/index.js';
import type {
  SeyeonProductionRelationshipModeV1,
} from './seyeon-production-relationship-sync-v1.js';
import type {
  SeyeonProductionRelationshipTurnBindingV1,
} from './seyeon-production-relationship-read-v1.js';

export const SEYEON_PRODUCTION_RELATIONSHIP_ACTIVATION_VERSION_V1 =
  'seyeon-production-relationship-activation-v1' as const;

export interface SeyeonProductionRelationshipActivationV1 {
  readonly version: typeof SEYEON_PRODUCTION_RELATIONSHIP_ACTIVATION_VERSION_V1;
  readonly mode: SeyeonProductionRelationshipModeV1;
  readonly admissionEnabled: boolean;
  readonly productionWriteEnabled: boolean;
  readonly behaviorShadowEnabled: boolean;
  readonly behaviorLiveEnabled: boolean;
  readonly appliedRelationshipSemantics:
    | SeyeonProductionRelationshipRuntimeOverlayV1
    | null;
  readonly shadowRelationshipSemantics:
    | SeyeonProductionRelationshipRuntimeOverlayV1
    | null;
}

export function resolveSeyeonProductionRelationshipActivationV1(input: {
  readonly mode: SeyeonProductionRelationshipModeV1;
  readonly turnBinding: SeyeonProductionRelationshipTurnBindingV1;
}): SeyeonProductionRelationshipActivationV1 {
  const semantics = input.turnBinding.relationshipSemantics;

  switch (input.mode) {
    case 'OFF':
      return Object.freeze({
        version: SEYEON_PRODUCTION_RELATIONSHIP_ACTIVATION_VERSION_V1,
        mode: 'OFF' as const,
        admissionEnabled: false,
        productionWriteEnabled: false,
        behaviorShadowEnabled: false,
        behaviorLiveEnabled: false,
        appliedRelationshipSemantics: null,
        shadowRelationshipSemantics: null,
      });
    case 'SHADOW':
      return Object.freeze({
        version: SEYEON_PRODUCTION_RELATIONSHIP_ACTIVATION_VERSION_V1,
        mode: 'SHADOW' as const,
        admissionEnabled: true,
        productionWriteEnabled: false,
        behaviorShadowEnabled: false,
        behaviorLiveEnabled: false,
        appliedRelationshipSemantics: null,
        shadowRelationshipSemantics: null,
      });
    case 'WRITE_DARK':
      return Object.freeze({
        version: SEYEON_PRODUCTION_RELATIONSHIP_ACTIVATION_VERSION_V1,
        mode: 'WRITE_DARK' as const,
        admissionEnabled: true,
        productionWriteEnabled: true,
        behaviorShadowEnabled: false,
        behaviorLiveEnabled: false,
        appliedRelationshipSemantics: null,
        shadowRelationshipSemantics: null,
      });
    case 'BEHAVIOR_SHADOW':
      return Object.freeze({
        version: SEYEON_PRODUCTION_RELATIONSHIP_ACTIVATION_VERSION_V1,
        mode: 'BEHAVIOR_SHADOW' as const,
        admissionEnabled: true,
        productionWriteEnabled: true,
        behaviorShadowEnabled: true,
        behaviorLiveEnabled: false,
        appliedRelationshipSemantics: null,
        shadowRelationshipSemantics: semantics,
      });
    case 'LIVE':
      return Object.freeze({
        version: SEYEON_PRODUCTION_RELATIONSHIP_ACTIVATION_VERSION_V1,
        mode: 'LIVE' as const,
        admissionEnabled: true,
        productionWriteEnabled: true,
        behaviorShadowEnabled: false,
        behaviorLiveEnabled: true,
        appliedRelationshipSemantics: semantics,
        shadowRelationshipSemantics: null,
      });
  }
}
