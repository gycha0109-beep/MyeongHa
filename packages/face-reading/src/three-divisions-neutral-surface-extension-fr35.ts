import {
  MAYI_THREE_DIVISIONS_NEUTRAL_ANCHOR_AUTHORITY_FR34,
  MAYI_THREE_DIVISIONS_NEUTRAL_ANCHOR_REQUIREMENTS_FR34,
  validateMayiThreeDivisionsNeutralAnchorAuthorityFR34,
  type MayiThreeDivisionsTraditionalAnchorFR34V1,
} from './mayi-three-divisions-neutral-anchor-requirements-fr34.js';
import type { NeutralObservationGeometryV1 } from './neutral-observation-schema-fr15.js';
import { FaceAuthorityValidationError } from './validation.js';

export type ThreeDivisionsNeutralSurfaceSlotFR35V1 =
  | 'neutral.face.hairline_boundary'
  | 'neutral.face.philtrum_region'
  | 'neutral.face.chin_inferior_contour';

export interface ThreeDivisionsNeutralSurfaceDefinitionFR35V1 {
  readonly consumerSlot: ThreeDivisionsNeutralSurfaceSlotFR35V1;
  readonly neutralConceptKey: 'hairline_boundary' | 'philtrum_region' | 'chin_inferior_contour';
  readonly geometryKind: NeutralObservationGeometryV1['kind'];
  readonly coordinateFrame: 'canonical_image_normalized_2d';
  readonly observationClass: 'source_neutral_geometry';
  readonly providerBindingState: 'no_verified_binding';
  readonly providerLandmarkRefs: readonly number[];
  readonly qualityPrerequisites: readonly string[];
  readonly traditionalSemanticOutputAllowed: false;
}

export interface ThreeDivisionsNeutralSurfaceRequirementBridgeFR35V1 {
  readonly traditionalAnchorRef: Extract<MayiThreeDivisionsTraditionalAnchorFR34V1, 'hairline' | 'renzhong' | 'dige'>;
  readonly fr34NeutralRequirementRef: string;
  readonly surfaceSlot: ThreeDivisionsNeutralSurfaceSlotFR35V1;
  readonly relation: 'candidate_dependency_only';
  readonly traditionalNeutralEquivalenceAuthorized: false;
  readonly verticalReferenceDerivationState: 'not_defined';
}

export interface ThreeDivisionsNeutralSurfaceExtensionAuthorityFR35V1 {
  readonly schemaVersion: 'fr35-v1';
  readonly authorityRef: 'authority.face.three_divisions_neutral_surface_extension.fr35';
  readonly authorityVersion: '0.1.0';
  readonly authorityState: 'neutral_surface_contract_defined_provider_binding_blocked';
  readonly fr34AuthorityRef: string;
  readonly baseNeutralObservationContractRef: 'myeongha-neutral-observation-v1';
  readonly extensionMode: 'separate_contract_extension';
  readonly coordinateFrame: 'canonical_image_normalized_2d';
  readonly surfaces: readonly ThreeDivisionsNeutralSurfaceDefinitionFR35V1[];
  readonly requirementBridges: readonly ThreeDivisionsNeutralSurfaceRequirementBridgeFR35V1[];
  readonly authorityBoundary: {
    readonly mutateFR15BaseContractAllowed: false;
    readonly providerSpecificLandmarkIndicesAllowed: false;
    readonly directTraditionalAnchorBindingAllowed: false;
    readonly traditionalSemanticOutputAllowed: false;
    readonly verticalReferenceDerivationClaimed: false;
    readonly sourceVariantSelectionAllowed: false;
    readonly productionMetricAllowed: false;
    readonly productionF1Allowed: false;
    readonly productionF6Allowed: false;
  };
}

export interface ThreeDivisionsNeutralSurfaceExtensionReadinessFR35V1 {
  readonly neutralSurfaceContractReady: true;
  readonly missingFR34SurfaceCoverageDefined: true;
  readonly baseFR15ContractPreserved: true;
  readonly providerBindingReady: false;
  readonly verticalReferenceDerivationReady: false;
  readonly traditionalNeutralEquivalenceReady: false;
  readonly productionMetricReady: false;
  readonly productionF1Ready: false;
  readonly productionF6Ready: false;
  readonly blockers: readonly string[];
}

