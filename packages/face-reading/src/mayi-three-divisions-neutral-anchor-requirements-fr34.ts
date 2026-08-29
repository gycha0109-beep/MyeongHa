import { FACELAB_NEUTRAL_BINDING_PROFILE_FR14 } from './neutral-provider-bindings-fr14.js';
import {
  MAYI_THREE_DIVISIONS_BOUNDARY_AUTHORITY_FR33,
  MAYI_THREE_DIVISIONS_BOUNDARY_VARIANTS_FR33,
  validateMayiThreeDivisionsBoundaryAuthorityFR33,
  type MayiThreeDivisionsBoundaryVariantIdFR33V1,
  type MayiThreeDivisionsSectionFR33V1,
} from './mayi-three-divisions-boundary-variants-fr33.js';
import {
  NEUTRAL_DERIVATION_REGISTRY_FR17,
  isNeutralDerivationExecutableFR17,
} from './neutral-derivation-registry-fr17.js';
import { FaceAuthorityValidationError } from './validation.js';

export type MayiThreeDivisionsTraditionalAnchorFR34V1 =
  | 'hairline'
  | 'brow'
  | 'yintang'
  | 'shangen'
  | 'zhuntou'
  | 'renzhong'
  | 'dige';

export type MayiThreeDivisionsNeutralRequirementStateFR34V1 =
  | 'blocked_no_existing_neutral_surface'
  | 'blocked_existing_derivation_dependency'
  | 'blocked_traditional_neutral_equivalence';

export interface MayiThreeDivisionsNeutralAnchorRequirementFR34V1 {
  readonly traditionalAnchorRef: MayiThreeDivisionsTraditionalAnchorFR34V1;
  readonly sourceRefs: readonly string[];
  readonly usedByVariantIds: readonly MayiThreeDivisionsBoundaryVariantIdFR33V1[];
  readonly neutralRequirementRef: string;
  readonly measurementRole: 'vertical_reference_coordinate';
  readonly requirementState: MayiThreeDivisionsNeutralRequirementStateFR34V1;
  readonly existingNeutralAnchorDependencyRefs: readonly string[];
  readonly existingDerivationDependencyRefs: readonly string[];
  readonly traditionalNeutralEquivalenceState: 'unreviewed_not_authorized';
  readonly providerLandmarkRefs: readonly number[];
  readonly qualityPrerequisites: readonly string[];
  readonly productionBindingAllowed: false;
}

export interface MayiThreeDivisionsNeutralSpanRequirementFR34V1 {
  readonly variantId: MayiThreeDivisionsBoundaryVariantIdFR33V1;
  readonly section: MayiThreeDivisionsSectionFR33V1;
  readonly sourceRef: string;
  readonly fromTraditionalAnchor: MayiThreeDivisionsTraditionalAnchorFR34V1;
  readonly toTraditionalAnchor: MayiThreeDivisionsTraditionalAnchorFR34V1;
  readonly fromNeutralRequirementRef: string;
  readonly toNeutralRequirementRef: string;
}

export interface MayiThreeDivisionsNeutralAnchorAuthorityFR34V1 {
  readonly schemaVersion: 'fr34-v1';
  readonly authorityRef: 'authority.face.mayi_three_divisions_neutral_anchor_requirements.fr34';
  readonly authorityVersion: '0.1.0';
  readonly authorityState: 'provider_independent_requirements_defined_operationalization_blocked';
  readonly sourceAuthorityRef: string;
  readonly fr14BindingProfileRef: string;
  readonly fr17DerivationRegistryRef: string;
  readonly coordinateFrame: 'canonical_image_normalized_2d';
  readonly requirements: readonly MayiThreeDivisionsNeutralAnchorRequirementFR34V1[];
  readonly variantSpanRequirements: readonly MayiThreeDivisionsNeutralSpanRequirementFR34V1[];
  readonly authorityBoundary: {
    readonly mutateFR14ConsumerContractAllowed: false;
    readonly providerSpecificLandmarkIndicesAllowed: false;
    readonly traditionalAnchorNameInNeutralProviderOutputAllowed: false;
    readonly directTraditionalToNeutralEquivalenceAllowed: false;
    readonly sourceVariantSelectionAllowed: false;
    readonly crossMethodAnchorNormalizationAllowed: false;
    readonly productionMetricAllowed: false;
    readonly productionF1Allowed: false;
    readonly productionF6Allowed: false;
  };
}

