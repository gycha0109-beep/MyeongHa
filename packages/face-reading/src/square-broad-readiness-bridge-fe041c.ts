export const FACE_SQUARE_BROAD_READINESS_BRIDGE_VERSION_FE041C =
  'MHA-FACE-SQUARE-BROAD-READINESS-BRIDGE-FE041C-v1' as const;

export const FACE_SQUARE_BROAD_READINESS_SOURCE_FE041C = Object.freeze({
  repository: 'gycha0109-beep/Saju' as const,
  validatedDistributionCommit:
    '66a98e15d27d2aa7dfb6d09df27bee57c137b1c5' as const,
  materializedCommit:
    '37f3728996992144eaa60b083334e466ae648b98' as const,
  distributionPath:
    'distribution/face-reading/fe041d/myeongha-face-reading-0.0.0.tgz' as const,
  artifactSha256:
    'f306515639aef5366308018ec3374f35ee1c20c35adb107ee140381ee6c8cd6d' as const,
  sourcePath:
    'packages/face-reading/src/square-broad-operationalization-readiness-fe041b.ts' as const,
  sourceBlobSha:
    '29ac70f28bb8da609ff6950ae9eb1c78aaa35ab6' as const,
  packageSubpath:
    '@myeongha/face-reading/square-broad-operationalization-readiness-fe041b' as const,
  upstreamContractVersion:
    'FE041B-SQUARE-BROAD-OPERATIONALIZATION-READINESS-v1' as const,
});

