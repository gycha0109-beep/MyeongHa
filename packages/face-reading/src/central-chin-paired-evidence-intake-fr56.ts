import { createHash } from 'node:crypto';
import {
  deriveMentonSideEndpointCandidatePairFR52,
} from './chin-contour-endpoint-candidate-admission-fr52.js';
import {
  CENTRAL_CHIN_REFERENCE_TRACE_AUTHORITY_FR54,
  validateCentralChinInferiorReferenceTraceAnnotationFR54,
  validateCentralChinReferenceTraceAuthorityFR54,
  type CentralChinInferiorReferenceTraceAnnotationFR54V1,
} from './central-chin-reference-trace-protocol-fr54.js';
import {
  MENTON_SIDE_REFERENCE_TRACE_RAW_JOIN_AUTHORITY_FR55,
  joinMentonSideCandidatesToReferenceTraceFR55,
  validateMentonSideReferenceTraceRawJoinAuthorityFR55,
  type MentonSideReferenceTraceRawJoinFR55V1,
} from './menton-side-reference-trace-raw-join-fr55.js';
import type { IndependentCentralChinScaffoldAnnotationFR50V1 } from './provider-independent-chin-contour-geometry-fr50.js';
import { FaceAuthorityValidationError } from './validation.js';

export interface CentralChinPairedEvidenceIntakeFR56V1 {
  readonly schemaVersion: 'fr56-central-chin-paired-evidence-intake-v1';
  readonly pairRef: string;
  readonly canonicalAssetDigest: string;
  readonly traceObservedAssetDigest: string;
  readonly mentonSideObservedAssetDigest: string;
  readonly traceAnnotation: CentralChinInferiorReferenceTraceAnnotationFR54V1;
  readonly traceFrozenAt: string;
  readonly mentonSideAnnotation: IndependentCentralChinScaffoldAnnotationFR50V1;
  readonly mentonSideAnnotationFrozenAt: string;
  readonly pairedAt: string;
  readonly traceFrozenBeforeCandidateAnnotationAttested: true;
  readonly pairingPerformedAfterBothAnnotationsFrozenAttested: true;
}

export interface FrozenCentralChinPairedEvidenceRecordFR56V1 {
  readonly schemaVersion: 'fr56-central-chin-paired-evidence-record-v1';
  readonly algorithmRef: 'algorithm.research.chin_inferior.central_chin_paired_evidence_freeze.fr56@0.1.0';
  readonly pairRef: string;
  readonly subjectId: string;
  readonly captureId: string;
  readonly canonicalAssetDigest: string;
  readonly traceObservedAssetDigest: string;
  readonly mentonSideObservedAssetDigest: string;
  readonly assetByteLength: number;
  readonly assetDigestVerifiedAgainstProvidedBytes: true;
  readonly exactObservedAssetDigestMatchVerified: true;
  readonly observedDigestBindingProofState: 'annotation_declared_digests_match_intake_bytes_not_externally_attested_history';
  readonly rawAssetBytesRetained: false;
  readonly rawAssetRetentionPolicy: 'ephemeral_digest_then_discard';
  readonly traceAnnotation: CentralChinInferiorReferenceTraceAnnotationFR54V1;
  readonly traceFrozenAt: string;
  readonly mentonSideAnnotation: IndependentCentralChinScaffoldAnnotationFR50V1;
  readonly mentonSideAnnotationFrozenAt: string;
  readonly pairedAt: string;
  readonly exactSubjectCaptureMatchVerified: true;
  readonly traceFrozenBeforeCandidateAnnotationAttested: true;
  readonly pairingPerformedAfterBothAnnotationsFrozenAttested: true;
  readonly timestampOrderConsistencyVerified: true;
  readonly chronologyProofState: 'attested_and_timestamp_consistent_not_cryptographically_proven';
  readonly pairedRecordCanonicalizationAlgorithm: 'sorted_object_keys_preserve_array_order_json_v1';
  readonly pairedRecordDigestAlgorithm: 'sha256';
  readonly pairedRecordDigestScope: 'source_annotations_capture_asset_and_freeze_metadata_excluding_derived_join';
  readonly pairedRecordDigest: string;
  readonly derivedJoinIncludedInPairedRecordDigest: false;
  readonly resultState: 'same_capture_source_observations_byte_bound_and_frozen_no_empirical_validation';
  readonly reviewedReferenceStandardAuthorized: false;
  readonly endpointAuthority: false;
  readonly membershipDecisionAuthorized: false;
  readonly providerMappingAuthorized: false;
  readonly traditionalDigeEquivalenceAuthorized: false;
  readonly empiricalValidationAuthorized: false;
  readonly productionGeometryAuthorized: false;
}

