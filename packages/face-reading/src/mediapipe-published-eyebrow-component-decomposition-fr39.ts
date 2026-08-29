import {
  MEDIAPIPE_PUBLISHED_DERIVATION_GAP_RECONCILIATION_AUTHORITY_FR38,
  inspectMediaPipePublishedBrowTopologyGraphsFR38,
  validateMediaPipePublishedDerivationGapReconciliationAuthorityFR38,
} from './mediapipe-published-derivation-gap-reconciliation-fr38.js';
import { FaceAuthorityValidationError } from './validation.js';

export type PublishedEyebrowTopologySymbolFR39V1 =
  | 'FACE_LANDMARKS_LEFT_EYEBROW'
  | 'FACE_LANDMARKS_RIGHT_EYEBROW';

export interface PublishedEyebrowProviderEdgeEvidenceFR39V1 {
  readonly start: number;
  readonly end: number;
}

export interface PublishedEyebrowComponentEvidenceFR39V1 {
  readonly serializationOrdinal: 1 | 2;
  readonly serializationOrderHasSemanticMeaning: false;
  readonly topologyClass: 'open_path';
  readonly edgeCount: 4;
  readonly vertexCount: 5;
  readonly endpointCount: 2;
  readonly cycleRank: 0;
  readonly maxVertexDegree: 2;
  readonly providerEdgeEvidence: readonly PublishedEyebrowProviderEdgeEvidenceFR39V1[];
  readonly neutralRole: null;
  readonly selectedAsNeutralCurve: false;
}

export interface PublishedEyebrowSideDecompositionEvidenceFR39V1 {
  readonly topologySymbol: PublishedEyebrowTopologySymbolFR39V1;
  readonly providerComponentCount: 2;
  readonly components: readonly [
    PublishedEyebrowComponentEvidenceFR39V1,
    PublishedEyebrowComponentEvidenceFR39V1,
  ];
  readonly allProviderEdgesAccountedForExactlyOnce: true;
  readonly componentSelectionAuthorized: false;
  readonly componentMergeAuthorized: false;
  readonly pointwiseCorrespondenceAuthorized: false;
  readonly neutralSingleCurveReady: false;
}

export interface MediaPipePublishedEyebrowComponentDecompositionAuthorityFR39V1 {
  readonly schemaVersion: 'fr39-v1';
  readonly authorityRef: 'authority.face.mediapipe_published_eyebrow_component_decomposition.fr39';
  readonly authorityVersion: '0.1.0';
  readonly authorityState: 'release_exact_components_measured_neutral_role_unresolved';
  readonly packageName: '@mediapipe/tasks-vision';
  readonly packageVersion: '0.10.35';
  readonly fr38AuthorityRef: string;
  readonly expectedProviderTopology: {
    readonly sideCount: 2;
    readonly componentCountPerSide: 2;
    readonly componentTopologyClass: 'open_path';
    readonly edgesPerComponent: 4;
    readonly verticesPerComponent: 5;
    readonly endpointsPerComponent: 2;
  };
  readonly unresolvedNeutralQuestions: readonly [
    'which_provider_component_if_any_corresponds_to_neutral_brow_curve',
    'whether_both_components_jointly_define_a_neutral_brow_region_or_curve',
    'whether_cross_component_correspondence_is_methodologically_valid',
    'how_pose_capture_and_expression_stability_must_be_measured',
  ];
  readonly authorityBoundary: {
    readonly serializationOrdinalIsAnatomicalOrder: false;
    readonly firstComponentSelectionAllowed: false;
    readonly secondComponentSelectionAllowed: false;
    readonly bridgeDisconnectedComponentsAllowed: false;
    readonly pointwiseAverageWithoutCorrespondenceAllowed: false;
    readonly bezierSmoothingAllowed: false;
    readonly providerIndexSemanticsAuthorized: false;
    readonly providerComponentToTraditionalBrowEquivalenceAuthorized: false;
    readonly neutralSingleCurveAlgorithmAuthorized: false;
    readonly browMidlineAlgorithmAuthorized: false;
    readonly productionMetricAllowed: false;
    readonly productionF1Allowed: false;
    readonly productionF6Allowed: false;
  };
}

