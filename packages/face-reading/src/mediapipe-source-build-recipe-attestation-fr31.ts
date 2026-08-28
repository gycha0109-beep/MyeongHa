import { MEDIAPIPE_RELEASE_TAG_PROVENANCE_FR29 } from './mediapipe-release-tag-provenance-fr29.js';
import { MEDIAPIPE_NPM_ARTIFACT_BYTE_ATTESTATION_FR30 } from './mediapipe-npm-artifact-byte-attestation-fr30.js';
import { FaceAuthorityValidationError } from './validation.js';

export interface MediaPipeSourceFileObservationFR31V1 {
  readonly path: string;
  readonly byteLength: number;
  readonly gitBlobSha: string;
  readonly sha256: string;
}

export interface MediaPipeSourceBuildRecipeAttestationFR31V1 {
  readonly schemaVersion: 'fr31-v1';
  readonly evidenceRef: 'evidence.face.mediapipe_source_build_recipe.fr31';
  readonly evidenceVersion: '0.1.0';
  readonly authorityState: 'release_tag_build_recipe_identity_only';
  readonly releaseTagEvidenceRef: 'evidence.face.mediapipe_release_tag_provenance.fr29';
  readonly publishedArtifactEvidenceRef: 'evidence.face.mediapipe_npm_artifact_bytes.fr30';
  readonly sourceIdentity: {
    readonly repository: 'google-ai-edge/mediapipe';
    readonly tagName: 'v0.10.35';
    readonly tagCommitSha: 'f8ef212d5c962c0e853db7e59d217056b187084b';
  };
  readonly measurementWitness: {
    readonly repository: 'gycha0109-beep/MyeongHa';
    readonly workflowRunId: 33155358263;
    readonly checkoutMergeSha: '2bce2bec0170973b423286b9b99d9ebbd6e457ac';
    readonly executionHeadSha: 'a861f9ff347676dff9e9489035d75f61c7d5fb21';
    readonly workflowPath: '.github/workflows/face-reading-source-build-recipe-attestation.yml';
    readonly workflowBlobSha: '89c97698723780e79c178033c7786208c8de89ea';
    readonly harnessPath: 'scripts/face-reading-fr31-source-build-recipe-attestation.mjs';
    readonly harnessBlobSha: '8a000e6cd1f88fe95fc711b1a81163c367b93f6c';
    readonly runnerOs: 'ubuntu-24.04';
    readonly nodeVersion: '24.19.0';
    readonly npmVersion: '11.17.0';
    readonly artifactId: 9679370659;
    readonly artifactArchiveDigest: 'sha256:458b4d8200733e6a4dafa8fc2d3adab7bd2619b6a7000360b262686a54e6eba4';
  };
  readonly sourceFileObservations: readonly MediaPipeSourceFileObservationFR31V1[];
  readonly bazelToolchain: {
    readonly versionFilePath: '.bazelversion';
    readonly versionFileBlobSha: '815da58b7a9ed1179ad6dd58c1ecac25e86fd77e';
    readonly declaredVersion: '7.4.1';
  };
  readonly visionBuildRule: {
    readonly path: 'mediapipe/tasks/web/vision/BUILD';
    readonly blobSha: '0dee1e6153366f79cc9f787900f7b0bcf3c7462a';
    readonly packageTarget: '//mediapipe/tasks/web/vision:vision_pkg';
    readonly packageRule: 'pkg_npm';
    readonly packageName: '@mediapipe/tasks-vision';
    readonly tgzOutput: 'vision_pkg.tgz';
    readonly bundleTargets: readonly ['vision_bundle_mjs', 'vision_bundle_cjs'];
    readonly bundleFormats: readonly ['esm', 'cjs'];
    readonly bundleEntryPoint: 'index.ts';
    readonly bundleSourceOutputs: readonly [
      'vision_bundle.cjs',
      'vision_bundle.cjs.map',
      'vision_bundle.mjs',
      'vision_bundle.mjs.map',
    ];
    readonly wasmInputs: readonly string[];
    readonly explicitPackageDeps: readonly string[];
  };
  readonly rollupRecipe: {
    readonly path: 'mediapipe/tasks/web/rollup.config.mjs';
    readonly blobSha: '6d93653dcdadfe67e6d8a33530982a27c20cbb07';
    readonly treeshake: false;
    readonly plugins: readonly ['resolve', 'commonjs', 'terser'];
  };
  readonly packageTemplate: {
    readonly path: 'mediapipe/tasks/web/package.json';
    readonly blobSha: '6f250cfdfc993effb2b4e3c353dc7ccaf205e2b7';
    readonly nameToken: '__NAME__';
    readonly versionToken: '__VERSION__';
    readonly typeToken: '__TYPES__';
    readonly visionPkgExplicitSubstitutions: readonly ['__NAME__', '__DESCRIPTION__', '__TYPES__'];
    readonly versionTokenExplicitlySubstitutedInVisionPkgRule: false;
    readonly versionStampingProcedureVerified: false;
  };
  readonly javascriptDependencyInputs: {
    readonly rootPackageManifestPath: 'package.json';
    readonly rootPackageManifestBlobSha: '2b799c335a93f3c0a987eaf0e1a0abf8c8c54c51';
    readonly rootManifestUsesSemverRanges: true;
    readonly yarnLockPath: 'yarn.lock';
    readonly yarnLockBlobSha: 'c0268f53100bef8c45c3dd26874732b724b8f768';
    readonly lockfilePresentAtReleaseTag: true;
    readonly exactBuildGraphLockfileConsumptionVerified: false;
  };
  readonly publicationBoundary: {
    readonly githubReleaseId: 314747935;
    readonly githubReleaseImmutable: false;
    readonly githubReleaseAssetsCountObserved: 0;
    readonly releaseAssetsObservationOnlyBecauseMutable: true;
    readonly trustedArtifactToTagBuildAttestationObserved: false;
    readonly tagBuildExecutedByMyeongHa: false;
    readonly typeDeclarationPackagingPathVerified: false;
    readonly rebuiltPackageContentsComparedToPublishedArtifact: false;
    readonly publishedArtifactSourceBuildEquivalenceVerified: false;
  };
  readonly providerConformanceClaimed: false;
  readonly productionProviderActivationAllowed: false;
  readonly anatomicalLateralityResolved: false;
  readonly traditionalSemanticAuthority: false;
}

