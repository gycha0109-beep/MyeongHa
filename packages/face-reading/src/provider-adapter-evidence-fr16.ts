import { createHash } from 'node:crypto';
import {
  FACELAB_NEUTRAL_BINDING_PROFILE_FR14,
  type NeutralAnchorConsumerSlotV1,
} from './neutral-provider-bindings-fr14.js';
import type {
  NeutralObservationGeometryV1,
  NormalizedPoint2DV1,
} from './neutral-observation-schema-fr15.js';
import { FaceAuthorityValidationError } from './validation.js';

export type ProviderAdapterEvidenceKindV1 =
  | 'consumer_repository_dependency'
  | 'upstream_topology_source'
  | 'consumer_public_contract_surface';

export interface ProviderAdapterEvidenceRecordV1 {
  readonly evidenceRef: string;
  readonly kind: ProviderAdapterEvidenceKindV1;
  readonly sourceRef: string;
  readonly observedAt: '2026-08-27';
  readonly observedValue: string;
  readonly status: 'confirmed' | 'research_only';
  readonly limitations: readonly string[];
}

export interface ProviderTopologyConnectionV1 {
  readonly start: number;
  readonly end: number;
}

export type ProviderConnectionSetKeyV1 =
  | 'FACE_LANDMARKS_LEFT_EYE'
  | 'FACE_LANDMARKS_RIGHT_EYE'
  | 'FACE_LANDMARKS_LEFT_EYEBROW'
  | 'FACE_LANDMARKS_RIGHT_EYEBROW'
  | 'FACE_LANDMARKS_NOSE';

export interface ProviderTopologySnapshotV1 {
  readonly topologyRef: string;
  readonly providerKey: 'mediapipe_face_landmarker';
  readonly providerPackageRef: '@mediapipe/tasks-vision@0.10.35';
  readonly landmarkCount: 478;
  readonly coordinateDimensions: readonly ['x', 'y', 'z'];
  readonly connectionSets: Readonly<Record<ProviderConnectionSetKeyV1, readonly ProviderTopologyConnectionV1[]>>;
  readonly evidenceRefs: readonly string[];
  readonly verificationState: 'research_upstream_snapshot_not_release_tag_attested';
}

export type ProviderNeutralMappingStatusV1 =
  | 'research_candidate'
  | 'blocked_requires_neutral_derivation_definition'
  | 'blocked_dependency';

export type ProviderNeutralTransformV1 =
  | 'convex_hull_of_connection_vertices'
  | 'blocked';

export interface ProviderNeutralMappingDefinitionV1 {
  readonly mappingId: string;
  readonly anchorRef: string;
  readonly consumerSlot: NeutralAnchorConsumerSlotV1;
  readonly sourceConnectionSetRefs: readonly ProviderConnectionSetKeyV1[];
  readonly transform: ProviderNeutralTransformV1;
  readonly outputGeometryKind: NeutralObservationGeometryV1['kind'];
  readonly status: ProviderNeutralMappingStatusV1;
  readonly qualityDependencies: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly rationale: string;
  readonly blockers: readonly string[];
}

export interface ProviderAdapterDefinitionV1 {
  readonly adapterId: string;
  readonly version: string;
  readonly authorityState: 'research_only';
  readonly upstreamProviderKey: 'mediapipe_face_landmarker';
  readonly upstreamProviderPackageRef: '@mediapipe/tasks-vision@0.10.35';
  readonly upstreamTopologyRef: string;
  readonly downstreamProviderKey: 'visually_facelab';
  readonly downstreamProviderContractState: 'unpublished';
  readonly neutralOutputContractVersion: 'myeongha-neutral-observation-v1';
  readonly lateralityConvention: 'provider_named_left_right_unattested';
  readonly evidenceRefs: readonly string[];
  readonly mappings: readonly ProviderNeutralMappingDefinitionV1[];
}