export interface MayiThreeDivisionsNeutralAnchorReadinessFR34V1 {
  readonly providerIndependentRequirementsComplete: true;
  readonly sourceVariantCoverageComplete: true;
  readonly existingFR14ContractPreserved: true;
  readonly executableExistingDerivationRefs: readonly string[];
  readonly missingNeutralSurfaceAnchorRefs: readonly MayiThreeDivisionsTraditionalAnchorFR34V1[];
  readonly traditionalNeutralEquivalenceReady: false;
  readonly neutralOperationalizationReady: false;
  readonly productionMetricReady: false;
  readonly productionF1Ready: false;
  readonly productionF6Ready: false;
  readonly blockers: readonly string[];
}

const SOURCE_AUTHORITY_REF =
  `${MAYI_THREE_DIVISIONS_BOUNDARY_AUTHORITY_FR33.authorityRef}@${MAYI_THREE_DIVISIONS_BOUNDARY_AUTHORITY_FR33.authorityVersion}`;
const FR14_PROFILE_REF = `binding-profile.face.neutral.fr14@${FACELAB_NEUTRAL_BINDING_PROFILE_FR14.profileVersion}`;
const FR17_REGISTRY_REF = `${NEUTRAL_DERIVATION_REGISTRY_FR17.registryId}@${NEUTRAL_DERIVATION_REGISTRY_FR17.version}`;

const TRADITIONAL_ANCHORS: readonly MayiThreeDivisionsTraditionalAnchorFR34V1[] = Object.freeze([
  'hairline', 'brow', 'yintang', 'shangen', 'zhuntou', 'renzhong', 'dige',
]);

const REQUIREMENT_SPEC = Object.freeze({
  hairline: Object.freeze({
    neutralRequirementRef: 'neutral.requirement.face.hairline_mid_sagittal_reference',
    requirementState: 'blocked_no_existing_neutral_surface' as const,
    existingNeutralAnchorDependencyRefs: Object.freeze([] as string[]),
    existingDerivationDependencyRefs: Object.freeze([] as string[]),
    qualityPrerequisites: Object.freeze(['frontal_static_view', 'neutral_pose_quality', 'hairline_visible']),
  }),
  brow: Object.freeze({
    neutralRequirementRef: 'neutral.requirement.face.brow_vertical_reference',
    requirementState: 'blocked_existing_derivation_dependency' as const,
    existingNeutralAnchorDependencyRefs: Object.freeze(['left_brow', 'right_brow']),
    existingDerivationDependencyRefs: Object.freeze([
      'derivation.neutral.left_brow_curve.pending',
      'derivation.neutral.right_brow_curve.pending',
    ]),
    qualityPrerequisites: Object.freeze(['frontal_static_view', 'neutral_pose_quality', 'bilateral_brow_geometry_usable']),
  }),
  yintang: Object.freeze({
    neutralRequirementRef: 'neutral.requirement.face.interbrow_reference',
    requirementState: 'blocked_traditional_neutral_equivalence' as const,
    existingNeutralAnchorDependencyRefs: Object.freeze(['brow_midline']),
    existingDerivationDependencyRefs: Object.freeze(['derivation.neutral.brow_midline.pending']),
    qualityPrerequisites: Object.freeze(['frontal_static_view', 'neutral_pose_quality', 'interbrow_geometry_usable']),
  }),
  shangen: Object.freeze({
    neutralRequirementRef: 'neutral.requirement.face.nasal_root_reference',
    requirementState: 'blocked_traditional_neutral_equivalence' as const,
    existingNeutralAnchorDependencyRefs: Object.freeze(['nose']),
    existingDerivationDependencyRefs: Object.freeze(['derivation.neutral.nose_region.pending']),
    qualityPrerequisites: Object.freeze(['frontal_static_view', 'neutral_pose_quality', 'nasal_root_geometry_usable']),
  }),
  zhuntou: Object.freeze({
    neutralRequirementRef: 'neutral.requirement.face.nose_tip_reference',
    requirementState: 'blocked_existing_derivation_dependency' as const,
    existingNeutralAnchorDependencyRefs: Object.freeze(['nose']),
    existingDerivationDependencyRefs: Object.freeze(['derivation.neutral.nose_region.pending']),
    qualityPrerequisites: Object.freeze(['frontal_static_view', 'neutral_pose_quality', 'nose_tip_geometry_usable']),
  }),
  renzhong: Object.freeze({
    neutralRequirementRef: 'neutral.requirement.face.philtrum_midline_reference',
    requirementState: 'blocked_no_existing_neutral_surface' as const,
    existingNeutralAnchorDependencyRefs: Object.freeze([] as string[]),
    existingDerivationDependencyRefs: Object.freeze([] as string[]),
    qualityPrerequisites: Object.freeze(['frontal_static_view', 'neutral_pose_quality', 'philtrum_visible']),
  }),
  dige: Object.freeze({
    neutralRequirementRef: 'neutral.requirement.face.chin_inferior_midline_reference',
    requirementState: 'blocked_no_existing_neutral_surface' as const,
    existingNeutralAnchorDependencyRefs: Object.freeze([] as string[]),
    existingDerivationDependencyRefs: Object.freeze([] as string[]),
    qualityPrerequisites: Object.freeze(['frontal_static_view', 'neutral_pose_quality', 'chin_inferior_contour_visible']),
  }),
});