export interface MediaPipeSourceBuildRecipeReadinessFR31V1 {
  readonly releaseTagBuildRecipeIdentityReady: true;
  readonly independentSourceByteRehashReady: true;
  readonly bazelVersionPinned: true;
  readonly rollupRecipePinned: true;
  readonly npmPackagingTargetPinned: true;
  readonly dependencyLockfilePresencePinned: true;
  readonly versionStampingProcedureReady: false;
  readonly typeDeclarationPackagingProvenanceReady: false;
  readonly reproducibleTagBuildExecutionReady: false;
  readonly publishedArtifactSourceBuildEquivalenceReady: false;
  readonly providerConformanceReady: false;
  readonly productionProviderActivationReady: false;
  readonly anatomicalLateralityReady: false;
  readonly traditionalSemanticAuthorityGranted: false;
  readonly blockers: readonly string[];
}

export const FR31_EXPECTED_WASM_INPUTS = Object.freeze([
  'wasm/vision_wasm_internal.js',
  'wasm/vision_wasm_internal.wasm',
  'wasm/vision_wasm_module_internal.js',
  'wasm/vision_wasm_module_internal.wasm',
  'wasm/vision_wasm_nosimd_internal.js',
  'wasm/vision_wasm_nosimd_internal.wasm',
] as const);

export const FR31_EXPECTED_PACKAGE_DEPS = Object.freeze([
  'wasm/vision_wasm_internal.js',
  'wasm/vision_wasm_internal.wasm',
  'wasm/vision_wasm_module_internal.js',
  'wasm/vision_wasm_module_internal.wasm',
  'wasm/vision_wasm_nosimd_internal.js',
  'wasm/vision_wasm_nosimd_internal.wasm',
  ':package_json',
  ':vision_sources',
] as const);

