import type {
  NeutralAnchorConsumerSlotV1,
  NeutralProviderBindingProfileV1,
} from './neutral-provider-bindings-fr14.js';
import { FACELAB_NEUTRAL_BINDING_PROFILE_FR14 } from './neutral-provider-bindings-fr14.js';
import type { NormalizedPoint2DV1 } from './neutral-observation-schema-fr15.js';
import { FaceAuthorityValidationError } from './validation.js';

export type ProviderTopologyClassV1 =
  | 'closed_cycle'
  | 'disconnected_open_chains'
  | 'branched_graph'
  | 'derived_point';

export type ProviderAdapterMappingStateV1 =
  | 'research_candidate_closed_cycle'
  | 'blocked_requires_region_derivation_definition'
  | 'blocked_requires_curve_derivation_definition'
  | 'blocked_requires_midline_derivation_definition';

export interface ProviderDependencyEvidenceV1 {
  readonly repository: 'gycha0109-beep/K_beauty';
  readonly repositoryCommit: string;
  readonly packageManifestPath: 'package.json';
  readonly packageManifestBlobSha: string;
  readonly packageName: '@mediapipe/tasks-vision';
  readonly packageVersion: '0.10.35';
}

export interface ProviderTopologySourceEvidenceV1 {
  readonly repository: 'google-ai-edge/mediapipe';
  readonly sourcePath: 'mediapipe/tasks/web/vision/face_landmarker/face_landmarks_connections.ts';
  readonly sourceCommit: string;
  readonly sourceRefClass: 'upstream_master_structure_witness';
  readonly releaseExactForInstalledPackage: false;
}

export interface ProviderTopologySummaryV1 {
  readonly topologySymbol: string;
  readonly topologyClass: ProviderTopologyClassV1;
  readonly edgeCount: number;
  readonly connectedComponentCount: number;
  readonly cycleRank: number;
  readonly maxVertexDegree: number;
}

export interface ProviderAdapterSlotEvidenceV1 {
  readonly anchorRef: string;
  readonly consumerSlot: NeutralAnchorConsumerSlotV1;
  readonly providerTopologySymbol: string | null;
  readonly topologyClass: ProviderTopologyClassV1;
  readonly mappingState: ProviderAdapterMappingStateV1;
  readonly requiredDerivationRef: string | null;
  readonly rationaleKey: string;
}

export interface ProviderAdapterEvidenceManifestV1 {
  readonly schemaVersion: 'v1';
  readonly manifestVersion: string;
  readonly authorityState: 'research_only';
  readonly providerKey: 'visually_facelab';
  readonly consumerContractVersion: 'myeongha-neutral-observation-v1';
  readonly dependencyEvidence: ProviderDependencyEvidenceV1;
  readonly topologySourceEvidence: ProviderTopologySourceEvidenceV1;
  readonly topologySummaries: readonly ProviderTopologySummaryV1[];
  readonly slotEvidence: readonly ProviderAdapterSlotEvidenceV1[];
  readonly prohibitedPromotions: readonly [
    'provider_topology_to_traditional_anchor',
    'upstream_master_to_release_exact_topology',
    'branched_graph_to_region_without_derivation',
    'disconnected_chains_to_curve_without_derivation',
  ];
}

export interface ProviderAdapterEvidenceReadinessV1 {
  readonly productionReady: false;
  readonly authorityState: 'research_only';
  readonly researchCandidateSlots: readonly NeutralAnchorConsumerSlotV1[];
  readonly blockedSlots: readonly NeutralAnchorConsumerSlotV1[];
  readonly blockers: readonly string[];
}

export interface ProviderConnectionEdgeV1 {
  readonly start: number;
  readonly end: number;
}

