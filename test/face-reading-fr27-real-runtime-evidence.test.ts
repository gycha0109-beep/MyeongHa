import { describe, expect, it } from 'vitest';
import {
  FR26_MEDIAPIPE_FACE_LANDMARKER_MODEL,
  FR26_MEDIAPIPE_WASM_ROOT,
  FR27_EXPECTED_INSTALLED_WASM_DIGESTS,
  MEDIAPIPE_REAL_RUNTIME_VERIFICATION_EVIDENCE_FR27,
  assessMediaPipeRealRuntimeVerificationFR27,
  validateMediaPipeRealRuntimeVerificationEvidenceFR27,
} from '../packages/face-reading/src/index.js';

describe('FR-27 real MediaPipe browser runtime verification evidence', () => {
  it('pins the hardened successful real-browser execution and exact source blobs', () => {
    const evidence = validateMediaPipeRealRuntimeVerificationEvidenceFR27();
    expect(evidence.authorityState).toBe('runtime_execution_verification_only');
    expect(evidence.executionSource.executionHeadSha).toBe('cdf2aaab42830644bf8a47039f0fd11436ef1de6');
    expect(evidence.executionSource.checkoutMergeSha).toBe('762c3dd9c821eb2ab266469cb7cdee526ede5765');
    expect(evidence.executionSource.workflowRunId).toBe(33142026425);
    expect(evidence.executionSource.artifactId).toBe(9674315540);
    expect(evidence.executionSource.artifactArchiveDigest).toBe('sha256:cee951b0026ccd87f761d79beb14381946e7353e1f4620bb99c4547215ab7b93');
    expect(evidence.executionSource.harnessBlobSha).toBe('3c991474f0375dba746832f9205a1c2ee3c06bf1');
    expect(evidence.executionSource.fr26RuntimeBlobSha).toBe('9d5747978f9a563c3daba7e36859f7a4ec1c6dde');
    expect(evidence.executionSource.fr25AdapterBlobSha).toBe('75d3aaf21e1c235014ef03c5c02e7a04b1c135a3');
    expect(evidence.executionSource.fr24BridgeBlobSha).toBe('64c4ea1e139f1fbb5cd4e738a07bca3890c3b257');
  });

  it('pins independently hashed installed package assets and exact model bytes', () => {
    const evidence = MEDIAPIPE_REAL_RUNTIME_VERIFICATION_EVIDENCE_FR27;
    expect(evidence.runtimePackageVersion).toBe('0.10.35');
    expect(evidence.installedPackageAssets.packageBundleDigest).toBe('sha256:55d7ab624fbb70dcc5adc4ae6d7ea9cfcb569139d3dbfbf2b1deafcb966bc0fe');
    expect(evidence.installedPackageAssets.wasmReferenceRoot).toBe(FR26_MEDIAPIPE_WASM_ROOT);
    expect(evidence.installedPackageAssets.wasmFiles).toEqual(FR27_EXPECTED_INSTALLED_WASM_DIGESTS);
    expect(evidence.installedPackageAssets.wasmReferenceRootByteEquivalenceVerified).toBe(false);
    expect(evidence.model.assetRef).toBe(FR26_MEDIAPIPE_FACE_LANDMARKER_MODEL);
    expect(evidence.model.independentByteDigest).toBe('sha256:64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff');
    expect(evidence.model.referenceBytesVerified).toBe(true);
  });

  it('pins the official MediaPipe sample fixture by repository commit, blob, bytes, and dimensions', () => {
    const evidence = MEDIAPIPE_REAL_RUNTIME_VERIFICATION_EVIDENCE_FR27;
    expect(evidence.fixture.repository).toBe('google-ai-edge/mediapipe-samples-web');
    expect(evidence.fixture.sourceCommit).toBe('bbb8974ffd450650ad5a1e7c1656c9debb8e38bf');
    expect(evidence.fixture.sourceBlobSha).toBe('7ec9d163603c98159d283b6ceb9086f9794d1dc9');
    expect(evidence.fixture.independentByteDigest).toBe('sha256:75171e877e92b7a126cca2e7a388fc430225e07e9cd2e9e801eaa67ea6d7f4d9');
    expect(evidence.execution.imageDimensions).toEqual([640, 640]);
  });

  it('records two deterministic real detections, actual landmark field shape, and bounded FR-24 projection shape', () => {
    const execution = MEDIAPIPE_REAL_RUNTIME_VERIFICATION_EVIDENCE_FR27.execution;
    expect(execution.realBrowserExecution).toBe(true);
    expect(execution.replayCount).toBe(2);
    expect(execution.deterministicReplay).toBe(true);
    expect(execution.faceCounts).toEqual([1, 1]);
    expect(execution.landmarkCounts).toEqual([478, 478]);
    expect(execution.landmarkFieldSet).toEqual(['visibility', 'x', 'y', 'z']);
    expect(execution.blendshapeCounts).toEqual([0, 0]);
    expect(execution.transformationMatrixCounts).toEqual([0, 0]);
    expect(execution.researchRegionCount).toBe(2);
    expect(execution.boundaryVertexCounts).toEqual([16, 16]);
    expect(execution.sideAuthority).toBe('provider_label_only');
    expect(execution.consumerSlotAssignment).toBeNull();
  });

  it('keeps the unverified default network factory boundary explicit', () => {
    const evidence = MEDIAPIPE_REAL_RUNTIME_VERIFICATION_EVIDENCE_FR27;
    expect(evidence.execution.factoryMode).toBe('instrumented_exact_package_assets');
    expect(evidence.execution.defaultFactoryNetworkPathVerified).toBe(false);
    expect(evidence.installedPackageAssets.wasmReferenceRootByteEquivalenceVerified).toBe(false);

    const readiness = assessMediaPipeRealRuntimeVerificationFR27();
    expect(readiness.realBrowserExecutionVerified).toBe(true);
    expect(readiness.deterministicResearchReplayVerified).toBe(true);
    expect(readiness.installedPackageAssetDigestsVerified).toBe(true);
    expect(readiness.modelReferenceBytesVerified).toBe(true);
    expect(readiness.runtimeLandmarkShapeVerified).toBe(true);
    expect(readiness.defaultFactoryNetworkPathVerified).toBe(false);
    expect(readiness.blockers.join(' ')).toMatch(/jsDelivr WASM reference root/u);
    expect(readiness.blockers.join(' ')).toMatch(/default network factory path remains unverified/u);
  });

  it('keeps provider conformance, activation, laterality, semantics, and persistence blocked', () => {
    const evidence = MEDIAPIPE_REAL_RUNTIME_VERIFICATION_EVIDENCE_FR27;
    expect(evidence.rawImagePersisted).toBe(false);
    expect(evidence.rawProviderResponsePersisted).toBe(false);
    expect(evidence.biometricEmbeddingPersisted).toBe(false);
    expect(evidence.productionNeutralObservationIssued).toBe(false);
    expect(evidence.productionProviderActivationAllowed).toBe(false);
    expect(evidence.providerConformanceClaimed).toBe(false);
    expect(evidence.anatomicalLateralityResolved).toBe(false);
    expect(evidence.traditionalSemanticAuthority).toBe(false);

    const readiness = assessMediaPipeRealRuntimeVerificationFR27();
    expect(readiness.providerConformanceReady).toBe(false);
    expect(readiness.productionProviderActivationReady).toBe(false);
    expect(readiness.anatomicalLateralityReady).toBe(false);
    expect(readiness.traditionalSemanticAuthorityGranted).toBe(false);
    expect(readiness.blockers.join(' ')).toMatch(/FR-22 verified provider implementation registry remains empty/u);
    expect(readiness.blockers.join(' ')).toMatch(/FR-23 reviewed provider conformance evidence registry remains empty/u);
  });

  it('fails closed if installed-package hashes are falsely promoted to CDN equivalence', () => {
    const evidence = MEDIAPIPE_REAL_RUNTIME_VERIFICATION_EVIDENCE_FR27;
    expect(() => validateMediaPipeRealRuntimeVerificationEvidenceFR27({
      ...evidence,
      installedPackageAssets: {
        ...evidence.installedPackageAssets,
        wasmReferenceRootByteEquivalenceVerified: true,
      },
    } as never)).toThrow(/may not promote installed-package WASM hashes/u);
  });

  it('fails closed if the observed runtime landmark field set is changed', () => {
    const evidence = MEDIAPIPE_REAL_RUNTIME_VERIFICATION_EVIDENCE_FR27;
    expect(() => validateMediaPipeRealRuntimeVerificationEvidenceFR27({
      ...evidence,
      execution: {
        ...evidence.execution,
        landmarkFieldSet: ['x', 'y', 'z'],
      },
    } as never)).toThrow(/landmarkFieldSet mismatch/u);
  });

  it('fails closed on any production or semantic promotion', () => {
    const evidence = MEDIAPIPE_REAL_RUNTIME_VERIFICATION_EVIDENCE_FR27;
    expect(() => validateMediaPipeRealRuntimeVerificationEvidenceFR27({
      ...evidence,
      productionProviderActivationAllowed: true,
    } as never)).toThrow(/cannot promote persistence, provider conformance, production activation/u);
    expect(() => validateMediaPipeRealRuntimeVerificationEvidenceFR27({
      ...evidence,
      traditionalSemanticAuthority: true,
    } as never)).toThrow(/cannot promote persistence, provider conformance, production activation/u);
  });
});
