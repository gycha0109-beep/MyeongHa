import type { FaceAuthorityRegistry, ReviewStatus } from './contracts.js';
import { FACE_FR3_METHOD_REFS_V0 } from './five-officers-six-fus-research-v0.js';
import { FaceAuthorityValidationError } from './validation.js';

export type FaceCalibrationPartition = 'selection' | 'holdout';
export type FaceMorphologyLabel = 'met' | 'not_met' | 'abstain';
export type FaceCalibrationProtocolStatus = 'research' | 'reviewed' | 'production_authorized';

interface FaceCalibrationSupportArtifactBase {
  readonly artifactId: string;
  readonly version: string;
  readonly status: FaceCalibrationProtocolStatus;
}

export interface FaceCaptureQualityPolicyArtifact extends FaceCalibrationSupportArtifactBase {
  readonly kind: 'capture_quality_policy';
  readonly requiredChecks: readonly string[];
  readonly acceptancePolicyRef: string;
}

export interface FaceReviewArtifactRetentionPolicy extends FaceCalibrationSupportArtifactBase {
  readonly kind: 'review_artifact_retention_policy';
  readonly containsPotentiallyIdentifyingFace: true;
  readonly deleteTrigger: 'labeling_and_audit_complete';
  readonly maxRetentionDays: number | null;
  readonly accessScope: 'assigned_reviewers_and_auditors';
  readonly trainingReuseAllowed: false;
  readonly identityMatchingAllowed: false;
}

export interface FaceLabelingInstructionArtifact extends FaceCalibrationSupportArtifactBase {
  readonly kind: 'labeling_instruction';
  readonly methodologyRef: string;
  readonly criterionId: string;
  readonly traditionalSourceRefs: readonly string[];
  readonly reviewerMustNotSee: readonly ('metric_values' | 'candidate_threshold' | 'peer_labels' | 'fortune_output')[];
}

export type FaceCalibrationSupportArtifact =
  | FaceCaptureQualityPolicyArtifact
  | FaceReviewArtifactRetentionPolicy
  | FaceLabelingInstructionArtifact;

export interface FaceCaptureProtocolDefinition {
  readonly protocolId: string;
  readonly version: string;
  readonly metricRefs: readonly string[];
  readonly captureMode: 'single_frontal' | 'multi_view';
  readonly requiredViewKeys: readonly string[];
  readonly repeatPlan: {
    readonly sessionsPerParticipant: number;
    readonly acceptedCapturesPerSession: number;
    readonly independentRecaptureRequired: boolean;
  };
  readonly qualityPolicyRef: string;
  readonly sourceImagePolicy: {
    readonly exifStrippedBeforeProcessing: true;
    readonly originalDeletedAfterReviewArtifactCreation: true;
    readonly trainingReuseAllowed: false;
    readonly identityEmbeddingAllowed: false;
  };
  readonly reviewArtifactPolicy: {
    readonly containsPotentiallyIdentifyingFace: true;
    readonly participantPolicy: 'consented_pseudonymous';
    readonly retentionPolicyRef: string;
    readonly identityMatchingAllowed: false;
    readonly trainingReuseAllowed: false;
  };
  readonly status: FaceCalibrationProtocolStatus;
}

export interface FaceLabelingProtocolDefinition {
  readonly protocolId: string;
  readonly version: string;
  readonly methodologyRef: string;
  readonly criterionId: string;
  readonly traditionalSourceRefs: readonly string[];
  readonly labelSet: readonly FaceMorphologyLabel[];
  readonly reviewerPlan: {
    readonly reviewersPerItem: number;
    readonly blindToMetricValues: true;
    readonly blindToPeerLabels: true;
    readonly independentInitialLabels: true;
    readonly allowAbstain: true;
    readonly agreementRule: {
      readonly kind: 'supermajority_non_abstain';
      readonly minAgreementFraction: number;
      readonly minNonAbstainLabels: number;
    };
  };
  readonly instructionArtifactRef: string;
  readonly participantPolicy: 'consented_pseudonymous';
  readonly status: FaceCalibrationProtocolStatus;
}

export interface FaceDatasetSplitPolicyDefinition {
  readonly policyId: string;
  readonly version: string;
  readonly splitUnit: 'participant';
  readonly partitions: readonly FaceCalibrationPartition[];
  readonly participantLeakageAllowed: false;
  readonly captureFamilyLeakageAllowed: false;
  readonly thresholdSelectionMayReadHoldout: false;
  readonly finalEvaluationMayReadSelectionLabels: false;
  readonly status: FaceCalibrationProtocolStatus;
}