const HEX40 = /^[0-9a-f]{40}$/u;
const ALLOWED_MANIFEST_KEYS = new Set([
  'schemaVersion',
  'manifestVersion',
  'authorityState',
  'providerKey',
  'consumerContractVersion',
  'dependencyEvidence',
  'topologySourceEvidence',
  'topologySummaries',
  'slotEvidence',
  'prohibitedPromotions',
]);
const ALLOWED_DEPENDENCY_KEYS = new Set([
  'repository',
  'repositoryCommit',
  'packageManifestPath',
  'packageManifestBlobSha',
  'packageName',
  'packageVersion',
]);
const ALLOWED_TOPOLOGY_SOURCE_KEYS = new Set([
  'repository',
  'sourcePath',
  'sourceCommit',
  'sourceRefClass',
  'releaseExactForInstalledPackage',
]);
const ALLOWED_TOPOLOGY_SUMMARY_KEYS = new Set([
  'topologySymbol',
  'topologyClass',
  'edgeCount',
  'connectedComponentCount',
  'cycleRank',
  'maxVertexDegree',
]);
const ALLOWED_SLOT_KEYS = new Set([
  'anchorRef',
  'consumerSlot',
  'providerTopologySymbol',
  'topologyClass',
  'mappingState',
  'requiredDerivationRef',
  'rationaleKey',
]);
const ALLOWED_EDGE_KEYS = new Set(['start', 'end']);
const ALLOWED_POINT_KEYS = new Set(['x', 'y']);

function exactKeys(value: object, allowed: ReadonlySet<string>, path: string): void {
  const unexpected = Object.keys(value).find((key) => !allowed.has(key));
  if (unexpected !== undefined) {
    throw new FaceAuthorityValidationError(`${path} contains unauthorized field: ${unexpected}`);
  }
}

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

function nonNegativeInteger(value: number, path: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new FaceAuthorityValidationError(`${path} must be a non-negative integer.`);
  }
}

function positiveInteger(value: number, path: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new FaceAuthorityValidationError(`${path} must be a positive integer.`);
  }
}

function validateCommitSha(value: string, path: string): void {
  if (!HEX40.test(value)) throw new FaceAuthorityValidationError(`${path} must be a 40-char lowercase git SHA.`);
}

function mappingStateForTopology(
  slot: NeutralAnchorConsumerSlotV1,
  topologyClass: ProviderTopologyClassV1,
): ProviderAdapterMappingStateV1 {
  if (slot === 'neutral.face.left_eye_region' || slot === 'neutral.face.right_eye_region') {
    if (topologyClass !== 'closed_cycle') {
      throw new FaceAuthorityValidationError(`${slot} may be a FR-16 research candidate only from a closed_cycle topology.`);
    }
    return 'research_candidate_closed_cycle';
  }
  if (slot === 'neutral.face.nose_region') return 'blocked_requires_region_derivation_definition';
  if (slot === 'neutral.face.left_brow_region' || slot === 'neutral.face.right_brow_region') {
    return 'blocked_requires_curve_derivation_definition';
  }
  return 'blocked_requires_midline_derivation_definition';
}

const SLOT_EVIDENCE_FR16: readonly ProviderAdapterSlotEvidenceV1[] = Object.freeze([
  Object.freeze({
    anchorRef: 'left_eye',
    consumerSlot: 'neutral.face.left_eye_region' as const,
    providerTopologySymbol: 'FACE_LANDMARKS_LEFT_EYE',
    topologyClass: 'closed_cycle' as const,
    mappingState: 'research_candidate_closed_cycle' as const,
    requiredDerivationRef: null,
    rationaleKey: 'provider_eye_connection_graph_is_single_closed_cycle',
  }),
  Object.freeze({
    anchorRef: 'right_eye',
    consumerSlot: 'neutral.face.right_eye_region' as const,
    providerTopologySymbol: 'FACE_LANDMARKS_RIGHT_EYE',
    topologyClass: 'closed_cycle' as const,
    mappingState: 'research_candidate_closed_cycle' as const,
    requiredDerivationRef: null,
    rationaleKey: 'provider_eye_connection_graph_is_single_closed_cycle',
  }),
  Object.freeze({
    anchorRef: 'nose',
    consumerSlot: 'neutral.face.nose_region' as const,
    providerTopologySymbol: 'FACE_LANDMARKS_NOSE',
    topologyClass: 'branched_graph' as const,
    mappingState: 'blocked_requires_region_derivation_definition' as const,
    requiredDerivationRef: 'derivation.neutral.nose_region.pending',
    rationaleKey: 'provider_nose_graph_is_not_a_single_region_boundary',
  }),
  Object.freeze({
    anchorRef: 'left_brow',
    consumerSlot: 'neutral.face.left_brow_region' as const,
    providerTopologySymbol: 'FACE_LANDMARKS_LEFT_EYEBROW',
    topologyClass: 'disconnected_open_chains' as const,
    mappingState: 'blocked_requires_curve_derivation_definition' as const,
    requiredDerivationRef: 'derivation.neutral.left_brow_curve.pending',
    rationaleKey: 'provider_brow_graph_has_two_disconnected_chains',
  }),
  Object.freeze({
    anchorRef: 'right_brow',
    consumerSlot: 'neutral.face.right_brow_region' as const,
    providerTopologySymbol: 'FACE_LANDMARKS_RIGHT_EYEBROW',
    topologyClass: 'disconnected_open_chains' as const,
    mappingState: 'blocked_requires_curve_derivation_definition' as const,
    requiredDerivationRef: 'derivation.neutral.right_brow_curve.pending',
    rationaleKey: 'provider_brow_graph_has_two_disconnected_chains',
  }),
  Object.freeze({
    anchorRef: 'brow_midline',
    consumerSlot: 'neutral.face.brow_midline' as const,
    providerTopologySymbol: null,
    topologyClass: 'derived_point' as const,
    mappingState: 'blocked_requires_midline_derivation_definition' as const,
    requiredDerivationRef: 'derivation.neutral.brow_midline.pending',
    rationaleKey: 'provider_has_no_direct_neutral_brow_midline_topology_contract',
  }),
]);