export interface CentralChinPairedEvidenceIntakeReportFR56V1 {
  readonly schemaVersion: 'fr56-central-chin-paired-evidence-intake-report-v1';
  readonly record: FrozenCentralChinPairedEvidenceRecordFR56V1;
  readonly rawJoin: MentonSideReferenceTraceRawJoinFR55V1;
  readonly sourceRecordFrozenBeforeDerivedJoinReportReturned: true;
  readonly rawJoinDerivedFromExactFrozenSourceContent: true;
  readonly rawJoinMayMutateSourceRecord: false;
  readonly rawJoinIncludedInPairedRecordDigest: false;
  readonly empiricalScoringPerformed: false;
  readonly membershipThresholdDefined: false;
  readonly endpointSelectionPerformed: false;
  readonly reviewedReferenceStandardAuthorized: false;
  readonly providerMappingAuthorized: false;
  readonly traditionalDigeEquivalenceAuthorized: false;
  readonly productionGeometryAuthorized: false;
}

export interface CentralChinPairedEvidenceIntakeAuthorityFR56V1 {
  readonly schemaVersion: 'fr56-v1';
  readonly authorityRef: 'authority.face.central_chin_paired_evidence_intake.fr56';
  readonly authorityVersion: '0.1.0';
  readonly authorityState: 'paired_observation_intake_and_canonical_record_freeze_defined_no_empirical_validation';
  readonly upstreamFR54Ref: string;
  readonly upstreamFR55Ref: string;
  readonly protocol: {
    readonly protocolRef: 'protocol.face.chin_inferior.central_chin_paired_evidence_intake.fr56@0.1.0';
    readonly exactSubjectCaptureMatchRequired: true;
    readonly sourceAssetDigestAlgorithm: 'sha256';
    readonly sourceAssetDigestVerifiedAgainstProvidedBytesRequired: true;
    readonly perAnnotationObservedAssetDigestRequired: true;
    readonly exactObservedAssetDigestMatchRequired: true;
    readonly rawAssetRetentionPolicy: 'ephemeral_digest_then_discard';
    readonly traceAnnotationSchemaRef: 'fr54-provider-blind-central-chin-reference-trace-v1';
    readonly mentonSideAnnotationSchemaRef: 'fr50-independent-central-chin-scaffold-v1';
    readonly traceFreezeBeforeCandidateAnnotationAttestationRequired: true;
    readonly pairingAfterBothAnnotationsFrozenAttestationRequired: true;
    readonly canonicalTimestampFormat: 'iso_8601_utc_millisecond';
    readonly timestampOrderRule: 'trace_frozen_at_lte_candidate_frozen_at_lte_paired_at';
    readonly timestampOrderMeansCryptographicChronologyProof: false;
    readonly distinctAnnotatorsRequired: null;
    readonly pairedRecordCanonicalizationAlgorithm: 'sorted_object_keys_preserve_array_order_json_v1';
    readonly pairedRecordDigestAlgorithm: 'sha256';
    readonly pairedRecordDigestScope: 'source_annotations_capture_asset_and_freeze_metadata_excluding_derived_join';
    readonly pairedRecordDigestIncludesDerivedJoin: false;
    readonly minimumPairs: null;
    readonly minimumSubjects: null;
    readonly membershipThreshold: null;
    readonly anchorAgreementTolerance: null;
    readonly endpointSelectionRule: null;
    readonly empiricalAcceptanceCriterion: null;
  };
  readonly authorityBoundary: {
    readonly pairRecordDigestMeansEmpiricalValidity: false;
    readonly pairRecordDigestMeansReviewedReferenceStandard: false;
    readonly pairRecordDigestReverifiesDiscardedAssetBytes: false;
    readonly assetDigestMatchMeansCorrectAnatomicalAnnotation: false;
    readonly observedAssetDigestEqualityMeansExternallyVerifiedAnnotationAssetHistory: false;
    readonly timestampConsistencyMeansCryptographicChronologyProof: false;
    readonly freezeAttestationMeansExternallyVerifiedChronology: false;
    readonly sameCapturePairMeansDistinctAnnotators: false;
    readonly sameCapturePairMeansIndependentAnatomicalGroundTruth: false;
    readonly pairedEvidenceMayDefineMembershipThresholdPostHoc: false;
    readonly pairedEvidenceMaySelectFR35EndpointPostHoc: false;
    readonly rawJoinDistanceMeansTraceMembership: false;
    readonly rawJoinZeroDistanceMeansFR35Endpoint: false;
    readonly providerMappingAuthorized: false;
    readonly traditionalDigeEquivalenceAuthorized: false;
    readonly empiricalValidationAuthorized: false;
    readonly productionThreeDivisionsMetricAllowed: false;
    readonly productionF1Allowed: false;
    readonly productionF6Allowed: false;
    readonly productionGeometryAuthorized: false;
  };
}

