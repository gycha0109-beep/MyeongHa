import {
  inspectMediaPipePublishedFaceLandmarkerTopologyFR37,
  validateMediaPipePublishedTopologySurfaceGapAuthorityFR37,
} from './mediapipe-published-topology-surface-gap-fr37.js';
import {
  THREE_DIVISIONS_VERTICAL_REFERENCE_DERIVATION_AUTHORITY_FR36,
  validateThreeDivisionsVerticalReferenceDerivationAuthorityFR36,
} from './three-divisions-vertical-reference-derivations-fr36.js';
import { FaceAuthorityValidationError } from './validation.js';

export interface MediaPipeFaceOvalProviderEdgeFR45V1 {
  readonly start: number;
  readonly end: number;
}

export interface MediaPipeNormalizedFacePointFR45V1 {
  readonly x: number;
  readonly y: number;
  readonly z?: number;
}

export interface MediaPipeFaceOvalTopologyEvidenceFR45V1 {
  readonly topologySymbol: 'FACE_LANDMARKS_FACE_OVAL';
  readonly sourceRuntimeEdgeSequenceMatch: true;
  readonly edgeCount: 36;
  readonly vertexCount: 36;
  readonly connectedComponentCount: 1;
  readonly cycleRank: 1;
  readonly maxVertexDegree: 2;
  readonly topologyClass: 'simple_cycle';
  readonly providerIndexSemanticAuthority: false;
}

export type MediaPipeFaceOvalInferiorExtremumStateFR45V1 =
  | 'unique_image_inferior_extremum'
  | 'ambiguous_exact_tie';

export interface MediaPipeFaceOvalInferiorExtremumEvidenceFR45V1 {
  readonly state: MediaPipeFaceOvalInferiorExtremumStateFR45V1;
  readonly algorithmRef: 'algorithm.neutral.face_oval.image_inferior_extremum.fr45@0.1.0';
  readonly coordinateFrame: 'normalized_image_2d';
  readonly axis: 'y';
  readonly selectionRule: 'maximum_normalized_image_y_over_exact_face_oval_vertices';
  readonly maxY: number;
  readonly tiedProviderLandmarkIndices: readonly number[];
  readonly selectedProviderLandmarkIndex: number | null;
  readonly selectedPoint: Readonly<{ x: number; y: number }> | null;
  readonly providerIndexSemanticAuthority: false;
  readonly chinInferiorContourBindingAuthorized: false;
  readonly traditionalDigeEquivalenceAuthorized: false;
  readonly fr36VerticalReferencePromoted: false;
  readonly productionGeometryAuthorized: false;
}

export interface MediaPipeFaceOvalInferiorExtremumAuthorityFR45V1 {
  readonly schemaVersion: 'fr45-v1';
  readonly authorityRef: 'authority.face.mediapipe_face_oval_inferior_extremum.fr45';
  readonly authorityVersion: '0.1.0';
  readonly authorityState: 'release_exact_face_oval_extremum_candidate_executable_traditional_binding_blocked';
  readonly packageName: '@mediapipe/tasks-vision';
  readonly packageVersion: '0.10.35';
  readonly fr36AuthorityRef: string;
  readonly fr37AuthorityRef: 'authority.face.mediapipe_published_topology_surface_gap.fr37@0.1.0';
  readonly exactSourceWitness: {
    readonly repository: 'google-ai-edge/mediapipe';
    readonly ref: 'v0.10.35';
    readonly path: 'mediapipe/tasks/web/vision/face_landmarker/face_landmarks_connections.ts';
    readonly blobSha: '644de9d8c7cd90880d92b2393b4913fa93ace927';
    readonly symbol: 'FACE_LANDMARKS_FACE_OVAL';
  };
  readonly expectedTopology: {
    readonly edgeCount: 36;
    readonly vertexCount: 36;
    readonly connectedComponentCount: 1;
    readonly cycleRank: 1;
    readonly maxVertexDegree: 2;
    readonly topologyClass: 'simple_cycle';
  };
  readonly candidateAlgorithm: {
    readonly algorithmRef: 'algorithm.neutral.face_oval.image_inferior_extremum.fr45@0.1.0';
    readonly inputTopology: 'FACE_LANDMARKS_FACE_OVAL';
    readonly coordinateFrame: 'normalized_image_2d';
    readonly outputClass: 'provider_neutral_candidate_point';
    readonly selectionRule: 'maximum_normalized_image_y_over_exact_face_oval_vertices';
    readonly exactTiePolicy: 'ambiguous_no_epsilon';
  };
  readonly authorityBoundary: {
    readonly providerFaceOvalMeansChinInferiorContour: false;
    readonly providerIndexMeansAnatomicalLandmark: false;
    readonly imageInferiorExtremumMeansMidSagittalChinPoint: false;
    readonly imageInferiorExtremumMeansTraditionalDige: false;
    readonly fr35ProviderBindingAuthorized: false;
    readonly fr36VerticalReferencePromoted: false;
    readonly sourceVariantSelectionAuthorized: false;
    readonly productionMetricAllowed: false;
    readonly productionF1Allowed: false;
    readonly productionF6Allowed: false;
  };
}

