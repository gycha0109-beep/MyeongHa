import {
  DIGE_CHIN_CONTOUR_EVIDENCE_BRIDGE_AUTHORITY_FR49,
  validateDigeChinContourEvidenceBridgeAuthorityFR49,
} from './dige-chin-contour-evidence-bridge-fr49.js';
import {
  PROVIDER_INDEPENDENT_CHIN_CONTOUR_GEOMETRY_AUTHORITY_FR50,
  deriveCentralChinInferiorSparseScaffoldFR50,
  validateProviderIndependentChinContourGeometryAuthorityFR50,
  type CentralChinInferiorSparseScaffoldFR50V1,
  type IndependentCentralChinScaffoldAnnotationFR50V1,
} from './provider-independent-chin-contour-geometry-fr50.js';
import { FaceAuthorityValidationError } from './validation.js';

export type ChinInferiorContourScopeEvidenceLineageFR51V1 =
  | 'traditional_transmitted_face_reading'
  | 'historical_anatomical_terminology'
  | 'modern_soft_tissue_morphometrics';

export interface ChinInferiorContourScopeEvidenceFR51V1 {
  readonly evidenceId: string;
  readonly lineage: ChinInferiorContourScopeEvidenceLineageFR51V1;
  readonly title: string;
  readonly sourceRef: string;
  readonly reviewedObservation: string;
  readonly supports: {
    readonly digeCenteredOnKeChin: boolean;
    readonly digeLocatedBelowChengjiangWithinYiKeChinArea: boolean;
    readonly bilateralYiOrLateralLowerFaceTreatedSeparately: boolean;
    readonly historicalDigeKeChinTerminology: boolean;
    readonly centralMentonSideScaffoldDistinctFromGonion: boolean;
    readonly broaderLowerJawlineOperationalizationDistinct: boolean;
  };
  readonly doesNotSupport: readonly string[];
}

export interface ChinInferiorContourScopeDecisionFR51V1 {
  readonly fr35SurfaceRef: 'neutral.face.chin_inferior_contour';
  readonly selectedScopeClass: 'central_inferior_soft_tissue_chin_boundary';
  readonly selectionState: 'scope_class_selected_exact_curve_geometry_pending';
  readonly traditionalConsumerScopeEvidenceSufficient: true;
  readonly modernNeutralScopeCompatibilityEvidenceSufficient: true;
  readonly broaderOtobasionToMentonLowerJawlineRejectedAsFR35ConsumerScope: true;
  readonly mandibularAngleGonionRejectedAsRequiredFR35Endpoint: true;
  readonly softTissueMentonRequiredAsInferiorMidlineAnchor: true;
  readonly fr50MentonSideScaffoldCompatibleWithSelectedScopeClass: true;
  readonly fr50MentonSidePointsAreExactFR35Endpoints: false;
  readonly exactLateralEndpointRuleEstablished: false;
  readonly denseContinuousCurveEstablished: false;
  readonly canonicalImage2DExtractionEstablished: false;
  readonly providerMappingEstablished: false;
  readonly traditionalDigeEqualsSelectedNeutralCurve: false;
}

export interface ChinInferiorContourScopeResearchProtocolFR51V1 {
  readonly protocolRef: 'protocol.face.chin_inferior.scope_class.fr51@0.1.0';
  readonly selectedScopeClass: 'central_inferior_soft_tissue_chin_boundary';
  readonly requiredInferiorMidlineAnchor: 'soft_tissue_menton';
  readonly provisionalLateralResearchScaffold: 'fr50_bilateral_menton_side_plus_menton';
  readonly provisionalScaffoldStatus: 'scope_compatible_not_exact_fr35_curve';
  readonly endpointSelectionRule: null;
  readonly interpolationMethod: null;
  readonly smoothingMethod: null;
  readonly providerSubsetRule: null;
  readonly minimumSubjectCount: null;
  readonly maximumAllowedContourError: null;
}