export interface CentralChinPairedEvidenceIntakeReadinessFR56V1 {
  readonly pairedIntakeProtocolReady: true;
  readonly sourceAssetByteDigestVerificationReady: true;
  readonly perAnnotationObservedAssetDigestBindingReady: true;
  readonly canonicalPairedRecordDigestReady: true;
  readonly sameCaptureSourceBindingReady: true;
  readonly freezeMetadataConsistencyCheckReady: true;
  readonly thresholdFreeRawJoinReady: true;
  readonly realPairedEvidenceDatasetPresent: false;
  readonly externalAnnotationAssetHistoryAttestationPresent: false;
  readonly externalChronologyAttestationPresent: false;
  readonly reviewedReferenceStandardReady: false;
  readonly empiricalValidationReady: false;
  readonly endpointSelectionReady: false;
  readonly providerMappingReady: false;
  readonly productionGeometryReady: false;
  readonly nextRequiredEvidence: readonly string[];
}

const SHA256 = /^sha256:[0-9a-f]{64}$/u;
const FR54_REF = `${CENTRAL_CHIN_REFERENCE_TRACE_AUTHORITY_FR54.authorityRef}@${CENTRAL_CHIN_REFERENCE_TRACE_AUTHORITY_FR54.authorityVersion}`;
const FR55_REF = `${MENTON_SIDE_REFERENCE_TRACE_RAW_JOIN_AUTHORITY_FR55.authorityRef}@${MENTON_SIDE_REFERENCE_TRACE_RAW_JOIN_AUTHORITY_FR55.authorityVersion}`;

export const CENTRAL_CHIN_PAIRED_EVIDENCE_INTAKE_AUTHORITY_FR56: CentralChinPairedEvidenceIntakeAuthorityFR56V1 = Object.freeze({
  schemaVersion: 'fr56-v1' as const,
  authorityRef: 'authority.face.central_chin_paired_evidence_intake.fr56' as const,
  authorityVersion: '0.1.0' as const,
  authorityState: 'paired_observation_intake_and_canonical_record_freeze_defined_no_empirical_validation' as const,
  upstreamFR54Ref: FR54_REF,
  upstreamFR55Ref: FR55_REF,
  protocol: Object.freeze({
    protocolRef: 'protocol.face.chin_inferior.central_chin_paired_evidence_intake.fr56@0.1.0' as const,
    exactSubjectCaptureMatchRequired: true as const,
    sourceAssetDigestAlgorithm: 'sha256' as const,
    sourceAssetDigestVerifiedAgainstProvidedBytesRequired: true as const,
    perAnnotationObservedAssetDigestRequired: true as const,
    exactObservedAssetDigestMatchRequired: true as const,
    rawAssetRetentionPolicy: 'ephemeral_digest_then_discard' as const,
    traceAnnotationSchemaRef: 'fr54-provider-blind-central-chin-reference-trace-v1' as const,
    mentonSideAnnotationSchemaRef: 'fr50-independent-central-chin-scaffold-v1' as const,
    traceFreezeBeforeCandidateAnnotationAttestationRequired: true as const,
    pairingAfterBothAnnotationsFrozenAttestationRequired: true as const,
    canonicalTimestampFormat: 'iso_8601_utc_millisecond' as const,
    timestampOrderRule: 'trace_frozen_at_lte_candidate_frozen_at_lte_paired_at' as const,
    timestampOrderMeansCryptographicChronologyProof: false as const,
    distinctAnnotatorsRequired: null,
    pairedRecordCanonicalizationAlgorithm: 'sorted_object_keys_preserve_array_order_json_v1' as const,
    pairedRecordDigestAlgorithm: 'sha256' as const,
    pairedRecordDigestScope: 'source_annotations_capture_asset_and_freeze_metadata_excluding_derived_join' as const,
    pairedRecordDigestIncludesDerivedJoin: false as const,
    minimumPairs: null,
    minimumSubjects: null,
    membershipThreshold: null,
    anchorAgreementTolerance: null,
    endpointSelectionRule: null,
    empiricalAcceptanceCriterion: null,
  }),
  authorityBoundary: Object.freeze({
    pairRecordDigestMeansEmpiricalValidity: false as const,
    pairRecordDigestMeansReviewedReferenceStandard: false as const,
    pairRecordDigestReverifiesDiscardedAssetBytes: false as const,
    assetDigestMatchMeansCorrectAnatomicalAnnotation: false as const,
    observedAssetDigestEqualityMeansExternallyVerifiedAnnotationAssetHistory: false as const,
    timestampConsistencyMeansCryptographicChronologyProof: false as const,
    freezeAttestationMeansExternallyVerifiedChronology: false as const,
    sameCapturePairMeansDistinctAnnotators: false as const,
    sameCapturePairMeansIndependentAnatomicalGroundTruth: false as const,
    pairedEvidenceMayDefineMembershipThresholdPostHoc: false as const,
    pairedEvidenceMaySelectFR35EndpointPostHoc: false as const,
    rawJoinDistanceMeansTraceMembership: false as const,
    rawJoinZeroDistanceMeansFR35Endpoint: false as const,
    providerMappingAuthorized: false as const,
    traditionalDigeEquivalenceAuthorized: false as const,
    empiricalValidationAuthorized: false as const,
    productionThreeDivisionsMetricAllowed: false as const,
    productionF1Allowed: false as const,
    productionF6Allowed: false as const,
    productionGeometryAuthorized: false as const,
  }),
});

