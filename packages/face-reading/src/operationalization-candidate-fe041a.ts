import {
  admitFaceCriterionCandidateFE039,
  type FaceCriterionCandidateFE039,
} from './criterion-candidate-fe039.js';
import {
  isIssuedCanonicalFaceMetricRegistryAdmissionFE040A,
  type FaceCanonicalMetricRegistryAdmissionFE040A,
} from './metric-registry-bridge-fe040a.js';

export const FACE_OPERATIONALIZATION_CANDIDATE_VERSION_FE041A =
  'MHA-FACE-OPERATIONALIZATION-CANDIDATE-FE041A-v1' as const;

export interface FaceOperationalizationCandidateInputFE041A {
  readonly schemaVersion:
    'myeongha-face-operationalization-candidate-input-v1';
  readonly operationalizationRef: string;
  readonly criterionCandidate: FaceCriterionCandidateFE039;
  readonly metricRegistryAdmission: FaceCanonicalMetricRegistryAdmissionFE040A;
  readonly inputMetricRefs: readonly string[];
  readonly reviewStatus: 'research';
}

export interface FaceOperationalizationCandidateFE041A {
  readonly schemaVersion: 'myeongha-face-operationalization-candidate-v1';
  readonly contractVersion:
    typeof FACE_OPERATIONALIZATION_CANDIDATE_VERSION_FE041A;
  readonly state: 'research_mapping_candidate';
  readonly operationalizationRef: string;
  readonly criterionCandidateRef: string;
  readonly sourceAuthorityRef: string;
  readonly sourceAuthorityBundleSha256: string;
  readonly methodologyStatementRefs: readonly string[];
  readonly traditionalTerm: string;
  readonly metricRegistryRef: string;
  readonly inputMetricRefs: readonly string[];
  readonly reviewStatus: 'research';
  readonly classificationBands: null;
  readonly numericThresholds: null;
  readonly calibrationRef: null;
  readonly ruleRef: null;
  readonly productionCriterionAdmitted: false;
  readonly boundary: Readonly<{
    researchMetricMappingRecorded: true;
    operationalizationAuthorityIssued: false;
    traditionalBindingAuthorityIssued: false;
    numericThresholdAuthorityIssued: false;
    comparisonBandAuthorityIssued: false;
    calibrationAuthorityIssued: false;
    classificationIssued: false;
    ruleAuthorityIssued: false;
    criterionAuthorityIssued: false;
    structuredClaimIssued: false;
    scoreIssued: false;
    rankingIssued: false;
    narrativeAuthorityIssued: false;
    llmSemanticAuthorityIssued: false;
    productionInterpretationAuthorityIssued: false;
  }>;
}

const INPUT_KEYS = [
  'schemaVersion',
  'operationalizationRef',
  'criterionCandidate',
  'metricRegistryAdmission',
  'inputMetricRefs',
  'reviewStatus',
] as const;

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

function isRef(value: unknown): value is string {
  return typeof value === 'string' &&
    /^[A-Za-z0-9._:-]{1,160}$/.test(value);
}

function isUniqueRefArray(value: unknown): value is string[] {
  return Array.isArray(value) &&
    value.length > 0 &&
    value.every(isRef) &&
    new Set(value).size === value.length;
}

export function createFaceOperationalizationCandidateFE041A(
  value: unknown,
): FaceOperationalizationCandidateFE041A | null {
  if (
    !isRecord(value) ||
    !exactKeys(value, INPUT_KEYS) ||
    value.schemaVersion !==
      'myeongha-face-operationalization-candidate-input-v1' ||
    !isRef(value.operationalizationRef) ||
    !isUniqueRefArray(value.inputMetricRefs) ||
    value.reviewStatus !== 'research'
  ) {
    return null;
  }

  const criterionCandidate = admitFaceCriterionCandidateFE039(
    value.criterionCandidate,
  );
  if (!criterionCandidate) return null;

  if (
    !isIssuedCanonicalFaceMetricRegistryAdmissionFE040A(
      value.metricRegistryAdmission,
    )
  ) {
    return null;
  }
  const metricRegistryAdmission = value.metricRegistryAdmission;

  const admittedMetricRefs = new Set(
    metricRegistryAdmission.metrics.map((metric) => metric.metricRef),
  );
  if (
    value.inputMetricRefs.some((metricRef) => !admittedMetricRefs.has(metricRef))
  ) {
    return null;
  }

  return Object.freeze({
    schemaVersion:
      'myeongha-face-operationalization-candidate-v1' as const,
    contractVersion: FACE_OPERATIONALIZATION_CANDIDATE_VERSION_FE041A,
    state: 'research_mapping_candidate' as const,
    operationalizationRef: value.operationalizationRef,
    criterionCandidateRef: criterionCandidate.candidateRef,
    sourceAuthorityRef: criterionCandidate.sourceAuthorityRef,
    sourceAuthorityBundleSha256:
      criterionCandidate.sourceAuthorityBundleSha256,
    methodologyStatementRefs: Object.freeze([
      ...criterionCandidate.methodologyStatementRefs,
    ]),
    traditionalTerm: criterionCandidate.traditionalTerm,
    metricRegistryRef: metricRegistryAdmission.registryRef,
    inputMetricRefs: Object.freeze(
      [...value.inputMetricRefs].sort((a, b) => a.localeCompare(b)),
    ),
    reviewStatus: 'research' as const,
    classificationBands: null,
    numericThresholds: null,
    calibrationRef: null,
    ruleRef: null,
    productionCriterionAdmitted: false as const,
    boundary: Object.freeze({
      researchMetricMappingRecorded: true as const,
      operationalizationAuthorityIssued: false as const,
      traditionalBindingAuthorityIssued: false as const,
      numericThresholdAuthorityIssued: false as const,
      comparisonBandAuthorityIssued: false as const,
      calibrationAuthorityIssued: false as const,
      classificationIssued: false as const,
      ruleAuthorityIssued: false as const,
      criterionAuthorityIssued: false as const,
      structuredClaimIssued: false as const,
      scoreIssued: false as const,
      rankingIssued: false as const,
      narrativeAuthorityIssued: false as const,
      llmSemanticAuthorityIssued: false as const,
      productionInterpretationAuthorityIssued: false as const,
    }),
  });
}
