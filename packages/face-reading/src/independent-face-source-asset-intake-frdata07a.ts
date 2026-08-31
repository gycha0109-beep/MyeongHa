import { createHash } from 'node:crypto';
import { inspectImageByteDimensionsFRData02 } from './image-byte-dimensions-frdata02.js';
import {
  validateIndependentFaceGroundTruthDatasetFRData07,
  type IndependentFaceGroundTruthDatasetFRData07V1,
} from './independent-face-ground-truth-frdata07.js';
import { FaceAuthorityValidationError } from './validation.js';

export type IndependentFaceSourceAssetRightsReviewStateFRData07AV1 =
  | 'source_rights_basis_recorded_not_legally_adjudicated'
  | 'source_rights_restrictions_or_uncertainty_recorded_not_legally_adjudicated';

export type IndependentFaceSourceAssetContentSignatureFRData07AV1 = 'image/png' | 'image/jpeg' | 'image/webp';
export type IndependentFaceSourceAssetDimensionParserFRData07AV1 = 'png_ihdr' | 'jpeg_sof' | 'webp_vp8x' | 'webp_vp8l' | 'webp_vp8';
export type IndependentFaceSourceReportedDimensionStateFRData07AV1 = 'not_supplied' | 'verified_exact_match';

export interface IndependentFaceSourceAssetIntakeInputFRData07AV1 {
  readonly schemaVersion: 'fr-data07a-independent-face-source-asset-intake-v1';
  readonly acquisitionRef: string;
  readonly captureRef: string;
  readonly sourceProvenanceRef: string;
  readonly sourceInstanceRef: string;
  readonly sourcePageUrl: string;
  readonly sourcePageRevisionRef: string | null;
  readonly sourceAssetUrl: string;
  readonly declaredCanonicalAssetDigest: string;
  readonly bytes: Uint8Array;
  readonly sourceReportedWidth: number | null;
  readonly sourceReportedHeight: number | null;
  readonly rightsBasisText: string;
  readonly rightsEvidenceRefs: readonly string[];
  readonly rightsReviewState: IndependentFaceSourceAssetRightsReviewStateFRData07AV1;
  readonly knownUseRestrictionNotes: readonly string[];
  readonly privacySubjectRiskNotes: readonly string[];
  readonly derivativeOfSourceInstanceRef: string | null;
  readonly acquiredAt: string;
}

export interface FrozenIndependentFaceSourceAssetRecordFRData07AV1 {
  readonly schemaVersion: 'fr-data07a-independent-face-source-asset-record-v1';
  readonly acquisitionRef: string;
  readonly captureRef: string;
  readonly sourceProvenanceRef: string;
  readonly sourceInstanceRef: string;
  readonly sourcePageUrl: string;
  readonly sourcePageRevisionRef: string | null;
  readonly sourceAssetUrl: string;
  readonly canonicalAssetDigest: string;
  readonly byteLength: number;
  readonly contentSignature: IndependentFaceSourceAssetContentSignatureFRData07AV1;
  readonly parserVariant: IndependentFaceSourceAssetDimensionParserFRData07AV1;
  readonly encodedWidth: number;
  readonly encodedHeight: number;
  readonly sourceReportedWidth: number | null;
  readonly sourceReportedHeight: number | null;
  readonly sourceReportedDimensionState: IndependentFaceSourceReportedDimensionStateFRData07AV1;
  readonly rightsBasisText: string;
  readonly rightsEvidenceRefs: readonly string[];
  readonly rightsReviewState: IndependentFaceSourceAssetRightsReviewStateFRData07AV1;
  readonly knownUseRestrictionNotes: readonly string[];
  readonly privacySubjectRiskNotes: readonly string[];
  readonly derivativeOfSourceInstanceRef: string | null;
  readonly acquiredAt: string;
  readonly exactByteDigestVerificationPerformedAtIntake: true;
  readonly imageHeaderInspectionPerformedAtIntake: true;
  readonly intakeVerificationReperformedByFrozenVerifier: false;
  readonly rawBytesRetainedByFrozenRecord: false;
  readonly sourceAssetUrlCryptographicallyAuthenticatedByThisRecord: false;
  readonly providedBytesProvenToOriginateFromSourceAssetUrl: false;
  readonly rightsLegallyAdjudicated: false;
  readonly privacySubjectRiskIndependentlyAdjudicated: false;
  readonly humanFaceCountLabelEstablished: false;
  readonly partitionAssignmentAuthorized: false;
  readonly empiricalAdmissionAuthorized: false;
  readonly providerScoringAuthorized: false;
  readonly productionGeometryAuthorized: false;
  readonly authorityState: 'exact_bytes_digest_and_image_header_verified_at_intake_provenance_metadata_recorded_not_externally_authenticated';
  readonly recordDigest: string;
}