function fail(message: string): never {
  throw new FaceAuthorityValidationError(`FR-56 ${message}`);
}

function nonEmpty(value: string, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) fail(`${label} must be non-empty.`);
  return value;
}

function canonicalSha256(value: string, label: string): string {
  if (!SHA256.test(value)) fail(`${label} must use canonical lowercase sha256:<64-hex> form.`);
  return value;
}

function canonicalTimestamp(value: string, label: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    fail(`${label} must use canonical ISO-8601 UTC millisecond form.`);
  }
  return parsed;
}

function canonicalJson(value: unknown, path: string): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'string':
    case 'boolean':
      return JSON.stringify(value);
    case 'number':
      if (!Number.isFinite(value)) fail(`${path} contains a non-finite number.`);
      return JSON.stringify(value);
    case 'object': {
      if (Array.isArray(value)) {
        return `[${value.map((entry, index) => canonicalJson(entry, `${path}[${index}]`)).join(',')}]`;
      }
      const prototype = Object.getPrototypeOf(value);
      if (prototype !== Object.prototype && prototype !== null) fail(`${path} must contain JSON-compatible plain objects only.`);
      const record = value as Record<string, unknown>;
      const keys = Object.keys(record).sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
      return `{${keys.map((key) => {
        const child = record[key];
        if (child === undefined) fail(`${path}.${key} cannot be undefined.`);
        return `${JSON.stringify(key)}:${canonicalJson(child, `${path}.${key}`)}`;
      }).join(',')}}`;
    }
    default:
      return fail(`${path} contains a non-JSON value.`);
  }
}

function deepFreezeJson<T>(value: T, path: string): T {
  const cloned = JSON.parse(canonicalJson(value, path)) as T;
  const freeze = (entry: unknown): unknown => {
    if (entry === null || typeof entry !== 'object') return entry;
    if (Array.isArray(entry)) {
      entry.forEach((child) => freeze(child));
      return Object.freeze(entry);
    }
    Object.values(entry as Record<string, unknown>).forEach((child) => freeze(child));
    return Object.freeze(entry);
  };
  return freeze(cloned) as T;
}

function recordDigestContent(input: CentralChinPairedEvidenceIntakeFR56V1, assetByteLength: number): Readonly<Record<string, unknown>> {
  return Object.freeze({
    schemaVersion: 'fr56-central-chin-paired-evidence-record-digest-content-v1',
    pairRef: input.pairRef,
    subjectId: input.traceAnnotation.subjectId,
    captureId: input.traceAnnotation.captureId,
    canonicalAssetDigest: input.canonicalAssetDigest,
    traceObservedAssetDigest: input.traceObservedAssetDigest,
    mentonSideObservedAssetDigest: input.mentonSideObservedAssetDigest,
    assetByteLength,
    traceAnnotation: input.traceAnnotation,
    traceFrozenAt: input.traceFrozenAt,
    mentonSideAnnotation: input.mentonSideAnnotation,
    mentonSideAnnotationFrozenAt: input.mentonSideAnnotationFrozenAt,
    pairedAt: input.pairedAt,
    traceFrozenBeforeCandidateAnnotationAttested: input.traceFrozenBeforeCandidateAnnotationAttested,
    pairingPerformedAfterBothAnnotationsFrozenAttested: input.pairingPerformedAfterBothAnnotationsFrozenAttested,
  });
}

