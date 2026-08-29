import {
  THREE_DIVISIONS_NEUTRAL_SURFACE_DEFINITIONS_FR35,
  validateThreeDivisionsNeutralSurfaceExtensionAuthorityFR35,
  type ThreeDivisionsNeutralSurfaceSlotFR35V1,
} from './three-divisions-neutral-surface-extension-fr35.js';
import { FaceAuthorityValidationError } from './validation.js';

export type MediaPipePublishedNamedFaceTopologyFR37V1 =
  | 'FACE_LANDMARKS_LIPS'
  | 'FACE_LANDMARKS_LEFT_EYE'
  | 'FACE_LANDMARKS_LEFT_EYEBROW'
  | 'FACE_LANDMARKS_LEFT_IRIS'
  | 'FACE_LANDMARKS_RIGHT_EYE'
  | 'FACE_LANDMARKS_RIGHT_EYEBROW'
  | 'FACE_LANDMARKS_RIGHT_IRIS'
  | 'FACE_LANDMARKS_FACE_OVAL'
  | 'FACE_LANDMARKS_CONTOURS'
  | 'FACE_LANDMARKS_TESSELATION';

export interface MediaPipePublishedTopologyReflectionFR37V1 {
  readonly packageName: '@mediapipe/tasks-vision';
  readonly packageVersion: '0.10.35';
  readonly runtimeClass: 'FaceLandmarker';
  readonly observedNamedTopologyProperties: readonly string[];
  readonly exactExpectedNamedTopologySurface: boolean;
  readonly hairlineDirectNamedBindingFound: false;
  readonly philtrumDirectNamedBindingFound: false;
  readonly chinSpecificDirectNamedBindingFound: false;
}

export interface MediaPipePublishedTopologySurfaceGapFR37V1 {
  readonly surfaceSlot: ThreeDivisionsNeutralSurfaceSlotFR35V1;
  readonly neutralConceptKey: 'hairline_boundary' | 'philtrum_region' | 'chin_inferior_contour';
  readonly directNamedBindingProperty: null;
  readonly candidatePublishedTopologyRefs: readonly MediaPipePublishedNamedFaceTopologyFR37V1[];
  readonly candidateRelation: 'search_surface_only_not_binding';
  readonly subgraphSelectionAuthorized: false;
  readonly providerLandmarkRefs: readonly number[];
  readonly providerBindingReady: false;
}

export interface MediaPipePublishedTopologySurfaceGapAuthorityFR37V1 {
  readonly schemaVersion: 'fr37-v1';
  readonly authorityRef: 'authority.face.mediapipe_published_topology_surface_gap.fr37';
  readonly authorityVersion: '0.1.0';
  readonly authorityState: 'published_runtime_named_topology_gap_measured_fail_closed';
  readonly packageName: '@mediapipe/tasks-vision';
  readonly packageVersion: '0.10.35';
  readonly typeSurface: 'vision.d.ts';
  readonly runtimeClass: 'FaceLandmarker';
  readonly expectedNamedTopologyProperties: readonly MediaPipePublishedNamedFaceTopologyFR37V1[];
  readonly surfaceGaps: readonly MediaPipePublishedTopologySurfaceGapFR37V1[];
  readonly authorityBoundary: {
    readonly namedTopologyAbsenceMeansExtractionImpossible: false;
    readonly arbitraryFaceOvalSubgraphSelectionAllowed: false;
    readonly arbitraryContoursSubgraphSelectionAllowed: false;
    readonly arbitraryLipsSubgraphSelectionAllowed: false;
    readonly arbitraryTessellationSubgraphSelectionAllowed: false;
    readonly providerLandmarkIndicesAuthorized: false;
    readonly traditionalNeutralEquivalenceAuthorized: false;
    readonly sourceVariantSelectionAuthorized: false;
    readonly productionMetricAllowed: false;
    readonly productionF1Allowed: false;
    readonly productionF6Allowed: false;
  };
}

export interface MediaPipePublishedTopologySurfaceGapReadinessFR37V1 {
  readonly publishedRuntimeTopologyMeasured: true;
  readonly exactNamedTopologySurfaceMatched: true;
  readonly hairlineDirectNamedBindingAvailable: false;
  readonly philtrumDirectNamedBindingAvailable: false;
  readonly chinSpecificDirectNamedBindingAvailable: false;
  readonly providerBindingReady: false;
  readonly providerLandmarkAuthorityUsed: false;
  readonly extractionImpossibilityClaimed: false;
  readonly productionMetricReady: false;
  readonly productionF1Ready: false;
  readonly productionF6Ready: false;
  readonly blockers: readonly string[];
}

