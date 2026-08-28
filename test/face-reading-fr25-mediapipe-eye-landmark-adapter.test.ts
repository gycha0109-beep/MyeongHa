import { describe, expect, it } from 'vitest';
import {
  FR25_REQUIRED_EYE_PROVIDER_VERTICES,
  MEDIAPIPE_EYE_LANDMARK_ADAPTER_EVIDENCE_FR25,
  adaptMediaPipeFaceLandmarkerResultToFR24InputFR25,
  assessMediaPipeEyeLandmarkAdapterFR25,
  issueMediaPipeEyePairResearchArtifactFR25,
  type MediaPipeFaceLandmarkerResultFR25V1,
  type MediaPipeNormalizedLandmarkFR25V1,
} from '../packages/face-reading/src/index.js';

const ASSET_DIGEST = `sha256:${'b'.repeat(64)}`;
const CONTEXT = Object.freeze({
  providerRunRef: 'provider.run.fr25.fixture.001',
  canonicalAssetDigest: ASSET_DIGEST,
});

function fixtureFaceLandmarks(): MediaPipeNormalizedLandmarkFR25V1[] {
  return Array.from({ length: 478 }, (_, index) => ({
    x: ((index % 80) + 1) / 100,
    y: ((index % 70) + 1) / 100,
    z: (index - 239) / 1000,
  }));
}

function fixtureResult(faceCount = 1): MediaPipeFaceLandmarkerResultFR25V1 {
  return {
    faceLandmarks: Array.from({ length: faceCount }, () => fixtureFaceLandmarks()),
    faceBlendshapes: [],
    facialTransformationMatrixes: [],
  };
}

