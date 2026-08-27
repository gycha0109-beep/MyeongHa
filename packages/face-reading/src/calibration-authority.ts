import type { FaceAuthorityRegistry, ReviewStatus } from './contracts.js';
import { FaceAuthorityValidationError } from './validation.js';

export type FaceCalibrationDecisionRule =
  | {
      readonly kind: 'max_inclusive';
      readonly threshold: number;
    }
  | {
      readonly kind: 'min_inclusive';
      readonly threshold: number;
    }
  | {
      readonly kind: 'between_inclusive';
      readonly min: number;
      readonly max: number;
    };

export type FaceCalibrationEvidenceClass =
  | 'synthetic_metric_fixture'
  | 'repeat_capture_stability'
  | 'blinded_expert_operationalization'
  | 'threshold_selection_result';

export type FaceCalibrationParticipantPolicy =
  | 'no_human_subjects'
  | 'consented_deidentified';

export interface FaceThresholdSelectionResult {
  readonly selectionMethodRef: string;
  readonly calibrationDatasetVersion: string;
  readonly decisionRule: FaceCalibrationDecisionRule;
  readonly inputEvidenceRefs: readonly string[];
  readonly evaluationProtocolRef: string;
}

export interface FaceCalibrationEvidenceDefinition {
  readonly evidenceId: string;
  readonly version: string;
  readonly evidenceClass: FaceCalibrationEvidenceClass;
  readonly metricRefs: readonly string[];
  readonly criterionRefs: readonly string[];
  readonly datasetVersion: string;
  readonly provenanceRefs: readonly string[];
  readonly participantPolicy: FaceCalibrationParticipantPolicy;
  readonly reviewProtocolRef?: string;
  readonly selectionResult?: FaceThresholdSelectionResult;
  readonly status: ReviewStatus;
}

export interface FaceCalibrationEvidenceRegistry {
  readonly registryId: string;
  readonly version: string;
  readonly evidence: readonly FaceCalibrationEvidenceDefinition[];
}

export interface FaceCalibrationDefinition {
  readonly calibrationId: string;
  readonly version: string;
  readonly metricRef: string;
  readonly criterionId: string;
  readonly methodologyRef: string;
  readonly traditionalSourceRefs: readonly string[];
  readonly calibrationEvidenceRefs: readonly string[];
  readonly calibrationDatasetVersion: string;
  readonly selectionMethodRef: string;
  readonly decisionRule: FaceCalibrationDecisionRule | null;
  readonly status: ReviewStatus;
}

export interface FaceCalibrationValidationContext {
  readonly faceAuthorityRegistry: FaceAuthorityRegistry;
  readonly calibrationEvidenceRegistry: FaceCalibrationEvidenceRegistry;
  readonly knownNeutralMetricRefs: ReadonlySet<string>;
  readonly knownCriterionIds: ReadonlySet<string>;
}

const STABLE_KEY = /^[a-z0-9][a-z0-9._:-]{0,191}$/u;
const NOSE_BRIDGE_RMS_METRIC_REF = 'neutral.nose.bridge.centerline_rms_deviation@0.1.0';
const NOSE_BRIDGE_STRAIGHT_CRITERION = 'criterion.discernment.bridge_straight';

function stableKey(value: string, path: string): void {
  if (!STABLE_KEY.test(value)) {
    throw new FaceAuthorityValidationError(`${path} must be a stable authority key.`);
  }
}

function nonEmpty(value: string, path: string): void {
  if (value.trim().length === 0) {
    throw new FaceAuthorityValidationError(`${path} must be non-empty.`);
  }
}

function assertUniqueRefs(refs: readonly string[], path: string): void {
  const seen = new Set<string>();
  for (const ref of refs) {
    nonEmpty(ref, path);
    if (seen.has(ref)) {
      throw new FaceAuthorityValidationError(`${path} contains duplicate ref: ${ref}`);
    }
    seen.add(ref);
  }
}

