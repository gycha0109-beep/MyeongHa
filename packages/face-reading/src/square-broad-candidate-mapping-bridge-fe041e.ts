import {
  isIssuedCanonicalFaceMetricRegistryAdmissionFE040A,
  loadCanonicalFaceMetricRegistryFE040A,
} from './metric-registry-bridge-fe040a.js';
import {
  isIssuedSquareBroadReadinessAdmissionFE041C,
  loadSquareBroadReadinessFE041C,
} from './square-broad-readiness-bridge-fe041c.js';

export const FACE_SQUARE_BROAD_CANDIDATE_MAPPING_BRIDGE_VERSION_FE041E =
  'MHA-FACE-SQUARE-BROAD-CANDIDATE-MAPPING-BRIDGE-FE041E-v1' as const;

export const FACE_SQUARE_BROAD_CANDIDATE_MAPPING_SOURCE_FE041E = Object.freeze({
  repository: 'gycha0109-beep/Saju' as const,
  validatedBranchCommit:
    '66a98e15d27d2aa7dfb6d09df27bee57c137b1c5' as const,
  materializedCommit:
    '37f3728996992144eaa60b083334e466ae648b98' as const,
  distributionPath:
    'distribution/face-reading/fe041d/myeongha-face-reading-0.0.0.tgz' as const,
  artifactSha256:
    'f306515639aef5366308018ec3374f35ee1c20c35adb107ee140381ee6c8cd6d' as const,
  sourcePath:
    'packages/face-reading/src/square-broad-candidate-metric-mapping-readiness-fe041d.ts' as const,
  sourceBlobSha:
    'ef59a55fa0371f0ca2f52ae84f10532bf9c40a3a' as const,
  packageSubpath:
    '@myeongha/face-reading/square-broad-candidate-metric-mapping-readiness-fe041d' as const,
  upstreamContractVersion:
    'FE041D-SQUARE-BROAD-CANDIDATE-METRIC-MAPPING-READINESS-v1' as const,
});

const EXPECTED_CANDIDATE_REFS = Object.freeze([
  'neutral.mouth.contour_set.horizontal_reflection_nearest_set_residual_ratio@0.1.0',
  'neutral.mouth.contour_set.orthogonal_edge_orientation_concentration@0.1.0',
  'neutral.mouth.contour_set.turning_angle_concentration_index@0.1.0',
] as const);

const EXPECTED_BLOCKERS = Object.freeze([
  'candidate_metrics_not_canonical_product_metrics',
  'canonical_metric_to_traditional_construct_binding_not_authorized',
  'construct_validity_not_established',
  'empirical_semantic_evidence_not_admitted',
  'calibration_authority_not_issued',
  'numeric_threshold_not_authorized',
] as const);

export interface FaceSquareBroadCandidateMappingAdmissionFE041E {
  readonly schemaVersion:
    'myeongha-face-square-broad-candidate-mapping-admission-v1';
  readonly contractVersion:
    typeof FACE_SQUARE_BROAD_CANDIDATE_MAPPING_BRIDGE_VERSION_FE041E;
  readonly status: 'admitted';
  readonly state:
    'source_grounded_candidate_metrics_admitted_canonical_mapping_blocked';
  readonly criterionRef: 'criterion.intake.square_broad';
  readonly sourceConcept: '方大';
  readonly candidateMetricRefs: typeof EXPECTED_CANDIDATE_REFS;
  readonly canonicalRegistryMetricCount: 13;
  readonly canonicalRegistryIntersection: readonly [];
  readonly canonicalInputMetricRefs: readonly [];
  readonly blockers: typeof EXPECTED_BLOCKERS;
  readonly operationalizationCandidateCreationAuthorized: false;
  readonly boundary: Readonly<{
    upstreamCandidateMappingReadinessIssued: true;
    canonicalRegistryAdmissionIssued: true;
    reviewedMethodologyReadinessIssued: true;
    sourceGroundedCandidateMetricsExist: true;
    candidateCanonicalizationAuthorized: false;
    canonicalMetricBindingAuthorized: false;
    traditionalFangBindingAuthorized: false;
    constructValidityEstablished: false;
    empiricalSemanticEvidenceAdmitted: false;
    calibrationAuthorityIssued: false;
    numericThresholdAuthorityIssued: false;
    classificationBandsIssued: false;
    deterministicCriterionStateIssued: false;
    ruleAuthorityIssued: false;
    structuredClaimIssued: false;
    narrativeAuthorityIssued: false;
    productionSemanticExecutionAuthorized: false;
  }>;
  readonly nextFrontier:
    'governed_candidate_metric_canonicalization_and_independent_semantic_mapping_evidence_before_calibration';
}

