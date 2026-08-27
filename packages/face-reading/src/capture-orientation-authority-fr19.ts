import { PROVIDER_RELEASE_ATTESTATION_FR18 } from './provider-release-attestation-fr18.js';
import { FaceAuthorityValidationError } from './validation.js';

export type CaptureOrientationEvidenceClassV1 =
  | 'consumer_canonicalization_source'
  | 'image_library_contract';

export interface CaptureOrientationEvidenceRecordV1 {
  readonly evidenceRef: string;
  readonly evidenceClass: CaptureOrientationEvidenceClassV1;
  readonly sourceRef: string;
  readonly observedValue: string;
  readonly authorityState: 'research_only';
  readonly limitations: readonly string[];
}

export type CanonicalPixelOrientationStateV1 =
  | 'exif_transform_normalized';

export type AnatomicalMirrorStateV1 =
  | 'unresolved_source_pixels';

export interface CaptureOrientationAuthorityFR19V1 {
  readonly schemaVersion: 'v1';
  readonly authorityVersion: string;
  readonly authorityState: 'research_only';

  readonly sourcePipeline: {
    readonly repository: 'gycha0109-beep/K_beauty';
    readonly repositoryCommit: '81c3b4139efdffc785439da005557dc38a6b4873';
    readonly sourcePath: 'lib/image-upload-boundary-core.js';
    readonly sourceBlobSha: '2215b9c08f61971521ae9ff9eab9cb7c5f392f98';
    readonly imageLibrary: 'sharp';
    readonly imageLibraryVersion: '0.35.3';
    readonly evidenceRefs: readonly string[];
  };

  readonly canonicalization: {
    readonly operation: 'sharp_auto_orient_then_reencode_same_supported_format';
    readonly supportedFormats: readonly ['jpeg', 'png', 'webp'];
    readonly exifOrientationAppliedToPixels: true;
    readonly exifOrientationMayApplyMirrorTransform: true;
    readonly outputOrientationMetadataRetained: false;
    readonly canonicalPixelOrientationState: CanonicalPixelOrientationStateV1;
    readonly coordinateOrigin: 'top_left';
    readonly xAxisDirection: 'image_left_to_right';
    readonly yAxisDirection: 'image_top_to_bottom';
  };

  readonly anatomicalLaterality: {
    readonly sourcePixelMirrorState: AnatomicalMirrorStateV1;
    readonly sourcePixelMirrorAttestationRef: null;
    readonly fileUploadCanEstablishAnatomicalUnmirroredPixels: false;
    readonly selfiePreviewCanEstablishSavedPixelOrientation: false;
    readonly imageXAxisMayDefineAnatomicalSide: false;
    readonly providerSideLabelMayBypassCaptureAuthority: false;
    readonly productionLateralityBindingAllowed: false;
  };

  readonly relationshipToFR18: {
    readonly providerReleaseAttestationVersion: string;
    readonly closesCaptureExifTransformGap: true;
    readonly closesPublishedBundleProvenanceGap: false;
    readonly closesAnatomicalMirrorGap: false;
    readonly providerActivationAllowed: false;
  };

  readonly prohibitedPromotions: readonly [
    'exif_auto_orient_to_anatomical_unmirrored',
    'preview_mirror_state_to_saved_pixel_state',
    'image_x_axis_to_anatomical_laterality',
    'provider_left_right_symbol_to_capture_laterality',
  ];
}

export interface CaptureOrientationReadinessFR19V1 {
  readonly productionReady: false;
  readonly exifTransformState: 'resolved';
  readonly anatomicalMirrorState: 'unresolved';
  readonly lateralityBindingState: 'blocked';
  readonly blockers: readonly string[];
}

const HEX40 = /^[0-9a-f]{40}$/u;
const ALLOWED_EVIDENCE_KEYS = new Set([
  'evidenceRef', 'evidenceClass', 'sourceRef', 'observedValue', 'authorityState', 'limitations',
]);
const ALLOWED_AUTHORITY_KEYS = new Set([
  'schemaVersion', 'authorityVersion', 'authorityState', 'sourcePipeline', 'canonicalization',
  'anatomicalLaterality', 'relationshipToFR18', 'prohibitedPromotions',
]);
const ALLOWED_SOURCE_PIPELINE_KEYS = new Set([
  'repository', 'repositoryCommit', 'sourcePath', 'sourceBlobSha', 'imageLibrary', 'imageLibraryVersion', 'evidenceRefs',
]);
const ALLOWED_CANONICALIZATION_KEYS = new Set([
  'operation', 'supportedFormats', 'exifOrientationAppliedToPixels', 'exifOrientationMayApplyMirrorTransform',
  'outputOrientationMetadataRetained', 'canonicalPixelOrientationState', 'coordinateOrigin', 'xAxisDirection', 'yAxisDirection',
]);
const ALLOWED_LATERALITY_KEYS = new Set([
  'sourcePixelMirrorState', 'sourcePixelMirrorAttestationRef', 'fileUploadCanEstablishAnatomicalUnmirroredPixels',
  'selfiePreviewCanEstablishSavedPixelOrientation', 'imageXAxisMayDefineAnatomicalSide',
  'providerSideLabelMayBypassCaptureAuthority', 'productionLateralityBindingAllowed',
]);
const ALLOWED_FR18_RELATION_KEYS = new Set([
  'providerReleaseAttestationVersion', 'closesCaptureExifTransformGap', 'closesPublishedBundleProvenanceGap',
  'closesAnatomicalMirrorGap', 'providerActivationAllowed',
]);