export interface ChinInferiorContourScopeAuthorityFR51V1 {
  readonly schemaVersion: 'fr51-v1';
  readonly authorityRef: 'authority.face.chin_inferior_contour_scope_adjudication.fr51';
  readonly authorityVersion: '0.1.0';
  readonly authorityState: 'central_inferior_soft_tissue_chin_scope_class_selected_exact_endpoints_dense_curve_and_provider_binding_blocked';
  readonly upstreamFR49Ref: string;
  readonly upstreamFR50Ref: string;
  readonly evidence: readonly ChinInferiorContourScopeEvidenceFR51V1[];
  readonly scopeDecision: ChinInferiorContourScopeDecisionFR51V1;
  readonly researchProtocol: ChinInferiorContourScopeResearchProtocolFR51V1;
  readonly authorityBoundary: {
    readonly transmittedCompilationMeansOriginalAuthorshipOrEarliestWitness: false;
    readonly traditionalDigeEqualsSelectedNeutralCurve: false;
    readonly traditionalDigeEqualsSoftTissueMenton: false;
    readonly mentonSideMeansTraditionalDigeEdge: false;
    readonly fr50SparseScaffoldMeansExactFR35Curve: false;
    readonly broaderLowerJawlineMaySubstituteForSelectedScope: false;
    readonly gonionOrOtobasionInferiusMayBeRequiredFR35Endpoint: false;
    readonly exactLateralEndpointsAuthorized: false;
    readonly interpolationAuthorized: false;
    readonly smoothingAuthorized: false;
    readonly providerFaceOvalMeansReviewedChinContour: false;
    readonly providerIndex152MeansMenton: false;
    readonly providerSubsetBindingAuthorized: false;
    readonly canonicalImage2DExtractionAuthorized: false;
    readonly traditionalSemanticProjectionAllowed: false;
    readonly productionThreeDivisionsMetricAllowed: false;
    readonly productionF1Allowed: false;
    readonly productionF6Allowed: false;
    readonly productionGeometryAuthorized: false;
  };
}

export interface ScopeCompatibleCentralChinScaffoldFR51V1 {
  readonly algorithmRef: 'algorithm.research.chin_inferior.scope_compatible_sparse_scaffold.fr51@0.1.0';
  readonly scopeAuthorityRef: 'authority.face.chin_inferior_contour_scope_adjudication.fr51@0.1.0';
  readonly selectedScopeClass: 'central_inferior_soft_tissue_chin_boundary';
  readonly geometry: CentralChinInferiorSparseScaffoldFR50V1['geometry'];
  readonly pointOrder: CentralChinInferiorSparseScaffoldFR50V1['pointOrder'];
  readonly sourceScaffoldAlgorithmRef: CentralChinInferiorSparseScaffoldFR50V1['algorithmRef'];
  readonly compatibilityState: 'compatible_with_selected_scope_class_not_exact_lateral_endpoints_or_dense_curve';
  readonly exactFR35CurveAuthorized: false;
  readonly exactLateralEndpointsAuthorized: false;
  readonly providerMappingAuthorized: false;
  readonly traditionalDigeEquivalenceAuthorized: false;
  readonly productionGeometryAuthorized: false;
}

export interface ChinInferiorContourScopeReadinessFR51V1 {
  readonly traditionalConsumerScopeEvidenceReady: true;
  readonly modernNeutralScopeCompatibilityEvidenceReady: true;
  readonly fr35AnatomicalScopeClassReady: true;
  readonly selectedCentralInferiorChinScopeReady: true;
  readonly fr50SparseScaffoldScopeCompatibilityReady: true;
  readonly exactLateralEndpointRuleReady: false;
  readonly denseContinuousCurveReady: false;
  readonly canonicalImage2DExtractionReady: false;
  readonly providerMappingReady: false;
  readonly traditionalDigeCurveEquivalenceReady: false;
  readonly productionGeometryReady: false;
  readonly nextRequiredEvidence: readonly string[];
}

const FR49_REF = `${DIGE_CHIN_CONTOUR_EVIDENCE_BRIDGE_AUTHORITY_FR49.authorityRef}@${DIGE_CHIN_CONTOUR_EVIDENCE_BRIDGE_AUTHORITY_FR49.authorityVersion}`;
const FR50_REF = `${PROVIDER_INDEPENDENT_CHIN_CONTOUR_GEOMETRY_AUTHORITY_FR50.authorityRef}@${PROVIDER_INDEPENDENT_CHIN_CONTOUR_GEOMETRY_AUTHORITY_FR50.authorityVersion}`;

