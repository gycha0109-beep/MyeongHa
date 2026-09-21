import {
  FACE_SOURCE_AUTHORITY_VERSION_FE039,
  type FaceSourceAuthorityAdmissionSuccessFE039,
} from './source-authority-fe039.js';

export const FACE_CRITERION_CANDIDATE_VERSION_FE039 =
  'MHA-FACE-CRITERION-CANDIDATE-FE039-v1' as const;

export interface FaceCriterionCandidateInputFE039 {
  readonly schemaVersion: 'myeongha-face-criterion-candidate-input-v1';
  readonly candidateRef: string;
  readonly sourceAuthorityAdmission: FaceSourceAuthorityAdmissionSuccessFE039;
  readonly methodologyStatementRefs: readonly string[];
  readonly traditionalTerm: string;
}

export interface FaceCriterionCandidateFE039 {
  readonly schemaVersion: 'myeongha-face-criterion-candidate-v1';
  readonly contractVersion: typeof FACE_CRITERION_CANDIDATE_VERSION_FE039;
  readonly candidateRef: string;
  readonly sourceAuthorityRef: string;
  readonly sourceAuthorityBundleSha256: string;
  readonly methodologyStatementRefs: readonly string[];
  readonly traditionalTerm: string;
  readonly admissionState: 'source_supported_not_operationalized';
  readonly operationalizationRef: null;
  readonly ruleRef: null;
  readonly productionCriterionAdmitted: false;
  readonly boundary: Readonly<{
    numericThresholdDefined: false;
    comparisonBandDefined: false;
    classificationIssued: false;
    scoreIssued: false;
    rankingIssued: false;
    structuredClaimIssued: false;
    traditionalInterpretationIssued: false;
    narrativeAuthorityIssued: false;
    llmSemanticAuthorityIssued: false;
    productionAuthorityIssued: false;
  }>;
}

const INPUT_KEYS = [
  'schemaVersion',
  'candidateRef',
  'sourceAuthorityAdmission',
  'methodologyStatementRefs',
  'traditionalTerm',
] as const;

const ADMISSION_KEYS = [
  'schemaVersion',
  'contractVersion',
  'status',
  'state',
  'authorityRef',
  'bundleRef',
  'authorityBundleSha256',
  'workRef',
  'witnessRef',
  'passageRefs',
  'methodologyStatementRefs',
  'boundary',
] as const;

const ADMISSION_BOUNDARY_KEYS = [
  'sourceAuthorityAdmitted',
  'operationalizationAuthorityIssued',
  'ruleAuthorityIssued',
  'criterionAuthorityIssued',
  'structuredClaimIssued',
  'narrativeAuthorityIssued',
  'classificationIssued',
  'scoreIssued',
  'rankingIssued',
  'productionAuthorityIssued',
] as const;

const CANDIDATE_KEYS = [
  'schemaVersion',
  'contractVersion',
  'candidateRef',
  'sourceAuthorityRef',
  'sourceAuthorityBundleSha256',
  'methodologyStatementRefs',
  'traditionalTerm',
  'admissionState',
  'operationalizationRef',
  'ruleRef',
  'productionCriterionAdmitted',
  'boundary',
] as const;