export function validateCentralChinPairedEvidenceIntakeAuthorityFR56(
  authority: CentralChinPairedEvidenceIntakeAuthorityFR56V1 = CENTRAL_CHIN_PAIRED_EVIDENCE_INTAKE_AUTHORITY_FR56,
): CentralChinPairedEvidenceIntakeAuthorityFR56V1 {
  const fr54 = validateCentralChinReferenceTraceAuthorityFR54();
  const fr55 = validateMentonSideReferenceTraceRawJoinAuthorityFR55();
  if (
    fr54.protocol.freezeBeforeCandidateAnnotationOrComparisonRequired !== true ||
    fr55.joinProtocol.identityBinding !== 'subject_and_capture_exact_match_required' ||
    fr55.joinProtocol.membershipThreshold !== null ||
    fr55.joinProtocol.endpointSelectionRule !== null
  ) {
    fail('FR-54/55 upstream freeze, identity, or threshold-free boundary drift.');
  }
  if (
    authority.schemaVersion !== 'fr56-v1' ||
    authority.authorityRef !== 'authority.face.central_chin_paired_evidence_intake.fr56' ||
    authority.authorityVersion !== '0.1.0' ||
    authority.authorityState !== 'paired_observation_intake_and_canonical_record_freeze_defined_no_empirical_validation' ||
    authority.upstreamFR54Ref !== FR54_REF ||
    authority.upstreamFR55Ref !== FR55_REF
  ) {
    fail('authority identity/upstream drift.');
  }
  const protocol = authority.protocol;
  if (
    protocol.exactSubjectCaptureMatchRequired !== true ||
    protocol.sourceAssetDigestAlgorithm !== 'sha256' ||
    protocol.sourceAssetDigestVerifiedAgainstProvidedBytesRequired !== true ||
    protocol.perAnnotationObservedAssetDigestRequired !== true ||
    protocol.exactObservedAssetDigestMatchRequired !== true ||
    protocol.rawAssetRetentionPolicy !== 'ephemeral_digest_then_discard' ||
    protocol.traceAnnotationSchemaRef !== 'fr54-provider-blind-central-chin-reference-trace-v1' ||
    protocol.mentonSideAnnotationSchemaRef !== 'fr50-independent-central-chin-scaffold-v1' ||
    protocol.traceFreezeBeforeCandidateAnnotationAttestationRequired !== true ||
    protocol.pairingAfterBothAnnotationsFrozenAttestationRequired !== true ||
    protocol.canonicalTimestampFormat !== 'iso_8601_utc_millisecond' ||
    protocol.timestampOrderRule !== 'trace_frozen_at_lte_candidate_frozen_at_lte_paired_at' ||
    protocol.timestampOrderMeansCryptographicChronologyProof !== false ||
    protocol.distinctAnnotatorsRequired !== null ||
    protocol.pairedRecordCanonicalizationAlgorithm !== 'sorted_object_keys_preserve_array_order_json_v1' ||
    protocol.pairedRecordDigestAlgorithm !== 'sha256' ||
    protocol.pairedRecordDigestScope !== 'source_annotations_capture_asset_and_freeze_metadata_excluding_derived_join' ||
    protocol.pairedRecordDigestIncludesDerivedJoin !== false
  ) {
    fail('paired evidence intake protocol drift.');
  }
  for (const unresolved of [
    protocol.minimumPairs,
    protocol.minimumSubjects,
    protocol.membershipThreshold,
    protocol.anchorAgreementTolerance,
    protocol.endpointSelectionRule,
    protocol.empiricalAcceptanceCriterion,
  ]) {
    if (unresolved !== null) fail('empirical counts, thresholds, endpoint rules, and acceptance criteria must remain unresolved.');
  }
  if (Object.values(authority.authorityBoundary).some((value) => value !== false)) {
    fail('authority boundary must remain fully fail-closed.');
  }
  return authority;
}

export function validateCentralChinPairedEvidenceIntakeFR56(
  input: CentralChinPairedEvidenceIntakeFR56V1,
): CentralChinPairedEvidenceIntakeFR56V1 {
  validateCentralChinPairedEvidenceIntakeAuthorityFR56();
  if (input.schemaVersion !== 'fr56-central-chin-paired-evidence-intake-v1') fail('intake schema drift.');
  nonEmpty(input.pairRef, 'pairRef');
  canonicalSha256(input.canonicalAssetDigest, 'canonicalAssetDigest');
  canonicalSha256(input.traceObservedAssetDigest, 'traceObservedAssetDigest');
  canonicalSha256(input.mentonSideObservedAssetDigest, 'mentonSideObservedAssetDigest');
  validateCentralChinInferiorReferenceTraceAnnotationFR54(input.traceAnnotation);
  deriveMentonSideEndpointCandidatePairFR52(input.mentonSideAnnotation);
  if (
    input.traceAnnotation.subjectId !== input.mentonSideAnnotation.subjectId ||
    input.traceAnnotation.captureId !== input.mentonSideAnnotation.captureId
  ) {
    fail('trace and Menton-side annotations must bind to exactly the same subjectId and captureId.');
  }
  if (
    input.traceObservedAssetDigest !== input.canonicalAssetDigest ||
    input.mentonSideObservedAssetDigest !== input.canonicalAssetDigest
  ) {
    fail('both annotation-observed asset digests must exactly match canonicalAssetDigest.');
  }
  if (
    input.traceFrozenBeforeCandidateAnnotationAttested !== true ||
    input.pairingPerformedAfterBothAnnotationsFrozenAttested !== true
  ) {
    fail('freeze/pairing chronology attestations are required.');
  }
  const traceFrozenAt = canonicalTimestamp(input.traceFrozenAt, 'traceFrozenAt');
  const candidateFrozenAt = canonicalTimestamp(input.mentonSideAnnotationFrozenAt, 'mentonSideAnnotationFrozenAt');
  const pairedAt = canonicalTimestamp(input.pairedAt, 'pairedAt');
  if (traceFrozenAt > candidateFrozenAt || candidateFrozenAt > pairedAt) {
    fail('timestamps contradict the required trace-freeze -> candidate-freeze -> pairing order.');
  }
  return input;
}