export interface FaceCalibrationStudyProtocolDefinition {
  readonly studyId: string;
  readonly version: string;
  readonly metricRef: string;
  readonly criterionId: string;
  readonly methodologyRef: string;
  readonly traditionalSourceRefs: readonly string[];
  readonly captureProtocolRef: string;
  readonly labelingProtocolRef: string;
  readonly splitPolicyRef: string;
  readonly requiredEvidenceClasses: readonly (
    | 'repeat_capture_stability'
    | 'blinded_expert_operationalization'
    | 'threshold_selection_result'
  )[];
  readonly executionState: 'blocked' | 'protocol_ready' | 'authorized_to_collect';
  readonly blockingReasons: readonly string[];
  readonly status: FaceCalibrationProtocolStatus;
}

export interface FaceCalibrationProtocolRegistry {
  readonly registryId: string;
  readonly version: string;
  readonly supportArtifacts: readonly FaceCalibrationSupportArtifact[];
  readonly captureProtocols: readonly FaceCaptureProtocolDefinition[];
  readonly labelingProtocols: readonly FaceLabelingProtocolDefinition[];
  readonly splitPolicies: readonly FaceDatasetSplitPolicyDefinition[];
  readonly studies: readonly FaceCalibrationStudyProtocolDefinition[];
}

export interface FaceCalibrationManifestRecord {
  readonly observationRef: string;
  readonly reviewItemRef?: string;
  readonly participantKey: string;
  readonly captureFamilyKey: string;
  readonly captureSessionKey: string;
  readonly captureOrdinal: number;
  readonly partition: FaceCalibrationPartition;
  readonly metricRef: string;
  readonly protocolRef: string;
  readonly accepted: boolean;
  readonly rejectionReason?: string;
}

export interface FaceCalibrationDatasetManifest {
  readonly manifestId: string;
  readonly version: string;
  readonly studyRef: string;
  readonly records: readonly FaceCalibrationManifestRecord[];
}

export interface FaceCalibrationLabelRecord {
  readonly itemRef: string;
  readonly reviewerKey: string;
  readonly label: FaceMorphologyLabel;
  readonly labelingProtocolRef: string;
}

export interface FaceCalibrationLabelDataset {
  readonly datasetId: string;
  readonly version: string;
  readonly studyRef: string;
  readonly records: readonly FaceCalibrationLabelRecord[];
}

export interface FaceCalibrationLabelConsensus {
  readonly itemRef: string;
  readonly state: 'met' | 'not_met' | 'no_consensus';
  readonly metCount: number;
  readonly notMetCount: number;
  readonly abstainCount: number;
  readonly nonAbstainCount: number;
  readonly agreementFraction: number | null;
}

export interface FaceCalibrationProtocolValidationContext {
  readonly faceAuthorityRegistry: FaceAuthorityRegistry;
  readonly knownNeutralMetricRefs: ReadonlySet<string>;
}

const STABLE_KEY = /^[a-z0-9][a-z0-9._:-]{0,191}$/u;
const REQUIRED_EVIDENCE_CLASSES = [
  'repeat_capture_stability',
  'blinded_expert_operationalization',
  'threshold_selection_result',
] as const;
const REQUIRED_REVIEWER_BLIND_FIELDS = [
  'metric_values',
  'candidate_threshold',
  'peer_labels',
  'fortune_output',
] as const;

function stableKey(value: string, path: string): void {
  if (!STABLE_KEY.test(value)) throw new FaceAuthorityValidationError(`${path} must be a stable authority key.`);
}

function nonEmpty(value: string, path: string): void {
  if (value.trim().length === 0) throw new FaceAuthorityValidationError(`${path} must be non-empty.`);
}

function assertUniqueStrings(values: readonly string[], path: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    nonEmpty(value, path);
    if (seen.has(value)) throw new FaceAuthorityValidationError(`${path} contains duplicate value: ${value}`);
    seen.add(value);
  }
}

function artifactRef(artifact: FaceCalibrationSupportArtifact): string {
  return `${artifact.artifactId}@${artifact.version}`;
}
function captureProtocolRef(protocol: FaceCaptureProtocolDefinition): string {
  return `${protocol.protocolId}@${protocol.version}`;
}
function labelingProtocolRef(protocol: FaceLabelingProtocolDefinition): string {
  return `${protocol.protocolId}@${protocol.version}`;
}
function splitPolicyRef(policy: FaceDatasetSplitPolicyDefinition): string {
  return `${policy.policyId}@${policy.version}`;
}
function studyRef(study: FaceCalibrationStudyProtocolDefinition): string {
  return `${study.studyId}@${study.version}`;
}
function methodologyRef(methodology: FaceAuthorityRegistry['methodologies'][number]): string {
  return `${methodology.methodologyId}@${methodology.version}`;
}

function verificationRank(status: FaceAuthorityRegistry['passages'][number]['verificationStatus']): number {
  switch (status) {
    case 'unverified_ocr': return 0;
    case 'scan_checked': return 1;
    case 'double_checked': return 2;
  }
}
function reviewRank(status: ReviewStatus): number {
  switch (status) {
    case 'research': return 0;
    case 'reviewed': return 1;
    case 'production_authorized': return 2;
  }
}