function evidenceRef(evidence: FaceCalibrationEvidenceDefinition): string {
  return `${evidence.evidenceId}@${evidence.version}`;
}

function methodologyRef(methodology: FaceAuthorityRegistry['methodologies'][number]): string {
  return `${methodology.methodologyId}@${methodology.version}`;
}

function validateDecisionRule(rule: FaceCalibrationDecisionRule, path: string): void {
  if (rule.kind === 'max_inclusive' || rule.kind === 'min_inclusive') {
    if (!Number.isFinite(rule.threshold)) {
      throw new FaceAuthorityValidationError(`${path}.threshold must be finite.`);
    }
    return;
  }
  if (!Number.isFinite(rule.min) || !Number.isFinite(rule.max) || rule.min > rule.max) {
    throw new FaceAuthorityValidationError(`${path} requires finite min <= max.`);
  }
}

function validateMetricCriterionDecisionRule(
  metricRef: string,
  criterionId: string,
  rule: FaceCalibrationDecisionRule,
  path: string,
): void {
  if (metricRef === NOSE_BRIDGE_RMS_METRIC_REF && criterionId === NOSE_BRIDGE_STRAIGHT_CRITERION) {
    if (rule.kind !== 'max_inclusive') {
      throw new FaceAuthorityValidationError(
        `${path} for ${metricRef} + ${criterionId} must use max_inclusive.`,
      );
    }
    if (rule.threshold < 0) {
      throw new FaceAuthorityValidationError(
        `${path}.threshold for non-negative RMS deviation must be >= 0.`,
      );
    }
  }
}

function decisionRulesEqual(left: FaceCalibrationDecisionRule, right: FaceCalibrationDecisionRule): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === 'between_inclusive' && right.kind === 'between_inclusive') {
    return left.min === right.min && left.max === right.max;
  }
  if (left.kind !== 'between_inclusive' && right.kind !== 'between_inclusive') {
    return left.threshold === right.threshold;
  }
  return false;
}