export const FACELAB_PROVIDER_ADAPTER_EVIDENCE_FR16: ProviderAdapterEvidenceManifestV1 = Object.freeze({
  schemaVersion: 'v1' as const,
  manifestVersion: '0.2.0',
  authorityState: 'research_only' as const,
  providerKey: 'visually_facelab' as const,
  consumerContractVersion: 'myeongha-neutral-observation-v1' as const,
  dependencyEvidence: Object.freeze({
    repository: 'gycha0109-beep/K_beauty' as const,
    repositoryCommit: '81c3b4139efdffc785439da005557dc38a6b4873',
    packageManifestPath: 'package.json' as const,
    packageManifestBlobSha: '4cd6b7f65223857505578fcb8ca27a033e8361b6',
    packageName: '@mediapipe/tasks-vision' as const,
    packageVersion: '0.10.35' as const,
  }),
  topologySourceEvidence: Object.freeze({
    repository: 'google-ai-edge/mediapipe' as const,
    sourcePath: 'mediapipe/tasks/web/vision/face_landmarker/face_landmarks_connections.ts' as const,
    sourceCommit: '30590fe8d3fdc57e63a0e9c5b2c0ececffb37301',
    sourceRefClass: 'upstream_master_structure_witness' as const,
    releaseExactForInstalledPackage: false as const,
  }),
  topologySummaries: Object.freeze([
    Object.freeze({
      topologySymbol: 'FACE_LANDMARKS_LEFT_EYE',
      topologyClass: 'closed_cycle' as const,
      edgeCount: 16,
      connectedComponentCount: 1,
      cycleRank: 1,
      maxVertexDegree: 2,
    }),
    Object.freeze({
      topologySymbol: 'FACE_LANDMARKS_RIGHT_EYE',
      topologyClass: 'closed_cycle' as const,
      edgeCount: 16,
      connectedComponentCount: 1,
      cycleRank: 1,
      maxVertexDegree: 2,
    }),
    Object.freeze({
      topologySymbol: 'FACE_LANDMARKS_NOSE',
      topologyClass: 'branched_graph' as const,
      edgeCount: 25,
      connectedComponentCount: 1,
      cycleRank: 2,
      maxVertexDegree: 3,
    }),
    Object.freeze({
      topologySymbol: 'FACE_LANDMARKS_LEFT_EYEBROW',
      topologyClass: 'disconnected_open_chains' as const,
      edgeCount: 8,
      connectedComponentCount: 2,
      cycleRank: 0,
      maxVertexDegree: 2,
    }),
    Object.freeze({
      topologySymbol: 'FACE_LANDMARKS_RIGHT_EYEBROW',
      topologyClass: 'disconnected_open_chains' as const,
      edgeCount: 8,
      connectedComponentCount: 2,
      cycleRank: 0,
      maxVertexDegree: 2,
    }),
  ]),
  slotEvidence: SLOT_EVIDENCE_FR16,
  prohibitedPromotions: Object.freeze([
    'provider_topology_to_traditional_anchor',
    'upstream_master_to_release_exact_topology',
    'branched_graph_to_region_without_derivation',
    'disconnected_chains_to_curve_without_derivation',
  ] as const),
});