export function validateFaceCalibrationProtocolRegistry(
  registry: FaceCalibrationProtocolRegistry,
  context: FaceCalibrationProtocolValidationContext,
): void {
  stableKey(registry.registryId, 'calibrationProtocolRegistry.registryId');
  nonEmpty(registry.version, `${registry.registryId}.version`);

  const methods = new Map(context.faceAuthorityRegistry.methodologies.map((method) => [methodologyRef(method), method] as const));
  const passages = new Map(context.faceAuthorityRegistry.passages.map((passage) => [passage.passageId, passage] as const));

  const supportByRef = new Map<string, FaceCalibrationSupportArtifact>();
  for (const artifact of registry.supportArtifacts) {
    stableKey(artifact.artifactId, 'supportArtifact.artifactId');
    nonEmpty(artifact.version, `${artifact.artifactId}.version`);
    const ref = artifactRef(artifact);
    if (supportByRef.has(ref)) throw new FaceAuthorityValidationError(`Duplicate support artifact: ${ref}`);
    supportByRef.set(ref, artifact);

    if (artifact.kind === 'capture_quality_policy') {
      if (artifact.requiredChecks.length === 0) throw new FaceAuthorityValidationError(`${ref} requires quality checks.`);
      assertUniqueStrings(artifact.requiredChecks, `${ref}.requiredChecks`);
      nonEmpty(artifact.acceptancePolicyRef, `${ref}.acceptancePolicyRef`);
    } else if (artifact.kind === 'review_artifact_retention_policy') {
      if (artifact.status !== 'research' && (artifact.maxRetentionDays === null || !Number.isInteger(artifact.maxRetentionDays) || artifact.maxRetentionDays < 1)) {
        throw new FaceAuthorityValidationError(`${ref} reviewed retention policy requires positive maxRetentionDays.`);
      }
    } else {
      const method = methods.get(artifact.methodologyRef);
      if (method === undefined) throw new FaceAuthorityValidationError(`${ref} references unknown methodology: ${artifact.methodologyRef}`);
      if (artifact.traditionalSourceRefs.length === 0) throw new FaceAuthorityValidationError(`${ref} requires traditionalSourceRefs.`);
      assertUniqueStrings(artifact.traditionalSourceRefs, `${ref}.traditionalSourceRefs`);
      for (const sourceRef of artifact.traditionalSourceRefs) {
        if (!method.sourceRefs.includes(sourceRef) || !passages.has(sourceRef)) {
          throw new FaceAuthorityValidationError(`${ref} has invalid traditional source: ${sourceRef}`);
        }
      }
      if (!REQUIRED_REVIEWER_BLIND_FIELDS.every((field) => artifact.reviewerMustNotSee.includes(field))) {
        throw new FaceAuthorityValidationError(`${ref} must blind reviewers from metric, threshold, peer labels, and fortune output.`);
      }
    }
  }

  const captureByRef = new Map<string, FaceCaptureProtocolDefinition>();
  for (const protocol of registry.captureProtocols) {
    stableKey(protocol.protocolId, 'captureProtocol.protocolId');
    nonEmpty(protocol.version, `${protocol.protocolId}.version`);
    const ref = captureProtocolRef(protocol);
    if (captureByRef.has(ref)) throw new FaceAuthorityValidationError(`Duplicate capture protocol: ${ref}`);
    captureByRef.set(ref, protocol);
    if (protocol.metricRefs.length === 0) throw new FaceAuthorityValidationError(`${ref} requires metricRefs.`);
    assertUniqueStrings(protocol.metricRefs, `${ref}.metricRefs`);
    for (const metricRef of protocol.metricRefs) {
      if (!context.knownNeutralMetricRefs.has(metricRef)) throw new FaceAuthorityValidationError(`${ref} references unknown neutral metric: ${metricRef}`);
    }
    if (protocol.requiredViewKeys.length === 0) throw new FaceAuthorityValidationError(`${ref} requires view keys.`);
    assertUniqueStrings(protocol.requiredViewKeys, `${ref}.requiredViewKeys`);
    if (protocol.captureMode === 'single_frontal' && (protocol.requiredViewKeys.length !== 1 || protocol.requiredViewKeys[0] !== 'frontal')) {
      throw new FaceAuthorityValidationError(`${ref} single_frontal capture must require only frontal view.`);
    }
    if (!Number.isInteger(protocol.repeatPlan.sessionsPerParticipant) || protocol.repeatPlan.sessionsPerParticipant < 2) {
      throw new FaceAuthorityValidationError(`${ref} repeat capture requires at least 2 independent sessions.`);
    }
    if (!Number.isInteger(protocol.repeatPlan.acceptedCapturesPerSession) || protocol.repeatPlan.acceptedCapturesPerSession < 1) {
      throw new FaceAuthorityValidationError(`${ref} acceptedCapturesPerSession must be a positive integer.`);
    }
    if (!protocol.repeatPlan.independentRecaptureRequired) throw new FaceAuthorityValidationError(`${ref} must require independent recapture.`);

    const qualityArtifact = supportByRef.get(protocol.qualityPolicyRef);
    if (qualityArtifact?.kind !== 'capture_quality_policy') {
      throw new FaceAuthorityValidationError(`${ref} qualityPolicyRef must resolve to capture_quality_policy.`);
    }
    const retentionArtifact = supportByRef.get(protocol.reviewArtifactPolicy.retentionPolicyRef);
    if (retentionArtifact?.kind !== 'review_artifact_retention_policy') {
      throw new FaceAuthorityValidationError(`${ref} retentionPolicyRef must resolve to review_artifact_retention_policy.`);
    }
  }

  const labelingByRef = new Map<string, FaceLabelingProtocolDefinition>();
  for (const protocol of registry.labelingProtocols) {
    stableKey(protocol.protocolId, 'labelingProtocol.protocolId');
    nonEmpty(protocol.version, `${protocol.protocolId}.version`);
    const ref = labelingProtocolRef(protocol);
    if (labelingByRef.has(ref)) throw new FaceAuthorityValidationError(`Duplicate labeling protocol: ${ref}`);
    labelingByRef.set(ref, protocol);

    const method = methods.get(protocol.methodologyRef);
    if (method === undefined) throw new FaceAuthorityValidationError(`${ref} references unknown methodology: ${protocol.methodologyRef}`);
    if (protocol.traditionalSourceRefs.length === 0) throw new FaceAuthorityValidationError(`${ref} requires traditionalSourceRefs.`);
    assertUniqueStrings(protocol.traditionalSourceRefs, `${ref}.traditionalSourceRefs`);
    for (const sourceRef of protocol.traditionalSourceRefs) {
      const passage = passages.get(sourceRef);
      if (passage === undefined) throw new FaceAuthorityValidationError(`${ref} references unknown source: ${sourceRef}`);
      if (!method.sourceRefs.includes(sourceRef)) throw new FaceAuthorityValidationError(`${ref} source ${sourceRef} is not declared by methodology ${protocol.methodologyRef}.`);
    }

    if (protocol.labelSet.length !== 3 || !['met', 'not_met', 'abstain'].every((label) => protocol.labelSet.includes(label as FaceMorphologyLabel))) {
      throw new FaceAuthorityValidationError(`${ref} labelSet must be exactly met/not_met/abstain.`);
    }
    if (!Number.isInteger(protocol.reviewerPlan.reviewersPerItem) || protocol.reviewerPlan.reviewersPerItem < 3) {
      throw new FaceAuthorityValidationError(`${ref} requires at least 3 independent reviewers per item.`);
    }
    const agreement = protocol.reviewerPlan.agreementRule;
    if (!(agreement.minAgreementFraction > 0.5 && agreement.minAgreementFraction <= 1)) {
      throw new FaceAuthorityValidationError(`${ref} agreement fraction must be > 0.5 and <= 1.`);
    }
    if (!Number.isInteger(agreement.minNonAbstainLabels) || agreement.minNonAbstainLabels < 2 || agreement.minNonAbstainLabels > protocol.reviewerPlan.reviewersPerItem) {
      throw new FaceAuthorityValidationError(`${ref} minNonAbstainLabels must be between 2 and reviewersPerItem.`);
    }

    const instructionArtifact = supportByRef.get(protocol.instructionArtifactRef);
    if (instructionArtifact?.kind !== 'labeling_instruction') {
      throw new FaceAuthorityValidationError(`${ref} instructionArtifactRef must resolve to labeling_instruction.`);
    }
    if (instructionArtifact.methodologyRef !== protocol.methodologyRef || instructionArtifact.criterionId !== protocol.criterionId) {
      throw new FaceAuthorityValidationError(`${ref} instruction artifact does not match methodology/criterion.`);
    }
    if (protocol.traditionalSourceRefs.some((sourceRef) => !instructionArtifact.traditionalSourceRefs.includes(sourceRef))) {
      throw new FaceAuthorityValidationError(`${ref} instruction artifact does not cover protocol source refs.`);
    }
  }

  const splitByRef = new Map<string, FaceDatasetSplitPolicyDefinition>();
  for (const policy of registry.splitPolicies) {
    stableKey(policy.policyId, 'splitPolicy.policyId');
    nonEmpty(policy.version, `${policy.policyId}.version`);
    const ref = splitPolicyRef(policy);
    if (splitByRef.has(ref)) throw new FaceAuthorityValidationError(`Duplicate split policy: ${ref}`);
    splitByRef.set(ref, policy);
    if (policy.partitions.length !== 2 || !policy.partitions.includes('selection') || !policy.partitions.includes('holdout')) {
      throw new FaceAuthorityValidationError(`${ref} must define selection and holdout partitions.`);
    }
  }

  const studyRefs = new Set<string>();
  for (const study of registry.studies) {
    stableKey(study.studyId, 'calibrationStudy.studyId');
    nonEmpty(study.version, `${study.studyId}.version`);
    const ref = studyRef(study);
    if (studyRefs.has(ref)) throw new FaceAuthorityValidationError(`Duplicate calibration study: ${ref}`);
    studyRefs.add(ref);
    if (!context.knownNeutralMetricRefs.has(study.metricRef)) throw new FaceAuthorityValidationError(`${ref} references unknown neutral metric: ${study.metricRef}`);
    const method = methods.get(study.methodologyRef);
    if (method === undefined) throw new FaceAuthorityValidationError(`${ref} references unknown methodology: ${study.methodologyRef}`);
    const capture = captureByRef.get(study.captureProtocolRef);
    if (capture === undefined) throw new FaceAuthorityValidationError(`${ref} references unknown capture protocol: ${study.captureProtocolRef}`);
    const labeling = labelingByRef.get(study.labelingProtocolRef);
    if (labeling === undefined) throw new FaceAuthorityValidationError(`${ref} references unknown labeling protocol: ${study.labelingProtocolRef}`);
    const split = splitByRef.get(study.splitPolicyRef);
    if (split === undefined) throw new FaceAuthorityValidationError(`${ref} references unknown split policy: ${study.splitPolicyRef}`);
    if (!capture.metricRefs.includes(study.metricRef)) throw new FaceAuthorityValidationError(`${ref} capture protocol does not cover ${study.metricRef}.`);
    if (labeling.methodologyRef !== study.methodologyRef || labeling.criterionId !== study.criterionId) {
      throw new FaceAuthorityValidationError(`${ref} labeling protocol does not match study methodology/criterion.`);
    }
    assertUniqueStrings(study.traditionalSourceRefs, `${ref}.traditionalSourceRefs`);
    if (study.traditionalSourceRefs.length === 0 || study.traditionalSourceRefs.some((sourceRef) => !labeling.traditionalSourceRefs.includes(sourceRef))) {
      throw new FaceAuthorityValidationError(`${ref} traditional sources must be covered by the labeling protocol.`);
    }
    if (study.requiredEvidenceClasses.length !== REQUIRED_EVIDENCE_CLASSES.length || !REQUIRED_EVIDENCE_CLASSES.every((evidenceClass) => study.requiredEvidenceClasses.includes(evidenceClass))) {
      throw new FaceAuthorityValidationError(`${ref} must require repeat-capture, blinded-expert, and threshold-selection evidence.`);
    }

    const sourceGateOpen = study.traditionalSourceRefs.every((sourceRef) => {
      const passage = passages.get(sourceRef);
      return passage !== undefined && verificationRank(passage.verificationStatus) >= verificationRank('scan_checked');
    });
    const methodGateOpen = reviewRank(method.reviewStatus) >= reviewRank('reviewed');
    const qualityArtifact = supportByRef.get(capture.qualityPolicyRef)!;
    const retentionArtifact = supportByRef.get(capture.reviewArtifactPolicy.retentionPolicyRef)!;
    const instructionArtifact = supportByRef.get(labeling.instructionArtifactRef)!;
    const protocolGateOpen = [capture.status, labeling.status, split.status, qualityArtifact.status, retentionArtifact.status, instructionArtifact.status]
      .every((status) => status !== 'research');

    if (study.executionState === 'authorized_to_collect') {
      if (!sourceGateOpen) throw new FaceAuthorityValidationError(`${ref} cannot collect human calibration data before all traditional sources are scan_checked.`);
      if (!methodGateOpen) throw new FaceAuthorityValidationError(`${ref} cannot collect human calibration data with research-only methodology.`);
      if (!protocolGateOpen) throw new FaceAuthorityValidationError(`${ref} cannot collect human calibration data while any linked protocol/support artifact is research-only.`);
      if (study.status === 'research') throw new FaceAuthorityValidationError(`${ref} authorized_to_collect cannot have research status.`);
      if (study.blockingReasons.length !== 0) throw new FaceAuthorityValidationError(`${ref} authorized_to_collect must have no blockingReasons.`);
    } else if (study.blockingReasons.length === 0) {
      throw new FaceAuthorityValidationError(`${ref} blocked/protocol_ready study must state blockingReasons.`);
    }
  }
}

