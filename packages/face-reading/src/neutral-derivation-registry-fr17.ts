import {
  FACELAB_NEUTRAL_BINDING_PROFILE_FR14,
  type NeutralAnchorConsumerSlotV1,
} from './neutral-provider-bindings-fr14.js';
import {
  FACELAB_PROVIDER_ADAPTER_EVIDENCE_FR16,
  type ProviderTopologyClassV1,
} from './provider-adapter-evidence-fr16.js';
import type { NeutralObservationGeometryV1 } from './neutral-observation-schema-fr15.js';
import { FaceAuthorityValidationError } from './validation.js';

export type NeutralDerivationKindV1 =
  | 'provider_topology_to_neutral_geometry'
  | 'neutral_geometry_composition';

export type NeutralDerivationReviewStateV1 =
  | 'blocked_unresolved'
  | 'blocked_dependency'
  | 'research_candidate'
  | 'reviewed';

export type NeutralDerivationFailureModeV1 = 'unavailable';

export interface NeutralDerivationDefinitionV1 {
  readonly derivationId: string;
  readonly version: string;
  readonly targetAnchorRef: string;
  readonly consumerSlot: NeutralAnchorConsumerSlotV1;
  readonly derivationKind: NeutralDerivationKindV1;
  readonly inputTopologyClasses: readonly ProviderTopologyClassV1[];
  readonly dependencyDerivationRefs: readonly string[];
  readonly outputGeometryKind: NeutralObservationGeometryV1['kind'];
  readonly reviewState: NeutralDerivationReviewStateV1;
  readonly algorithmRef: string | null;
  readonly evidenceRefs: readonly string[];
  readonly calibrationRefs: readonly string[];
  readonly qualityPrerequisites: readonly string[];
  readonly failureMode: NeutralDerivationFailureModeV1;
  readonly forbiddenShortcuts: readonly string[];
  readonly rationaleKey: string;
}

export interface NeutralDerivationRegistryV1 {
  readonly registryId: 'registry.face.neutral_derivations.fr17';
  readonly version: string;
  readonly authorityState: 'research_only';
  readonly providerEvidenceManifestRef: string;
  readonly consumerContractVersion: 'myeongha-neutral-observation-v1';
  readonly definitions: readonly NeutralDerivationDefinitionV1[];
}

export interface NeutralDerivationReadinessV1 {
  readonly productionReady: false;
  readonly executableDerivationRefs: readonly string[];
  readonly blockedDerivationRefs: readonly string[];
  readonly unresolvedRequiredRefs: readonly string[];
  readonly blockers: readonly string[];
}

const ALLOWED_REGISTRY_KEYS = new Set([
  'registryId',
  'version',
  'authorityState',
  'providerEvidenceManifestRef',
  'consumerContractVersion',
  'definitions',
]);

const ALLOWED_DEFINITION_KEYS = new Set([
  'derivationId',
  'version',
  'targetAnchorRef',
  'consumerSlot',
  'derivationKind',
  'inputTopologyClasses',
  'dependencyDerivationRefs',
  'outputGeometryKind',
  'reviewState',
  'algorithmRef',
  'evidenceRefs',
  'calibrationRefs',
  'qualityPrerequisites',
  'failureMode',
  'forbiddenShortcuts',
  'rationaleKey',
]);

const ALLOWED_REVIEW_STATES = new Set<NeutralDerivationReviewStateV1>([
  'blocked_unresolved',
  'blocked_dependency',
  'research_candidate',
  'reviewed',
]);

const ALLOWED_TOPOLOGY_CLASSES = new Set<ProviderTopologyClassV1>([
  'closed_cycle',
  'disconnected_open_chains',
  'branched_graph',
  'derived_point',
]);

const EXPECTED_PROVIDER_EVIDENCE_REF =
  `face-provider-adapter-evidence-fr16@${FACELAB_PROVIDER_ADAPTER_EVIDENCE_FR16.manifestVersion}`;

function exactKeys(value: object, allowed: ReadonlySet<string>, path: string): void {
  const unexpected = Object.keys(value).find((key) => !allowed.has(key));
  if (unexpected !== undefined) {
    throw new FaceAuthorityValidationError(`${path} contains unauthorized field: ${unexpected}`);
  }
}

function nonEmpty(value: string, path: string): void {
  if (value.trim().length === 0) throw new FaceAuthorityValidationError(`${path} must be non-empty.`);
}