export function validateProviderAdapterEvidenceManifestFR16(
  manifest: ProviderAdapterEvidenceManifestV1 = FACELAB_PROVIDER_ADAPTER_EVIDENCE_FR16,
  profile: NeutralProviderBindingProfileV1 = FACELAB_NEUTRAL_BINDING_PROFILE_FR14,
): ProviderAdapterEvidenceManifestV1 {
  exactKeys(manifest, ALLOWED_MANIFEST_KEYS, 'FR-16 manifest');
  if (manifest.schemaVersion !== 'v1') throw new FaceAuthorityValidationError('FR-16 schemaVersion must be v1.');
  nonEmpty(manifest.manifestVersion, 'fr16.manifestVersion');
  if (manifest.authorityState !== 'research_only') throw new FaceAuthorityValidationError('FR-16 authorityState must remain research_only.');
  if (manifest.providerKey !== 'visually_facelab') throw new FaceAuthorityValidationError('FR-16 providerKey must be visually_facelab.');
  if (manifest.consumerContractVersion !== 'myeongha-neutral-observation-v1') {
    throw new FaceAuthorityValidationError('FR-16 consumerContractVersion mismatch.');
  }

  exactKeys(manifest.dependencyEvidence, ALLOWED_DEPENDENCY_KEYS, 'FR-16 dependencyEvidence');
  validateCommitSha(manifest.dependencyEvidence.repositoryCommit, 'fr16.dependencyEvidence.repositoryCommit');
  validateCommitSha(manifest.dependencyEvidence.packageManifestBlobSha, 'fr16.dependencyEvidence.packageManifestBlobSha');
  if (manifest.dependencyEvidence.packageVersion !== '0.10.35') {
    throw new FaceAuthorityValidationError('FR-16 packageVersion must pin the observed K_beauty dependency 0.10.35.');
  }

  exactKeys(manifest.topologySourceEvidence, ALLOWED_TOPOLOGY_SOURCE_KEYS, 'FR-16 topologySourceEvidence');
  validateCommitSha(manifest.topologySourceEvidence.sourceCommit, 'fr16.topologySourceEvidence.sourceCommit');
  if (manifest.topologySourceEvidence.releaseExactForInstalledPackage !== false) {
    throw new FaceAuthorityValidationError('FR-16 upstream master topology must not be promoted to release-exact evidence.');
  }

  unique(manifest.topologySummaries.map((entry) => entry.topologySymbol), 'fr16.topologySymbols');
  for (const summary of manifest.topologySummaries) {
    exactKeys(summary, ALLOWED_TOPOLOGY_SUMMARY_KEYS, `fr16.topology.${summary.topologySymbol}`);
    nonEmpty(summary.topologySymbol, 'fr16.topologySymbol');
    positiveInteger(summary.edgeCount, `fr16.${summary.topologySymbol}.edgeCount`);
    positiveInteger(summary.connectedComponentCount, `fr16.${summary.topologySymbol}.connectedComponentCount`);
    nonNegativeInteger(summary.cycleRank, `fr16.${summary.topologySymbol}.cycleRank`);
    positiveInteger(summary.maxVertexDegree, `fr16.${summary.topologySymbol}.maxVertexDegree`);
    if (summary.topologyClass === 'closed_cycle') {
      if (summary.connectedComponentCount !== 1 || summary.cycleRank !== 1 || summary.maxVertexDegree !== 2) {
        throw new FaceAuthorityValidationError(`FR-16 closed_cycle summary is structurally inconsistent: ${summary.topologySymbol}`);
      }
    }
    if (summary.topologyClass === 'disconnected_open_chains' && summary.connectedComponentCount < 2) {
      throw new FaceAuthorityValidationError(`FR-16 disconnected_open_chains must have multiple components: ${summary.topologySymbol}`);
    }
    if (summary.topologyClass === 'branched_graph' && summary.maxVertexDegree <= 2) {
      throw new FaceAuthorityValidationError(`FR-16 branched_graph must contain degree > 2: ${summary.topologySymbol}`);
    }
  }

  unique(manifest.slotEvidence.map((entry) => entry.anchorRef), 'fr16.slotAnchorRefs');
  unique(manifest.slotEvidence.map((entry) => entry.consumerSlot), 'fr16.slotConsumerSlots');
  if (manifest.slotEvidence.length !== profile.bindings.length) {
    throw new FaceAuthorityValidationError('FR-16 slotEvidence must cover every FR-14 binding exactly once.');
  }

  for (const binding of profile.bindings) {
    const evidence = manifest.slotEvidence.find((entry) => entry.anchorRef === binding.anchorRef);
    if (evidence === undefined) throw new FaceAuthorityValidationError(`FR-16 missing slot evidence: ${binding.anchorRef}`);
    exactKeys(evidence, ALLOWED_SLOT_KEYS, `fr16.slot.${binding.anchorRef}`);
    if (evidence.consumerSlot !== binding.consumerSlot) {
      throw new FaceAuthorityValidationError(`FR-16 consumerSlot mismatch: ${binding.anchorRef}`);
    }
    nonEmpty(evidence.rationaleKey, `fr16.${binding.anchorRef}.rationaleKey`);
    const expectedState = mappingStateForTopology(evidence.consumerSlot, evidence.topologyClass);
    if (evidence.mappingState !== expectedState) {
      throw new FaceAuthorityValidationError(`FR-16 mappingState is not justified by topology for ${binding.anchorRef}.`);
    }
    if (evidence.mappingState === 'research_candidate_closed_cycle') {
      if (evidence.providerTopologySymbol === null || evidence.requiredDerivationRef !== null) {
        throw new FaceAuthorityValidationError(`FR-16 eye research candidate must bind a direct topology symbol: ${binding.anchorRef}`);
      }
      const summary = manifest.topologySummaries.find((entry) => entry.topologySymbol === evidence.providerTopologySymbol);
      if (summary?.topologyClass !== 'closed_cycle') {
        throw new FaceAuthorityValidationError(`FR-16 eye candidate requires closed-cycle topology evidence: ${binding.anchorRef}`);
      }
    } else {
      if (evidence.requiredDerivationRef === null) {
        throw new FaceAuthorityValidationError(`FR-16 blocked slot requires a derivation placeholder: ${binding.anchorRef}`);
      }
      nonEmpty(evidence.requiredDerivationRef, `fr16.${binding.anchorRef}.requiredDerivationRef`);
    }
  }

  return manifest;
}

