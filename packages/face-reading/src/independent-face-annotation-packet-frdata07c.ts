import { createHash } from 'node:crypto';
import {
  computeIndependentFaceSourceAssetDigestFRData07A,
  verifyFrozenIndependentFaceSourceAssetRecordFRData07A,
  type FrozenIndependentFaceSourceAssetRecordFRData07AV1,
  type IndependentFaceSourceAssetContentSignatureFRData07AV1,
} from './independent-face-source-asset-intake-frdata07a.js';
import {
  verifyFrozenIndependentFaceSourceAssetStorageReceiptFRData07B,
  verifyFrozenIndependentFaceSourceAssetStorageRetrievalVerificationFRData07B,
  type FrozenIndependentFaceSourceAssetStorageReceiptFRData07BV1,
  type FrozenIndependentFaceSourceAssetStorageRetrievalVerificationFRData07BV1,
} from './independent-face-source-asset-storage-frdata07b.js';
import { FaceAuthorityValidationError } from './validation.js';

export type IndependentHumanFaceCountLabelFRData07CV1 =
  | 'zero_human_faces'
  | 'one_human_face'
  | 'multiple_human_faces'
  | 'indeterminate';

export interface IndependentFaceAnnotationPacketItemInputFRData07CV1 {
  readonly schemaVersion: 'fr-data07c-independent-face-annotation-packet-item-input-v1';
  readonly packetRef: string;
  readonly canonicalAssetBytes: Uint8Array;
}

export interface FrozenIndependentFaceAnnotationPacketItemBindingFRData07CV1 {
  readonly schemaVersion: 'fr-data07c-independent-face-annotation-packet-item-binding-v1';
  readonly packetRef: string;
  readonly itemRef: string;
  readonly captureRef: string;
  readonly sourceAssetRecordDigest: string;
  readonly storageReceiptDigest: string;
  readonly retrievalVerificationDigest: string;
  readonly canonicalAssetDigest: string;
  readonly byteLength: number;
  readonly mediaType: IndependentFaceSourceAssetContentSignatureFRData07AV1;
  readonly packetAssetPath: string;
  readonly canonicalAssetBytesRehashedForPacket: true;
  readonly exactCanonicalAssetDigestMatch: true;
  readonly exactCanonicalByteLengthMatch: true;
  readonly exactCanonicalAssetBytesPreserved: true;
  readonly rawBytesEmbeddedInBindingRecord: false;
  readonly sourceMetadataIncludedInAnnotatorFacingItem: false;
  readonly sourceFilenameIncludedInAnnotatorFacingItem: false;
  readonly sourceDescriptionIncludedInAnnotatorFacingItem: false;
  readonly sourceUrlIncludedInAnnotatorFacingItem: false;
  readonly provenanceIncludedInAnnotatorFacingItem: false;
  readonly rightsMetadataIncludedInAnnotatorFacingItem: false;
  readonly storageMetadataIncludedInAnnotatorFacingItem: false;
  readonly captureRefIncludedInAnnotatorFacingItem: false;
  readonly canonicalAssetDigestIncludedInAnnotatorFacingItem: false;
  readonly partitionIncludedInAnnotatorFacingItem: false;
  readonly providerEvidenceIncludedInAnnotatorFacingItem: false;
  readonly suggestedLabelIncludedInAnnotatorFacingItem: false;
  readonly existingAnnotationIncludedInAnnotatorFacingItem: false;
  readonly embeddedAssetMetadataSanitizationPerformed: false;
  readonly deliverySurfaceMustNotExposeEmbeddedAssetMetadata: true;
  readonly humanFaceCountLabelEstablished: false;
  readonly partitionAssignmentAuthorized: false;
  readonly empiricalAdmissionAuthorized: false;
  readonly providerScoringAuthorized: false;
  readonly productionGeometryAuthorized: false;
  readonly authorityState: 'exact_canonical_asset_bound_to_opaque_annotation_item_no_human_label_or_partition';
  readonly bindingDigest: string;
}

export interface IndependentFaceAnnotationPacketPublicItemFRData07CV1 {
  readonly itemRef: string;
  readonly assetPath: string;
  readonly mediaType: IndependentFaceSourceAssetContentSignatureFRData07AV1;
}

export interface IndependentFaceAnnotationPacketAnnotatorManifestFRData07CV1 {
  readonly schemaVersion: 'fr-data07c-provider-blind-annotation-packet-manifest-v1';
  readonly packetRef: string;
  readonly taskConstruct: 'categorical_human_face_count_state';
  readonly labelVocabulary: readonly [
    'zero_human_faces',
    'one_human_face',
    'multiple_human_faces',
    'indeterminate',
  ];
  readonly instructions: readonly [
    'Inspect only the presented canonical image and choose exactly one label from labelVocabulary.',
    'Do not infer or report identity, demographics, emotion, attractiveness, health, personality, or physiognomic meaning.',
    'If the visible image does not support a reliable categorical human-face-count judgment, choose indeterminate.',
  ];
  readonly items: readonly IndependentFaceAnnotationPacketPublicItemFRData07CV1[];
}