export function computeCentralChinSourceAssetDigestFR56(assetBytes: Uint8Array): string {
  validateCentralChinPairedEvidenceIntakeAuthorityFR56();
  if (!(assetBytes instanceof Uint8Array) || assetBytes.byteLength <= 0) fail('source asset bytes must be a non-empty Uint8Array.');
  return `sha256:${createHash('sha256').update(assetBytes).digest('hex')}`;
}

export function computeCentralChinPairedEvidenceRecordDigestFR56(
  input: CentralChinPairedEvidenceIntakeFR56V1,
  assetByteLength: number,
): string {
  validateCentralChinPairedEvidenceIntakeFR56(input);
  if (!Number.isInteger(assetByteLength) || assetByteLength <= 0) fail('assetByteLength must be a positive integer.');
  const serialized = canonicalJson(recordDigestContent(input, assetByteLength), 'pairedRecordDigestContent');
  return `sha256:${createHash('sha256').update(serialized, 'utf8').digest('hex')}`;
}

export function freezeCentralChinPairedEvidenceRecordFR56(
  input: CentralChinPairedEvidenceIntakeFR56V1,
  assetBytes: Uint8Array,
): FrozenCentralChinPairedEvidenceRecordFR56V1 {
  validateCentralChinPairedEvidenceIntakeFR56(input);
  const actualAssetDigest = computeCentralChinSourceAssetDigestFR56(assetBytes);
  if (actualAssetDigest !== input.canonicalAssetDigest) {
    fail('provided source asset bytes do not match canonicalAssetDigest.');
  }
  const pairedRecordDigest = computeCentralChinPairedEvidenceRecordDigestFR56(input, assetBytes.byteLength);
  const traceAnnotation = deepFreezeJson(input.traceAnnotation, 'traceAnnotation');
  const mentonSideAnnotation = deepFreezeJson(input.mentonSideAnnotation, 'mentonSideAnnotation');
  return Object.freeze({
    schemaVersion: 'fr56-central-chin-paired-evidence-record-v1' as const,
    algorithmRef: 'algorithm.research.chin_inferior.central_chin_paired_evidence_freeze.fr56@0.1.0' as const,
    pairRef: input.pairRef,
    subjectId: input.traceAnnotation.subjectId,
    captureId: input.traceAnnotation.captureId,
    canonicalAssetDigest: input.canonicalAssetDigest,
    traceObservedAssetDigest: input.traceObservedAssetDigest,
    mentonSideObservedAssetDigest: input.mentonSideObservedAssetDigest,
    assetByteLength: assetBytes.byteLength,
    assetDigestVerifiedAgainstProvidedBytes: true as const,
    exactObservedAssetDigestMatchVerified: true as const,
    observedDigestBindingProofState: 'annotation_declared_digests_match_intake_bytes_not_externally_attested_history' as const,
    rawAssetBytesRetained: false as const,
    rawAssetRetentionPolicy: 'ephemeral_digest_then_discard' as const,
    traceAnnotation,
    traceFrozenAt: input.traceFrozenAt,
    mentonSideAnnotation,
    mentonSideAnnotationFrozenAt: input.mentonSideAnnotationFrozenAt,
    pairedAt: input.pairedAt,
    exactSubjectCaptureMatchVerified: true as const,
    traceFrozenBeforeCandidateAnnotationAttested: true as const,
    pairingPerformedAfterBothAnnotationsFrozenAttested: true as const,
    timestampOrderConsistencyVerified: true as const,
    chronologyProofState: 'attested_and_timestamp_consistent_not_cryptographically_proven' as const,
    pairedRecordCanonicalizationAlgorithm: 'sorted_object_keys_preserve_array_order_json_v1' as const,
    pairedRecordDigestAlgorithm: 'sha256' as const,
    pairedRecordDigestScope: 'source_annotations_capture_asset_and_freeze_metadata_excluding_derived_join' as const,
    pairedRecordDigest,
    derivedJoinIncludedInPairedRecordDigest: false as const,
    resultState: 'same_capture_source_observations_byte_bound_and_frozen_no_empirical_validation' as const,
    reviewedReferenceStandardAuthorized: false as const,
    endpointAuthority: false as const,
    membershipDecisionAuthorized: false as const,
    providerMappingAuthorized: false as const,
    traditionalDigeEquivalenceAuthorized: false as const,
    empiricalValidationAuthorized: false as const,
    productionGeometryAuthorized: false as const,
  });
}