export interface FaceSquareBroadReadinessAdmissionFE041C {
  readonly schemaVersion:
    'myeongha-face-square-broad-readiness-admission-v1';
  readonly contractVersion:
    typeof FACE_SQUARE_BROAD_READINESS_BRIDGE_VERSION_FE041C;
  readonly status: 'admitted';
  readonly state:
    'reviewed_methodology_authority_admitted_operationalization_blocked';
  readonly artifactSha256:
    typeof FACE_SQUARE_BROAD_READINESS_SOURCE_FE041C.artifactSha256;
  readonly criterionRef: 'criterion.intake.square_broad';
  readonly sourceConcept: '方大';
  readonly sourcePassageRef:
    'passage.shenxiang.five_officers.intake.nlc_1925';
  readonly reviewedMethodologyRef:
    'method.shenxiang.five_officers.intake_criteria@0.3.0';
  readonly authoritySnapshot: Readonly<{
    repository: 'gycha0109-beep/Saju';
    commit: '50fd5b511326033861b3cab48028b989c4499b3c';
    fr140SourceBlob: 'c6ebcb9213db11dfdd2abda5dd723911355f3859';
    fr141SourceBlob: 'a2a621bb2088f9002480caf6a89bbc0a40e50538';
    methodologyApprovalBlob:
      'ad9ea864092dd5f70a691c842ba8ef4ca618f971';
  }>;
  readonly canonicalInputMetricRefs: readonly [];
  readonly blockers: readonly [
    'canonical_metric_to_traditional_construct_binding_not_authorized',
    'construct_validity_not_established',
    'empirical_semantic_evidence_not_admitted',
    'calibration_authority_not_issued',
    'numeric_threshold_not_authorized',
  ];
  readonly nextFrontier:
    'source_grounded_canonical_metric_mapping_evidence_before_calibration';
  readonly boundary: Readonly<{
    upstreamReadinessIssued: true;
    sourcePassageScanChecked: true;
    reviewedMethodologyAuthorityPresent: true;
    canonicalMetricBindingAuthorized: false;
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
}

export interface FaceSquareBroadReadinessBlockedFE041C {
  readonly schemaVersion:
    'myeongha-face-square-broad-readiness-admission-v1';
  readonly contractVersion:
    typeof FACE_SQUARE_BROAD_READINESS_BRIDGE_VERSION_FE041C;
  readonly status: 'blocked';
  readonly reason:
    | 'upstream_readiness_export_unavailable'
    | 'upstream_readiness_contract_invalid';
  readonly requiredSource: typeof FACE_SQUARE_BROAD_READINESS_SOURCE_FE041C;
  readonly boundary: Readonly<{
    sourceAuthorityImported: false;
    operationalizationAuthorityIssued: false;
    traditionalBindingAuthorityIssued: false;
    numericThresholdAuthorityIssued: false;
    classificationIssued: false;
    structuredClaimIssued: false;
    narrativeAuthorityIssued: false;
    productionInterpretationAuthorityIssued: false;
  }>;
}

export type FaceSquareBroadReadinessLoadResultFE041C =
  | FaceSquareBroadReadinessAdmissionFE041C
  | FaceSquareBroadReadinessBlockedFE041C;

const EXPECTED_BLOCKERS = [
  'canonical_metric_to_traditional_construct_binding_not_authorized',
  'construct_validity_not_established',
  'empirical_semantic_evidence_not_admitted',
  'calibration_authority_not_issued',
  'numeric_threshold_not_authorized',
] as const;

const ISSUED_READINESS_ADMISSIONS = new WeakSet<object>();

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

function invalidReadiness(): FaceSquareBroadReadinessBlockedFE041C {
  return Object.freeze({
    schemaVersion:
      'myeongha-face-square-broad-readiness-admission-v1' as const,
    contractVersion: FACE_SQUARE_BROAD_READINESS_BRIDGE_VERSION_FE041C,
    status: 'blocked' as const,
    reason: 'upstream_readiness_contract_invalid' as const,
    requiredSource: FACE_SQUARE_BROAD_READINESS_SOURCE_FE041C,
    boundary: Object.freeze({
      sourceAuthorityImported: false as const,
      operationalizationAuthorityIssued: false as const,
      traditionalBindingAuthorityIssued: false as const,
      numericThresholdAuthorityIssued: false as const,
      classificationIssued: false as const,
      structuredClaimIssued: false as const,
      narrativeAuthorityIssued: false as const,
      productionInterpretationAuthorityIssued: false as const,
    }),
  });
}

function unavailableReadiness(): FaceSquareBroadReadinessBlockedFE041C {
  return Object.freeze({
    ...invalidReadiness(),
    reason: 'upstream_readiness_export_unavailable' as const,
  });
}

function validAuthoritySnapshot(value: unknown): boolean {
  if (!isRecord(value) || !exactKeys(value, [
    'repository',
    'commit',
    'fr140SourceBlob',
    'fr141SourceBlob',
    'methodologyApprovalBlob',
  ])) return false;

  return value.repository === 'gycha0109-beep/Saju' &&
    value.commit === '50fd5b511326033861b3cab48028b989c4499b3c' &&
    value.fr140SourceBlob ===
      'c6ebcb9213db11dfdd2abda5dd723911355f3859' &&
    value.fr141SourceBlob ===
      'a2a621bb2088f9002480caf6a89bbc0a40e50538' &&
    value.methodologyApprovalBlob ===
      'ad9ea864092dd5f70a691c842ba8ef4ca618f971';
}

function validTarget(value: unknown): boolean {
  if (!isRecord(value) || !exactKeys(value, [
    'criterionRef',
    'sourceConcept',
    'sourcePassageRef',
    'sourcePassageVerificationStatus',
    'reviewedMethodologyRef',
    'methodologyReviewStatus',
  ])) return false;

  return value.criterionRef === 'criterion.intake.square_broad' &&
    value.sourceConcept === '方大' &&
    value.sourcePassageRef ===
      'passage.shenxiang.five_officers.intake.nlc_1925' &&
    value.sourcePassageVerificationStatus === 'scan_checked' &&
    value.reviewedMethodologyRef ===
      'method.shenxiang.five_officers.intake_criteria@0.3.0' &&
    value.methodologyReviewStatus === 'reviewed';
}

function validOperationalization(value: unknown): boolean {
  if (!isRecord(value) || !exactKeys(value, [
    'state',
    'canonicalInputMetricRefs',
    'classificationBands',
    'numericThresholds',
    'calibrationRef',
    'ruleRef',
  ])) return false;

  return value.state ===
      'reviewed_methodology_present_operationalization_not_authorized' &&
    Array.isArray(value.canonicalInputMetricRefs) &&
    value.canonicalInputMetricRefs.length === 0 &&
    value.classificationBands === null &&
    value.numericThresholds === null &&
    value.calibrationRef === null &&
    value.ruleRef === null;
}

function validAuthorityBoundary(value: unknown): boolean {
  const keys = [
    'sourcePassageScanChecked',
    'reviewedMethodologyAuthorityPresent',
    'canonicalMetricBindingAuthorized',
    'constructValidityEstablished',
    'empiricalSemanticEvidenceAdmitted',
    'calibrationAuthorityIssued',
    'numericThresholdAuthorityIssued',
    'classificationBandsIssued',
    'deterministicCriterionStateIssued',
    'ruleAuthorityIssued',
    'structuredClaimIssued',
    'narrativeAuthorityIssued',
    'productionSemanticExecutionAuthorized',
  ] as const;

  if (!isRecord(value) || !exactKeys(value, keys)) return false;
  return value.sourcePassageScanChecked === true &&
    value.reviewedMethodologyAuthorityPresent === true &&
    keys
      .filter((key) =>
        key !== 'sourcePassageScanChecked' &&
        key !== 'reviewedMethodologyAuthorityPresent')
      .every((key) => value[key] === false);
}

function validReadiness(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value) || !exactKeys(value, [
    'schemaVersion',
    'contractVersion',
    'authoritySnapshot',
    'target',
    'operationalization',
    'blockers',
    'authorityBoundary',
    'nextFrontier',
  ])) return false;

  return value.schemaVersion ===
      'fe041b-square-broad-operationalization-readiness-v1' &&
    value.contractVersion ===
      'FE041B-SQUARE-BROAD-OPERATIONALIZATION-READINESS-v1' &&
    validAuthoritySnapshot(value.authoritySnapshot) &&
    validTarget(value.target) &&
    validOperationalization(value.operationalization) &&
    Array.isArray(value.blockers) &&
    JSON.stringify(value.blockers) === JSON.stringify(EXPECTED_BLOCKERS) &&
    validAuthorityBoundary(value.authorityBoundary) &&
    value.nextFrontier ===
      'source_grounded_canonical_metric_mapping_evidence_before_calibration';
}