export interface MediaPipeFaceOvalInferiorExtremumReadinessFR45V1 {
  readonly releaseExactFaceOvalTopologyReady: true;
  readonly providerNeutralExtremumAlgorithmExecutable: true;
  readonly providerIndexSemanticAuthorityUsed: false;
  readonly fr35ChinInferiorContourBindingReady: false;
  readonly traditionalDigeEquivalenceReady: false;
  readonly fr36DigeVerticalReferenceReady: false;
  readonly productionMetricReady: false;
  readonly nextRequiredEvidence: readonly string[];
}

const FR36_REF = `${THREE_DIVISIONS_VERTICAL_REFERENCE_DERIVATION_AUTHORITY_FR36.authorityRef}@${THREE_DIVISIONS_VERTICAL_REFERENCE_DERIVATION_AUTHORITY_FR36.authorityVersion}`;

export const MEDIAPIPE_FACE_OVAL_SOURCE_EDGES_FR45: readonly MediaPipeFaceOvalProviderEdgeFR45V1[] = Object.freeze([
  [10, 338], [338, 297], [297, 332], [332, 284], [284, 251], [251, 389],
  [389, 356], [356, 454], [454, 323], [323, 361], [361, 288], [288, 397],
  [397, 365], [365, 379], [379, 378], [378, 400], [400, 377], [377, 152],
  [152, 148], [148, 176], [176, 149], [149, 150], [150, 136], [136, 172],
  [172, 58], [58, 132], [132, 93], [93, 234], [234, 127], [127, 162],
  [162, 21], [21, 54], [54, 103], [103, 67], [67, 109], [109, 10],
].map(([start, end]) => Object.freeze({ start: start!, end: end! })));

export const MEDIAPIPE_FACE_OVAL_INFERIOR_EXTREMUM_AUTHORITY_FR45:
MediaPipeFaceOvalInferiorExtremumAuthorityFR45V1 = Object.freeze({
  schemaVersion: 'fr45-v1' as const,
  authorityRef: 'authority.face.mediapipe_face_oval_inferior_extremum.fr45' as const,
  authorityVersion: '0.1.0' as const,
  authorityState: 'release_exact_face_oval_extremum_candidate_executable_traditional_binding_blocked' as const,
  packageName: '@mediapipe/tasks-vision' as const,
  packageVersion: '0.10.35' as const,
  fr36AuthorityRef: FR36_REF,
  fr37AuthorityRef: 'authority.face.mediapipe_published_topology_surface_gap.fr37@0.1.0' as const,
  exactSourceWitness: Object.freeze({
    repository: 'google-ai-edge/mediapipe' as const,
    ref: 'v0.10.35' as const,
    path: 'mediapipe/tasks/web/vision/face_landmarker/face_landmarks_connections.ts' as const,
    blobSha: '644de9d8c7cd90880d92b2393b4913fa93ace927' as const,
    symbol: 'FACE_LANDMARKS_FACE_OVAL' as const,
  }),
  expectedTopology: Object.freeze({
    edgeCount: 36 as const,
    vertexCount: 36 as const,
    connectedComponentCount: 1 as const,
    cycleRank: 1 as const,
    maxVertexDegree: 2 as const,
    topologyClass: 'simple_cycle' as const,
  }),
  candidateAlgorithm: Object.freeze({
    algorithmRef: 'algorithm.neutral.face_oval.image_inferior_extremum.fr45@0.1.0' as const,
    inputTopology: 'FACE_LANDMARKS_FACE_OVAL' as const,
    coordinateFrame: 'normalized_image_2d' as const,
    outputClass: 'provider_neutral_candidate_point' as const,
    selectionRule: 'maximum_normalized_image_y_over_exact_face_oval_vertices' as const,
    exactTiePolicy: 'ambiguous_no_epsilon' as const,
  }),
  authorityBoundary: Object.freeze({
    providerFaceOvalMeansChinInferiorContour: false as const,
    providerIndexMeansAnatomicalLandmark: false as const,
    imageInferiorExtremumMeansMidSagittalChinPoint: false as const,
    imageInferiorExtremumMeansTraditionalDige: false as const,
    fr35ProviderBindingAuthorized: false as const,
    fr36VerticalReferencePromoted: false as const,
    sourceVariantSelectionAuthorized: false as const,
    productionMetricAllowed: false as const,
    productionF1Allowed: false as const,
    productionF6Allowed: false as const,
  }),
});