export interface FrozenIndependentFaceAnnotationPacketFRData07CV1 {
  readonly schemaVersion: 'fr-data07c-provider-blind-annotation-packet-binding-v1';
  readonly packetRef: string;
  readonly sourceEvidenceManifestDigest: string;
  readonly itemBindings: readonly FrozenIndependentFaceAnnotationPacketItemBindingFRData07CV1[];
  readonly annotatorManifest: IndependentFaceAnnotationPacketAnnotatorManifestFRData07CV1;
  readonly annotatorManifestDigest: string;
  readonly packetDigest: string;
  readonly itemCount: number;
  readonly annotatorFacingManifestContainsOnlyAllowlistedFields: true;
  readonly exactCanonicalAssetBytesPreserved: true;
  readonly sourceMetadataExcludedFromAnnotatorFacingManifest: true;
  readonly partitionExcludedFromAnnotatorFacingManifest: true;
  readonly providerEvidenceExcludedFromAnnotatorFacingManifest: true;
  readonly suggestedLabelsExcludedFromAnnotatorFacingManifest: true;
  readonly existingAnnotationsExcludedFromAnnotatorFacingManifest: true;
  readonly annotationResponsesIncluded: false;
  readonly annotatorIdentityBindingIncluded: false;
  readonly annotationSessionBindingIncluded: false;
  readonly humanAnnotationEstablished: false;
  readonly annotationLedgerFrozen: false;
  readonly partitionAssignmentAuthorized: false;
  readonly empiricalAdmissionAuthorized: false;
  readonly providerScoringAuthorized: false;
  readonly productionGeometryAuthorized: false;
  readonly authorityState: 'provider_blind_annotation_packet_frozen_awaiting_real_human_annotation';
}

export interface IndependentFaceAnnotationPacketAuthorityFRData07CV1 {
  readonly schemaVersion: 'fr-data07c-v1';
  readonly authorityRef: 'authority.face.independent_face_annotation_packet.frdata07c';
  readonly authorityVersion: '0.1.0';
  readonly authorityState: 'provider_blind_annotation_packet_contract_defined_no_human_annotation';
  readonly upstreamSourceAssetSchemaRef: 'fr-data07a-independent-face-source-asset-record-v1';
  readonly upstreamStorageReceiptSchemaRef: 'fr-data07b-independent-face-source-asset-storage-receipt-v1';
  readonly upstreamRetrievalVerificationSchemaRef: 'fr-data07b-independent-face-source-asset-storage-retrieval-verification-v1';
  readonly downstreamHumanAnnotationSchemaRef: 'fr-data07-independent-face-ground-truth-v1';
  readonly protocol: {
    readonly exactFRData07ARecordVerificationRequired: true;
    readonly exactFRData07BReceiptVerificationRequired: true;
    readonly exactFRData07BRetrievalVerificationRequired: true;
    readonly canonicalAssetBytesRehashRequiredBeforePacketBinding: true;
    readonly packetMayTransformCanonicalAssetBytes: false;
    readonly annotatorFacingItemRefMustBeDeterministicallyOpaque: true;
    readonly annotatorFacingSourceMetadataAllowed: false;
    readonly annotatorFacingSourceFilenameAllowed: false;
    readonly annotatorFacingSourceDescriptionAllowed: false;
    readonly annotatorFacingSourceUrlAllowed: false;
    readonly annotatorFacingProvenanceAllowed: false;
    readonly annotatorFacingRightsMetadataAllowed: false;
    readonly annotatorFacingStorageMetadataAllowed: false;
    readonly annotatorFacingCaptureRefAllowed: false;
    readonly annotatorFacingCanonicalDigestAllowed: false;
    readonly annotatorFacingPartitionAllowed: false;
    readonly annotatorFacingProviderEvidenceAllowed: false;
    readonly annotatorFacingSuggestedLabelAllowed: false;
    readonly annotatorFacingExistingAnnotationsAllowed: false;
    readonly embeddedAssetMetadataMayBeSanitizedByChangingCanonicalBytes: false;
    readonly controlledDeliverySurfaceMustHideEmbeddedAssetMetadata: true;
    readonly labelVocabulary: readonly [
      'zero_human_faces',
      'one_human_face',
      'multiple_human_faces',
      'indeterminate',
    ];
    readonly minimumPacketItemsForEmpiricalAdmission: null;
    readonly minimumIndependentAnnotatorsPerCapture: null;
    readonly partitionAssignmentRule: null;
    readonly humanAnnotationAcceptanceCriterion: null;
    readonly empiricalAdmissionCriterion: null;
  };
  readonly authorityBoundary: {
    readonly packetGenerationMeansHumanAnnotationExists: false;
    readonly packetGenerationMeansGroundTruthLedgerFrozen: false;
    readonly packetItemCountMeansEmpiricalSufficiency: false;
    readonly exactByteBindingMeansHumanFaceCountLabelEstablished: false;
    readonly opaqueItemRefMeansAnnotatorWasActuallyBlind: false;
    readonly wrapperMetadataExclusionMeansEmbeddedAssetMetadataAbsent: false;
    readonly controlledDeliveryRequirementMeansDeliveryWasExternallyVerified: false;
    readonly packetGenerationMayAssignCalibrationOrHoldout: false;
    readonly packetGenerationMayDefineProviderOutcome: false;
    readonly packetGenerationMeansEmpiricalAdmissionAuthorized: false;
    readonly packetGenerationMeansProviderScoringAuthorized: false;
    readonly packetGenerationMeansProductionGeometryAuthorized: false;
  };
}