export const FR31_EXPECTED_SOURCE_FILE_OBSERVATIONS: readonly MediaPipeSourceFileObservationFR31V1[] = Object.freeze([
  Object.freeze({ path: '.bazelversion', byteLength: 6, gitBlobSha: '815da58b7a9ed1179ad6dd58c1ecac25e86fd77e', sha256: 'sha256:910121d8fda1ee513d664110f94bef46c4791698010db514c2a71cc1932bc3cf' }),
  Object.freeze({ path: 'mediapipe/tasks/web/vision/BUILD', byteLength: 3912, gitBlobSha: '0dee1e6153366f79cc9f787900f7b0bcf3c7462a', sha256: 'sha256:bc7e14e557202403611b7ec6a5664354c8c2a85481651758a5b500a158bf1c3d' }),
  Object.freeze({ path: 'mediapipe/tasks/web/rollup.config.mjs', byteLength: 244, gitBlobSha: '6d93653dcdadfe67e6d8a33530982a27c20cbb07', sha256: 'sha256:e5be943fecf6286093553fc751438ecf59a700c68efd1baa54655ca2d96cf534' }),
  Object.freeze({ path: 'mediapipe/tasks/web/package.json', byteLength: 1115, gitBlobSha: '6f250cfdfc993effb2b4e3c353dc7ccaf205e2b7', sha256: 'sha256:d433c89b985d12479ca54bde5851bac0ff6837d9bdb7376efe2063a2d4cfb519' }),
  Object.freeze({ path: 'package.json', byteLength: 764, gitBlobSha: '2b799c335a93f3c0a987eaf0e1a0abf8c8c54c51', sha256: 'sha256:d8bf3f2dc508f15c98a010cc6618c9307c255a704776a736c8c06c1cc9d8de32' }),
  Object.freeze({ path: 'yarn.lock', byteLength: 48825, gitBlobSha: 'c0268f53100bef8c45c3dd26874732b724b8f768', sha256: 'sha256:a5cb1ebadfe1c4fb8601106258ee9d7bea1ab615442d99ce765ab06f1a769a00' }),
]);