export function validateFaceCalibrationEvidenceRegistry(registry: FaceCalibrationEvidenceRegistry): void {
  stableKey(registry.registryId, 'calibrationEvidenceRegistry.registryId');
  nonEmpty(registry.version, `${registry.registryId}.version`);

  const refs = new Set<string>();
  for (const evidence of registry.evidence) {
    stableKey(evidence.evidenceId, 'calibrationEvidence.evidenceId');
    nonEmpty(evidence.version, `${evidence.evidenceId}.version`);
    const ref = evidenceRef(evidence);
    if (refs.has(ref)) {
      throw new FaceAuthorityValidationError(`Duplicate calibration evidence: ${ref}`);
    }
    refs.add(ref);

    if (evidence.metricRefs.length === 0 || evidence.criterionRefs.length === 0) {
      throw new FaceAuthorityValidationError(`${ref} requires metricRefs and criterionRefs.`);
    }
    assertUniqueRefs(evidence.metricRefs, `${ref}.metricRefs`);
    assertUniqueRefs(evidence.criterionRefs, `${ref}.criterionRefs`);
    nonEmpty(evidence.datasetVersion, `${ref}.datasetVersion`);
    if (evidence.provenanceRefs.length === 0) {
      throw new FaceAuthorityValidationError(`${ref} requires provenanceRefs.`);
    }
    assertUniqueRefs(evidence.provenanceRefs, `${ref}.provenanceRefs`);

    if (evidence.evidenceClass === 'synthetic_metric_fixture') {
      if (evidence.participantPolicy !== 'no_human_subjects') {
        throw new FaceAuthorityValidationError(`${ref} synthetic evidence must use no_human_subjects.`);
      }
    } else if (evidence.participantPolicy !== 'consented_deidentified') {
      throw new FaceAuthorityValidationError(`${ref} human-derived calibration evidence must be consented_deidentified.`);
    }

    if (
      evidence.evidenceClass === 'blinded_expert_operationalization' &&
      (evidence.reviewProtocolRef === undefined || evidence.reviewProtocolRef.trim().length === 0)
    ) {
      throw new FaceAuthorityValidationError(`${ref} blinded expert evidence requires reviewProtocolRef.`);
    }

    if (evidence.evidenceClass === 'threshold_selection_result') {
      const result = evidence.selectionResult;
      if (result === undefined) {
        throw new FaceAuthorityValidationError(`${ref} threshold selection evidence requires selectionResult.`);
      }
      nonEmpty(result.selectionMethodRef, `${ref}.selectionResult.selectionMethodRef`);
      nonEmpty(result.calibrationDatasetVersion, `${ref}.selectionResult.calibrationDatasetVersion`);
      nonEmpty(result.evaluationProtocolRef, `${ref}.selectionResult.evaluationProtocolRef`);
      if (result.inputEvidenceRefs.length === 0) {
        throw new FaceAuthorityValidationError(`${ref}.selectionResult requires inputEvidenceRefs.`);
      }
      assertUniqueRefs(result.inputEvidenceRefs, `${ref}.selectionResult.inputEvidenceRefs`);
      if (result.inputEvidenceRefs.includes(ref)) {
        throw new FaceAuthorityValidationError(`${ref}.selectionResult cannot self-reference.`);
      }
      validateDecisionRule(result.decisionRule, `${ref}.selectionResult.decisionRule`);
      for (const metricRef of evidence.metricRefs) {
        for (const criterionRef of evidence.criterionRefs) {
          validateMetricCriterionDecisionRule(
            metricRef,
            criterionRef,
            result.decisionRule,
            `${ref}.selectionResult.decisionRule`,
          );
        }
      }
    } else if (evidence.selectionResult !== undefined) {
      throw new FaceAuthorityValidationError(`${ref} non-selection evidence must not contain selectionResult.`);
    }
  }

  const evidenceByRef = new Map(registry.evidence.map((item) => [evidenceRef(item), item] as const));
  for (const evidence of registry.evidence) {
    if (evidence.evidenceClass !== 'threshold_selection_result') continue;
    const ref = evidenceRef(evidence);
    const result = evidence.selectionResult!;
    const inputEvidence = result.inputEvidenceRefs.map((inputRef) => {
      const item = evidenceByRef.get(inputRef);
      if (item === undefined) {
        throw new FaceAuthorityValidationError(`${ref}.selectionResult references unknown input evidence: ${inputRef}`);
      }
      for (const metricRef of evidence.metricRefs) {
        if (!item.metricRefs.includes(metricRef)) {
          throw new FaceAuthorityValidationError(`${inputRef} does not cover selection metric ${metricRef}.`);
        }
      }
      for (const criterionRef of evidence.criterionRefs) {
        if (!item.criterionRefs.includes(criterionRef)) {
          throw new FaceAuthorityValidationError(`${inputRef} does not cover selection criterion ${criterionRef}.`);
        }
      }
      return item;
    });

    const inputClasses = new Set(inputEvidence.map((item) => item.evidenceClass));
    for (const requiredClass of ['repeat_capture_stability', 'blinded_expert_operationalization'] as const) {
      if (!inputClasses.has(requiredClass)) {
        throw new FaceAuthorityValidationError(
          `${ref}.selectionResult requires ${requiredClass} input evidence.`,
        );
      }
    }
  }
}

function assertKnownRef(set: ReadonlySet<string>, value: string, path: string): void {
  if (!set.has(value)) {
    throw new FaceAuthorityValidationError(`${path} references unknown key: ${value}`);
  }
}

function sourceVerificationRank(status: FaceAuthorityRegistry['passages'][number]['verificationStatus']): number {
  switch (status) {
    case 'unverified_ocr': return 0;
    case 'scan_checked': return 1;
    case 'double_checked': return 2;
  }
}

