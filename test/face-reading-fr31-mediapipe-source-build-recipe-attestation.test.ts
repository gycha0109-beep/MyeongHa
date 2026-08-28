import { describe, expect, it } from 'vitest';
import {
  FR31_EXPECTED_PACKAGE_DEPS,
  FR31_EXPECTED_SOURCE_FILE_OBSERVATIONS,
  FR31_EXPECTED_WASM_INPUTS,
  MEDIAPIPE_SOURCE_BUILD_RECIPE_ATTESTATION_FR31,
  assessMediaPipeSourceBuildRecipeFR31,
  validateMediaPipeSourceBuildRecipeAttestationFR31,
} from '../packages/face-reading/src/index.js';

describe('FR-31 MediaPipe source build recipe attestation', () => {
  it('pins the successful independent upstream source-recipe measurement witness', () => {
    expect(MEDIAPIPE_SOURCE_BUILD_RECIPE_ATTESTATION_FR31.measurementWitness).toEqual({
      repository: 'gycha0109-beep/MyeongHa',
      workflowRunId: 33155358263,
      checkoutMergeSha: '2bce2bec0170973b423286b9b99d9ebbd6e457ac',
      executionHeadSha: 'a861f9ff347676dff9e9489035d75f61c7d5fb21',
      workflowPath: '.github/workflows/face-reading-source-build-recipe-attestation.yml',
      workflowBlobSha: '89c97698723780e79c178033c7786208c8de89ea',
      harnessPath: 'scripts/face-reading-fr31-source-build-recipe-attestation.mjs',
      harnessBlobSha: '8a000e6cd1f88fe95fc711b1a81163c367b93f6c',
      runnerOs: 'ubuntu-24.04',
      nodeVersion: '24.19.0',
      npmVersion: '11.17.0',
      artifactId: 9679370659,
      artifactArchiveDigest: 'sha256:458b4d8200733e6a4dafa8fc2d3adab7bd2619b6a7000360b262686a54e6eba4',
    });
  });

  it('pins independently rehashed upstream source bytes at the v0.10.35 tag commit', () => {
    const evidence = validateMediaPipeSourceBuildRecipeAttestationFR31();
    expect(evidence.authorityState).toBe('release_tag_build_recipe_identity_only');
    expect(evidence.sourceIdentity).toEqual({
      repository: 'google-ai-edge/mediapipe',
      tagName: 'v0.10.35',
      tagCommitSha: 'f8ef212d5c962c0e853db7e59d217056b187084b',
    });
    expect(evidence.sourceFileObservations).toEqual(FR31_EXPECTED_SOURCE_FILE_OBSERVATIONS);
    expect(evidence.sourceFileObservations).toEqual([
      { path: '.bazelversion', byteLength: 6, gitBlobSha: '815da58b7a9ed1179ad6dd58c1ecac25e86fd77e', sha256: 'sha256:910121d8fda1ee513d664110f94bef46c4791698010db514c2a71cc1932bc3cf' },
      { path: 'mediapipe/tasks/web/vision/BUILD', byteLength: 3912, gitBlobSha: '0dee1e6153366f79cc9f787900f7b0bcf3c7462a', sha256: 'sha256:bc7e14e557202403611b7ec6a5664354c8c2a85481651758a5b500a158bf1c3d' },
      { path: 'mediapipe/tasks/web/rollup.config.mjs', byteLength: 244, gitBlobSha: '6d93653dcdadfe67e6d8a33530982a27c20cbb07', sha256: 'sha256:e5be943fecf6286093553fc751438ecf59a700c68efd1baa54655ca2d96cf534' },
      { path: 'mediapipe/tasks/web/package.json', byteLength: 1115, gitBlobSha: '6f250cfdfc993effb2b4e3c353dc7ccaf205e2b7', sha256: 'sha256:d433c89b985d12479ca54bde5851bac0ff6837d9bdb7376efe2063a2d4cfb519' },
      { path: 'package.json', byteLength: 764, gitBlobSha: '2b799c335a93f3c0a987eaf0e1a0abf8c8c54c51', sha256: 'sha256:d8bf3f2dc508f15c98a010cc6618c9307c255a704776a736c8c06c1cc9d8de32' },
      { path: 'yarn.lock', byteLength: 48825, gitBlobSha: 'c0268f53100bef8c45c3dd26874732b724b8f768', sha256: 'sha256:a5cb1ebadfe1c4fb8601106258ee9d7bea1ab615442d99ce765ab06f1a769a00' },
    ]);
  });

  it('pins the v0.10.35 Bazel, Rollup, package-template, and lockfile source identities', () => {
    const evidence = MEDIAPIPE_SOURCE_BUILD_RECIPE_ATTESTATION_FR31;
    expect(evidence.bazelToolchain).toEqual({
      versionFilePath: '.bazelversion',
      versionFileBlobSha: '815da58b7a9ed1179ad6dd58c1ecac25e86fd77e',
      declaredVersion: '7.4.1',
    });
    expect(evidence.visionBuildRule.blobSha).toBe('0dee1e6153366f79cc9f787900f7b0bcf3c7462a');
    expect(evidence.rollupRecipe.blobSha).toBe('6d93653dcdadfe67e6d8a33530982a27c20cbb07');
    expect(evidence.packageTemplate.blobSha).toBe('6f250cfdfc993effb2b4e3c353dc7ccaf205e2b7');
    expect(evidence.javascriptDependencyInputs.rootPackageManifestBlobSha)
      .toBe('2b799c335a93f3c0a987eaf0e1a0abf8c8c54c51');
    expect(evidence.javascriptDependencyInputs.yarnLockBlobSha)
      .toBe('c0268f53100bef8c45c3dd26874732b724b8f768');
  });

  it('pins the explicit vision_pkg build recipe without inventing hidden packaging edges', () => {
    const recipe = MEDIAPIPE_SOURCE_BUILD_RECIPE_ATTESTATION_FR31.visionBuildRule;
    expect(recipe.packageTarget).toBe('//mediapipe/tasks/web/vision:vision_pkg');
    expect(recipe.packageRule).toBe('pkg_npm');
    expect(recipe.packageName).toBe('@mediapipe/tasks-vision');
    expect(recipe.tgzOutput).toBe('vision_pkg.tgz');
    expect(recipe.bundleTargets).toEqual(['vision_bundle_mjs', 'vision_bundle_cjs']);
    expect(recipe.bundleFormats).toEqual(['esm', 'cjs']);
    expect(recipe.bundleSourceOutputs).toEqual([
      'vision_bundle.cjs',
      'vision_bundle.cjs.map',
      'vision_bundle.mjs',
      'vision_bundle.mjs.map',
    ]);
    expect(recipe.wasmInputs).toEqual(FR31_EXPECTED_WASM_INPUTS);
    expect(recipe.explicitPackageDeps).toEqual(FR31_EXPECTED_PACKAGE_DEPS);
  });

  it('keeps mutable release observations and build-equivalence gaps explicit', () => {
    const evidence = MEDIAPIPE_SOURCE_BUILD_RECIPE_ATTESTATION_FR31;
    expect(evidence.packageTemplate.versionToken).toBe('__VERSION__');
    expect(evidence.packageTemplate.visionPkgExplicitSubstitutions)
      .toEqual(['__NAME__', '__DESCRIPTION__', '__TYPES__']);
    expect(evidence.packageTemplate.versionTokenExplicitlySubstitutedInVisionPkgRule).toBe(false);
    expect(evidence.packageTemplate.versionStampingProcedureVerified).toBe(false);
    expect(evidence.publicationBoundary.githubReleaseImmutable).toBe(false);
    expect(evidence.publicationBoundary.githubReleaseAssetsCountObserved).toBe(0);
    expect(evidence.publicationBoundary.releaseAssetsObservationOnlyBecauseMutable).toBe(true);
    expect(evidence.publicationBoundary.typeDeclarationPackagingPathVerified).toBe(false);
    expect(evidence.publicationBoundary.tagBuildExecutedByMyeongHa).toBe(false);
    expect(evidence.publicationBoundary.rebuiltPackageContentsComparedToPublishedArtifact).toBe(false);
    expect(evidence.publicationBoundary.publishedArtifactSourceBuildEquivalenceVerified).toBe(false);
  });

  it('reports recipe identity ready while every promotion boundary remains blocked', () => {
    const readiness = assessMediaPipeSourceBuildRecipeFR31();
    expect(readiness.releaseTagBuildRecipeIdentityReady).toBe(true);
    expect(readiness.independentSourceByteRehashReady).toBe(true);
    expect(readiness.bazelVersionPinned).toBe(true);
    expect(readiness.rollupRecipePinned).toBe(true);
    expect(readiness.npmPackagingTargetPinned).toBe(true);
    expect(readiness.dependencyLockfilePresencePinned).toBe(true);
    expect(readiness.versionStampingProcedureReady).toBe(false);
    expect(readiness.typeDeclarationPackagingProvenanceReady).toBe(false);
    expect(readiness.reproducibleTagBuildExecutionReady).toBe(false);
    expect(readiness.publishedArtifactSourceBuildEquivalenceReady).toBe(false);
    expect(readiness.providerConformanceReady).toBe(false);
    expect(readiness.productionProviderActivationReady).toBe(false);
    expect(readiness.anatomicalLateralityReady).toBe(false);
    expect(readiness.traditionalSemanticAuthorityGranted).toBe(false);
  });

  it('fails closed if pinned upstream bytes or measurement witness drift', () => {
    const evidence = MEDIAPIPE_SOURCE_BUILD_RECIPE_ATTESTATION_FR31;
    const changedFiles = evidence.sourceFileObservations.map((entry) => entry.path === '.bazelversion'
      ? { ...entry, sha256: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }
      : entry);
    expect(() => validateMediaPipeSourceBuildRecipeAttestationFR31({ ...evidence, sourceFileObservations: changedFiles } as never))
      .toThrow(/source file observation mismatch/u);
    expect(() => validateMediaPipeSourceBuildRecipeAttestationFR31({
      ...evidence,
      measurementWitness: { ...evidence.measurementWitness, artifactId: 1 },
    } as never)).toThrow(/measurement witness identity mismatch/u);
    expect(() => validateMediaPipeSourceBuildRecipeAttestationFR31({
      ...evidence,
      bazelToolchain: { ...evidence.bazelToolchain, declaredVersion: '7.4.2' },
    } as never)).toThrow(/Bazel toolchain identity mismatch/u);
  });

  it('fails closed on unverified provenance or semantic promotion', () => {
    const evidence = MEDIAPIPE_SOURCE_BUILD_RECIPE_ATTESTATION_FR31;
    expect(() => validateMediaPipeSourceBuildRecipeAttestationFR31({
      ...evidence,
      packageTemplate: { ...evidence.packageTemplate, versionStampingProcedureVerified: true },
    } as never)).toThrow(/version-stamping boundary mismatch/u);
    expect(() => validateMediaPipeSourceBuildRecipeAttestationFR31({
      ...evidence,
      publicationBoundary: { ...evidence.publicationBoundary, publishedArtifactSourceBuildEquivalenceVerified: true },
    } as never)).toThrow(/must not be promoted/u);
    expect(() => validateMediaPipeSourceBuildRecipeAttestationFR31({ ...evidence, providerConformanceClaimed: true } as never))
      .toThrow(/cannot promote/u);
    expect(() => validateMediaPipeSourceBuildRecipeAttestationFR31({ ...evidence, productionProviderActivationAllowed: true } as never))
      .toThrow(/cannot promote/u);
    expect(() => validateMediaPipeSourceBuildRecipeAttestationFR31({ ...evidence, anatomicalLateralityResolved: true } as never))
      .toThrow(/cannot promote/u);
    expect(() => validateMediaPipeSourceBuildRecipeAttestationFR31({ ...evidence, traditionalSemanticAuthority: true } as never))
      .toThrow(/cannot promote/u);
  });
});
