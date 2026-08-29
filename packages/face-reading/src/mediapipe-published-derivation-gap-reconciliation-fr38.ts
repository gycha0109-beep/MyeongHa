import {
  FACELAB_PROVIDER_ADAPTER_EVIDENCE_FR16,
  type ProviderTopologySummaryV1,
} from './provider-adapter-evidence-fr16.js';
import { NEUTRAL_DERIVATION_REGISTRY_FR17 } from './neutral-derivation-registry-fr17.js';
import {
  THREE_DIVISIONS_NEUTRAL_SURFACE_EXTENSION_AUTHORITY_FR35,
  type ThreeDivisionsNeutralSurfaceSlotFR35V1,
} from './three-divisions-neutral-surface-extension-fr35.js';
import {
  THREE_DIVISIONS_VERTICAL_REFERENCE_DERIVATION_AUTHORITY_FR36,
  THREE_DIVISIONS_VERTICAL_REFERENCE_DERIVATION_CONTRACTS_FR36,
} from './three-divisions-vertical-reference-derivations-fr36.js';
import {
  MEDIAPIPE_PUBLISHED_FACE_LANDMARKER_NAMED_TOPOLOGIES_FR37,
  MEDIAPIPE_PUBLISHED_TOPOLOGY_SURFACE_GAP_AUTHORITY_FR37,
  inspectMediaPipePublishedFaceLandmarkerTopologyFR37,
  validateMediaPipePublishedTopologySurfaceGapAuthorityFR37,
  type MediaPipePublishedNamedFaceTopologyFR37V1,
} from './mediapipe-published-topology-surface-gap-fr37.js';
import { FaceAuthorityValidationError } from './validation.js';

export type ThreeDivisionsVerticalAnchorFR38V1 =
  | 'hairline'
  | 'brow'
  | 'yintang'
  | 'shangen'
  | 'zhuntou'
  | 'renzhong'
  | 'dige';

export type PublishedDerivationGapClassFR38V1 =
  | 'published_named_surface_graph_attested_algorithm_blocked'
  | 'derived_dependency_blocked'
  | 'upstream_master_only_not_release_exact'
  | 'no_direct_published_named_surface';

export interface PublishedTopologyGraphSummaryFR38V1 {
  readonly topologySymbol: 'FACE_LANDMARKS_LEFT_EYEBROW' | 'FACE_LANDMARKS_RIGHT_EYEBROW';
  readonly edgeCount: 8;
  readonly vertexCount: 10;
  readonly connectedComponentCount: 2;
  readonly cycleRank: 0;
  readonly maxVertexDegree: 2;
}

export interface PublishedBrowTopologyGraphReflectionFR38V1 {
  readonly packageName: '@mediapipe/tasks-vision';
  readonly packageVersion: '0.10.35';
  readonly runtimeClass: 'FaceLandmarker';
  readonly leftBrow: PublishedTopologyGraphSummaryFR38V1;
  readonly rightBrow: PublishedTopologyGraphSummaryFR38V1;
  readonly releaseExactRuntimeGraphShapeAttested: true;
  readonly neutralCurveDerivationAuthorized: false;
}

export interface ThreeDivisionsPublishedDerivationGapFR38V1 {
  readonly verticalAnchorRef: ThreeDivisionsVerticalAnchorFR38V1;
  readonly fr36DependencyRefs: readonly string[];
  readonly fr17DerivationRefs: readonly string[];
  readonly fr35SurfaceSlots: readonly ThreeDivisionsNeutralSurfaceSlotFR35V1[];
  readonly upstreamProviderTopologySymbols: readonly string[];
  readonly directPublishedNamedTopologyRefs: readonly MediaPipePublishedNamedFaceTopologyFR37V1[];
  readonly searchSurfaceRefs: readonly MediaPipePublishedNamedFaceTopologyFR37V1[];
  readonly gapClass: PublishedDerivationGapClassFR38V1;
  readonly releaseExactNamedSurfaceAvailable: boolean;
  readonly releaseExactRuntimeGraphShapeAttested: boolean;
  readonly reviewedNeutralDerivationAvailable: false;
  readonly providerLandmarkIndexAuthority: false;
  readonly productionBindingReady: false;
}