const EVIDENCE: readonly ChinInferiorContourScopeEvidenceFR51V1[] = Object.freeze([
  Object.freeze({
    evidenceId: 'evidence.fr51.gujin_shenxiang_scan48_ke_is_dige',
    lineage: 'traditional_transmitted_face_reading' as const,
    title: '欽定古今圖書集成 藝術典卷六百三十六 — 神相全編六〈神異賦〉 transmitted witness, scan page 48',
    sourceRef: 'https://zh.wikisource.org/wiki/Page:Gujin_Tushu_Jicheng,_Volume_473_(1700-1725).djvu/48',
    reviewedObservation: 'The transmitted commentary states 頦為地閣 and places 地閣 in 下停. This supports the traditional consumer anchor at the chin/頦 rather than defining the entire ear-to-chin jawline as 地閣.',
    supports: Object.freeze({
      digeCenteredOnKeChin: true,
      digeLocatedBelowChengjiangWithinYiKeChinArea: false,
      bilateralYiOrLateralLowerFaceTreatedSeparately: false,
      historicalDigeKeChinTerminology: false,
      centralMentonSideScaffoldDistinctFromGonion: false,
      broaderLowerJawlineOperationalizationDistinct: false,
    }),
    doesNotSupport: Object.freeze([
      'The compilation witness does not prove original authorship or the earliest historical wording of 神異賦.',
      '頦為地閣 does not define a modern soft-tissue point, curve, coordinate frame, or provider landmark.',
    ]),
  }),
  Object.freeze({
    evidenceId: 'evidence.fr51.gujin_shenxiang_scan49_dige_between_yi_ke',
    lineage: 'traditional_transmitted_face_reading' as const,
    title: '欽定古今圖書集成 藝術典卷六百三十六 — 神相全編六〈神異賦〉 transmitted witness, scan page 49',
    sourceRef: 'https://zh.wikisource.org/wiki/Page:Gujin_Tushu_Jicheng,_Volume_473_(1700-1725).djvu/49',
    reviewedObservation: 'The transmitted commentary locates 地閣 below 承漿 and between 頤 and 頦, and later repeats 地閣為頦. The same page separately discusses 重頤豐頷 and broad bilateral cheek/jaw fullness, supporting a central chin-region consumer scope rather than silently extending 地閣 to the full lower jawline.',
    supports: Object.freeze({
      digeCenteredOnKeChin: true,
      digeLocatedBelowChengjiangWithinYiKeChinArea: true,
      bilateralYiOrLateralLowerFaceTreatedSeparately: true,
      historicalDigeKeChinTerminology: false,
      centralMentonSideScaffoldDistinctFromGonion: false,
      broaderLowerJawlineOperationalizationDistinct: false,
    }),
    doesNotSupport: Object.freeze([
      'The passage gives a traditional region relation, not exact left/right soft-tissue endpoints.',
      '承漿, 頤, 頦, and 地閣 are not asserted to equal modern anthropometric landmarks one-to-one.',
    ]),
  }),
  Object.freeze({
    evidenceId: 'evidence.fr51.gujin_shenxiang_scan54_diku_bilateral_yi',
    lineage: 'traditional_transmitted_face_reading' as const,
    title: '欽定古今圖書集成 藝術典卷六百三十六 — 神相全編六〈神異賦〉 transmitted witness, scan page 54',
    sourceRef: 'https://zh.wikisource.org/wiki/Page:Gujin_Tushu_Jicheng,_Volume_473_(1700-1725).djvu/54',
    reviewedObservation: 'The same transmitted text states 地庫在兩頤. This independently preserves bilateral 頤 locations under a different traditional label and therefore argues against treating every lateral lower-jaw surface as 地閣.',
    supports: Object.freeze({
      digeCenteredOnKeChin: false,
      digeLocatedBelowChengjiangWithinYiKeChinArea: false,
      bilateralYiOrLateralLowerFaceTreatedSeparately: true,
      historicalDigeKeChinTerminology: false,
      centralMentonSideScaffoldDistinctFromGonion: false,
      broaderLowerJawlineOperationalizationDistinct: false,
    }),
    doesNotSupport: Object.freeze([
      '地庫在兩頤 does not provide modern metric boundaries between 地庫, 頤, 頦, and 地閣.',
      'It does not authorize a geometric endpoint at the mouth commissure, gonion, or provider topology.',
    ]),
  }),
  Object.freeze({
    evidenceId: 'evidence.fr51.yizong_jinjian_dige_ke_lower_chin',
    lineage: 'historical_anatomical_terminology' as const,
    title: '御纂醫宗金鑒 — 正骨心法要旨 — 地閣骨',
    sourceRef: 'https://ctext.org/wiki.pl?chapter=882017&if=en',
    reviewedObservation: 'The historical medical text identifies 地閣骨 with 頦 and the colloquial 下巴骨, corroborating that 地閣 terminology belongs to the chin/lower-anterior mandibular region rather than establishing a soft-tissue full-jawline curve.',
    supports: Object.freeze({
      digeCenteredOnKeChin: true,
      digeLocatedBelowChengjiangWithinYiKeChinArea: false,
      bilateralYiOrLateralLowerFaceTreatedSeparately: false,
      historicalDigeKeChinTerminology: true,
      centralMentonSideScaffoldDistinctFromGonion: false,
      broaderLowerJawlineOperationalizationDistinct: false,
    }),
    doesNotSupport: Object.freeze([
      'This is historical bony anatomy terminology and does not prove traditional soft-tissue 地閣 equals Menton or any modern curve.',
      'It does not define a canonical 2D image extraction rule.',
    ]),
  }),
  Object.freeze({
    evidenceId: 'evidence.fr51.zupan_2022_central_chin_scaffold_vs_gonion',
    lineage: 'modern_soft_tissue_morphometrics' as const,
    title: 'An evaluation of three-dimensional facial changes after surgically assisted rapid maxillary expansion (SARME): an observational study',
    sourceRef: 'DOI:10.1186/s12903-022-02179-1',
    reviewedObservation: 'The 3D facial landmark protocol defines midline Menton, bilateral Menton-side points at the lowest chin under the Cheilion verticals, and separate bilateral Gonion landmarks. This supplies a modern neutral distinction between a central-inferior chin scaffold and the more lateral mandibular-angle region.',
    supports: Object.freeze({
      digeCenteredOnKeChin: false,
      digeLocatedBelowChengjiangWithinYiKeChinArea: false,
      bilateralYiOrLateralLowerFaceTreatedSeparately: false,
      historicalDigeKeChinTerminology: false,
      centralMentonSideScaffoldDistinctFromGonion: true,
      broaderLowerJawlineOperationalizationDistinct: false,
    }),
    doesNotSupport: Object.freeze([
      'Menton-side is a modern study landmark and is not asserted to be the traditional edge of 地閣.',
      'The 3D scan definition does not establish exact canonical-image 2D endpoints, interpolation, or provider mapping.',
    ]),
  }),
  Object.freeze({
    evidenceId: 'evidence.fr51.windhager_2019_broader_lower_jawline_distinct',
    lineage: 'modern_soft_tissue_morphometrics' as const,
    title: 'Facial aging trajectories: A common shape pattern in male and female faces is disrupted after menopause',
    sourceRef: 'DOI:10.1002/ajpa.23878',
    reviewedObservation: 'The 3D morphometric scheme represents each lower jawline from Otobasion inferius to Menton using sliding semilandmarks. This demonstrates that a full lower-jawline construction is materially broader than a central Menton-side/Menton scaffold and should not be collapsed into the selected FR-35 consumer scope without separate evidence.',
    supports: Object.freeze({
      digeCenteredOnKeChin: false,
      digeLocatedBelowChengjiangWithinYiKeChinArea: false,
      bilateralYiOrLateralLowerFaceTreatedSeparately: false,
      historicalDigeKeChinTerminology: false,
      centralMentonSideScaffoldDistinctFromGonion: false,
      broaderLowerJawlineOperationalizationDistinct: true,
    }),
    doesNotSupport: Object.freeze([
      'The study-specific lower-jawline curve is not the traditional 地閣 region and is not selected as FR-35 by FR-51.',
      'Its semilandmark count and 3D surface construction are not imported as universal MyeongHa geometry.',
    ]),
  }),
]);