export function validateFaceCalibrationDatasetManifest(
  manifest: FaceCalibrationDatasetManifest,
  study: FaceCalibrationStudyProtocolDefinition,
  captureProtocol: FaceCaptureProtocolDefinition,
): void {
  stableKey(manifest.manifestId, 'calibrationManifest.manifestId');
  nonEmpty(manifest.version, `${manifest.manifestId}.version`);
  if (manifest.studyRef !== studyRef(study)) throw new FaceAuthorityValidationError(`${manifest.manifestId} studyRef does not match supplied study.`);
  if (manifest.records.length === 0) throw new FaceAuthorityValidationError(`${manifest.manifestId} requires records.`);

  const observationRefs = new Set<string>();
  const reviewItemRefs = new Set<string>();
  const participantPartition = new Map<string, FaceCalibrationPartition>();
  const captureFamilyPartition = new Map<string, FaceCalibrationPartition>();
  const captureFamilyParticipant = new Map<string, string>();
  const sessionOrdinals = new Set<string>();
  const acceptedPartitions = new Set<FaceCalibrationPartition>();

  for (const record of manifest.records) {
    nonEmpty(record.observationRef, 'manifest.record.observationRef');
    nonEmpty(record.participantKey, 'manifest.record.participantKey');
    nonEmpty(record.captureFamilyKey, 'manifest.record.captureFamilyKey');
    nonEmpty(record.captureSessionKey, 'manifest.record.captureSessionKey');
    if (observationRefs.has(record.observationRef)) throw new FaceAuthorityValidationError(`Duplicate observationRef: ${record.observationRef}`);
    observationRefs.add(record.observationRef);
    if (record.metricRef !== study.metricRef) throw new FaceAuthorityValidationError(`${record.observationRef} metricRef does not match study.`);
    if (record.protocolRef !== captureProtocolRef(captureProtocol)) throw new FaceAuthorityValidationError(`${record.observationRef} protocolRef does not match capture protocol.`);
    if (!Number.isInteger(record.captureOrdinal) || record.captureOrdinal < 1) throw new FaceAuthorityValidationError(`${record.observationRef} captureOrdinal must be a positive integer.`);
    const ordinalKey = `${record.participantKey}:${record.captureSessionKey}:${record.captureOrdinal}`;
    if (sessionOrdinals.has(ordinalKey)) throw new FaceAuthorityValidationError(`Duplicate capture ordinal within participant/session: ${ordinalKey}`);
    sessionOrdinals.add(ordinalKey);

    if (!record.accepted) {
      if (record.rejectionReason === undefined || record.rejectionReason.trim().length === 0) throw new FaceAuthorityValidationError(`${record.observationRef} rejected capture requires rejectionReason.`);
      if (record.reviewItemRef !== undefined) throw new FaceAuthorityValidationError(`${record.observationRef} rejected capture must not expose reviewItemRef.`);
    } else {
      if (record.rejectionReason !== undefined) throw new FaceAuthorityValidationError(`${record.observationRef} accepted capture must not carry rejectionReason.`);
      if (record.reviewItemRef === undefined || record.reviewItemRef.trim().length === 0) throw new FaceAuthorityValidationError(`${record.observationRef} accepted capture requires reviewItemRef.`);
      if (reviewItemRefs.has(record.reviewItemRef)) throw new FaceAuthorityValidationError(`Duplicate reviewItemRef: ${record.reviewItemRef}`);
      reviewItemRefs.add(record.reviewItemRef);
      acceptedPartitions.add(record.partition);
    }

    const participantExisting = participantPartition.get(record.participantKey);
    if (participantExisting !== undefined && participantExisting !== record.partition) throw new FaceAuthorityValidationError(`Participant leakage across selection/holdout: ${record.participantKey}`);
    participantPartition.set(record.participantKey, record.partition);

    const familyExisting = captureFamilyPartition.get(record.captureFamilyKey);
    if (familyExisting !== undefined && familyExisting !== record.partition) throw new FaceAuthorityValidationError(`Capture-family leakage across selection/holdout: ${record.captureFamilyKey}`);
    captureFamilyPartition.set(record.captureFamilyKey, record.partition);
    const familyParticipant = captureFamilyParticipant.get(record.captureFamilyKey);
    if (familyParticipant !== undefined && familyParticipant !== record.participantKey) throw new FaceAuthorityValidationError(`Capture family belongs to multiple participants: ${record.captureFamilyKey}`);
    captureFamilyParticipant.set(record.captureFamilyKey, record.participantKey);
  }

  if (!acceptedPartitions.has('selection') || !acceptedPartitions.has('holdout')) {
    throw new FaceAuthorityValidationError(`${manifest.manifestId} requires accepted observations in both selection and holdout partitions.`);
  }

  const acceptedByParticipantSession = new Map<string, number>();
  const sessionsByParticipant = new Map<string, Set<string>>();
  for (const record of manifest.records.filter((item) => item.accepted)) {
    const sessionKey = `${record.participantKey}:${record.captureSessionKey}`;
    acceptedByParticipantSession.set(sessionKey, (acceptedByParticipantSession.get(sessionKey) ?? 0) + 1);
    const sessions = sessionsByParticipant.get(record.participantKey) ?? new Set<string>();
    sessions.add(record.captureSessionKey);
    sessionsByParticipant.set(record.participantKey, sessions);
  }
  for (const [participantKey, sessions] of sessionsByParticipant) {
    if (sessions.size < captureProtocol.repeatPlan.sessionsPerParticipant) throw new FaceAuthorityValidationError(`${participantKey} has insufficient independent accepted sessions.`);
    for (const sessionKey of sessions) {
      const accepted = acceptedByParticipantSession.get(`${participantKey}:${sessionKey}`) ?? 0;
      if (accepted < captureProtocol.repeatPlan.acceptedCapturesPerSession) throw new FaceAuthorityValidationError(`${participantKey}:${sessionKey} has insufficient accepted captures.`);
    }
  }
}

