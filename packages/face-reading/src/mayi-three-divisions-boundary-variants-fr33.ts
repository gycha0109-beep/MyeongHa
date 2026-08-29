import type { SourcePassage } from './contracts.js';
import {
  FACE_METHOD_REFS_V0,
  FACE_RESEARCH_PASSAGES_V0,
  FACE_RESEARCH_WITNESSES_V0,
} from './research-pack-v0.js';
import { FaceAuthorityValidationError } from './validation.js';

export type MayiThreeDivisionsBoundaryVariantIdFR33V1 =
  | 'mayi_sancai_noncontiguous'
  | 'mayi_face_contiguous';

export type MayiThreeDivisionsSectionFR33V1 = 'upper' | 'middle' | 'lower';

export interface MayiThreeDivisionsBoundaryClauseFR33V1 {
  readonly passage: SourcePassage;
  readonly variantId: MayiThreeDivisionsBoundaryVariantIdFR33V1;
  readonly section: MayiThreeDivisionsSectionFR33V1;
  readonly fromTraditionalAnchor: string;
  readonly toTraditionalAnchor: string;
}

export interface MayiThreeDivisionsBoundarySpanFR33V1 {
  readonly section: MayiThreeDivisionsSectionFR33V1;
  readonly fromTraditionalAnchor: string;
  readonly toTraditionalAnchor: string;
  readonly sourceRef: string;
}

export interface MayiThreeDivisionsBoundaryVariantFR33V1 {
  readonly variantId: MayiThreeDivisionsBoundaryVariantIdFR33V1;
  readonly label: string;
  readonly continuity: 'non_contiguous_source_formula' | 'contiguous_face_formula';
  readonly sourceRefs: readonly string[];
  readonly spans: readonly MayiThreeDivisionsBoundarySpanFR33V1[];
}

export interface MayiThreeDivisionsBoundaryAuthorityFR33V1 {
  readonly schemaVersion: 'fr33-v1';
  readonly authorityRef: 'authority.face.mayi_three_divisions_boundary_variants.fr33';
  readonly authorityVersion: '0.1.0';
  readonly authorityState: 'scan_checked_multiple_boundary_variants_unresolved';
  readonly methodologyRef: 'method.mayi.face_three_divisions@0.1.0';
  readonly witnessRef: 'witness.mayi_xiangfa.nlc_1925_v1';
  readonly legacyCompositePassageRef: 'passage.mayi.sancai_three_divisions.boundaries';
  readonly legacyCompositeOperationalizationAllowed: false;
  readonly clauses: readonly MayiThreeDivisionsBoundaryClauseFR33V1[];
  readonly variants: readonly MayiThreeDivisionsBoundaryVariantFR33V1[];
  readonly selectionPolicy: {
    readonly status: 'unresolved';
    readonly selectedVariantId: null;
    readonly productionRegionMapAllowed: false;
    readonly productionMetricAllowed: false;
    readonly productionF1Allowed: false;
    readonly productionF6Allowed: false;
  };
  readonly calibrationBoundary: {
    readonly nearEqualTolerance: null;
    readonly nearEqualClassificationAllowed: false;
  };
  readonly observationBoundary: {
    readonly neutralAnchorOperationalizationReady: false;
    readonly providerLandmarkIndexAuthorityAllowed: false;
    readonly crossMethodBoundaryNormalizationAllowed: false;
  };
}

export interface MayiThreeDivisionsBoundaryReadinessFR33V1 {
  readonly scanCheckedBoundaryClausesReady: true;
  readonly multipleBoundaryVariantsPreserved: true;
  readonly singleBoundaryVariantSelected: false;
  readonly neutralAnchorOperationalizationReady: false;
  readonly calibrationReady: false;
  readonly productionRegionMapReady: false;
  readonly productionMetricReady: false;
  readonly productionF1Ready: false;
  readonly productionF6Ready: false;
  readonly blockers: readonly string[];
}

const WITNESS_REF = 'witness.mayi_xiangfa.nlc_1925_v1' as const;
const LEGACY_PASSAGE_REF = 'passage.mayi.sancai_three_divisions.boundaries' as const;

function clause(
  passageId: string,
  scanPage: number,
  originalText: string,
  variantId: MayiThreeDivisionsBoundaryVariantIdFR33V1,
  section: MayiThreeDivisionsSectionFR33V1,
  fromTraditionalAnchor: string,
  toTraditionalAnchor: string,
): MayiThreeDivisionsBoundaryClauseFR33V1 {
  return Object.freeze({
    passage: Object.freeze({
      passageId,
      witnessId: WITNESS_REF,
      volume: '卷一',
      chapter: '三才三停',
      scanPage,
      originalText,
      verificationStatus: 'scan_checked' as const,
    }),
    variantId,
    section,
    fromTraditionalAnchor,
    toTraditionalAnchor,
  });
}