export const MEDIAPIPE_SOURCE_BUILD_RECIPE_ATTESTATION_FR31: MediaPipeSourceBuildRecipeAttestationFR31V1 = Object.freeze({
  schemaVersion: 'fr31-v1' as const,
  evidenceRef: 'evidence.face.mediapipe_source_build_recipe.fr31' as const,
  evidenceVersion: '0.1.0' as const,
  authorityState: 'release_tag_build_recipe_identity_only' as const,
  releaseTagEvidenceRef: MEDIAPIPE_RELEASE_TAG_PROVENANCE_FR29.evidenceRef,
  publishedArtifactEvidenceRef: MEDIAPIPE_NPM_ARTIFACT_BYTE_ATTESTATION_FR30.evidenceRef,
  sourceIdentity: Object.freeze({
    repository: 'google-ai-edge/mediapipe' as const,
    tagName: 'v0.10.35' as const,
    tagCommitSha: 'f8ef212d5c962c0e853db7e59d217056b187084b' as const,
  }),
  measurementWitness: Object.freeze({
    repository: 'gycha0109-beep/MyeongHa' as const,
    workflowRunId: 33155358263 as const,
    checkoutMergeSha: '2bce2bec0170973b423286b9b99d9ebbd6e457ac' as const,
    executionHeadSha: 'a861f9ff347676dff9e9489035d75f61c7d5fb21' as const,
    workflowPath: '.github/workflows/face-reading-source-build-recipe-attestation.yml' as const,
    workflowBlobSha: '89c97698723780e79c178033c7786208c8de89ea' as const,
    harnessPath: 'scripts/face-reading-fr31-source-build-recipe-attestation.mjs' as const,
    harnessBlobSha: '8a000e6cd1f88fe95fc711b1a81163c367b93f6c' as const,
    runnerOs: 'ubuntu-24.04' as const,
    nodeVersion: '24.19.0' as const,
    npmVersion: '11.17.0' as const,
    artifactId: 9679370659 as const,
    artifactArchiveDigest: 'sha256:458b4d8200733e6a4dafa8fc2d3adab7bd2619b6a7000360b262686a54e6eba4' as const,
  }),
  sourceFileObservations: FR31_EXPECTED_SOURCE_FILE_OBSERVATIONS,
  bazelToolchain: Object.freeze({
    versionFilePath: '.bazelversion' as const,
    versionFileBlobSha: '815da58b7a9ed1179ad6dd58c1ecac25e86fd77e' as const,
    declaredVersion: '7.4.1' as const,
  }),
  visionBuildRule: Object.freeze({
    path: 'mediapipe/tasks/web/vision/BUILD' as const,
    blobSha: '0dee1e6153366f79cc9f787900f7b0bcf3c7462a' as const,
    packageTarget: '//mediapipe/tasks/web/vision:vision_pkg' as const,
    packageRule: 'pkg_npm' as const,
    packageName: '@mediapipe/tasks-vision' as const,
    tgzOutput: 'vision_pkg.tgz' as const,
    bundleTargets: Object.freeze(['vision_bundle_mjs', 'vision_bundle_cjs'] as const),
    bundleFormats: Object.freeze(['esm', 'cjs'] as const),
    bundleEntryPoint: 'index.ts' as const,
    bundleSourceOutputs: Object.freeze([
      'vision_bundle.cjs',
      'vision_bundle.cjs.map',
      'vision_bundle.mjs',
      'vision_bundle.mjs.map',
    ] as const),
    wasmInputs: FR31_EXPECTED_WASM_INPUTS,
    explicitPackageDeps: FR31_EXPECTED_PACKAGE_DEPS,
  }),
  rollupRecipe: Object.freeze({
    path: 'mediapipe/tasks/web/rollup.config.mjs' as const,
    blobSha: '6d93653dcdadfe67e6d8a33530982a27c20cbb07' as const,
    treeshake: false as const,
    plugins: Object.freeze(['resolve', 'commonjs', 'terser'] as const),
  }),
  packageTemplate: Object.freeze({
    path: 'mediapipe/tasks/web/package.json' as const,
    blobSha: '6f250cfdfc993effb2b4e3c353dc7ccaf205e2b7' as const,
    nameToken: '__NAME__' as const,
    versionToken: '__VERSION__' as const,
    typeToken: '__TYPES__' as const,
    visionPkgExplicitSubstitutions: Object.freeze(['__NAME__', '__DESCRIPTION__', '__TYPES__'] as const),
    versionTokenExplicitlySubstitutedInVisionPkgRule: false as const,
    versionStampingProcedureVerified: false as const,
  }),
  javascriptDependencyInputs: Object.freeze({
    rootPackageManifestPath: 'package.json' as const,
    rootPackageManifestBlobSha: '2b799c335a93f3c0a987eaf0e1a0abf8c8c54c51' as const,
    rootManifestUsesSemverRanges: true as const,
    yarnLockPath: 'yarn.lock' as const,
    yarnLockBlobSha: 'c0268f53100bef8c45c3dd26874732b724b8f768' as const,
    lockfilePresentAtReleaseTag: true as const,
    exactBuildGraphLockfileConsumptionVerified: false as const,
  }),
  publicationBoundary: Object.freeze({
    githubReleaseId: 314747935 as const,
    githubReleaseImmutable: false as const,
    githubReleaseAssetsCountObserved: 0 as const,
    releaseAssetsObservationOnlyBecauseMutable: true as const,
    trustedArtifactToTagBuildAttestationObserved: false as const,
    tagBuildExecutedByMyeongHa: false as const,
    typeDeclarationPackagingPathVerified: false as const,
    rebuiltPackageContentsComparedToPublishedArtifact: false as const,
    publishedArtifactSourceBuildEquivalenceVerified: false as const,
  }),
  providerConformanceClaimed: false as const,
  productionProviderActivationAllowed: false as const,
  anatomicalLateralityResolved: false as const,
  traditionalSemanticAuthority: false as const,
});

const HEX40 = /^[0-9a-f]{40}$/u;
const SHA256 = /^sha256:[0-9a-f]{64}$/u;

function exactStrings(actual: readonly string[], expected: readonly string[], path: string): void {
  if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) {
    throw new FaceAuthorityValidationError(`${path} mismatch.`);
  }
}

function exactGitSha(actual: string, expected: string, path: string): void {
  if (!HEX40.test(actual) || actual !== expected) {
    throw new FaceAuthorityValidationError(`${path} mismatch.`);
  }
}