function isProviderEdge(value: unknown): value is MediaPipeFaceOvalProviderEdgeFR45V1 {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length === 2 && Number.isInteger(record.start) && Number.isInteger(record.end) &&
    (record.start as number) >= 0 && (record.end as number) >= 0;
}

function readRuntimeFaceOvalEdges(runtimeClass: object): readonly MediaPipeFaceOvalProviderEdgeFR45V1[] {
  inspectMediaPipePublishedFaceLandmarkerTopologyFR37(runtimeClass);
  const value = Reflect.get(runtimeClass, 'FACE_LANDMARKS_FACE_OVAL') as unknown;
  if (!Array.isArray(value) || value.length !== 36 || !value.every(isProviderEdge)) {
    throw new FaceAuthorityValidationError('FR-45 FACE_LANDMARKS_FACE_OVAL must expose exactly 36 valid provider edges.');
  }
  return Object.freeze(value.map((edge) => Object.freeze({ start: edge.start, end: edge.end })));
}

function sameEdgeSequence(
  actual: readonly MediaPipeFaceOvalProviderEdgeFR45V1[],
  expected: readonly MediaPipeFaceOvalProviderEdgeFR45V1[],
): boolean {
  return actual.length === expected.length && actual.every((edge, index) => {
    const target = expected[index];
    return target !== undefined && edge.start === target.start && edge.end === target.end;
  });
}

function analyzeSimpleCycle(edges: readonly MediaPipeFaceOvalProviderEdgeFR45V1[]): MediaPipeFaceOvalTopologyEvidenceFR45V1 {
  const adjacency = new Map<number, Set<number>>();
  for (const edge of edges) {
    if (edge.start === edge.end) throw new FaceAuthorityValidationError('FR-45 face oval cannot contain self-loops.');
    const a = adjacency.get(edge.start) ?? new Set<number>();
    a.add(edge.end);
    adjacency.set(edge.start, a);
    const b = adjacency.get(edge.end) ?? new Set<number>();
    b.add(edge.start);
    adjacency.set(edge.end, b);
  }
  const vertices = [...adjacency.keys()];
  const unvisited = new Set(vertices);
  let connectedComponentCount = 0;
  while (unvisited.size > 0) {
    connectedComponentCount += 1;
    const seed = unvisited.values().next().value as number;
    const stack = [seed];
    unvisited.delete(seed);
    while (stack.length > 0) {
      const current = stack.pop()!;
      for (const neighbor of adjacency.get(current) ?? []) {
        if (!unvisited.has(neighbor)) continue;
        unvisited.delete(neighbor);
        stack.push(neighbor);
      }
    }
  }
  const maxVertexDegree = Math.max(...vertices.map((vertex) => adjacency.get(vertex)?.size ?? 0));
  const cycleRank = edges.length - vertices.length + connectedComponentCount;
  if (edges.length !== 36 || vertices.length !== 36 || connectedComponentCount !== 1 || cycleRank !== 1 ||
      maxVertexDegree !== 2 || vertices.some((vertex) => adjacency.get(vertex)?.size !== 2)) {
    throw new FaceAuthorityValidationError('FR-45 exact face oval topology is not the required 36-vertex simple cycle.');
  }
  return Object.freeze({
    topologySymbol: 'FACE_LANDMARKS_FACE_OVAL' as const,
    sourceRuntimeEdgeSequenceMatch: true as const,
    edgeCount: 36 as const,
    vertexCount: 36 as const,
    connectedComponentCount: 1 as const,
    cycleRank: 1 as const,
    maxVertexDegree: 2 as const,
    topologyClass: 'simple_cycle' as const,
    providerIndexSemanticAuthority: false as const,
  });
}