export const MEDIAPIPE_PUBLISHED_FACE_LANDMARKER_NAMED_TOPOLOGIES_FR37:
readonly MediaPipePublishedNamedFaceTopologyFR37V1[] = Object.freeze([
  'FACE_LANDMARKS_LIPS',
  'FACE_LANDMARKS_LEFT_EYE',
  'FACE_LANDMARKS_LEFT_EYEBROW',
  'FACE_LANDMARKS_LEFT_IRIS',
  'FACE_LANDMARKS_RIGHT_EYE',
  'FACE_LANDMARKS_RIGHT_EYEBROW',
  'FACE_LANDMARKS_RIGHT_IRIS',
  'FACE_LANDMARKS_FACE_OVAL',
  'FACE_LANDMARKS_CONTOURS',
  'FACE_LANDMARKS_TESSELATION',
]);

const SURFACE_GAPS: readonly MediaPipePublishedTopologySurfaceGapFR37V1[] = Object.freeze([
  Object.freeze({
    surfaceSlot: 'neutral.face.hairline_boundary' as const,
    neutralConceptKey: 'hairline_boundary' as const,
    directNamedBindingProperty: null,
    candidatePublishedTopologyRefs: Object.freeze([
      'FACE_LANDMARKS_FACE_OVAL',
      'FACE_LANDMARKS_CONTOURS',
      'FACE_LANDMARKS_TESSELATION',
    ] as const),
    candidateRelation: 'search_surface_only_not_binding' as const,
    subgraphSelectionAuthorized: false as const,
    providerLandmarkRefs: Object.freeze([] as number[]),
    providerBindingReady: false as const,
  }),
  Object.freeze({
    surfaceSlot: 'neutral.face.philtrum_region' as const,
    neutralConceptKey: 'philtrum_region' as const,
    directNamedBindingProperty: null,
    candidatePublishedTopologyRefs: Object.freeze([
      'FACE_LANDMARKS_LIPS',
      'FACE_LANDMARKS_CONTOURS',
      'FACE_LANDMARKS_TESSELATION',
    ] as const),
    candidateRelation: 'search_surface_only_not_binding' as const,
    subgraphSelectionAuthorized: false as const,
    providerLandmarkRefs: Object.freeze([] as number[]),
    providerBindingReady: false as const,
  }),
  Object.freeze({
    surfaceSlot: 'neutral.face.chin_inferior_contour' as const,
    neutralConceptKey: 'chin_inferior_contour' as const,
    directNamedBindingProperty: null,
    candidatePublishedTopologyRefs: Object.freeze([
      'FACE_LANDMARKS_FACE_OVAL',
      'FACE_LANDMARKS_CONTOURS',
      'FACE_LANDMARKS_TESSELATION',
    ] as const),
    candidateRelation: 'search_surface_only_not_binding' as const,
    subgraphSelectionAuthorized: false as const,
    providerLandmarkRefs: Object.freeze([] as number[]),
    providerBindingReady: false as const,
  }),
]);

export const MEDIAPIPE_PUBLISHED_TOPOLOGY_SURFACE_GAP_AUTHORITY_FR37:
MediaPipePublishedTopologySurfaceGapAuthorityFR37V1 = Object.freeze({
  schemaVersion: 'fr37-v1' as const,
  authorityRef: 'authority.face.mediapipe_published_topology_surface_gap.fr37' as const,
  authorityVersion: '0.1.0' as const,
  authorityState: 'published_runtime_named_topology_gap_measured_fail_closed' as const,
  packageName: '@mediapipe/tasks-vision' as const,
  packageVersion: '0.10.35' as const,
  typeSurface: 'vision.d.ts' as const,
  runtimeClass: 'FaceLandmarker' as const,
  expectedNamedTopologyProperties: MEDIAPIPE_PUBLISHED_FACE_LANDMARKER_NAMED_TOPOLOGIES_FR37,
  surfaceGaps: SURFACE_GAPS,
  authorityBoundary: Object.freeze({
    namedTopologyAbsenceMeansExtractionImpossible: false as const,
    arbitraryFaceOvalSubgraphSelectionAllowed: false as const,
    arbitraryContoursSubgraphSelectionAllowed: false as const,
    arbitraryLipsSubgraphSelectionAllowed: false as const,
    arbitraryTessellationSubgraphSelectionAllowed: false as const,
    providerLandmarkIndicesAuthorized: false as const,
    traditionalNeutralEquivalenceAuthorized: false as const,
    sourceVariantSelectionAuthorized: false as const,
    productionMetricAllowed: false as const,
    productionF1Allowed: false as const,
    productionF6Allowed: false as const,
  }),
});

