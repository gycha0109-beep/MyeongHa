import {
  MAYI_THREE_DIVISIONS_NEUTRAL_ANCHOR_REQUIREMENTS_FR34,
  validateMayiThreeDivisionsNeutralAnchorAuthorityFR34,
  type MayiThreeDivisionsTraditionalAnchorFR34V1,
} from './mayi-three-divisions-neutral-anchor-requirements-fr34.js';
import {
  FACELAB_NEUTRAL_BINDING_PROFILE_FR14,
  type NeutralAnchorConsumerSlotV1,
} from './neutral-provider-bindings-fr14.js';
import {
  NEUTRAL_DERIVATION_REGISTRY_FR17,
  isNeutralDerivationExecutableFR17,
} from './neutral-derivation-registry-fr17.js';
import {
  THREE_DIVISIONS_NEUTRAL_SURFACE_EXTENSION_AUTHORITY_FR35,
  THREE_DIVISIONS_NEUTRAL_SURFACE_DEFINITIONS_FR35,
  validateThreeDivisionsNeutralSurfaceExtensionAuthorityFR35,
  type ThreeDivisionsNeutralSurfaceSlotFR35V1,
} from './three-divisions-neutral-surface-extension-fr35.js';
import { FaceAuthorityValidationError } from './validation.js';

export type ThreeDivisionsVerticalReferenceInputSlotFR36V1 =
  | NeutralAnchorConsumerSlotV1
  | ThreeDivisionsNeutralSurfaceSlotFR35V1;

export type ThreeDivisionsVerticalReferenceBlockerClassFR36V1 =
  | 'blocked_existing_neutral_derivation_and_algorithm'
  | 'blocked_extension_surface_binding_and_algorithm';

export interface ThreeDivisionsVerticalReferenceDerivationContractFR36V1 {
  readonly derivationId: string;
  readonly version: '0.1.0';
  readonly traditionalAnchorRef: MayiThreeDivisionsTraditionalAnchorFR34V1;
  readonly fr34NeutralRequirementRef: string;
  readonly inputSlots: readonly ThreeDivisionsVerticalReferenceInputSlotFR36V1[];
  readonly upstreamNeutralDerivationRefs: readonly string[];
  readonly outputClass: 'normalized_vertical_coordinate';
  readonly outputCoordinateFrame: 'canonical_image_normalized_2d';
  readonly outputAxis: 'y';
  readonly reviewState: ThreeDivisionsVerticalReferenceBlockerClassFR36V1;
  readonly algorithmRef: null;
  readonly formulaSpec: null;
  readonly providerLandmarkRefs: readonly number[];
  readonly calibrationRefs: readonly string[];
  readonly qualityPrerequisites: readonly string[];
  readonly traditionalNeutralEquivalenceAuthorized: false;
  readonly sourceVariantSelectionAuthorized: false;
  readonly productionUseAllowed: false;
}

export interface ThreeDivisionsVerticalReferenceDerivationAuthorityFR36V1 {
  readonly schemaVersion: 'fr36-v1';
  readonly authorityRef: 'authority.face.three_divisions_vertical_reference_derivations.fr36';
  readonly authorityVersion: '0.1.0';
  readonly authorityState: 'derivation_contracts_defined_algorithms_unreviewed';
  readonly fr34AuthorityRef: string;
  readonly fr35AuthorityRef: string;
  readonly fr17RegistryRef: string;
  readonly coordinateFrame: 'canonical_image_normalized_2d';
  readonly contracts: readonly ThreeDivisionsVerticalReferenceDerivationContractFR36V1[];
  readonly authorityBoundary: {
    readonly algorithmInventedWithoutEvidenceAllowed: false;
    readonly providerSpecificLandmarkIndicesAllowed: false;
    readonly traditionalNeutralEquivalenceAllowed: false;
    readonly sourceVariantSelectionAllowed: false;
    readonly crossMethodAnchorNormalizationAllowed: false;
    readonly productionMetricAllowed: false;
    readonly productionF1Allowed: false;
    readonly productionF6Allowed: false;
  };
}

export interface ThreeDivisionsVerticalReferenceDerivationReadinessFR36V1 {
  readonly contractCoverageComplete: true;
  readonly allSevenFR34RequirementsCovered: true;
  readonly algorithmsReviewed: false;
  readonly executableDerivationRefs: readonly string[];
  readonly blockedByExistingNeutralDerivationRefs: readonly string[];
  readonly blockedByExtensionSurfaceSlots: readonly ThreeDivisionsNeutralSurfaceSlotFR35V1[];
  readonly providerLandmarkAuthorityUsed: false;
  readonly traditionalNeutralEquivalenceReady: false;
  readonly productionMetricReady: false;
  readonly productionF1Ready: false;
  readonly productionF6Ready: false;
  readonly blockers: readonly string[];
}