const SHA256 = /^sha256:[0-9a-f]{64}$/u;
const ITEM_INPUT_KEYS = Object.freeze(['schemaVersion', 'packetRef', 'canonicalAssetBytes'] as const);
const ITEM_BINDING_KEYS = Object.freeze([
  'schemaVersion', 'packetRef', 'itemRef', 'captureRef', 'sourceAssetRecordDigest', 'storageReceiptDigest',
  'retrievalVerificationDigest', 'canonicalAssetDigest', 'byteLength', 'mediaType', 'packetAssetPath',
  'canonicalAssetBytesRehashedForPacket', 'exactCanonicalAssetDigestMatch', 'exactCanonicalByteLengthMatch',
  'exactCanonicalAssetBytesPreserved', 'rawBytesEmbeddedInBindingRecord', 'sourceMetadataIncludedInAnnotatorFacingItem',
  'sourceFilenameIncludedInAnnotatorFacingItem', 'sourceDescriptionIncludedInAnnotatorFacingItem',
  'sourceUrlIncludedInAnnotatorFacingItem', 'provenanceIncludedInAnnotatorFacingItem',
  'rightsMetadataIncludedInAnnotatorFacingItem', 'storageMetadataIncludedInAnnotatorFacingItem',
  'captureRefIncludedInAnnotatorFacingItem', 'canonicalAssetDigestIncludedInAnnotatorFacingItem',
  'partitionIncludedInAnnotatorFacingItem', 'providerEvidenceIncludedInAnnotatorFacingItem',
  'suggestedLabelIncludedInAnnotatorFacingItem', 'existingAnnotationIncludedInAnnotatorFacingItem',
  'embeddedAssetMetadataSanitizationPerformed', 'deliverySurfaceMustNotExposeEmbeddedAssetMetadata',
  'humanFaceCountLabelEstablished', 'partitionAssignmentAuthorized', 'empiricalAdmissionAuthorized',
  'providerScoringAuthorized', 'productionGeometryAuthorized', 'authorityState', 'bindingDigest',
] as const);
const PUBLIC_ITEM_KEYS = Object.freeze(['itemRef', 'assetPath', 'mediaType'] as const);
const ANNOTATOR_MANIFEST_KEYS = Object.freeze([
  'schemaVersion', 'packetRef', 'taskConstruct', 'labelVocabulary', 'instructions', 'items',
] as const);
const FROZEN_PACKET_KEYS = Object.freeze([
  'schemaVersion', 'packetRef', 'sourceEvidenceManifestDigest', 'itemBindings', 'annotatorManifest',
  'annotatorManifestDigest', 'packetDigest', 'itemCount', 'annotatorFacingManifestContainsOnlyAllowlistedFields',
  'exactCanonicalAssetBytesPreserved', 'sourceMetadataExcludedFromAnnotatorFacingManifest',
  'partitionExcludedFromAnnotatorFacingManifest', 'providerEvidenceExcludedFromAnnotatorFacingManifest',
  'suggestedLabelsExcludedFromAnnotatorFacingManifest', 'existingAnnotationsExcludedFromAnnotatorFacingManifest',
  'annotationResponsesIncluded', 'annotatorIdentityBindingIncluded', 'annotationSessionBindingIncluded',
  'humanAnnotationEstablished', 'annotationLedgerFrozen', 'partitionAssignmentAuthorized',
  'empiricalAdmissionAuthorized', 'providerScoringAuthorized', 'productionGeometryAuthorized', 'authorityState',
] as const);
const LABELS = Object.freeze([
  'zero_human_faces',
  'one_human_face',
  'multiple_human_faces',
  'indeterminate',
] as const);
const INSTRUCTIONS = Object.freeze([
  'Inspect only the presented canonical image and choose exactly one label from labelVocabulary.',
  'Do not infer or report identity, demographics, emotion, attractiveness, health, personality, or physiognomic meaning.',
  'If the visible image does not support a reliable categorical human-face-count judgment, choose indeterminate.',
] as const);

