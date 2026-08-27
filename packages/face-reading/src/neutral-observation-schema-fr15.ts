import {
  FACELAB_COMPATIBILITY_REPORT_V0,
  type FaceLabCompatibilityReport,
} from './facelab-compat.js';
import {
  FACELAB_NEUTRAL_BINDING_PROFILE_FR14,
  assessNeutralProviderBindingReadinessFR14,
  validateNeutralProviderBindingProfileFR14,
  type NeutralAnchorConsumerSlotV1,
  type NeutralProviderBindingProfileV1,
  type NeutralProviderCapabilityV1,
} from './neutral-provider-bindings-fr14.js';
import { FaceAuthorityValidationError } from './validation.js';

export interface NormalizedPoint2DV1 {
  readonly x: number;
  readonly y: number;
}

export type NeutralObservationGeometryV1 =
  | { readonly kind: 'point'; readonly point: NormalizedPoint2DV1 }
  | { readonly kind: 'curve'; readonly points: readonly NormalizedPoint2DV1[] }
  | { readonly kind: 'region'; readonly boundary: readonly NormalizedPoint2DV1[] };

export type NeutralObservationAvailabilityV1 = 'observed' | 'unavailable';

export interface NeutralObservationQualityV1 {
  readonly visibility: 'clear' | 'partial' | 'not_visible';
  readonly confidence: number | null;
  readonly reasons: readonly string[];
}

export interface NeutralObservationItemV1 {
  readonly observationRef: string;
  readonly anchorRef: string;
  readonly consumerSlot: NeutralAnchorConsumerSlotV1;
  readonly availability: NeutralObservationAvailabilityV1;
  readonly geometry?: NeutralObservationGeometryV1;
  readonly quality: NeutralObservationQualityV1;
  readonly producedByCapabilities: readonly NeutralProviderCapabilityV1[];
  readonly derivedFromObservationRefs?: readonly string[];
}

export interface NeutralObservationPoseV1 {
  readonly yawDegrees: number;
  readonly pitchDegrees: number;
  readonly rollDegrees: number;
  readonly qualityState: 'usable' | 'limited' | 'unusable';
  readonly reasons: readonly string[];
}

export interface NeutralObservationProvenanceV1 {
  readonly providerKey: 'visually_facelab';
  readonly providerContractVersion: string;
  readonly adapterVersion: string;
  readonly providerModelRef: string;
  readonly providerRunRef: string;
  readonly canonicalAssetDigest: string;
  readonly evidenceRefs: readonly string[];
  readonly rawSourcePersisted: false;
  readonly rawProviderResponsePersisted: false;
  readonly biometricEmbeddingPersisted: false;
}

export interface NeutralObservationBundleV1 {
  readonly schemaVersion: 'v1';
  readonly contractVersion: 'myeongha-neutral-observation-v1';
  readonly bindingProfileVersion: string;
  readonly providerKey: 'visually_facelab';
  readonly providerContractVersion: string;
  readonly coordinateFrame: 'canonical_image_normalized_2d';
  readonly pose: NeutralObservationPoseV1;
  readonly availableCapabilities: readonly NeutralProviderCapabilityV1[];
  readonly observations: readonly NeutralObservationItemV1[];
  readonly provenance: NeutralObservationProvenanceV1;
}

export interface NeutralObservationBundleReadinessV1 {
  readonly state: 'usable' | 'section_limited' | 'blocked';
  readonly neutralIngestionReady: boolean;
  readonly semanticPromotionState: 'blocked_traditional_operationalization_required';
  readonly unavailableAnchorRefs: readonly string[];
  readonly blockers: readonly string[];
}

export interface IssuedNeutralObservationArtifactV1 {
  readonly authorityState: 'neutral_observation_only';
  readonly schemaVersion: 'v1';
  readonly bundle: NeutralObservationBundleV1;
  readonly prohibitedSemanticUses: readonly [
    'traditional_anchor_equivalence',
    'physiognomy_claim_generation',
    'fortune_claim_generation',
    'identity_matching',
  ];
}

const REQUIRED_GEOMETRY_KIND_BY_SLOT: Readonly<Record<NeutralAnchorConsumerSlotV1, NeutralObservationGeometryV1['kind']>> = Object.freeze({
  'neutral.face.brow_midline': 'point',
  'neutral.face.nose_region': 'region',
  'neutral.face.left_brow_region': 'curve',
  'neutral.face.right_brow_region': 'curve',
  'neutral.face.left_eye_region': 'region',
  'neutral.face.right_eye_region': 'region',
});