export interface IndependentFaceSourceAssetBindingReportFRData07AV1 {
  readonly schemaVersion: 'fr-data07a-independent-face-source-asset-binding-report-v1';
  readonly datasetRef: string;
  readonly captureCount: number;
  readonly sourceAssetRecordCount: number;
  readonly captureCoverageComplete: true;
  readonly canonicalAssetDigestBindingsExact: true;
  readonly sourceProvenanceBindingsExact: true;
  readonly sourceInstanceBindingsExact: true;
  readonly sourceAssetByteVerificationRecordedAtIntake: true;
  readonly sourceAssetByteVerificationReperformedByBinding: false;
  readonly sourceTransportAuthenticated: false;
  readonly rightsLegallyAdjudicated: false;
  readonly privacySubjectRiskIndependentlyAdjudicated: false;
  readonly humanFaceCountLabelsEstablishedBySourceMetadata: false;
  readonly empiricalAdmissionAuthorized: false;
  readonly providerScoringAuthorized: false;
  readonly productionGeometryAuthorized: false;
}

export interface IndependentFaceSourceAssetIntakeAuthorityFRData07AV1 {
  readonly schemaVersion: 'fr-data07a-v1';
  readonly authorityRef: 'authority.face.independent_face_source_asset_intake.frdata07a';
  readonly authorityVersion: '0.1.0';
  readonly authorityState: 'source_asset_byte_and_provenance_binding_contract_defined_no_real_asset_admission';
  readonly upstreamDatasetSchemaRef: 'fr-data07-independent-face-ground-truth-v1';
  readonly protocol: {
    readonly exactProvidedBytesSha256MatchRequired: true;
    readonly supportedImageHeaderInspectionRequired: true;
    readonly sourceReportedDimensionsWhenSuppliedMustExactlyMatchBytes: true;
    readonly absoluteHttpOrHttpsSourceUrlsRequired: true;
    readonly rightsEvidenceRefsRequired: true;
    readonly privacySubjectRiskScreenRecordRequired: true;
    readonly exactDatasetCaptureBindingRequired: true;
    readonly frozenRecordRetainsRawBytes: false;
    readonly frozenVerifierReperformsByteVerification: false;
    readonly sourceMetadataThatCouldHintLabelMayBeIncludedInHumanAnnotationPacket: false;
    readonly filenameOrSourceDescriptionMayDefineHumanFaceCountLabel: false;
    readonly sourceUrlMayProveByteOriginWithoutExternalAuthentication: false;
    readonly rightsMetadataMayConstituteLegalAdjudication: false;
    readonly rightsMetadataMayConstitutePrivacyClearance: false;
    readonly minimumAssetsForEmpiricalAdmission: null;
    readonly acceptedRightsBasis: null;
    readonly privacyRiskAcceptanceCriterion: null;
  };
  readonly authorityBoundary: {
    readonly byteDigestMatchMeansSourceTransportAuthenticated: false;
    readonly sourcePagePresenceMeansAssetOriginAuthenticated: false;
    readonly frozenMetadataDigestMeansBytesReverified: false;
    readonly rightsBasisTextMeansRightsLegallyAdjudicated: false;
    readonly rightsEvidencePresenceMeansRightsLegallyAdjudicated: false;
    readonly privacyRiskNotesMeanPrivacyClearance: false;
    readonly sourceFilenameMeansHumanFaceCountLabel: false;
    readonly sourceDescriptionMeansHumanFaceCountLabel: false;
    readonly sourceMetadataMayAssignCalibrationOrHoldout: false;
    readonly sourceMetadataMayDefineProviderOutcome: false;
    readonly exactByteBindingMeansEmpiricalAdmissionAuthorized: false;
    readonly exactByteBindingMeansProviderScoringAuthorized: false;
    readonly captureQualityAuthorityValidated: false;
    readonly anatomicalLandmarkAuthorityValidated: false;
    readonly traditionalSemanticAuthorityValidated: false;
    readonly productionGeometryAuthorized: false;
  };
}