export function validateFaceCalibrationLabelDataset(
  dataset: FaceCalibrationLabelDataset,
  manifest: FaceCalibrationDatasetManifest,
  study: FaceCalibrationStudyProtocolDefinition,
  labelingProtocol: FaceLabelingProtocolDefinition,
): void {
  stableKey(dataset.datasetId, 'calibrationLabelDataset.datasetId');
  nonEmpty(dataset.version, `${dataset.datasetId}.version`);
  if (dataset.studyRef !== studyRef(study)) throw new FaceAuthorityValidationError(`${dataset.datasetId} studyRef does not match supplied study.`);
  if (dataset.studyRef !== manifest.studyRef) throw new FaceAuthorityValidationError(`${dataset.datasetId} and manifest must reference the same study.`);
  if (dataset.records.length === 0) throw new FaceAuthorityValidationError(`${dataset.datasetId} requires label records.`);

  const acceptedReviewItems = new Set(manifest.records.filter((record) => record.accepted).map((record) => record.reviewItemRef!));
  const reviewerPerItem = new Map<string, Set<string>>();
  for (const record of dataset.records) {
    nonEmpty(record.itemRef, 'labelRecord.itemRef');
    nonEmpty(record.reviewerKey, 'labelRecord.reviewerKey');
    if (!acceptedReviewItems.has(record.itemRef)) throw new FaceAuthorityValidationError(`${record.itemRef} is not an accepted review item in the calibration manifest.`);
    if (record.labelingProtocolRef !== labelingProtocolRef(labelingProtocol)) throw new FaceAuthorityValidationError(`${record.itemRef} uses wrong labeling protocol.`);
    if (!labelingProtocol.labelSet.includes(record.label)) throw new FaceAuthorityValidationError(`${record.itemRef} contains unsupported label ${record.label}.`);
    const reviewers = reviewerPerItem.get(record.itemRef) ?? new Set<string>();
    if (reviewers.has(record.reviewerKey)) throw new FaceAuthorityValidationError(`Duplicate reviewer label for item ${record.itemRef}: ${record.reviewerKey}`);
    reviewers.add(record.reviewerKey);
    reviewerPerItem.set(record.itemRef, reviewers);
  }
  for (const itemRef of acceptedReviewItems) {
    const reviewers = reviewerPerItem.get(itemRef);
    if (reviewers === undefined || reviewers.size < labelingProtocol.reviewerPlan.reviewersPerItem) throw new FaceAuthorityValidationError(`${itemRef} has insufficient independent reviewer labels.`);
  }
}