const SCOPE_DECISION: ChinInferiorContourScopeDecisionFR51V1 = Object.freeze({
  fr35SurfaceRef: 'neutral.face.chin_inferior_contour' as const,
  selectedScopeClass: 'central_inferior_soft_tissue_chin_boundary' as const,
  selectionState: 'scope_class_selected_exact_curve_geometry_pending' as const,
  traditionalConsumerScopeEvidenceSufficient: true as const,
  modernNeutralScopeCompatibilityEvidenceSufficient: true as const,
  broaderOtobasionToMentonLowerJawlineRejectedAsFR35ConsumerScope: true as const,
  mandibularAngleGonionRejectedAsRequiredFR35Endpoint: true as const,
  softTissueMentonRequiredAsInferiorMidlineAnchor: true as const,
  fr50MentonSideScaffoldCompatibleWithSelectedScopeClass: true as const,
  fr50MentonSidePointsAreExactFR35Endpoints: false as const,
  exactLateralEndpointRuleEstablished: false as const,
  denseContinuousCurveEstablished: false as const,
  canonicalImage2DExtractionEstablished: false as const,
  providerMappingEstablished: false as const,
  traditionalDigeEqualsSelectedNeutralCurve: false as const,
});

const RESEARCH_PROTOCOL: ChinInferiorContourScopeResearchProtocolFR51V1 = Object.freeze({
  protocolRef: 'protocol.face.chin_inferior.scope_class.fr51@0.1.0' as const,
  selectedScopeClass: 'central_inferior_soft_tissue_chin_boundary' as const,
  requiredInferiorMidlineAnchor: 'soft_tissue_menton' as const,
  provisionalLateralResearchScaffold: 'fr50_bilateral_menton_side_plus_menton' as const,
  provisionalScaffoldStatus: 'scope_compatible_not_exact_fr35_curve' as const,
  endpointSelectionRule: null,
  interpolationMethod: null,
  smoothingMethod: null,
  providerSubsetRule: null,
  minimumSubjectCount: null,
  maximumAllowedContourError: null,
});