const SHA256 = /^sha256:[0-9a-f]{64}$/u;
const INPUT_KEYS = Object.freeze([
  'schemaVersion', 'acquisitionRef', 'captureRef', 'sourceProvenanceRef', 'sourceInstanceRef',
  'sourcePageUrl', 'sourcePageRevisionRef', 'sourceAssetUrl', 'declaredCanonicalAssetDigest', 'bytes',
  'sourceReportedWidth', 'sourceReportedHeight', 'rightsBasisText', 'rightsEvidenceRefs', 'rightsReviewState',
  'knownUseRestrictionNotes', 'privacySubjectRiskNotes', 'derivativeOfSourceInstanceRef', 'acquiredAt',
] as const);
const RECORD_KEYS = Object.freeze([
  'schemaVersion', 'acquisitionRef', 'captureRef', 'sourceProvenanceRef', 'sourceInstanceRef',
  'sourcePageUrl', 'sourcePageRevisionRef', 'sourceAssetUrl', 'canonicalAssetDigest', 'byteLength',
  'contentSignature', 'parserVariant', 'encodedWidth', 'encodedHeight', 'sourceReportedWidth',
  'sourceReportedHeight', 'sourceReportedDimensionState', 'rightsBasisText', 'rightsEvidenceRefs',
  'rightsReviewState', 'knownUseRestrictionNotes', 'privacySubjectRiskNotes', 'derivativeOfSourceInstanceRef',
  'acquiredAt', 'exactByteDigestVerificationPerformedAtIntake', 'imageHeaderInspectionPerformedAtIntake',
  'intakeVerificationReperformedByFrozenVerifier', 'rawBytesRetainedByFrozenRecord',
  'sourceAssetUrlCryptographicallyAuthenticatedByThisRecord', 'providedBytesProvenToOriginateFromSourceAssetUrl',
  'rightsLegallyAdjudicated', 'privacySubjectRiskIndependentlyAdjudicated', 'humanFaceCountLabelEstablished',
  'partitionAssignmentAuthorized', 'empiricalAdmissionAuthorized', 'providerScoringAuthorized',
  'productionGeometryAuthorized', 'authorityState', 'recordDigest',
] as const);