const FR34_AUTHORITY_REF = 'authority.face.mayi_three_divisions_neutral_anchor_requirements.fr34@0.1.0' as const;
const FR35_AUTHORITY_REF =
  `${THREE_DIVISIONS_NEUTRAL_SURFACE_EXTENSION_AUTHORITY_FR35.authorityRef}@${THREE_DIVISIONS_NEUTRAL_SURFACE_EXTENSION_AUTHORITY_FR35.authorityVersion}`;
const FR17_REGISTRY_REF = `${NEUTRAL_DERIVATION_REGISTRY_FR17.registryId}@${NEUTRAL_DERIVATION_REGISTRY_FR17.version}`;

const FR34_BY_ANCHOR = new Map(
  MAYI_THREE_DIVISIONS_NEUTRAL_ANCHOR_REQUIREMENTS_FR34.map((entry) => [entry.traditionalAnchorRef, entry] as const),
);

function requirementRef(anchorRef: MayiThreeDivisionsTraditionalAnchorFR34V1): string {
  const requirement = FR34_BY_ANCHOR.get(anchorRef);
  if (requirement === undefined) throw new FaceAuthorityValidationError(`FR-36 missing FR-34 requirement: ${anchorRef}`);
  return requirement.neutralRequirementRef;
}

function contract(input: {
  readonly derivationId: string;
  readonly traditionalAnchorRef: MayiThreeDivisionsTraditionalAnchorFR34V1;
  readonly inputSlots: readonly ThreeDivisionsVerticalReferenceInputSlotFR36V1[];
  readonly upstreamNeutralDerivationRefs: readonly string[];
  readonly reviewState: ThreeDivisionsVerticalReferenceBlockerClassFR36V1;
  readonly qualityPrerequisites: readonly string[];
}): ThreeDivisionsVerticalReferenceDerivationContractFR36V1 {
  return Object.freeze({
    derivationId: input.derivationId,
    version: '0.1.0' as const,
    traditionalAnchorRef: input.traditionalAnchorRef,
    fr34NeutralRequirementRef: requirementRef(input.traditionalAnchorRef),
    inputSlots: Object.freeze([...input.inputSlots]),
    upstreamNeutralDerivationRefs: Object.freeze([...input.upstreamNeutralDerivationRefs]),
    outputClass: 'normalized_vertical_coordinate' as const,
    outputCoordinateFrame: 'canonical_image_normalized_2d' as const,
    outputAxis: 'y' as const,
    reviewState: input.reviewState,
    algorithmRef: null,
    formulaSpec: null,
    providerLandmarkRefs: Object.freeze([] as number[]),
    calibrationRefs: Object.freeze([] as string[]),
    qualityPrerequisites: Object.freeze([...input.qualityPrerequisites]),
    traditionalNeutralEquivalenceAuthorized: false as const,
    sourceVariantSelectionAuthorized: false as const,
    productionUseAllowed: false as const,
  });
}