export interface ProviderRawLandmarkV1 {
  readonly index: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface ProviderRawLandmarkFixtureV1 {
  readonly fixtureId: string;
  readonly providerKey: 'mediapipe_face_landmarker';
  readonly providerPackageRef: '@mediapipe/tasks-vision@0.10.35';
  readonly topologyRef: string;
  readonly landmarks: readonly ProviderRawLandmarkV1[];
}

export interface ProviderAdapterResearchProjectionV1 {
  readonly authorityState: 'adapter_research_only';
  readonly adapterRef: string;
  readonly mappingId: string;
  readonly anchorRef: string;
  readonly consumerSlot: NeutralAnchorConsumerSlotV1;
  readonly geometry: NeutralObservationGeometryV1;
  readonly providerSourceIndices: readonly number[];
  readonly ignoredProviderDimensions: readonly ['z'];
  readonly outputFingerprint: string;
  readonly evidenceRefs: readonly string[];
}

export interface ProviderAdapterReadinessV1 {
  readonly readyForNeutralProviderCandidate: boolean;
  readonly blockers: readonly string[];
  readonly candidateMappingIds: readonly string[];
  readonly blockedMappingIds: readonly string[];
}

export const FR16_PROVIDER_ADAPTER_EVIDENCE = Object.freeze([
  {
    evidenceRef: 'evidence.fr16.kbeauty.mediapipe_dependency',
    kind: 'consumer_repository_dependency',
    sourceRef: 'gycha0109-beep/K_beauty@81c3b4139efdffc785439da005557dc38a6b4873:package.json',
    observedAt: '2026-08-27',
    observedValue: '@mediapipe/tasks-vision=0.10.35',
    status: 'confirmed',
    limitations: ['Dependency presence does not prove which FaceLab runtime path currently consumes FaceLandmarker output.'],
  },
  {
    evidenceRef: 'evidence.fr16.kbeauty.face_contracts_public_surface',
    kind: 'consumer_public_contract_surface',
    sourceRef: 'gycha0109-beep/K_beauty@81c3b4139efdffc785439da005557dc38a6b4873:packages/face-contracts/src/index.js',
    observedAt: '2026-08-27',
    observedValue: 'public exports remain synthetic/evaluation oriented; no production-neutral runtime observation contract exported',
    status: 'confirmed',
    limitations: ['Repository may contain internal runtime code outside the public face-contracts package; this evidence is scoped to the public contract surface.'],
  },
  {
    evidenceRef: 'evidence.fr16.mediapipe.face_landmark_connections.current_upstream',
    kind: 'upstream_topology_source',
    sourceRef: 'google-ai-edge/mediapipe:mediapipe/tasks/web/vision/face_landmarker/face_landmarks_connections.ts@master_checked_2026-08-27',
    observedAt: '2026-08-27',
    observedValue: 'named left/right eye, left/right eyebrow, and nose connection sets are present',
    status: 'research_only',
    limitations: [
      'This is an upstream master snapshot, not an attestation that the exact same connection arrays ship in @mediapipe/tasks-vision@0.10.35.',
      'Connection-set names and indices are provider topology, not physiognomy semantics.',
    ],
  },
] as const satisfies readonly ProviderAdapterEvidenceRecordV1[]);

const connections = (...pairs: readonly (readonly [number, number])[]): readonly ProviderTopologyConnectionV1[] =>
  Object.freeze(pairs.map(([start, end]) => Object.freeze({ start, end })));

export const MEDIAPIPE_FACE_TOPOLOGY_RESEARCH_FR16: ProviderTopologySnapshotV1 = Object.freeze({
  topologyRef: 'topology.mediapipe.face_landmarker.connections.research_2026_08_27',
  providerKey: 'mediapipe_face_landmarker',
  providerPackageRef: '@mediapipe/tasks-vision@0.10.35',
  landmarkCount: 478,
  coordinateDimensions: Object.freeze(['x', 'y', 'z'] as const),
  connectionSets: Object.freeze({
    FACE_LANDMARKS_LEFT_EYE: connections(
      [263, 249], [249, 390], [390, 373], [373, 374], [374, 380], [380, 381], [381, 382], [382, 362],
      [263, 466], [466, 388], [388, 387], [387, 386], [386, 385], [385, 384], [384, 398], [398, 362],
    ),
    FACE_LANDMARKS_RIGHT_EYE: connections(
      [33, 7], [7, 163], [163, 144], [144, 145], [145, 153], [153, 154], [154, 155], [155, 133],
      [33, 246], [246, 161], [161, 160], [160, 159], [159, 158], [158, 157], [157, 173], [173, 133],
    ),
    FACE_LANDMARKS_LEFT_EYEBROW: connections(
      [276, 283], [283, 282], [282, 295], [295, 285], [300, 293], [293, 334], [334, 296], [296, 336],
    ),
    FACE_LANDMARKS_RIGHT_EYEBROW: connections(
      [46, 53], [53, 52], [52, 65], [65, 55], [70, 63], [63, 105], [105, 66], [66, 107],
    ),
    FACE_LANDMARKS_NOSE: connections(
      [168, 6], [6, 197], [197, 195], [195, 5], [5, 4], [4, 1], [1, 19], [19, 94], [94, 2],
      [98, 97], [97, 2], [2, 326], [326, 327], [327, 294], [294, 278], [278, 344], [344, 440], [440, 275],
      [275, 4], [4, 45], [45, 220], [220, 115], [115, 48], [48, 64], [64, 98],
    ),
  }),
  evidenceRefs: Object.freeze(['evidence.fr16.mediapipe.face_landmark_connections.current_upstream']),
  verificationState: 'research_upstream_snapshot_not_release_tag_attested',
});

export const FACELAB_MEDIAPIPE_ADAPTER_RESEARCH_FR16: ProviderAdapterDefinitionV1 = Object.freeze({
  adapterId: 'adapter.visually_facelab.mediapipe_to_neutral_fr16',
  version: '0.1.0',
  authorityState: 'research_only',
  upstreamProviderKey: 'mediapipe_face_landmarker',
  upstreamProviderPackageRef: '@mediapipe/tasks-vision@0.10.35',
  upstreamTopologyRef: MEDIAPIPE_FACE_TOPOLOGY_RESEARCH_FR16.topologyRef,
  downstreamProviderKey: 'visually_facelab',
  downstreamProviderContractState: 'unpublished',
  neutralOutputContractVersion: 'myeongha-neutral-observation-v1',
  lateralityConvention: 'provider_named_left_right_unattested',
  evidenceRefs: Object.freeze([
    'evidence.fr16.kbeauty.mediapipe_dependency',
    'evidence.fr16.kbeauty.face_contracts_public_surface',
    'evidence.fr16.mediapipe.face_landmark_connections.current_upstream',
  ]),
  mappings: Object.freeze([
    {
      mappingId: 'mapping.fr16.left_eye_region',
      anchorRef: 'left_eye',
      consumerSlot: 'neutral.face.left_eye_region',
      sourceConnectionSetRefs: ['FACE_LANDMARKS_LEFT_EYE'],
      transform: 'convex_hull_of_connection_vertices',
      outputGeometryKind: 'region',
      status: 'research_candidate',
      qualityDependencies: ['neutral_pose_quality', 'neutral_eye_regions'],
      evidenceRefs: ['evidence.fr16.mediapipe.face_landmark_connections.current_upstream'],
      rationale: 'Provider-named eye connection vertices can be reduced to a deterministic neutral 2D envelope without assigning traditional semantics.',
      blockers: ['provider laterality orientation fixture not yet attested', 'exact 0.10.35 connection array not release-tag attested'],
    },
    {
      mappingId: 'mapping.fr16.right_eye_region',
      anchorRef: 'right_eye',
      consumerSlot: 'neutral.face.right_eye_region',
      sourceConnectionSetRefs: ['FACE_LANDMARKS_RIGHT_EYE'],
      transform: 'convex_hull_of_connection_vertices',
      outputGeometryKind: 'region',
      status: 'research_candidate',
      qualityDependencies: ['neutral_pose_quality', 'neutral_eye_regions'],
      evidenceRefs: ['evidence.fr16.mediapipe.face_landmark_connections.current_upstream'],
      rationale: 'Provider-named eye connection vertices can be reduced to a deterministic neutral 2D envelope without assigning traditional semantics.',
      blockers: ['provider laterality orientation fixture not yet attested', 'exact 0.10.35 connection array not release-tag attested'],
    },
    {
      mappingId: 'mapping.fr16.nose_region',
      anchorRef: 'nose',
      consumerSlot: 'neutral.face.nose_region',
      sourceConnectionSetRefs: ['FACE_LANDMARKS_NOSE'],
      transform: 'convex_hull_of_connection_vertices',
      outputGeometryKind: 'region',
      status: 'research_candidate',
      qualityDependencies: ['neutral_pose_quality', 'neutral_nose_region'],
      evidenceRefs: ['evidence.fr16.mediapipe.face_landmark_connections.current_upstream'],
      rationale: 'The convex hull is an explicit research neutral envelope around the provider nose connection vertices; it is not 山根/年壽/準頭 geometry.',
      blockers: ['exact 0.10.35 connection array not release-tag attested', 'neutral envelope suitability not calibrated for downstream metric extraction'],
    },
    {
      mappingId: 'mapping.fr16.left_brow_region',
      anchorRef: 'left_brow',
      consumerSlot: 'neutral.face.left_brow_region',
      sourceConnectionSetRefs: ['FACE_LANDMARKS_LEFT_EYEBROW'],
      transform: 'blocked',
      outputGeometryKind: 'curve',
      status: 'blocked_requires_neutral_derivation_definition',
      qualityDependencies: ['neutral_pose_quality', 'neutral_brow_regions'],
      evidenceRefs: ['evidence.fr16.mediapipe.face_landmark_connections.current_upstream'],
      rationale: 'The provider eyebrow set contains two disjoint contour chains while FR-15 currently requires one curve. A centerline/curve derivation cannot be invented inside the adapter.',
      blockers: ['neutral brow-curve derivation definition required'],
    },
    {
      mappingId: 'mapping.fr16.right_brow_region',
      anchorRef: 'right_brow',
      consumerSlot: 'neutral.face.right_brow_region',
      sourceConnectionSetRefs: ['FACE_LANDMARKS_RIGHT_EYEBROW'],
      transform: 'blocked',
      outputGeometryKind: 'curve',
      status: 'blocked_requires_neutral_derivation_definition',
      qualityDependencies: ['neutral_pose_quality', 'neutral_brow_regions'],
      evidenceRefs: ['evidence.fr16.mediapipe.face_landmark_connections.current_upstream'],
      rationale: 'The provider eyebrow set contains two disjoint contour chains while FR-15 currently requires one curve. A centerline/curve derivation cannot be invented inside the adapter.',
      blockers: ['neutral brow-curve derivation definition required'],
    },
    {
      mappingId: 'mapping.fr16.brow_midline',
      anchorRef: 'brow_midline',
      consumerSlot: 'neutral.face.brow_midline',
      sourceConnectionSetRefs: ['FACE_LANDMARKS_LEFT_EYEBROW', 'FACE_LANDMARKS_RIGHT_EYEBROW'],
      transform: 'blocked',
      outputGeometryKind: 'point',
      status: 'blocked_dependency',
      qualityDependencies: ['neutral_pose_quality', 'neutral_brow_regions', 'neutral_brow_midline_derivation'],
      evidenceRefs: ['evidence.fr16.mediapipe.face_landmark_connections.current_upstream'],
      rationale: 'Brow midline depends on a reviewed neutral brow representation. It is blocked while both brow mappings lack a neutral derivation definition.',
      blockers: ['left/right neutral brow representation required first'],
    },
  ]),
});

const ALLOWED_ADAPTER_KEYS = new Set([
  'adapterId', 'version', 'authorityState', 'upstreamProviderKey', 'upstreamProviderPackageRef', 'upstreamTopologyRef',
  'downstreamProviderKey', 'downstreamProviderContractState', 'neutralOutputContractVersion', 'lateralityConvention',
  'evidenceRefs', 'mappings',
]);
const ALLOWED_MAPPING_KEYS = new Set([
  'mappingId', 'anchorRef', 'consumerSlot', 'sourceConnectionSetRefs', 'transform', 'outputGeometryKind', 'status',
  'qualityDependencies', 'evidenceRefs', 'rationale', 'blockers',
]);
const ALLOWED_FIXTURE_KEYS = new Set(['fixtureId', 'providerKey', 'providerPackageRef', 'topologyRef', 'landmarks']);
const ALLOWED_LANDMARK_KEYS = new Set(['index', 'x', 'y', 'z']);

function exactKeys(value: object, allowed: ReadonlySet<string>, path: string): void {
  const unexpected = Object.keys(value).find((key) => !allowed.has(key));
  if (unexpected !== undefined) throw new FaceAuthorityValidationError(`${path} contains unauthorized field: ${unexpected}`);
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

function normalized(value: number, path: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new FaceAuthorityValidationError(`${path} must be finite within [0,1].`);
}

function validateTopology(topology: ProviderTopologySnapshotV1): void {
  if (topology.landmarkCount !== 478) throw new FaceAuthorityValidationError('FR-16 topology landmarkCount must remain 478 for this research snapshot.');
  for (const [setKey, entries] of Object.entries(topology.connectionSets)) {
    if (entries.length === 0) throw new FaceAuthorityValidationError(`FR-16 topology connection set is empty: ${setKey}`);
    for (const connection of entries) {
      if (!Number.isInteger(connection.start) || !Number.isInteger(connection.end)) {
        throw new FaceAuthorityValidationError(`FR-16 topology indices must be integers: ${setKey}`);
      }
      if (connection.start < 0 || connection.start >= topology.landmarkCount || connection.end < 0 || connection.end >= topology.landmarkCount) {
        throw new FaceAuthorityValidationError(`FR-16 topology index out of range: ${setKey}`);
      }
    }
  }
}

export function validateProviderAdapterDefinitionFR16(
  adapter: ProviderAdapterDefinitionV1 = FACELAB_MEDIAPIPE_ADAPTER_RESEARCH_FR16,
  topology: ProviderTopologySnapshotV1 = MEDIAPIPE_FACE_TOPOLOGY_RESEARCH_FR16,
): ProviderAdapterDefinitionV1 {
  exactKeys(adapter, ALLOWED_ADAPTER_KEYS, 'FR-16 adapter');
  validateTopology(topology);
  nonEmpty(adapter.adapterId, 'fr16.adapterId');
  nonEmpty(adapter.version, 'fr16.version');
  if (adapter.authorityState !== 'research_only') throw new FaceAuthorityValidationError('FR-16 adapter must remain research_only.');
  if (adapter.upstreamProviderKey !== topology.providerKey || adapter.upstreamProviderPackageRef !== topology.providerPackageRef) {
    throw new FaceAuthorityValidationError('FR-16 adapter upstream provider/package must match topology snapshot.');
  }
  if (adapter.upstreamTopologyRef !== topology.topologyRef) throw new FaceAuthorityValidationError('FR-16 adapter topology ref mismatch.');
  if (adapter.downstreamProviderContractState !== 'unpublished') {
    throw new FaceAuthorityValidationError('FR-16 current adapter cannot claim a published downstream FaceLab neutral contract.');
  }
  if (adapter.neutralOutputContractVersion !== 'myeongha-neutral-observation-v1') {
    throw new FaceAuthorityValidationError('FR-16 neutral output contract must target FR-15 v1.');
  }
  unique(adapter.evidenceRefs, 'fr16.adapter.evidenceRefs');
  unique(adapter.mappings.map((mapping) => mapping.mappingId), 'fr16.mappingIds');
  unique(adapter.mappings.map((mapping) => mapping.anchorRef), 'fr16.anchorRefs');
  unique(adapter.mappings.map((mapping) => mapping.consumerSlot), 'fr16.consumerSlots');

  const fr14ByAnchor = new Map(FACELAB_NEUTRAL_BINDING_PROFILE_FR14.bindings.map((binding) => [binding.anchorRef, binding] as const));
  if (adapter.mappings.length !== FACELAB_NEUTRAL_BINDING_PROFILE_FR14.bindings.length) {
    throw new FaceAuthorityValidationError('FR-16 adapter must account for every FR-14 neutral binding, even when blocked.');
  }

  for (const mapping of adapter.mappings) {
    exactKeys(mapping, ALLOWED_MAPPING_KEYS, `FR-16 mapping ${mapping.mappingId}`);
    const binding = fr14ByAnchor.get(mapping.anchorRef);
    if (binding === undefined) throw new FaceAuthorityValidationError(`FR-16 mapping targets non-neutral/unregistered anchor: ${mapping.anchorRef}`);
    if (binding.consumerSlot !== mapping.consumerSlot) throw new FaceAuthorityValidationError(`FR-16 consumerSlot mismatch: ${mapping.mappingId}`);
    if (mapping.outputGeometryKind !== (
      binding.consumerSlot.includes('brow_midline') ? 'point'
        : binding.consumerSlot.includes('brow_region') ? 'curve'
          : 'region'
    )) {
      throw new FaceAuthorityValidationError(`FR-16 output geometry kind mismatch: ${mapping.mappingId}`);
    }
    unique(mapping.sourceConnectionSetRefs, `${mapping.mappingId}.sourceConnectionSetRefs`);
    for (const sourceRef of mapping.sourceConnectionSetRefs) {
      if (!(sourceRef in topology.connectionSets)) throw new FaceAuthorityValidationError(`FR-16 unknown provider connection set: ${sourceRef}`);
    }
    if (mapping.status === 'research_candidate') {
      if (mapping.transform !== 'convex_hull_of_connection_vertices') {
        throw new FaceAuthorityValidationError(`FR-16 candidate mapping requires bounded convex-hull transform: ${mapping.mappingId}`);
      }
      if (mapping.outputGeometryKind !== 'region') {
        throw new FaceAuthorityValidationError(`FR-16 current candidate transform may emit only region geometry: ${mapping.mappingId}`);
      }
    } else {
      if (mapping.transform !== 'blocked') throw new FaceAuthorityValidationError(`FR-16 blocked mapping cannot carry an executable transform: ${mapping.mappingId}`);
      if (mapping.blockers.length === 0) throw new FaceAuthorityValidationError(`FR-16 blocked mapping requires blockers: ${mapping.mappingId}`);
    }
    if (mapping.rationale.trim().length === 0 || mapping.evidenceRefs.length === 0) {
      throw new FaceAuthorityValidationError(`FR-16 mapping requires rationale and evidence: ${mapping.mappingId}`);
    }
  }
  return adapter;
}

function uniqueSourceIndices(mapping: ProviderNeutralMappingDefinitionV1, topology: ProviderTopologySnapshotV1): readonly number[] {
  const indices = new Set<number>();
  for (const sourceRef of mapping.sourceConnectionSetRefs) {
    for (const connection of topology.connectionSets[sourceRef]) {
      indices.add(connection.start);
      indices.add(connection.end);
    }
  }
  return Object.freeze([...indices].sort((a, b) => a - b));
}

function cross(o: NormalizedPoint2DV1, a: NormalizedPoint2DV1, b: NormalizedPoint2DV1): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

function convexHull(points: readonly NormalizedPoint2DV1[]): readonly NormalizedPoint2DV1[] {
  const sorted = [...points]
    .map((point) => ({ x: point.x, y: point.y }))
    .sort((a, b) => a.x - b.x || a.y - b.y);
  const deduped = sorted.filter((point, index) => index === 0 || point.x !== sorted[index - 1]?.x || point.y !== sorted[index - 1]?.y);
  if (deduped.length < 3) throw new FaceAuthorityValidationError('FR-16 convex hull requires at least 3 unique 2D provider points.');
  const lower: NormalizedPoint2DV1[] = [];
  for (const point of deduped) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, point) <= 0) lower.pop();
    lower.push(point);
  }
  const upper: NormalizedPoint2DV1[] = [];
  for (const point of [...deduped].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, point) <= 0) upper.pop();
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  return Object.freeze([...lower, ...upper].map((point) => Object.freeze(point)));
}