function unique(values: readonly string[], path: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new FaceAuthorityValidationError(`${path} contains duplicate: ${value}`);
    seen.add(value);
  }
}

function expectedGeometryKind(slot: NeutralAnchorConsumerSlotV1): NeutralObservationGeometryV1['kind'] {
  if (slot === 'neutral.face.brow_midline') return 'point';
  if (slot === 'neutral.face.left_brow_region' || slot === 'neutral.face.right_brow_region') return 'curve';
  return 'region';
}

const DEFINITIONS_FR17: readonly NeutralDerivationDefinitionV1[] = Object.freeze([
  Object.freeze({
    derivationId: 'derivation.neutral.nose_region.pending',
    version: '0.1.0',
    targetAnchorRef: 'nose',
    consumerSlot: 'neutral.face.nose_region' as const,
    derivationKind: 'provider_topology_to_neutral_geometry' as const,
    inputTopologyClasses: Object.freeze(['branched_graph'] as const),
    dependencyDerivationRefs: Object.freeze([]),
    outputGeometryKind: 'region' as const,
    reviewState: 'blocked_unresolved' as const,
    algorithmRef: null,
    evidenceRefs: Object.freeze([
      'evidence.fr16.mediapipe.face_landmark_connections.current_upstream',
      'evidence.fr17.kbeauty.current_runtime.qualitative_vlm_only',
    ]),
    calibrationRefs: Object.freeze([]),
    qualityPrerequisites: Object.freeze(['neutral_pose_quality', 'neutral_nose_region']),
    failureMode: 'unavailable' as const,
    forbiddenShortcuts: Object.freeze([
      'convex_hull',
      'bounding_box',
      'manual_provider_index_subset',
      'hand_drawn_polygon',
    ]),
    rationaleKey: 'nose_provider_graph_has_no_authorized_single_boundary_derivation',
  }),
  Object.freeze({
    derivationId: 'derivation.neutral.left_brow_curve.pending',
    version: '0.1.0',
    targetAnchorRef: 'left_brow',
    consumerSlot: 'neutral.face.left_brow_region' as const,
    derivationKind: 'provider_topology_to_neutral_geometry' as const,
    inputTopologyClasses: Object.freeze(['disconnected_open_chains'] as const),
    dependencyDerivationRefs: Object.freeze([]),
    outputGeometryKind: 'curve' as const,
    reviewState: 'blocked_unresolved' as const,
    algorithmRef: null,
    evidenceRefs: Object.freeze([
      'evidence.fr16.mediapipe.face_landmark_connections.current_upstream',
      'evidence.fr17.kbeauty.current_runtime.qualitative_vlm_only',
    ]),
    calibrationRefs: Object.freeze([]),
    qualityPrerequisites: Object.freeze(['neutral_pose_quality', 'neutral_brow_regions']),
    failureMode: 'unavailable' as const,
    forbiddenShortcuts: Object.freeze([
      'first_chain_only',
      'second_chain_only',
      'bridge_disconnected_chains',
      'pointwise_average_without_correspondence_authority',
      'bezier_smoothing',
    ]),
    rationaleKey: 'left_brow_provider_graph_requires_reviewed_single_curve_representation',
  }),
  Object.freeze({
    derivationId: 'derivation.neutral.right_brow_curve.pending',
    version: '0.1.0',
    targetAnchorRef: 'right_brow',
    consumerSlot: 'neutral.face.right_brow_region' as const,
    derivationKind: 'provider_topology_to_neutral_geometry' as const,
    inputTopologyClasses: Object.freeze(['disconnected_open_chains'] as const),
    dependencyDerivationRefs: Object.freeze([]),
    outputGeometryKind: 'curve' as const,
    reviewState: 'blocked_unresolved' as const,
    algorithmRef: null,
    evidenceRefs: Object.freeze([
      'evidence.fr16.mediapipe.face_landmark_connections.current_upstream',
      'evidence.fr17.kbeauty.current_runtime.qualitative_vlm_only',
    ]),
    calibrationRefs: Object.freeze([]),
    qualityPrerequisites: Object.freeze(['neutral_pose_quality', 'neutral_brow_regions']),
    failureMode: 'unavailable' as const,
    forbiddenShortcuts: Object.freeze([
      'first_chain_only',
      'second_chain_only',
      'bridge_disconnected_chains',
      'pointwise_average_without_correspondence_authority',
      'bezier_smoothing',
    ]),
    rationaleKey: 'right_brow_provider_graph_requires_reviewed_single_curve_representation',
  }),
  Object.freeze({
    derivationId: 'derivation.neutral.brow_midline.pending',
    version: '0.1.0',
    targetAnchorRef: 'brow_midline',
    consumerSlot: 'neutral.face.brow_midline' as const,
    derivationKind: 'neutral_geometry_composition' as const,
    inputTopologyClasses: Object.freeze(['derived_point'] as const),
    dependencyDerivationRefs: Object.freeze([
      'derivation.neutral.left_brow_curve.pending',
      'derivation.neutral.right_brow_curve.pending',
    ]),
    outputGeometryKind: 'point' as const,
    reviewState: 'blocked_dependency' as const,
    algorithmRef: null,
    evidenceRefs: Object.freeze([
      'evidence.fr17.kbeauty.current_runtime.qualitative_vlm_only',
    ]),
    calibrationRefs: Object.freeze([]),
    qualityPrerequisites: Object.freeze([
      'neutral_pose_quality',
      'neutral_brow_regions',
      'neutral_brow_midline_derivation',
    ]),
    failureMode: 'unavailable' as const,
    forbiddenShortcuts: Object.freeze([
      'fixed_provider_landmark_index',
      'manual_pixel_midpoint',
      'midpoint_of_unreviewed_brow_representation',
    ]),
    rationaleKey: 'brow_midline_requires_reviewed_left_and_right_neutral_brow_geometry',
  }),
]);

