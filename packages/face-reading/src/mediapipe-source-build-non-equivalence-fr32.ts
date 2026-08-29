import {
  FR30_EXPECTED_PUBLISHED_PACKAGE_FILES,
  MEDIAPIPE_NPM_ARTIFACT_BYTE_ATTESTATION_FR30,
} from './mediapipe-npm-artifact-byte-attestation-fr30.js';
import { MEDIAPIPE_SOURCE_BUILD_RECIPE_ATTESTATION_FR31 } from './mediapipe-source-build-recipe-attestation-fr31.js';
import { FaceAuthorityValidationError } from './validation.js';

export interface MediaPipeSourceBuildFileComparisonFR32V1 {
  readonly sourcePath: string;
  readonly publishedPath: string;
  readonly sourceByteLength: number;
  readonly sourceSha256: string;
  readonly publishedByteLength: number;
  readonly publishedSha256: string;
  readonly sha256Equal: false;
  readonly byteLengthEqual: false;
}

export interface MediaPipeSourceBuildNonEquivalenceFR32V1 {
  readonly schemaVersion: 'fr32-v1';
  readonly evidenceRef: 'evidence.face.mediapipe_source_build_non_equivalence.fr32';
  readonly evidenceVersion: '0.1.0';
  readonly authorityState: 'public_release_tag_target_measured_non_equivalence_only';
  readonly sourceRecipeEvidenceRef: 'evidence.face.mediapipe_source_build_recipe.fr31';
  readonly publishedArtifactEvidenceRef: 'evidence.face.mediapipe_npm_artifact_bytes.fr30';
  readonly sourceBuildRecipe: {
    readonly repository: 'google-ai-edge/mediapipe';
    readonly tagName: 'v0.10.35';
    readonly sourceCommitSha: 'f8ef212d5c962c0e853db7e59d217056b187084b';
    readonly bazelVersion: '7.4.1';
    readonly packageTarget: '//mediapipe/tasks/web/vision:vision_pkg';
    readonly archiveTarget: '//mediapipe/tasks/web/vision:vision_pkg.tar';
    readonly archiveTargetOrigin: 'rules_nodejs_pkg_npm_tgz_genrule';
    readonly rulesNodejsVersion: '5.8.5';
    readonly declaredArchiveOutput: 'vision_pkg.tgz';
  };
  readonly measurementWitness: {
    readonly repository: 'gycha0109-beep/MyeongHa';
    readonly attempted: true;
    readonly completed: true;
    readonly buildCompleted: true;
    readonly packageMeasured: true;
    readonly workflowRunId: 33238225619;
    readonly workflowRunNumber: 16;
    readonly workflowJobId: 99062895346;
    readonly executionHeadSha: 'c8211facf161a236ddd978dc9f5c2b830d969dba';
    readonly workflowPath: '.github/workflows/face-reading-source-reproducible-build-probe.yml';
    readonly workflowBlobSha: '3b370ce0cc31a792e61eca786ec136cb81ec0e5b';
    readonly harnessPath: 'scripts/face-reading-fr32-mediapipe-source-build-non-equivalence.mjs';
    readonly harnessBlobSha: '6d3478c96257fe1ff1cef85e334d6b1106217055';
    readonly artifactId: 9710656864;
    readonly artifactArchiveDigest: 'sha256:ae16a02bb42c8829510b53244cf3940c2795383ac1e133cbc098ae88728228f2';
    readonly measuredAt: '2026-08-28T23:29:07.697Z';
  };
  readonly sourcePackage: {
    readonly packageName: '@mediapipe/tasks-vision';
    readonly packageJsonVersion: '__VERSION__';
    readonly packageJsonVersionIsUnresolvedTemplate: true;
    readonly archiveEntryCount: 12;
    readonly visionDtsPresent: false;
  };
  readonly publishedPackage: {
    readonly packageName: '@mediapipe/tasks-vision';
    readonly packageJsonVersion: '0.10.35';
    readonly packageJsonVersionIsUnresolvedTemplate: false;
    readonly tarballUrl: 'https://registry.npmjs.org/@mediapipe/tasks-vision/-/tasks-vision-0.10.35.tgz';
    readonly tarballByteLength: 10231005;
    readonly tarballSha256: 'sha256:84597a25e13d123b5f4cbe768bb72e97a2c28c7a465f0ace287d8cbe5246bff0';
    readonly visionDtsPresent: true;
  };
  readonly fileComparisons: readonly MediaPipeSourceBuildFileComparisonFR32V1[];
  readonly allSixWasmSha256Differ: true;
  readonly allSixWasmByteLengthsDiffer: true;
  readonly bothBundleSha256Differ: true;
  readonly publicTagTargetPublishedArtifactByteEquivalent: false;
  readonly nonEquivalenceVerified: true;
  readonly publishedReleaseProcessIdentified: false;
  readonly providerConformanceClaimed: false;
  readonly productionProviderActivationAllowed: false;
  readonly anatomicalLateralityResolved: false;
  readonly traditionalSemanticAuthority: false;
}