export interface MediaPipePublishedDerivationGapReconciliationAuthorityFR38V1 {
  readonly schemaVersion: 'fr38-v1';
  readonly authorityRef: 'authority.face.mediapipe_published_derivation_gap_reconciliation.fr38';
  readonly authorityVersion: '0.1.0';
  readonly authorityState: 'published_provider_gap_reconciled_algorithms_blocked';
  readonly packageName: '@mediapipe/tasks-vision';
  readonly packageVersion: '0.10.35';
  readonly fr16ManifestRef: string;
  readonly fr17RegistryRef: string;
  readonly fr35AuthorityRef: string;
  readonly fr36AuthorityRef: string;
  readonly fr37AuthorityRef: string;
  readonly gaps: readonly ThreeDivisionsPublishedDerivationGapFR38V1[];
  readonly authorityBoundary: {
    readonly upstreamMasterTopologyPromotableToReleaseExact: false;
    readonly publishedNamedSurfaceMeansNeutralGeometry: false;
    readonly publishedBrowGraphMeansSingleNeutralCurve: false;
    readonly missingPublishedNoseSurfaceMeansNoseExtractionImpossible: false;
    readonly providerLandmarkIndicesAuthorized: false;
    readonly traditionalNeutralEquivalenceAuthorized: false;
    readonly sourceVariantSelectionAuthorized: false;
    readonly verticalReferenceAlgorithmAuthorized: false;
    readonly productionMetricAllowed: false;
    readonly productionF1Allowed: false;
    readonly productionF6Allowed: false;
  };
}

export interface MediaPipePublishedDerivationGapReconciliationReadinessFR38V1 {
  readonly exactPublishedRuntimeSurfaceVerified: true;
  readonly publishedBrowGraphShapeAttested: true;
  readonly leftBrowNeutralCurveReady: false;
  readonly rightBrowNeutralCurveReady: false;
  readonly browMidlineReady: false;
  readonly noseRegionReady: false;
  readonly hairlineBoundaryReady: false;
  readonly philtrumRegionReady: false;
  readonly chinInferiorContourReady: false;
  readonly allSevenVerticalReferencesExecutable: false;
  readonly productionMetricReady: false;
  readonly blockers: readonly string[];
}

interface RuntimeConnectionEdgeFR38V1 {
  readonly start: number;
  readonly end: number;
}

const FR16_REF = `face-provider-adapter-evidence-fr16@${FACELAB_PROVIDER_ADAPTER_EVIDENCE_FR16.manifestVersion}`;
const FR17_REF = `${NEUTRAL_DERIVATION_REGISTRY_FR17.registryId}@${NEUTRAL_DERIVATION_REGISTRY_FR17.version}`;
const FR35_REF = `${THREE_DIVISIONS_NEUTRAL_SURFACE_EXTENSION_AUTHORITY_FR35.authorityRef}@${THREE_DIVISIONS_NEUTRAL_SURFACE_EXTENSION_AUTHORITY_FR35.authorityVersion}`;
const FR36_REF = `${THREE_DIVISIONS_VERTICAL_REFERENCE_DERIVATION_AUTHORITY_FR36.authorityRef}@${THREE_DIVISIONS_VERTICAL_REFERENCE_DERIVATION_AUTHORITY_FR36.authorityVersion}`;
const FR37_REF = `${MEDIAPIPE_PUBLISHED_TOPOLOGY_SURFACE_GAP_AUTHORITY_FR37.authorityRef}@${MEDIAPIPE_PUBLISHED_TOPOLOGY_SURFACE_GAP_AUTHORITY_FR37.authorityVersion}`;