function stableGeometryFingerprint(geometry: NeutralObservationGeometryV1): string {
  const payload = JSON.stringify(geometry);
  return `sha256:${createHash('sha256').update(payload, 'utf8').digest('hex')}`;
}

export function runProviderAdapterResearchMappingFR16(input: {
  readonly mappingId: string;
  readonly fixture: ProviderRawLandmarkFixtureV1;
  readonly adapter?: ProviderAdapterDefinitionV1;
  readonly topology?: ProviderTopologySnapshotV1;
}): ProviderAdapterResearchProjectionV1 {
  const adapter = input.adapter ?? FACELAB_MEDIAPIPE_ADAPTER_RESEARCH_FR16;
  const topology = input.topology ?? MEDIAPIPE_FACE_TOPOLOGY_RESEARCH_FR16;
  validateProviderAdapterDefinitionFR16(adapter, topology);
  const mapping = adapter.mappings.find((candidate) => candidate.mappingId === input.mappingId);
  if (mapping === undefined) throw new FaceAuthorityValidationError(`FR-16 unknown mappingId: ${input.mappingId}`);
  if (mapping.status !== 'research_candidate' || mapping.transform !== 'convex_hull_of_connection_vertices') {
    throw new FaceAuthorityValidationError(`FR-16 mapping is not executable: ${mapping.mappingId}`);
  }
  exactKeys(input.fixture, ALLOWED_FIXTURE_KEYS, 'FR-16 provider fixture');
  if (input.fixture.providerKey !== adapter.upstreamProviderKey || input.fixture.providerPackageRef !== adapter.upstreamProviderPackageRef) {
    throw new FaceAuthorityValidationError('FR-16 provider fixture provider/package mismatch.');
  }
  if (input.fixture.topologyRef !== topology.topologyRef) throw new FaceAuthorityValidationError('FR-16 provider fixture topology mismatch.');
  unique(input.fixture.landmarks.map((landmark) => String(landmark.index)), 'fr16.fixture.landmarkIndices');
  const byIndex = new Map<number, ProviderRawLandmarkV1>();
  for (const landmark of input.fixture.landmarks) {
    exactKeys(landmark, ALLOWED_LANDMARK_KEYS, `FR-16 landmark ${landmark.index}`);
    if (!Number.isInteger(landmark.index) || landmark.index < 0 || landmark.index >= topology.landmarkCount) {
      throw new FaceAuthorityValidationError(`FR-16 fixture landmark index out of range: ${landmark.index}`);
    }
    normalized(landmark.x, `fr16.landmark.${landmark.index}.x`);
    normalized(landmark.y, `fr16.landmark.${landmark.index}.y`);
    if (!Number.isFinite(landmark.z)) throw new FaceAuthorityValidationError(`fr16.landmark.${landmark.index}.z must be finite.`);
    byIndex.set(landmark.index, landmark);
  }
  const sourceIndices = uniqueSourceIndices(mapping, topology);
  const points = sourceIndices.map((index) => {
    const landmark = byIndex.get(index);
    if (landmark === undefined) throw new FaceAuthorityValidationError(`FR-16 provider fixture missing required landmark index: ${index}`);
    return { x: landmark.x, y: landmark.y };
  });
  const geometry: NeutralObservationGeometryV1 = Object.freeze({
    kind: 'region' as const,
    boundary: convexHull(points),
  });
  return Object.freeze({
    authorityState: 'adapter_research_only' as const,
    adapterRef: `${adapter.adapterId}@${adapter.version}`,
    mappingId: mapping.mappingId,
    anchorRef: mapping.anchorRef,
    consumerSlot: mapping.consumerSlot,
    geometry,
    providerSourceIndices: sourceIndices,
    ignoredProviderDimensions: Object.freeze(['z'] as const),
    outputFingerprint: stableGeometryFingerprint(geometry),
    evidenceRefs: Object.freeze([...mapping.evidenceRefs]),
  });
}

export function assessProviderAdapterReadinessFR16(
  adapter: ProviderAdapterDefinitionV1 = FACELAB_MEDIAPIPE_ADAPTER_RESEARCH_FR16,
): ProviderAdapterReadinessV1 {
  validateProviderAdapterDefinitionFR16(adapter);
  const candidateMappingIds = adapter.mappings.filter((mapping) => mapping.status === 'research_candidate').map((mapping) => mapping.mappingId);
  const blockedMappingIds = adapter.mappings.filter((mapping) => mapping.status !== 'research_candidate').map((mapping) => mapping.mappingId);
  const blockers = [
    'FaceLab production-neutral downstream contract is unpublished',
    'exact @mediapipe/tasks-vision@0.10.35 topology release attestation is missing',
    'provider laterality orientation fixture is missing',
    ...adapter.mappings.flatMap((mapping) => mapping.blockers.map((blocker) => `${mapping.mappingId}: ${blocker}`)),
  ];
  return Object.freeze({
    readyForNeutralProviderCandidate: false,
    blockers: Object.freeze([...new Set(blockers)]),
    candidateMappingIds: Object.freeze(candidateMappingIds),
    blockedMappingIds: Object.freeze(blockedMappingIds),
  });
}