const FR34_AUTHORITY_REF =
  `${MAYI_THREE_DIVISIONS_NEUTRAL_ANCHOR_AUTHORITY_FR34.authorityRef}@${MAYI_THREE_DIVISIONS_NEUTRAL_ANCHOR_AUTHORITY_FR34.authorityVersion}`;

const SURFACE_DEFINITIONS: readonly ThreeDivisionsNeutralSurfaceDefinitionFR35V1[] = Object.freeze([
  Object.freeze({
    consumerSlot: 'neutral.face.hairline_boundary' as const,
    neutralConceptKey: 'hairline_boundary' as const,
    geometryKind: 'curve' as const,
    coordinateFrame: 'canonical_image_normalized_2d' as const,
    observationClass: 'source_neutral_geometry' as const,
    providerBindingState: 'no_verified_binding' as const,
    providerLandmarkRefs: Object.freeze([] as number[]),
    qualityPrerequisites: Object.freeze(['frontal_static_view', 'neutral_pose_quality', 'hairline_visible']),
    traditionalSemanticOutputAllowed: false as const,
  }),
  Object.freeze({
    consumerSlot: 'neutral.face.philtrum_region' as const,
    neutralConceptKey: 'philtrum_region' as const,
    geometryKind: 'region' as const,
    coordinateFrame: 'canonical_image_normalized_2d' as const,
    observationClass: 'source_neutral_geometry' as const,
    providerBindingState: 'no_verified_binding' as const,
    providerLandmarkRefs: Object.freeze([] as number[]),
    qualityPrerequisites: Object.freeze(['frontal_static_view', 'neutral_pose_quality', 'philtrum_visible']),
    traditionalSemanticOutputAllowed: false as const,
  }),
  Object.freeze({
    consumerSlot: 'neutral.face.chin_inferior_contour' as const,
    neutralConceptKey: 'chin_inferior_contour' as const,
    geometryKind: 'curve' as const,
    coordinateFrame: 'canonical_image_normalized_2d' as const,
    observationClass: 'source_neutral_geometry' as const,
    providerBindingState: 'no_verified_binding' as const,
    providerLandmarkRefs: Object.freeze([] as number[]),
    qualityPrerequisites: Object.freeze(['frontal_static_view', 'neutral_pose_quality', 'chin_inferior_contour_visible']),
    traditionalSemanticOutputAllowed: false as const,
  }),
]);

const BRIDGE_SPECS = Object.freeze([
  Object.freeze({ traditionalAnchorRef: 'hairline' as const, surfaceSlot: 'neutral.face.hairline_boundary' as const }),
  Object.freeze({ traditionalAnchorRef: 'renzhong' as const, surfaceSlot: 'neutral.face.philtrum_region' as const }),
  Object.freeze({ traditionalAnchorRef: 'dige' as const, surfaceSlot: 'neutral.face.chin_inferior_contour' as const }),
]);

const FR34_REQUIREMENT_BY_ANCHOR = new Map(
  MAYI_THREE_DIVISIONS_NEUTRAL_ANCHOR_REQUIREMENTS_FR34.map((entry) => [entry.traditionalAnchorRef, entry] as const),
);

export const THREE_DIVISIONS_NEUTRAL_SURFACE_DEFINITIONS_FR35 = SURFACE_DEFINITIONS;

export const THREE_DIVISIONS_NEUTRAL_SURFACE_REQUIREMENT_BRIDGES_FR35:
readonly ThreeDivisionsNeutralSurfaceRequirementBridgeFR35V1[] = Object.freeze(BRIDGE_SPECS.map((spec) => {
  const requirement = FR34_REQUIREMENT_BY_ANCHOR.get(spec.traditionalAnchorRef);
  if (requirement === undefined) {
    throw new FaceAuthorityValidationError(`FR-35 missing FR-34 requirement: ${spec.traditionalAnchorRef}`);
  }
  return Object.freeze({
    traditionalAnchorRef: spec.traditionalAnchorRef,
    fr34NeutralRequirementRef: requirement.neutralRequirementRef,
    surfaceSlot: spec.surfaceSlot,
    relation: 'candidate_dependency_only' as const,
    traditionalNeutralEquivalenceAuthorized: false as const,
    verticalReferenceDerivationState: 'not_defined' as const,
  });
}));