export const MAYI_THREE_DIVISIONS_BOUNDARY_CLAUSES_FR33: readonly MayiThreeDivisionsBoundaryClauseFR33V1[] = Object.freeze([
  clause(
    'passage.mayi.sancai_three_divisions.variant_a.upper',
    35,
    '三停者髮際至印堂為上停',
    'mayi_sancai_noncontiguous',
    'upper',
    'hairline',
    'yintang',
  ),
  clause(
    'passage.mayi.sancai_three_divisions.variant_a.middle',
    35,
    '自山根至準頭為中停',
    'mayi_sancai_noncontiguous',
    'middle',
    'shangen',
    'zhuntou',
  ),
  clause(
    'passage.mayi.sancai_three_divisions.variant_a.lower',
    35,
    '自人中至地閣為下停',
    'mayi_sancai_noncontiguous',
    'lower',
    'renzhong',
    'dige',
  ),
  clause(
    'passage.mayi.sancai_three_divisions.variant_b.upper',
    35,
    '自髮際至眉為上停',
    'mayi_face_contiguous',
    'upper',
    'hairline',
    'brow',
  ),
  clause(
    'passage.mayi.sancai_three_divisions.variant_b.middle',
    36,
    '眉至準頭為中停',
    'mayi_face_contiguous',
    'middle',
    'brow',
    'zhuntou',
  ),
  clause(
    'passage.mayi.sancai_three_divisions.variant_b.lower',
    36,
    '準至地閣為下停',
    'mayi_face_contiguous',
    'lower',
    'zhuntou',
    'dige',
  ),
]);

function buildVariant(
  variantId: MayiThreeDivisionsBoundaryVariantIdFR33V1,
  label: string,
  continuity: MayiThreeDivisionsBoundaryVariantFR33V1['continuity'],
): MayiThreeDivisionsBoundaryVariantFR33V1 {
  const selected = MAYI_THREE_DIVISIONS_BOUNDARY_CLAUSES_FR33.filter((entry) => entry.variantId === variantId);
  return Object.freeze({
    variantId,
    label,
    continuity,
    sourceRefs: Object.freeze(selected.map((entry) => entry.passage.passageId)),
    spans: Object.freeze(selected.map((entry) => Object.freeze({
      section: entry.section,
      fromTraditionalAnchor: entry.fromTraditionalAnchor,
      toTraditionalAnchor: entry.toTraditionalAnchor,
      sourceRef: entry.passage.passageId,
    }))),
  });
}

export const MAYI_THREE_DIVISIONS_BOUNDARY_VARIANTS_FR33: readonly MayiThreeDivisionsBoundaryVariantFR33V1[] = Object.freeze([
  buildVariant(
    'mayi_sancai_noncontiguous',
    '三才三停 transmitted non-contiguous boundary formula',
    'non_contiguous_source_formula',
  ),
  buildVariant(
    'mayi_face_contiguous',
    '髮際→眉→準頭→地閣 contiguous face boundary formula',
    'contiguous_face_formula',
  ),
]);

export const MAYI_THREE_DIVISIONS_BOUNDARY_AUTHORITY_FR33: MayiThreeDivisionsBoundaryAuthorityFR33V1 = Object.freeze({
  schemaVersion: 'fr33-v1' as const,
  authorityRef: 'authority.face.mayi_three_divisions_boundary_variants.fr33' as const,
  authorityVersion: '0.1.0' as const,
  authorityState: 'scan_checked_multiple_boundary_variants_unresolved' as const,
  methodologyRef: FACE_METHOD_REFS_V0.mayiThreeDivisions,
  witnessRef: WITNESS_REF,
  legacyCompositePassageRef: LEGACY_PASSAGE_REF,
  legacyCompositeOperationalizationAllowed: false as const,
  clauses: MAYI_THREE_DIVISIONS_BOUNDARY_CLAUSES_FR33,
  variants: MAYI_THREE_DIVISIONS_BOUNDARY_VARIANTS_FR33,
  selectionPolicy: Object.freeze({
    status: 'unresolved' as const,
    selectedVariantId: null,
    productionRegionMapAllowed: false as const,
    productionMetricAllowed: false as const,
    productionF1Allowed: false as const,
    productionF6Allowed: false as const,
  }),
  calibrationBoundary: Object.freeze({
    nearEqualTolerance: null,
    nearEqualClassificationAllowed: false as const,
  }),
  observationBoundary: Object.freeze({
    neutralAnchorOperationalizationReady: false as const,
    providerLandmarkIndexAuthorityAllowed: false as const,
    crossMethodBoundaryNormalizationAllowed: false as const,
  }),
});