export interface FaceSquareBroadCandidateMappingBlockedFE041E {
  readonly schemaVersion:
    'myeongha-face-square-broad-candidate-mapping-admission-v1';
  readonly contractVersion:
    typeof FACE_SQUARE_BROAD_CANDIDATE_MAPPING_BRIDGE_VERSION_FE041E;
  readonly status: 'blocked';
  readonly reason:
    | 'upstream_candidate_mapping_export_unavailable'
    | 'upstream_candidate_mapping_contract_invalid'
    | 'local_prerequisite_admission_failed'
    | 'canonical_intersection_mismatch';
  readonly requiredSource:
    typeof FACE_SQUARE_BROAD_CANDIDATE_MAPPING_SOURCE_FE041E;
  readonly boundary: Readonly<{
    operationalizationCandidateCreationAuthorized: false;
    traditionalBindingAuthorityIssued: false;
    calibrationAuthorityIssued: false;
    productionInterpretationAuthorityIssued: false;
  }>;
}

export type FaceSquareBroadCandidateMappingLoadResultFE041E =
  | FaceSquareBroadCandidateMappingAdmissionFE041E
  | FaceSquareBroadCandidateMappingBlockedFE041E;

const ISSUED = new WeakSet<object>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  const keys = Object.keys(value);
  return keys.length === allowed.length &&
    keys.every((key) => allowed.includes(key));
}

function blocked(
  reason: FaceSquareBroadCandidateMappingBlockedFE041E['reason'],
): FaceSquareBroadCandidateMappingBlockedFE041E {
  return Object.freeze({
    schemaVersion:
      'myeongha-face-square-broad-candidate-mapping-admission-v1' as const,
    contractVersion:
      FACE_SQUARE_BROAD_CANDIDATE_MAPPING_BRIDGE_VERSION_FE041E,
    status: 'blocked' as const,
    reason,
    requiredSource: FACE_SQUARE_BROAD_CANDIDATE_MAPPING_SOURCE_FE041E,
    boundary: Object.freeze({
      operationalizationCandidateCreationAuthorized: false as const,
      traditionalBindingAuthorityIssued: false as const,
      calibrationAuthorityIssued: false as const,
      productionInterpretationAuthorityIssued: false as const,
    }),
  });
}