export function evaluateFaceCalibrationLabelConsensus(
  dataset: FaceCalibrationLabelDataset,
  labelingProtocol: FaceLabelingProtocolDefinition,
): readonly FaceCalibrationLabelConsensus[] {
  const labelsByItem = new Map<string, FaceMorphologyLabel[]>();
  for (const record of dataset.records) {
    const labels = labelsByItem.get(record.itemRef) ?? [];
    labels.push(record.label);
    labelsByItem.set(record.itemRef, labels);
  }
  return [...labelsByItem.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([itemRef, labels]) => {
    const metCount = labels.filter((label) => label === 'met').length;
    const notMetCount = labels.filter((label) => label === 'not_met').length;
    const abstainCount = labels.filter((label) => label === 'abstain').length;
    const nonAbstainCount = metCount + notMetCount;
    const winningCount = Math.max(metCount, notMetCount);
    const agreementFraction = nonAbstainCount === 0 ? null : winningCount / nonAbstainCount;
    const rule = labelingProtocol.reviewerPlan.agreementRule;
    const hasConsensus = nonAbstainCount >= rule.minNonAbstainLabels && agreementFraction !== null && agreementFraction >= rule.minAgreementFraction && metCount !== notMetCount;
    return {
      itemRef,
      state: hasConsensus ? (metCount > notMetCount ? 'met' : 'not_met') : 'no_consensus',
      metCount,
      notMetCount,
      abstainCount,
      nonAbstainCount,
      agreementFraction,
    };
  });
}