export function inspectMediaPipeFaceOvalTopologyFR45(
  faceLandmarkerRuntimeClass: object,
): MediaPipeFaceOvalTopologyEvidenceFR45V1 {
  const runtimeEdges = readRuntimeFaceOvalEdges(faceLandmarkerRuntimeClass);
  if (!sameEdgeSequence(runtimeEdges, MEDIAPIPE_FACE_OVAL_SOURCE_EDGES_FR45)) {
    throw new FaceAuthorityValidationError('FR-45 published runtime FACE_OVAL edge sequence drifted from exact v0.10.35 source witness.');
  }
  return analyzeSimpleCycle(runtimeEdges);
}

function faceOvalVertices(): readonly number[] {
  const seen = new Set<number>();
  for (const edge of MEDIAPIPE_FACE_OVAL_SOURCE_EDGES_FR45) {
    seen.add(edge.start);
    seen.add(edge.end);
  }
  return Object.freeze([...seen]);
}

const FACE_OVAL_VERTICES = faceOvalVertices();

function readFiniteLandmark(
  landmarks: readonly MediaPipeNormalizedFacePointFR45V1[],
  index: number,
): MediaPipeNormalizedFacePointFR45V1 {
  const point = landmarks[index];
  if (point === undefined || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new FaceAuthorityValidationError(`FR-45 missing/non-finite face oval landmark at provider index ${index}.`);
  }
  return point;
}

export function deriveMediaPipeFaceOvalImageInferiorExtremumFR45(
  faceLandmarkerRuntimeClass: object,
  landmarks: readonly MediaPipeNormalizedFacePointFR45V1[],
): MediaPipeFaceOvalInferiorExtremumEvidenceFR45V1 {
  inspectMediaPipeFaceOvalTopologyFR45(faceLandmarkerRuntimeClass);
  const points = FACE_OVAL_VERTICES.map((index) => ({ index, point: readFiniteLandmark(landmarks, index) }));
  const maxY = Math.max(...points.map(({ point }) => point.y));
  const tied = points.filter(({ point }) => point.y === maxY);
  if (tied.length === 0) throw new FaceAuthorityValidationError('FR-45 could not derive a finite face oval inferior extremum.');
  const tiedIndices = Object.freeze(tied.map(({ index }) => index));
  if (tied.length !== 1) {
    return Object.freeze({
      state: 'ambiguous_exact_tie' as const,
      algorithmRef: 'algorithm.neutral.face_oval.image_inferior_extremum.fr45@0.1.0' as const,
      coordinateFrame: 'normalized_image_2d' as const,
      axis: 'y' as const,
      selectionRule: 'maximum_normalized_image_y_over_exact_face_oval_vertices' as const,
      maxY,
      tiedProviderLandmarkIndices: tiedIndices,
      selectedProviderLandmarkIndex: null,
      selectedPoint: null,
      providerIndexSemanticAuthority: false as const,
      chinInferiorContourBindingAuthorized: false as const,
      traditionalDigeEquivalenceAuthorized: false as const,
      fr36VerticalReferencePromoted: false as const,
      productionGeometryAuthorized: false as const,
    });
  }
  const selected = tied[0]!;
  return Object.freeze({
    state: 'unique_image_inferior_extremum' as const,
    algorithmRef: 'algorithm.neutral.face_oval.image_inferior_extremum.fr45@0.1.0' as const,
    coordinateFrame: 'normalized_image_2d' as const,
    axis: 'y' as const,
    selectionRule: 'maximum_normalized_image_y_over_exact_face_oval_vertices' as const,
    maxY,
    tiedProviderLandmarkIndices: tiedIndices,
    selectedProviderLandmarkIndex: selected.index,
    selectedPoint: Object.freeze({ x: selected.point.x, y: selected.point.y }),
    providerIndexSemanticAuthority: false as const,
    chinInferiorContourBindingAuthorized: false as const,
    traditionalDigeEquivalenceAuthorized: false as const,
    fr36VerticalReferencePromoted: false as const,
    productionGeometryAuthorized: false as const,
  });
}