function validUpstream(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value) || !exactKeys(value, [
    'schemaVersion',
    'contractVersion',
    'authorityState',
    'researchSnapshot',
    'target',
    'candidateMetricRefs',
    'canonicalRegistryMetricCount',
    'canonicalRegistryIntersection',
    'candidateEvidence',
    'mappingDecision',
    'authorityBoundary',
    'nextFrontier',
  ])) return false;

  if (
    value.schemaVersion !==
      'fe041d-square-broad-candidate-metric-mapping-readiness-v1' ||
    value.contractVersion !==
      FACE_SQUARE_BROAD_CANDIDATE_MAPPING_SOURCE_FE041E.upstreamContractVersion ||
    value.authorityState !==
      'source_grounded_neutral_candidate_metrics_exist_but_none_are_canonical_product_metrics_or_traditional_bindings' ||
    !isRecord(value.researchSnapshot) ||
    !isRecord(value.target) ||
    !isRecord(value.candidateEvidence) ||
    !isRecord(value.mappingDecision) ||
    !isRecord(value.authorityBoundary)
  ) return false;

  return value.researchSnapshot.repository === 'gycha0109-beep/Saju' &&
    value.researchSnapshot.commit ===
      '8b49d4e03e35ef5447f0f2873ff2b8737bd36110' &&
    value.researchSnapshot.fe035bSourceBlob ===
      'c9ed7dfb347144759694056e89d571c433d4dfc8' &&
    value.researchSnapshot.fr141SourceBlob ===
      'a2a621bb2088f9002480caf6a89bbc0a40e50538' &&
    value.researchSnapshot.fr142SourceBlob ===
      '004a2cdb21bc6f247e48cae52429afaf54f6804d' &&
    value.researchSnapshot.fr143SourceBlob ===
      '293e29e65239894a5ec21befbd7152c339250759' &&
    value.target.criterionRef === 'criterion.intake.square_broad' &&
    value.target.sourceConcept === '方大' &&
    value.target.activeConstructScope === 'fang_shape_candidate_features_only' &&
    value.target.sourceLineageConflictPreserved === true &&
    Array.isArray(value.candidateMetricRefs) &&
    JSON.stringify(value.candidateMetricRefs) ===
      JSON.stringify(EXPECTED_CANDIDATE_REFS) &&
    value.canonicalRegistryMetricCount === 13 &&
    Array.isArray(value.canonicalRegistryIntersection) &&
    value.canonicalRegistryIntersection.length === 0 &&
    value.candidateEvidence.sourceGroundedCandidateFamilyImplemented === true &&
    value.candidateEvidence.syntheticNumericBehaviorVerified === true &&
    value.candidateEvidence.empiricalCaptureRepeatabilityEstablished === false &&
    value.candidateEvidence.humanSemanticLabelsIssued === 0 &&
    value.candidateEvidence.constructValidityEstablished === false &&
    value.mappingDecision.canonicalMetricBindingAuthorized === false &&
    value.mappingDecision.traditionalFangBindingAuthorized === false &&
    value.mappingDecision.candidateCanonicalizationAuthorized === false &&
    Object.values(value.authorityBoundary).every((entry) => entry === false) &&
    value.nextFrontier ===
      'governed_candidate_metric_canonicalization_and_independent_semantic_mapping_evidence_before_calibration';
}

export function assessCurrentPinnedSquareBroadCandidateMappingFE041E() {
  return Object.freeze({
    schemaVersion:
      'myeongha-face-square-broad-candidate-mapping-artifact-readiness-v1' as const,
    contractVersion:
      FACE_SQUARE_BROAD_CANDIDATE_MAPPING_BRIDGE_VERSION_FE041E,
    status: 'ready' as const,
    source: FACE_SQUARE_BROAD_CANDIDATE_MAPPING_SOURCE_FE041E,
    boundary: Object.freeze({
      runtimeValidationStillRequired: true as const,
      candidateCanonicalizationAuthorized: false as const,
      traditionalBindingAuthorityIssued: false as const,
      calibrationAuthorityIssued: false as const,
      productionInterpretationAuthorityIssued: false as const,
    }),
  });
}