const BROW_LEFT = 'FACE_LANDMARKS_LEFT_EYEBROW' as const;
const BROW_RIGHT = 'FACE_LANDMARKS_RIGHT_EYEBROW' as const;
const NOSE_UPSTREAM_ONLY = 'FACE_LANDMARKS_NOSE';

const FR37_SURFACE_GAP_BY_SLOT = new Map(
  MEDIAPIPE_PUBLISHED_TOPOLOGY_SURFACE_GAP_AUTHORITY_FR37.surfaceGaps.map((entry) => [entry.surfaceSlot, entry] as const),
);

const GAPS: readonly ThreeDivisionsPublishedDerivationGapFR38V1[] = Object.freeze([
  Object.freeze({
    verticalAnchorRef: 'hairline' as const,
    fr36DependencyRefs: Object.freeze(['neutral.face.hairline_boundary']),
    fr17DerivationRefs: Object.freeze([]),
    fr35SurfaceSlots: Object.freeze(['neutral.face.hairline_boundary'] as const),
    upstreamProviderTopologySymbols: Object.freeze([]),
    directPublishedNamedTopologyRefs: Object.freeze([]),
    searchSurfaceRefs: FR37_SURFACE_GAP_BY_SLOT.get('neutral.face.hairline_boundary')!.candidatePublishedTopologyRefs,
    gapClass: 'no_direct_published_named_surface' as const,
    releaseExactNamedSurfaceAvailable: false,
    releaseExactRuntimeGraphShapeAttested: false,
    reviewedNeutralDerivationAvailable: false as const,
    providerLandmarkIndexAuthority: false as const,
    productionBindingReady: false as const,
  }),
  Object.freeze({
    verticalAnchorRef: 'brow' as const,
    fr36DependencyRefs: Object.freeze([
      'derivation.neutral.left_brow_curve.pending',
      'derivation.neutral.right_brow_curve.pending',
    ]),
    fr17DerivationRefs: Object.freeze([
      'derivation.neutral.left_brow_curve.pending',
      'derivation.neutral.right_brow_curve.pending',
    ]),
    fr35SurfaceSlots: Object.freeze([]),
    upstreamProviderTopologySymbols: Object.freeze([BROW_LEFT, BROW_RIGHT]),
    directPublishedNamedTopologyRefs: Object.freeze([BROW_LEFT, BROW_RIGHT]),
    searchSurfaceRefs: Object.freeze([BROW_LEFT, BROW_RIGHT]),
    gapClass: 'published_named_surface_graph_attested_algorithm_blocked' as const,
    releaseExactNamedSurfaceAvailable: true,
    releaseExactRuntimeGraphShapeAttested: true,
    reviewedNeutralDerivationAvailable: false as const,
    providerLandmarkIndexAuthority: false as const,
    productionBindingReady: false as const,
  }),
  Object.freeze({
    verticalAnchorRef: 'yintang' as const,
    fr36DependencyRefs: Object.freeze(['derivation.neutral.brow_midline.pending']),
    fr17DerivationRefs: Object.freeze(['derivation.neutral.brow_midline.pending']),
    fr35SurfaceSlots: Object.freeze([]),
    upstreamProviderTopologySymbols: Object.freeze([]),
    directPublishedNamedTopologyRefs: Object.freeze([]),
    searchSurfaceRefs: Object.freeze([BROW_LEFT, BROW_RIGHT]),
    gapClass: 'derived_dependency_blocked' as const,
    releaseExactNamedSurfaceAvailable: false,
    releaseExactRuntimeGraphShapeAttested: false,
    reviewedNeutralDerivationAvailable: false as const,
    providerLandmarkIndexAuthority: false as const,
    productionBindingReady: false as const,
  }),
  Object.freeze({
    verticalAnchorRef: 'shangen' as const,
    fr36DependencyRefs: Object.freeze(['derivation.neutral.nose_region.pending']),
    fr17DerivationRefs: Object.freeze(['derivation.neutral.nose_region.pending']),
    fr35SurfaceSlots: Object.freeze([]),
    upstreamProviderTopologySymbols: Object.freeze([NOSE_UPSTREAM_ONLY]),
    directPublishedNamedTopologyRefs: Object.freeze([]),
    searchSurfaceRefs: Object.freeze(['FACE_LANDMARKS_CONTOURS', 'FACE_LANDMARKS_TESSELATION'] as const),
    gapClass: 'upstream_master_only_not_release_exact' as const,
    releaseExactNamedSurfaceAvailable: false,
    releaseExactRuntimeGraphShapeAttested: false,
    reviewedNeutralDerivationAvailable: false as const,
    providerLandmarkIndexAuthority: false as const,
    productionBindingReady: false as const,
  }),
  Object.freeze({
    verticalAnchorRef: 'zhuntou' as const,
    fr36DependencyRefs: Object.freeze(['derivation.neutral.nose_region.pending']),
    fr17DerivationRefs: Object.freeze(['derivation.neutral.nose_region.pending']),
    fr35SurfaceSlots: Object.freeze([]),
    upstreamProviderTopologySymbols: Object.freeze([NOSE_UPSTREAM_ONLY]),
    directPublishedNamedTopologyRefs: Object.freeze([]),
    searchSurfaceRefs: Object.freeze(['FACE_LANDMARKS_CONTOURS', 'FACE_LANDMARKS_TESSELATION'] as const),
    gapClass: 'upstream_master_only_not_release_exact' as const,
    releaseExactNamedSurfaceAvailable: false,
    releaseExactRuntimeGraphShapeAttested: false,
    reviewedNeutralDerivationAvailable: false as const,
    providerLandmarkIndexAuthority: false as const,
    productionBindingReady: false as const,
  }),
  Object.freeze({
    verticalAnchorRef: 'renzhong' as const,
    fr36DependencyRefs: Object.freeze(['neutral.face.philtrum_region']),
    fr17DerivationRefs: Object.freeze([]),
    fr35SurfaceSlots: Object.freeze(['neutral.face.philtrum_region'] as const),
    upstreamProviderTopologySymbols: Object.freeze([]),
    directPublishedNamedTopologyRefs: Object.freeze([]),
    searchSurfaceRefs: FR37_SURFACE_GAP_BY_SLOT.get('neutral.face.philtrum_region')!.candidatePublishedTopologyRefs,
    gapClass: 'no_direct_published_named_surface' as const,
    releaseExactNamedSurfaceAvailable: false,
    releaseExactRuntimeGraphShapeAttested: false,
    reviewedNeutralDerivationAvailable: false as const,
    providerLandmarkIndexAuthority: false as const,
    productionBindingReady: false as const,
  }),
  Object.freeze({
    verticalAnchorRef: 'dige' as const,
    fr36DependencyRefs: Object.freeze(['neutral.face.chin_inferior_contour']),
    fr17DerivationRefs: Object.freeze([]),
    fr35SurfaceSlots: Object.freeze(['neutral.face.chin_inferior_contour'] as const),
    upstreamProviderTopologySymbols: Object.freeze([]),
    directPublishedNamedTopologyRefs: Object.freeze([]),
    searchSurfaceRefs: FR37_SURFACE_GAP_BY_SLOT.get('neutral.face.chin_inferior_contour')!.candidatePublishedTopologyRefs,
    gapClass: 'no_direct_published_named_surface' as const,
    releaseExactNamedSurfaceAvailable: false,
    releaseExactRuntimeGraphShapeAttested: false,
    reviewedNeutralDerivationAvailable: false as const,
    providerLandmarkIndexAuthority: false as const,
    productionBindingReady: false as const,
  }),
]);

