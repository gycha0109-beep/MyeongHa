import { FACELAB_NEUTRAL_BINDING_PROFILE_FR14 } from './neutral-provider-bindings-fr14.js';
import { LATERALITY_CONSUMPTION_POLICY_FR20 } from './laterality-consumption-policy-fr20.js';
import type { NormalizedPoint2DV1 } from './neutral-observation-schema-fr15.js';
import {
  FACELAB_PROVIDER_ADAPTER_EVIDENCE_FR16,
  orderClosedCycleProviderVerticesFR16,
  projectClosedCycleRegionTestVectorFR16,
  validateProviderAdapterEvidenceManifestFR16,
  type ProviderConnectionEdgeV1,
} from './provider-adapter-evidence-fr16.js';
import { FaceAuthorityValidationError } from './validation.js';

export type ProviderEyeTopologySymbolFR24 =
  | 'FACE_LANDMARKS_LEFT_EYE'
  | 'FACE_LANDMARKS_RIGHT_EYE';

export interface ProviderEyeTopologyProjectionPointsFR24V1 {
  readonly pointsByProviderVertex: Readonly<Record<number, NormalizedPoint2DV1>>;
}

export interface FaceEyePairResearchProjectionInputFR24V1 {
  readonly providerRunRef: string;
  readonly canonicalAssetDigest: string;
  readonly topologyInputs: Readonly<Record<ProviderEyeTopologySymbolFR24, ProviderEyeTopologyProjectionPointsFR24V1>>;
}

export interface FaceEyePairResearchRegionFR24V1 {
  readonly providerTopologySymbol: ProviderEyeTopologySymbolFR24;
  readonly boundary: readonly NormalizedPoint2DV1[];
}

export interface FaceEyePairResearchProvenanceFR24V1 {
  readonly providerKey: 'visually_facelab';
  readonly providerContractVersion: null;
  readonly providerRunRef: string;
  readonly canonicalAssetDigest: string;
  readonly fr16ManifestVersion: string;
  readonly topologySourceCommit: string;
  readonly topologySourceRefClass: 'upstream_master_structure_witness';
  readonly releaseExactForInstalledPackage: false;
  readonly lateralityPolicyVersion: string;
  readonly rawSourcePersisted: false;
  readonly rawProviderResponsePersisted: false;
  readonly biometricEmbeddingPersisted: false;
}

export interface FaceEyePairResearchArtifactFR24V1 {
  readonly schemaVersion: 'fr24-eye-pair-research-v1';
  readonly artifactVersion: '0.1.0';
  readonly authorityState: 'research_projection_only';
  readonly coordinateFrame: 'canonical_image_normalized_2d';
  readonly regions: readonly FaceEyePairResearchRegionFR24V1[];
  readonly sideAuthority: 'provider_label_only';
  readonly pairConsumptionState: 'unordered_provider_labeled_pair_only';
  readonly serializationOrder: 'provider_topology_symbol_fixed_order_not_side_authority';
  readonly consumerSlotAssignment: null;
  readonly anatomicalLateralityResolved: false;
  readonly traditionalSemanticAuthority: false;
  readonly productionNeutralObservationIssued: false;
  readonly provenance: FaceEyePairResearchProvenanceFR24V1;
}

export interface FaceEyePairResearchBridgeReadinessFR24V1 {
  readonly researchProjectionReady: true;
  readonly productionNeutralObservationReady: false;
  readonly consumerSlotAssignmentReady: false;
  readonly anatomicalLateralityReady: false;
  readonly traditionalSemanticAuthorityGranted: false;
  readonly blockers: readonly string[];
}

export const FR24_EYE_TOPOLOGY_SERIALIZATION_ORDER: readonly ProviderEyeTopologySymbolFR24[] = Object.freeze([
  'FACE_LANDMARKS_LEFT_EYE',
  'FACE_LANDMARKS_RIGHT_EYE',
]);