function sourceRefsForAnchor(anchorRef: MayiThreeDivisionsTraditionalAnchorFR34V1): readonly string[] {
  return Object.freeze(MAYI_THREE_DIVISIONS_BOUNDARY_AUTHORITY_FR33.clauses
    .filter((entry) => entry.fromTraditionalAnchor === anchorRef || entry.toTraditionalAnchor === anchorRef)
    .map((entry) => entry.passage.passageId));
}

function variantIdsForAnchor(anchorRef: MayiThreeDivisionsTraditionalAnchorFR34V1): readonly MayiThreeDivisionsBoundaryVariantIdFR33V1[] {
  return Object.freeze([...new Set(MAYI_THREE_DIVISIONS_BOUNDARY_AUTHORITY_FR33.clauses
    .filter((entry) => entry.fromTraditionalAnchor === anchorRef || entry.toTraditionalAnchor === anchorRef)
    .map((entry) => entry.variantId))]);
}

export const MAYI_THREE_DIVISIONS_NEUTRAL_ANCHOR_REQUIREMENTS_FR34:
readonly MayiThreeDivisionsNeutralAnchorRequirementFR34V1[] = Object.freeze(TRADITIONAL_ANCHORS.map((traditionalAnchorRef) => {
  const spec = REQUIREMENT_SPEC[traditionalAnchorRef];
  return Object.freeze({
    traditionalAnchorRef,
    sourceRefs: sourceRefsForAnchor(traditionalAnchorRef),
    usedByVariantIds: variantIdsForAnchor(traditionalAnchorRef),
    neutralRequirementRef: spec.neutralRequirementRef,
    measurementRole: 'vertical_reference_coordinate' as const,
    requirementState: spec.requirementState,
    existingNeutralAnchorDependencyRefs: spec.existingNeutralAnchorDependencyRefs,
    existingDerivationDependencyRefs: spec.existingDerivationDependencyRefs,
    traditionalNeutralEquivalenceState: 'unreviewed_not_authorized' as const,
    providerLandmarkRefs: Object.freeze([] as number[]),
    qualityPrerequisites: spec.qualityPrerequisites,
    productionBindingAllowed: false as const,
  });
}));

const REQUIREMENT_BY_TRADITIONAL_ANCHOR = new Map(
  MAYI_THREE_DIVISIONS_NEUTRAL_ANCHOR_REQUIREMENTS_FR34.map((entry) => [entry.traditionalAnchorRef, entry] as const),
);

