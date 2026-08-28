import { describe, expect, it } from 'vitest';
import {
  FR26_MEDIAPIPE_FACE_LANDMARKER_MODEL,
  FR26_MEDIAPIPE_WASM_ROOT,
  MEDIAPIPE_FACE_LANDMARKER_RUNTIME_EVIDENCE_FR26,
  assessMediaPipeFaceLandmarkerRuntimeFR26,
  runMediaPipeEyePairResearchFR26,
  type MediaPipeFaceLandmarkerResultFR25V1,
  type MediaPipeFaceLandmarkerRuntimeFactoryFR26V1,
  type MediaPipeFaceLandmarkerRuntimeRequestFR26V1,
  type MediaPipeNormalizedLandmarkFR25V1,
} from '../packages/face-reading/src/index.js';

const ASSET_DIGEST = `sha256:${'c'.repeat(64)}`;
const IMAGE = Object.freeze({ fixture: 'opaque-image-source' });

function request(overrides: Partial<MediaPipeFaceLandmarkerRuntimeRequestFR26V1> = {}): MediaPipeFaceLandmarkerRuntimeRequestFR26V1 {
  return {
    schemaVersion: 'fr26-mediapipe-face-landmarker-request-v1',
    providerRunRef: 'provider.run.fr26.fixture.001',
    canonicalAssetDigest: ASSET_DIGEST,
    image: IMAGE,
    ...overrides,
  };
}

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

function fakeFactory(
  detectImpl: (image: unknown) => MediaPipeFaceLandmarkerResultFR25V1 = () => fixtureResult(),
): {
  factory: MediaPipeFaceLandmarkerRuntimeFactoryFR26V1;
  state: { createCalls: number; detectCalls: number; closeCalls: number; lastImage: unknown };
} {
  const state = { createCalls: 0, detectCalls: 0, closeCalls: 0, lastImage: undefined as unknown };
  return {
    state,
    factory: {
      async create() {
        state.createCalls += 1;
        return {
          detect(image: unknown) {
            state.detectCalls += 1;
            state.lastImage = image;
            return detectImpl(image);
          },
          close() {
            state.closeCalls += 1;
          },
        };
      },
    },
  };
}

