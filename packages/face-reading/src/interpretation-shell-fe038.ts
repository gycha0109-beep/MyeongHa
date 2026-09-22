export const FACE_INTERPRETATION_SHELL_VERSION_FE038 =
  'MHA-FACE-INTERPRETATION-SHELL-FE038-v1' as const;

export interface FaceNeutralObservationRefFE038 {
  readonly schemaVersion: 'myeongha-face-neutral-observation-ref-v1';
  readonly observationRef: string;
  readonly sourceContractVersion: string;
  readonly sourceProjectionSchemaVersion: string;
  readonly metricCount: number;
  readonly regionCount: number;
}

export interface FaceStructuredClaimFE038<TValue = unknown> {
  readonly claimRef: string;
  readonly claimType: string;
  readonly semanticKey: string;
  readonly value: TValue;
  readonly tier: string;
  readonly methodologyRef: string;
  readonly ruleRef: string;
  readonly sourceRefs: readonly string[];
  readonly upstreamObservationRefs: readonly string[];
}

export interface FaceInterpretationShellFE038 {
  readonly schemaVersion: 'myeongha-face-interpretation-shell-v1';
  readonly contractVersion: typeof FACE_INTERPRETATION_SHELL_VERSION_FE038;
  readonly observation: FaceNeutralObservationRefFE038;
  readonly criterion: Readonly<{
    state: 'not_admitted';
    reason: 'semantic_authority_not_installed';
    methodologyPackRef: null;
    operationalizationRef: null;
    ruleRef: null;
    sourceAuthorityRef: null;
  }>;
  readonly claims: readonly [];
  readonly narrative: Readonly<{
    allowed: false;
    reason: 'no_admitted_structured_claims';
    narrativeProfileRef: null;
    renderedArtifactRef: null;
  }>;
  readonly boundary: Readonly<{
    neutralObservationOnly: true;
    criterionAuthorityIssued: false;
    structuredClaimIssued: false;
    narrativeAuthorityIssued: false;
    classificationIssued: false;
    scoreIssued: false;
    rankingIssued: false;
    traditionalInterpretationIssued: false;
    llmSemanticAuthorityIssued: false;
    productionAuthorityIssued: false;
  }>;
}

const OBSERVATION_KEYS = [
  'schemaVersion',
  'observationRef',
  'sourceContractVersion',
  'sourceProjectionSchemaVersion',
  'metricCount',
  'regionCount',
] as const;

const CRITERION_KEYS = [
  'state',
  'reason',
  'methodologyPackRef',
  'operationalizationRef',
  'ruleRef',
  'sourceAuthorityRef',
] as const;

const NARRATIVE_KEYS = [
  'allowed',
  'reason',
  'narrativeProfileRef',
  'renderedArtifactRef',
] as const;