export interface MediaPipePublishedEyebrowComponentDecompositionReadinessFR39V1 {
  readonly exactPublishedPackagePinned: true;
  readonly leftProviderComponentsMeasured: true;
  readonly rightProviderComponentsMeasured: true;
  readonly allEdgesPartitionedExactlyOnce: true;
  readonly componentStructuralSymmetryObserved: true;
  readonly componentAnatomicalRoleResolved: false;
  readonly crossComponentCorrespondenceResolved: false;
  readonly neutralBrowCurveReady: false;
  readonly browMidlineReady: false;
  readonly productionMetricReady: false;
  readonly blockers: readonly string[];
}

const FR38_REF = `${MEDIAPIPE_PUBLISHED_DERIVATION_GAP_RECONCILIATION_AUTHORITY_FR38.authorityRef}@${MEDIAPIPE_PUBLISHED_DERIVATION_GAP_RECONCILIATION_AUTHORITY_FR38.authorityVersion}`;

export const MEDIAPIPE_PUBLISHED_EYEBROW_COMPONENT_DECOMPOSITION_AUTHORITY_FR39:
MediaPipePublishedEyebrowComponentDecompositionAuthorityFR39V1 = Object.freeze({
  schemaVersion: 'fr39-v1' as const,
  authorityRef: 'authority.face.mediapipe_published_eyebrow_component_decomposition.fr39' as const,
  authorityVersion: '0.1.0' as const,
  authorityState: 'release_exact_components_measured_neutral_role_unresolved' as const,
  packageName: '@mediapipe/tasks-vision' as const,
  packageVersion: '0.10.35' as const,
  fr38AuthorityRef: FR38_REF,
  expectedProviderTopology: Object.freeze({
    sideCount: 2 as const,
    componentCountPerSide: 2 as const,
    componentTopologyClass: 'open_path' as const,
    edgesPerComponent: 4 as const,
    verticesPerComponent: 5 as const,
    endpointsPerComponent: 2 as const,
  }),
  unresolvedNeutralQuestions: Object.freeze([
    'which_provider_component_if_any_corresponds_to_neutral_brow_curve',
    'whether_both_components_jointly_define_a_neutral_brow_region_or_curve',
    'whether_cross_component_correspondence_is_methodologically_valid',
    'how_pose_capture_and_expression_stability_must_be_measured',
  ] as const),
  authorityBoundary: Object.freeze({
    serializationOrdinalIsAnatomicalOrder: false as const,
    firstComponentSelectionAllowed: false as const,
    secondComponentSelectionAllowed: false as const,
    bridgeDisconnectedComponentsAllowed: false as const,
    pointwiseAverageWithoutCorrespondenceAllowed: false as const,
    bezierSmoothingAllowed: false as const,
    providerIndexSemanticsAuthorized: false as const,
    providerComponentToTraditionalBrowEquivalenceAuthorized: false as const,
    neutralSingleCurveAlgorithmAuthorized: false as const,
    browMidlineAlgorithmAuthorized: false as const,
    productionMetricAllowed: false as const,
    productionF1Allowed: false as const,
    productionF6Allowed: false as const,
  }),
});

function isProviderEdge(value: unknown): value is PublishedEyebrowProviderEdgeEvidenceFR39V1 {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  return keys.length === 2 && keys.includes('start') && keys.includes('end') &&
    Number.isInteger(record.start) && Number.isInteger(record.end) &&
    (record.start as number) >= 0 && (record.end as number) >= 0;
}