export const INDEPENDENT_FACE_SOURCE_ASSET_INTAKE_AUTHORITY_FRDATA07A:
IndependentFaceSourceAssetIntakeAuthorityFRData07AV1 = Object.freeze({
  schemaVersion: 'fr-data07a-v1' as const,
  authorityRef: 'authority.face.independent_face_source_asset_intake.frdata07a' as const,
  authorityVersion: '0.1.0' as const,
  authorityState: 'source_asset_byte_and_provenance_binding_contract_defined_no_real_asset_admission' as const,
  upstreamDatasetSchemaRef: 'fr-data07-independent-face-ground-truth-v1' as const,
  protocol: Object.freeze({
    exactProvidedBytesSha256MatchRequired: true as const,
    supportedImageHeaderInspectionRequired: true as const,
    sourceReportedDimensionsWhenSuppliedMustExactlyMatchBytes: true as const,
    absoluteHttpOrHttpsSourceUrlsRequired: true as const,
    rightsEvidenceRefsRequired: true as const,
    privacySubjectRiskScreenRecordRequired: true as const,
    exactDatasetCaptureBindingRequired: true as const,
    frozenRecordRetainsRawBytes: false as const,
    frozenVerifierReperformsByteVerification: false as const,
    sourceMetadataThatCouldHintLabelMayBeIncludedInHumanAnnotationPacket: false as const,
    filenameOrSourceDescriptionMayDefineHumanFaceCountLabel: false as const,
    sourceUrlMayProveByteOriginWithoutExternalAuthentication: false as const,
    rightsMetadataMayConstituteLegalAdjudication: false as const,
    rightsMetadataMayConstitutePrivacyClearance: false as const,
    minimumAssetsForEmpiricalAdmission: null,
    acceptedRightsBasis: null,
    privacyRiskAcceptanceCriterion: null,
  }),
  authorityBoundary: Object.freeze({
    byteDigestMatchMeansSourceTransportAuthenticated: false as const,
    sourcePagePresenceMeansAssetOriginAuthenticated: false as const,
    frozenMetadataDigestMeansBytesReverified: false as const,
    rightsBasisTextMeansRightsLegallyAdjudicated: false as const,
    rightsEvidencePresenceMeansRightsLegallyAdjudicated: false as const,
    privacyRiskNotesMeanPrivacyClearance: false as const,
    sourceFilenameMeansHumanFaceCountLabel: false as const,
    sourceDescriptionMeansHumanFaceCountLabel: false as const,
    sourceMetadataMayAssignCalibrationOrHoldout: false as const,
    sourceMetadataMayDefineProviderOutcome: false as const,
    exactByteBindingMeansEmpiricalAdmissionAuthorized: false as const,
    exactByteBindingMeansProviderScoringAuthorized: false as const,
    captureQualityAuthorityValidated: false as const,
    anatomicalLandmarkAuthorityValidated: false as const,
    traditionalSemanticAuthorityValidated: false as const,
    productionGeometryAuthorized: false as const,
  }),
});

function fail(message: string): never {
  throw new FaceAuthorityValidationError(`FR-DATA-07A ${message}`);
}

function nonEmpty(value: string, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) fail(`${label} must be non-empty.`);
  return value;
}

function canonicalSha256(value: string, label: string): string {
  if (!SHA256.test(value)) fail(`${label} must use canonical lowercase sha256:<64-hex> form.`);
  return value;
}

function parseTimestamp(value: string, label: string): number {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) fail(`${label} must be a parseable timestamp.`);
  return timestamp;
}

function absoluteHttpUrl(value: string, label: string): string {
  nonEmpty(value, label);
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    fail(`${label} must be an absolute HTTP(S) URL.`);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') fail(`${label} must use HTTP or HTTPS.`);
  return value;
}

function uniqueNonEmpty(values: readonly string[], label: string, required: boolean): readonly string[] {
  if (!Array.isArray(values)) fail(`${label} must be an array.`);
  if (required && values.length === 0) fail(`${label} must be non-empty.`);
  const seen = new Set<string>();
  for (const value of values) {
    nonEmpty(value, label);
    if (seen.has(value)) fail(`${label} contains duplicate value ${value}.`);
    seen.add(value);
  }
  return values;
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
    for (const key of Object.keys(object).sort()) normalized[key] = canonicalize(object[key]);
    return normalized;
  }
  return value;
}