export const FR32_EXPECTED_FILE_COMPARISONS: readonly MediaPipeSourceBuildFileComparisonFR32V1[] = Object.freeze([
  Object.freeze({ sourcePath: 'package/vision_bundle.cjs', publishedPath: 'package/vision_bundle.cjs', sourceByteLength: 137898, sourceSha256: 'sha256:a64bdc609e896baa15a664db18d49002173951296761a85ac2c9496a6b511f72', publishedByteLength: 137566, publishedSha256: 'sha256:7fba4f9807297e229371318df577e96fc9f1b3d93e79075e3798ade2fc790c9e', sha256Equal: false as const, byteLengthEqual: false as const }),
  Object.freeze({ sourcePath: 'package/vision_bundle.mjs', publishedPath: 'package/vision_bundle.mjs', sourceByteLength: 137324, sourceSha256: 'sha256:d3403bbcca6abd841f09e6cac5fc4a1f81faf3d984a1a407eb0b0f8a45f22d44', publishedByteLength: 136993, publishedSha256: 'sha256:55d7ab624fbb70dcc5adc4ae6d7ea9cfcb569139d3dbfbf2b1deafcb966bc0fe', sha256Equal: false as const, byteLengthEqual: false as const }),
  Object.freeze({ sourcePath: 'package/wasm/vision_wasm_internal.js', publishedPath: 'package/wasm/vision_wasm_internal.js', sourceByteLength: 322467, sourceSha256: 'sha256:b69007656557a0bbe44c9c73d6f23a9fac6465c4918711626cf5596ed0814ed7', publishedByteLength: 322044, publishedSha256: 'sha256:e7fd9858e8e8f221d9b96eddc11f8e077f263e0b7bbd79d3cbe882b134274f8c', sha256Equal: false as const, byteLengthEqual: false as const }),
  Object.freeze({ sourcePath: 'package/wasm/vision_wasm_internal.wasm', publishedPath: 'package/wasm/vision_wasm_internal.wasm', sourceByteLength: 13186311, sourceSha256: 'sha256:e21b02c629886979772701d9a68a5b4ba600282fea1a25249e0538107e819aa0', publishedByteLength: 11153617, publishedSha256: 'sha256:6a5c64584c2ab61c763b6e204afbdbc7ce1caf7f5216187322bca8df94f646bc', sha256Equal: false as const, byteLengthEqual: false as const }),
  Object.freeze({ sourcePath: 'package/wasm/vision_wasm_module_internal.js', publishedPath: 'package/wasm/vision_wasm_module_internal.js', sourceByteLength: 322505, sourceSha256: 'sha256:67fea4769a57678c53c27d7595fe9b9fc0e6218305077ed0abdf4cef8dfd984f', publishedByteLength: 322082, publishedSha256: 'sha256:1f1d6215324a1fe62f6742d49a3db911170987ca18ad8c1b75f1a1c82acf2b44', sha256Equal: false as const, byteLengthEqual: false as const }),
  Object.freeze({ sourcePath: 'package/wasm/vision_wasm_module_internal.wasm', publishedPath: 'package/wasm/vision_wasm_module_internal.wasm', sourceByteLength: 13186335, sourceSha256: 'sha256:09c27fc5c4ad2428d8d1ffc754a3e72045abf60e8ec2e2173a73132254b43f69', publishedByteLength: 11153641, publishedSha256: 'sha256:617b8e0248dbd27e9d7ece4218004eae4cefb499196d1bb4fa0e3fef21708756', sha256Equal: false as const, byteLengthEqual: false as const }),
  Object.freeze({ sourcePath: 'package/wasm/vision_wasm_nosimd_internal.js', publishedPath: 'package/wasm/vision_wasm_nosimd_internal.js', sourceByteLength: 322273, sourceSha256: 'sha256:99fb7de1389dc57478d532dc23b909b0442d7e1968b8eaa0011a910bf442aebb', publishedByteLength: 321847, publishedSha256: 'sha256:438d1fe8ff7f4d946025bc211c291543c037d8a3785ed4eee60f1f521b236296', sha256Equal: false as const, byteLengthEqual: false as const }),
  Object.freeze({ sourcePath: 'package/wasm/vision_wasm_nosimd_internal.wasm', publishedPath: 'package/wasm/vision_wasm_nosimd_internal.wasm', sourceByteLength: 12528421, sourceSha256: 'sha256:bea9203065928ac962ed58a99b6119a6487b1f82c7ae0c935b81370be2b7e453', publishedByteLength: 10481398, publishedSha256: 'sha256:8a3092d34c79d3f57e6ba8592105e8a90f6b07c27891ffecd14cca428bfd3e31', sha256Equal: false as const, byteLengthEqual: false as const }),
]);