function readPublishedEdges(
  runtimeClass: object,
  topologySymbol: PublishedEyebrowTopologySymbolFR39V1,
): readonly PublishedEyebrowProviderEdgeEvidenceFR39V1[] {
  const value = Reflect.get(runtimeClass, topologySymbol) as unknown;
  if (!Array.isArray(value) || value.length !== 8 || !value.every(isProviderEdge)) {
    throw new FaceAuthorityValidationError(`FR-39 ${topologySymbol} must expose exactly eight valid provider connection edges.`);
  }
  return Object.freeze(value.map((edge) => Object.freeze({ start: edge.start, end: edge.end })));
}

function normalizedEdgeKey(edge: PublishedEyebrowProviderEdgeEvidenceFR39V1): string {
  const low = Math.min(edge.start, edge.end);
  const high = Math.max(edge.start, edge.end);
  return `${low}:${high}`;
}

function decomposeConnectedComponents(
  topologySymbol: PublishedEyebrowTopologySymbolFR39V1,
  edges: readonly PublishedEyebrowProviderEdgeEvidenceFR39V1[],
): readonly [PublishedEyebrowComponentEvidenceFR39V1, PublishedEyebrowComponentEvidenceFR39V1] {
  const adjacency = new Map<number, Set<number>>();
  const edgeByKey = new Map<string, PublishedEyebrowProviderEdgeEvidenceFR39V1>();
  for (const edge of edges) {
    if (edge.start === edge.end) throw new FaceAuthorityValidationError(`FR-39 ${topologySymbol} contains a self-loop.`);
    const key = normalizedEdgeKey(edge);
    if (edgeByKey.has(key)) throw new FaceAuthorityValidationError(`FR-39 ${topologySymbol} contains duplicate edge ${key}.`);
    edgeByKey.set(key, edge);
    const a = adjacency.get(edge.start) ?? new Set<number>();
    a.add(edge.end);
    adjacency.set(edge.start, a);
    const b = adjacency.get(edge.end) ?? new Set<number>();
    b.add(edge.start);
    adjacency.set(edge.end, b);
  }

  const unvisited = new Set(adjacency.keys());
  const rawComponents: Array<{ vertices: number[]; edges: PublishedEyebrowProviderEdgeEvidenceFR39V1[] }> = [];
  while (unvisited.size > 0) {
    const seed = Math.min(...unvisited);
    const stack = [seed];
    const vertices: number[] = [];
    unvisited.delete(seed);
    while (stack.length > 0) {
      const current = stack.pop()!;
      vertices.push(current);
      for (const neighbor of adjacency.get(current) ?? []) {
        if (!unvisited.has(neighbor)) continue;
        unvisited.delete(neighbor);
        stack.push(neighbor);
      }
    }
    const vertexSet = new Set(vertices);
    const componentEdges = edges.filter((edge) => vertexSet.has(edge.start) && vertexSet.has(edge.end));
    rawComponents.push({ vertices: vertices.sort((a, b) => a - b), edges: componentEdges });
  }

  if (rawComponents.length !== 2) {
    throw new FaceAuthorityValidationError(`FR-39 ${topologySymbol} must decompose into exactly two provider components.`);
  }
  rawComponents.sort((a, b) => a.vertices[0]! - b.vertices[0]!);

  const components = rawComponents.map((component, index): PublishedEyebrowComponentEvidenceFR39V1 => {
    const degrees = component.vertices.map((vertex) => adjacency.get(vertex)?.size ?? 0);
    const endpointCount = degrees.filter((degree) => degree === 1).length;
    const maxVertexDegree = Math.max(...degrees);
    const cycleRank = component.edges.length - component.vertices.length + 1;
    if (component.edges.length !== 4 || component.vertices.length !== 5 || endpointCount !== 2 ||
        maxVertexDegree !== 2 || cycleRank !== 0 || degrees.some((degree) => degree < 1 || degree > 2)) {
      throw new FaceAuthorityValidationError(
        `FR-39 ${topologySymbol} component ${index + 1} is not the required 4-edge/5-vertex open path.`,
      );
    }
    return Object.freeze({
      serializationOrdinal: (index + 1) as 1 | 2,
      serializationOrderHasSemanticMeaning: false as const,
      topologyClass: 'open_path' as const,
      edgeCount: 4 as const,
      vertexCount: 5 as const,
      endpointCount: 2 as const,
      cycleRank: 0 as const,
      maxVertexDegree: 2 as const,
      providerEdgeEvidence: Object.freeze(
        [...component.edges]
          .sort((a, b) => normalizedEdgeKey(a).localeCompare(normalizedEdgeKey(b)))
          .map((edge) => Object.freeze({ start: edge.start, end: edge.end })),
      ),
      neutralRole: null,
      selectedAsNeutralCurve: false as const,
    });
  });
  return Object.freeze(components) as unknown as readonly [
    PublishedEyebrowComponentEvidenceFR39V1,
    PublishedEyebrowComponentEvidenceFR39V1,
  ];
}