const ALLOWED_CAPABILITIES = new Set<NeutralProviderCapabilityV1>([
  'neutral_pose_quality',
  'neutral_brow_regions',
  'neutral_brow_midline_derivation',
  'neutral_eye_regions',
  'neutral_nose_region',
]);

const ALLOWED_BUNDLE_KEYS = new Set([
  'schemaVersion', 'contractVersion', 'bindingProfileVersion', 'providerKey', 'providerContractVersion',
  'coordinateFrame', 'pose', 'availableCapabilities', 'observations', 'provenance',
]);
const ALLOWED_OBSERVATION_KEYS = new Set([
  'observationRef', 'anchorRef', 'consumerSlot', 'availability', 'geometry', 'quality',
  'producedByCapabilities', 'derivedFromObservationRefs',
]);
const ALLOWED_POSE_KEYS = new Set(['yawDegrees', 'pitchDegrees', 'rollDegrees', 'qualityState', 'reasons']);
const ALLOWED_QUALITY_KEYS = new Set(['visibility', 'confidence', 'reasons']);
const ALLOWED_POINT_KEYS = new Set(['x', 'y']);
const ALLOWED_POINT_GEOMETRY_KEYS = new Set(['kind', 'point']);
const ALLOWED_CURVE_GEOMETRY_KEYS = new Set(['kind', 'points']);
const ALLOWED_REGION_GEOMETRY_KEYS = new Set(['kind', 'boundary']);
const ALLOWED_PROVENANCE_KEYS = new Set([
  'providerKey', 'providerContractVersion', 'adapterVersion', 'providerModelRef', 'providerRunRef',
  'canonicalAssetDigest', 'evidenceRefs', 'rawSourcePersisted', 'rawProviderResponsePersisted',
  'biometricEmbeddingPersisted',
]);

const SHA256 = /^sha256:[0-9a-f]{64}$/u;
const ISSUED_NEUTRAL_ARTIFACTS = new WeakSet<object>();

function nonEmpty(value: string, path: string): void {
  if (value.trim().length === 0) throw new FaceAuthorityValidationError(`${path} must be non-empty.`);
}

function unique(values: readonly string[], path: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new FaceAuthorityValidationError(`${path} contains duplicate: ${value}`);
    seen.add(value);
  }
}

function exactKeys(value: object, allowed: ReadonlySet<string>, path: string): void {
  const unexpected = Object.keys(value).find((key) => !allowed.has(key));
  if (unexpected !== undefined) throw new FaceAuthorityValidationError(`${path} contains unauthorized field: ${unexpected}`);
}

function finite(value: number, path: string): void {
  if (!Number.isFinite(value)) throw new FaceAuthorityValidationError(`${path} must be finite.`);
}

function normalized(value: number, path: string): void {
  finite(value, path);
  if (value < 0 || value > 1) throw new FaceAuthorityValidationError(`${path} must be within [0,1].`);
}

function validatePoint(point: NormalizedPoint2DV1, path: string): void {
  exactKeys(point, ALLOWED_POINT_KEYS, path);
  normalized(point.x, `${path}.x`);
  normalized(point.y, `${path}.y`);
}

function validateGeometry(geometry: NeutralObservationGeometryV1, path: string): void {
  const runtimeKind = (geometry as { readonly kind?: unknown }).kind;
  if (runtimeKind !== 'point' && runtimeKind !== 'curve' && runtimeKind !== 'region') {
    throw new FaceAuthorityValidationError(`${path}.kind is invalid: ${String(runtimeKind)}`);
  }
  if (geometry.kind === 'point') {
    exactKeys(geometry, ALLOWED_POINT_GEOMETRY_KEYS, path);
    validatePoint(geometry.point, `${path}.point`);
    return;
  }
  if (geometry.kind === 'curve') {
    exactKeys(geometry, ALLOWED_CURVE_GEOMETRY_KEYS, path);
    if (geometry.points.length < 2) throw new FaceAuthorityValidationError(`${path}.curve requires at least 2 points.`);
    geometry.points.forEach((point, index) => validatePoint(point, `${path}.points[${index}]`));
    return;
  }
  exactKeys(geometry, ALLOWED_REGION_GEOMETRY_KEYS, path);
  if (geometry.boundary.length < 3) throw new FaceAuthorityValidationError(`${path}.region requires at least 3 boundary points.`);
  geometry.boundary.forEach((point, index) => validatePoint(point, `${path}.boundary[${index}]`));
}