describe('FR-26 MediaPipe FaceLandmarker research runtime', () => {
  it('pins the exact research runtime references without claiming byte verification', () => {
    const evidence = MEDIAPIPE_FACE_LANDMARKER_RUNTIME_EVIDENCE_FR26;
    expect(evidence.runtimePackageName).toBe('@mediapipe/tasks-vision');
    expect(evidence.runtimePackageVersion).toBe('0.10.35');
    expect(evidence.wasm.rootRef).toBe(FR26_MEDIAPIPE_WASM_ROOT);
    expect(evidence.model.assetRef).toBe(FR26_MEDIAPIPE_FACE_LANDMARKER_MODEL);
    expect(evidence.wasm.independentByteDigest).toBeNull();
    expect(evidence.model.independentByteDigest).toBeNull();
    expect(evidence.wasm.verificationState).toBe('reference_pinned_bytes_unverified');
    expect(evidence.model.verificationState).toBe('reference_pinned_bytes_unverified');
    expect(evidence.runningMode).toBe('IMAGE');
    expect(evidence.numFaces).toBe(1);
    expect(evidence.outputFaceBlendshapes).toBe(false);
    expect(evidence.outputFacialTransformationMatrixes).toBe(false);
    expect(evidence.authorityState).toBe('research_runtime_only');
  });

  it('executes a runtime result through FR-25 and FR-24 without authority promotion', async () => {
    const runtime = fakeFactory();
    const output = await runMediaPipeEyePairResearchFR26(request(), runtime.factory);

    expect(runtime.state.createCalls).toBe(1);
    expect(runtime.state.detectCalls).toBe(1);
    expect(runtime.state.closeCalls).toBe(1);
    expect(runtime.state.lastImage).toBe(IMAGE);
    expect(output.schemaVersion).toBe('fr26-mediapipe-eye-pair-research-run-v1');
    expect(output.authorityState).toBe('research_runtime_only');
    expect(output.eyePairArtifact.schemaVersion).toBe('fr24-eye-pair-research-v1');
    expect(output.eyePairArtifact.regions).toHaveLength(2);
    expect(output.eyePairArtifact.regions.every((region) => region.boundary.length === 16)).toBe(true);
    expect(output.eyePairArtifact.sideAuthority).toBe('provider_label_only');
    expect(output.eyePairArtifact.consumerSlotAssignment).toBeNull();
    expect(output.eyePairArtifact.anatomicalLateralityResolved).toBe(false);
    expect(output.eyePairArtifact.productionNeutralObservationIssued).toBe(false);
    expect(output.eyePairArtifact.traditionalSemanticAuthority).toBe(false);
    expect(output.productionNeutralObservationIssued).toBe(false);
    expect(output.productionProviderActivationAllowed).toBe(false);
    expect(output.anatomicalLateralityResolved).toBe(false);
    expect(output.traditionalSemanticAuthority).toBe(false);
  });

  it('is deterministic for identical runtime output and request metadata', async () => {
    const first = fakeFactory();
    const second = fakeFactory();
    expect(await runMediaPipeEyePairResearchFR26(request(), first.factory)).toEqual(
      await runMediaPipeEyePairResearchFR26(request(), second.factory),
    );
  });

  it('rejects malformed or authority-injecting request fields before creating the runtime', async () => {
    const runtime = fakeFactory();
    await expect(runMediaPipeEyePairResearchFR26({
      ...request(),
      anatomicalSide: 'left',
    } as never, runtime.factory)).rejects.toThrow(/unauthorized field: anatomicalSide/u);
    await expect(runMediaPipeEyePairResearchFR26(request({
      schemaVersion: 'fr26-forged' as never,
    }), runtime.factory)).rejects.toThrow(/schemaVersion is unsupported/u);
    await expect(runMediaPipeEyePairResearchFR26(request({
      providerRunRef: 'bad run ref',
    }), runtime.factory)).rejects.toThrow(/bounded opaque reference/u);
    await expect(runMediaPipeEyePairResearchFR26(request({
      canonicalAssetDigest: 'sha256:not-a-digest',
    }), runtime.factory)).rejects.toThrow(/canonicalAssetDigest/u);
    await expect(runMediaPipeEyePairResearchFR26(request({
      image: null,
    }), runtime.factory)).rejects.toThrow(/image must be present/u);
    expect(runtime.state.createCalls).toBe(0);
  });

  it('fails closed on zero or multiple faces and closes the runtime', async () => {
    const zero = fakeFactory(() => fixtureResult(0));
    await expect(runMediaPipeEyePairResearchFR26(request(), zero.factory)).rejects.toThrow(/exactly one detected face; received 0/u);
    expect(zero.state.closeCalls).toBe(1);

    const multiple = fakeFactory(() => fixtureResult(2));
    await expect(runMediaPipeEyePairResearchFR26(request(), multiple.factory)).rejects.toThrow(/exactly one detected face; received 2/u);
    expect(multiple.state.closeCalls).toBe(1);
  });

  it('preserves FR-25 hidden-provider-field rejection instead of sanitizing around it', async () => {
    const hiddenRoot = fakeFactory(() => ({
      ...fixtureResult(),
      providerDebug: true,
    } as never));
    await expect(runMediaPipeEyePairResearchFR26(request(), hiddenRoot.factory)).rejects.toThrow(/unauthorized field: providerDebug/u);
    expect(hiddenRoot.state.closeCalls).toBe(1);

    const hiddenLandmark = fakeFactory(() => {
      const result = fixtureResult();
      const face = [...result.faceLandmarks[0]!];
      face[33] = { ...face[33]!, visibility: 0.99 } as never;
      return { ...result, faceLandmarks: [face] };
    });
    await expect(runMediaPipeEyePairResearchFR26(request(), hiddenLandmark.factory)).rejects.toThrow(/unauthorized field: visibility/u);
    expect(hiddenLandmark.state.closeCalls).toBe(1);
  });

  it('preserves FR-25 malformed-coordinate rejection and closes the runtime', async () => {
    const malformed = fakeFactory(() => {
      const result = fixtureResult();
      const face = [...result.faceLandmarks[0]!];
      face[263] = { ...face[263]!, x: Number.NaN };
      return { ...result, faceLandmarks: [face] };
    });
    await expect(runMediaPipeEyePairResearchFR26(request(), malformed.factory)).rejects.toThrow(/faceLandmarks\[263\]\.x/u);
    expect(malformed.state.closeCalls).toBe(1);
  });

  it('closes the runtime when provider detection throws and emits no partial artifact', async () => {
    const runtime = fakeFactory(() => {
      throw new Error('provider detect failure');
    });
    await expect(runMediaPipeEyePairResearchFR26(request(), runtime.factory)).rejects.toThrow(/provider detect failure/u);
    expect(runtime.state.detectCalls).toBe(1);
    expect(runtime.state.closeCalls).toBe(1);
  });

  it('does not persist provider depth, blendshape payloads, transform payloads, or raw image content in output', async () => {
    const runtime = fakeFactory(() => ({
      ...fixtureResult(),
      faceBlendshapes: [{ categoryName: 'provider-only-secret' }],
      facialTransformationMatrixes: [{ rows: 4, columns: 4, data: [1, 0, 0, 1] }],
    }));
    const output = await runMediaPipeEyePairResearchFR26(request(), runtime.factory);
    const serialized = JSON.stringify(output);
    expect(serialized).not.toContain('provider-only-secret');
    expect(serialized).not.toContain('categoryName');
    expect(serialized).not.toContain('facialTransformationMatrixes');
    expect(serialized).not.toMatch(/"z":/u);
    expect(serialized).not.toContain('opaque-image-source');
    expect(output.rawImagePersisted).toBe(false);
    expect(output.rawProviderResponsePersisted).toBe(false);
    expect(output.biometricEmbeddingPersisted).toBe(false);
  });

  it('keeps production, laterality, and traditional semantics blocked in readiness', () => {
    const readiness = assessMediaPipeFaceLandmarkerRuntimeFR26();
    expect(readiness.runtimeExecutionPathImplemented).toBe(true);
    expect(readiness.researchEyeProjectionReady).toBe(true);
    expect(readiness.productionProviderActivationReady).toBe(false);
    expect(readiness.anatomicalLateralityReady).toBe(false);
    expect(readiness.traditionalSemanticAuthorityGranted).toBe(false);
    expect(readiness.blockers.join(' ')).toMatch(/WASM/u);
    expect(readiness.blockers.join(' ')).toMatch(/model/u);
    expect(readiness.blockers.join(' ')).toMatch(/FR-22/u);
    expect(readiness.blockers.join(' ')).toMatch(/FR-23/u);
    expect(readiness.blockers.join(' ')).toMatch(/privacy consent/u);
  });
});
