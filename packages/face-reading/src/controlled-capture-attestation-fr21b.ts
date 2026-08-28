import { CAPTURE_ORIENTATION_AUTHORITY_FR19 } from './capture-orientation-authority-fr19.js';
import { LATERALITY_CONSUMPTION_POLICY_FR20 } from './laterality-consumption-policy-fr20.js';
import { FaceAuthorityValidationError } from './validation.js';

export type ControlledCaptureCameraFacingFR21BV1 = 'front' | 'rear';
export type ControlledCaptureStageFR21BV1 = 'preview' | 'raw_pixels' | 'encoded_pixels' | 'canonical_pixels';
export type ControlledCaptureMarkerSideFR21BV1 = 'left' | 'right';
export type ControlledCaptureMirrorPolicyFR21BV1 =
  | 'mirrored_relative_to_subject'
  | 'unmirrored_relative_to_subject';
export type ControlledCaptureFinalLateralityAssertionFR21BV1 =
  | 'image_left_is_subject_anatomical_left'
  | 'image_left_is_subject_anatomical_right';

export interface ControlledCaptureCalibrationStageObservationFR21BV1 {
  readonly stage: ControlledCaptureStageFR21BV1;
  readonly markerImageSide: ControlledCaptureMarkerSideFR21BV1;
  readonly artifactEvidenceRef: string;
}

export interface ControlledCaptureCalibrationEvidenceFR21BV1 {
  readonly schemaVersion: 'fr21b-calibration-v1';
  readonly evidenceRef: string;
  readonly profileRef: string;
  readonly targetRef: string;
  readonly targetKind: 'deterministic_asymmetric';
  readonly markerAnatomicalSide: ControlledCaptureMarkerSideFR21BV1;
  readonly cameraFacing: ControlledCaptureCameraFacingFR21BV1;
  readonly stages: readonly ControlledCaptureCalibrationStageObservationFR21BV1[];
  readonly encodedExifOrientation: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | null;
  readonly reviewState: 'research_candidate' | 'reviewed';
  readonly evidenceRefs: readonly string[];
  readonly limitations: readonly string[];
}

export interface ControlledCaptureProfileAttestationFR21BV1 {
  readonly schemaVersion: 'fr21b-profile-v1';
  readonly profileRef: string;
  readonly implementation: {
    readonly repository: string;
    readonly repositoryCommit: string;
    readonly sourcePath: string;
    readonly sourceBlobSha: string;
  };
  readonly cameraFacing: ControlledCaptureCameraFacingFR21BV1;
  readonly rawCaptureOrientation: 'sensor_coordinate_frame' | 'display_oriented_coordinate_frame';
  readonly previewMirrorPolicy: ControlledCaptureMirrorPolicyFR21BV1;
  readonly savedPixelMirrorPolicy: ControlledCaptureMirrorPolicyFR21BV1;
  readonly exifOrientationPolicy: 'absent_or_identity' | 'metadata_may_encode_transform';
  readonly canonicalizationTransform:
    | 'identity'
    | 'fr19_sharp_auto_orient_then_reencode_same_supported_format';
  readonly finalAnatomicalLateralityAssertion: ControlledCaptureFinalLateralityAssertionFR21BV1;
  readonly reviewState: 'research_candidate' | 'verified';
  readonly calibrationEvidenceRefs: readonly string[];
  readonly evidenceRefs: readonly string[];
}

export interface ControlledCaptureAuthorityFR21BV1 {
  readonly schemaVersion: 'fr21b-v1';
  readonly authorityVersion: string;
  readonly authorityState: 'research_only';
  readonly baseline: {
    readonly captureOrientationAuthorityVersion: string;
    readonly lateralityConsumptionPolicyVersion: string;
  };
  readonly currentImplementation: {
    readonly controlledCaptureContractState: 'not_implemented';
    readonly implementationRef: null;
    readonly profileRefs: readonly [];
  };
  readonly calibrationProtocol: {
    readonly protocolState: 'design_only';
    readonly targetRequirement: 'deterministic_asymmetric';
    readonly requiredCameraFacings: readonly ['front', 'rear'];
    readonly requiredStages: readonly ['preview', 'raw_pixels', 'encoded_pixels', 'canonical_pixels'];
    readonly evidenceRefs: readonly [];
  };
  readonly anatomicalLaterality: {
    readonly verifiedProfileRefs: readonly [];
    readonly finalAssertionRef: null;
    readonly productionLateralityBindingAllowed: false;
  };
  readonly prohibitedPromotions: readonly [
    'preview_to_saved_pixel_authority',
    'provider_side_label_to_anatomical_laterality',
    'file_upload_to_controlled_capture_attestation',
    'design_only_protocol_to_production_laterality',
    'unreviewed_calibration_to_verified_profile',
  ];
}