function inspectSide(
  runtimeClass: object,
  topologySymbol: PublishedEyebrowTopologySymbolFR39V1,
): PublishedEyebrowSideDecompositionEvidenceFR39V1 {
  const edges = readPublishedEdges(runtimeClass, topologySymbol);
  const components = decomposeConnectedComponents(topologySymbol, edges);
  const allKeys = edges.map(normalizedEdgeKey).sort();
  const componentKeys = components.flatMap((component) => component.providerEdgeEvidence.map(normalizedEdgeKey)).sort();
  if (allKeys.length !== componentKeys.length || allKeys.some((key, index) => key !== componentKeys[index])) {
    throw new FaceAuthorityValidationError(`FR-39 ${topologySymbol} component partition does not account for every edge exactly once.`);
  }
  return Object.freeze({
    topologySymbol,
    providerComponentCount: 2 as const,
    components,
    allProviderEdgesAccountedForExactlyOnce: true as const,
    componentSelectionAuthorized: false as const,
    componentMergeAuthorized: false as const,
    pointwiseCorrespondenceAuthorized: false as const,
    neutralSingleCurveReady: false as const,
  });
}

export function inspectMediaPipePublishedEyebrowComponentsFR39(
  faceLandmarkerRuntimeClass: object,
): Readonly<{
  left: PublishedEyebrowSideDecompositionEvidenceFR39V1;
  right: PublishedEyebrowSideDecompositionEvidenceFR39V1;
}> {
  inspectMediaPipePublishedBrowTopologyGraphsFR38(faceLandmarkerRuntimeClass);
  return Object.freeze({
    left: inspectSide(faceLandmarkerRuntimeClass, 'FACE_LANDMARKS_LEFT_EYEBROW'),
    right: inspectSide(faceLandmarkerRuntimeClass, 'FACE_LANDMARKS_RIGHT_EYEBROW'),
  });
}

export function validateMediaPipePublishedEyebrowComponentDecompositionAuthorityFR39(
  authority: MediaPipePublishedEyebrowComponentDecompositionAuthorityFR39V1 = MEDIAPIPE_PUBLISHED_EYEBROW_COMPONENT_DECOMPOSITION_AUTHORITY_FR39,
): MediaPipePublishedEyebrowComponentDecompositionAuthorityFR39V1 {
  validateMediaPipePublishedDerivationGapReconciliationAuthorityFR38();
  if (
    authority.schemaVersion !== 'fr39-v1' ||
    authority.authorityRef !== 'authority.face.mediapipe_published_eyebrow_component_decomposition.fr39' ||
    authority.authorityVersion !== '0.1.0' ||
    authority.authorityState !== 'release_exact_components_measured_neutral_role_unresolved' ||
    authority.packageName !== '@mediapipe/tasks-vision' ||
    authority.packageVersion !== '0.10.35' ||
    authority.fr38AuthorityRef !== FR38_REF
  ) {
    throw new FaceAuthorityValidationError('FR-39 authority identity/upstream pin drift.');
  }
  const expected = authority.expectedProviderTopology;
  if (expected.sideCount !== 2 || expected.componentCountPerSide !== 2 || expected.componentTopologyClass !== 'open_path' ||
      expected.edgesPerComponent !== 4 || expected.verticesPerComponent !== 5 || expected.endpointsPerComponent !== 2) {
    throw new FaceAuthorityValidationError('FR-39 expected provider component topology drift.');
  }
  if (authority.unresolvedNeutralQuestions.length !== 4 || new Set(authority.unresolvedNeutralQuestions).size !== 4) {
    throw new FaceAuthorityValidationError('FR-39 unresolved neutral questions must remain explicit and unique.');
  }
  if (Object.values(authority.authorityBoundary).some((value) => value !== false)) {
    throw new FaceAuthorityValidationError('FR-39 authority boundary must remain fully fail-closed.');
  }
  return authority;
}