export const MEDIAPIPE_SOURCE_BUILD_NON_EQUIVALENCE_FR32: MediaPipeSourceBuildNonEquivalenceFR32V1 = Object.freeze({
  schemaVersion: 'fr32-v1' as const,
  evidenceRef: 'evidence.face.mediapipe_source_build_non_equivalence.fr32' as const,
  evidenceVersion: '0.1.0' as const,
  authorityState: 'public_release_tag_target_measured_non_equivalence_only' as const,
  sourceRecipeEvidenceRef: MEDIAPIPE_SOURCE_BUILD_RECIPE_ATTESTATION_FR31.evidenceRef,
  publishedArtifactEvidenceRef: MEDIAPIPE_NPM_ARTIFACT_BYTE_ATTESTATION_FR30.evidenceRef,
  sourceBuildRecipe: Object.freeze({
    repository: 'google-ai-edge/mediapipe' as const,
    tagName: 'v0.10.35' as const,
    sourceCommitSha: 'f8ef212d5c962c0e853db7e59d217056b187084b' as const,
    bazelVersion: '7.4.1' as const,
    packageTarget: '//mediapipe/tasks/web/vision:vision_pkg' as const,
    archiveTarget: '//mediapipe/tasks/web/vision:vision_pkg.tar' as const,
    archiveTargetOrigin: 'rules_nodejs_pkg_npm_tgz_genrule' as const,
    rulesNodejsVersion: '5.8.5' as const,
    declaredArchiveOutput: 'vision_pkg.tgz' as const,
  }),
  measurementWitness: Object.freeze({
    repository: 'gycha0109-beep/MyeongHa' as const,
    attempted: true as const,
    completed: true as const,
    buildCompleted: true as const,
    packageMeasured: true as const,
    workflowRunId: 33238225619 as const,
    workflowRunNumber: 16 as const,
    workflowJobId: 99062895346 as const,
    executionHeadSha: 'c8211facf161a236ddd978dc9f5c2b830d969dba' as const,
    workflowPath: '.github/workflows/face-reading-source-reproducible-build-probe.yml' as const,
    workflowBlobSha: '3b370ce0cc31a792e61eca786ec136cb81ec0e5b' as const,
    harnessPath: 'scripts/face-reading-fr32-mediapipe-source-build-non-equivalence.mjs' as const,
    harnessBlobSha: '6d3478c96257fe1ff1cef85e334d6b1106217055' as const,
    artifactId: 9710656864 as const,
    artifactArchiveDigest: 'sha256:ae16a02bb42c8829510b53244cf3940c2795383ac1e133cbc098ae88728228f2' as const,
    measuredAt: '2026-08-28T23:29:07.697Z' as const,
  }),
  sourcePackage: Object.freeze({ packageName: '@mediapipe/tasks-vision' as const, packageJsonVersion: '__VERSION__' as const, packageJsonVersionIsUnresolvedTemplate: true as const, archiveEntryCount: 12 as const, visionDtsPresent: false as const }),
  publishedPackage: Object.freeze({ packageName: '@mediapipe/tasks-vision' as const, packageJsonVersion: '0.10.35' as const, packageJsonVersionIsUnresolvedTemplate: false as const, tarballUrl: 'https://registry.npmjs.org/@mediapipe/tasks-vision/-/tasks-vision-0.10.35.tgz' as const, tarballByteLength: 10231005 as const, tarballSha256: 'sha256:84597a25e13d123b5f4cbe768bb72e97a2c28c7a465f0ace287d8cbe5246bff0' as const, visionDtsPresent: true as const }),
  fileComparisons: FR32_EXPECTED_FILE_COMPARISONS,
  allSixWasmSha256Differ: true as const,
  allSixWasmByteLengthsDiffer: true as const,
  bothBundleSha256Differ: true as const,
  publicTagTargetPublishedArtifactByteEquivalent: false as const,
  nonEquivalenceVerified: true as const,
  publishedReleaseProcessIdentified: false as const,
  providerConformanceClaimed: false as const,
  productionProviderActivationAllowed: false as const,
  anatomicalLateralityResolved: false as const,
  traditionalSemanticAuthority: false as const,
});