export interface ControlledCaptureReadinessFR21BV1 {
  readonly productionReady: false;
  readonly controlledCaptureState: 'not_implemented';
  readonly calibrationState: 'design_only';
  readonly anatomicalLateralityState: 'blocked';
  readonly reason: 'no_verified_controlled_capture_implementation';
  readonly blockers: readonly string[];
}

const HEX40 = /^[0-9a-f]{40}$/u;
const STABLE_KEY = /^[a-z0-9][a-z0-9._:-]{0,191}$/u;
const REQUIRED_STAGES = ['preview', 'raw_pixels', 'encoded_pixels', 'canonical_pixels'] as const;
const REQUIRED_FACINGS = ['front', 'rear'] as const;

const ALLOWED_AUTHORITY_KEYS = new Set([
  'schemaVersion', 'authorityVersion', 'authorityState', 'baseline', 'currentImplementation',
  'calibrationProtocol', 'anatomicalLaterality', 'prohibitedPromotions',
]);
const ALLOWED_BASELINE_KEYS = new Set(['captureOrientationAuthorityVersion', 'lateralityConsumptionPolicyVersion']);
const ALLOWED_IMPLEMENTATION_STATE_KEYS = new Set(['controlledCaptureContractState', 'implementationRef', 'profileRefs']);
const ALLOWED_PROTOCOL_KEYS = new Set(['protocolState', 'targetRequirement', 'requiredCameraFacings', 'requiredStages', 'evidenceRefs']);
const ALLOWED_LATERALITY_KEYS = new Set(['verifiedProfileRefs', 'finalAssertionRef', 'productionLateralityBindingAllowed']);
const ALLOWED_PROFILE_KEYS = new Set([
  'schemaVersion', 'profileRef', 'implementation', 'cameraFacing', 'rawCaptureOrientation',
  'previewMirrorPolicy', 'savedPixelMirrorPolicy', 'exifOrientationPolicy',
  'canonicalizationTransform', 'finalAnatomicalLateralityAssertion', 'reviewState',
  'calibrationEvidenceRefs', 'evidenceRefs',
]);
const ALLOWED_IMPLEMENTATION_KEYS = new Set(['repository', 'repositoryCommit', 'sourcePath', 'sourceBlobSha']);
const ALLOWED_CALIBRATION_KEYS = new Set([
  'schemaVersion', 'evidenceRef', 'profileRef', 'targetRef', 'targetKind', 'markerAnatomicalSide',
  'cameraFacing', 'stages', 'encodedExifOrientation', 'reviewState', 'evidenceRefs', 'limitations',
]);
const ALLOWED_STAGE_KEYS = new Set(['stage', 'markerImageSide', 'artifactEvidenceRef']);

function exactKeys(value: object, allowed: ReadonlySet<string>, path: string): void {
  const unexpected = Object.keys(value).find((key) => !allowed.has(key));
  if (unexpected !== undefined) {
    throw new FaceAuthorityValidationError(`${path} contains unauthorized field: ${unexpected}`);
  }
}

function nonEmpty(value: string, path: string): void {
  if (value.trim().length === 0) throw new FaceAuthorityValidationError(`${path} must be non-empty.`);
}