function exactSourceFiles(
  actual: readonly MediaPipeSourceFileObservationFR31V1[],
  expected: readonly MediaPipeSourceFileObservationFR31V1[],
): void {
  if (actual.length !== expected.length) throw new FaceAuthorityValidationError('FR-31 source file observation count mismatch.');
  actual.forEach((entry, index) => {
    const pinned = expected[index]!;
    if (entry.path !== pinned.path || entry.byteLength !== pinned.byteLength || entry.gitBlobSha !== pinned.gitBlobSha || entry.sha256 !== pinned.sha256 ||
        !HEX40.test(entry.gitBlobSha) || !SHA256.test(entry.sha256) || !Number.isSafeInteger(entry.byteLength) || entry.byteLength <= 0) {
      throw new FaceAuthorityValidationError(`FR-31 source file observation mismatch: ${entry.path}`);
    }
  });
}

export function validateMediaPipeSourceBuildRecipeAttestationFR31(
  evidence: MediaPipeSourceBuildRecipeAttestationFR31V1 = MEDIAPIPE_SOURCE_BUILD_RECIPE_ATTESTATION_FR31,
): MediaPipeSourceBuildRecipeAttestationFR31V1 {
  if (evidence.schemaVersion !== 'fr31-v1' || evidence.evidenceVersion !== '0.1.0' ||
      evidence.authorityState !== 'release_tag_build_recipe_identity_only') {
    throw new FaceAuthorityValidationError('FR-31 evidence schema/version/authority mismatch.');
  }
  if (evidence.releaseTagEvidenceRef !== MEDIAPIPE_RELEASE_TAG_PROVENANCE_FR29.evidenceRef ||
      evidence.publishedArtifactEvidenceRef !== MEDIAPIPE_NPM_ARTIFACT_BYTE_ATTESTATION_FR30.evidenceRef) {
    throw new FaceAuthorityValidationError('FR-31 must remain linked to the FR-29 tag source and FR-30 published artifact evidence.');
  }
  if (evidence.sourceIdentity.repository !== MEDIAPIPE_RELEASE_TAG_PROVENANCE_FR29.officialRelease.repository ||
      evidence.sourceIdentity.tagName !== MEDIAPIPE_RELEASE_TAG_PROVENANCE_FR29.officialRelease.tagName ||
      evidence.sourceIdentity.tagCommitSha !== MEDIAPIPE_RELEASE_TAG_PROVENANCE_FR29.officialRelease.tagCommitSha) {
    throw new FaceAuthorityValidationError('FR-31 release-tag source identity mismatch.');
  }

  if (evidence.measurementWitness.repository !== 'gycha0109-beep/MyeongHa' || evidence.measurementWitness.workflowRunId !== 33155358263 ||
      evidence.measurementWitness.checkoutMergeSha !== '2bce2bec0170973b423286b9b99d9ebbd6e457ac' ||
      evidence.measurementWitness.executionHeadSha !== 'a861f9ff347676dff9e9489035d75f61c7d5fb21' ||
      evidence.measurementWitness.workflowPath !== '.github/workflows/face-reading-source-build-recipe-attestation.yml' ||
      evidence.measurementWitness.workflowBlobSha !== '89c97698723780e79c178033c7786208c8de89ea' ||
      evidence.measurementWitness.harnessPath !== 'scripts/face-reading-fr31-source-build-recipe-attestation.mjs' ||
      evidence.measurementWitness.harnessBlobSha !== '8a000e6cd1f88fe95fc711b1a81163c367b93f6c' ||
      evidence.measurementWitness.runnerOs !== 'ubuntu-24.04' || evidence.measurementWitness.nodeVersion !== '24.19.0' ||
      evidence.measurementWitness.npmVersion !== '11.17.0' || evidence.measurementWitness.artifactId !== 9679370659 ||
      evidence.measurementWitness.artifactArchiveDigest !== 'sha256:458b4d8200733e6a4dafa8fc2d3adab7bd2619b6a7000360b262686a54e6eba4') {
    throw new FaceAuthorityValidationError('FR-31 measurement witness identity mismatch.');
  }

  exactSourceFiles(evidence.sourceFileObservations, FR31_EXPECTED_SOURCE_FILE_OBSERVATIONS);

  exactGitSha(evidence.bazelToolchain.versionFileBlobSha, '815da58b7a9ed1179ad6dd58c1ecac25e86fd77e', 'fr31.bazelToolchain.versionFileBlobSha');
  if (evidence.bazelToolchain.versionFilePath !== '.bazelversion' || evidence.bazelToolchain.declaredVersion !== '7.4.1') {
    throw new FaceAuthorityValidationError('FR-31 Bazel toolchain identity mismatch.');
  }

  exactGitSha(evidence.visionBuildRule.blobSha, '0dee1e6153366f79cc9f787900f7b0bcf3c7462a', 'fr31.visionBuildRule.blobSha');
  if (evidence.visionBuildRule.path !== 'mediapipe/tasks/web/vision/BUILD' ||
      evidence.visionBuildRule.packageTarget !== '//mediapipe/tasks/web/vision:vision_pkg' ||
      evidence.visionBuildRule.packageRule !== 'pkg_npm' || evidence.visionBuildRule.packageName !== '@mediapipe/tasks-vision' ||
      evidence.visionBuildRule.tgzOutput !== 'vision_pkg.tgz' || evidence.visionBuildRule.bundleEntryPoint !== 'index.ts') {
    throw new FaceAuthorityValidationError('FR-31 vision package build rule identity mismatch.');
  }
  exactStrings(evidence.visionBuildRule.bundleTargets, ['vision_bundle_mjs', 'vision_bundle_cjs'], 'fr31.bundleTargets');
  exactStrings(evidence.visionBuildRule.bundleFormats, ['esm', 'cjs'], 'fr31.bundleFormats');
  exactStrings(evidence.visionBuildRule.bundleSourceOutputs,
    ['vision_bundle.cjs', 'vision_bundle.cjs.map', 'vision_bundle.mjs', 'vision_bundle.mjs.map'], 'fr31.bundleSourceOutputs');
  exactStrings(evidence.visionBuildRule.wasmInputs, FR31_EXPECTED_WASM_INPUTS, 'fr31.wasmInputs');
  exactStrings(evidence.visionBuildRule.explicitPackageDeps, FR31_EXPECTED_PACKAGE_DEPS, 'fr31.explicitPackageDeps');

  exactGitSha(evidence.rollupRecipe.blobSha, '6d93653dcdadfe67e6d8a33530982a27c20cbb07', 'fr31.rollupRecipe.blobSha');
  if (evidence.rollupRecipe.path !== 'mediapipe/tasks/web/rollup.config.mjs' || evidence.rollupRecipe.treeshake !== false) {
    throw new FaceAuthorityValidationError('FR-31 Rollup recipe identity mismatch.');
  }
  exactStrings(evidence.rollupRecipe.plugins, ['resolve', 'commonjs', 'terser'], 'fr31.rollupRecipe.plugins');

  exactGitSha(evidence.packageTemplate.blobSha, '6f250cfdfc993effb2b4e3c353dc7ccaf205e2b7', 'fr31.packageTemplate.blobSha');
  if (evidence.packageTemplate.path !== 'mediapipe/tasks/web/package.json' || evidence.packageTemplate.nameToken !== '__NAME__' ||
      evidence.packageTemplate.versionToken !== '__VERSION__' || evidence.packageTemplate.typeToken !== '__TYPES__' ||
      evidence.packageTemplate.versionTokenExplicitlySubstitutedInVisionPkgRule !== false ||
      evidence.packageTemplate.versionStampingProcedureVerified !== false) {
    throw new FaceAuthorityValidationError('FR-31 package template/version-stamping boundary mismatch.');
  }
  exactStrings(evidence.packageTemplate.visionPkgExplicitSubstitutions,
    ['__NAME__', '__DESCRIPTION__', '__TYPES__'], 'fr31.visionPkgExplicitSubstitutions');

  exactGitSha(evidence.javascriptDependencyInputs.rootPackageManifestBlobSha,
    '2b799c335a93f3c0a987eaf0e1a0abf8c8c54c51', 'fr31.javascriptDependencyInputs.rootPackageManifestBlobSha');
  exactGitSha(evidence.javascriptDependencyInputs.yarnLockBlobSha,
    'c0268f53100bef8c45c3dd26874732b724b8f768', 'fr31.javascriptDependencyInputs.yarnLockBlobSha');
  if (evidence.javascriptDependencyInputs.rootPackageManifestPath !== 'package.json' ||
      evidence.javascriptDependencyInputs.rootManifestUsesSemverRanges !== true ||
      evidence.javascriptDependencyInputs.yarnLockPath !== 'yarn.lock' ||
      evidence.javascriptDependencyInputs.lockfilePresentAtReleaseTag !== true ||
      evidence.javascriptDependencyInputs.exactBuildGraphLockfileConsumptionVerified !== false) {
    throw new FaceAuthorityValidationError('FR-31 JavaScript dependency-input boundary mismatch.');
  }

  if (evidence.publicationBoundary.githubReleaseId !== MEDIAPIPE_RELEASE_TAG_PROVENANCE_FR29.officialRelease.releaseId ||
      evidence.publicationBoundary.githubReleaseImmutable !== false || evidence.publicationBoundary.githubReleaseAssetsCountObserved !== 0 ||
      evidence.publicationBoundary.releaseAssetsObservationOnlyBecauseMutable !== true ||
      evidence.publicationBoundary.trustedArtifactToTagBuildAttestationObserved !== false ||
      evidence.publicationBoundary.tagBuildExecutedByMyeongHa !== false ||
      evidence.publicationBoundary.typeDeclarationPackagingPathVerified !== false ||
      evidence.publicationBoundary.rebuiltPackageContentsComparedToPublishedArtifact !== false ||
      evidence.publicationBoundary.publishedArtifactSourceBuildEquivalenceVerified !== false) {
    throw new FaceAuthorityValidationError('FR-31 build recipe identity must not be promoted to source/build equivalence.');
  }

  if (evidence.providerConformanceClaimed !== false || evidence.productionProviderActivationAllowed !== false ||
      evidence.anatomicalLateralityResolved !== false || evidence.traditionalSemanticAuthority !== false) {
    throw new FaceAuthorityValidationError('FR-31 cannot promote provider conformance, production activation, anatomical laterality, or traditional semantics.');
  }
  return evidence;
}