const SHA256 = /^sha256:[0-9a-f]{64}$/u;
const HEX40 = /^[0-9a-f]{40}$/u;

function fail(message: string): never {
  throw new FaceAuthorityValidationError(message);
}

function validateComparisons(actual: readonly MediaPipeSourceBuildFileComparisonFR32V1[]): void {
  if (actual.length !== FR32_EXPECTED_FILE_COMPARISONS.length) fail('FR-32 file comparison count must remain exactly pinned.');
  const publishedByPath = new Map(FR30_EXPECTED_PUBLISHED_PACKAGE_FILES.map((entry) => [entry.path, entry] as const));
  actual.forEach((entry, index) => {
    const expected = FR32_EXPECTED_FILE_COMPARISONS[index]!;
    if (entry.sourcePath !== expected.sourcePath || entry.publishedPath !== expected.publishedPath || entry.sourceByteLength !== expected.sourceByteLength || entry.sourceSha256 !== expected.sourceSha256 || entry.publishedByteLength !== expected.publishedByteLength || entry.publishedSha256 !== expected.publishedSha256 || entry.sha256Equal !== false || entry.byteLengthEqual !== false) fail(`FR-32 file comparison mismatch: ${entry.sourcePath}`);
    if (!Number.isSafeInteger(entry.sourceByteLength) || entry.sourceByteLength <= 0 || !Number.isSafeInteger(entry.publishedByteLength) || entry.publishedByteLength <= 0 || !SHA256.test(entry.sourceSha256) || !SHA256.test(entry.publishedSha256) || entry.sourceSha256 === entry.publishedSha256 || entry.sourceByteLength === entry.publishedByteLength) fail(`FR-32 measured file evidence is malformed or equivalent: ${entry.sourcePath}`);
    const fr30 = publishedByPath.get(entry.publishedPath.replace(/^package\//u, ''));
    if (!fr30 || fr30.byteLength !== entry.publishedByteLength || fr30.sha256 !== entry.publishedSha256) fail(`FR-32 published comparison must remain aligned to FR-30: ${entry.publishedPath}`);
  });
}

export function validateMediaPipeSourceBuildNonEquivalenceFR32(evidence: MediaPipeSourceBuildNonEquivalenceFR32V1 = MEDIAPIPE_SOURCE_BUILD_NON_EQUIVALENCE_FR32): MediaPipeSourceBuildNonEquivalenceFR32V1 {
  if (evidence.schemaVersion !== 'fr32-v1' || evidence.evidenceVersion !== '0.1.0' || evidence.evidenceRef !== 'evidence.face.mediapipe_source_build_non_equivalence.fr32' || evidence.authorityState !== 'public_release_tag_target_measured_non_equivalence_only') fail('FR-32 evidence identity or authority state mismatch.');
  if (evidence.sourceRecipeEvidenceRef !== MEDIAPIPE_SOURCE_BUILD_RECIPE_ATTESTATION_FR31.evidenceRef || evidence.publishedArtifactEvidenceRef !== MEDIAPIPE_NPM_ARTIFACT_BYTE_ATTESTATION_FR30.evidenceRef) fail('FR-32 authority references must remain aligned to FR-31 and FR-30.');

  const recipe = evidence.sourceBuildRecipe;
  if (recipe.repository !== 'google-ai-edge/mediapipe' || recipe.tagName !== 'v0.10.35' || recipe.sourceCommitSha !== 'f8ef212d5c962c0e853db7e59d217056b187084b' || recipe.bazelVersion !== '7.4.1' || recipe.packageTarget !== '//mediapipe/tasks/web/vision:vision_pkg' || recipe.archiveTarget !== '//mediapipe/tasks/web/vision:vision_pkg.tar' || recipe.archiveTargetOrigin !== 'rules_nodejs_pkg_npm_tgz_genrule' || recipe.rulesNodejsVersion !== '5.8.5' || recipe.declaredArchiveOutput !== 'vision_pkg.tgz') fail('FR-32 source build recipe must remain exactly pinned.');
  if (recipe.repository !== MEDIAPIPE_SOURCE_BUILD_RECIPE_ATTESTATION_FR31.sourceIdentity.repository || recipe.tagName !== MEDIAPIPE_SOURCE_BUILD_RECIPE_ATTESTATION_FR31.sourceIdentity.tagName || recipe.sourceCommitSha !== MEDIAPIPE_SOURCE_BUILD_RECIPE_ATTESTATION_FR31.sourceIdentity.tagCommitSha || recipe.bazelVersion !== MEDIAPIPE_SOURCE_BUILD_RECIPE_ATTESTATION_FR31.bazelToolchain.declaredVersion || recipe.packageTarget !== MEDIAPIPE_SOURCE_BUILD_RECIPE_ATTESTATION_FR31.visionBuildRule.packageTarget || recipe.declaredArchiveOutput !== MEDIAPIPE_SOURCE_BUILD_RECIPE_ATTESTATION_FR31.visionBuildRule.tgzOutput) fail('FR-32 source recipe must remain aligned to FR-31.');

  const witness = evidence.measurementWitness;
  if (!HEX40.test(witness.executionHeadSha) || !HEX40.test(witness.workflowBlobSha) || !HEX40.test(witness.harnessBlobSha) || !SHA256.test(witness.artifactArchiveDigest)) fail('FR-32 measurement witness identity is malformed.');
  if (witness.repository !== 'gycha0109-beep/MyeongHa' || witness.attempted !== true || witness.completed !== true || witness.buildCompleted !== true || witness.packageMeasured !== true || witness.workflowRunId !== 33238225619 || witness.workflowRunNumber !== 16 || witness.workflowJobId !== 99062895346 || witness.executionHeadSha !== 'c8211facf161a236ddd978dc9f5c2b830d969dba' || witness.workflowPath !== '.github/workflows/face-reading-source-reproducible-build-probe.yml' || witness.workflowBlobSha !== '3b370ce0cc31a792e61eca786ec136cb81ec0e5b' || witness.harnessPath !== 'scripts/face-reading-fr32-mediapipe-source-build-non-equivalence.mjs' || witness.harnessBlobSha !== '6d3478c96257fe1ff1cef85e334d6b1106217055' || witness.artifactId !== 9710656864 || witness.artifactArchiveDigest !== 'sha256:ae16a02bb42c8829510b53244cf3940c2795383ac1e133cbc098ae88728228f2' || witness.measuredAt !== '2026-08-28T23:29:07.697Z') fail('FR-32 successful measurement witness must remain exactly pinned.');

  if (evidence.sourcePackage.packageName !== '@mediapipe/tasks-vision' || evidence.sourcePackage.packageJsonVersion !== '__VERSION__' || evidence.sourcePackage.packageJsonVersionIsUnresolvedTemplate !== true || evidence.sourcePackage.archiveEntryCount !== 12 || evidence.sourcePackage.visionDtsPresent !== false) fail('FR-32 source-built package observation must remain exactly pinned.');
  const published = evidence.publishedPackage;
  if (published.packageName !== MEDIAPIPE_NPM_ARTIFACT_BYTE_ATTESTATION_FR30.packageIdentity.packageName || published.packageJsonVersion !== MEDIAPIPE_NPM_ARTIFACT_BYTE_ATTESTATION_FR30.packageIdentity.packageVersion || published.packageJsonVersionIsUnresolvedTemplate !== false || published.tarballUrl !== MEDIAPIPE_NPM_ARTIFACT_BYTE_ATTESTATION_FR30.packageIdentity.tarballUrl || published.tarballByteLength !== MEDIAPIPE_NPM_ARTIFACT_BYTE_ATTESTATION_FR30.tarball.byteLength || published.tarballSha256 !== MEDIAPIPE_NPM_ARTIFACT_BYTE_ATTESTATION_FR30.tarball.sha256 || published.visionDtsPresent !== true) fail('FR-32 published package observation must remain aligned to FR-30.');

  validateComparisons(evidence.fileComparisons);
  const wasm = evidence.fileComparisons.filter((entry) => entry.sourcePath.startsWith('package/wasm/'));
  const bundles = evidence.fileComparisons.filter((entry) => entry.sourcePath === 'package/vision_bundle.cjs' || entry.sourcePath === 'package/vision_bundle.mjs');
  if (wasm.length !== 6 || bundles.length !== 2 || !wasm.every((entry) => !entry.sha256Equal && !entry.byteLengthEqual) || !bundles.every((entry) => !entry.sha256Equal) || evidence.allSixWasmSha256Differ !== true || evidence.allSixWasmByteLengthsDiffer !== true || evidence.bothBundleSha256Differ !== true || evidence.publicTagTargetPublishedArtifactByteEquivalent !== false || evidence.nonEquivalenceVerified !== true) fail('FR-32 non-equivalence proof must remain exactly supported by measured comparisons.');
  if (evidence.publishedReleaseProcessIdentified !== false || evidence.providerConformanceClaimed !== false || evidence.productionProviderActivationAllowed !== false || evidence.anatomicalLateralityResolved !== false || evidence.traditionalSemanticAuthority !== false) fail('FR-32 non-equivalence evidence cannot promote release-process, provider, production, laterality, or traditional-semantic authority.');
  return evidence;
}

export function assessMediaPipeSourceBuildNonEquivalenceFR32(evidence: MediaPipeSourceBuildNonEquivalenceFR32V1 = MEDIAPIPE_SOURCE_BUILD_NON_EQUIVALENCE_FR32) {
  validateMediaPipeSourceBuildNonEquivalenceFR32(evidence);
  return Object.freeze({
    publicArchiveTargetBuildReady: true as const,
    sourcePackageMeasurementReady: true as const,
    publishedArtifactComparisonReady: true as const,
    publicTargetNonEquivalenceReady: true as const,
    publishedReleaseProcessReady: false as const,
    providerConformanceReady: false as const,
    productionProviderActivationReady: false as const,
    anatomicalLateralityReady: false as const,
    traditionalSemanticAuthorityGranted: false as const,
    blockers: Object.freeze([
      'The successful public release-tag archive build is not byte-equivalent to the published npm 0.10.35 artifact; the actual npm publication build and stamping process remains unidentified.',
      'FR-32 grants no provider conformance, production activation, anatomical laterality, or traditional physiognomy semantic authority.',
    ]),
  });
}