const BOUNDARY_KEYS = [
  'neutralObservationOnly',
  'criterionAuthorityIssued',
  'structuredClaimIssued',
  'narrativeAuthorityIssued',
  'classificationIssued',
  'scoreIssued',
  'rankingIssued',
  'traditionalInterpretationIssued',
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

function isOpaqueRef(value: unknown): value is string {
  return typeof value === 'string' &&
    /^[A-Za-z0-9._:-]{1,160}$/.test(value);
}

function isVersionToken(value: unknown): value is string {
  return typeof value === 'string' &&
    /^[A-Za-z0-9._:/+-]{1,200}$/.test(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0;
}

function validObservationRef(
  value: unknown,
): value is FaceNeutralObservationRefFE038 {
  if (!isRecord(value) || !exactKeys(value, OBSERVATION_KEYS)) return false;
  return value.schemaVersion === 'myeongha-face-neutral-observation-ref-v1' &&
    isOpaqueRef(value.observationRef) &&
    isVersionToken(value.sourceContractVersion) &&
    isVersionToken(value.sourceProjectionSchemaVersion) &&
    isNonNegativeInteger(value.metricCount) &&
    isNonNegativeInteger(value.regionCount);
}

function validCriterion(value: unknown): boolean {
  if (!isRecord(value) || !exactKeys(value, CRITERION_KEYS)) return false;
  return value.state === 'not_admitted' &&
    value.reason === 'semantic_authority_not_installed' &&
    value.methodologyPackRef === null &&
    value.operationalizationRef === null &&
    value.ruleRef === null &&
    value.sourceAuthorityRef === null;
}

function validNarrative(value: unknown): boolean {
  if (!isRecord(value) || !exactKeys(value, NARRATIVE_KEYS)) return false;
  return value.allowed === false &&
    value.reason === 'no_admitted_structured_claims' &&
    value.narrativeProfileRef === null &&
    value.renderedArtifactRef === null;
}

function validBoundary(value: unknown): boolean {
  if (!isRecord(value) || !exactKeys(value, BOUNDARY_KEYS)) return false;
  return value.neutralObservationOnly === true &&
    BOUNDARY_KEYS
      .filter((key) => key !== 'neutralObservationOnly')
      .every((key) => value[key] === false);
}

function freezeObservation(
  value: FaceNeutralObservationRefFE038,
): FaceNeutralObservationRefFE038 {
  return Object.freeze({
    schemaVersion: 'myeongha-face-neutral-observation-ref-v1' as const,
    observationRef: value.observationRef,
    sourceContractVersion: value.sourceContractVersion,
    sourceProjectionSchemaVersion: value.sourceProjectionSchemaVersion,
    metricCount: value.metricCount,
    regionCount: value.regionCount,
  });
}

export function createFaceInterpretationShellFE038(
  observation: FaceNeutralObservationRefFE038,
): FaceInterpretationShellFE038 {
  if (!validObservationRef(observation)) {
    throw new Error('FE038_INVALID_NEUTRAL_OBSERVATION_REF');
  }

  const criterion = Object.freeze({
    state: 'not_admitted' as const,
    reason: 'semantic_authority_not_installed' as const,
    methodologyPackRef: null,
    operationalizationRef: null,
    ruleRef: null,
    sourceAuthorityRef: null,
  });
  const claims = Object.freeze([]) as readonly [];
  const narrative = Object.freeze({
    allowed: false as const,
    reason: 'no_admitted_structured_claims' as const,
    narrativeProfileRef: null,
    renderedArtifactRef: null,
  });
  const boundary = Object.freeze({
    neutralObservationOnly: true as const,
    criterionAuthorityIssued: false as const,
    structuredClaimIssued: false as const,
    narrativeAuthorityIssued: false as const,
    classificationIssued: false as const,
    scoreIssued: false as const,
    rankingIssued: false as const,
    traditionalInterpretationIssued: false as const,
    llmSemanticAuthorityIssued: false as const,
    productionAuthorityIssued: false as const,
  });

  return Object.freeze({
    schemaVersion: 'myeongha-face-interpretation-shell-v1' as const,
    contractVersion: FACE_INTERPRETATION_SHELL_VERSION_FE038,
    observation: freezeObservation(observation),
    criterion,
    claims,
    narrative,
    boundary,
  });
}

export function admitFaceInterpretationShellFE038(
  value: unknown,
): FaceInterpretationShellFE038 | null {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      'schemaVersion',
      'contractVersion',
      'observation',
      'criterion',
      'claims',
      'narrative',
      'boundary',
    ]) ||
    value.schemaVersion !== 'myeongha-face-interpretation-shell-v1' ||
    value.contractVersion !== FACE_INTERPRETATION_SHELL_VERSION_FE038 ||
    !validObservationRef(value.observation) ||
    !validCriterion(value.criterion) ||
    !Array.isArray(value.claims) ||
    value.claims.length !== 0 ||
    !validNarrative(value.narrative) ||
    !validBoundary(value.boundary)
  ) {
    return null;
  }

  return createFaceInterpretationShellFE038(value.observation);
}