export const CHIN_INFERIOR_CONTOUR_SCOPE_AUTHORITY_FR51: ChinInferiorContourScopeAuthorityFR51V1 = Object.freeze({
  schemaVersion: 'fr51-v1' as const,
  authorityRef: 'authority.face.chin_inferior_contour_scope_adjudication.fr51' as const,
  authorityVersion: '0.1.0' as const,
  authorityState: 'central_inferior_soft_tissue_chin_scope_class_selected_exact_endpoints_dense_curve_and_provider_binding_blocked' as const,
  upstreamFR49Ref: FR49_REF,
  upstreamFR50Ref: FR50_REF,
  evidence: EVIDENCE,
  scopeDecision: SCOPE_DECISION,
  researchProtocol: RESEARCH_PROTOCOL,
  authorityBoundary: Object.freeze({
    transmittedCompilationMeansOriginalAuthorshipOrEarliestWitness: false as const,
    traditionalDigeEqualsSelectedNeutralCurve: false as const,
    traditionalDigeEqualsSoftTissueMenton: false as const,
    mentonSideMeansTraditionalDigeEdge: false as const,
    fr50SparseScaffoldMeansExactFR35Curve: false as const,
    broaderLowerJawlineMaySubstituteForSelectedScope: false as const,
    gonionOrOtobasionInferiusMayBeRequiredFR35Endpoint: false as const,
    exactLateralEndpointsAuthorized: false as const,
    interpolationAuthorized: false as const,
    smoothingAuthorized: false as const,
    providerFaceOvalMeansReviewedChinContour: false as const,
    providerIndex152MeansMenton: false as const,
    providerSubsetBindingAuthorized: false as const,
    canonicalImage2DExtractionAuthorized: false as const,
    traditionalSemanticProjectionAllowed: false as const,
    productionThreeDivisionsMetricAllowed: false as const,
    productionF1Allowed: false as const,
    productionF6Allowed: false as const,
    productionGeometryAuthorized: false as const,
  }),
});