export function validateMediaPipeFaceOvalInferiorExtremumAuthorityFR45(
  authority: MediaPipeFaceOvalInferiorExtremumAuthorityFR45V1 = MEDIAPIPE_FACE_OVAL_INFERIOR_EXTREMUM_AUTHORITY_FR45,
): MediaPipeFaceOvalInferiorExtremumAuthorityFR45V1 {
  validateThreeDivisionsVerticalReferenceDerivationAuthorityFR36();
  validateMediaPipePublishedTopologySurfaceGapAuthorityFR37();
  if (authority.schemaVersion !== 'fr45-v1' ||
      authority.authorityRef !== 'authority.face.mediapipe_face_oval_inferior_extremum.fr45' ||
      authority.authorityVersion !== '0.1.0' ||
      authority.authorityState !== 'release_exact_face_oval_extremum_candidate_executable_traditional_binding_blocked' ||
      authority.packageName !== '@mediapipe/tasks-vision' || authority.packageVersion !== '0.10.35' ||
      authority.fr36AuthorityRef !== FR36_REF ||
      authority.fr37AuthorityRef !== 'authority.face.mediapipe_published_topology_surface_gap.fr37@0.1.0') {
    throw new FaceAuthorityValidationError('FR-45 identity/upstream authority drift.');
  }
  const witness = authority.exactSourceWitness;
  if (witness.repository !== 'google-ai-edge/mediapipe' || witness.ref !== 'v0.10.35' ||
      witness.path !== 'mediapipe/tasks/web/vision/face_landmarker/face_landmarks_connections.ts' ||
      witness.blobSha !== '644de9d8c7cd90880d92b2393b4913fa93ace927' || witness.symbol !== 'FACE_LANDMARKS_FACE_OVAL') {
    throw new FaceAuthorityValidationError('FR-45 exact source witness drift.');
  }
  const expected = authority.expectedTopology;
  if (expected.edgeCount !== 36 || expected.vertexCount !== 36 || expected.connectedComponentCount !== 1 ||
      expected.cycleRank !== 1 || expected.maxVertexDegree !== 2 || expected.topologyClass !== 'simple_cycle') {
    throw new FaceAuthorityValidationError('FR-45 expected FACE_OVAL topology drift.');
  }
  if (authority.candidateAlgorithm.algorithmRef !== 'algorithm.neutral.face_oval.image_inferior_extremum.fr45@0.1.0' ||
      authority.candidateAlgorithm.inputTopology !== 'FACE_LANDMARKS_FACE_OVAL' ||
      authority.candidateAlgorithm.coordinateFrame !== 'normalized_image_2d' ||
      authority.candidateAlgorithm.outputClass !== 'provider_neutral_candidate_point' ||
      authority.candidateAlgorithm.selectionRule !== 'maximum_normalized_image_y_over_exact_face_oval_vertices' ||
      authority.candidateAlgorithm.exactTiePolicy !== 'ambiguous_no_epsilon') {
    throw new FaceAuthorityValidationError('FR-45 candidate algorithm drift.');
  }
  if (Object.values(authority.authorityBoundary).some((value) => value !== false)) {
    throw new FaceAuthorityValidationError('FR-45 authority boundary must remain fully fail-closed.');
  }
  return authority;
}

export function assessMediaPipeFaceOvalInferiorExtremumReadinessFR45(
  authority: MediaPipeFaceOvalInferiorExtremumAuthorityFR45V1 = MEDIAPIPE_FACE_OVAL_INFERIOR_EXTREMUM_AUTHORITY_FR45,
): MediaPipeFaceOvalInferiorExtremumReadinessFR45V1 {
  validateMediaPipeFaceOvalInferiorExtremumAuthorityFR45(authority);
  return Object.freeze({
    releaseExactFaceOvalTopologyReady: true as const,
    providerNeutralExtremumAlgorithmExecutable: true as const,
    providerIndexSemanticAuthorityUsed: false as const,
    fr35ChinInferiorContourBindingReady: false as const,
    traditionalDigeEquivalenceReady: false as const,
    fr36DigeVerticalReferenceReady: false as const,
    productionMetricReady: false as const,
    nextRequiredEvidence: Object.freeze([
      'independent anatomical evidence relating the neutral inferior facial outline to the required chin-inferior target without using provider indices as semantics',
      'controlled multi-subject capture evidence for uniqueness, bilateral/pose stability, and repeatability of the image-space inferior extremum',
      'reviewed rule for whether a point extremum can satisfy or derive from the FR-35 chin_inferior_contour surface contract',
      'reviewed traditional-neutral equivalence before any 地閣 or 三停 use',
    ]),
  });
}

export function assertMediaPipeFaceOvalInferiorExtremumProductionReadyFR45(): never {
  validateMediaPipeFaceOvalInferiorExtremumAuthorityFR45();
  throw new FaceAuthorityValidationError(
    'FR-45 proves only release-exact provider-neutral FACE_OVAL inferior-extremum extractability; FR-35 binding, 地閣 equivalence, FR-36 promotion, and production metrics remain blocked.',
  );
}