export const THREE_DIVISIONS_VERTICAL_REFERENCE_DERIVATION_CONTRACTS_FR36:
readonly ThreeDivisionsVerticalReferenceDerivationContractFR36V1[] = Object.freeze([
  contract({
    derivationId: 'derivation.neutral.three_divisions.hairline_vertical_reference.pending',
    traditionalAnchorRef: 'hairline',
    inputSlots: ['neutral.face.hairline_boundary'],
    upstreamNeutralDerivationRefs: [],
    reviewState: 'blocked_extension_surface_binding_and_algorithm',
    qualityPrerequisites: ['frontal_static_view', 'neutral_pose_quality', 'hairline_visible'],
  }),
  contract({
    derivationId: 'derivation.neutral.three_divisions.brow_vertical_reference.pending',
    traditionalAnchorRef: 'brow',
    inputSlots: ['neutral.face.left_brow_region', 'neutral.face.right_brow_region'],
    upstreamNeutralDerivationRefs: [
      'derivation.neutral.left_brow_curve.pending',
      'derivation.neutral.right_brow_curve.pending',
    ],
    reviewState: 'blocked_existing_neutral_derivation_and_algorithm',
    qualityPrerequisites: ['frontal_static_view', 'neutral_pose_quality', 'bilateral_brow_geometry_usable'],
  }),
  contract({
    derivationId: 'derivation.neutral.three_divisions.interbrow_vertical_reference.pending',
    traditionalAnchorRef: 'yintang',
    inputSlots: ['neutral.face.brow_midline'],
    upstreamNeutralDerivationRefs: ['derivation.neutral.brow_midline.pending'],
    reviewState: 'blocked_existing_neutral_derivation_and_algorithm',
    qualityPrerequisites: ['frontal_static_view', 'neutral_pose_quality', 'interbrow_geometry_usable'],
  }),
  contract({
    derivationId: 'derivation.neutral.three_divisions.nasal_root_vertical_reference.pending',
    traditionalAnchorRef: 'shangen',
    inputSlots: ['neutral.face.nose_region'],
    upstreamNeutralDerivationRefs: ['derivation.neutral.nose_region.pending'],
    reviewState: 'blocked_existing_neutral_derivation_and_algorithm',
    qualityPrerequisites: ['frontal_static_view', 'neutral_pose_quality', 'nasal_root_geometry_usable'],
  }),
  contract({
    derivationId: 'derivation.neutral.three_divisions.nose_tip_vertical_reference.pending',
    traditionalAnchorRef: 'zhuntou',
    inputSlots: ['neutral.face.nose_region'],
    upstreamNeutralDerivationRefs: ['derivation.neutral.nose_region.pending'],
    reviewState: 'blocked_existing_neutral_derivation_and_algorithm',
    qualityPrerequisites: ['frontal_static_view', 'neutral_pose_quality', 'nose_tip_geometry_usable'],
  }),
  contract({
    derivationId: 'derivation.neutral.three_divisions.philtrum_midline_vertical_reference.pending',
    traditionalAnchorRef: 'renzhong',
    inputSlots: ['neutral.face.philtrum_region'],
    upstreamNeutralDerivationRefs: [],
    reviewState: 'blocked_extension_surface_binding_and_algorithm',
    qualityPrerequisites: ['frontal_static_view', 'neutral_pose_quality', 'philtrum_visible'],
  }),
  contract({
    derivationId: 'derivation.neutral.three_divisions.chin_inferior_midline_vertical_reference.pending',
    traditionalAnchorRef: 'dige',
    inputSlots: ['neutral.face.chin_inferior_contour'],
    upstreamNeutralDerivationRefs: [],
    reviewState: 'blocked_extension_surface_binding_and_algorithm',
    qualityPrerequisites: ['frontal_static_view', 'neutral_pose_quality', 'chin_inferior_contour_visible'],
  }),
]);

export const THREE_DIVISIONS_VERTICAL_REFERENCE_DERIVATION_AUTHORITY_FR36:
ThreeDivisionsVerticalReferenceDerivationAuthorityFR36V1 = Object.freeze({
  schemaVersion: 'fr36-v1' as const,
  authorityRef: 'authority.face.three_divisions_vertical_reference_derivations.fr36' as const,
  authorityVersion: '0.1.0' as const,
  authorityState: 'derivation_contracts_defined_algorithms_unreviewed' as const,
  fr34AuthorityRef: FR34_AUTHORITY_REF,
  fr35AuthorityRef: FR35_AUTHORITY_REF,
  fr17RegistryRef: FR17_REGISTRY_REF,
  coordinateFrame: 'canonical_image_normalized_2d' as const,
  contracts: THREE_DIVISIONS_VERTICAL_REFERENCE_DERIVATION_CONTRACTS_FR36,
  authorityBoundary: Object.freeze({
    algorithmInventedWithoutEvidenceAllowed: false as const,
    providerSpecificLandmarkIndicesAllowed: false as const,
    traditionalNeutralEquivalenceAllowed: false as const,
    sourceVariantSelectionAllowed: false as const,
    crossMethodAnchorNormalizationAllowed: false as const,
    productionMetricAllowed: false as const,
    productionF1Allowed: false as const,
    productionF6Allowed: false as const,
  }),
});