const EXPECTED_EVIDENCE_IDS = Object.freeze([
  'evidence.fr51.gujin_shenxiang_scan48_ke_is_dige',
  'evidence.fr51.gujin_shenxiang_scan49_dige_between_yi_ke',
  'evidence.fr51.gujin_shenxiang_scan54_diku_bilateral_yi',
  'evidence.fr51.yizong_jinjian_dige_ke_lower_chin',
  'evidence.fr51.zupan_2022_central_chin_scaffold_vs_gonion',
  'evidence.fr51.windhager_2019_broader_lower_jawline_distinct',
]);

function sameSequence(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

export function validateChinInferiorContourScopeAuthorityFR51(
  authority: ChinInferiorContourScopeAuthorityFR51V1 = CHIN_INFERIOR_CONTOUR_SCOPE_AUTHORITY_FR51,
): ChinInferiorContourScopeAuthorityFR51V1 {
  validateDigeChinContourEvidenceBridgeAuthorityFR49();
  validateProviderIndependentChinContourGeometryAuthorityFR50();

  if (
    authority.schemaVersion !== 'fr51-v1' ||
    authority.authorityRef !== 'authority.face.chin_inferior_contour_scope_adjudication.fr51' ||
    authority.authorityVersion !== '0.1.0' ||
    authority.authorityState !== 'central_inferior_soft_tissue_chin_scope_class_selected_exact_endpoints_dense_curve_and_provider_binding_blocked'
  ) {
    throw new FaceAuthorityValidationError('FR-51 authority identity/state drift.');
  }
  if (authority.upstreamFR49Ref !== FR49_REF || authority.upstreamFR50Ref !== FR50_REF) {
    throw new FaceAuthorityValidationError('FR-51 upstream authority pin drift.');
  }
  if (!sameSequence(authority.evidence.map((entry) => entry.evidenceId), EXPECTED_EVIDENCE_IDS)) {
    throw new FaceAuthorityValidationError('FR-51 evidence set/order drift.');
  }
  if (authority.evidence.some((entry) => entry.doesNotSupport.length === 0)) {
    throw new FaceAuthorityValidationError('FR-51 every evidence record must preserve explicit limitations.');
  }

  const decision = authority.scopeDecision;
  if (
    decision.fr35SurfaceRef !== 'neutral.face.chin_inferior_contour' ||
    decision.selectedScopeClass !== 'central_inferior_soft_tissue_chin_boundary' ||
    decision.selectionState !== 'scope_class_selected_exact_curve_geometry_pending' ||
    decision.traditionalConsumerScopeEvidenceSufficient !== true ||
    decision.modernNeutralScopeCompatibilityEvidenceSufficient !== true ||
    decision.broaderOtobasionToMentonLowerJawlineRejectedAsFR35ConsumerScope !== true ||
    decision.mandibularAngleGonionRejectedAsRequiredFR35Endpoint !== true ||
    decision.softTissueMentonRequiredAsInferiorMidlineAnchor !== true ||
    decision.fr50MentonSideScaffoldCompatibleWithSelectedScopeClass !== true ||
    decision.fr50MentonSidePointsAreExactFR35Endpoints !== false ||
    decision.exactLateralEndpointRuleEstablished !== false ||
    decision.denseContinuousCurveEstablished !== false ||
    decision.canonicalImage2DExtractionEstablished !== false ||
    decision.providerMappingEstablished !== false ||
    decision.traditionalDigeEqualsSelectedNeutralCurve !== false
  ) {
    throw new FaceAuthorityValidationError('FR-51 scope adjudication boundary drift.');
  }

  const protocol = authority.researchProtocol;
  if (
    protocol.selectedScopeClass !== 'central_inferior_soft_tissue_chin_boundary' ||
    protocol.requiredInferiorMidlineAnchor !== 'soft_tissue_menton' ||
    protocol.provisionalLateralResearchScaffold !== 'fr50_bilateral_menton_side_plus_menton' ||
    protocol.provisionalScaffoldStatus !== 'scope_compatible_not_exact_fr35_curve' ||
    protocol.endpointSelectionRule !== null ||
    protocol.interpolationMethod !== null ||
    protocol.smoothingMethod !== null ||
    protocol.providerSubsetRule !== null ||
    protocol.minimumSubjectCount !== null ||
    protocol.maximumAllowedContourError !== null
  ) {
    throw new FaceAuthorityValidationError('FR-51 must not invent endpoint, interpolation, smoothing, provider-subset, sample-minimum, or contour-error policy.');
  }

  if (Object.values(authority.authorityBoundary).some((value) => value !== false)) {
    throw new FaceAuthorityValidationError('FR-51 authority boundary must remain fully fail-closed.');
  }
  return authority;
}

export function deriveScopeCompatibleCentralChinScaffoldFR51(
  annotation: IndependentCentralChinScaffoldAnnotationFR50V1,
): ScopeCompatibleCentralChinScaffoldFR51V1 {
  validateChinInferiorContourScopeAuthorityFR51();
  const candidate = deriveCentralChinInferiorSparseScaffoldFR50(annotation);
  return Object.freeze({
    algorithmRef: 'algorithm.research.chin_inferior.scope_compatible_sparse_scaffold.fr51@0.1.0' as const,
    scopeAuthorityRef: 'authority.face.chin_inferior_contour_scope_adjudication.fr51@0.1.0' as const,
    selectedScopeClass: 'central_inferior_soft_tissue_chin_boundary' as const,
    geometry: candidate.geometry,
    pointOrder: candidate.pointOrder,
    sourceScaffoldAlgorithmRef: candidate.algorithmRef,
    compatibilityState: 'compatible_with_selected_scope_class_not_exact_lateral_endpoints_or_dense_curve' as const,
    exactFR35CurveAuthorized: false as const,
    exactLateralEndpointsAuthorized: false as const,
    providerMappingAuthorized: false as const,
    traditionalDigeEquivalenceAuthorized: false as const,
    productionGeometryAuthorized: false as const,
  });
}

export function assessChinInferiorContourScopeReadinessFR51(): ChinInferiorContourScopeReadinessFR51V1 {
  validateChinInferiorContourScopeAuthorityFR51();
  return Object.freeze({
    traditionalConsumerScopeEvidenceReady: true as const,
    modernNeutralScopeCompatibilityEvidenceReady: true as const,
    fr35AnatomicalScopeClassReady: true as const,
    selectedCentralInferiorChinScopeReady: true as const,
    fr50SparseScaffoldScopeCompatibilityReady: true as const,
    exactLateralEndpointRuleReady: false as const,
    denseContinuousCurveReady: false as const,
    canonicalImage2DExtractionReady: false as const,
    providerMappingReady: false as const,
    traditionalDigeCurveEquivalenceReady: false as const,
    productionGeometryReady: false as const,
    nextRequiredEvidence: Object.freeze([
      'Define and source an exact provider-independent left/right endpoint rule for the selected central inferior soft-tissue chin boundary; FR-51 does not promote Menton-side as the final FR-35 endpoints.',
      'Acquire provider-blind reference traces or annotations for the selected central chin boundary before selecting interpolation, smoothing, sampling density, or an empirical contour-error tolerance.',
      'Only after the neutral reference curve is frozen may a MediaPipe FACE_OVAL subset be compared against it; no provider subset is selected in FR-51.',
      'Traditional 地閣 semantics remain a separate projection layer: scope selection from the consumer requirement does not make the neutral curve itself identical to 地閣.',
    ]),
  });
}

export function assertChinInferiorContourScopeReadyForProductionFR51(): never {
  validateChinInferiorContourScopeAuthorityFR51();
  throw new FaceAuthorityValidationError(
    'FR-51 selects the central inferior soft-tissue chin boundary as the FR-35 anatomical scope class only; exact endpoints, dense curve geometry, canonical 2D extraction, provider mapping, traditional equivalence, and production geometry remain blocked.',
  );
}