export const FR24_EYE_TOPOLOGY_WITNESS_EDGES: Readonly<Record<ProviderEyeTopologySymbolFR24, readonly ProviderConnectionEdgeV1[]>> = Object.freeze({
  FACE_LANDMARKS_LEFT_EYE: Object.freeze([
    Object.freeze({ start: 263, end: 249 }),
    Object.freeze({ start: 249, end: 390 }),
    Object.freeze({ start: 390, end: 373 }),
    Object.freeze({ start: 373, end: 374 }),
    Object.freeze({ start: 374, end: 380 }),
    Object.freeze({ start: 380, end: 381 }),
    Object.freeze({ start: 381, end: 382 }),
    Object.freeze({ start: 382, end: 362 }),
    Object.freeze({ start: 263, end: 466 }),
    Object.freeze({ start: 466, end: 388 }),
    Object.freeze({ start: 388, end: 387 }),
    Object.freeze({ start: 387, end: 386 }),
    Object.freeze({ start: 386, end: 385 }),
    Object.freeze({ start: 385, end: 384 }),
    Object.freeze({ start: 384, end: 398 }),
    Object.freeze({ start: 398, end: 362 }),
  ]),
  FACE_LANDMARKS_RIGHT_EYE: Object.freeze([
    Object.freeze({ start: 33, end: 7 }),
    Object.freeze({ start: 7, end: 163 }),
    Object.freeze({ start: 163, end: 144 }),
    Object.freeze({ start: 144, end: 145 }),
    Object.freeze({ start: 145, end: 153 }),
    Object.freeze({ start: 153, end: 154 }),
    Object.freeze({ start: 154, end: 155 }),
    Object.freeze({ start: 155, end: 133 }),
    Object.freeze({ start: 33, end: 246 }),
    Object.freeze({ start: 246, end: 161 }),
    Object.freeze({ start: 161, end: 160 }),
    Object.freeze({ start: 160, end: 159 }),
    Object.freeze({ start: 159, end: 158 }),
    Object.freeze({ start: 158, end: 157 }),
    Object.freeze({ start: 157, end: 173 }),
    Object.freeze({ start: 173, end: 133 }),
  ]),
});

const SHA256 = /^sha256:[0-9a-f]{64}$/u;
const DECIMAL_VERTEX_KEY = /^(0|[1-9][0-9]*)$/u;
const ALLOWED_INPUT_KEYS = new Set(['providerRunRef', 'canonicalAssetDigest', 'topologyInputs']);
const ALLOWED_TOPOLOGY_INPUT_KEYS = new Set(['pointsByProviderVertex']);
const ALLOWED_TOPOLOGY_INPUT_SET_KEYS = new Set<string>(FR24_EYE_TOPOLOGY_SERIALIZATION_ORDER);
const ALLOWED_ARTIFACT_KEYS = new Set([
  'schemaVersion', 'artifactVersion', 'authorityState', 'coordinateFrame', 'regions', 'sideAuthority',
  'pairConsumptionState', 'serializationOrder', 'consumerSlotAssignment', 'anatomicalLateralityResolved',
  'traditionalSemanticAuthority', 'productionNeutralObservationIssued', 'provenance',
]);
const ALLOWED_REGION_KEYS = new Set(['providerTopologySymbol', 'boundary']);
const ALLOWED_PROVENANCE_KEYS = new Set([
  'providerKey', 'providerContractVersion', 'providerRunRef', 'canonicalAssetDigest', 'fr16ManifestVersion',
  'topologySourceCommit', 'topologySourceRefClass', 'releaseExactForInstalledPackage', 'lateralityPolicyVersion',
  'rawSourcePersisted', 'rawProviderResponsePersisted', 'biometricEmbeddingPersisted',
]);
const ALLOWED_POINT_KEYS = new Set(['x', 'y']);

function exactKeys(value: object, allowed: ReadonlySet<string>, path: string): void {
  const unexpected = Object.keys(value).find((key) => !allowed.has(key));
  if (unexpected !== undefined) throw new FaceAuthorityValidationError(`${path} contains unauthorized field: ${unexpected}`);
}

function nonEmpty(value: string, path: string): void {
  if (value.trim().length === 0) throw new FaceAuthorityValidationError(`${path} must be non-empty.`);
}

function validateDigest(value: string, path: string): void {
  if (!SHA256.test(value)) throw new FaceAuthorityValidationError(`${path} must be sha256:<64 lowercase hex>.`);
}

function validatePoint(point: NormalizedPoint2DV1, path: string): void {
  exactKeys(point, ALLOWED_POINT_KEYS, path);
  if (!Number.isFinite(point.x) || point.x < 0 || point.x > 1) {
    throw new FaceAuthorityValidationError(`${path}.x must be finite within [0,1].`);
  }
  if (!Number.isFinite(point.y) || point.y < 0 || point.y > 1) {
    throw new FaceAuthorityValidationError(`${path}.y must be finite within [0,1].`);
  }
}