export function assessProviderAdapterEvidenceReadinessFR16(
  manifest: ProviderAdapterEvidenceManifestV1 = FACELAB_PROVIDER_ADAPTER_EVIDENCE_FR16,
): ProviderAdapterEvidenceReadinessV1 {
  validateProviderAdapterEvidenceManifestFR16(manifest);
  const researchCandidateSlots = manifest.slotEvidence
    .filter((entry) => entry.mappingState === 'research_candidate_closed_cycle')
    .map((entry) => entry.consumerSlot);
  const blockedSlots = manifest.slotEvidence
    .filter((entry) => entry.mappingState !== 'research_candidate_closed_cycle')
    .map((entry) => entry.consumerSlot);
  return Object.freeze({
    productionReady: false as const,
    authorityState: 'research_only' as const,
    researchCandidateSlots: Object.freeze(researchCandidateSlots),
    blockedSlots: Object.freeze(blockedSlots),
    blockers: Object.freeze([
      'current FR-14 FaceLab provider profile is blocked and has no providerContractVersion',
      'MediaPipe topology evidence is an upstream master structure witness, not release-exact evidence for @mediapipe/tasks-vision@0.10.35',
      'nose/brow/brow-midline neutral derivation definitions are not authorized',
      'FR-16 adapter evidence cannot promote provider geometry to traditional physiognomy anchors',
    ]),
  });
}

function validateEdge(edge: ProviderConnectionEdgeV1, path: string): void {
  exactKeys(edge, ALLOWED_EDGE_KEYS, path);
  nonNegativeInteger(edge.start, `${path}.start`);
  nonNegativeInteger(edge.end, `${path}.end`);
  if (edge.start === edge.end) throw new FaceAuthorityValidationError(`${path} must not self-loop.`);
}