export async function loadSquareBroadCandidateMappingFE041E():
Promise<FaceSquareBroadCandidateMappingLoadResultFE041E> {
  let module: unknown;
  try {
    module = await import(
      '@myeongha/face-reading/square-broad-candidate-metric-mapping-readiness-fe041d'
    );
  } catch {
    return blocked('upstream_candidate_mapping_export_unavailable');
  }
  if (!isRecord(module)) {
    return blocked('upstream_candidate_mapping_contract_invalid');
  }

  const candidate = module as Record<string, unknown>;
  if (
    candidate.FE041D_SQUARE_BROAD_CANDIDATE_METRIC_MAPPING_READINESS_VERSION !==
      FACE_SQUARE_BROAD_CANDIDATE_MAPPING_SOURCE_FE041E.upstreamContractVersion ||
    typeof candidate.issueSquareBroadCandidateMetricMappingReadinessFE041D !==
      'function' ||
    typeof candidate.assertIssuedSquareBroadCandidateMetricMappingReadinessFE041D !==
      'function'
  ) {
    return blocked('upstream_candidate_mapping_contract_invalid');
  }

  let upstream: unknown;
  try {
    upstream = (
      candidate.issueSquareBroadCandidateMetricMappingReadinessFE041D as
        () => unknown
    )();
    (
      candidate.assertIssuedSquareBroadCandidateMetricMappingReadinessFE041D as
        (value: unknown) => void
    )(upstream);
  } catch {
    return blocked('upstream_candidate_mapping_contract_invalid');
  }
  if (!validUpstream(upstream)) {
    return blocked('upstream_candidate_mapping_contract_invalid');
  }

  const [registry, readiness] = await Promise.all([
    loadCanonicalFaceMetricRegistryFE040A(),
    loadSquareBroadReadinessFE041C(),
  ]);
  if (
    !isIssuedCanonicalFaceMetricRegistryAdmissionFE040A(registry) ||
    !isIssuedSquareBroadReadinessAdmissionFE041C(readiness)
  ) {
    return blocked('local_prerequisite_admission_failed');
  }

  const canonicalRefs = new Set(
    registry.metrics.map((metric) => metric.metricRef),
  );
  const exactIntersection = EXPECTED_CANDIDATE_REFS.filter(
    (metricRef) => canonicalRefs.has(metricRef),
  );
  if (
    exactIntersection.length !== 0 ||
    readiness.canonicalInputMetricRefs.length !== 0
  ) {
    return blocked('canonical_intersection_mismatch');
  }

  const result: FaceSquareBroadCandidateMappingAdmissionFE041E =
    Object.freeze({
      schemaVersion:
        'myeongha-face-square-broad-candidate-mapping-admission-v1' as const,
      contractVersion:
        FACE_SQUARE_BROAD_CANDIDATE_MAPPING_BRIDGE_VERSION_FE041E,
      status: 'admitted' as const,
      state:
        'source_grounded_candidate_metrics_admitted_canonical_mapping_blocked' as const,
      criterionRef: 'criterion.intake.square_broad' as const,
      sourceConcept: '方大' as const,
      candidateMetricRefs: EXPECTED_CANDIDATE_REFS,
      canonicalRegistryMetricCount: 13 as const,
      canonicalRegistryIntersection: Object.freeze([]) as readonly [],
      canonicalInputMetricRefs: Object.freeze([]) as readonly [],
      blockers: EXPECTED_BLOCKERS,
      operationalizationCandidateCreationAuthorized: false as const,
      boundary: Object.freeze({
        upstreamCandidateMappingReadinessIssued: true as const,
        canonicalRegistryAdmissionIssued: true as const,
        reviewedMethodologyReadinessIssued: true as const,
        sourceGroundedCandidateMetricsExist: true as const,
        candidateCanonicalizationAuthorized: false as const,
        canonicalMetricBindingAuthorized: false as const,
        traditionalFangBindingAuthorized: false as const,
        constructValidityEstablished: false as const,
        empiricalSemanticEvidenceAdmitted: false as const,
        calibrationAuthorityIssued: false as const,
        numericThresholdAuthorityIssued: false as const,
        classificationBandsIssued: false as const,
        deterministicCriterionStateIssued: false as const,
        ruleAuthorityIssued: false as const,
        structuredClaimIssued: false as const,
        narrativeAuthorityIssued: false as const,
        productionSemanticExecutionAuthorized: false as const,
      }),
      nextFrontier:
        'governed_candidate_metric_canonicalization_and_independent_semantic_mapping_evidence_before_calibration' as const,
    });
  ISSUED.add(result);
  return result;
}

export function isIssuedSquareBroadCandidateMappingAdmissionFE041E(
  value: unknown,
): value is FaceSquareBroadCandidateMappingAdmissionFE041E {
  return isRecord(value) && ISSUED.has(value);
}