function validateQuality(quality: NeutralObservationQualityV1, availability: NeutralObservationAvailabilityV1, path: string): void {
  exactKeys(quality, ALLOWED_QUALITY_KEYS, path);
  if (!['clear', 'partial', 'not_visible'].includes(quality.visibility)) {
    throw new FaceAuthorityValidationError(`${path}.visibility is invalid: ${String(quality.visibility)}`);
  }
  if (availability === 'observed') {
    if (quality.confidence === null) throw new FaceAuthorityValidationError(`${path}.confidence is required for observed geometry.`);
    normalized(quality.confidence, `${path}.confidence`);
    if (quality.visibility === 'not_visible') throw new FaceAuthorityValidationError(`${path}.visibility cannot be not_visible for observed geometry.`);
    return;
  }
  if (quality.confidence !== null) throw new FaceAuthorityValidationError(`${path}.confidence must be null when unavailable.`);
  if (quality.visibility !== 'not_visible') throw new FaceAuthorityValidationError(`${path}.visibility must be not_visible when unavailable.`);
  if (quality.reasons.length === 0) throw new FaceAuthorityValidationError(`${path}.reasons are required when unavailable.`);
}

function validatePose(pose: NeutralObservationPoseV1): void {
  exactKeys(pose, ALLOWED_POSE_KEYS, 'fr15.pose');
  finite(pose.yawDegrees, 'fr15.pose.yawDegrees');
  finite(pose.pitchDegrees, 'fr15.pose.pitchDegrees');
  finite(pose.rollDegrees, 'fr15.pose.rollDegrees');
  if (!['usable', 'limited', 'unusable'].includes(pose.qualityState)) {
    throw new FaceAuthorityValidationError(`fr15.pose.qualityState is invalid: ${String(pose.qualityState)}`);
  }
  if (pose.qualityState !== 'usable' && pose.reasons.length === 0) {
    throw new FaceAuthorityValidationError('fr15.pose.reasons are required for limited/unusable pose.');
  }
}

function validateCapability(capability: NeutralProviderCapabilityV1, path: string): void {
  if (!ALLOWED_CAPABILITIES.has(capability)) {
    throw new FaceAuthorityValidationError(`${path} contains unknown neutral provider capability: ${String(capability)}`);
  }
}

function validateProvenance(bundle: NeutralObservationBundleV1): void {
  const provenance = bundle.provenance;
  exactKeys(provenance, ALLOWED_PROVENANCE_KEYS, 'FR-15 provenance');
  if (provenance.providerKey !== bundle.providerKey) throw new FaceAuthorityValidationError('FR-15 provenance providerKey must match bundle providerKey.');
  if (provenance.providerContractVersion !== bundle.providerContractVersion) {
    throw new FaceAuthorityValidationError('FR-15 provenance providerContractVersion must match bundle providerContractVersion.');
  }
  nonEmpty(provenance.adapterVersion, 'fr15.provenance.adapterVersion');
  nonEmpty(provenance.providerModelRef, 'fr15.provenance.providerModelRef');
  nonEmpty(provenance.providerRunRef, 'fr15.provenance.providerRunRef');
  if (!SHA256.test(provenance.canonicalAssetDigest)) {
    throw new FaceAuthorityValidationError('FR-15 canonicalAssetDigest must be sha256:<64 lowercase hex>.');
  }
  if (provenance.evidenceRefs.length === 0) throw new FaceAuthorityValidationError('FR-15 provenance requires evidenceRefs.');
  unique(provenance.evidenceRefs, 'fr15.provenance.evidenceRefs');
  if (provenance.rawSourcePersisted !== false || provenance.rawProviderResponsePersisted !== false) {
    throw new FaceAuthorityValidationError('FR-15 raw source/provider persistence must remain false.');
  }
  if (provenance.biometricEmbeddingPersisted !== false) {
    throw new FaceAuthorityValidationError('FR-15 biometric embedding persistence must remain false.');
  }
}

function immutableClone<T>(value: T): T {
  if (Array.isArray(value)) return Object.freeze(value.map((item) => immutableClone(item))) as T;
  if (value !== null && typeof value === 'object') {
    const clone: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) clone[key] = immutableClone(child);
    return Object.freeze(clone) as T;
  }
  return value;
}

