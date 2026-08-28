import { describe, expect, it } from 'vitest';
import {
  FR26_MEDIAPIPE_FACE_LANDMARKER_MODEL,
  FR26_MEDIAPIPE_WASM_ROOT,
  FR27_EXPECTED_INSTALLED_WASM_DIGESTS,
  MEDIAPIPE_DEFAULT_NETWORK_RUNTIME_EVIDENCE_FR28,
  assessMediaPipeDefaultNetworkRuntimeFR28,
  validateMediaPipeDefaultNetworkRuntimeEvidenceFR28,
} from '../packages/face-reading/src/index.js';

describe('FR-28 MediaPipe default network runtime verification evidence', () => {
  it('pins the hardened default-factory browser execution and artifact', () => {
    const evidence = validateMediaPipeDefaultNetworkRuntimeEvidenceFR28();
    expect(evidence.authorityState).toBe('default_network_runtime_verification_only');
    expect(evidence.executionSource.executionHeadSha).toBe('0c7801b77e43225b1dd4d46339c8b94143bd161c');
    expect(evidence.executionSource.checkoutMergeSha).toBe('96d0ffd9bd58ccd78ebd9281d6d9055429a6f1a4');
    expect(evidence.executionSource.workflowRunId).toBe(33142936129);
    expect(evidence.executionSource.artifactId).toBe(9674675558);
    expect(evidence.executionSource.artifactArchiveDigest).toBe('sha256:95b3a939c363424f9c820769edd0e38f3df7c36bd6d35ed962cfce3728235471');
    expect(evidence.executionSource.workflowBlobSha).toBe('2a612638be414b2d2e32b8a67f3bcfa981cc2ab0');
    expect(evidence.executionSource.harnessBlobSha).toBe('d240bef680d109b42a7bc78bd9fed389c7f392fb');
  });

  it('verifies every shipped jsDelivr WASM reference byte against the installed package', () => {
    const evidence = MEDIAPIPE_DEFAULT_NETWORK_RUNTIME_EVIDENCE_FR28;
    expect(evidence.wasmReference.rootRef).toBe(FR26_MEDIAPIPE_WASM_ROOT);
    expect(evidence.wasmReference.allShippedFilesByteEquivalentToInstalledPackage).toBe(true);
    expect(evidence.wasmReference.digests).toEqual(FR27_EXPECTED_INSTALLED_WASM_DIGESTS);
    expect(evidence.wasmReference.browserSelectedFiles).toEqual([
      'vision_wasm_internal.js',
      'vision_wasm_internal.wasm',
    ]);
  });

  it('verifies the exact FR-26 model reference bytes', () => {
    const evidence = MEDIAPIPE_DEFAULT_NETWORK_RUNTIME_EVIDENCE_FR28;
    expect(evidence.modelReference.assetRef).toBe(FR26_MEDIAPIPE_FACE_LANDMARKER_MODEL);
    expect(evidence.modelReference.digest).toBe('sha256:64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff');
    expect(evidence.modelReference.byteLength).toBe(3758596);
    expect(evidence.modelReference.referenceBytesVerified).toBe(true);
  });

  it('keeps package resolution provenance explicit instead of claiming a remote package bundle', () => {
    const evidence = MEDIAPIPE_DEFAULT_NETWORK_RUNTIME_EVIDENCE_FR28;
    expect(evidence.packageResolution.packageName).toBe('@mediapipe/tasks-vision');
    expect(evidence.packageResolution.packageVersion).toBe('0.10.35');
    expect(evidence.packageResolution.browserResolutionMode).toBe('import_map_to_exact_installed_bundle');
    expect(evidence.packageResolution.remotePackageBundleClaimed).toBe(false);
  });

  it('records a bounded pinned-asset-only browser network observation without claiming telemetry absence', () => {
    const observation = MEDIAPIPE_DEFAULT_NETWORK_RUNTIME_EVIDENCE_FR28.networkObservation;
    expect(observation.observationWindowMsAfterReplay).toBe(1000);
    expect(observation.requestPolicy).toBe('pinned_asset_get_only');
    expect(observation.observedExternalRequestCounts).toEqual({ wasmLoader: 1, wasmBinary: 2, model: 2 });
    expect(observation.allObservedResponses2xx).toBe(true);
    expect(observation.unexpectedExternalRequestCount).toBe(0);
    expect(observation.telemetryAbsenceClaimed).toBe(false);
  });

  it('records two deterministic executions through the non-injected FR-26 default factory', () => {
    const execution = MEDIAPIPE_DEFAULT_NETWORK_RUNTIME_EVIDENCE_FR28.execution;
    expect(execution.defaultFactoryInjected).toBe(false);
    expect(execution.replayCount).toBe(2);
    expect(execution.deterministicReplay).toBe(true);
    expect(execution.imageDimensions).toEqual([640, 640]);
    expect(execution.researchRegionCount).toBe(2);
    expect(execution.boundaryVertexCounts).toEqual([16, 16]);
    expect(execution.sideAuthority).toBe('provider_label_only');
    expect(execution.consumerSlotAssignment).toBeNull();
  });

  it('keeps provider conformance, activation, laterality, semantics, and persistence blocked', () => {
    const evidence = MEDIAPIPE_DEFAULT_NETWORK_RUNTIME_EVIDENCE_FR28;
    expect(evidence.rawImagePersisted).toBe(false);
    expect(evidence.rawProviderResponsePersisted).toBe(false);
    expect(evidence.biometricEmbeddingPersisted).toBe(false);
    expect(evidence.productionNeutralObservationIssued).toBe(false);
    expect(evidence.productionProviderActivationAllowed).toBe(false);
    expect(evidence.providerConformanceClaimed).toBe(false);
    expect(evidence.anatomicalLateralityResolved).toBe(false);
    expect(evidence.traditionalSemanticAuthority).toBe(false);

    const readiness = assessMediaPipeDefaultNetworkRuntimeFR28();
    expect(readiness.defaultFactoryExecutionVerified).toBe(true);
    expect(readiness.wasmReferenceRootByteEquivalenceVerified).toBe(true);
    expect(readiness.modelReferenceBytesVerified).toBe(true);
    expect(readiness.boundedExternalRequestSetVerified).toBe(true);
    expect(readiness.telemetryAbsenceClaimed).toBe(false);
    expect(readiness.providerConformanceReady).toBe(false);
    expect(readiness.productionProviderActivationReady).toBe(false);
    expect(readiness.anatomicalLateralityReady).toBe(false);
    expect(readiness.traditionalSemanticAuthorityGranted).toBe(false);
  });

  it('fails closed if WASM reference equivalence is withdrawn', () => {
    const evidence = MEDIAPIPE_DEFAULT_NETWORK_RUNTIME_EVIDENCE_FR28;
    expect(() => validateMediaPipeDefaultNetworkRuntimeEvidenceFR28({
      ...evidence,
      wasmReference: {
        ...evidence.wasmReference,
        allShippedFilesByteEquivalentToInstalledPackage: false,
      },
    } as never)).toThrow(/must verify byte equivalence/u);
  });

  it('fails closed if unexpected network activity or a telemetry-absence claim is injected', () => {
    const evidence = MEDIAPIPE_DEFAULT_NETWORK_RUNTIME_EVIDENCE_FR28;
    expect(() => validateMediaPipeDefaultNetworkRuntimeEvidenceFR28({
      ...evidence,
      networkObservation: {
        ...evidence.networkObservation,
        unexpectedExternalRequestCount: 1,
      },
    } as never)).toThrow(/may not admit unexpected requests or claim telemetry absence/u);
    expect(() => validateMediaPipeDefaultNetworkRuntimeEvidenceFR28({
      ...evidence,
      networkObservation: {
        ...evidence.networkObservation,
        telemetryAbsenceClaimed: true,
      },
    } as never)).toThrow(/may not admit unexpected requests or claim telemetry absence/u);
  });

  it('fails closed on production or traditional-semantic promotion', () => {
    const evidence = MEDIAPIPE_DEFAULT_NETWORK_RUNTIME_EVIDENCE_FR28;
    expect(() => validateMediaPipeDefaultNetworkRuntimeEvidenceFR28({
      ...evidence,
      productionProviderActivationAllowed: true,
    } as never)).toThrow(/cannot promote persistence, provider conformance, production activation/u);
    expect(() => validateMediaPipeDefaultNetworkRuntimeEvidenceFR28({
      ...evidence,
      traditionalSemanticAuthority: true,
    } as never)).toThrow(/cannot promote persistence, provider conformance, production activation/u);
  });
});