export const MAYI_THREE_DIVISIONS_NEUTRAL_SPAN_REQUIREMENTS_FR34:
readonly MayiThreeDivisionsNeutralSpanRequirementFR34V1[] = Object.freeze(
  MAYI_THREE_DIVISIONS_BOUNDARY_VARIANTS_FR33.flatMap((variant) => variant.spans.map((span) => {
    const fromTraditionalAnchor = span.fromTraditionalAnchor as MayiThreeDivisionsTraditionalAnchorFR34V1;
    const toTraditionalAnchor = span.toTraditionalAnchor as MayiThreeDivisionsTraditionalAnchorFR34V1;
    const fromRequirement = REQUIREMENT_BY_TRADITIONAL_ANCHOR.get(fromTraditionalAnchor);
    const toRequirement = REQUIREMENT_BY_TRADITIONAL_ANCHOR.get(toTraditionalAnchor);
    if (fromRequirement === undefined || toRequirement === undefined) {
      throw new FaceAuthorityValidationError(`FR-34 missing requirement for FR-33 span ${variant.variantId}/${span.section}.`);
    }
    return Object.freeze({
      variantId: variant.variantId,
      section: span.section,
      sourceRef: span.sourceRef,
      fromTraditionalAnchor,
      toTraditionalAnchor,
      fromNeutralRequirementRef: fromRequirement.neutralRequirementRef,
      toNeutralRequirementRef: toRequirement.neutralRequirementRef,
    });
  })),
);

export const MAYI_THREE_DIVISIONS_NEUTRAL_ANCHOR_AUTHORITY_FR34: MayiThreeDivisionsNeutralAnchorAuthorityFR34V1 = Object.freeze({
  schemaVersion: 'fr34-v1' as const,
  authorityRef: 'authority.face.mayi_three_divisions_neutral_anchor_requirements.fr34' as const,
  authorityVersion: '0.1.0' as const,
  authorityState: 'provider_independent_requirements_defined_operationalization_blocked' as const,
  sourceAuthorityRef: SOURCE_AUTHORITY_REF,
  fr14BindingProfileRef: FR14_PROFILE_REF,
  fr17DerivationRegistryRef: FR17_REGISTRY_REF,
  coordinateFrame: 'canonical_image_normalized_2d' as const,
  requirements: MAYI_THREE_DIVISIONS_NEUTRAL_ANCHOR_REQUIREMENTS_FR34,
  variantSpanRequirements: MAYI_THREE_DIVISIONS_NEUTRAL_SPAN_REQUIREMENTS_FR34,
  authorityBoundary: Object.freeze({
    mutateFR14ConsumerContractAllowed: false as const,
    providerSpecificLandmarkIndicesAllowed: false as const,
    traditionalAnchorNameInNeutralProviderOutputAllowed: false as const,
    directTraditionalToNeutralEquivalenceAllowed: false as const,
    sourceVariantSelectionAllowed: false as const,
    crossMethodAnchorNormalizationAllowed: false as const,
    productionMetricAllowed: false as const,
    productionF1Allowed: false as const,
    productionF6Allowed: false as const,
  }),
});

function unique(values: readonly string[], path: string): void {
  if (new Set(values).size !== values.length) throw new FaceAuthorityValidationError(`${path} contains duplicates.`);
}