export const THREE_DIVISIONS_NEUTRAL_SURFACE_EXTENSION_AUTHORITY_FR35:
ThreeDivisionsNeutralSurfaceExtensionAuthorityFR35V1 = Object.freeze({
  schemaVersion: 'fr35-v1' as const,
  authorityRef: 'authority.face.three_divisions_neutral_surface_extension.fr35' as const,
  authorityVersion: '0.1.0' as const,
  authorityState: 'neutral_surface_contract_defined_provider_binding_blocked' as const,
  fr34AuthorityRef: FR34_AUTHORITY_REF,
  baseNeutralObservationContractRef: 'myeongha-neutral-observation-v1' as const,
  extensionMode: 'separate_contract_extension' as const,
  coordinateFrame: 'canonical_image_normalized_2d' as const,
  surfaces: THREE_DIVISIONS_NEUTRAL_SURFACE_DEFINITIONS_FR35,
  requirementBridges: THREE_DIVISIONS_NEUTRAL_SURFACE_REQUIREMENT_BRIDGES_FR35,
  authorityBoundary: Object.freeze({
    mutateFR15BaseContractAllowed: false as const,
    providerSpecificLandmarkIndicesAllowed: false as const,
    directTraditionalAnchorBindingAllowed: false as const,
    traditionalSemanticOutputAllowed: false as const,
    verticalReferenceDerivationClaimed: false as const,
    sourceVariantSelectionAllowed: false as const,
    productionMetricAllowed: false as const,
    productionF1Allowed: false as const,
    productionF6Allowed: false as const,
  }),
});