function metadataDigest(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(canonicalize(value)), 'utf8').digest('hex')}`;
}

function validateRightsReviewState(value: string): asserts value is IndependentFaceSourceAssetRightsReviewStateFRData07AV1 {
  if (
    value !== 'source_rights_basis_recorded_not_legally_adjudicated' &&
    value !== 'source_rights_restrictions_or_uncertainty_recorded_not_legally_adjudicated'
  ) fail('rightsReviewState is unsupported.');
}

export function validateIndependentFaceSourceAssetIntakeAuthorityFRData07A(
  authority: IndependentFaceSourceAssetIntakeAuthorityFRData07AV1 = INDEPENDENT_FACE_SOURCE_ASSET_INTAKE_AUTHORITY_FRDATA07A,
): IndependentFaceSourceAssetIntakeAuthorityFRData07AV1 {
  if (
    authority.schemaVersion !== 'fr-data07a-v1' ||
    authority.authorityRef !== 'authority.face.independent_face_source_asset_intake.frdata07a' ||
    authority.authorityVersion !== '0.1.0' ||
    authority.authorityState !== 'source_asset_byte_and_provenance_binding_contract_defined_no_real_asset_admission' ||
    authority.upstreamDatasetSchemaRef !== 'fr-data07-independent-face-ground-truth-v1'
  ) fail('authority identity/upstream schema drift.');
  const protocol = authority.protocol;
  if (
    protocol.exactProvidedBytesSha256MatchRequired !== true ||
    protocol.supportedImageHeaderInspectionRequired !== true ||
    protocol.sourceReportedDimensionsWhenSuppliedMustExactlyMatchBytes !== true ||
    protocol.absoluteHttpOrHttpsSourceUrlsRequired !== true ||
    protocol.rightsEvidenceRefsRequired !== true ||
    protocol.privacySubjectRiskScreenRecordRequired !== true ||
    protocol.exactDatasetCaptureBindingRequired !== true ||
    protocol.frozenRecordRetainsRawBytes !== false ||
    protocol.frozenVerifierReperformsByteVerification !== false ||
    protocol.sourceMetadataThatCouldHintLabelMayBeIncludedInHumanAnnotationPacket !== false ||
    protocol.filenameOrSourceDescriptionMayDefineHumanFaceCountLabel !== false ||
    protocol.sourceUrlMayProveByteOriginWithoutExternalAuthentication !== false ||
    protocol.rightsMetadataMayConstituteLegalAdjudication !== false ||
    protocol.rightsMetadataMayConstitutePrivacyClearance !== false
  ) fail('protocol authority boundary drift.');
  if (
    protocol.minimumAssetsForEmpiricalAdmission !== null ||
    protocol.acceptedRightsBasis !== null ||
    protocol.privacyRiskAcceptanceCriterion !== null
  ) fail('empirical/legal/privacy sufficiency criteria must remain unset before external evidence and governance exist.');
  if (Object.values(authority.authorityBoundary).some((value) => value !== false)) fail('authority boundary must remain fully fail-closed.');
  return authority;
}

export function computeIndependentFaceSourceAssetDigestFRData07A(bytes: Uint8Array): string {
  if (!(bytes instanceof Uint8Array) || bytes.length === 0) fail('source asset bytes must be a non-empty Uint8Array.');
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

export function freezeIndependentFaceSourceAssetRecordFRData07A(
  input: IndependentFaceSourceAssetIntakeInputFRData07AV1,
): FrozenIndependentFaceSourceAssetRecordFRData07AV1 {
  validateIndependentFaceSourceAssetIntakeAuthorityFRData07A();
  rejectUnknownKeys(input, INPUT_KEYS, 'input');
  if (input.schemaVersion !== 'fr-data07a-independent-face-source-asset-intake-v1') fail('input schema drift.');
  nonEmpty(input.acquisitionRef, 'acquisitionRef');
  nonEmpty(input.captureRef, 'captureRef');
  nonEmpty(input.sourceProvenanceRef, 'sourceProvenanceRef');
  nonEmpty(input.sourceInstanceRef, 'sourceInstanceRef');
  absoluteHttpUrl(input.sourcePageUrl, 'sourcePageUrl');
  absoluteHttpUrl(input.sourceAssetUrl, 'sourceAssetUrl');
  if (input.sourcePageRevisionRef !== null) nonEmpty(input.sourcePageRevisionRef, 'sourcePageRevisionRef');
  if (input.derivativeOfSourceInstanceRef !== null) {
    nonEmpty(input.derivativeOfSourceInstanceRef, 'derivativeOfSourceInstanceRef');
    if (input.derivativeOfSourceInstanceRef === input.sourceInstanceRef) fail('derivativeOfSourceInstanceRef cannot equal sourceInstanceRef.');
  }
  nonEmpty(input.rightsBasisText, 'rightsBasisText');
  uniqueNonEmpty(input.rightsEvidenceRefs, 'rightsEvidenceRefs', true);
  uniqueNonEmpty(input.knownUseRestrictionNotes, 'knownUseRestrictionNotes', false);
  uniqueNonEmpty(input.privacySubjectRiskNotes, 'privacySubjectRiskNotes', true);
  validateRightsReviewState(input.rightsReviewState);
  parseTimestamp(input.acquiredAt, 'acquiredAt');

  const actualDigest = computeIndependentFaceSourceAssetDigestFRData07A(input.bytes);
  canonicalSha256(input.declaredCanonicalAssetDigest, 'declaredCanonicalAssetDigest');
  if (actualDigest !== input.declaredCanonicalAssetDigest) fail('declared canonical asset digest does not match the provided bytes.');

  const inspected = inspectImageByteDimensionsFRData02(input.bytes);
  const bothDimensionsAbsent = input.sourceReportedWidth === null && input.sourceReportedHeight === null;
  const bothDimensionsPresent = input.sourceReportedWidth !== null && input.sourceReportedHeight !== null;
  if (!bothDimensionsAbsent && !bothDimensionsPresent) fail('source-reported width and height must be supplied together or both omitted.');
  if (bothDimensionsPresent) {
    if (
      !Number.isInteger(input.sourceReportedWidth) || !Number.isInteger(input.sourceReportedHeight) ||
      input.sourceReportedWidth! <= 0 || input.sourceReportedHeight! <= 0
    ) fail('source-reported dimensions must be positive integers.');
    if (input.sourceReportedWidth !== inspected.width || input.sourceReportedHeight !== inspected.height) {
      fail(`source-reported dimensions ${input.sourceReportedWidth}x${input.sourceReportedHeight} do not match encoded bytes ${inspected.width}x${inspected.height}.`);
    }
  }

  const material = {
    schemaVersion: 'fr-data07a-independent-face-source-asset-record-v1' as const,
    acquisitionRef: input.acquisitionRef,
    captureRef: input.captureRef,
    sourceProvenanceRef: input.sourceProvenanceRef,
    sourceInstanceRef: input.sourceInstanceRef,
    sourcePageUrl: input.sourcePageUrl,
    sourcePageRevisionRef: input.sourcePageRevisionRef,
    sourceAssetUrl: input.sourceAssetUrl,
    canonicalAssetDigest: actualDigest,
    byteLength: input.bytes.length,
    contentSignature: inspected.contentSignature as IndependentFaceSourceAssetContentSignatureFRData07AV1,
    parserVariant: inspected.parserVariant as IndependentFaceSourceAssetDimensionParserFRData07AV1,
    encodedWidth: inspected.width,
    encodedHeight: inspected.height,
    sourceReportedWidth: input.sourceReportedWidth,
    sourceReportedHeight: input.sourceReportedHeight,
    sourceReportedDimensionState: (bothDimensionsPresent ? 'verified_exact_match' : 'not_supplied') as IndependentFaceSourceReportedDimensionStateFRData07AV1,
    rightsBasisText: input.rightsBasisText,
    rightsEvidenceRefs: Object.freeze([...input.rightsEvidenceRefs]),
    rightsReviewState: input.rightsReviewState,
    knownUseRestrictionNotes: Object.freeze([...input.knownUseRestrictionNotes]),
    privacySubjectRiskNotes: Object.freeze([...input.privacySubjectRiskNotes]),
    derivativeOfSourceInstanceRef: input.derivativeOfSourceInstanceRef,
    acquiredAt: input.acquiredAt,
    exactByteDigestVerificationPerformedAtIntake: true as const,
    imageHeaderInspectionPerformedAtIntake: true as const,
    intakeVerificationReperformedByFrozenVerifier: false as const,
    rawBytesRetainedByFrozenRecord: false as const,
    sourceAssetUrlCryptographicallyAuthenticatedByThisRecord: false as const,
    providedBytesProvenToOriginateFromSourceAssetUrl: false as const,
    rightsLegallyAdjudicated: false as const,
    privacySubjectRiskIndependentlyAdjudicated: false as const,
    humanFaceCountLabelEstablished: false as const,
    partitionAssignmentAuthorized: false as const,
    empiricalAdmissionAuthorized: false as const,
    providerScoringAuthorized: false as const,
    productionGeometryAuthorized: false as const,
    authorityState: 'exact_bytes_digest_and_image_header_verified_at_intake_provenance_metadata_recorded_not_externally_authenticated' as const,
  };
  return Object.freeze({ ...material, recordDigest: metadataDigest(material) });
}

export function verifyFrozenIndependentFaceSourceAssetRecordFRData07A(
  record: FrozenIndependentFaceSourceAssetRecordFRData07AV1,
): FrozenIndependentFaceSourceAssetRecordFRData07AV1 {
  validateIndependentFaceSourceAssetIntakeAuthorityFRData07A();
  rejectUnknownKeys(record, RECORD_KEYS, 'frozen record');
  if (record.schemaVersion !== 'fr-data07a-independent-face-source-asset-record-v1') fail('frozen record schema drift.');
  nonEmpty(record.acquisitionRef, 'record.acquisitionRef');
  nonEmpty(record.captureRef, 'record.captureRef');
  nonEmpty(record.sourceProvenanceRef, 'record.sourceProvenanceRef');
  nonEmpty(record.sourceInstanceRef, 'record.sourceInstanceRef');
  absoluteHttpUrl(record.sourcePageUrl, 'record.sourcePageUrl');
  absoluteHttpUrl(record.sourceAssetUrl, 'record.sourceAssetUrl');
  canonicalSha256(record.canonicalAssetDigest, 'record.canonicalAssetDigest');
  canonicalSha256(record.recordDigest, 'record.recordDigest');
  if (!Number.isInteger(record.byteLength) || record.byteLength <= 0) fail('record.byteLength must be a positive integer.');
  if (!Number.isInteger(record.encodedWidth) || !Number.isInteger(record.encodedHeight) || record.encodedWidth <= 0 || record.encodedHeight <= 0) {
    fail('record encoded dimensions must be positive integers.');
  }
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(record.contentSignature)) fail('record contentSignature is unsupported.');
  if (!['png_ihdr', 'jpeg_sof', 'webp_vp8x', 'webp_vp8l', 'webp_vp8'].includes(record.parserVariant)) fail('record parserVariant is unsupported.');
  if (record.sourcePageRevisionRef !== null) nonEmpty(record.sourcePageRevisionRef, 'record.sourcePageRevisionRef');
  if (record.derivativeOfSourceInstanceRef !== null) {
    nonEmpty(record.derivativeOfSourceInstanceRef, 'record.derivativeOfSourceInstanceRef');
    if (record.derivativeOfSourceInstanceRef === record.sourceInstanceRef) fail('record derivative source instance cannot equal source instance.');
  }
  nonEmpty(record.rightsBasisText, 'record.rightsBasisText');
  uniqueNonEmpty(record.rightsEvidenceRefs, 'record.rightsEvidenceRefs', true);
  uniqueNonEmpty(record.knownUseRestrictionNotes, 'record.knownUseRestrictionNotes', false);
  uniqueNonEmpty(record.privacySubjectRiskNotes, 'record.privacySubjectRiskNotes', true);
  validateRightsReviewState(record.rightsReviewState);
  parseTimestamp(record.acquiredAt, 'record.acquiredAt');

  const dimensionsAbsent = record.sourceReportedWidth === null && record.sourceReportedHeight === null;
  const dimensionsPresent = record.sourceReportedWidth !== null && record.sourceReportedHeight !== null;
  if (!dimensionsAbsent && !dimensionsPresent) fail('record source-reported dimensions are incomplete.');
  if (record.sourceReportedDimensionState === 'not_supplied') {
    if (!dimensionsAbsent) fail('record sourceReportedDimensionState conflicts with supplied dimensions.');
  } else if (record.sourceReportedDimensionState === 'verified_exact_match') {
    if (!dimensionsPresent || record.sourceReportedWidth !== record.encodedWidth || record.sourceReportedHeight !== record.encodedHeight) {
      fail('record verified source-reported dimensions do not match encoded dimensions.');
    }
  } else {
    fail('record sourceReportedDimensionState is unsupported.');
  }

  if (
    record.exactByteDigestVerificationPerformedAtIntake !== true ||
    record.imageHeaderInspectionPerformedAtIntake !== true ||
    record.intakeVerificationReperformedByFrozenVerifier !== false ||
    record.rawBytesRetainedByFrozenRecord !== false ||
    record.sourceAssetUrlCryptographicallyAuthenticatedByThisRecord !== false ||
    record.providedBytesProvenToOriginateFromSourceAssetUrl !== false ||
    record.rightsLegallyAdjudicated !== false ||
    record.privacySubjectRiskIndependentlyAdjudicated !== false ||
    record.humanFaceCountLabelEstablished !== false ||
    record.partitionAssignmentAuthorized !== false ||
    record.empiricalAdmissionAuthorized !== false ||
    record.providerScoringAuthorized !== false ||
    record.productionGeometryAuthorized !== false ||
    record.authorityState !== 'exact_bytes_digest_and_image_header_verified_at_intake_provenance_metadata_recorded_not_externally_authenticated'
  ) fail('frozen record authority boundary drift.');

  const { recordDigest, ...material } = record;
  if (metadataDigest(material) !== recordDigest) fail('frozen record metadata digest mismatch.');
  return record;
}

export function bindIndependentFaceDatasetSourceAssetsFRData07A(
  dataset: IndependentFaceGroundTruthDatasetFRData07V1,
  records: readonly FrozenIndependentFaceSourceAssetRecordFRData07AV1[],
): IndependentFaceSourceAssetBindingReportFRData07AV1 {
  validateIndependentFaceGroundTruthDatasetFRData07(dataset);
  if (!Array.isArray(records)) fail('source asset records must be an array.');
  if (records.length !== dataset.captures.length) fail('source asset record coverage must exactly match dataset capture count.');
  const captureRefs = records.map((record) => record.captureRef);
  const acquisitionRefs = records.map((record) => record.acquisitionRef);
  const sourceInstanceRefs = records.map((record) => record.sourceInstanceRef);
  if (new Set(captureRefs).size !== captureRefs.length) fail('source asset record capture refs must be unique.');
  if (new Set(acquisitionRefs).size !== acquisitionRefs.length) fail('source asset acquisition refs must be unique.');
  if (new Set(sourceInstanceRefs).size !== sourceInstanceRefs.length) fail('source asset sourceInstanceRefs must be unique.');
  for (const record of records) verifyFrozenIndependentFaceSourceAssetRecordFRData07A(record);
  for (const capture of dataset.captures) {
    const record = records.find((entry) => entry.captureRef === capture.captureRef);
    if (!record) fail(`dataset capture ${capture.captureRef} is missing its source asset record.`);
    if (record.canonicalAssetDigest !== capture.canonicalAssetDigest) fail(`dataset capture ${capture.captureRef} canonical asset digest does not match source asset intake.`);
    if (record.sourceProvenanceRef !== capture.sourceProvenanceRef) fail(`dataset capture ${capture.captureRef} sourceProvenanceRef does not match source asset intake.`);
    if (record.sourceInstanceRef !== capture.sourceInstanceRef) fail(`dataset capture ${capture.captureRef} sourceInstanceRef does not match source asset intake.`);
  }
  return Object.freeze({
    schemaVersion: 'fr-data07a-independent-face-source-asset-binding-report-v1' as const,
    datasetRef: dataset.datasetRef,
    captureCount: dataset.captures.length,
    sourceAssetRecordCount: records.length,
    captureCoverageComplete: true as const,
    canonicalAssetDigestBindingsExact: true as const,
    sourceProvenanceBindingsExact: true as const,
    sourceInstanceBindingsExact: true as const,
    sourceAssetByteVerificationRecordedAtIntake: true as const,
    sourceAssetByteVerificationReperformedByBinding: false as const,
    sourceTransportAuthenticated: false as const,
    rightsLegallyAdjudicated: false as const,
    privacySubjectRiskIndependentlyAdjudicated: false as const,
    humanFaceCountLabelsEstablishedBySourceMetadata: false as const,
    empiricalAdmissionAuthorized: false as const,
    providerScoringAuthorized: false as const,
    productionGeometryAuthorized: false as const,
  });
}

export function assertIndependentFaceSourceAssetsReadyForEmpiricalAdmissionFRData07A(): never {
  validateIndependentFaceSourceAssetIntakeAuthorityFRData07A();
  fail('source asset byte/provenance binding alone cannot authorize empirical admission; real source acquisition, governed rights/privacy review, independent human evidence, and later authority review remain required.');
}