export const INDEPENDENT_FACE_ANNOTATION_PACKET_AUTHORITY_FRDATA07C:
IndependentFaceAnnotationPacketAuthorityFRData07CV1 = Object.freeze({
  schemaVersion: 'fr-data07c-v1',
  authorityRef: 'authority.face.independent_face_annotation_packet.frdata07c',
  authorityVersion: '0.1.0',
  authorityState: 'provider_blind_annotation_packet_contract_defined_no_human_annotation',
  upstreamSourceAssetSchemaRef: 'fr-data07a-independent-face-source-asset-record-v1',
  upstreamStorageReceiptSchemaRef: 'fr-data07b-independent-face-source-asset-storage-receipt-v1',
  upstreamRetrievalVerificationSchemaRef: 'fr-data07b-independent-face-source-asset-storage-retrieval-verification-v1',
  downstreamHumanAnnotationSchemaRef: 'fr-data07-independent-face-ground-truth-v1',
  protocol: Object.freeze({
    exactFRData07ARecordVerificationRequired: true,
    exactFRData07BReceiptVerificationRequired: true,
    exactFRData07BRetrievalVerificationRequired: true,
    canonicalAssetBytesRehashRequiredBeforePacketBinding: true,
    packetMayTransformCanonicalAssetBytes: false,
    annotatorFacingItemRefMustBeDeterministicallyOpaque: true,
    annotatorFacingSourceMetadataAllowed: false,
    annotatorFacingSourceFilenameAllowed: false,
    annotatorFacingSourceDescriptionAllowed: false,
    annotatorFacingSourceUrlAllowed: false,
    annotatorFacingProvenanceAllowed: false,
    annotatorFacingRightsMetadataAllowed: false,
    annotatorFacingStorageMetadataAllowed: false,
    annotatorFacingCaptureRefAllowed: false,
    annotatorFacingCanonicalDigestAllowed: false,
    annotatorFacingPartitionAllowed: false,
    annotatorFacingProviderEvidenceAllowed: false,
    annotatorFacingSuggestedLabelAllowed: false,
    annotatorFacingExistingAnnotationsAllowed: false,
    embeddedAssetMetadataMayBeSanitizedByChangingCanonicalBytes: false,
    controlledDeliverySurfaceMustHideEmbeddedAssetMetadata: true,
    labelVocabulary: LABELS,
    minimumPacketItemsForEmpiricalAdmission: null,
    minimumIndependentAnnotatorsPerCapture: null,
    partitionAssignmentRule: null,
    humanAnnotationAcceptanceCriterion: null,
    empiricalAdmissionCriterion: null,
  }),
  authorityBoundary: Object.freeze({
    packetGenerationMeansHumanAnnotationExists: false,
    packetGenerationMeansGroundTruthLedgerFrozen: false,
    packetItemCountMeansEmpiricalSufficiency: false,
    exactByteBindingMeansHumanFaceCountLabelEstablished: false,
    opaqueItemRefMeansAnnotatorWasActuallyBlind: false,
    wrapperMetadataExclusionMeansEmbeddedAssetMetadataAbsent: false,
    controlledDeliveryRequirementMeansDeliveryWasExternallyVerified: false,
    packetGenerationMayAssignCalibrationOrHoldout: false,
    packetGenerationMayDefineProviderOutcome: false,
    packetGenerationMeansEmpiricalAdmissionAuthorized: false,
    packetGenerationMeansProviderScoringAuthorized: false,
    packetGenerationMeansProductionGeometryAuthorized: false,
  }),
});

function fail(message: string): never {
  throw new FaceAuthorityValidationError(`FR-DATA-07C ${message}`);
}

function nonEmpty(value: string, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) fail(`${label} must be non-empty.`);
  return value;
}

function canonicalSha256(value: string, label: string): string {
  if (!SHA256.test(value)) fail(`${label} must use canonical lowercase sha256:<64-hex> form.`);
  return value;
}

function rejectUnknownKeys(value: object, allowedKeys: readonly string[], label: string): void {
  const allowed = new Set<string>(allowedKeys);
  for (const key of Object.keys(value)) if (!allowed.has(key)) fail(`${label} contains undeclared field ${key}.`);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => canonicalize(entry));
  if (value !== null && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    const normalized: Record<string, unknown> = {};
    for (const key of Object.keys(object).sort()) {
      const child = object[key];
      if (child === undefined) fail('metadata cannot contain undefined values.');
      normalized[key] = canonicalize(child);
    }
    return normalized;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) fail('metadata cannot contain non-finite numbers.');
  if (typeof value === 'undefined' || typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') {
    fail('metadata must be JSON-compatible.');
  }
  return value;
}