export function validateNeutralObservationBundleFR15(
  bundle: NeutralObservationBundleV1,
  profile: NeutralProviderBindingProfileV1 = FACELAB_NEUTRAL_BINDING_PROFILE_FR14,
): NeutralObservationBundleV1 {
  validateNeutralProviderBindingProfileFR14(profile);
  exactKeys(bundle, ALLOWED_BUNDLE_KEYS, 'FR-15 bundle');
  if (bundle.schemaVersion !== 'v1') throw new FaceAuthorityValidationError('FR-15 schemaVersion must be v1.');
  if (bundle.contractVersion !== 'myeongha-neutral-observation-v1') throw new FaceAuthorityValidationError('FR-15 contractVersion mismatch.');
  if (bundle.bindingProfileVersion !== profile.profileVersion) throw new FaceAuthorityValidationError('FR-15 bindingProfileVersion must match the supplied FR-14 profile.');
  if (bundle.providerKey !== profile.providerKey) throw new FaceAuthorityValidationError('FR-15 providerKey mismatch.');
  nonEmpty(bundle.providerContractVersion, 'fr15.providerContractVersion');
  if (profile.providerContractVersion === null || bundle.providerContractVersion !== profile.providerContractVersion) {
    throw new FaceAuthorityValidationError('FR-15 bundle requires the exact pinned providerContractVersion from FR-14.');
  }
  if (bundle.coordinateFrame !== 'canonical_image_normalized_2d') {
    throw new FaceAuthorityValidationError('FR-15 coordinateFrame must remain canonical_image_normalized_2d.');
  }
  validatePose(bundle.pose);
  unique(bundle.availableCapabilities, 'fr15.availableCapabilities');
  bundle.availableCapabilities.forEach((capability) => validateCapability(capability, 'fr15.availableCapabilities'));
  unique(bundle.observations.map((entry) => entry.observationRef), 'fr15.observationRefs');
  unique(bundle.observations.map((entry) => entry.anchorRef), 'fr15.anchorRefs');
  unique(bundle.observations.map((entry) => entry.consumerSlot), 'fr15.consumerSlots');

  if (bundle.observations.length !== profile.bindings.length) {
    throw new FaceAuthorityValidationError('FR-15 bundle must contain exactly one item for every FR-14 neutral binding.');
  }

  const observationRefs = new Set(bundle.observations.map((entry) => entry.observationRef));
  for (const binding of profile.bindings) {
    const observation = bundle.observations.find((entry) => entry.anchorRef === binding.anchorRef);
    if (observation === undefined) throw new FaceAuthorityValidationError(`FR-15 missing neutral observation: ${binding.anchorRef}`);
    exactKeys(observation, ALLOWED_OBSERVATION_KEYS, `FR-15 observation ${binding.anchorRef}`);
    nonEmpty(observation.observationRef, `fr15.${binding.anchorRef}.observationRef`);
    if (observation.consumerSlot !== binding.consumerSlot) throw new FaceAuthorityValidationError(`FR-15 consumerSlot mismatch for ${binding.anchorRef}.`);
    if (observation.availability !== 'observed' && observation.availability !== 'unavailable') {
      throw new FaceAuthorityValidationError(`FR-15 availability is invalid for ${binding.anchorRef}: ${String(observation.availability)}`);
    }
    unique(observation.producedByCapabilities, `fr15.${binding.anchorRef}.producedByCapabilities`);
    observation.producedByCapabilities.forEach((capability) => validateCapability(capability, `fr15.${binding.anchorRef}.producedByCapabilities`));
    for (const capability of binding.requiredCapabilities) {
      if (!observation.producedByCapabilities.includes(capability)) {
        throw new FaceAuthorityValidationError(`FR-15 ${binding.anchorRef} missing required production capability: ${capability}`);
      }
    }
    for (const capability of observation.producedByCapabilities) {
      if (!bundle.availableCapabilities.includes(capability)) {
        throw new FaceAuthorityValidationError(`FR-15 ${binding.anchorRef} capability not declared at bundle level: ${capability}`);
      }
    }
    validateQuality(observation.quality, observation.availability, `fr15.${binding.anchorRef}.quality`);

    if (observation.availability === 'observed') {
      if (observation.geometry === undefined) throw new FaceAuthorityValidationError(`FR-15 observed item requires geometry: ${binding.anchorRef}`);
      const expectedKind = REQUIRED_GEOMETRY_KIND_BY_SLOT[binding.consumerSlot];
      if (observation.geometry.kind !== expectedKind) {
        throw new FaceAuthorityValidationError(`FR-15 geometry kind mismatch for ${binding.anchorRef}: expected ${expectedKind}, got ${observation.geometry.kind}.`);
      }
      validateGeometry(observation.geometry, `fr15.${binding.anchorRef}.geometry`);
    } else if (observation.geometry !== undefined) {
      throw new FaceAuthorityValidationError(`FR-15 unavailable item must not carry geometry: ${binding.anchorRef}`);
    }

    unique(observation.derivedFromObservationRefs ?? [], `fr15.${binding.anchorRef}.derivedFromObservationRefs`);
    for (const ref of observation.derivedFromObservationRefs ?? []) {
      if (ref === observation.observationRef) throw new FaceAuthorityValidationError(`FR-15 derivation cannot self-reference: ${ref}`);
      if (!observationRefs.has(ref)) throw new FaceAuthorityValidationError(`FR-15 derivation references unknown observation: ${ref}`);
    }
  }

  validateProvenance(bundle);
  return bundle;
}