function exactKeys(value: object, allowed: ReadonlySet<string>, path: string): void {
  const unexpected = Object.keys(value).find((key) => !allowed.has(key));
  if (unexpected !== undefined) {
    throw new FaceAuthorityValidationError(`${path} contains unauthorized field: ${unexpected}`);
  }
}

function nonEmpty(value: string, path: string): void {
  if (value.trim().length === 0) throw new FaceAuthorityValidationError(`${path} must be non-empty.`);
}

function commitSha(value: string, path: string): void {
  if (!HEX40.test(value)) throw new FaceAuthorityValidationError(`${path} must be a 40-char lowercase git SHA.`);
}

function unique(values: readonly string[], path: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new FaceAuthorityValidationError(`${path} contains duplicate: ${value}`);
    seen.add(value);
  }
}

export const CAPTURE_ORIENTATION_EVIDENCE_FR19: readonly CaptureOrientationEvidenceRecordV1[] = Object.freeze([
  Object.freeze({
    evidenceRef: 'evidence.fr19.kbeauty.canonical_image_pipeline',
    evidenceClass: 'consumer_canonicalization_source' as const,
    sourceRef: 'github:gycha0109-beep/K_beauty@81c3b4139efdffc785439da005557dc38a6b4873:lib/image-upload-boundary-core.js#blob-2215b9c08f61971521ae9ff9eab9cb7c5f392f98',
    observedValue: 'canonical image bytes are decoded, validated with oriented dimensions, passed through sharp(...).autoOrient(), and re-encoded as jpeg/png/webp',
    authorityState: 'research_only' as const,
    limitations: Object.freeze([
      'the pipeline contains no source-camera attestation proving whether encoded source pixels were already horizontally mirrored before upload',
      'canonicalization resolves metadata-described orientation but cannot reconstruct unknown pre-encoding display/camera transforms',
    ]),
  }),
  Object.freeze({
    evidenceRef: 'evidence.fr19.sharp.auto_orient_contract',
    evidenceClass: 'image_library_contract' as const,
    sourceRef: 'sharp-docs:autoOrient-and-output-metadata',
    observedValue: 'sharp autoOrient applies EXIF Orientation including supported mirror transforms and removes the Orientation tag; buffer output removes metadata by default',
    authorityState: 'research_only' as const,
    limitations: Object.freeze([
      'library behavior does not attest how a browser/native camera preview or capture API encoded source pixels before Sharp receives them',
    ]),
  }),
]);

export const CAPTURE_ORIENTATION_AUTHORITY_FR19: CaptureOrientationAuthorityFR19V1 = Object.freeze({
  schemaVersion: 'v1' as const,
  authorityVersion: '0.1.0',
  authorityState: 'research_only' as const,
  sourcePipeline: Object.freeze({
    repository: 'gycha0109-beep/K_beauty' as const,
    repositoryCommit: '81c3b4139efdffc785439da005557dc38a6b4873' as const,
    sourcePath: 'lib/image-upload-boundary-core.js' as const,
    sourceBlobSha: '2215b9c08f61971521ae9ff9eab9cb7c5f392f98' as const,
    imageLibrary: 'sharp' as const,
    imageLibraryVersion: '0.35.3' as const,
    evidenceRefs: Object.freeze([
      'evidence.fr19.kbeauty.canonical_image_pipeline',
      'evidence.fr19.sharp.auto_orient_contract',
    ]),
  }),
  canonicalization: Object.freeze({
    operation: 'sharp_auto_orient_then_reencode_same_supported_format' as const,
    supportedFormats: Object.freeze(['jpeg', 'png', 'webp'] as const),
    exifOrientationAppliedToPixels: true as const,
    exifOrientationMayApplyMirrorTransform: true as const,
    outputOrientationMetadataRetained: false as const,
    canonicalPixelOrientationState: 'exif_transform_normalized' as const,
    coordinateOrigin: 'top_left' as const,
    xAxisDirection: 'image_left_to_right' as const,
    yAxisDirection: 'image_top_to_bottom' as const,
  }),
  anatomicalLaterality: Object.freeze({
    sourcePixelMirrorState: 'unresolved_source_pixels' as const,
    sourcePixelMirrorAttestationRef: null,
    fileUploadCanEstablishAnatomicalUnmirroredPixels: false as const,
    selfiePreviewCanEstablishSavedPixelOrientation: false as const,
    imageXAxisMayDefineAnatomicalSide: false as const,
    providerSideLabelMayBypassCaptureAuthority: false as const,
    productionLateralityBindingAllowed: false as const,
  }),
  relationshipToFR18: Object.freeze({
    providerReleaseAttestationVersion: PROVIDER_RELEASE_ATTESTATION_FR18.attestationVersion,
    closesCaptureExifTransformGap: true as const,
    closesPublishedBundleProvenanceGap: false as const,
    closesAnatomicalMirrorGap: false as const,
    providerActivationAllowed: false as const,
  }),
  prohibitedPromotions: Object.freeze([
    'exif_auto_orient_to_anatomical_unmirrored',
    'preview_mirror_state_to_saved_pixel_state',
    'image_x_axis_to_anatomical_laterality',
    'provider_left_right_symbol_to_capture_laterality',
  ] as const),
});