const EXPECTED_CLAUSES = Object.freeze([
  Object.freeze(['passage.mayi.sancai_three_divisions.variant_a.upper', 35, '三停者髮際至印堂為上停', 'mayi_sancai_noncontiguous', 'upper', 'hairline', 'yintang'] as const),
  Object.freeze(['passage.mayi.sancai_three_divisions.variant_a.middle', 35, '自山根至準頭為中停', 'mayi_sancai_noncontiguous', 'middle', 'shangen', 'zhuntou'] as const),
  Object.freeze(['passage.mayi.sancai_three_divisions.variant_a.lower', 35, '自人中至地閣為下停', 'mayi_sancai_noncontiguous', 'lower', 'renzhong', 'dige'] as const),
  Object.freeze(['passage.mayi.sancai_three_divisions.variant_b.upper', 35, '自髮際至眉為上停', 'mayi_face_contiguous', 'upper', 'hairline', 'brow'] as const),
  Object.freeze(['passage.mayi.sancai_three_divisions.variant_b.middle', 36, '眉至準頭為中停', 'mayi_face_contiguous', 'middle', 'brow', 'zhuntou'] as const),
  Object.freeze(['passage.mayi.sancai_three_divisions.variant_b.lower', 36, '準至地閣為下停', 'mayi_face_contiguous', 'lower', 'zhuntou', 'dige'] as const),
]);

function assertExactClauseSet(clauses: readonly MayiThreeDivisionsBoundaryClauseFR33V1[]): void {
  if (clauses.length !== EXPECTED_CLAUSES.length) {
    throw new FaceAuthorityValidationError('FR-33 must preserve exactly six scan-checked Mayi boundary clauses.');
  }
  clauses.forEach((entry, index) => {
    const expected = EXPECTED_CLAUSES[index]!;
    if (
      entry.passage.passageId !== expected[0] ||
      entry.passage.scanPage !== expected[1] ||
      entry.passage.originalText !== expected[2] ||
      entry.variantId !== expected[3] ||
      entry.section !== expected[4] ||
      entry.fromTraditionalAnchor !== expected[5] ||
      entry.toTraditionalAnchor !== expected[6]
    ) {
      throw new FaceAuthorityValidationError(`FR-33 Mayi boundary clause drift: ${entry.passage.passageId}`);
    }
    if (
      entry.passage.witnessId !== WITNESS_REF ||
      entry.passage.volume !== '卷一' ||
      entry.passage.chapter !== '三才三停' ||
      entry.passage.verificationStatus !== 'scan_checked'
    ) {
      throw new FaceAuthorityValidationError(`FR-33 Mayi clause provenance drift: ${entry.passage.passageId}`);
    }
  });
}

function assertExactVariants(variants: readonly MayiThreeDivisionsBoundaryVariantFR33V1[]): void {
  if (variants.length !== 2) throw new FaceAuthorityValidationError('FR-33 must preserve exactly two Mayi boundary variants.');
  const [first, second] = variants;
  if (
    first?.variantId !== 'mayi_sancai_noncontiguous' ||
    first.continuity !== 'non_contiguous_source_formula' ||
    second?.variantId !== 'mayi_face_contiguous' ||
    second.continuity !== 'contiguous_face_formula'
  ) {
    throw new FaceAuthorityValidationError('FR-33 Mayi boundary variant identity/continuity drift.');
  }
  for (const variant of variants) {
    const expectedClauses = MAYI_THREE_DIVISIONS_BOUNDARY_CLAUSES_FR33.filter((entry) => entry.variantId === variant.variantId);
    const expectedRefs = expectedClauses.map((entry) => entry.passage.passageId);
    if (variant.sourceRefs.join('|') !== expectedRefs.join('|') || variant.spans.length !== 3) {
      throw new FaceAuthorityValidationError(`FR-33 source coverage drift: ${variant.variantId}`);
    }
    variant.spans.forEach((span, index) => {
      const expected = expectedClauses[index]!;
      if (
        span.section !== expected.section ||
        span.fromTraditionalAnchor !== expected.fromTraditionalAnchor ||
        span.toTraditionalAnchor !== expected.toTraditionalAnchor ||
        span.sourceRef !== expected.passage.passageId
      ) {
        throw new FaceAuthorityValidationError(`FR-33 traditional anchor normalization is unauthorized: ${variant.variantId}`);
      }
    });
  }
}