function validateCurrentAuthorityBoundaryFR24(): void {
  validateProviderAdapterEvidenceManifestFR16();
  if (FACELAB_NEUTRAL_BINDING_PROFILE_FR14.providerContractVersion !== null ||
      FACELAB_NEUTRAL_BINDING_PROFILE_FR14.activationState !== 'blocked') {
    throw new FaceAuthorityValidationError('FR-24 v0.1 requires the current FR-14 FaceLab binding to remain blocked with no providerContractVersion.');
  }
  if (LATERALITY_CONSUMPTION_POLICY_FR20.anatomicalSideConsumptionAllowed !== false) {
    throw new FaceAuthorityValidationError('FR-24 v0.1 requires FR-20 anatomical-side consumption to remain blocked.');
  }
}

function validateTopologySymbolResearchCandidateFR24(symbol: ProviderEyeTopologySymbolFR24): void {
  const slotEvidence = FACELAB_PROVIDER_ADAPTER_EVIDENCE_FR16.slotEvidence.find(
    (entry) => entry.providerTopologySymbol === symbol,
  );
  if (slotEvidence?.mappingState !== 'research_candidate_closed_cycle' || slotEvidence.topologyClass !== 'closed_cycle') {
    throw new FaceAuthorityValidationError(`FR-24 topology symbol is not a FR-16 closed-cycle research candidate: ${symbol}`);
  }
  const summary = FACELAB_PROVIDER_ADAPTER_EVIDENCE_FR16.topologySummaries.find(
    (entry) => entry.topologySymbol === symbol,
  );
  const witnessEdges = FR24_EYE_TOPOLOGY_WITNESS_EDGES[symbol];
  if (summary?.topologyClass !== 'closed_cycle' || summary.edgeCount !== witnessEdges.length) {
    throw new FaceAuthorityValidationError(`FR-24 witness topology does not match the FR-16 structural summary: ${symbol}`);
  }
}

function validatePointMapKeySetFR24(
  pointsByProviderVertex: Readonly<Record<number, NormalizedPoint2DV1>>,
  orderedVertices: readonly number[],
  path: string,
): void {
  const keys = Object.keys(pointsByProviderVertex);
  if (keys.length !== orderedVertices.length) {
    throw new FaceAuthorityValidationError(`${path} must contain exactly the vertices referenced by the pinned eye topology witness.`);
  }
  const expected = new Set(orderedVertices.map((vertex) => String(vertex)));
  for (const key of keys) {
    if (!DECIMAL_VERTEX_KEY.test(key) || !expected.has(key)) {
      throw new FaceAuthorityValidationError(`${path} contains unauthorized provider vertex: ${key}`);
    }
  }
}

function validateTopologyInputSetFR24(
  topologyInputs: Readonly<Record<ProviderEyeTopologySymbolFR24, ProviderEyeTopologyProjectionPointsFR24V1>>,
): void {
  exactKeys(topologyInputs, ALLOWED_TOPOLOGY_INPUT_SET_KEYS, 'fr24.topologyInputs');
  for (const symbol of FR24_EYE_TOPOLOGY_SERIALIZATION_ORDER) {
    if (topologyInputs[symbol] === undefined) {
      throw new FaceAuthorityValidationError(`FR-24 topologyInputs is missing required provider topology: ${symbol}`);
    }
  }
}

function projectRegionFR24(
  symbol: ProviderEyeTopologySymbolFR24,
  input: ProviderEyeTopologyProjectionPointsFR24V1,
): FaceEyePairResearchRegionFR24V1 {
  exactKeys(input, ALLOWED_TOPOLOGY_INPUT_KEYS, `fr24.topologyInputs.${symbol}`);
  validateTopologySymbolResearchCandidateFR24(symbol);
  const edges = FR24_EYE_TOPOLOGY_WITNESS_EDGES[symbol];
  const orderedVertices = orderClosedCycleProviderVerticesFR16(edges);
  validatePointMapKeySetFR24(input.pointsByProviderVertex, orderedVertices, `fr24.topologyInputs.${symbol}.pointsByProviderVertex`);
  const boundary = projectClosedCycleRegionTestVectorFR16({
    edges,
    pointsByProviderVertex: input.pointsByProviderVertex,
  });
  return Object.freeze({
    providerTopologySymbol: symbol,
    boundary,
  });
}