export const FACE_NOSE_BRIDGE_CALIBRATION_PROTOCOL_RESEARCH_V0: FaceCalibrationProtocolRegistry = {
  registryId: 'calibration-protocol.face.nose_bridge.research_v0',
  version: '0.3.0',
  supportArtifacts: [
    {
      artifactId: 'quality.face.calibration.frontal',
      version: '0.1.0',
      kind: 'capture_quality_policy',
      requiredChecks: ['single_face', 'frontal_pose', 'sharpness', 'nose_bridge_visibility', 'major_occlusion'],
      acceptancePolicyRef: 'acceptance.face.calibration.frontal.research_v0',
      status: 'research',
    },
    {
      artifactId: 'retention.face.calibration.review_artifact',
      version: '0.1.0',
      kind: 'review_artifact_retention_policy',
      containsPotentiallyIdentifyingFace: true,
      deleteTrigger: 'labeling_and_audit_complete',
      maxRetentionDays: null,
      accessScope: 'assigned_reviewers_and_auditors',
      trainingReuseAllowed: false,
      identityMatchingAllowed: false,
      status: 'research',
    },
    {
      artifactId: 'instructions.face.bridge_straight',
      version: '0.1.0',
      kind: 'labeling_instruction',
      methodologyRef: FACE_FR3_METHOD_REFS_V0.shenxiangFiveOfficers,
      criterionId: 'criterion.discernment.bridge_straight',
      traditionalSourceRefs: ['passage.shenxiang.five_officers.discernment'],
      reviewerMustNotSee: ['metric_values', 'candidate_threshold', 'peer_labels', 'fortune_output'],
      status: 'research',
    },
  ],
  captureProtocols: [
    {
      protocolId: 'capture.nose_bridge.repeat_frontal',
      version: '0.3.0',
      metricRefs: ['neutral.nose.bridge.centerline_rms_deviation@0.1.0'],
      captureMode: 'single_frontal',
      requiredViewKeys: ['frontal'],
      repeatPlan: { sessionsPerParticipant: 2, acceptedCapturesPerSession: 2, independentRecaptureRequired: true },
      qualityPolicyRef: 'quality.face.calibration.frontal@0.1.0',
      sourceImagePolicy: {
        exifStrippedBeforeProcessing: true,
        originalDeletedAfterReviewArtifactCreation: true,
        trainingReuseAllowed: false,
        identityEmbeddingAllowed: false,
      },
      reviewArtifactPolicy: {
        containsPotentiallyIdentifyingFace: true,
        participantPolicy: 'consented_pseudonymous',
        retentionPolicyRef: 'retention.face.calibration.review_artifact@0.1.0',
        identityMatchingAllowed: false,
        trainingReuseAllowed: false,
      },
      status: 'research',
    },
  ],
  labelingProtocols: [
    {
      protocolId: 'label.shenxiang.discernment.bridge_straight',
      version: '0.3.0',
      methodologyRef: FACE_FR3_METHOD_REFS_V0.shenxiangFiveOfficers,
      criterionId: 'criterion.discernment.bridge_straight',
      traditionalSourceRefs: ['passage.shenxiang.five_officers.discernment'],
      labelSet: ['met', 'not_met', 'abstain'],
      reviewerPlan: {
        reviewersPerItem: 3,
        blindToMetricValues: true,
        blindToPeerLabels: true,
        independentInitialLabels: true,
        allowAbstain: true,
        agreementRule: { kind: 'supermajority_non_abstain', minAgreementFraction: 2 / 3, minNonAbstainLabels: 2 },
      },
      instructionArtifactRef: 'instructions.face.bridge_straight@0.1.0',
      participantPolicy: 'consented_pseudonymous',
      status: 'research',
    },
  ],
  splitPolicies: [
    {
      policyId: 'split.face.calibration.participant_holdout',
      version: '0.3.0',
      splitUnit: 'participant',
      partitions: ['selection', 'holdout'],
      participantLeakageAllowed: false,
      captureFamilyLeakageAllowed: false,
      thresholdSelectionMayReadHoldout: false,
      finalEvaluationMayReadSelectionLabels: false,
      status: 'research',
    },
  ],
  studies: [
    {
      studyId: 'study.face.nose_bridge.straight',
      version: '0.3.0',
      metricRef: 'neutral.nose.bridge.centerline_rms_deviation@0.1.0',
      criterionId: 'criterion.discernment.bridge_straight',
      methodologyRef: FACE_FR3_METHOD_REFS_V0.shenxiangFiveOfficers,
      traditionalSourceRefs: ['passage.shenxiang.five_officers.discernment'],
      captureProtocolRef: 'capture.nose_bridge.repeat_frontal@0.3.0',
      labelingProtocolRef: 'label.shenxiang.discernment.bridge_straight@0.3.0',
      splitPolicyRef: 'split.face.calibration.participant_holdout@0.3.0',
      requiredEvidenceClasses: ['repeat_capture_stability', 'blinded_expert_operationalization', 'threshold_selection_result'],
      executionState: 'blocked',
      blockingReasons: [
        'passage.shenxiang.five_officers.discernment is not scan_checked in the current authority registry',
        'capture/label/split protocols and linked quality/retention/instruction artifacts are research-only',
      ],
      status: 'research',
    },
  ],
};