function getEvidence(evidenceRef: string): CaptureOrientationEvidenceRecordV1 | null {
  return CAPTURE_ORIENTATION_EVIDENCE_FR19.find((entry) => entry.evidenceRef === evidenceRef) ?? null;
}

export function validateCaptureOrientationEvidenceFR19(
  evidence: readonly CaptureOrientationEvidenceRecordV1[] = CAPTURE_ORIENTATION_EVIDENCE_FR19,
): readonly CaptureOrientationEvidenceRecordV1[] {
  unique(evidence.map((entry) => entry.evidenceRef), 'fr19.evidenceRefs');
  for (const entry of evidence) {
    exactKeys(entry, ALLOWED_EVIDENCE_KEYS, `FR-19 evidence ${entry.evidenceRef}`);
    nonEmpty(entry.evidenceRef, 'fr19.evidenceRef');
    nonEmpty(entry.sourceRef, `fr19.${entry.evidenceRef}.sourceRef`);
    nonEmpty(entry.observedValue, `fr19.${entry.evidenceRef}.observedValue`);
    if (entry.authorityState !== 'research_only') {
      throw new FaceAuthorityValidationError(`FR-19 evidence must remain research_only: ${entry.evidenceRef}`);
    }
    if (entry.limitations.length === 0) {
      throw new FaceAuthorityValidationError(`FR-19 evidence requires limitations: ${entry.evidenceRef}`);
    }
  }
  return evidence;
}