const CANDIDATE_BOUNDARY_KEYS = [
  'numericThresholdDefined',
  'comparisonBandDefined',
  'classificationIssued',
  'scoreIssued',
  'rankingIssued',
  'structuredClaimIssued',
  'traditionalInterpretationIssued',
  'narrativeAuthorityIssued',
  'llmSemanticAuthorityIssued',
  'productionAuthorityIssued',
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

function isText(value: unknown): value is string {
  return typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= 4000;
}

function isRefArray(value: unknown): value is string[] {
  return Array.isArray(value) &&
    value.length > 0 &&
    value.every(isRef) &&
    new Set(value).size === value.length;
}

function validAdmissionBoundary(value: unknown): boolean {
  if (!isRecord(value) || !exactKeys(value, ADMISSION_BOUNDARY_KEYS)) {
    return false;
  }
  return value.sourceAuthorityAdmitted === true &&
    ADMISSION_BOUNDARY_KEYS
      .filter((key) => key !== 'sourceAuthorityAdmitted')
      .every((key) => value[key] === false);
}

function validProductionCandidateAdmission(
  value: unknown,
): value is FaceSourceAuthorityAdmissionSuccessFE039 {
  if (!isRecord(value) || !exactKeys(value, ADMISSION_KEYS)) return false;
  return value.schemaVersion === 'myeongha-face-source-authority-admission-v1' &&
    value.contractVersion === FACE_SOURCE_AUTHORITY_VERSION_FE039 &&
    value.status === 'admitted' &&
    value.state === 'production_candidate' &&
    typeof value.authorityRef === 'string' &&
    value.authorityRef.startsWith('face-source-authority:') &&
    isRef(value.bundleRef) &&
    typeof value.authorityBundleSha256 === 'string' &&
    /^[0-9a-f]{64}$/.test(value.authorityBundleSha256) &&
    isRef(value.workRef) &&
    isRef(value.witnessRef) &&
    isRefArray(value.passageRefs) &&
    isRefArray(value.methodologyStatementRefs) &&
    validAdmissionBoundary(value.boundary);
}

function validCandidateBoundary(value: unknown): boolean {
  if (!isRecord(value) || !exactKeys(value, CANDIDATE_BOUNDARY_KEYS)) {
    return false;
  }
  return CANDIDATE_BOUNDARY_KEYS.every((key) => value[key] === false);
}

function canonicalCandidate(
  candidateRef: string,
  sourceAuthorityRef: string,
  sourceAuthorityBundleSha256: string,
  methodologyStatementRefs: readonly string[],
  traditionalTerm: string,
): FaceCriterionCandidateFE039 {
  return Object.freeze({
    schemaVersion: 'myeongha-face-criterion-candidate-v1' as const,
    contractVersion: FACE_CRITERION_CANDIDATE_VERSION_FE039,
    candidateRef,
    sourceAuthorityRef,
    sourceAuthorityBundleSha256,
    methodologyStatementRefs: Object.freeze(
      [...methodologyStatementRefs].sort((a, b) => a.localeCompare(b)),
    ),
    traditionalTerm,
    admissionState: 'source_supported_not_operationalized' as const,
    operationalizationRef: null,
    ruleRef: null,
    productionCriterionAdmitted: false as const,
    boundary: Object.freeze({
      numericThresholdDefined: false as const,
      comparisonBandDefined: false as const,
      classificationIssued: false as const,
      scoreIssued: false as const,
      rankingIssued: false as const,
      structuredClaimIssued: false as const,
      traditionalInterpretationIssued: false as const,
      narrativeAuthorityIssued: false as const,
      llmSemanticAuthorityIssued: false as const,
      productionAuthorityIssued: false as const,
    }),
  });
}

export function createFaceCriterionCandidateFE039(
  value: unknown,
): FaceCriterionCandidateFE039 | null {
  if (
    !isRecord(value) ||
    !exactKeys(value, INPUT_KEYS) ||
    value.schemaVersion !== 'myeongha-face-criterion-candidate-input-v1' ||
    !isRef(value.candidateRef) ||
    !validProductionCandidateAdmission(value.sourceAuthorityAdmission) ||
    !isRefArray(value.methodologyStatementRefs) ||
    !isText(value.traditionalTerm)
  ) {
    return null;
  }

  const admittedRefs = new Set(
    value.sourceAuthorityAdmission.methodologyStatementRefs,
  );
  if (
    value.methodologyStatementRefs.some((ref) => !admittedRefs.has(ref))
  ) {
    return null;
  }

  return canonicalCandidate(
    value.candidateRef,
    value.sourceAuthorityAdmission.authorityRef,
    value.sourceAuthorityAdmission.authorityBundleSha256,
    value.methodologyStatementRefs,
    value.traditionalTerm,
  );
}

export function admitFaceCriterionCandidateFE039(
  value: unknown,
): FaceCriterionCandidateFE039 | null {
  if (
    !isRecord(value) ||
    !exactKeys(value, CANDIDATE_KEYS) ||
    value.schemaVersion !== 'myeongha-face-criterion-candidate-v1' ||
    value.contractVersion !== FACE_CRITERION_CANDIDATE_VERSION_FE039 ||
    !isRef(value.candidateRef) ||
    typeof value.sourceAuthorityRef !== 'string' ||
    !value.sourceAuthorityRef.startsWith('face-source-authority:') ||
    typeof value.sourceAuthorityBundleSha256 !== 'string' ||
    !/^[0-9a-f]{64}$/.test(value.sourceAuthorityBundleSha256) ||
    !isRefArray(value.methodologyStatementRefs) ||
    !isText(value.traditionalTerm) ||
    value.admissionState !== 'source_supported_not_operationalized' ||
    value.operationalizationRef !== null ||
    value.ruleRef !== null ||
    value.productionCriterionAdmitted !== false ||
    !validCandidateBoundary(value.boundary)
  ) {
    return null;
  }

  return canonicalCandidate(
    value.candidateRef,
    value.sourceAuthorityRef,
    value.sourceAuthorityBundleSha256,
    value.methodologyStatementRefs,
    value.traditionalTerm,
  );
}