function stableKey(value: string, path: string): void {
  nonEmpty(value, path);
  if (!STABLE_KEY.test(value)) throw new FaceAuthorityValidationError(`${path} must be a stable authority key.`);
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

function sameStringSet(actual: readonly string[], expected: readonly string[]): boolean {
  if (actual.length !== expected.length) return false;
  return [...actual].sort().join('|') === [...expected].sort().join('|');
}

function mirrorPolicyFromMarker(
  anatomicalSide: ControlledCaptureMarkerSideFR21BV1,
  imageSide: ControlledCaptureMarkerSideFR21BV1,
): ControlledCaptureMirrorPolicyFR21BV1 {
  return anatomicalSide === imageSide
    ? 'mirrored_relative_to_subject'
    : 'unmirrored_relative_to_subject';
}

function assertionFromMarker(
  anatomicalSide: ControlledCaptureMarkerSideFR21BV1,
  canonicalImageSide: ControlledCaptureMarkerSideFR21BV1,
): ControlledCaptureFinalLateralityAssertionFR21BV1 {
  return anatomicalSide === canonicalImageSide
    ? 'image_left_is_subject_anatomical_left'
    : 'image_left_is_subject_anatomical_right';
}

export const CONTROLLED_CAPTURE_PROFILES_FR21B: readonly ControlledCaptureProfileAttestationFR21BV1[] = Object.freeze([]);
export const CONTROLLED_CAPTURE_CALIBRATION_EVIDENCE_FR21B: readonly ControlledCaptureCalibrationEvidenceFR21BV1[] = Object.freeze([]);

export const CONTROLLED_CAPTURE_AUTHORITY_FR21B: ControlledCaptureAuthorityFR21BV1 = Object.freeze({
  schemaVersion: 'fr21b-v1' as const,
  authorityVersion: '0.1.0',
  authorityState: 'research_only' as const,
  baseline: Object.freeze({
    captureOrientationAuthorityVersion: CAPTURE_ORIENTATION_AUTHORITY_FR19.authorityVersion,
    lateralityConsumptionPolicyVersion: LATERALITY_CONSUMPTION_POLICY_FR20.policyVersion,
  }),
  currentImplementation: Object.freeze({
    controlledCaptureContractState: 'not_implemented' as const,
    implementationRef: null,
    profileRefs: Object.freeze([]) as readonly [],
  }),
  calibrationProtocol: Object.freeze({
    protocolState: 'design_only' as const,
    targetRequirement: 'deterministic_asymmetric' as const,
    requiredCameraFacings: Object.freeze(['front', 'rear'] as const),
    requiredStages: Object.freeze(REQUIRED_STAGES),
    evidenceRefs: Object.freeze([]) as readonly [],
  }),
  anatomicalLaterality: Object.freeze({
    verifiedProfileRefs: Object.freeze([]) as readonly [],
    finalAssertionRef: null,
    productionLateralityBindingAllowed: false as const,
  }),
  prohibitedPromotions: Object.freeze([
    'preview_to_saved_pixel_authority',
    'provider_side_label_to_anatomical_laterality',
    'file_upload_to_controlled_capture_attestation',
    'design_only_protocol_to_production_laterality',
    'unreviewed_calibration_to_verified_profile',
  ] as const),
});

export function validateControlledCaptureCalibrationEvidenceFR21B(
  evidence: ControlledCaptureCalibrationEvidenceFR21BV1,
): ControlledCaptureCalibrationEvidenceFR21BV1 {
  exactKeys(evidence, ALLOWED_CALIBRATION_KEYS, `FR-21B calibration ${evidence.evidenceRef}`);
  if (evidence.schemaVersion !== 'fr21b-calibration-v1') {
    throw new FaceAuthorityValidationError('FR-21B calibration schemaVersion must be fr21b-calibration-v1.');
  }
  stableKey(evidence.evidenceRef, 'fr21b.calibration.evidenceRef');
  stableKey(evidence.profileRef, `fr21b.${evidence.evidenceRef}.profileRef`);
  stableKey(evidence.targetRef, `fr21b.${evidence.evidenceRef}.targetRef`);
  if (evidence.targetKind !== 'deterministic_asymmetric') {
    throw new FaceAuthorityValidationError(`FR-21B calibration target must be deterministic_asymmetric: ${evidence.evidenceRef}`);
  }
  if (!REQUIRED_FACINGS.includes(evidence.cameraFacing)) {
    throw new FaceAuthorityValidationError(`FR-21B calibration has unknown cameraFacing: ${String(evidence.cameraFacing)}`);
  }
  if (evidence.markerAnatomicalSide !== 'left' && evidence.markerAnatomicalSide !== 'right') {
    throw new FaceAuthorityValidationError(`FR-21B calibration has unknown marker anatomical side: ${String(evidence.markerAnatomicalSide)}`);
  }

  unique(evidence.stages.map((stage) => stage.stage), `fr21b.${evidence.evidenceRef}.stages`);
  if (!sameStringSet(evidence.stages.map((stage) => stage.stage), REQUIRED_STAGES)) {
    throw new FaceAuthorityValidationError(`FR-21B calibration must observe preview/raw/encoded/canonical stages: ${evidence.evidenceRef}`);
  }
  for (const stage of evidence.stages) {
    exactKeys(stage, ALLOWED_STAGE_KEYS, `FR-21B calibration ${evidence.evidenceRef}.${stage.stage}`);
    if (!REQUIRED_STAGES.includes(stage.stage)) {
      throw new FaceAuthorityValidationError(`FR-21B calibration has unknown stage: ${String(stage.stage)}`);
    }
    if (stage.markerImageSide !== 'left' && stage.markerImageSide !== 'right') {
      throw new FaceAuthorityValidationError(`FR-21B calibration has unknown marker image side: ${String(stage.markerImageSide)}`);
    }
    nonEmpty(stage.artifactEvidenceRef, `fr21b.${evidence.evidenceRef}.${stage.stage}.artifactEvidenceRef`);
  }
  unique(evidence.stages.map((stage) => stage.artifactEvidenceRef), `fr21b.${evidence.evidenceRef}.artifactEvidenceRefs`);

  if (evidence.encodedExifOrientation !== null &&
      (!Number.isInteger(evidence.encodedExifOrientation) || evidence.encodedExifOrientation < 1 || evidence.encodedExifOrientation > 8)) {
    throw new FaceAuthorityValidationError(`FR-21B encoded EXIF Orientation must be 1..8 or null: ${evidence.evidenceRef}`);
  }
  if (evidence.reviewState !== 'research_candidate' && evidence.reviewState !== 'reviewed') {
    throw new FaceAuthorityValidationError(`FR-21B calibration has unknown reviewState: ${String(evidence.reviewState)}`);
  }
  if (evidence.evidenceRefs.length === 0) {
    throw new FaceAuthorityValidationError(`FR-21B calibration requires evidenceRefs: ${evidence.evidenceRef}`);
  }
  unique(evidence.evidenceRefs, `fr21b.${evidence.evidenceRef}.evidenceRefs`);
  if (evidence.limitations.length === 0) {
    throw new FaceAuthorityValidationError(`FR-21B calibration requires limitations: ${evidence.evidenceRef}`);
  }
  return evidence;
}

export function deriveControlledCaptureLateralityAssertionFR21B(
  evidence: ControlledCaptureCalibrationEvidenceFR21BV1,
): ControlledCaptureFinalLateralityAssertionFR21BV1 {
  validateControlledCaptureCalibrationEvidenceFR21B(evidence);
  const canonical = evidence.stages.find((stage) => stage.stage === 'canonical_pixels');
  if (canonical === undefined) {
    throw new FaceAuthorityValidationError(`FR-21B calibration lacks canonical pixel observation: ${evidence.evidenceRef}`);
  }
  return assertionFromMarker(evidence.markerAnatomicalSide, canonical.markerImageSide);
}

export function validateControlledCaptureProfileAttestationFR21B(
  profile: ControlledCaptureProfileAttestationFR21BV1,
  calibrationEvidence: readonly ControlledCaptureCalibrationEvidenceFR21BV1[],
): ControlledCaptureProfileAttestationFR21BV1 {
  exactKeys(profile, ALLOWED_PROFILE_KEYS, `FR-21B profile ${profile.profileRef}`);
  if (profile.schemaVersion !== 'fr21b-profile-v1') {
    throw new FaceAuthorityValidationError('FR-21B profile schemaVersion must be fr21b-profile-v1.');
  }
  stableKey(profile.profileRef, 'fr21b.profileRef');
  exactKeys(profile.implementation, ALLOWED_IMPLEMENTATION_KEYS, `FR-21B profile ${profile.profileRef}.implementation`);
  nonEmpty(profile.implementation.repository, `fr21b.${profile.profileRef}.implementation.repository`);
  commitSha(profile.implementation.repositoryCommit, `fr21b.${profile.profileRef}.implementation.repositoryCommit`);
  nonEmpty(profile.implementation.sourcePath, `fr21b.${profile.profileRef}.implementation.sourcePath`);
  commitSha(profile.implementation.sourceBlobSha, `fr21b.${profile.profileRef}.implementation.sourceBlobSha`);

  if (!REQUIRED_FACINGS.includes(profile.cameraFacing)) {
    throw new FaceAuthorityValidationError(`FR-21B profile has unknown cameraFacing: ${String(profile.cameraFacing)}`);
  }
  if (profile.rawCaptureOrientation !== 'sensor_coordinate_frame' &&
      profile.rawCaptureOrientation !== 'display_oriented_coordinate_frame') {
    throw new FaceAuthorityValidationError(`FR-21B profile has unknown rawCaptureOrientation: ${String(profile.rawCaptureOrientation)}`);
  }
  if (profile.previewMirrorPolicy !== 'mirrored_relative_to_subject' &&
      profile.previewMirrorPolicy !== 'unmirrored_relative_to_subject') {
    throw new FaceAuthorityValidationError(`FR-21B profile has unknown previewMirrorPolicy: ${String(profile.previewMirrorPolicy)}`);
  }
  if (profile.savedPixelMirrorPolicy !== 'mirrored_relative_to_subject' &&
      profile.savedPixelMirrorPolicy !== 'unmirrored_relative_to_subject') {
    throw new FaceAuthorityValidationError(`FR-21B profile has unknown savedPixelMirrorPolicy: ${String(profile.savedPixelMirrorPolicy)}`);
  }
  if (profile.exifOrientationPolicy !== 'absent_or_identity' &&
      profile.exifOrientationPolicy !== 'metadata_may_encode_transform') {
    throw new FaceAuthorityValidationError(`FR-21B profile has unknown exifOrientationPolicy: ${String(profile.exifOrientationPolicy)}`);
  }
  if (profile.canonicalizationTransform !== 'identity' &&
      profile.canonicalizationTransform !== 'fr19_sharp_auto_orient_then_reencode_same_supported_format') {
    throw new FaceAuthorityValidationError(`FR-21B profile has unknown canonicalizationTransform: ${String(profile.canonicalizationTransform)}`);
  }
  if (profile.finalAnatomicalLateralityAssertion !== 'image_left_is_subject_anatomical_left' &&
      profile.finalAnatomicalLateralityAssertion !== 'image_left_is_subject_anatomical_right') {
    throw new FaceAuthorityValidationError(`FR-21B profile has unknown final anatomical assertion: ${String(profile.finalAnatomicalLateralityAssertion)}`);
  }
  if (profile.reviewState !== 'research_candidate' && profile.reviewState !== 'verified') {
    throw new FaceAuthorityValidationError(`FR-21B profile has unknown reviewState: ${String(profile.reviewState)}`);
  }

  unique(profile.calibrationEvidenceRefs, `fr21b.${profile.profileRef}.calibrationEvidenceRefs`);
  unique(profile.evidenceRefs, `fr21b.${profile.profileRef}.evidenceRefs`);
  if (profile.evidenceRefs.length === 0) {
    throw new FaceAuthorityValidationError(`FR-21B profile requires implementation evidenceRefs: ${profile.profileRef}`);
  }

  const evidenceByRef = new Map(calibrationEvidence.map((entry) => [entry.evidenceRef, entry] as const));
  for (const evidenceRef of profile.calibrationEvidenceRefs) {
    const evidence = evidenceByRef.get(evidenceRef);
    if (evidence === undefined) {
      throw new FaceAuthorityValidationError(`FR-21B profile references unknown calibration evidence: ${evidenceRef}`);
    }
    validateControlledCaptureCalibrationEvidenceFR21B(evidence);
    if (evidence.profileRef !== profile.profileRef) {
      throw new FaceAuthorityValidationError(`FR-21B calibration profile mismatch: ${evidenceRef}`);
    }
    if (evidence.cameraFacing !== profile.cameraFacing) {
      throw new FaceAuthorityValidationError(`FR-21B calibration camera-facing mismatch: ${evidenceRef}`);
    }

    const preview = evidence.stages.find((stage) => stage.stage === 'preview');
    const encoded = evidence.stages.find((stage) => stage.stage === 'encoded_pixels');
    const canonical = evidence.stages.find((stage) => stage.stage === 'canonical_pixels');
    if (preview === undefined || encoded === undefined || canonical === undefined) {
      throw new FaceAuthorityValidationError(`FR-21B calibration stage resolution failed: ${evidenceRef}`);
    }

    const observedPreviewPolicy = mirrorPolicyFromMarker(evidence.markerAnatomicalSide, preview.markerImageSide);
    if (observedPreviewPolicy !== profile.previewMirrorPolicy) {
      throw new FaceAuthorityValidationError(`FR-21B preview mirror policy contradicts asymmetric calibration evidence: ${evidenceRef}`);
    }
    const observedSavedPolicy = mirrorPolicyFromMarker(evidence.markerAnatomicalSide, encoded.markerImageSide);
    if (observedSavedPolicy !== profile.savedPixelMirrorPolicy) {
      throw new FaceAuthorityValidationError(`FR-21B saved-pixel mirror policy contradicts asymmetric calibration evidence: ${evidenceRef}`);
    }

    if (profile.exifOrientationPolicy === 'absent_or_identity' &&
        evidence.encodedExifOrientation !== null && evidence.encodedExifOrientation !== 1) {
      throw new FaceAuthorityValidationError(`FR-21B EXIF orientation policy contradicts encoded artifact evidence: ${evidenceRef}`);
    }
    if (profile.canonicalizationTransform === 'identity' && canonical.markerImageSide !== encoded.markerImageSide) {
      throw new FaceAuthorityValidationError(`FR-21B identity canonicalization contradicts encoded/canonical marker evidence: ${evidenceRef}`);
    }
    if (profile.canonicalizationTransform === 'fr19_sharp_auto_orient_then_reencode_same_supported_format' &&
        (evidence.encodedExifOrientation === null || evidence.encodedExifOrientation === 1) &&
        canonical.markerImageSide !== encoded.markerImageSide) {
      throw new FaceAuthorityValidationError(`FR-21B FR-19 canonicalization contradicts identity/no-EXIF marker evidence: ${evidenceRef}`);
    }

    if (assertionFromMarker(evidence.markerAnatomicalSide, canonical.markerImageSide) !== profile.finalAnatomicalLateralityAssertion) {
      throw new FaceAuthorityValidationError(`FR-21B final anatomical assertion is not supported by canonical calibration evidence: ${evidenceRef}`);
    }
    if (profile.reviewState === 'verified' && evidence.reviewState !== 'reviewed') {
      throw new FaceAuthorityValidationError(`FR-21B verified profile requires reviewed calibration evidence: ${evidenceRef}`);
    }
  }

  if (profile.reviewState === 'verified' && profile.calibrationEvidenceRefs.length === 0) {
    throw new FaceAuthorityValidationError(`FR-21B verified profile requires deterministic asymmetric calibration evidence: ${profile.profileRef}`);
  }
  return profile;
}

export function validateControlledCaptureAuthorityFR21B(
  authority: ControlledCaptureAuthorityFR21BV1 = CONTROLLED_CAPTURE_AUTHORITY_FR21B,
): ControlledCaptureAuthorityFR21BV1 {
  exactKeys(authority, ALLOWED_AUTHORITY_KEYS, 'FR-21B authority');
  if (authority.schemaVersion !== 'fr21b-v1') throw new FaceAuthorityValidationError('FR-21B schemaVersion must be fr21b-v1.');
  nonEmpty(authority.authorityVersion, 'fr21b.authorityVersion');
  if (authority.authorityState !== 'research_only') {
    throw new FaceAuthorityValidationError('FR-21B authorityState must remain research_only.');
  }

  exactKeys(authority.baseline, ALLOWED_BASELINE_KEYS, 'FR-21B baseline');
  if (authority.baseline.captureOrientationAuthorityVersion !== CAPTURE_ORIENTATION_AUTHORITY_FR19.authorityVersion) {
    throw new FaceAuthorityValidationError('FR-21B must pin the merged FR-19 capture orientation authority version.');
  }
  if (authority.baseline.lateralityConsumptionPolicyVersion !== LATERALITY_CONSUMPTION_POLICY_FR20.policyVersion) {
    throw new FaceAuthorityValidationError('FR-21B must pin the merged FR-20 laterality consumption policy version.');
  }

  exactKeys(authority.currentImplementation, ALLOWED_IMPLEMENTATION_STATE_KEYS, 'FR-21B currentImplementation');
  if (authority.currentImplementation.controlledCaptureContractState !== 'not_implemented' ||
      authority.currentImplementation.implementationRef !== null ||
      authority.currentImplementation.profileRefs.length !== 0) {
    throw new FaceAuthorityValidationError('FR-21B v0.1 must not invent an implemented controlled capture contract.');
  }

  exactKeys(authority.calibrationProtocol, ALLOWED_PROTOCOL_KEYS, 'FR-21B calibrationProtocol');
  if (authority.calibrationProtocol.protocolState !== 'design_only' ||
      authority.calibrationProtocol.targetRequirement !== 'deterministic_asymmetric') {
    throw new FaceAuthorityValidationError('FR-21B v0.1 calibration protocol must remain deterministic-asymmetric design_only.');
  }
  if (!sameStringSet(authority.calibrationProtocol.requiredCameraFacings, REQUIRED_FACINGS)) {
    throw new FaceAuthorityValidationError('FR-21B calibration protocol must cover front and rear camera facings.');
  }
  if (!sameStringSet(authority.calibrationProtocol.requiredStages, REQUIRED_STAGES)) {
    throw new FaceAuthorityValidationError('FR-21B calibration protocol must preserve preview/raw/encoded/canonical stage boundaries.');
  }
  if (authority.calibrationProtocol.evidenceRefs.length !== 0) {
    throw new FaceAuthorityValidationError('FR-21B v0.1 has no executed calibration evidence yet.');
  }

  exactKeys(authority.anatomicalLaterality, ALLOWED_LATERALITY_KEYS, 'FR-21B anatomicalLaterality');
  if (authority.anatomicalLaterality.verifiedProfileRefs.length !== 0 ||
      authority.anatomicalLaterality.finalAssertionRef !== null ||
      authority.anatomicalLaterality.productionLateralityBindingAllowed !== false) {
    throw new FaceAuthorityValidationError('FR-21B anatomical laterality must remain blocked until verified controlled capture exists.');
  }

  const expectedPromotions = [
    'preview_to_saved_pixel_authority',
    'provider_side_label_to_anatomical_laterality',
    'file_upload_to_controlled_capture_attestation',
    'design_only_protocol_to_production_laterality',
    'unreviewed_calibration_to_verified_profile',
  ];
  if (!sameStringSet(authority.prohibitedPromotions, expectedPromotions)) {
    throw new FaceAuthorityValidationError('FR-21B prohibited promotion set is incomplete.');
  }
  return authority;
}

export function resolveControlledCaptureReadinessFR21B(
  authority: ControlledCaptureAuthorityFR21BV1 = CONTROLLED_CAPTURE_AUTHORITY_FR21B,
): ControlledCaptureReadinessFR21BV1 {
  validateControlledCaptureAuthorityFR21B(authority);
  return Object.freeze({
    productionReady: false as const,
    controlledCaptureState: 'not_implemented' as const,
    calibrationState: 'design_only' as const,
    anatomicalLateralityState: 'blocked' as const,
    reason: 'no_verified_controlled_capture_implementation' as const,
    blockers: Object.freeze([
      'no browser/native controlled capture implementation contract is pinned',
      'no deterministic asymmetric calibration run has been executed',
      'no verified front/rear capture profile exists',
      'FR-19 source-pixel mirror state therefore remains unresolved for ordinary file upload',
      'FR-20/FR-21A anatomical-side production consumption remains blocked',
    ]),
  });
}