export const MEDIAPIPE_PUBLISHED_DERIVATION_GAP_RECONCILIATION_AUTHORITY_FR38:
MediaPipePublishedDerivationGapReconciliationAuthorityFR38V1 = Object.freeze({
  schemaVersion: 'fr38-v1' as const,
  authorityRef: 'authority.face.mediapipe_published_derivation_gap_reconciliation.fr38' as const,
  authorityVersion: '0.1.0' as const,
  authorityState: 'published_provider_gap_reconciled_algorithms_blocked' as const,
  packageName: '@mediapipe/tasks-vision' as const,
  packageVersion: '0.10.35' as const,
  fr16ManifestRef: FR16_REF,
  fr17RegistryRef: FR17_REF,
  fr35AuthorityRef: FR35_REF,
  fr36AuthorityRef: FR36_REF,
  fr37AuthorityRef: FR37_REF,
  gaps: GAPS,
  authorityBoundary: Object.freeze({
    upstreamMasterTopologyPromotableToReleaseExact: false as const,
    publishedNamedSurfaceMeansNeutralGeometry: false as const,
    publishedBrowGraphMeansSingleNeutralCurve: false as const,
    missingPublishedNoseSurfaceMeansNoseExtractionImpossible: false as const,
    providerLandmarkIndicesAuthorized: false as const,
    traditionalNeutralEquivalenceAuthorized: false as const,
    sourceVariantSelectionAuthorized: false as const,
    verticalReferenceAlgorithmAuthorized: false as const,
    productionMetricAllowed: false as const,
    productionF1Allowed: false as const,
    productionF6Allowed: false as const,
  }),
});