export function verifyFrozenCentralChinPairedEvidenceRecordFR56(
  record: FrozenCentralChinPairedEvidenceRecordFR56V1,
): FrozenCentralChinPairedEvidenceRecordFR56V1 {
  validateCentralChinPairedEvidenceIntakeAuthorityFR56();
  if (
    record.schemaVersion !== 'fr56-central-chin-paired-evidence-record-v1' ||
    record.algorithmRef !== 'algorithm.research.chin_inferior.central_chin_paired_evidence_freeze.fr56@0.1.0' ||
    record.assetDigestVerifiedAgainstProvidedBytes !== true ||
    record.exactObservedAssetDigestMatchVerified !== true ||
    record.observedDigestBindingProofState !== 'annotation_declared_digests_match_intake_bytes_not_externally_attested_history' ||
    record.rawAssetBytesRetained !== false ||
    record.rawAssetRetentionPolicy !== 'ephemeral_digest_then_discard' ||
    record.exactSubjectCaptureMatchVerified !== true ||
    record.traceFrozenBeforeCandidateAnnotationAttested !== true ||
    record.pairingPerformedAfterBothAnnotationsFrozenAttested !== true ||
    record.timestampOrderConsistencyVerified !== true ||
    record.chronologyProofState !== 'attested_and_timestamp_consistent_not_cryptographically_proven' ||
    record.pairedRecordCanonicalizationAlgorithm !== 'sorted_object_keys_preserve_array_order_json_v1' ||
    record.pairedRecordDigestAlgorithm !== 'sha256' ||
    record.pairedRecordDigestScope !== 'source_annotations_capture_asset_and_freeze_metadata_excluding_derived_join' ||
    record.derivedJoinIncludedInPairedRecordDigest !== false ||
    record.resultState !== 'same_capture_source_observations_byte_bound_and_frozen_no_empirical_validation'
  ) {
    fail('frozen paired evidence record identity/state drift.');
  }
  if (
    record.reviewedReferenceStandardAuthorized !== false ||
    record.endpointAuthority !== false ||
    record.membershipDecisionAuthorized !== false ||
    record.providerMappingAuthorized !== false ||
    record.traditionalDigeEquivalenceAuthorized !== false ||
    record.empiricalValidationAuthorized !== false ||
    record.productionGeometryAuthorized !== false
  ) {
    fail('frozen paired evidence record authority boundary drift.');
  }
  const intake: CentralChinPairedEvidenceIntakeFR56V1 = {
    schemaVersion: 'fr56-central-chin-paired-evidence-intake-v1',
    pairRef: record.pairRef,
    canonicalAssetDigest: record.canonicalAssetDigest,
    traceObservedAssetDigest: record.traceObservedAssetDigest,
    mentonSideObservedAssetDigest: record.mentonSideObservedAssetDigest,
    traceAnnotation: record.traceAnnotation,
    traceFrozenAt: record.traceFrozenAt,
    mentonSideAnnotation: record.mentonSideAnnotation,
    mentonSideAnnotationFrozenAt: record.mentonSideAnnotationFrozenAt,
    pairedAt: record.pairedAt,
    traceFrozenBeforeCandidateAnnotationAttested: true,
    pairingPerformedAfterBothAnnotationsFrozenAttested: true,
  };
  validateCentralChinPairedEvidenceIntakeFR56(intake);
  if (record.subjectId !== intake.traceAnnotation.subjectId || record.captureId !== intake.traceAnnotation.captureId) {
    fail('frozen record subject/capture identity drift.');
  }
  if (!Number.isInteger(record.assetByteLength) || record.assetByteLength <= 0) fail('frozen record assetByteLength must remain positive.');
  canonicalSha256(record.pairedRecordDigest, 'pairedRecordDigest');
  const expectedDigest = computeCentralChinPairedEvidenceRecordDigestFR56(intake, record.assetByteLength);
  if (record.pairedRecordDigest !== expectedDigest) fail('pairedRecordDigest does not match frozen source content.');
  return record;
}