export function validateMayiThreeDivisionsBoundaryAuthorityFR33(
  authority: MayiThreeDivisionsBoundaryAuthorityFR33V1 = MAYI_THREE_DIVISIONS_BOUNDARY_AUTHORITY_FR33,
): MayiThreeDivisionsBoundaryAuthorityFR33V1 {
  if (
    authority.schemaVersion !== 'fr33-v1' ||
    authority.authorityRef !== 'authority.face.mayi_three_divisions_boundary_variants.fr33' ||
    authority.authorityVersion !== '0.1.0' ||
    authority.authorityState !== 'scan_checked_multiple_boundary_variants_unresolved'
  ) {
    throw new FaceAuthorityValidationError('FR-33 authority identity/state drift.');
  }
  if (authority.methodologyRef !== FACE_METHOD_REFS_V0.mayiThreeDivisions || authority.witnessRef !== WITNESS_REF) {
    throw new FaceAuthorityValidationError('FR-33 must remain bound to the exact Mayi methodology and 1925 NLC witness.');
  }
  const witness = FACE_RESEARCH_WITNESSES_V0.find((entry) => entry.witnessId === WITNESS_REF);
  if (witness?.witnessStatus !== 'verified') {
    throw new FaceAuthorityValidationError('FR-33 requires the verified 1925 NLC Mayi witness.');
  }
  const legacy = FACE_RESEARCH_PASSAGES_V0.find((entry) => entry.passageId === LEGACY_PASSAGE_REF);
  if (legacy?.verificationStatus !== 'scan_checked' || authority.legacyCompositePassageRef !== LEGACY_PASSAGE_REF) {
    throw new FaceAuthorityValidationError('FR-33 legacy composite passage linkage drift.');
  }
  if (authority.legacyCompositeOperationalizationAllowed !== false) {
    throw new FaceAuthorityValidationError('FR-33 legacy ellipsized composite passage cannot authorize operationalization.');
  }

  assertExactClauseSet(authority.clauses);
  assertExactVariants(authority.variants);

  if (
    authority.selectionPolicy.status !== 'unresolved' ||
    authority.selectionPolicy.selectedVariantId !== null ||
    authority.selectionPolicy.productionRegionMapAllowed !== false ||
    authority.selectionPolicy.productionMetricAllowed !== false ||
    authority.selectionPolicy.productionF1Allowed !== false ||
    authority.selectionPolicy.productionF6Allowed !== false
  ) {
    throw new FaceAuthorityValidationError('FR-33 boundary variant selection must remain unresolved and production-blocking.');
  }
  if (
    authority.calibrationBoundary.nearEqualTolerance !== null ||
    authority.calibrationBoundary.nearEqualClassificationAllowed !== false
  ) {
    throw new FaceAuthorityValidationError('FR-33 cannot invent a 三停平等 numeric tolerance.');
  }
  if (
    authority.observationBoundary.neutralAnchorOperationalizationReady !== false ||
    authority.observationBoundary.providerLandmarkIndexAuthorityAllowed !== false ||
    authority.observationBoundary.crossMethodBoundaryNormalizationAllowed !== false
  ) {
    throw new FaceAuthorityValidationError('FR-33 must not promote unresolved source anchors into neutral/provider authority.');
  }
  return authority;
}

export function assessMayiThreeDivisionsBoundaryReadinessFR33(
  authority: MayiThreeDivisionsBoundaryAuthorityFR33V1 = MAYI_THREE_DIVISIONS_BOUNDARY_AUTHORITY_FR33,
): MayiThreeDivisionsBoundaryReadinessFR33V1 {
  validateMayiThreeDivisionsBoundaryAuthorityFR33(authority);
  return Object.freeze({
    scanCheckedBoundaryClausesReady: true as const,
    multipleBoundaryVariantsPreserved: true as const,
    singleBoundaryVariantSelected: false as const,
    neutralAnchorOperationalizationReady: false as const,
    calibrationReady: false as const,
    productionRegionMapReady: false as const,
    productionMetricReady: false as const,
    productionF1Ready: false as const,
    productionF6Ready: false as const,
    blockers: Object.freeze([
      'Mayi 1925 scan contains two distinct 三停 boundary formulations and no reviewed selection policy chooses one.',
      'The legacy ellipsized composite passage is source evidence only and cannot authorize a region map.',
      'Neutral observable anchors for hairline/brow/yintang/shangen/zhuntou/renzhong/dige are not operationalized as one reviewed Mayi contract.',
      'FR-5 calibration has not established a numeric 三停平等 tolerance.',
      'The existing cross-method period-direction conflict remains open for F6.',
    ]),
  });
}

export function assertMayiThreeDivisionsBoundarySelectionReadyFR33(
  authority: MayiThreeDivisionsBoundaryAuthorityFR33V1 = MAYI_THREE_DIVISIONS_BOUNDARY_AUTHORITY_FR33,
): never {
  validateMayiThreeDivisionsBoundaryAuthorityFR33(authority);
  throw new FaceAuthorityValidationError(
    'FR-33 Mayi 三停 boundary selection is unresolved; region-map, metric, F1, and F6 production promotion is blocked.',
  );
}