function sameStrings(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function isEdge(value: unknown): value is RuntimeConnectionEdgeFR38V1 {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).every((key) => key === 'start' || key === 'end') &&
    Number.isInteger(record.start) && Number.isInteger(record.end) &&
    (record.start as number) >= 0 && (record.end as number) >= 0;
}

function readConnectionEdges(runtimeClass: object, topologySymbol: string): readonly RuntimeConnectionEdgeFR38V1[] {
  const value = Reflect.get(runtimeClass, topologySymbol) as unknown;
  if (!Array.isArray(value) || value.length === 0 || !value.every(isEdge)) {
    throw new FaceAuthorityValidationError(`FR-38 ${topologySymbol} must be a non-empty published connection-edge array.`);
  }
  return Object.freeze(value.map((edge) => Object.freeze({ start: edge.start, end: edge.end })));
}

function summarizeBrowGraph(
  topologySymbol: PublishedTopologyGraphSummaryFR38V1['topologySymbol'],
  edges: readonly RuntimeConnectionEdgeFR38V1[],
): PublishedTopologyGraphSummaryFR38V1 {
  const vertices = new Set<number>();
  const adjacency = new Map<number, Set<number>>();
  const undirectedKeys = new Set<string>();
  for (const edge of edges) {
    if (edge.start === edge.end) throw new FaceAuthorityValidationError(`FR-38 ${topologySymbol} contains a self-loop.`);
    const low = Math.min(edge.start, edge.end);
    const high = Math.max(edge.start, edge.end);
    const edgeKey = `${low}:${high}`;
    if (undirectedKeys.has(edgeKey)) throw new FaceAuthorityValidationError(`FR-38 ${topologySymbol} contains duplicate undirected edge ${edgeKey}.`);
    undirectedKeys.add(edgeKey);
    vertices.add(edge.start);
    vertices.add(edge.end);
    const startNeighbors = adjacency.get(edge.start) ?? new Set<number>();
    startNeighbors.add(edge.end);
    adjacency.set(edge.start, startNeighbors);
    const endNeighbors = adjacency.get(edge.end) ?? new Set<number>();
    endNeighbors.add(edge.start);
    adjacency.set(edge.end, endNeighbors);
  }

  const unvisited = new Set(vertices);
  let connectedComponentCount = 0;
  while (unvisited.size > 0) {
    connectedComponentCount += 1;
    const start = unvisited.values().next().value as number;
    const stack = [start];
    unvisited.delete(start);
    while (stack.length > 0) {
      const current = stack.pop()!;
      for (const neighbor of adjacency.get(current) ?? []) {
        if (!unvisited.has(neighbor)) continue;
        unvisited.delete(neighbor);
        stack.push(neighbor);
      }
    }
  }

  const edgeCount = edges.length;
  const vertexCount = vertices.size;
  const cycleRank = edgeCount - vertexCount + connectedComponentCount;
  const maxVertexDegree = Math.max(...[...adjacency.values()].map((neighbors) => neighbors.size));
  if (edgeCount !== 8 || vertexCount !== 10 || connectedComponentCount !== 2 || cycleRank !== 0 || maxVertexDegree !== 2) {
    throw new FaceAuthorityValidationError(
      `FR-38 published ${topologySymbol} graph drift: edges=${edgeCount}, vertices=${vertexCount}, components=${connectedComponentCount}, cycleRank=${cycleRank}, maxDegree=${maxVertexDegree}.`,
    );
  }

  return Object.freeze({
    topologySymbol,
    edgeCount: 8 as const,
    vertexCount: 10 as const,
    connectedComponentCount: 2 as const,
    cycleRank: 0 as const,
    maxVertexDegree: 2 as const,
  });
}