export function validateCaptureOrientationAuthorityFR19(
  authority: CaptureOrientationAuthorityFR19V1 = CAPTURE_ORIENTATION_AUTHORITY_FR19,
): CaptureOrientationAuthorityFR19V1 {
  validateCaptureOrientationEvidenceFR19();
  exactKeys(authority, ALLOWED_AUTHORITY_KEYS, 'FR-19 authority');
  if (authority.schemaVersion !== 'v1') throw new FaceAuthorityValidationError('FR-19 schemaVersion must be v1.');
  nonEmpty(authority.authorityVersion, 'fr19.authorityVersion');
  if (authority.authorityState !== 'research_only') throw new FaceAuthorityValidationError('FR-19 authorityState must remain research_only.');

  exactKeys(authority.sourcePipeline, ALLOWED_SOURCE_PIPELINE_KEYS, 'FR-19 sourcePipeline');
  commitSha(authority.sourcePipeline.repositoryCommit, 'fr19.sourcePipeline.repositoryCommit');
  commitSha(authority.sourcePipeline.sourceBlobSha, 'fr19.sourcePipeline.sourceBlobSha');
  if (authority.sourcePipeline.repositoryCommit !== '81c3b4139efdffc785439da005557dc38a6b4873' ||
      authority.sourcePipeline.sourceBlobSha !== '2215b9c08f61971521ae9ff9eab9cb7c5f392f98') {
    throw new FaceAuthorityValidationError('FR-19 must pin the inspected K_beauty canonicalization source exactly.');
  }
  if (authority.sourcePipeline.imageLibrary !== 'sharp' || authority.sourcePipeline.imageLibraryVersion !== '0.35.3') {
    throw new FaceAuthorityValidationError('FR-19 must pin the inspected Sharp dependency version 0.35.3.');
  }
  unique(authority.sourcePipeline.evidenceRefs, 'fr19.sourcePipeline.evidenceRefs');
  if (authority.sourcePipeline.evidenceRefs.length !== 2) {
    throw new FaceAuthorityValidationError('FR-19 source pipeline requires both repository and image-library evidence.');
  }
  authority.sourcePipeline.evidenceRefs.forEach((ref) => {
    if (getEvidence(ref) === null) throw new FaceAuthorityValidationError(`FR-19 unresolved evidenceRef: ${ref}`);
  });

  exactKeys(authority.canonicalization, ALLOWED_CANONICALIZATION_KEYS, 'FR-19 canonicalization');
  if (authority.canonicalization.operation !== 'sharp_auto_orient_then_reencode_same_supported_format') {
    throw new FaceAuthorityValidationError('FR-19 canonicalization operation mismatch.');
  }
  if (authority.canonicalization.supportedFormats.join('|') !== 'jpeg|png|webp') {
    throw new FaceAuthorityValidationError('FR-19 canonicalization format set mismatch.');
  }
  if (authority.canonicalization.exifOrientationAppliedToPixels !== true ||
      authority.canonicalization.exifOrientationMayApplyMirrorTransform !== true ||
      authority.canonicalization.outputOrientationMetadataRetained !== false ||
      authority.canonicalization.canonicalPixelOrientationState !== 'exif_transform_normalized') {
    throw new FaceAuthorityValidationError('FR-19 EXIF orientation normalization contract mismatch.');
  }
  if (authority.canonicalization.coordinateOrigin !== 'top_left' ||
      authority.canonicalization.xAxisDirection !== 'image_left_to_right' ||
      authority.canonicalization.yAxisDirection !== 'image_top_to_bottom') {
    throw new FaceAuthorityValidationError('FR-19 canonical coordinate frame mismatch.');
  }

  exactKeys(authority.anatomicalLaterality, ALLOWED_LATERALITY_KEYS, 'FR-19 anatomicalLaterality');
  if (authority.anatomicalLaterality.sourcePixelMirrorState !== 'unresolved_source_pixels' ||
      authority.anatomicalLaterality.sourcePixelMirrorAttestationRef !== null) {
    throw new FaceAuthorityValidationError('FR-19 source-pixel mirror state must remain unresolved without capture attestation.');
  }
  if (authority.anatomicalLaterality.fileUploadCanEstablishAnatomicalUnmirroredPixels !== false ||
      authority.anatomicalLaterality.selfiePreviewCanEstablishSavedPixelOrientation !== false ||
      authority.anatomicalLaterality.imageXAxisMayDefineAnatomicalSide !== false ||
      authority.anatomicalLaterality.providerSideLabelMayBypassCaptureAuthority !== false ||
      authority.anatomicalLaterality.productionLateralityBindingAllowed !== false) {
    throw new FaceAuthorityValidationError('FR-19 anatomical laterality must remain fail-closed.');
  }

  exactKeys(authority.relationshipToFR18, ALLOWED_FR18_RELATION_KEYS, 'FR-19 relationshipToFR18');
  if (authority.relationshipToFR18.providerReleaseAttestationVersion !== PROVIDER_RELEASE_ATTESTATION_FR18.attestationVersion) {
    throw new FaceAuthorityValidationError('FR-19 must pin the merged FR-18 attestation version.');
  }
  if (authority.relationshipToFR18.closesCaptureExifTransformGap !== true ||
      authority.relationshipToFR18.closesPublishedBundleProvenanceGap !== false ||
      authority.relationshipToFR18.closesAnatomicalMirrorGap !== false ||
      authority.relationshipToFR18.providerActivationAllowed !== false) {
    throw new FaceAuthorityValidationError('FR-19 may close only the EXIF transform gap.');
  }

  if (authority.prohibitedPromotions.length !== 4) {
    throw new FaceAuthorityValidationError('FR-19 prohibited promotion set is incomplete.');
  }
  return authority;
}

export function assessCaptureOrientationReadinessFR19(
  authority: CaptureOrientationAuthorityFR19V1 = CAPTURE_ORIENTATION_AUTHORITY_FR19,
): CaptureOrientationReadinessFR19V1 {
  validateCaptureOrientationAuthorityFR19(authority);
  return Object.freeze({
    productionReady: false,
    exifTransformState: 'resolved' as const,
    anatomicalMirrorState: 'unresolved' as const,
    lateralityBindingState: 'blocked' as const,
    blockers: Object.freeze([
      'file upload cannot attest whether source pixel content was already mirrored before encoding',
      'selfie/browser/native preview mirroring is not authority for saved canonical pixel orientation',
      'no reviewed capture-source mirror attestation is pinned',
      'provider left/right symbol names cannot bypass capture laterality authority',
      'FR-18 published package topology provenance remains unresolved, so provider activation remains blocked',
    ]),
  });
}
