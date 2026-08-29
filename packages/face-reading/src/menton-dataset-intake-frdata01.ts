import {
  assessMentonValidationDatasetReadinessFR47,
  validateMentonValidationDatasetFR47,
  type MentonValidationDatasetFR47V1,
  type MentonValidationDatasetReadinessFR47V1,
} from './chin-inferior-validation-dataset-fr47.js';
import { FaceAuthorityValidationError } from './validation.js';

export type MentonDatasetAssetContentSignatureFRData01V1 =
  | 'image/png'
  | 'image/jpeg'
  | 'image/webp';

export interface MentonDatasetAssetBindingFRData01V1 {
  readonly captureRef: string;
  readonly relativeAssetPath: string;
}

export interface MentonDatasetIntakeManifestFRData01V1 {
  readonly schemaVersion: 'fr-data01-intake-v1';
  readonly dataset: MentonValidationDatasetFR47V1;
  readonly assets: readonly MentonDatasetAssetBindingFRData01V1[];
}

export interface MentonDatasetVerifiedAssetFRData01V1 {
  readonly captureRef: string;
  readonly relativeAssetPath: string;
  readonly actualDigest: string;
  readonly byteLength: number;
  readonly contentSignature: MentonDatasetAssetContentSignatureFRData01V1;
}

export interface MentonDatasetIntakeReportFRData01V1 {
  readonly schemaVersion: 'fr-data01-intake-report-v1';
  readonly datasetRef: string;
  readonly subjectCount: number;
  readonly captureCount: number;
  readonly annotationCount: number;
  readonly verifiedAssetCount: number;
  readonly datasetStructureValidated: true;
  readonly assetCoverageComplete: true;
  readonly assetDigestsVerified: true;
  readonly assetContentSignaturesVerified: true;
  readonly assetPathsConfinedToDeclaredRoot: true;
  readonly imageDecodabilityVerified: false;
  readonly imageDimensionsVerifiedAgainstBytes: false;
  readonly fr47Readiness: MentonValidationDatasetReadinessFR47V1;
  readonly empiricalScoringPerformed: false;
  readonly providerCandidateToMentonMappingValidated: false;
  readonly repeatedCaptureRepeatabilityValidated: false;
  readonly poseStabilityValidated: false;
  readonly calibrationThresholdsDefined: false;
  readonly fr35PointToContourRelationValidated: false;
  readonly traditionalDigeEquivalenceValidated: false;
  readonly researchCandidateAdmitted: false;
  readonly productionGeometryAuthorized: false;
}

function nonEmpty(value: string, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new FaceAuthorityValidationError(`FR-DATA-01 ${label} must be non-empty.`);
  }
  return value;
}

function unique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) {
    throw new FaceAuthorityValidationError(`FR-DATA-01 ${label} must be unique.`);
  }
}

function validateCanonicalSha256(value: string, label: string): string {
  if (!/^sha256:[0-9a-f]{64}$/.test(value)) {
    throw new FaceAuthorityValidationError(`FR-DATA-01 ${label} must use canonical lowercase sha256:<64-hex> form.`);
  }
  return value;
}

export function validateMentonDatasetRelativeAssetPathFRData01(relativeAssetPath: string): string {
  nonEmpty(relativeAssetPath, 'relativeAssetPath');
  if (relativeAssetPath.includes('\\') || relativeAssetPath.includes('\0') || relativeAssetPath.startsWith('/')) {
    throw new FaceAuthorityValidationError('FR-DATA-01 asset paths must use canonical root-relative POSIX form.');
  }
  const segments = relativeAssetPath.split('/');
  if (segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..')) {
    throw new FaceAuthorityValidationError('FR-DATA-01 asset paths cannot contain empty, dot, or parent traversal segments.');
  }
  return relativeAssetPath;
}