export function inspectMediaPipePublishedBrowTopologyGraphsFR38(
  faceLandmarkerRuntimeClass: object,
): PublishedBrowTopologyGraphReflectionFR38V1 {
  inspectMediaPipePublishedFaceLandmarkerTopologyFR37(faceLandmarkerRuntimeClass);
  const leftBrow = summarizeBrowGraph(BROW_LEFT, readConnectionEdges(faceLandmarkerRuntimeClass, BROW_LEFT));
  const rightBrow = summarizeBrowGraph(BROW_RIGHT, readConnectionEdges(faceLandmarkerRuntimeClass, BROW_RIGHT));
  return Object.freeze({
    packageName: '@mediapipe/tasks-vision' as const,
    packageVersion: '0.10.35' as const,
    runtimeClass: 'FaceLandmarker' as const,
    leftBrow,
    rightBrow,
    releaseExactRuntimeGraphShapeAttested: true as const,
    neutralCurveDerivationAuthorized: false as const,
  });
}

function assertFR16BrowSummaryMatchesPublishedExpectation(topologySymbol: string): void {
  const summary: ProviderTopologySummaryV1 | undefined = FACELAB_PROVIDER_ADAPTER_EVIDENCE_FR16.topologySummaries.find(
    (entry) => entry.topologySymbol === topologySymbol,
  );
  if (summary === undefined || summary.topologyClass !== 'disconnected_open_chains' || summary.edgeCount !== 8 ||
      summary.connectedComponentCount !== 2 || summary.cycleRank !== 0 || summary.maxVertexDegree !== 2) {
    throw new FaceAuthorityValidationError(`FR-38 FR-16 brow topology witness drift: ${topologySymbol}`);
  }
}