export function issueFaceEyePairResearchArtifactFR24(
  input: FaceEyePairResearchProjectionInputFR24V1,
): FaceEyePairResearchArtifactFR24V1 {
  exactKeys(input, ALLOWED_INPUT_KEYS, 'FR-24 input');
  validateCurrentAuthorityBoundaryFR24();
  nonEmpty(input.providerRunRef, 'fr24.providerRunRef');
  validateDigest(input.canonicalAssetDigest, 'fr24.canonicalAssetDigest');
  validateTopologyInputSetFR24(input.topologyInputs);

  const artifact: FaceEyePairResearchArtifactFR24V1 = Object.freeze({
    schemaVersion: 'fr24-eye-pair-research-v1' as const,
    artifactVersion: '0.1.0' as const,
    authorityState: 'research_projection_only' as const,
    coordinateFrame: 'canonical_image_normalized_2d' as const,
    regions: Object.freeze(FR24_EYE_TOPOLOGY_SERIALIZATION_ORDER.map((symbol) =>
      projectRegionFR24(symbol, input.topologyInputs[symbol]))),
    sideAuthority: 'provider_label_only' as const,
    pairConsumptionState: 'unordered_provider_labeled_pair_only' as const,
    serializationOrder: 'provider_topology_symbol_fixed_order_not_side_authority' as const,
    consumerSlotAssignment: null,
    anatomicalLateralityResolved: false as const,
    traditionalSemanticAuthority: false as const,
    productionNeutralObservationIssued: false as const,
    provenance: Object.freeze({
      providerKey: FACELAB_PROVIDER_ADAPTER_EVIDENCE_FR16.providerKey,
      providerContractVersion: null,
      providerRunRef: input.providerRunRef,
      canonicalAssetDigest: input.canonicalAssetDigest,
      fr16ManifestVersion: FACELAB_PROVIDER_ADAPTER_EVIDENCE_FR16.manifestVersion,
      topologySourceCommit: FACELAB_PROVIDER_ADAPTER_EVIDENCE_FR16.topologySourceEvidence.sourceCommit,
      topologySourceRefClass: FACELAB_PROVIDER_ADAPTER_EVIDENCE_FR16.topologySourceEvidence.sourceRefClass,
      releaseExactForInstalledPackage: FACELAB_PROVIDER_ADAPTER_EVIDENCE_FR16.topologySourceEvidence.releaseExactForInstalledPackage,
      lateralityPolicyVersion: LATERALITY_CONSUMPTION_POLICY_FR20.policyVersion,
      rawSourcePersisted: false as const,
      rawProviderResponsePersisted: false as const,
      biometricEmbeddingPersisted: false as const,
    }),
  });
  return validateFaceEyePairResearchArtifactFR24(artifact);
}