function sameStringSequence(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function sortedNamedTopologyProperties(runtimeClass: object): readonly string[] {
  return Object.freeze(
    Object.getOwnPropertyNames(runtimeClass)
      .filter((name) => name.startsWith('FACE_LANDMARKS_'))
      .sort(),
  );
}

const EXPECTED_SORTED_TOPOLOGIES = Object.freeze([...MEDIAPIPE_PUBLISHED_FACE_LANDMARKER_NAMED_TOPOLOGIES_FR37].sort());

export function inspectMediaPipePublishedFaceLandmarkerTopologyFR37(
  faceLandmarkerRuntimeClass: object,
): MediaPipePublishedTopologyReflectionFR37V1 {
  const observed = sortedNamedTopologyProperties(faceLandmarkerRuntimeClass);
  const exactExpectedNamedTopologySurface = sameStringSequence(observed, EXPECTED_SORTED_TOPOLOGIES);
  if (!exactExpectedNamedTopologySurface) {
    throw new FaceAuthorityValidationError(
      `FR-37 published FaceLandmarker named topology surface drift: expected ${EXPECTED_SORTED_TOPOLOGIES.join(',')}; observed ${observed.join(',')}`,
    );
  }

  const observedSet = new Set(observed);
  const hairlineDirectNamedBindingFound = observedSet.has('FACE_LANDMARKS_HAIRLINE');
  const philtrumDirectNamedBindingFound = observedSet.has('FACE_LANDMARKS_PHILTRUM');
  const chinSpecificDirectNamedBindingFound = observedSet.has('FACE_LANDMARKS_CHIN');
  if (hairlineDirectNamedBindingFound || philtrumDirectNamedBindingFound || chinSpecificDirectNamedBindingFound) {
    throw new FaceAuthorityValidationError('FR-37 direct named topology gap changed; authority requires review before provider binding.');
  }

  return Object.freeze({
    packageName: '@mediapipe/tasks-vision' as const,
    packageVersion: '0.10.35' as const,
    runtimeClass: 'FaceLandmarker' as const,
    observedNamedTopologyProperties: observed,
    exactExpectedNamedTopologySurface: true as const,
    hairlineDirectNamedBindingFound: false as const,
    philtrumDirectNamedBindingFound: false as const,
    chinSpecificDirectNamedBindingFound: false as const,
  });
}

export function validateMediaPipePublishedTopologySurfaceGapAuthorityFR37(
  authority: MediaPipePublishedTopologySurfaceGapAuthorityFR37V1 = MEDIAPIPE_PUBLISHED_TOPOLOGY_SURFACE_GAP_AUTHORITY_FR37,
): MediaPipePublishedTopologySurfaceGapAuthorityFR37V1 {
  validateThreeDivisionsNeutralSurfaceExtensionAuthorityFR35();
  if (
    authority.schemaVersion !== 'fr37-v1' ||
    authority.authorityRef !== 'authority.face.mediapipe_published_topology_surface_gap.fr37' ||
    authority.authorityVersion !== '0.1.0' ||
    authority.authorityState !== 'published_runtime_named_topology_gap_measured_fail_closed' ||
    authority.packageName !== '@mediapipe/tasks-vision' ||
    authority.packageVersion !== '0.10.35' ||
    authority.typeSurface !== 'vision.d.ts' ||
    authority.runtimeClass !== 'FaceLandmarker'
  ) {
    throw new FaceAuthorityValidationError('FR-37 authority identity/package pin drift.');
  }

  if (!sameStringSequence(authority.expectedNamedTopologyProperties, MEDIAPIPE_PUBLISHED_FACE_LANDMARKER_NAMED_TOPOLOGIES_FR37)) {
    throw new FaceAuthorityValidationError('FR-37 expected named topology surface drift.');
  }

  if (authority.surfaceGaps.length !== 3) {
    throw new FaceAuthorityValidationError('FR-37 must cover exactly the three FR-35 extension surfaces.');
  }
  const expectedSurfaces = THREE_DIVISIONS_NEUTRAL_SURFACE_DEFINITIONS_FR35;
  authority.surfaceGaps.forEach((gap, index) => {
    const expected = expectedSurfaces[index];
    if (expected === undefined || gap.surfaceSlot !== expected.consumerSlot || gap.neutralConceptKey !== expected.neutralConceptKey) {
      throw new FaceAuthorityValidationError(`FR-37 FR-35 surface coverage drift at index ${index}.`);
    }
    if (
      gap.directNamedBindingProperty !== null ||
      gap.candidateRelation !== 'search_surface_only_not_binding' ||
      gap.subgraphSelectionAuthorized !== false ||
      gap.providerLandmarkRefs.length !== 0 ||
      gap.providerBindingReady !== false ||
      gap.candidatePublishedTopologyRefs.length === 0
    ) {
      throw new FaceAuthorityValidationError(`FR-37 cannot promote a candidate topology to provider binding: ${gap.surfaceSlot}`);
    }
    const unknownRef = gap.candidatePublishedTopologyRefs.find(
      (ref) => !MEDIAPIPE_PUBLISHED_FACE_LANDMARKER_NAMED_TOPOLOGIES_FR37.includes(ref),
    );
    if (unknownRef !== undefined) {
      throw new FaceAuthorityValidationError(`FR-37 references unknown published named topology: ${unknownRef}`);
    }
  });

  if (Object.values(authority.authorityBoundary).some((value) => value !== false)) {
    throw new FaceAuthorityValidationError('FR-37 authority boundary must remain fully fail-closed.');
  }
  return authority;
}

export function assessMediaPipePublishedTopologySurfaceGapReadinessFR37(
  reflection: MediaPipePublishedTopologyReflectionFR37V1,
  authority: MediaPipePublishedTopologySurfaceGapAuthorityFR37V1 = MEDIAPIPE_PUBLISHED_TOPOLOGY_SURFACE_GAP_AUTHORITY_FR37,
): MediaPipePublishedTopologySurfaceGapReadinessFR37V1 {
  validateMediaPipePublishedTopologySurfaceGapAuthorityFR37(authority);
  if (!reflection.exactExpectedNamedTopologySurface || reflection.hairlineDirectNamedBindingFound ||
      reflection.philtrumDirectNamedBindingFound || reflection.chinSpecificDirectNamedBindingFound) {
    throw new FaceAuthorityValidationError('FR-37 reflection evidence does not match the fail-closed published topology gap.');
  }
  return Object.freeze({
    publishedRuntimeTopologyMeasured: true as const,
    exactNamedTopologySurfaceMatched: true as const,
    hairlineDirectNamedBindingAvailable: false as const,
    philtrumDirectNamedBindingAvailable: false as const,
    chinSpecificDirectNamedBindingAvailable: false as const,
    providerBindingReady: false as const,
    providerLandmarkAuthorityUsed: false as const,
    extractionImpossibilityClaimed: false as const,
    productionMetricReady: false as const,
    productionF1Ready: false as const,
    productionF6Ready: false as const,
    blockers: Object.freeze([
      'Published @mediapipe/tasks-vision@0.10.35 FaceLandmarker exposes no hairline-, philtrum-, or chin-specific named topology surface.',
      'FACE_OVAL, CONTOURS, LIPS, and TESSELATION are provider topology surfaces only; selecting a subgraph requires separate reviewed extraction/binding evidence.',
      'Named-topology absence does not prove that neutral surfaces are impossible to extract from the full landmark graph.',
      'Provider landmark indices remain non-authoritative until a separate binding/algorithm review closes the FR-35/FR-36 gaps.',
      'Traditional anchor equivalence, FR-33 source-variant selection, Three Divisions metrics, F1, and F6 remain blocked.',
    ]),
  });
}

export function assertThreeDivisionsProviderBindingsReadyFR37(
  authority: MediaPipePublishedTopologySurfaceGapAuthorityFR37V1 = MEDIAPIPE_PUBLISHED_TOPOLOGY_SURFACE_GAP_AUTHORITY_FR37,
): never {
  validateMediaPipePublishedTopologySurfaceGapAuthorityFR37(authority);
  throw new FaceAuthorityValidationError(
    'FR-37 closes only the published named-topology surface probe; reviewed subgraph algorithms/provider bindings are still absent.',
  );
}