export function validateMediaPipePublishedDerivationGapReconciliationAuthorityFR38(
  authority: MediaPipePublishedDerivationGapReconciliationAuthorityFR38V1 = MEDIAPIPE_PUBLISHED_DERIVATION_GAP_RECONCILIATION_AUTHORITY_FR38,
): MediaPipePublishedDerivationGapReconciliationAuthorityFR38V1 {
  validateMediaPipePublishedTopologySurfaceGapAuthorityFR37();
  if (
    authority.schemaVersion !== 'fr38-v1' ||
    authority.authorityRef !== 'authority.face.mediapipe_published_derivation_gap_reconciliation.fr38' ||
    authority.authorityVersion !== '0.1.0' ||
    authority.authorityState !== 'published_provider_gap_reconciled_algorithms_blocked' ||
    authority.packageName !== '@mediapipe/tasks-vision' ||
    authority.packageVersion !== '0.10.35'
  ) {
    throw new FaceAuthorityValidationError('FR-38 authority identity/package pin drift.');
  }
  if (authority.fr16ManifestRef !== FR16_REF || authority.fr17RegistryRef !== FR17_REF ||
      authority.fr35AuthorityRef !== FR35_REF || authority.fr36AuthorityRef !== FR36_REF || authority.fr37AuthorityRef !== FR37_REF) {
    throw new FaceAuthorityValidationError('FR-38 upstream authority pin drift.');
  }

  if (FACELAB_PROVIDER_ADAPTER_EVIDENCE_FR16.topologySourceEvidence.releaseExactForInstalledPackage !== false) {
    throw new FaceAuthorityValidationError('FR-38 requires FR-16 upstream topology to remain non-release-exact evidence.');
  }
  assertFR16BrowSummaryMatchesPublishedExpectation(BROW_LEFT);
  assertFR16BrowSummaryMatchesPublishedExpectation(BROW_RIGHT);
  if (!MEDIAPIPE_PUBLISHED_FACE_LANDMARKER_NAMED_TOPOLOGIES_FR37.includes(BROW_LEFT) ||
      !MEDIAPIPE_PUBLISHED_FACE_LANDMARKER_NAMED_TOPOLOGIES_FR37.includes(BROW_RIGHT)) {
    throw new FaceAuthorityValidationError('FR-38 published eyebrow named surfaces disappeared.');
  }
  if ((MEDIAPIPE_PUBLISHED_FACE_LANDMARKER_NAMED_TOPOLOGIES_FR37 as readonly string[]).includes(NOSE_UPSTREAM_ONLY)) {
    throw new FaceAuthorityValidationError('FR-38 published runtime now exposes FACE_LANDMARKS_NOSE; authority requires a new review.');
  }

  const noseSlot = FACELAB_PROVIDER_ADAPTER_EVIDENCE_FR16.slotEvidence.find((entry) => entry.anchorRef === 'nose');
  if (noseSlot?.providerTopologySymbol !== NOSE_UPSTREAM_ONLY || noseSlot.requiredDerivationRef !== 'derivation.neutral.nose_region.pending') {
    throw new FaceAuthorityValidationError('FR-38 FR-16 nose topology/derivation witness drift.');
  }
  const fr17ByRef = new Map(NEUTRAL_DERIVATION_REGISTRY_FR17.definitions.map((entry) => [entry.derivationId, entry] as const));
  for (const ref of [
    'derivation.neutral.left_brow_curve.pending',
    'derivation.neutral.right_brow_curve.pending',
    'derivation.neutral.brow_midline.pending',
    'derivation.neutral.nose_region.pending',
  ]) {
    const definition = fr17ByRef.get(ref);
    if (definition === undefined || definition.algorithmRef !== null ||
        (definition.reviewState !== 'blocked_unresolved' && definition.reviewState !== 'blocked_dependency')) {
      throw new FaceAuthorityValidationError(`FR-38 FR-17 blocker unexpectedly promoted: ${ref}`);
    }
  }

  const expectedAnchors = THREE_DIVISIONS_VERTICAL_REFERENCE_DERIVATION_CONTRACTS_FR36.map((entry) => entry.traditionalAnchorRef);
  if (authority.gaps.length !== 7 || !sameStrings(authority.gaps.map((entry) => entry.verticalAnchorRef), expectedAnchors)) {
    throw new FaceAuthorityValidationError('FR-38 must reconcile exactly the seven FR-36 vertical anchors in order.');
  }
  authority.gaps.forEach((gap, index) => {
    const expected = GAPS[index]!;
    if (gap.gapClass !== expected.gapClass ||
        !sameStrings(gap.fr36DependencyRefs, expected.fr36DependencyRefs) ||
        !sameStrings(gap.fr17DerivationRefs, expected.fr17DerivationRefs) ||
        !sameStrings(gap.fr35SurfaceSlots, expected.fr35SurfaceSlots) ||
        !sameStrings(gap.upstreamProviderTopologySymbols, expected.upstreamProviderTopologySymbols) ||
        !sameStrings(gap.directPublishedNamedTopologyRefs, expected.directPublishedNamedTopologyRefs) ||
        !sameStrings(gap.searchSurfaceRefs, expected.searchSurfaceRefs) ||
        gap.releaseExactNamedSurfaceAvailable !== expected.releaseExactNamedSurfaceAvailable ||
        gap.releaseExactRuntimeGraphShapeAttested !== expected.releaseExactRuntimeGraphShapeAttested ||
        gap.reviewedNeutralDerivationAvailable !== false || gap.providerLandmarkIndexAuthority !== false ||
        gap.productionBindingReady !== false) {
      throw new FaceAuthorityValidationError(`FR-38 gap reconciliation drift: ${gap.verticalAnchorRef}`);
    }
  });

  if (Object.values(authority.authorityBoundary).some((value) => value !== false)) {
    throw new FaceAuthorityValidationError('FR-38 authority boundary must remain fully fail-closed.');
  }
  return authority;
}