export const NEUTRAL_DERIVATION_REGISTRY_FR17: NeutralDerivationRegistryV1 = Object.freeze({
  registryId: 'registry.face.neutral_derivations.fr17' as const,
  version: '0.1.0',
  authorityState: 'research_only' as const,
  providerEvidenceManifestRef: EXPECTED_PROVIDER_EVIDENCE_REF,
  consumerContractVersion: 'myeongha-neutral-observation-v1' as const,
  definitions: DEFINITIONS_FR17,
});

function validateDependencyGraph(definitions: readonly NeutralDerivationDefinitionV1[]): void {
  const byRef = new Map(definitions.map((definition) => [definition.derivationId, definition] as const));
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (ref: string): void => {
    if (visiting.has(ref)) throw new FaceAuthorityValidationError(`FR-17 derivation dependency cycle detected at: ${ref}`);
    if (visited.has(ref)) return;
    const definition = byRef.get(ref);
    if (definition === undefined) throw new FaceAuthorityValidationError(`FR-17 unknown derivation dependency: ${ref}`);
    visiting.add(ref);
    for (const dependencyRef of definition.dependencyDerivationRefs) visit(dependencyRef);
    visiting.delete(ref);
    visited.add(ref);
  };

  definitions.forEach((definition) => visit(definition.derivationId));
}

export function isNeutralDerivationExecutableFR17(
  definition: NeutralDerivationDefinitionV1,
  registry: NeutralDerivationRegistryV1 = NEUTRAL_DERIVATION_REGISTRY_FR17,
): boolean {
  if (definition.reviewState !== 'reviewed' || definition.algorithmRef === null) return false;
  const byRef = new Map(registry.definitions.map((entry) => [entry.derivationId, entry] as const));
  return definition.dependencyDerivationRefs.every((ref) => {
    const dependency = byRef.get(ref);
    return dependency !== undefined && dependency.reviewState === 'reviewed' && dependency.algorithmRef !== null;
  });
}