export function assessMediaPipePublishedEyebrowComponentDecompositionReadinessFR39(
  evidence: Readonly<{
    left: PublishedEyebrowSideDecompositionEvidenceFR39V1;
    right: PublishedEyebrowSideDecompositionEvidenceFR39V1;
  }>,
  authority: MediaPipePublishedEyebrowComponentDecompositionAuthorityFR39V1 = MEDIAPIPE_PUBLISHED_EYEBROW_COMPONENT_DECOMPOSITION_AUTHORITY_FR39,
): MediaPipePublishedEyebrowComponentDecompositionReadinessFR39V1 {
  validateMediaPipePublishedEyebrowComponentDecompositionAuthorityFR39(authority);
  for (const side of [evidence.left, evidence.right]) {
    if (side.providerComponentCount !== 2 || side.components.length !== 2 ||
        side.allProviderEdgesAccountedForExactlyOnce !== true || side.componentSelectionAuthorized !== false ||
        side.componentMergeAuthorized !== false || side.pointwiseCorrespondenceAuthorized !== false ||
        side.neutralSingleCurveReady !== false || side.components.some((component) =>
          component.edgeCount !== 4 || component.vertexCount !== 5 || component.endpointCount !== 2 ||
          component.cycleRank !== 0 || component.maxVertexDegree !== 2 || component.neutralRole !== null ||
          component.selectedAsNeutralCurve !== false || component.serializationOrderHasSemanticMeaning !== false)) {
      throw new FaceAuthorityValidationError(`FR-39 invalid published eyebrow component evidence: ${side.topologySymbol}`);
    }
  }
  return Object.freeze({
    exactPublishedPackagePinned: true as const,
    leftProviderComponentsMeasured: true as const,
    rightProviderComponentsMeasured: true as const,
    allEdgesPartitionedExactlyOnce: true as const,
    componentStructuralSymmetryObserved: true as const,
    componentAnatomicalRoleResolved: false as const,
    crossComponentCorrespondenceResolved: false as const,
    neutralBrowCurveReady: false as const,
    browMidlineReady: false as const,
    productionMetricReady: false as const,
    blockers: Object.freeze([
      'Each published eyebrow topology decomposes into two structurally valid open paths; no provider component is authorized as the neutral eyebrow curve.',
      'Serialization order is deterministic for evidence only and has no anatomical, superior/inferior, inner/outer, or traditional semantic meaning.',
      'No reviewed correspondence authorizes bridging or pointwise averaging the two disconnected paths.',
      'Pose/capture/expression stability and any candidate neutral representation still require separate evidence and calibration.',
      'Brow-midline, Three Divisions vertical references, metrics, F1, and F6 remain blocked.',
    ]),
  });
}

export function assertNeutralEyebrowCurveReadyFR39(
  authority: MediaPipePublishedEyebrowComponentDecompositionAuthorityFR39V1 = MEDIAPIPE_PUBLISHED_EYEBROW_COMPONENT_DECOMPOSITION_AUTHORITY_FR39,
): never {
  validateMediaPipePublishedEyebrowComponentDecompositionAuthorityFR39(authority);
  throw new FaceAuthorityValidationError(
    'FR-39 measures the two published provider components only; no neutral eyebrow single-curve algorithm or component role has been reviewed.',
  );
}