export function validateFaceEyePairResearchArtifactFR24(
  artifact: FaceEyePairResearchArtifactFR24V1,
): FaceEyePairResearchArtifactFR24V1 {
  validateCurrentAuthorityBoundaryFR24();
  exactKeys(artifact, ALLOWED_ARTIFACT_KEYS, 'FR-24 artifact');
  if (artifact.schemaVersion !== 'fr24-eye-pair-research-v1' || artifact.artifactVersion !== '0.1.0') {
    throw new FaceAuthorityValidationError('FR-24 artifact version mismatch.');
  }
  if (artifact.authorityState !== 'research_projection_only') {
    throw new FaceAuthorityValidationError('FR-24 authorityState must remain research_projection_only.');
  }
  if (artifact.coordinateFrame !== 'canonical_image_normalized_2d') {
    throw new FaceAuthorityValidationError('FR-24 coordinateFrame must remain canonical_image_normalized_2d.');
  }
  if (artifact.sideAuthority !== 'provider_label_only' ||
      artifact.pairConsumptionState !== 'unordered_provider_labeled_pair_only' ||
      artifact.serializationOrder !== 'provider_topology_symbol_fixed_order_not_side_authority') {
    throw new FaceAuthorityValidationError('FR-24 provider labels and serialization order must not become image-side or anatomical-side authority.');
  }
  if (artifact.consumerSlotAssignment !== null) {
    throw new FaceAuthorityValidationError('FR-24 research eye regions cannot be assigned to FR-15 consumer slots.');
  }
  if (artifact.anatomicalLateralityResolved !== false ||
      artifact.traditionalSemanticAuthority !== false ||
      artifact.productionNeutralObservationIssued !== false) {
    throw new FaceAuthorityValidationError('FR-24 cannot resolve anatomical laterality, grant traditional semantics, or issue a production neutral observation.');
  }
  if (artifact.regions.length !== FR24_EYE_TOPOLOGY_SERIALIZATION_ORDER.length) {
    throw new FaceAuthorityValidationError('FR-24 artifact must contain exactly two eye regions.');
  }
  artifact.regions.forEach((region, index) => {
    exactKeys(region, ALLOWED_REGION_KEYS, `fr24.regions[${index}]`);
    const expectedSymbol = FR24_EYE_TOPOLOGY_SERIALIZATION_ORDER[index];
    if (region.providerTopologySymbol !== expectedSymbol) {
      throw new FaceAuthorityValidationError('FR-24 region serialization order is fixed only for deterministic bytes and cannot be relabeled.');
    }
    validateTopologySymbolResearchCandidateFR24(region.providerTopologySymbol);
    const summary = FACELAB_PROVIDER_ADAPTER_EVIDENCE_FR16.topologySummaries.find(
      (entry) => entry.topologySymbol === region.providerTopologySymbol,
    );
    if (summary === undefined || region.boundary.length !== summary.edgeCount) {
      throw new FaceAuthorityValidationError(`FR-24 region boundary length does not match pinned FR-16 witness topology: ${region.providerTopologySymbol}`);
    }
    region.boundary.forEach((point, pointIndex) => validatePoint(point, `fr24.regions[${index}].boundary[${pointIndex}]`));
  });

  exactKeys(artifact.provenance, ALLOWED_PROVENANCE_KEYS, 'FR-24 provenance');
  if (artifact.provenance.providerKey !== FACELAB_PROVIDER_ADAPTER_EVIDENCE_FR16.providerKey ||
      artifact.provenance.providerContractVersion !== null) {
    throw new FaceAuthorityValidationError('FR-24 provenance must remain bound to the blocked FaceLab provider profile with no provider contract version.');
  }
  nonEmpty(artifact.provenance.providerRunRef, 'fr24.provenance.providerRunRef');
  validateDigest(artifact.provenance.canonicalAssetDigest, 'fr24.provenance.canonicalAssetDigest');
  if (artifact.provenance.fr16ManifestVersion !== FACELAB_PROVIDER_ADAPTER_EVIDENCE_FR16.manifestVersion ||
      artifact.provenance.topologySourceCommit !== FACELAB_PROVIDER_ADAPTER_EVIDENCE_FR16.topologySourceEvidence.sourceCommit ||
      artifact.provenance.topologySourceRefClass !== 'upstream_master_structure_witness' ||
      artifact.provenance.releaseExactForInstalledPackage !== false) {
    throw new FaceAuthorityValidationError('FR-24 provenance must pin the current FR-16 research witness without release-exact promotion.');
  }
  if (artifact.provenance.lateralityPolicyVersion !== LATERALITY_CONSUMPTION_POLICY_FR20.policyVersion) {
    throw new FaceAuthorityValidationError('FR-24 provenance must pin the current FR-20 laterality policy.');
  }
  if (artifact.provenance.rawSourcePersisted !== false ||
      artifact.provenance.rawProviderResponsePersisted !== false ||
      artifact.provenance.biometricEmbeddingPersisted !== false) {
    throw new FaceAuthorityValidationError('FR-24 research projection must not persist raw source, raw provider response, or biometric embeddings.');
  }
  return artifact;
}

export function assessFaceEyePairResearchBridgeFR24(): FaceEyePairResearchBridgeReadinessFR24V1 {
  validateCurrentAuthorityBoundaryFR24();
  for (const symbol of FR24_EYE_TOPOLOGY_SERIALIZATION_ORDER) validateTopologySymbolResearchCandidateFR24(symbol);
  return Object.freeze({
    researchProjectionReady: true as const,
    productionNeutralObservationReady: false as const,
    consumerSlotAssignmentReady: false as const,
    anatomicalLateralityReady: false as const,
    traditionalSemanticAuthorityGranted: false as const,
    blockers: Object.freeze([
      'FR-16 eye topology is pinned only as an upstream master structure witness, not release-exact evidence for @mediapipe/tasks-vision@0.10.35',
      'FR-14 FaceLab provider binding remains blocked with providerContractVersion=null',
      'provider LEFT/RIGHT topology labels are not assigned to FR-15 image-side consumer slots',
      'FR-20 anatomical-side consumption remains blocked for unknown-source-mirror uploads',
      'FR-24 research projection is not a production neutral observation and grants no traditional physiognomy semantics',
    ]),
  });
}