export function validateNeutralDerivationRegistryFR17(
  registry: NeutralDerivationRegistryV1 = NEUTRAL_DERIVATION_REGISTRY_FR17,
): NeutralDerivationRegistryV1 {
  exactKeys(registry, ALLOWED_REGISTRY_KEYS, 'FR-17 registry');
  if (registry.registryId !== 'registry.face.neutral_derivations.fr17') {
    throw new FaceAuthorityValidationError('FR-17 registryId mismatch.');
  }
  nonEmpty(registry.version, 'fr17.version');
  if (registry.authorityState !== 'research_only') {
    throw new FaceAuthorityValidationError('FR-17 registry authorityState must remain research_only.');
  }
  if (registry.providerEvidenceManifestRef !== EXPECTED_PROVIDER_EVIDENCE_REF) {
    throw new FaceAuthorityValidationError('FR-17 registry must pin the exact merged FR-16 provider evidence manifest version.');
  }
  if (registry.consumerContractVersion !== 'myeongha-neutral-observation-v1') {
    throw new FaceAuthorityValidationError('FR-17 consumer contract version mismatch.');
  }

  unique(registry.definitions.map((definition) => definition.derivationId), 'fr17.derivationIds');
  unique(registry.definitions.map((definition) => definition.targetAnchorRef), 'fr17.targetAnchorRefs');
  unique(registry.definitions.map((definition) => definition.consumerSlot), 'fr17.consumerSlots');

  const fr14Bindings = new Map(
    FACELAB_NEUTRAL_BINDING_PROFILE_FR14.bindings.map((binding) => [binding.anchorRef, binding] as const),
  );

  for (const definition of registry.definitions) {
    exactKeys(definition, ALLOWED_DEFINITION_KEYS, `FR-17 derivation ${definition.derivationId}`);
    nonEmpty(definition.derivationId, 'fr17.derivationId');
    nonEmpty(definition.version, `fr17.${definition.derivationId}.version`);
    nonEmpty(definition.rationaleKey, `fr17.${definition.derivationId}.rationaleKey`);
    if (!ALLOWED_REVIEW_STATES.has(definition.reviewState)) {
      throw new FaceAuthorityValidationError(`FR-17 invalid reviewState: ${String(definition.reviewState)}`);
    }
    const binding = fr14Bindings.get(definition.targetAnchorRef);
    if (binding === undefined) {
      throw new FaceAuthorityValidationError(`FR-17 derivation may target only FR-14 neutral anchors: ${definition.targetAnchorRef}`);
    }
    if (binding.consumerSlot !== definition.consumerSlot) {
      throw new FaceAuthorityValidationError(`FR-17 consumerSlot mismatch: ${definition.derivationId}`);
    }
    if (definition.outputGeometryKind !== expectedGeometryKind(definition.consumerSlot)) {
      throw new FaceAuthorityValidationError(`FR-17 outputGeometryKind mismatch: ${definition.derivationId}`);
    }
    if (definition.failureMode !== 'unavailable') {
      throw new FaceAuthorityValidationError(`FR-17 failureMode must remain unavailable: ${definition.derivationId}`);
    }
    if (definition.inputTopologyClasses.length === 0) {
      throw new FaceAuthorityValidationError(`FR-17 input topology class is required: ${definition.derivationId}`);
    }
    unique(definition.inputTopologyClasses, `fr17.${definition.derivationId}.inputTopologyClasses`);
    for (const topologyClass of definition.inputTopologyClasses) {
      if (!ALLOWED_TOPOLOGY_CLASSES.has(topologyClass)) {
        throw new FaceAuthorityValidationError(`FR-17 unknown topology class: ${String(topologyClass)}`);
      }
    }
    unique(definition.dependencyDerivationRefs, `fr17.${definition.derivationId}.dependencyDerivationRefs`);
    unique(definition.evidenceRefs, `fr17.${definition.derivationId}.evidenceRefs`);
    unique(definition.calibrationRefs, `fr17.${definition.derivationId}.calibrationRefs`);
    unique(definition.qualityPrerequisites, `fr17.${definition.derivationId}.qualityPrerequisites`);
    unique(definition.forbiddenShortcuts, `fr17.${definition.derivationId}.forbiddenShortcuts`);
    if (definition.evidenceRefs.length === 0) {
      throw new FaceAuthorityValidationError(`FR-17 derivation requires evidenceRefs: ${definition.derivationId}`);
    }
    if (definition.qualityPrerequisites.length === 0) {
      throw new FaceAuthorityValidationError(`FR-17 derivation requires quality prerequisites: ${definition.derivationId}`);
    }
    if (definition.reviewState === 'blocked_unresolved') {
      if (definition.algorithmRef !== null) {
        throw new FaceAuthorityValidationError(`FR-17 unresolved derivation cannot carry algorithmRef: ${definition.derivationId}`);
      }
      if (definition.forbiddenShortcuts.length === 0) {
        throw new FaceAuthorityValidationError(`FR-17 unresolved derivation must enumerate forbidden shortcuts: ${definition.derivationId}`);
      }
    }
    if (definition.reviewState === 'blocked_dependency') {
      if (definition.algorithmRef !== null) {
        throw new FaceAuthorityValidationError(`FR-17 dependency-blocked derivation cannot carry algorithmRef: ${definition.derivationId}`);
      }
      if (definition.dependencyDerivationRefs.length === 0) {
        throw new FaceAuthorityValidationError(`FR-17 dependency-blocked derivation requires dependencies: ${definition.derivationId}`);
      }
    }
    if (definition.reviewState === 'research_candidate') {
      if (definition.algorithmRef === null) {
        throw new FaceAuthorityValidationError(`FR-17 research candidate requires algorithmRef: ${definition.derivationId}`);
      }
      nonEmpty(definition.algorithmRef, `fr17.${definition.derivationId}.algorithmRef`);
      if (definition.calibrationRefs.length === 0) {
        throw new FaceAuthorityValidationError(`FR-17 research candidate requires calibrationRefs: ${definition.derivationId}`);
      }
    }
    if (definition.reviewState === 'reviewed') {
      if (definition.algorithmRef === null) {
        throw new FaceAuthorityValidationError(`FR-17 reviewed derivation requires algorithmRef: ${definition.derivationId}`);
      }
      nonEmpty(definition.algorithmRef, `fr17.${definition.derivationId}.algorithmRef`);
      if (definition.calibrationRefs.length === 0) {
        throw new FaceAuthorityValidationError(`FR-17 reviewed derivation requires calibrationRefs: ${definition.derivationId}`);
      }
    }
  }

  validateDependencyGraph(registry.definitions);

  const registryRefs = new Set(registry.definitions.map((definition) => definition.derivationId));
  const requiredRefs = FACELAB_PROVIDER_ADAPTER_EVIDENCE_FR16.slotEvidence
    .map((entry) => entry.requiredDerivationRef)
    .filter((ref): ref is string => ref !== null);
  unique(requiredRefs, 'fr17.fr16RequiredDerivationRefs');
  if (registry.definitions.length !== requiredRefs.length) {
    throw new FaceAuthorityValidationError('FR-17 registry must contain exactly the derivations required by FR-16 blocked slots.');
  }
  for (const requiredRef of requiredRefs) {
    if (!registryRefs.has(requiredRef)) {
      throw new FaceAuthorityValidationError(`FR-17 missing FR-16 required derivation: ${requiredRef}`);
    }
  }

  for (const definition of registry.definitions) {
    if (definition.reviewState === 'blocked_dependency') {
      for (const dependencyRef of definition.dependencyDerivationRefs) {
        const dependency = registry.definitions.find((entry) => entry.derivationId === dependencyRef);
        if (dependency === undefined) {
          throw new FaceAuthorityValidationError(`FR-17 missing dependency definition: ${dependencyRef}`);
        }
        if (dependency.reviewState === 'reviewed' && definition.algorithmRef === null) {
          continue;
        }
      }
    }
  }

  return registry;
}