function undirectedKey(edge: ProviderConnectionEdgeV1): string {
  const low = Math.min(edge.start, edge.end);
  const high = Math.max(edge.start, edge.end);
  return `${low}:${high}`;
}

export function orderClosedCycleProviderVerticesFR16(
  edges: readonly ProviderConnectionEdgeV1[],
): readonly number[] {
  if (edges.length < 3) throw new FaceAuthorityValidationError('FR-16 closed-cycle derivation requires at least 3 edges.');
  const seenEdges = new Set<string>();
  const adjacency = new Map<number, number[]>();
  edges.forEach((edge, index) => {
    validateEdge(edge, `fr16.edges[${index}]`);
    const key = undirectedKey(edge);
    if (seenEdges.has(key)) throw new FaceAuthorityValidationError(`FR-16 duplicate undirected edge: ${key}`);
    seenEdges.add(key);
    const from = adjacency.get(edge.start) ?? [];
    from.push(edge.end);
    adjacency.set(edge.start, from);
    const to = adjacency.get(edge.end) ?? [];
    to.push(edge.start);
    adjacency.set(edge.end, to);
  });

  for (const [vertex, neighbors] of adjacency) {
    if (neighbors.length !== 2) {
      throw new FaceAuthorityValidationError(`FR-16 closed-cycle vertex must have degree 2: ${vertex} has ${neighbors.length}.`);
    }
  }
  if (edges.length !== adjacency.size) {
    throw new FaceAuthorityValidationError('FR-16 closed-cycle graph must have E=V.');
  }

  const vertices = [...adjacency.keys()].sort((a, b) => a - b);
  const start = vertices[0];
  if (start === undefined) throw new FaceAuthorityValidationError('FR-16 closed-cycle graph is empty.');
  const startNeighbors = [...(adjacency.get(start) ?? [])].sort((a, b) => a - b);
  const first = startNeighbors[0];
  if (first === undefined) throw new FaceAuthorityValidationError('FR-16 start vertex has no neighbors.');

  const ordered: number[] = [start];
  let previous = start;
  let current = first;
  while (current !== start) {
    if (ordered.includes(current)) throw new FaceAuthorityValidationError(`FR-16 graph contains a premature cycle at vertex ${current}.`);
    ordered.push(current);
    const neighbors = adjacency.get(current);
    if (neighbors === undefined) throw new FaceAuthorityValidationError(`FR-16 missing adjacency for vertex ${current}.`);
    const next = neighbors[0] === previous ? neighbors[1] : neighbors[0];
    if (next === undefined) throw new FaceAuthorityValidationError(`FR-16 cannot continue cycle at vertex ${current}.`);
    previous = current;
    current = next;
    if (ordered.length > adjacency.size) throw new FaceAuthorityValidationError('FR-16 cycle traversal exceeded vertex count.');
  }
  if (ordered.length !== adjacency.size) {
    throw new FaceAuthorityValidationError('FR-16 graph contains disconnected cycle components.');
  }
  return Object.freeze(ordered);
}

function validateProviderPoint(point: NormalizedPoint2DV1, path: string): void {
  exactKeys(point, ALLOWED_POINT_KEYS, path);
  if (!Number.isFinite(point.x) || point.x < 0 || point.x > 1) {
    throw new FaceAuthorityValidationError(`${path}.x must be finite within [0,1].`);
  }
  if (!Number.isFinite(point.y) || point.y < 0 || point.y > 1) {
    throw new FaceAuthorityValidationError(`${path}.y must be finite within [0,1].`);
  }
}

export function projectClosedCycleRegionTestVectorFR16(input: {
  readonly edges: readonly ProviderConnectionEdgeV1[];
  readonly pointsByProviderVertex: Readonly<Record<number, NormalizedPoint2DV1>>;
}): readonly NormalizedPoint2DV1[] {
  const orderedVertices = orderClosedCycleProviderVerticesFR16(input.edges);
  const boundary = orderedVertices.map((vertex) => {
    const point = input.pointsByProviderVertex[vertex];
    if (point === undefined) throw new FaceAuthorityValidationError(`FR-16 missing provider point for vertex ${vertex}.`);
    validateProviderPoint(point, `fr16.pointsByProviderVertex.${vertex}`);
    return Object.freeze({ x: point.x, y: point.y });
  });
  return Object.freeze(boundary);
}