export function buildCentralChinPairedEvidenceIntakeReportFR56(
  input: CentralChinPairedEvidenceIntakeFR56V1,
  assetBytes: Uint8Array,
): CentralChinPairedEvidenceIntakeReportFR56V1 {
  const record = freezeCentralChinPairedEvidenceRecordFR56(input, assetBytes);
  verifyFrozenCentralChinPairedEvidenceRecordFR56(record);
  const rawJoin = joinMentonSideCandidatesToReferenceTraceFR55({
    referenceTraceAnnotation: record.traceAnnotation,
    mentonSideAnnotation: record.mentonSideAnnotation,
  });
  if (
    rawJoin.subjectId !== record.subjectId ||
    rawJoin.captureId !== record.captureId ||
    rawJoin.membershipThreshold !== null ||
    rawJoin.endpointSelectionRule !== null ||
    rawJoin.referenceStandardAuthorized !== false ||
    rawJoin.empiricalValidationAuthorized !== false ||
    rawJoin.productionGeometryAuthorized !== false
  ) {
    fail('FR-55 raw join drifted beyond the frozen FR-56 source record boundary.');
  }
  return Object.freeze({
    schemaVersion: 'fr56-central-chin-paired-evidence-intake-report-v1' as const,
    record,
    rawJoin,
    sourceRecordFrozenBeforeDerivedJoinReportReturned: true as const,
    rawJoinDerivedFromExactFrozenSourceContent: true as const,
    rawJoinMayMutateSourceRecord: false as const,
    rawJoinIncludedInPairedRecordDigest: false as const,
    empiricalScoringPerformed: false as const,
    membershipThresholdDefined: false as const,
    endpointSelectionPerformed: false as const,
    reviewedReferenceStandardAuthorized: false as const,
    providerMappingAuthorized: false as const,
    traditionalDigeEquivalenceAuthorized: false as const,
    productionGeometryAuthorized: false as const,
  });
}

export function assessCentralChinPairedEvidenceIntakeReadinessFR56(): CentralChinPairedEvidenceIntakeReadinessFR56V1 {
  validateCentralChinPairedEvidenceIntakeAuthorityFR56();
  return Object.freeze({
    pairedIntakeProtocolReady: true as const,
    sourceAssetByteDigestVerificationReady: true as const,
    perAnnotationObservedAssetDigestBindingReady: true as const,
    canonicalPairedRecordDigestReady: true as const,
    sameCaptureSourceBindingReady: true as const,
    freezeMetadataConsistencyCheckReady: true as const,
    thresholdFreeRawJoinReady: true as const,
    realPairedEvidenceDatasetPresent: false as const,
    externalAnnotationAssetHistoryAttestationPresent: false as const,
    externalChronologyAttestationPresent: false as const,
    reviewedReferenceStandardReady: false as const,
    empiricalValidationReady: false as const,
    endpointSelectionReady: false as const,
    providerMappingReady: false as const,
    productionGeometryReady: false as const,
    nextRequiredEvidence: Object.freeze([
      'Acquire real same-capture image bytes plus FR-54 provider/traditional/candidate-blind traces and FR-50/52 Menton-side annotations, recording the observed asset digest for each annotation session.',
      'Persist the FR-56 canonical paired source record and digest without retaining raw image bytes in this evidence object; retain any source asset under the separately governed dataset/storage policy.',
      'If annotation-to-asset history needs stronger authority than declared observed digests, add an independently verifiable acquisition/annotation event mechanism rather than upgrading FR-56 digest equality.',
      'Use FR-55 only to derive threshold-free raw geometry after the source record is frozen; do not tune membership or endpoint rules from the observed pair results post hoc.',
      'If chronology needs stronger authority than attested timestamps, add an independently verifiable external acquisition/freeze event mechanism rather than upgrading FR-56 timestamp consistency.',
      'Design any future empirical acceptance rule before inspecting holdout outcomes and keep provider mapping, traditional 地閣 equivalence, and production geometry separately gated.',
    ]),
  });
}

export function assertCentralChinPairedEvidenceReadyForProductionFR56(): never {
  validateCentralChinPairedEvidenceIntakeAuthorityFR56();
  throw new FaceAuthorityValidationError(
    'FR-56 verifies same-capture paired source identity, annotation-declared asset digests against provided bytes, freeze metadata consistency, and canonical record integrity only; reviewed reference standard, empirical thresholds, endpoint selection, provider mapping, traditional equivalence, and production geometry remain blocked.',
  );
}