export function assessNeutralDerivationReadinessFR17(
  registry: NeutralDerivationRegistryV1 = NEUTRAL_DERIVATION_REGISTRY_FR17,
): NeutralDerivationReadinessV1 {
  validateNeutralDerivationRegistryFR17(registry);
  const executableDerivationRefs = registry.definitions
    .filter((definition) => isNeutralDerivationExecutableFR17(definition, registry))
    .map((definition) => definition.derivationId);
  const blockedDerivationRefs = registry.definitions
    .filter((definition) => !isNeutralDerivationExecutableFR17(definition, registry))
    .map((definition) => definition.derivationId);
  const registryRefs = new Set(registry.definitions.map((definition) => definition.derivationId));
  const unresolvedRequiredRefs = FACELAB_PROVIDER_ADAPTER_EVIDENCE_FR16.slotEvidence
    .map((entry) => entry.requiredDerivationRef)
    .filter((ref): ref is string => ref !== null && !registryRefs.has(ref));

  return Object.freeze({
    productionReady: false as const,
    executableDerivationRefs: Object.freeze(executableDerivationRefs),
    blockedDerivationRefs: Object.freeze(blockedDerivationRefs),
    unresolvedRequiredRefs: Object.freeze(unresolvedRequiredRefs),
    blockers: Object.freeze([
      'current K_beauty unified FaceLab runtime is qualitative VLM observation, not neutral landmark geometry authority',
      'nose region derivation is unresolved',
      'left/right brow curve derivations are unresolved',
      'brow midline depends on unresolved neutral brow geometry',
      'FR-14 FaceLab provider binding remains blocked until a stable production-neutral provider contract is published',
    ]),
  });
}