function projectAdmission(
  readiness: Record<string, unknown>,
): FaceSquareBroadReadinessAdmissionFE041C {
  const authoritySnapshot = readiness.authoritySnapshot as Record<string, string>;
  const target = readiness.target as Record<string, string>;

  const admission = Object.freeze({
    schemaVersion:
      'myeongha-face-square-broad-readiness-admission-v1' as const,
    contractVersion: FACE_SQUARE_BROAD_READINESS_BRIDGE_VERSION_FE041C,
    status: 'admitted' as const,
    state:
      'reviewed_methodology_authority_admitted_operationalization_blocked' as const,
    artifactSha256: FACE_SQUARE_BROAD_READINESS_SOURCE_FE041C.artifactSha256,
    criterionRef: 'criterion.intake.square_broad' as const,
    sourceConcept: '方大' as const,
    sourcePassageRef:
      'passage.shenxiang.five_officers.intake.nlc_1925' as const,
    reviewedMethodologyRef:
      'method.shenxiang.five_officers.intake_criteria@0.3.0' as const,
    authoritySnapshot: Object.freeze({
      repository: authoritySnapshot.repository as 'gycha0109-beep/Saju',
      commit: authoritySnapshot.commit as
        '50fd5b511326033861b3cab48028b989c4499b3c',
      fr140SourceBlob: authoritySnapshot.fr140SourceBlob as
        'c6ebcb9213db11dfdd2abda5dd723911355f3859',
      fr141SourceBlob: authoritySnapshot.fr141SourceBlob as
        'a2a621bb2088f9002480caf6a89bbc0a40e50538',
      methodologyApprovalBlob: authoritySnapshot.methodologyApprovalBlob as
        'ad9ea864092dd5f70a691c842ba8ef4ca618f971',
    }),
    canonicalInputMetricRefs: Object.freeze([]) as readonly [],
    blockers: Object.freeze([...EXPECTED_BLOCKERS]) as
      FaceSquareBroadReadinessAdmissionFE041C['blockers'],
    nextFrontier:
      'source_grounded_canonical_metric_mapping_evidence_before_calibration' as const,
    boundary: Object.freeze({
      upstreamReadinessIssued: true as const,
      sourcePassageScanChecked: true as const,
      reviewedMethodologyAuthorityPresent: true as const,
      canonicalMetricBindingAuthorized: false as const,
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
  });

  if (
    target.criterionRef !== admission.criterionRef ||
    target.sourceConcept !== admission.sourceConcept ||
    target.sourcePassageRef !== admission.sourcePassageRef ||
    target.reviewedMethodologyRef !== admission.reviewedMethodologyRef
  ) {
    throw new Error('FE041C_TARGET_PROJECTION_MISMATCH');
  }

  ISSUED_READINESS_ADMISSIONS.add(admission);
  return admission;
}

export function assessCurrentPinnedSquareBroadReadinessFE041C() {
  return Object.freeze({
    schemaVersion:
      'myeongha-face-square-broad-readiness-artifact-readiness-v1' as const,
    contractVersion: FACE_SQUARE_BROAD_READINESS_BRIDGE_VERSION_FE041C,
    status: 'ready' as const,
    reason: 'upstream_readiness_export_available' as const,
    source: FACE_SQUARE_BROAD_READINESS_SOURCE_FE041C,
    boundary: Object.freeze({
      runtimeValidationStillRequired: true as const,
      operationalizationAuthorityIssued: false as const,
      traditionalBindingAuthorityIssued: false as const,
      numericThresholdAuthorityIssued: false as const,
      classificationIssued: false as const,
      productionInterpretationAuthorityIssued: false as const,
    }),
  });
}

export async function loadSquareBroadReadinessFE041C():
  Promise<FaceSquareBroadReadinessLoadResultFE041C> {
  let module: unknown;
  try {
    module = await import(
      '@myeongha/face-reading/square-broad-operationalization-readiness-fe041b'
    );
  } catch {
    return unavailableReadiness();
  }

  if (!isRecord(module)) return invalidReadiness();
  const candidate = module as Record<string, unknown>;
  if (
    candidate.FE041B_SQUARE_BROAD_OPERATIONALIZATION_READINESS_VERSION !==
      FACE_SQUARE_BROAD_READINESS_SOURCE_FE041C.upstreamContractVersion ||
    candidate.FE041B_AUTHORITY_SNAPSHOT_COMMIT !==
      '50fd5b511326033861b3cab48028b989c4499b3c' ||
    typeof candidate.issueSquareBroadOperationalizationReadinessFE041B !==
      'function' ||
    typeof candidate.assertIssuedSquareBroadOperationalizationReadinessFE041B !==
      'function'
  ) {
    return invalidReadiness();
  }

  try {
    const readiness = (
      candidate.issueSquareBroadOperationalizationReadinessFE041B as
        () => unknown
    )();
    (
      candidate.assertIssuedSquareBroadOperationalizationReadinessFE041B as
        (value: unknown) => void
    )(readiness);
    if (!validReadiness(readiness)) return invalidReadiness();
    return projectAdmission(readiness);
  } catch {
    return invalidReadiness();
  }
}

export function isIssuedSquareBroadReadinessAdmissionFE041C(
  value: unknown,
): value is FaceSquareBroadReadinessAdmissionFE041C {
  return isRecord(value) &&
    ISSUED_READINESS_ADMISSIONS.has(value as object) &&
    value.schemaVersion ===
      'myeongha-face-square-broad-readiness-admission-v1' &&
    value.contractVersion === FACE_SQUARE_BROAD_READINESS_BRIDGE_VERSION_FE041C &&
    value.status === 'admitted';
}