export function assessMediaPipeSourceBuildRecipeFR31(): MediaPipeSourceBuildRecipeReadinessFR31V1 {
  validateMediaPipeSourceBuildRecipeAttestationFR31();
  return Object.freeze({
    releaseTagBuildRecipeIdentityReady: true as const,
    independentSourceByteRehashReady: true as const,
    bazelVersionPinned: true as const,
    rollupRecipePinned: true as const,
    npmPackagingTargetPinned: true as const,
    dependencyLockfilePresencePinned: true as const,
    versionStampingProcedureReady: false as const,
    typeDeclarationPackagingProvenanceReady: false as const,
    reproducibleTagBuildExecutionReady: false as const,
    publishedArtifactSourceBuildEquivalenceReady: false as const,
    providerConformanceReady: false as const,
    productionProviderActivationReady: false as const,
    anatomicalLateralityReady: false as const,
    traditionalSemanticAuthorityGranted: false as const,
    blockers: Object.freeze([
      'The v0.10.35 vision_pkg rule does not explicitly substitute the package template __VERSION__ token; the release version-stamping procedure is not yet verified.',
      'The inspected vision_pkg dependency list does not by itself establish the complete vision.d.ts packaging provenance.',
      'A yarn.lock exists at the release tag, but FR-31 does not claim that the exact release build consumed that lockfile through a verified build graph.',
      'MyeongHa has not executed the v0.10.35 vision_pkg build and compared rebuilt package contents to the FR-30 published artifact bytes.',
      'The GitHub release was mutable at the FR-31 measurement witness; zero release assets is an observed state, not a permanent invariant or artifact-to-tag attestation.',
      'FR-22 implementation registry and FR-23 reviewed conformance evidence remain unpopulated.',
      'Provider left/right remains non-anatomical for uncontrolled uploads, and no traditional physiognomy semantic authority is granted by build provenance.',
    ]),
  });
}