function sameSequence(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

export function validateThreeDivisionsNeutralSurfaceExtensionAuthorityFR35(
  authority: ThreeDivisionsNeutralSurfaceExtensionAuthorityFR35V1 = THREE_DIVISIONS_NEUTRAL_SURFACE_EXTENSION_AUTHORITY_FR35,
): ThreeDivisionsNeutralSurfaceExtensionAuthorityFR35V1 {
  validateMayiThreeDivisionsNeutralAnchorAuthorityFR34();
  if (
    authority.schemaVersion !== 'fr35-v1' ||
    authority.authorityRef !== 'authority.face.three_divisions_neutral_surface_extension.fr35' ||
    authority.authorityVersion !== '0.1.0' ||
    authority.authorityState !== 'neutral_surface_contract_defined_provider_binding_blocked'
  ) {
    throw new FaceAuthorityValidationError('FR-35 authority identity/state drift.');
  }
  if (authority.fr34AuthorityRef !== FR34_AUTHORITY_REF ||
      authority.baseNeutralObservationContractRef !== 'myeongha-neutral-observation-v1' ||
      authority.extensionMode !== 'separate_contract_extension' ||
      authority.coordinateFrame !== 'canonical_image_normalized_2d') {
    throw new FaceAuthorityValidationError('FR-35 upstream/base contract pin drift.');
  }
  if (authority.surfaces.length !== 3 || authority.requirementBridges.length !== 3) {
    throw new FaceAuthorityValidationError('FR-35 must define exactly three missing neutral surfaces and three FR-34 bridges.');
  }
  const expectedSlots = SURFACE_DEFINITIONS.map((entry) => entry.consumerSlot);
  if (!sameSequence(authority.surfaces.map((entry) => entry.consumerSlot), expectedSlots)) {
    throw new FaceAuthorityValidationError('FR-35 neutral surface slot coverage/order drift.');
  }
  if (new Set(authority.surfaces.map((entry) => entry.consumerSlot)).size !== 3) {
    throw new FaceAuthorityValidationError('FR-35 neutral surface slots must be unique.');
  }
  authority.surfaces.forEach((surface, index) => {
    const expected = SURFACE_DEFINITIONS[index]!;
    if (surface.neutralConceptKey !== expected.neutralConceptKey || surface.geometryKind !== expected.geometryKind ||
        surface.coordinateFrame !== 'canonical_image_normalized_2d' || surface.observationClass !== 'source_neutral_geometry' ||
        surface.providerBindingState !== 'no_verified_binding' || surface.providerLandmarkRefs.length !== 0 ||
        surface.traditionalSemanticOutputAllowed !== false) {
      throw new FaceAuthorityValidationError(`FR-35 neutral surface authority drift: ${surface.consumerSlot}`);
    }
    if (surface.qualityPrerequisites.length === 0) {
      throw new FaceAuthorityValidationError(`FR-35 neutral surface requires quality prerequisites: ${surface.consumerSlot}`);
    }
  });

  authority.requirementBridges.forEach((bridge, index) => {
    const spec = BRIDGE_SPECS[index]!;
    const requirement = FR34_REQUIREMENT_BY_ANCHOR.get(spec.traditionalAnchorRef)!;
    if (bridge.traditionalAnchorRef !== spec.traditionalAnchorRef || bridge.surfaceSlot !== spec.surfaceSlot ||
        bridge.fr34NeutralRequirementRef !== requirement.neutralRequirementRef || bridge.relation !== 'candidate_dependency_only' ||
        bridge.traditionalNeutralEquivalenceAuthorized !== false || bridge.verticalReferenceDerivationState !== 'not_defined') {
      throw new FaceAuthorityValidationError(`FR-35 FR-34 bridge drift: ${bridge.traditionalAnchorRef}`);
    }
  });

  if (Object.values(authority.authorityBoundary).some((value) => value !== false)) {
    throw new FaceAuthorityValidationError('FR-35 authority boundary must remain fully fail-closed.');
  }
  return authority;
}

export function assessThreeDivisionsNeutralSurfaceExtensionReadinessFR35(
  authority: ThreeDivisionsNeutralSurfaceExtensionAuthorityFR35V1 = THREE_DIVISIONS_NEUTRAL_SURFACE_EXTENSION_AUTHORITY_FR35,
): ThreeDivisionsNeutralSurfaceExtensionReadinessFR35V1 {
  validateThreeDivisionsNeutralSurfaceExtensionAuthorityFR35(authority);
  return Object.freeze({
    neutralSurfaceContractReady: true as const,
    missingFR34SurfaceCoverageDefined: true as const,
    baseFR15ContractPreserved: true as const,
    providerBindingReady: false as const,
    verticalReferenceDerivationReady: false as const,
    traditionalNeutralEquivalenceReady: false as const,
    productionMetricReady: false as const,
    productionF1Ready: false as const,
    productionF6Ready: false as const,
    blockers: Object.freeze([
      'FR-35 defines neutral surface contracts only; no provider implementation is verified for any new slot.',
      'Hairline boundary, philtrum region, and inferior chin contour still require provider-independent extraction/binding evidence.',
      'FR-34 vertical reference coordinates have no reviewed derivation algorithms yet.',
      'The FR-35 bridges are dependency candidates only and do not authorize 髮際/人中/地閣 equivalence.',
      'FR-33 variant selection, FR-5 三停平等 calibration, and the F6 period-direction conflict remain unresolved.',
    ]),
  });
}

export function assertThreeDivisionsNeutralSurfaceProviderReadyFR35(
  authority: ThreeDivisionsNeutralSurfaceExtensionAuthorityFR35V1 = THREE_DIVISIONS_NEUTRAL_SURFACE_EXTENSION_AUTHORITY_FR35,
): never {
  validateThreeDivisionsNeutralSurfaceExtensionAuthorityFR35(authority);
  throw new FaceAuthorityValidationError(
    'FR-35 is a neutral surface contract extension only; verified provider bindings and vertical-reference derivations are not available.',
  );
}