export function assessNeutralObservationBundleReadinessFR15(input: {
  readonly bundle: NeutralObservationBundleV1;
  readonly profile?: NeutralProviderBindingProfileV1;
  readonly compatibilityReport?: FaceLabCompatibilityReport;
}): NeutralObservationBundleReadinessV1 {
  const profile = input.profile ?? FACELAB_NEUTRAL_BINDING_PROFILE_FR14;
  const report = input.compatibilityReport ?? FACELAB_COMPATIBILITY_REPORT_V0;
  validateNeutralObservationBundleFR15(input.bundle, profile);
  const providerReadiness = assessNeutralProviderBindingReadinessFR14({
    profile,
    compatibilityReport: report,
    availableCapabilities: input.bundle.availableCapabilities,
  });
  const blockers = [...providerReadiness.blockers];
  if (input.bundle.pose.qualityState === 'unusable') blockers.push('neutral observation pose is unusable');
  const unavailableAnchorRefs = input.bundle.observations.filter((entry) => entry.availability === 'unavailable').map((entry) => entry.anchorRef);
  const state = blockers.length > 0
    ? 'blocked' as const
    : input.bundle.pose.qualityState === 'limited' || unavailableAnchorRefs.length > 0
      ? 'section_limited' as const
      : 'usable' as const;

  return Object.freeze({
    state,
    neutralIngestionReady: state !== 'blocked',
    semanticPromotionState: 'blocked_traditional_operationalization_required' as const,
    unavailableAnchorRefs: Object.freeze(unavailableAnchorRefs),
    blockers: Object.freeze(blockers),
  });
}

export function issueNeutralObservationArtifactFR15(input: {
  readonly bundle: NeutralObservationBundleV1;
  readonly profile?: NeutralProviderBindingProfileV1;
  readonly compatibilityReport?: FaceLabCompatibilityReport;
}): IssuedNeutralObservationArtifactV1 {
  const readiness = assessNeutralObservationBundleReadinessFR15(input);
  if (!readiness.neutralIngestionReady) {
    throw new FaceAuthorityValidationError(`FR-15 neutral observation ingestion is blocked: ${readiness.blockers.join('; ')}`);
  }
  const detachedBundle = immutableClone(input.bundle);
  const artifact: IssuedNeutralObservationArtifactV1 = Object.freeze({
    authorityState: 'neutral_observation_only' as const,
    schemaVersion: 'v1' as const,
    bundle: detachedBundle,
    prohibitedSemanticUses: Object.freeze([
      'traditional_anchor_equivalence',
      'physiognomy_claim_generation',
      'fortune_claim_generation',
      'identity_matching',
    ] as const),
  });
  ISSUED_NEUTRAL_ARTIFACTS.add(artifact);
  return artifact;
}

export function assertIssuedNeutralObservationArtifactFR15(artifact: IssuedNeutralObservationArtifactV1): void {
  if (!ISSUED_NEUTRAL_ARTIFACTS.has(artifact)) {
    throw new FaceAuthorityValidationError('FR-15 neutral observation artifact was not issued by the FR-15 runtime gate.');
  }
}