export function validateMentonDatasetIntakeManifestFRData01(
  manifest: MentonDatasetIntakeManifestFRData01V1,
): MentonDatasetIntakeManifestFRData01V1 {
  if (manifest.schemaVersion !== 'fr-data01-intake-v1') {
    throw new FaceAuthorityValidationError('FR-DATA-01 intake manifest schema drift.');
  }
  validateMentonValidationDatasetFR47(manifest.dataset);
  const captureRefs = manifest.dataset.captures.map((capture) => capture.captureRef);
  unique(manifest.assets.map((asset) => asset.captureRef), 'asset capture refs');
  unique(manifest.assets.map((asset) => asset.relativeAssetPath), 'relative asset paths');
  if (manifest.assets.length !== captureRefs.length) {
    throw new FaceAuthorityValidationError('FR-DATA-01 requires exactly one asset binding per FR-47 capture.');
  }
  const expectedCaptureRefs = new Set(captureRefs);
  for (const capture of manifest.dataset.captures) {
    validateCanonicalSha256(capture.canonicalAssetDigest, `capture ${capture.captureRef} canonicalAssetDigest`);
  }
  for (const asset of manifest.assets) {
    nonEmpty(asset.captureRef, 'asset captureRef');
    validateMentonDatasetRelativeAssetPathFRData01(asset.relativeAssetPath);
    if (!expectedCaptureRefs.has(asset.captureRef)) {
      throw new FaceAuthorityValidationError(`FR-DATA-01 asset binding references unknown capture ${asset.captureRef}.`);
    }
  }
  for (const captureRef of captureRefs) {
    if (!manifest.assets.some((asset) => asset.captureRef === captureRef)) {
      throw new FaceAuthorityValidationError(`FR-DATA-01 capture ${captureRef} is missing its asset binding.`);
    }
  }
  return manifest;
}

export function buildMentonDatasetIntakeReportFRData01(
  manifest: MentonDatasetIntakeManifestFRData01V1,
  verifiedAssets: readonly MentonDatasetVerifiedAssetFRData01V1[],
): MentonDatasetIntakeReportFRData01V1 {
  validateMentonDatasetIntakeManifestFRData01(manifest);
  unique(verifiedAssets.map((asset) => asset.captureRef), 'verified asset capture refs');
  unique(verifiedAssets.map((asset) => asset.relativeAssetPath), 'verified relative asset paths');
  if (verifiedAssets.length !== manifest.dataset.captures.length) {
    throw new FaceAuthorityValidationError('FR-DATA-01 verified asset count must exactly match capture count.');
  }

  const verifiedDigests: string[] = [];
  for (const binding of manifest.assets) {
    const capture = manifest.dataset.captures.find((entry) => entry.captureRef === binding.captureRef)!;
    const verified = verifiedAssets.find((entry) => entry.captureRef === binding.captureRef);
    if (!verified) throw new FaceAuthorityValidationError(`FR-DATA-01 capture ${binding.captureRef} is missing verified asset evidence.`);
    if (verified.relativeAssetPath !== binding.relativeAssetPath) {
      throw new FaceAuthorityValidationError(`FR-DATA-01 capture ${binding.captureRef} verified path differs from manifest binding.`);
    }
    validateCanonicalSha256(verified.actualDigest, `capture ${binding.captureRef} actualDigest`);
    if (verified.actualDigest !== capture.canonicalAssetDigest) {
      throw new FaceAuthorityValidationError(`FR-DATA-01 capture ${binding.captureRef} asset digest mismatch.`);
    }
    if (!Number.isInteger(verified.byteLength) || verified.byteLength <= 0) {
      throw new FaceAuthorityValidationError(`FR-DATA-01 capture ${binding.captureRef} asset must have positive byte length.`);
    }
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(verified.contentSignature)) {
      throw new FaceAuthorityValidationError(`FR-DATA-01 capture ${binding.captureRef} requires a recognized image content signature.`);
    }
    verifiedDigests.push(verified.actualDigest);
  }
  if (new Set(verifiedDigests).size !== verifiedDigests.length) {
    throw new FaceAuthorityValidationError('FR-DATA-01 distinct capture records cannot reuse byte-identical asset digests.');
  }

  return Object.freeze({
    schemaVersion: 'fr-data01-intake-report-v1' as const,
    datasetRef: manifest.dataset.datasetRef,
    subjectCount: manifest.dataset.subjects.length,
    captureCount: manifest.dataset.captures.length,
    annotationCount: manifest.dataset.annotations.length,
    verifiedAssetCount: verifiedAssets.length,
    datasetStructureValidated: true as const,
    assetCoverageComplete: true as const,
    assetDigestsVerified: true as const,
    assetContentSignaturesVerified: true as const,
    assetPathsConfinedToDeclaredRoot: true as const,
    imageDecodabilityVerified: false as const,
    imageDimensionsVerifiedAgainstBytes: false as const,
    fr47Readiness: assessMentonValidationDatasetReadinessFR47(manifest.dataset),
    empiricalScoringPerformed: false as const,
    providerCandidateToMentonMappingValidated: false as const,
    repeatedCaptureRepeatabilityValidated: false as const,
    poseStabilityValidated: false as const,
    calibrationThresholdsDefined: false as const,
    fr35PointToContourRelationValidated: false as const,
    traditionalDigeEquivalenceValidated: false as const,
    researchCandidateAdmitted: false as const,
    productionGeometryAuthorized: false as const,
  });
}