function metadataDigest(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(canonicalize(value)), 'utf8').digest('hex')}`;
}

function extensionFor(mediaType: IndependentFaceSourceAssetContentSignatureFRData07AV1): 'png' | 'jpg' | 'webp' {
  if (mediaType === 'image/png') return 'png';
  if (mediaType === 'image/jpeg') return 'jpg';
  if (mediaType === 'image/webp') return 'webp';
  fail('unsupported packet media type.');
}

function deterministicItemRef(packetRef: string, canonicalAssetDigest: string): string {
  const digest = createHash('sha256').update(`${packetRef}\u0000${canonicalAssetDigest}`, 'utf8').digest('hex');
  return `item-${digest}`;
}

function publicItem(binding: FrozenIndependentFaceAnnotationPacketItemBindingFRData07CV1): IndependentFaceAnnotationPacketPublicItemFRData07CV1 {
  return Object.freeze({ itemRef: binding.itemRef, assetPath: binding.packetAssetPath, mediaType: binding.mediaType });
}

function expectedManifest(packetRef: string, bindings: readonly FrozenIndependentFaceAnnotationPacketItemBindingFRData07CV1[]):
IndependentFaceAnnotationPacketAnnotatorManifestFRData07CV1 {
  return Object.freeze({
    schemaVersion: 'fr-data07c-provider-blind-annotation-packet-manifest-v1',
    packetRef,
    taskConstruct: 'categorical_human_face_count_state',
    labelVocabulary: LABELS,
    instructions: INSTRUCTIONS,
    items: Object.freeze([...bindings].sort((a, b) => a.itemRef.localeCompare(b.itemRef)).map(publicItem)),
  });
}

export function validateIndependentFaceAnnotationPacketAuthorityFRData07C(
  authority: IndependentFaceAnnotationPacketAuthorityFRData07CV1 = INDEPENDENT_FACE_ANNOTATION_PACKET_AUTHORITY_FRDATA07C,
): IndependentFaceAnnotationPacketAuthorityFRData07CV1 {
  if (
    authority.schemaVersion !== 'fr-data07c-v1' ||
    authority.authorityRef !== 'authority.face.independent_face_annotation_packet.frdata07c' ||
    authority.authorityVersion !== '0.1.0' ||
    authority.authorityState !== 'provider_blind_annotation_packet_contract_defined_no_human_annotation' ||
    authority.upstreamSourceAssetSchemaRef !== 'fr-data07a-independent-face-source-asset-record-v1' ||
    authority.upstreamStorageReceiptSchemaRef !== 'fr-data07b-independent-face-source-asset-storage-receipt-v1' ||
    authority.upstreamRetrievalVerificationSchemaRef !== 'fr-data07b-independent-face-source-asset-storage-retrieval-verification-v1' ||
    authority.downstreamHumanAnnotationSchemaRef !== 'fr-data07-independent-face-ground-truth-v1'
  ) fail('authority identity/upstream/downstream schema drift.');
  const protocol = authority.protocol;
  if (
    protocol.exactFRData07ARecordVerificationRequired !== true ||
    protocol.exactFRData07BReceiptVerificationRequired !== true ||
    protocol.exactFRData07BRetrievalVerificationRequired !== true ||
    protocol.canonicalAssetBytesRehashRequiredBeforePacketBinding !== true ||
    protocol.packetMayTransformCanonicalAssetBytes !== false ||
    protocol.annotatorFacingItemRefMustBeDeterministicallyOpaque !== true ||
    protocol.annotatorFacingSourceMetadataAllowed !== false ||
    protocol.annotatorFacingSourceFilenameAllowed !== false ||
    protocol.annotatorFacingSourceDescriptionAllowed !== false ||
    protocol.annotatorFacingSourceUrlAllowed !== false ||
    protocol.annotatorFacingProvenanceAllowed !== false ||
    protocol.annotatorFacingRightsMetadataAllowed !== false ||
    protocol.annotatorFacingStorageMetadataAllowed !== false ||
    protocol.annotatorFacingCaptureRefAllowed !== false ||
    protocol.annotatorFacingCanonicalDigestAllowed !== false ||
    protocol.annotatorFacingPartitionAllowed !== false ||
    protocol.annotatorFacingProviderEvidenceAllowed !== false ||
    protocol.annotatorFacingSuggestedLabelAllowed !== false ||
    protocol.annotatorFacingExistingAnnotationsAllowed !== false ||
    protocol.embeddedAssetMetadataMayBeSanitizedByChangingCanonicalBytes !== false ||
    protocol.controlledDeliverySurfaceMustHideEmbeddedAssetMetadata !== true
  ) fail('protocol blindness/exact-byte boundary drift.');
  if (JSON.stringify(protocol.labelVocabulary) !== JSON.stringify(LABELS)) fail('label vocabulary drift.');
  if (
    protocol.minimumPacketItemsForEmpiricalAdmission !== null ||
    protocol.minimumIndependentAnnotatorsPerCapture !== null ||
    protocol.partitionAssignmentRule !== null ||
    protocol.humanAnnotationAcceptanceCriterion !== null ||
    protocol.empiricalAdmissionCriterion !== null
  ) fail('empirical/staffing/partition criteria must remain unset.');
  if (Object.values(authority.authorityBoundary).some((value) => value !== false)) fail('authority boundary must remain fully fail-closed.');
  return authority;
}

export function freezeIndependentFaceAnnotationPacketItemBindingFRData07C(
  sourceRecord: FrozenIndependentFaceSourceAssetRecordFRData07AV1,
  receipt: FrozenIndependentFaceSourceAssetStorageReceiptFRData07BV1,
  retrieval: FrozenIndependentFaceSourceAssetStorageRetrievalVerificationFRData07BV1,
  input: IndependentFaceAnnotationPacketItemInputFRData07CV1,
): FrozenIndependentFaceAnnotationPacketItemBindingFRData07CV1 {
  validateIndependentFaceAnnotationPacketAuthorityFRData07C();
  verifyFrozenIndependentFaceSourceAssetRecordFRData07A(sourceRecord);
  verifyFrozenIndependentFaceSourceAssetStorageReceiptFRData07B(sourceRecord, receipt);
  verifyFrozenIndependentFaceSourceAssetStorageRetrievalVerificationFRData07B(sourceRecord, receipt, retrieval);
  rejectUnknownKeys(input, ITEM_INPUT_KEYS, 'annotation packet item input');
  if (input.schemaVersion !== 'fr-data07c-independent-face-annotation-packet-item-input-v1') fail('annotation packet item input schema drift.');
  nonEmpty(input.packetRef, 'packetRef');
  if (!(input.canonicalAssetBytes instanceof Uint8Array) || input.canonicalAssetBytes.length === 0) {
    fail('canonicalAssetBytes must be a non-empty Uint8Array.');
  }
  const digest = computeIndependentFaceSourceAssetDigestFRData07A(input.canonicalAssetBytes);
  if (digest !== sourceRecord.canonicalAssetDigest) fail('packet candidate byte digest does not match FR-DATA-07A canonical asset digest.');
  if (input.canonicalAssetBytes.length !== sourceRecord.byteLength) fail('packet candidate byte length does not match FR-DATA-07A byte length.');
  if (retrieval.retrievedByteDigest !== digest || retrieval.retrievedByteLength !== input.canonicalAssetBytes.length) {
    fail('packet candidate bytes do not match FR-DATA-07B retrieval verification.');
  }
  const itemRef = deterministicItemRef(input.packetRef, digest);
  const packetAssetPath = `assets/${itemRef}.${extensionFor(sourceRecord.contentSignature)}`;
  const material = {
    schemaVersion: 'fr-data07c-independent-face-annotation-packet-item-binding-v1' as const,
    packetRef: input.packetRef,
    itemRef,
    captureRef: sourceRecord.captureRef,
    sourceAssetRecordDigest: sourceRecord.recordDigest,
    storageReceiptDigest: receipt.receiptDigest,
    retrievalVerificationDigest: retrieval.verificationDigest,
    canonicalAssetDigest: digest,
    byteLength: input.canonicalAssetBytes.length,
    mediaType: sourceRecord.contentSignature,
    packetAssetPath,
    canonicalAssetBytesRehashedForPacket: true as const,
    exactCanonicalAssetDigestMatch: true as const,
    exactCanonicalByteLengthMatch: true as const,
    exactCanonicalAssetBytesPreserved: true as const,
    rawBytesEmbeddedInBindingRecord: false as const,
    sourceMetadataIncludedInAnnotatorFacingItem: false as const,
    sourceFilenameIncludedInAnnotatorFacingItem: false as const,
    sourceDescriptionIncludedInAnnotatorFacingItem: false as const,
    sourceUrlIncludedInAnnotatorFacingItem: false as const,
    provenanceIncludedInAnnotatorFacingItem: false as const,
    rightsMetadataIncludedInAnnotatorFacingItem: false as const,
    storageMetadataIncludedInAnnotatorFacingItem: false as const,
    captureRefIncludedInAnnotatorFacingItem: false as const,
    canonicalAssetDigestIncludedInAnnotatorFacingItem: false as const,
    partitionIncludedInAnnotatorFacingItem: false as const,
    providerEvidenceIncludedInAnnotatorFacingItem: false as const,
    suggestedLabelIncludedInAnnotatorFacingItem: false as const,
    existingAnnotationIncludedInAnnotatorFacingItem: false as const,
    embeddedAssetMetadataSanitizationPerformed: false as const,
    deliverySurfaceMustNotExposeEmbeddedAssetMetadata: true as const,
    humanFaceCountLabelEstablished: false as const,
    partitionAssignmentAuthorized: false as const,
    empiricalAdmissionAuthorized: false as const,
    providerScoringAuthorized: false as const,
    productionGeometryAuthorized: false as const,
    authorityState: 'exact_canonical_asset_bound_to_opaque_annotation_item_no_human_label_or_partition' as const,
  };
  return Object.freeze({ ...material, bindingDigest: metadataDigest(material) });
}

export function verifyFrozenIndependentFaceAnnotationPacketItemBindingFRData07C(
  binding: FrozenIndependentFaceAnnotationPacketItemBindingFRData07CV1,
): FrozenIndependentFaceAnnotationPacketItemBindingFRData07CV1 {
  validateIndependentFaceAnnotationPacketAuthorityFRData07C();
  rejectUnknownKeys(binding, ITEM_BINDING_KEYS, 'frozen annotation packet item binding');
  if (binding.schemaVersion !== 'fr-data07c-independent-face-annotation-packet-item-binding-v1') fail('item binding schema drift.');
  nonEmpty(binding.packetRef, 'binding.packetRef');
  if (!/^item-[0-9a-f]{64}$/u.test(binding.itemRef)) fail('itemRef must use deterministic opaque item-<64-hex> form.');
  nonEmpty(binding.captureRef, 'binding.captureRef');
  canonicalSha256(binding.sourceAssetRecordDigest, 'binding.sourceAssetRecordDigest');
  canonicalSha256(binding.storageReceiptDigest, 'binding.storageReceiptDigest');
  canonicalSha256(binding.retrievalVerificationDigest, 'binding.retrievalVerificationDigest');
  canonicalSha256(binding.canonicalAssetDigest, 'binding.canonicalAssetDigest');
  canonicalSha256(binding.bindingDigest, 'binding.bindingDigest');
  if (!Number.isInteger(binding.byteLength) || binding.byteLength <= 0) fail('binding.byteLength must be a positive integer.');
  const expectedItemRef = deterministicItemRef(binding.packetRef, binding.canonicalAssetDigest);
  if (binding.itemRef !== expectedItemRef) fail('deterministic opaque itemRef mismatch.');
  const expectedPath = `assets/${binding.itemRef}.${extensionFor(binding.mediaType)}`;
  if (binding.packetAssetPath !== expectedPath) fail('packetAssetPath drift.');
  if (
    binding.canonicalAssetBytesRehashedForPacket !== true ||
    binding.exactCanonicalAssetDigestMatch !== true ||
    binding.exactCanonicalByteLengthMatch !== true ||
    binding.exactCanonicalAssetBytesPreserved !== true ||
    binding.rawBytesEmbeddedInBindingRecord !== false ||
    binding.sourceMetadataIncludedInAnnotatorFacingItem !== false ||
    binding.sourceFilenameIncludedInAnnotatorFacingItem !== false ||
    binding.sourceDescriptionIncludedInAnnotatorFacingItem !== false ||
    binding.sourceUrlIncludedInAnnotatorFacingItem !== false ||
    binding.provenanceIncludedInAnnotatorFacingItem !== false ||
    binding.rightsMetadataIncludedInAnnotatorFacingItem !== false ||
    binding.storageMetadataIncludedInAnnotatorFacingItem !== false ||
    binding.captureRefIncludedInAnnotatorFacingItem !== false ||
    binding.canonicalAssetDigestIncludedInAnnotatorFacingItem !== false ||
    binding.partitionIncludedInAnnotatorFacingItem !== false ||
    binding.providerEvidenceIncludedInAnnotatorFacingItem !== false ||
    binding.suggestedLabelIncludedInAnnotatorFacingItem !== false ||
    binding.existingAnnotationIncludedInAnnotatorFacingItem !== false ||
    binding.embeddedAssetMetadataSanitizationPerformed !== false ||
    binding.deliverySurfaceMustNotExposeEmbeddedAssetMetadata !== true ||
    binding.humanFaceCountLabelEstablished !== false ||
    binding.partitionAssignmentAuthorized !== false ||
    binding.empiricalAdmissionAuthorized !== false ||
    binding.providerScoringAuthorized !== false ||
    binding.productionGeometryAuthorized !== false ||
    binding.authorityState !== 'exact_canonical_asset_bound_to_opaque_annotation_item_no_human_label_or_partition'
  ) fail('item binding authority/blindness boundary drift.');
  const { bindingDigest, ...material } = binding;
  if (metadataDigest(material) !== bindingDigest) fail('item binding metadata digest mismatch.');
  return binding;
}

export function freezeIndependentFaceAnnotationPacketFRData07C(
  packetRef: string,
  sourceEvidenceManifestDigest: string,
  itemBindings: readonly FrozenIndependentFaceAnnotationPacketItemBindingFRData07CV1[],
): FrozenIndependentFaceAnnotationPacketFRData07CV1 {
  validateIndependentFaceAnnotationPacketAuthorityFRData07C();
  nonEmpty(packetRef, 'packetRef');
  canonicalSha256(sourceEvidenceManifestDigest, 'sourceEvidenceManifestDigest');
  if (!Array.isArray(itemBindings) || itemBindings.length === 0) fail('packet requires at least one bound item as a structural requirement, not an empirical minimum.');
  const bindings = [...itemBindings].map(verifyFrozenIndependentFaceAnnotationPacketItemBindingFRData07C)
    .sort((a, b) => a.itemRef.localeCompare(b.itemRef));
  for (const binding of bindings) if (binding.packetRef !== packetRef) fail('item binding packetRef mismatch.');
  for (const field of ['itemRef', 'captureRef', 'canonicalAssetDigest', 'packetAssetPath'] as const) {
    const values = bindings.map((binding) => binding[field]);
    if (new Set(values).size !== values.length) fail(`duplicate ${field} in packet.`);
  }
  const manifest = expectedManifest(packetRef, bindings);
  const annotatorManifestDigest = metadataDigest(manifest);
  const material = {
    schemaVersion: 'fr-data07c-provider-blind-annotation-packet-binding-v1' as const,
    packetRef,
    sourceEvidenceManifestDigest,
    itemBindings: Object.freeze(bindings),
    annotatorManifest: manifest,
    annotatorManifestDigest,
    itemCount: bindings.length,
    annotatorFacingManifestContainsOnlyAllowlistedFields: true as const,
    exactCanonicalAssetBytesPreserved: true as const,
    sourceMetadataExcludedFromAnnotatorFacingManifest: true as const,
    partitionExcludedFromAnnotatorFacingManifest: true as const,
    providerEvidenceExcludedFromAnnotatorFacingManifest: true as const,
    suggestedLabelsExcludedFromAnnotatorFacingManifest: true as const,
    existingAnnotationsExcludedFromAnnotatorFacingManifest: true as const,
    annotationResponsesIncluded: false as const,
    annotatorIdentityBindingIncluded: false as const,
    annotationSessionBindingIncluded: false as const,
    humanAnnotationEstablished: false as const,
    annotationLedgerFrozen: false as const,
    partitionAssignmentAuthorized: false as const,
    empiricalAdmissionAuthorized: false as const,
    providerScoringAuthorized: false as const,
    productionGeometryAuthorized: false as const,
    authorityState: 'provider_blind_annotation_packet_frozen_awaiting_real_human_annotation' as const,
  };
  return Object.freeze({ ...material, packetDigest: metadataDigest(material) });
}

export function verifyFrozenIndependentFaceAnnotationPacketFRData07C(
  packet: FrozenIndependentFaceAnnotationPacketFRData07CV1,
): FrozenIndependentFaceAnnotationPacketFRData07CV1 {
  validateIndependentFaceAnnotationPacketAuthorityFRData07C();
  rejectUnknownKeys(packet, FROZEN_PACKET_KEYS, 'frozen annotation packet');
  if (packet.schemaVersion !== 'fr-data07c-provider-blind-annotation-packet-binding-v1') fail('frozen packet schema drift.');
  nonEmpty(packet.packetRef, 'packet.packetRef');
  canonicalSha256(packet.sourceEvidenceManifestDigest, 'packet.sourceEvidenceManifestDigest');
  canonicalSha256(packet.annotatorManifestDigest, 'packet.annotatorManifestDigest');
  canonicalSha256(packet.packetDigest, 'packet.packetDigest');
  if (!Number.isInteger(packet.itemCount) || packet.itemCount <= 0 || packet.itemCount !== packet.itemBindings.length) fail('packet itemCount drift.');
  const bindings = [...packet.itemBindings].map(verifyFrozenIndependentFaceAnnotationPacketItemBindingFRData07C)
    .sort((a, b) => a.itemRef.localeCompare(b.itemRef));
  if (bindings.some((binding) => binding.packetRef !== packet.packetRef)) fail('persisted item binding packetRef mismatch.');
  for (const field of ['itemRef', 'captureRef', 'canonicalAssetDigest', 'packetAssetPath'] as const) {
    const values = bindings.map((binding) => binding[field]);
    if (new Set(values).size !== values.length) fail(`duplicate ${field} in frozen packet.`);
  }
  rejectUnknownKeys(packet.annotatorManifest, ANNOTATOR_MANIFEST_KEYS, 'annotator-facing manifest');
  if (packet.annotatorManifest.schemaVersion !== 'fr-data07c-provider-blind-annotation-packet-manifest-v1') fail('annotator-facing manifest schema drift.');
  if (packet.annotatorManifest.packetRef !== packet.packetRef) fail('annotator-facing manifest packetRef mismatch.');
  if (packet.annotatorManifest.taskConstruct !== 'categorical_human_face_count_state') fail('task construct drift.');
  if (JSON.stringify(packet.annotatorManifest.labelVocabulary) !== JSON.stringify(LABELS)) fail('annotator-facing label vocabulary drift.');
  if (JSON.stringify(packet.annotatorManifest.instructions) !== JSON.stringify(INSTRUCTIONS)) fail('annotator-facing instructions drift.');
  for (const item of packet.annotatorManifest.items) rejectUnknownKeys(item, PUBLIC_ITEM_KEYS, 'annotator-facing item');
  const expected = expectedManifest(packet.packetRef, bindings);
  if (JSON.stringify(packet.annotatorManifest) !== JSON.stringify(expected)) fail('annotator-facing manifest content/order drift.');
  if (metadataDigest(packet.annotatorManifest) !== packet.annotatorManifestDigest) fail('annotator-facing manifest digest mismatch.');
  if (
    packet.annotatorFacingManifestContainsOnlyAllowlistedFields !== true ||
    packet.exactCanonicalAssetBytesPreserved !== true ||
    packet.sourceMetadataExcludedFromAnnotatorFacingManifest !== true ||
    packet.partitionExcludedFromAnnotatorFacingManifest !== true ||
    packet.providerEvidenceExcludedFromAnnotatorFacingManifest !== true ||
    packet.suggestedLabelsExcludedFromAnnotatorFacingManifest !== true ||
    packet.existingAnnotationsExcludedFromAnnotatorFacingManifest !== true ||
    packet.annotationResponsesIncluded !== false ||
    packet.annotatorIdentityBindingIncluded !== false ||
    packet.annotationSessionBindingIncluded !== false ||
    packet.humanAnnotationEstablished !== false ||
    packet.annotationLedgerFrozen !== false ||
    packet.partitionAssignmentAuthorized !== false ||
    packet.empiricalAdmissionAuthorized !== false ||
    packet.providerScoringAuthorized !== false ||
    packet.productionGeometryAuthorized !== false ||
    packet.authorityState !== 'provider_blind_annotation_packet_frozen_awaiting_real_human_annotation'
  ) fail('frozen packet authority/blindness boundary drift.');
  const { packetDigest, ...material } = packet;
  if (metadataDigest(material) !== packetDigest) fail('frozen packet metadata digest mismatch.');
  return packet;
}

export function verifyIndependentFaceAnnotationPacketAssetBytesFRData07C(
  binding: FrozenIndependentFaceAnnotationPacketItemBindingFRData07CV1,
  bytes: Uint8Array,
): true {
  verifyFrozenIndependentFaceAnnotationPacketItemBindingFRData07C(binding);
  if (!(bytes instanceof Uint8Array) || bytes.length === 0) fail('packet asset bytes must be a non-empty Uint8Array.');
  const digest = computeIndependentFaceSourceAssetDigestFRData07A(bytes);
  if (digest !== binding.canonicalAssetDigest) fail('packet asset byte digest mismatch.');
  if (bytes.length !== binding.byteLength) fail('packet asset byte length mismatch.');
  return true;
}

export function assertIndependentFaceAnnotationPacketReadyForEmpiricalAdmissionFRData07C(): never {
  fail('packet preparation cannot authorize empirical admission; real provider-blind human annotations, frozen FR-DATA-07 ledger, partition governance, and downstream adjudication remain required.');
}