function sameSequence(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

export function validateMayiThreeDivisionsNeutralAnchorAuthorityFR34(
  authority: MayiThreeDivisionsNeutralAnchorAuthorityFR34V1 = MAYI_THREE_DIVISIONS_NEUTRAL_ANCHOR_AUTHORITY_FR34,
): MayiThreeDivisionsNeutralAnchorAuthorityFR34V1 {
  validateMayiThreeDivisionsBoundaryAuthorityFR33();
  if (
    authority.schemaVersion !== 'fr34-v1' ||
    authority.authorityRef !== 'authority.face.mayi_three_divisions_neutral_anchor_requirements.fr34' ||
    authority.authorityVersion !== '0.1.0' ||
    authority.authorityState !== 'provider_independent_requirements_defined_operationalization_blocked'
  ) {
    throw new FaceAuthorityValidationError('FR-34 authority identity/state drift.');
  }
  if (authority.sourceAuthorityRef !== SOURCE_AUTHORITY_REF ||
      authority.fr14BindingProfileRef !== FR14_PROFILE_REF ||
      authority.fr17DerivationRegistryRef !== FR17_REGISTRY_REF) {
    throw new FaceAuthorityValidationError('FR-34 upstream authority pin drift.');
  }
  if (authority.coordinateFrame !== 'canonical_image_normalized_2d') {
    throw new FaceAuthorityValidationError('FR-34 must remain in the neutral canonical image coordinate frame.');
  }
  if (authority.requirements.length !== TRADITIONAL_ANCHORS.length) {
    throw new FaceAuthorityValidationError('FR-34 must define exactly seven Mayi traditional-anchor neutral requirements.');
  }
  if (!sameSequence(authority.requirements.map((entry) => entry.traditionalAnchorRef), TRADITIONAL_ANCHORS)) {
    throw new FaceAuthorityValidationError('FR-34 traditional anchor requirement order/coverage drift.');
  }
  unique(authority.requirements.map((entry) => entry.neutralRequirementRef), 'fr34.neutralRequirementRefs');

  const fr14Anchors = new Set(FACELAB_NEUTRAL_BINDING_PROFILE_FR14.bindings.map((entry) => entry.anchorRef));
  const fr17ById = new Map(NEUTRAL_DERIVATION_REGISTRY_FR17.definitions.map((entry) => [entry.derivationId, entry] as const));
  for (const requirement of authority.requirements) {
    const expectedSpec = REQUIREMENT_SPEC[requirement.traditionalAnchorRef];
    if (requirement.neutralRequirementRef !== expectedSpec.neutralRequirementRef ||
        requirement.requirementState !== expectedSpec.requirementState ||
        requirement.measurementRole !== 'vertical_reference_coordinate') {
      throw new FaceAuthorityValidationError(`FR-34 requirement drift: ${requirement.traditionalAnchorRef}`);
    }
    const expectedSourceRefs = sourceRefsForAnchor(requirement.traditionalAnchorRef);
    const expectedVariantIds = variantIdsForAnchor(requirement.traditionalAnchorRef);
    if (!sameSequence(requirement.sourceRefs, expectedSourceRefs) || !sameSequence(requirement.usedByVariantIds, expectedVariantIds)) {
      throw new FaceAuthorityValidationError(`FR-34 source/variant coverage drift: ${requirement.traditionalAnchorRef}`);
    }
    if (!sameSequence(requirement.existingNeutralAnchorDependencyRefs, expectedSpec.existingNeutralAnchorDependencyRefs) ||
        !sameSequence(requirement.existingDerivationDependencyRefs, expectedSpec.existingDerivationDependencyRefs)) {
      throw new FaceAuthorityValidationError(`FR-34 upstream neutral dependency drift: ${requirement.traditionalAnchorRef}`);
    }
    for (const neutralAnchorRef of requirement.existingNeutralAnchorDependencyRefs) {
      if (!fr14Anchors.has(neutralAnchorRef)) {
        throw new FaceAuthorityValidationError(`FR-34 references unknown FR-14 neutral dependency: ${neutralAnchorRef}`);
      }
    }
    for (const derivationRef of requirement.existingDerivationDependencyRefs) {
      const derivation = fr17ById.get(derivationRef);
      if (derivation === undefined) throw new FaceAuthorityValidationError(`FR-34 references unknown FR-17 derivation: ${derivationRef}`);
      if (!requirement.existingNeutralAnchorDependencyRefs.includes(derivation.targetAnchorRef)) {
        throw new FaceAuthorityValidationError(`FR-34 derivation target is not declared as a neutral dependency: ${derivationRef}`);
      }
    }
    if (requirement.traditionalNeutralEquivalenceState !== 'unreviewed_not_authorized' ||
        requirement.providerLandmarkRefs.length !== 0 || requirement.productionBindingAllowed !== false) {
      throw new FaceAuthorityValidationError(`FR-34 cannot promote ${requirement.traditionalAnchorRef} into neutral/provider authority.`);
    }
    if (requirement.qualityPrerequisites.length === 0) {
      throw new FaceAuthorityValidationError(`FR-34 requirement needs quality prerequisites: ${requirement.traditionalAnchorRef}`);
    }
  }

  const expectedSpans = MAYI_THREE_DIVISIONS_BOUNDARY_VARIANTS_FR33.flatMap((variant) => variant.spans.map((span) => ({
    variantId: variant.variantId,
    section: span.section,
    sourceRef: span.sourceRef,
    fromTraditionalAnchor: span.fromTraditionalAnchor,
    toTraditionalAnchor: span.toTraditionalAnchor,
  })));
  if (authority.variantSpanRequirements.length !== expectedSpans.length) {
    throw new FaceAuthorityValidationError('FR-34 must preserve all six FR-33 variant spans.');
  }
  authority.variantSpanRequirements.forEach((span, index) => {
    const expected = expectedSpans[index]!;
    const fromRequirement = REQUIREMENT_BY_TRADITIONAL_ANCHOR.get(span.fromTraditionalAnchor);
    const toRequirement = REQUIREMENT_BY_TRADITIONAL_ANCHOR.get(span.toTraditionalAnchor);
    if (span.variantId !== expected.variantId || span.section !== expected.section || span.sourceRef !== expected.sourceRef ||
        span.fromTraditionalAnchor !== expected.fromTraditionalAnchor || span.toTraditionalAnchor !== expected.toTraditionalAnchor ||
        span.fromNeutralRequirementRef !== fromRequirement?.neutralRequirementRef ||
        span.toNeutralRequirementRef !== toRequirement?.neutralRequirementRef) {
      throw new FaceAuthorityValidationError(`FR-34 variant span mapping drift at index ${index}.`);
    }
  });

  if (Object.values(authority.authorityBoundary).some((value) => value !== false)) {
    throw new FaceAuthorityValidationError('FR-34 authority boundary must remain fully fail-closed.');
  }
  return authority;
}

export function assessMayiThreeDivisionsNeutralAnchorReadinessFR34(
  authority: MayiThreeDivisionsNeutralAnchorAuthorityFR34V1 = MAYI_THREE_DIVISIONS_NEUTRAL_ANCHOR_AUTHORITY_FR34,
): MayiThreeDivisionsNeutralAnchorReadinessFR34V1 {
  validateMayiThreeDivisionsNeutralAnchorAuthorityFR34(authority);
  const dependencyRefs = [...new Set(authority.requirements.flatMap((entry) => entry.existingDerivationDependencyRefs))];
  const executableExistingDerivationRefs = dependencyRefs.filter((ref) => {
    const definition = NEUTRAL_DERIVATION_REGISTRY_FR17.definitions.find((entry) => entry.derivationId === ref);
    return definition !== undefined && isNeutralDerivationExecutableFR17(definition);
  });
  const missingNeutralSurfaceAnchorRefs = authority.requirements
    .filter((entry) => entry.requirementState === 'blocked_no_existing_neutral_surface')
    .map((entry) => entry.traditionalAnchorRef);
  return Object.freeze({
    providerIndependentRequirementsComplete: true as const,
    sourceVariantCoverageComplete: true as const,
    existingFR14ContractPreserved: true as const,
    executableExistingDerivationRefs: Object.freeze(executableExistingDerivationRefs),
    missingNeutralSurfaceAnchorRefs: Object.freeze(missingNeutralSurfaceAnchorRefs),
    traditionalNeutralEquivalenceReady: false as const,
    neutralOperationalizationReady: false as const,
    productionMetricReady: false as const,
    productionF1Ready: false as const,
    productionF6Ready: false as const,
    blockers: Object.freeze([
      'FR-33 still preserves two unresolved Mayi boundary variants; FR-34 does not choose between them.',
      'Hairline, 人中, and 地閣 have no existing FR-14 neutral consumer surface.',
      'Existing brow/nose neutral dependencies are blocked by FR-17 derivation readiness and do not authorize traditional equivalence.',
      '印堂, 山根, 準頭, 眉, 人中, and 地閣 cannot be silently equated to modern neutral points or provider landmarks.',
      'No provider-specific landmark index is authorized by this requirement registry.',
      'FR-5 still has no production 三停平等 tolerance, and the F6 period-direction conflict remains open.',
    ]),
  });
}

export function assertMayiThreeDivisionsNeutralOperationalizationReadyFR34(
  authority: MayiThreeDivisionsNeutralAnchorAuthorityFR34V1 = MAYI_THREE_DIVISIONS_NEUTRAL_ANCHOR_AUTHORITY_FR34,
): never {
  validateMayiThreeDivisionsNeutralAnchorAuthorityFR34(authority);
  throw new FaceAuthorityValidationError(
    'FR-34 defines provider-independent Mayi 三停 anchor requirements only; reviewed neutral operationalization and production metrics remain blocked.',
  );
}