export function assessMediaPipePublishedDerivationGapReconciliationReadinessFR38(
  reflection: PublishedBrowTopologyGraphReflectionFR38V1,
  authority: MediaPipePublishedDerivationGapReconciliationAuthorityFR38V1 = MEDIAPIPE_PUBLISHED_DERIVATION_GAP_RECONCILIATION_AUTHORITY_FR38,
): MediaPipePublishedDerivationGapReconciliationReadinessFR38V1 {
  validateMediaPipePublishedDerivationGapReconciliationAuthorityFR38(authority);
  if (!reflection.releaseExactRuntimeGraphShapeAttested || reflection.neutralCurveDerivationAuthorized !== false ||
      reflection.leftBrow.edgeCount !== 8 || reflection.rightBrow.edgeCount !== 8) {
    throw new FaceAuthorityValidationError('FR-38 published brow topology reflection does not satisfy the reconciliation evidence contract.');
  }
  return Object.freeze({
    exactPublishedRuntimeSurfaceVerified: true as const,
    publishedBrowGraphShapeAttested: true as const,
    leftBrowNeutralCurveReady: false as const,
    rightBrowNeutralCurveReady: false as const,
    browMidlineReady: false as const,
    noseRegionReady: false as const,
    hairlineBoundaryReady: false as const,
    philtrumRegionReady: false as const,
    chinInferiorContourReady: false as const,
    allSevenVerticalReferencesExecutable: false as const,
    productionMetricReady: false as const,
    blockers: Object.freeze([
      'Published eyebrow connection graphs are now release-exactly shape-attested, but each remains two disconnected open chains with no reviewed single neutral-curve derivation.',
      'Brow midline remains dependency-blocked until both neutral brow curves are reviewed.',
      'FR-16 FACE_LANDMARKS_NOSE is an upstream-master structure witness only and is not exposed as a published FaceLandmarker named topology in 0.10.35.',
      'Hairline, philtrum, and chin-specific FR-35 surfaces still have no direct published named topology binding.',
      'No provider landmark-index shortcut, traditional equivalence, FR-33 variant selection, vertical-reference formula, Three Divisions metric, F1, or F6 promotion is authorized.',
    ]),
  });
}

export function assertThreeDivisionsNeutralDerivationsReadyFR38(
  authority: MediaPipePublishedDerivationGapReconciliationAuthorityFR38V1 = MEDIAPIPE_PUBLISHED_DERIVATION_GAP_RECONCILIATION_AUTHORITY_FR38,
): never {
  validateMediaPipePublishedDerivationGapReconciliationAuthorityFR38(authority);
  throw new FaceAuthorityValidationError(
    'FR-38 reconciles release-exact provider topology evidence only; reviewed neutral derivation algorithms for all seven Three Divisions vertical references remain incomplete.',
  );
}