function reviewStatusRank(status: ReviewStatus): number {
  switch (status) {
    case 'research': return 0;
    case 'reviewed': return 1;
    case 'production_authorized': return 2;
  }
}

export function validateFaceCalibrationDefinition(
  calibration: FaceCalibrationDefinition,
  context: FaceCalibrationValidationContext,
): void {
  validateFaceCalibrationEvidenceRegistry(context.calibrationEvidenceRegistry);
  stableKey(calibration.calibrationId, 'calibration.calibrationId');
  nonEmpty(calibration.version, `${calibration.calibrationId}.version`);
  assertKnownRef(context.knownNeutralMetricRefs, calibration.metricRef, `${calibration.calibrationId}.metricRef`);
  assertKnownRef(context.knownCriterionIds, calibration.criterionId, `${calibration.calibrationId}.criterionId`);

  const methodologies = new Map(
    context.faceAuthorityRegistry.methodologies.map((method) => [methodologyRef(method), method] as const),
  );
  const methodology = methodologies.get(calibration.methodologyRef);
  if (methodology === undefined) {
    throw new FaceAuthorityValidationError(
      `${calibration.calibrationId}.methodologyRef references unknown methodology: ${calibration.methodologyRef}`,
    );
  }

  const passages = new Map(
    context.faceAuthorityRegistry.passages.map((passage) => [passage.passageId, passage] as const),
  );
  if (calibration.traditionalSourceRefs.length === 0) {
    throw new FaceAuthorityValidationError(`${calibration.calibrationId} requires traditionalSourceRefs.`);
  }
  assertUniqueRefs(calibration.traditionalSourceRefs, `${calibration.calibrationId}.traditionalSourceRefs`);
  for (const sourceRef of calibration.traditionalSourceRefs) {
    const passage = passages.get(sourceRef);
    if (passage === undefined) {
      throw new FaceAuthorityValidationError(`${calibration.calibrationId} references unknown traditional source: ${sourceRef}`);
    }
    if (!methodology.sourceRefs.includes(sourceRef)) {
      throw new FaceAuthorityValidationError(
        `${calibration.calibrationId} source ${sourceRef} is not declared by methodology ${calibration.methodologyRef}.`,
      );
    }
  }

  const evidence = new Map(
    context.calibrationEvidenceRegistry.evidence.map((item) => [evidenceRef(item), item] as const),
  );
  if (calibration.calibrationEvidenceRefs.length === 0) {
    throw new FaceAuthorityValidationError(`${calibration.calibrationId} requires calibrationEvidenceRefs.`);
  }
  assertUniqueRefs(calibration.calibrationEvidenceRefs, `${calibration.calibrationId}.calibrationEvidenceRefs`);
  const selectedEvidence = calibration.calibrationEvidenceRefs.map((ref) => {
    const item = evidence.get(ref);
    if (item === undefined) {
      throw new FaceAuthorityValidationError(`${calibration.calibrationId} references unknown calibration evidence: ${ref}`);
    }
    if (!item.metricRefs.includes(calibration.metricRef) || !item.criterionRefs.includes(calibration.criterionId)) {
      throw new FaceAuthorityValidationError(`${ref} does not cover ${calibration.metricRef} + ${calibration.criterionId}.`);
    }
    return item;
  });

  nonEmpty(calibration.calibrationDatasetVersion, `${calibration.calibrationId}.calibrationDatasetVersion`);
  nonEmpty(calibration.selectionMethodRef, `${calibration.calibrationId}.selectionMethodRef`);
  if (calibration.decisionRule !== null) {
    validateDecisionRule(calibration.decisionRule, `${calibration.calibrationId}.decisionRule`);
    validateMetricCriterionDecisionRule(
      calibration.metricRef,
      calibration.criterionId,
      calibration.decisionRule,
      `${calibration.calibrationId}.decisionRule`,
    );
  }

  if (calibration.status !== 'production_authorized') return;

  if (methodology.reviewStatus !== 'production_authorized') {
    throw new FaceAuthorityValidationError(
      `${calibration.calibrationId} production calibration requires production-authorized methodology; got ${methodology.reviewStatus}.`,
    );
  }
  for (const sourceRef of calibration.traditionalSourceRefs) {
    const passage = passages.get(sourceRef)!;
    if (sourceVerificationRank(passage.verificationStatus) < sourceVerificationRank('scan_checked')) {
      throw new FaceAuthorityValidationError(
        `${calibration.calibrationId} production calibration requires scan_checked traditional source: ${sourceRef}`,
      );
    }
  }
  if (calibration.decisionRule === null) {
    throw new FaceAuthorityValidationError(`${calibration.calibrationId} production calibration requires decisionRule.`);
  }

  const evidenceClasses = new Set(selectedEvidence.map((item) => item.evidenceClass));
  for (const requiredClass of [
    'repeat_capture_stability',
    'blinded_expert_operationalization',
    'threshold_selection_result',
  ] as const) {
    if (!evidenceClasses.has(requiredClass)) {
      throw new FaceAuthorityValidationError(
        `${calibration.calibrationId} production calibration requires ${requiredClass} evidence.`,
      );
    }
  }
  for (const item of selectedEvidence) {
    if (reviewStatusRank(item.status) < reviewStatusRank('reviewed')) {
      throw new FaceAuthorityValidationError(
        `${calibration.calibrationId} production calibration cannot consume research-only evidence: ${evidenceRef(item)}.`,
      );
    }
  }

  const selectionEvidence = selectedEvidence.filter((item) => item.evidenceClass === 'threshold_selection_result');
  if (selectionEvidence.length !== 1) {
    throw new FaceAuthorityValidationError(
      `${calibration.calibrationId} production calibration requires exactly one threshold_selection_result evidence.`,
    );
  }
  const selection = selectionEvidence[0]!;
  const result = selection.selectionResult!;
  if (result.selectionMethodRef !== calibration.selectionMethodRef) {
    throw new FaceAuthorityValidationError(
      `${calibration.calibrationId} selectionMethodRef does not match threshold selection evidence ${evidenceRef(selection)}.`,
    );
  }
  if (result.calibrationDatasetVersion !== calibration.calibrationDatasetVersion) {
    throw new FaceAuthorityValidationError(
      `${calibration.calibrationId} calibrationDatasetVersion does not match threshold selection evidence ${evidenceRef(selection)}.`,
    );
  }
  if (!decisionRulesEqual(result.decisionRule, calibration.decisionRule)) {
    throw new FaceAuthorityValidationError(
      `${calibration.calibrationId} decisionRule does not match threshold selection evidence ${evidenceRef(selection)}.`,
    );
  }
  for (const inputRef of result.inputEvidenceRefs) {
    if (!calibration.calibrationEvidenceRefs.includes(inputRef)) {
      throw new FaceAuthorityValidationError(
        `${calibration.calibrationId} must include threshold selection input evidence ${inputRef}.`,
      );
    }
  }
}

export const FACE_CALIBRATION_EVIDENCE_RESEARCH_V0: FaceCalibrationEvidenceRegistry = {
  registryId: 'calibration-evidence.face.research_v0',
  version: '0.1.0',
  evidence: [
    {
      evidenceId: 'evidence.nose_bridge.synthetic_discriminating',
      version: '0.1.0',
      evidenceClass: 'synthetic_metric_fixture',
      metricRefs: [NOSE_BRIDGE_RMS_METRIC_REF],
      criterionRefs: [NOSE_BRIDGE_STRAIGHT_CRITERION],
      datasetVersion: 'synthetic-bridge-discriminating-v0.1.0',
      provenanceRefs: ['test/face-reading-fr4-discriminating.test.ts'],
      participantPolicy: 'no_human_subjects',
      status: 'reviewed',
    },
  ],
};