describe('FR-25 MediaPipe raw landmark research adapter', () => {
  it('pins the witnessed raw Web type files without release-exact promotion', () => {
    const evidence = MEDIAPIPE_EYE_LANDMARK_ADAPTER_EVIDENCE_FR25;
    expect(evidence.runtimePackageName).toBe('@mediapipe/tasks-vision');
    expect(evidence.runtimePackageVersion).toBe('0.10.35');
    expect(evidence.sourceWitness.sourceCommit).toBe('30590fe8d3fdc57e63a0e9c5b2c0ececffb37301');
    expect(evidence.sourceWitness.normalizedLandmarkBlobSha).toBe('bb6104d89c8f9917cc173b5bfe2b347bab71b71c');
    expect(evidence.sourceWitness.faceLandmarkerResultBlobSha).toBe('4af483ab3c1c61b268b9d92a28bab6160c60b47f');
    expect(evidence.sourceWitness.releaseExactForInstalledPackage).toBe(false);
    expect(evidence.runtimeShapeObservation.sourceDeclarationSupplementalFields).toEqual([]);
    expect(evidence.runtimeShapeObservation.observedSupplementalLandmarkFields).toEqual(['faceLandmarks[].visibility']);
    expect(evidence.runtimeShapeObservation.treatment).toBe('finite_validate_then_discard');
    expect(evidence.runtimeShapeObservation.authorityState).toBe('runtime_shape_only');
    expect(evidence.authorityState).toBe('research_adapter_only');
  });

  it('selects exactly the pinned eye vertices and strips provider z before FR-24', () => {
    const adapted = adaptMediaPipeFaceLandmarkerResultToFR24InputFR25(fixtureResult(), CONTEXT);
    for (const symbol of ['FACE_LANDMARKS_LEFT_EYE', 'FACE_LANDMARKS_RIGHT_EYE'] as const) {
      const points = adapted.topologyInputs[symbol].pointsByProviderVertex;
      expect(Object.keys(points).map(Number).sort((a, b) => a - b)).toEqual(FR25_REQUIRED_EYE_PROVIDER_VERTICES[symbol]);
      for (const point of Object.values(points)) {
        expect(Object.keys(point).sort()).toEqual(['x', 'y']);
        expect(point).not.toHaveProperty('z');
      }
    }
  });

  it('accepts runtime-observed visibility only as finite validated-and-discarded provider shape', () => {
    const result = fixtureResult();
    const face = result.faceLandmarks[0]!.map((landmark, index) => ({
      ...landmark,
      visibility: 0.5 + (index % 10) / 100,
    }));
    const adapted = adaptMediaPipeFaceLandmarkerResultToFR24InputFR25({ ...result, faceLandmarks: [face] }, CONTEXT);
    for (const symbol of ['FACE_LANDMARKS_LEFT_EYE', 'FACE_LANDMARKS_RIGHT_EYE'] as const) {
      for (const point of Object.values(adapted.topologyInputs[symbol].pointsByProviderVertex)) {
        expect(Object.keys(point).sort()).toEqual(['x', 'y']);
        expect(point).not.toHaveProperty('visibility');
      }
    }
  });

  it('runs raw MediaPipe-shaped landmarks through FR-24 into a research-only eye-pair artifact', () => {
    const artifact = issueMediaPipeEyePairResearchArtifactFR25(fixtureResult(), CONTEXT);
    expect(artifact.schemaVersion).toBe('fr24-eye-pair-research-v1');
    expect(artifact.authorityState).toBe('research_projection_only');
    expect(artifact.regions).toHaveLength(2);
    expect(artifact.regions.every((region) => region.boundary.length === 16)).toBe(true);
    expect(artifact.sideAuthority).toBe('provider_label_only');
    expect(artifact.consumerSlotAssignment).toBeNull();
    expect(artifact.anatomicalLateralityResolved).toBe(false);
    expect(artifact.productionNeutralObservationIssued).toBe(false);
    expect(artifact.traditionalSemanticAuthority).toBe(false);
    expect(artifact.provenance.rawProviderResponsePersisted).toBe(false);
  });

  it('is deterministic for identical provider results and context', () => {
    const result = fixtureResult();
    expect(issueMediaPipeEyePairResearchArtifactFR25(result, CONTEXT)).toEqual(
      issueMediaPipeEyePairResearchArtifactFR25(result, CONTEXT),
    );
  });

  it('fails closed when zero or multiple faces are present', () => {
    expect(() => issueMediaPipeEyePairResearchArtifactFR25(fixtureResult(0), CONTEXT)).toThrow(/exactly one detected face; received 0/u);
    expect(() => issueMediaPipeEyePairResearchArtifactFR25(fixtureResult(2), CONTEXT)).toThrow(/exactly one detected face; received 2/u);
  });

  it('rejects missing required eye vertices, including sparse-array holes', () => {
    const result = fixtureResult();
    const face = [...result.faceLandmarks[0]!];
    delete face[466];
    expect(() => issueMediaPipeEyePairResearchArtifactFR25({ ...result, faceLandmarks: [face] }, CONTEXT)).toThrow(/missing required provider vertex: 466/u);
  });

  it('rejects malformed x/y and non-finite discarded z/visibility on consumed eye vertices', () => {
    const xResult = fixtureResult();
    const xFace = [...xResult.faceLandmarks[0]!];
    xFace[33] = { ...xFace[33]!, x: 1.1 };
    expect(() => issueMediaPipeEyePairResearchArtifactFR25({ ...xResult, faceLandmarks: [xFace] }, CONTEXT)).toThrow(/faceLandmarks\[33\]\.x must be finite within \[0,1\]/u);

    const yResult = fixtureResult();
    const yFace = [...yResult.faceLandmarks[0]!];
    yFace[263] = { ...yFace[263]!, y: Number.NaN };
    expect(() => issueMediaPipeEyePairResearchArtifactFR25({ ...yResult, faceLandmarks: [yFace] }, CONTEXT)).toThrow(/faceLandmarks\[263\]\.y must be finite within \[0,1\]/u);

    const zResult = fixtureResult();
    const zFace = [...zResult.faceLandmarks[0]!];
    zFace[249] = { ...zFace[249]!, z: Number.POSITIVE_INFINITY };
    expect(() => issueMediaPipeEyePairResearchArtifactFR25({ ...zResult, faceLandmarks: [zFace] }, CONTEXT)).toThrow(/faceLandmarks\[249\]\.z must be finite before it is discarded/u);

    const visibilityResult = fixtureResult();
    const visibilityFace = [...visibilityResult.faceLandmarks[0]!];
    visibilityFace[249] = { ...visibilityFace[249]!, visibility: Number.NaN };
    expect(() => issueMediaPipeEyePairResearchArtifactFR25({ ...visibilityResult, faceLandmarks: [visibilityFace] }, CONTEXT)).toThrow(/faceLandmarks\[249\]\.visibility must be finite before it is discarded/u);
  });

  it('still rejects unobserved supplemental provider fields on consumed landmarks', () => {
    const result = fixtureResult();
    const face = [...result.faceLandmarks[0]!];
    face[33] = { ...face[33]!, presence: 0.9 } as never;
    expect(() => issueMediaPipeEyePairResearchArtifactFR25({ ...result, faceLandmarks: [face] }, CONTEXT)).toThrow(/unauthorized field: presence/u);
  });

  it('requires the exact witnessed FaceLandmarkerResult root field set', () => {
    const result = fixtureResult();
    expect(() => issueMediaPipeEyePairResearchArtifactFR25({
      ...result,
      providerDebug: true,
    } as never, CONTEXT)).toThrow(/unauthorized field: providerDebug/u);

    expect(() => issueMediaPipeEyePairResearchArtifactFR25({
      faceLandmarks: result.faceLandmarks,
      faceBlendshapes: result.faceBlendshapes,
    } as never, CONTEXT)).toThrow(/witnessed FaceLandmarkerResult array fields/u);
  });

  it('does not carry ignored blendshape or transform contents into the research artifact', () => {
    const result: MediaPipeFaceLandmarkerResultFR25V1 = {
      ...fixtureResult(),
      faceBlendshapes: [{ categoryName: 'provider-only' }],
      facialTransformationMatrixes: [{ rows: 4, columns: 4, data: [1, 0, 0, 1] }],
    };
    const artifact = issueMediaPipeEyePairResearchArtifactFR25(result, CONTEXT);
    expect(JSON.stringify(artifact)).not.toMatch(/provider-only|categoryName|facialTransformation|columns/u);
  });

  it('keeps production, anatomical laterality, and traditional semantics blocked in readiness', () => {
    const readiness = assessMediaPipeEyeLandmarkAdapterFR25();
    expect(readiness.rawResultAdapterReady).toBe(true);
    expect(readiness.researchEyeProjectionReady).toBe(true);
    expect(readiness.productionProviderActivationReady).toBe(false);
    expect(readiness.anatomicalLateralityReady).toBe(false);
    expect(readiness.traditionalSemanticAuthorityGranted).toBe(false);
    expect(readiness.blockers.join(' ')).toMatch(/release-exact/u);
    expect(readiness.blockers.join(' ')).toMatch(/supplemental landmark visibility/u);
    expect(readiness.blockers.join(' ')).toMatch(/verified FR-22 provider implementation/u);
  });
});