function sameSequence(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

export function validateThreeDivisionsVerticalReferenceDerivationAuthorityFR36(
  authority: ThreeDivisionsVerticalReferenceDerivationAuthorityFR36V1 = THREE_DIVISIONS_VERTICAL_REFERENCE_DERIVATION_AUTHORITY_FR36,
): ThreeDivisionsVerticalReferenceDerivationAuthorityFR36V1 {
  validateMayiThreeDivisionsNeutralAnchorAuthorityFR34();
  validateThreeDivisionsNeutralSurfaceExtensionAuthorityFR35();
  if (
    authority.schemaVersion !== 'fr36-v1' ||
    authority.authorityRef !== 'authority.face.three_divisions_vertical_reference_derivations.fr36' ||
    authority.authorityVersion !== '0.1.0' ||
    authority.authorityState !== 'derivation_contracts_defined_algorithms_unreviewed'
  ) throw new FaceAuthorityValidationError('FR-36 authority identity/state drift.');
  if (authority.fr34AuthorityRef !== FR34_AUTHORITY_REF || authority.fr35AuthorityRef !== FR35_AUTHORITY_REF ||
      authority.fr17RegistryRef !== FR17_REGISTRY_REF || authority.coordinateFrame !== 'canonical_image_normalized_2d') {
    throw new FaceAuthorityValidationError('FR-36 upstream authority pin drift.');
  }
  if (authority.contracts.length !== 7) throw new FaceAuthorityValidationError('FR-36 must define exactly seven vertical-reference contracts.');
  const expectedAnchors = MAYI_THREE_DIVISIONS_NEUTRAL_ANCHOR_REQUIREMENTS_FR34.map((entry) => entry.traditionalAnchorRef);
  if (!sameSequence(authority.contracts.map((entry) => entry.traditionalAnchorRef), expectedAnchors)) {
    throw new FaceAuthorityValidationError('FR-36 must cover every FR-34 requirement exactly once and in authority order.');
  }
  if (new Set(authority.contracts.map((entry) => entry.derivationId)).size !== 7) {
    throw new FaceAuthorityValidationError('FR-36 derivation IDs must be unique.');
  }

  const fr14Slots = new Set(FACELAB_NEUTRAL_BINDING_PROFILE_FR14.bindings.map((entry) => entry.consumerSlot));
  const fr35Slots = new Set(THREE_DIVISIONS_NEUTRAL_SURFACE_DEFINITIONS_FR35.map((entry) => entry.consumerSlot));
  const fr17ById = new Map(NEUTRAL_DERIVATION_REGISTRY_FR17.definitions.map((entry) => [entry.derivationId, entry] as const));
  for (const entry of authority.contracts) {
    const expectedRequirement = FR34_BY_ANCHOR.get(entry.traditionalAnchorRef);
    if (entry.version !== '0.1.0' || entry.fr34NeutralRequirementRef !== expectedRequirement?.neutralRequirementRef ||
        entry.outputClass !== 'normalized_vertical_coordinate' || entry.outputCoordinateFrame !== 'canonical_image_normalized_2d' ||
        entry.outputAxis !== 'y') {
      throw new FaceAuthorityValidationError(`FR-36 output/requirement drift: ${entry.derivationId}`);
    }
    if (entry.inputSlots.length === 0) throw new FaceAuthorityValidationError(`FR-36 derivation requires input slots: ${entry.derivationId}`);
    for (const slot of entry.inputSlots) {
      if (!fr14Slots.has(slot as NeutralAnchorConsumerSlotV1) && !fr35Slots.has(slot as ThreeDivisionsNeutralSurfaceSlotFR35V1)) {
        throw new FaceAuthorityValidationError(`FR-36 references unknown neutral input slot: ${slot}`);
      }
    }
    for (const ref of entry.upstreamNeutralDerivationRefs) {
      if (!fr17ById.has(ref)) throw new FaceAuthorityValidationError(`FR-36 references unknown FR-17 derivation: ${ref}`);
    }
    if (entry.reviewState === 'blocked_existing_neutral_derivation_and_algorithm') {
      if (entry.upstreamNeutralDerivationRefs.length === 0) {
        throw new FaceAuthorityValidationError(`FR-36 existing-derivation blocker requires FR-17 refs: ${entry.derivationId}`);
      }
      if (entry.upstreamNeutralDerivationRefs.every((ref) => {
        const definition = fr17ById.get(ref)!;
        return isNeutralDerivationExecutableFR17(definition);
      })) {
        throw new FaceAuthorityValidationError(`FR-36 blocker state is stale; upstream FR-17 derivations are executable: ${entry.derivationId}`);
      }
    }
    if (entry.reviewState === 'blocked_extension_surface_binding_and_algorithm') {
      if (entry.inputSlots.some((slot) => !fr35Slots.has(slot as ThreeDivisionsNeutralSurfaceSlotFR35V1))) {
        throw new FaceAuthorityValidationError(`FR-36 extension-surface blocker must depend only on FR-35 slots: ${entry.derivationId}`);
      }
      if (entry.upstreamNeutralDerivationRefs.length !== 0) {
        throw new FaceAuthorityValidationError(`FR-36 extension-surface blocker cannot claim FR-17 derivations: ${entry.derivationId}`);
      }
    }
    if (entry.algorithmRef !== null || entry.formulaSpec !== null || entry.providerLandmarkRefs.length !== 0 ||
        entry.calibrationRefs.length !== 0 || entry.traditionalNeutralEquivalenceAuthorized !== false ||
        entry.sourceVariantSelectionAuthorized !== false || entry.productionUseAllowed !== false) {
      throw new FaceAuthorityValidationError(`FR-36 cannot invent or promote an unreviewed derivation: ${entry.derivationId}`);
    }
    if (entry.qualityPrerequisites.length === 0) {
      throw new FaceAuthorityValidationError(`FR-36 derivation needs quality prerequisites: ${entry.derivationId}`);
    }
  }
  if (Object.values(authority.authorityBoundary).some((value) => value !== false)) {
    throw new FaceAuthorityValidationError('FR-36 authority boundary must remain fully fail-closed.');
  }
  return authority;
}

export function assessThreeDivisionsVerticalReferenceDerivationReadinessFR36(
  authority: ThreeDivisionsVerticalReferenceDerivationAuthorityFR36V1 = THREE_DIVISIONS_VERTICAL_REFERENCE_DERIVATION_AUTHORITY_FR36,
): ThreeDivisionsVerticalReferenceDerivationReadinessFR36V1 {
  validateThreeDivisionsVerticalReferenceDerivationAuthorityFR36(authority);
  const fr17ById = new Map(NEUTRAL_DERIVATION_REGISTRY_FR17.definitions.map((entry) => [entry.derivationId, entry] as const));
  const blockedByExistingNeutralDerivationRefs = [...new Set(authority.contracts.flatMap((entry) => entry.upstreamNeutralDerivationRefs)
    .filter((ref) => {
      const definition = fr17ById.get(ref);
      return definition !== undefined && !isNeutralDerivationExecutableFR17(definition);
    }))];
  const blockedByExtensionSurfaceSlots = [...new Set(authority.contracts
    .filter((entry) => entry.reviewState === 'blocked_extension_surface_binding_and_algorithm')
    .flatMap((entry) => entry.inputSlots))] as ThreeDivisionsNeutralSurfaceSlotFR35V1[];
  return Object.freeze({
    contractCoverageComplete: true as const,
    allSevenFR34RequirementsCovered: true as const,
    algorithmsReviewed: false as const,
    executableDerivationRefs: Object.freeze([] as string[]),
    blockedByExistingNeutralDerivationRefs: Object.freeze(blockedByExistingNeutralDerivationRefs),
    blockedByExtensionSurfaceSlots: Object.freeze(blockedByExtensionSurfaceSlots),
    providerLandmarkAuthorityUsed: false as const,
    traditionalNeutralEquivalenceReady: false as const,
    productionMetricReady: false as const,
    productionF1Ready: false as const,
    productionF6Ready: false as const,
    blockers: Object.freeze([
      'FR-36 defines vertical-reference derivation contracts but no extraction algorithm or formula is reviewed.',
      'Brow/interbrow/nasal-root/nose-tip contracts depend on non-executable FR-17 neutral derivations.',
      'Hairline/philtrum/chin contracts depend on FR-35 surfaces with no verified provider binding.',
      'Provider landmark indices remain unauthorized and empty.',
      'Traditional-to-neutral equivalence and FR-33 source variant selection remain unresolved.',
      'FR-5 三停平等 calibration and the F6 period-direction conflict remain unresolved.',
    ]),
  });
}

export function assertThreeDivisionsVerticalReferenceDerivationsReadyFR36(
  authority: ThreeDivisionsVerticalReferenceDerivationAuthorityFR36V1 = THREE_DIVISIONS_VERTICAL_REFERENCE_DERIVATION_AUTHORITY_FR36,
): never {
  validateThreeDivisionsVerticalReferenceDerivationAuthorityFR36(authority);
  throw new FaceAuthorityValidationError(
    'FR-36 vertical-reference contracts are defined, but reviewed algorithms/provider bindings are absent; Three Divisions metrics remain blocked.',
  );
}
