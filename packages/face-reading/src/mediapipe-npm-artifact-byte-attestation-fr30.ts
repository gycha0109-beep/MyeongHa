import {
  FR27_EXPECTED_INSTALLED_WASM_DIGESTS,
  MEDIAPIPE_REAL_RUNTIME_VERIFICATION_EVIDENCE_FR27,
} from './mediapipe-real-runtime-evidence-fr27.js';
import { MEDIAPIPE_RELEASE_TAG_PROVENANCE_FR29 } from './mediapipe-release-tag-provenance-fr29.js';
import { PROVIDER_RELEASE_ATTESTATION_FR18 } from './provider-release-attestation-fr18.js';
import { FaceAuthorityValidationError } from './validation.js';

export interface MediaPipePublishedArtifactFileFR30V1 {
  readonly path: string;
  readonly byteLength: number;
  readonly sha256: string;
  readonly installedByteIdentical: true;
}

export interface MediaPipeNpmArtifactByteAttestationFR30V1 {
  readonly schemaVersion: 'fr30-v1';
  readonly evidenceRef: 'evidence.face.mediapipe_npm_artifact_bytes.fr30';
  readonly evidenceVersion: '0.1.0';
  readonly authorityState: 'published_npm_artifact_byte_identity_only';
  readonly packageIdentity: {
    readonly packageName: '@mediapipe/tasks-vision';
    readonly packageVersion: '0.10.35';
    readonly tarballUrl: 'https://registry.npmjs.org/@mediapipe/tasks-vision/-/tasks-vision-0.10.35.tgz';
    readonly lockfileSri: string;
  };
  readonly measurementWitness: {
    readonly repository: 'gycha0109-beep/MyeongHa';
    readonly workflowRunId: 33152948600;
    readonly checkoutMergeSha: '4ed68080d6a569797f8284ae270dd28224bd40ed';
    readonly executionHeadSha: '4a633a810537e0f7ca955470fc0bfd81a95731f5';
    readonly workflowPath: '.github/workflows/face-reading-npm-artifact-byte-attestation.yml';
    readonly workflowBlobSha: '37f62fc7fee0775955fc1fa93917d90b127c8d14';
    readonly harnessPath: 'scripts/face-reading-fr30-npm-artifact-byte-attestation.mjs';
    readonly harnessBlobSha: 'db768e3594266e4b5a67ddadd79c14595729bb07';
    readonly runnerOs: 'ubuntu-24.04';
    readonly nodeVersion: '24.19.0';
    readonly npmVersion: '11.17.0';
    readonly artifactId: 9678441675;
    readonly artifactArchiveDigest: 'sha256:72cfee05a5919fa48c34c9fbcb3784982ddaf2a159610651026a6cfbd7e7e369';
  };
  readonly tarball: {
    readonly byteLength: 10231005;
    readonly sha512Sri: string;
    readonly sha512Hex: '1cebda77055113a242fb8e67c988669f2c27af987f27c299bce794355386f6aff4f3be6966022dce7141f5b453bcb736eb861226a899d4db08a424ad270fde82';
    readonly sha256: 'sha256:84597a25e13d123b5f4cbe768bb72e97a2c28c7a465f0ace287d8cbe5246bff0';
    readonly independentlyFetchedAndRehashed: true;
    readonly lockfileSriMatched: true;
  };
  readonly archive: {
    readonly entryCount: 13;
    readonly sortedEntriesSha256: 'sha256:c9f26f4d68b9099272d6b2caca5b9658e5b7f2e06654af513b83bd32ae895d2f';
  };
  readonly packageMetadata: {
    readonly main: 'vision_bundle.cjs';
    readonly browser: 'vision_bundle.mjs';
    readonly module: 'vision_bundle.mjs';
    readonly types: 'vision.d.ts';
    readonly repositoryFieldObserved: false;
    readonly gitHeadFieldObserved: false;
  };
  readonly selectedFiles: readonly MediaPipePublishedArtifactFileFR30V1[];
  readonly allSelectedFilesByteIdenticalToInstalledPackage: true;
  readonly runtimeBundleByteIdenticalToFR27InstalledEvidence: true;
  readonly wasmBytesByteIdenticalToFR27InstalledEvidence: true;
  readonly releaseTagSourceIdentityRef: 'evidence.face.mediapipe_release_tag_provenance.fr29';
  readonly sourceOrBuildEquivalenceToReleaseTagVerified: false;
  readonly providerConformanceClaimed: false;
  readonly productionProviderActivationAllowed: false;
  readonly anatomicalLateralityResolved: false;
  readonly traditionalSemanticAuthority: false;
}

export interface MediaPipeNpmArtifactByteAttestationReadinessFR30V1 {
  readonly publishedTarballByteIdentityReady: true;
  readonly lockfileSriIndependentRehashReady: true;
  readonly installedRuntimeAssetLinkReady: true;
  readonly releaseTagSourceIdentityAvailable: true;
  readonly publishedArtifactSourceBuildEquivalenceReady: false;
  readonly providerConformanceReady: false;
  readonly productionProviderActivationReady: false;
  readonly anatomicalLateralityReady: false;
  readonly traditionalSemanticAuthorityGranted: false;
  readonly blockers: readonly string[];
}

export const FR30_EXPECTED_PUBLISHED_PACKAGE_FILES: readonly MediaPipePublishedArtifactFileFR30V1[] = Object.freeze([
  Object.freeze({ path: 'package.json', byteLength: 1084, sha256: 'sha256:5c96247445e57a2d087758114b116fed7d46eb401342aee19b1acc56d36fe707', installedByteIdentical: true as const }),
  Object.freeze({ path: 'vision_bundle.mjs', byteLength: 136993, sha256: 'sha256:55d7ab624fbb70dcc5adc4ae6d7ea9cfcb569139d3dbfbf2b1deafcb966bc0fe', installedByteIdentical: true as const }),
  Object.freeze({ path: 'vision_bundle.cjs', byteLength: 137566, sha256: 'sha256:7fba4f9807297e229371318df577e96fc9f1b3d93e79075e3798ade2fc790c9e', installedByteIdentical: true as const }),
  Object.freeze({ path: 'vision.d.ts', byteLength: 116918, sha256: 'sha256:3825dba564fc06720dc0934b72a22711ac6b7491ae8662e573ac205699ea016b', installedByteIdentical: true as const }),
  Object.freeze({ path: 'wasm/vision_wasm_internal.js', byteLength: 322044, sha256: 'sha256:e7fd9858e8e8f221d9b96eddc11f8e077f263e0b7bbd79d3cbe882b134274f8c', installedByteIdentical: true as const }),
  Object.freeze({ path: 'wasm/vision_wasm_internal.wasm', byteLength: 11153617, sha256: 'sha256:6a5c64584c2ab61c763b6e204afbdbc7ce1caf7f5216187322bca8df94f646bc', installedByteIdentical: true as const }),
  Object.freeze({ path: 'wasm/vision_wasm_module_internal.js', byteLength: 322082, sha256: 'sha256:1f1d6215324a1fe62f6742d49a3db911170987ca18ad8c1b75f1a1c82acf2b44', installedByteIdentical: true as const }),
  Object.freeze({ path: 'wasm/vision_wasm_module_internal.wasm', byteLength: 11153641, sha256: 'sha256:617b8e0248dbd27e9d7ece4218004eae4cefb499196d1bb4fa0e3fef21708756', installedByteIdentical: true as const }),
  Object.freeze({ path: 'wasm/vision_wasm_nosimd_internal.js', byteLength: 321847, sha256: 'sha256:438d1fe8ff7f4d946025bc211c291543c037d8a3785ed4eee60f1f521b236296', installedByteIdentical: true as const }),
  Object.freeze({ path: 'wasm/vision_wasm_nosimd_internal.wasm', byteLength: 10481398, sha256: 'sha256:8a3092d34c79d3f57e6ba8592105e8a90f6b07c27891ffecd14cca428bfd3e31', installedByteIdentical: true as const }),
]);

export const MEDIAPIPE_NPM_ARTIFACT_BYTE_ATTESTATION_FR30: MediaPipeNpmArtifactByteAttestationFR30V1 = Object.freeze({
  schemaVersion: 'fr30-v1' as const,
  evidenceRef: 'evidence.face.mediapipe_npm_artifact_bytes.fr30' as const,
  evidenceVersion: '0.1.0' as const,
  authorityState: 'published_npm_artifact_byte_identity_only' as const,
  packageIdentity: Object.freeze({
    packageName: '@mediapipe/tasks-vision' as const,
    packageVersion: '0.10.35' as const,
    tarballUrl: 'https://registry.npmjs.org/@mediapipe/tasks-vision/-/tasks-vision-0.10.35.tgz' as const,
    lockfileSri: PROVIDER_RELEASE_ATTESTATION_FR18.consumerArtifactLock.integrity,
  }),
  measurementWitness: Object.freeze({
    repository: 'gycha0109-beep/MyeongHa' as const,
    workflowRunId: 33152948600 as const,
    checkoutMergeSha: '4ed68080d6a569797f8284ae270dd28224bd40ed' as const,
    executionHeadSha: '4a633a810537e0f7ca955470fc0bfd81a95731f5' as const,
    workflowPath: '.github/workflows/face-reading-npm-artifact-byte-attestation.yml' as const,
    workflowBlobSha: '37f62fc7fee0775955fc1fa93917d90b127c8d14' as const,
    harnessPath: 'scripts/face-reading-fr30-npm-artifact-byte-attestation.mjs' as const,
    harnessBlobSha: 'db768e3594266e4b5a67ddadd79c14595729bb07' as const,
    runnerOs: 'ubuntu-24.04' as const,
    nodeVersion: '24.19.0' as const,
    npmVersion: '11.17.0' as const,
    artifactId: 9678441675 as const,
    artifactArchiveDigest: 'sha256:72cfee05a5919fa48c34c9fbcb3784982ddaf2a159610651026a6cfbd7e7e369' as const,
  }),
  tarball: Object.freeze({
    byteLength: 10231005 as const,
    sha512Sri: PROVIDER_RELEASE_ATTESTATION_FR18.consumerArtifactLock.integrity,
    sha512Hex: '1cebda77055113a242fb8e67c988669f2c27af987f27c299bce794355386f6aff4f3be6966022dce7141f5b453bcb736eb861226a899d4db08a424ad270fde82' as const,
    sha256: 'sha256:84597a25e13d123b5f4cbe768bb72e97a2c28c7a465f0ace287d8cbe5246bff0' as const,
    independentlyFetchedAndRehashed: true as const,
    lockfileSriMatched: true as const,
  }),
  archive: Object.freeze({
    entryCount: 13 as const,
    sortedEntriesSha256: 'sha256:c9f26f4d68b9099272d6b2caca5b9658e5b7f2e06654af513b83bd32ae895d2f' as const,
  }),
  packageMetadata: Object.freeze({
    main: 'vision_bundle.cjs' as const,
    browser: 'vision_bundle.mjs' as const,
    module: 'vision_bundle.mjs' as const,
    types: 'vision.d.ts' as const,
    repositoryFieldObserved: false as const,
    gitHeadFieldObserved: false as const,
  }),
  selectedFiles: FR30_EXPECTED_PUBLISHED_PACKAGE_FILES,
  allSelectedFilesByteIdenticalToInstalledPackage: true as const,
  runtimeBundleByteIdenticalToFR27InstalledEvidence: true as const,
  wasmBytesByteIdenticalToFR27InstalledEvidence: true as const,
  releaseTagSourceIdentityRef: MEDIAPIPE_RELEASE_TAG_PROVENANCE_FR29.evidenceRef,
  sourceOrBuildEquivalenceToReleaseTagVerified: false as const,
  providerConformanceClaimed: false as const,
  productionProviderActivationAllowed: false as const,
  anatomicalLateralityResolved: false as const,
  traditionalSemanticAuthority: false as const,
});

const SHA256 = /^sha256:[0-9a-f]{64}$/u;
const HEX40 = /^[0-9a-f]{40}$/u;
const HEX128 = /^[0-9a-f]{128}$/u;

function exactFileList(actual: readonly MediaPipePublishedArtifactFileFR30V1[], expected: readonly MediaPipePublishedArtifactFileFR30V1[]): void {
  if (actual.length !== expected.length) throw new FaceAuthorityValidationError('FR-30 selected package file count mismatch.');
  actual.forEach((entry, index) => {
    const pinned = expected[index]!;
    if (entry.path !== pinned.path || entry.byteLength !== pinned.byteLength || entry.sha256 !== pinned.sha256 || entry.installedByteIdentical !== true) {
      throw new FaceAuthorityValidationError(`FR-30 selected package file mismatch: ${entry.path}`);
    }
    if (!SHA256.test(entry.sha256) || !Number.isSafeInteger(entry.byteLength) || entry.byteLength <= 0) {
      throw new FaceAuthorityValidationError(`FR-30 selected package file evidence is malformed: ${entry.path}`);
    }
  });
}

export function validateMediaPipeNpmArtifactByteAttestationFR30(
  evidence: MediaPipeNpmArtifactByteAttestationFR30V1 = MEDIAPIPE_NPM_ARTIFACT_BYTE_ATTESTATION_FR30,
): MediaPipeNpmArtifactByteAttestationFR30V1 {
  if (evidence.schemaVersion !== 'fr30-v1' || evidence.evidenceVersion !== '0.1.0' ||
      evidence.evidenceRef !== 'evidence.face.mediapipe_npm_artifact_bytes.fr30') {
    throw new FaceAuthorityValidationError('FR-30 evidence identity/schema/version mismatch.');
  }
  if (evidence.authorityState !== 'published_npm_artifact_byte_identity_only') {
    throw new FaceAuthorityValidationError('FR-30 authorityState must remain published_npm_artifact_byte_identity_only.');
  }
  if (evidence.packageIdentity.packageName !== PROVIDER_RELEASE_ATTESTATION_FR18.consumerArtifactLock.packageName ||
      evidence.packageIdentity.packageVersion !== PROVIDER_RELEASE_ATTESTATION_FR18.consumerArtifactLock.packageVersion ||
      evidence.packageIdentity.tarballUrl !== PROVIDER_RELEASE_ATTESTATION_FR18.consumerArtifactLock.resolvedTarballUrl ||
      evidence.packageIdentity.lockfileSri !== PROVIDER_RELEASE_ATTESTATION_FR18.consumerArtifactLock.integrity) {
    throw new FaceAuthorityValidationError('FR-30 package identity must remain aligned to the exact FR-18 consumer artifact lock.');
  }

  const witness = evidence.measurementWitness;
  if (!HEX40.test(witness.checkoutMergeSha) || !HEX40.test(witness.executionHeadSha) ||
      !HEX40.test(witness.workflowBlobSha) || !HEX40.test(witness.harnessBlobSha) ||
      !SHA256.test(witness.artifactArchiveDigest)) {
    throw new FaceAuthorityValidationError('FR-30 measurement witness identity is malformed.');
  }
  if (witness.repository !== 'gycha0109-beep/MyeongHa' || witness.workflowRunId !== 33152948600 ||
      witness.checkoutMergeSha !== '4ed68080d6a569797f8284ae270dd28224bd40ed' ||
      witness.executionHeadSha !== '4a633a810537e0f7ca955470fc0bfd81a95731f5' ||
      witness.workflowPath !== '.github/workflows/face-reading-npm-artifact-byte-attestation.yml' ||
      witness.workflowBlobSha !== '37f62fc7fee0775955fc1fa93917d90b127c8d14' ||
      witness.harnessPath !== 'scripts/face-reading-fr30-npm-artifact-byte-attestation.mjs' ||
      witness.harnessBlobSha !== 'db768e3594266e4b5a67ddadd79c14595729bb07' ||
      witness.runnerOs !== 'ubuntu-24.04' || witness.nodeVersion !== '24.19.0' || witness.npmVersion !== '11.17.0' ||
      witness.artifactId !== 9678441675 ||
      witness.artifactArchiveDigest !== 'sha256:72cfee05a5919fa48c34c9fbcb3784982ddaf2a159610651026a6cfbd7e7e369') {
    throw new FaceAuthorityValidationError('FR-30 measurement witness must remain exactly pinned to the successful hardened registry-byte attestation run.');
  }

  if (evidence.tarball.byteLength !== 10231005 ||
      evidence.tarball.sha512Sri !== evidence.packageIdentity.lockfileSri ||
      evidence.tarball.sha512Hex !== '1cebda77055113a242fb8e67c988669f2c27af987f27c299bce794355386f6aff4f3be6966022dce7141f5b453bcb736eb861226a899d4db08a424ad270fde82' ||
      evidence.tarball.sha256 !== 'sha256:84597a25e13d123b5f4cbe768bb72e97a2c28c7a465f0ace287d8cbe5246bff0' ||
      !HEX128.test(evidence.tarball.sha512Hex) || !SHA256.test(evidence.tarball.sha256) ||
      evidence.tarball.independentlyFetchedAndRehashed !== true || evidence.tarball.lockfileSriMatched !== true) {
    throw new FaceAuthorityValidationError('FR-30 tarball bytes must remain independently rehashed and exactly aligned to the pinned published artifact and FR-18 lockfile SRI.');
  }
  if (evidence.archive.entryCount !== 13 ||
      evidence.archive.sortedEntriesSha256 !== 'sha256:c9f26f4d68b9099272d6b2caca5b9658e5b7f2e06654af513b83bd32ae895d2f' ||
      !SHA256.test(evidence.archive.sortedEntriesSha256)) {
    throw new FaceAuthorityValidationError('FR-30 archive manifest identity mismatch.');
  }
  if (evidence.packageMetadata.main !== 'vision_bundle.cjs' || evidence.packageMetadata.browser !== 'vision_bundle.mjs' ||
      evidence.packageMetadata.module !== 'vision_bundle.mjs' || evidence.packageMetadata.types !== 'vision.d.ts' ||
      evidence.packageMetadata.repositoryFieldObserved !== false || evidence.packageMetadata.gitHeadFieldObserved !== false) {
    throw new FaceAuthorityValidationError('FR-30 published package metadata boundary mismatch.');
  }

  exactFileList(evidence.selectedFiles, FR30_EXPECTED_PUBLISHED_PACKAGE_FILES);
  const publishedBundle = evidence.selectedFiles.find((entry) => entry.path === 'vision_bundle.mjs');
  if (publishedBundle?.sha256 !== MEDIAPIPE_REAL_RUNTIME_VERIFICATION_EVIDENCE_FR27.installedPackageAssets.packageBundleDigest ||
      evidence.runtimeBundleByteIdenticalToFR27InstalledEvidence !== true) {
    throw new FaceAuthorityValidationError('FR-30 published runtime bundle must remain byte-identical to the FR-27 installed runtime bundle evidence.');
  }

  const publishedWasm = new Map(
    evidence.selectedFiles
      .filter((entry) => entry.path.startsWith('wasm/'))
      .map((entry) => [entry.path.slice('wasm/'.length), entry.sha256] as const),
  );
  if (FR27_EXPECTED_INSTALLED_WASM_DIGESTS.some((entry) => publishedWasm.get(entry.file) !== entry.digest) ||
      publishedWasm.size !== FR27_EXPECTED_INSTALLED_WASM_DIGESTS.length || evidence.wasmBytesByteIdenticalToFR27InstalledEvidence !== true) {
    throw new FaceAuthorityValidationError('FR-30 published WASM bytes must remain byte-identical to all FR-27 installed WASM evidence.');
  }

  if (evidence.allSelectedFilesByteIdenticalToInstalledPackage !== true) {
    throw new FaceAuthorityValidationError('FR-30 selected published files must remain byte-identical to the installed package used by the attestation.');
  }
  if (evidence.releaseTagSourceIdentityRef !== MEDIAPIPE_RELEASE_TAG_PROVENANCE_FR29.evidenceRef ||
      evidence.sourceOrBuildEquivalenceToReleaseTagVerified !== false) {
    throw new FaceAuthorityValidationError('FR-30 published artifact byte identity must not be promoted to Git release-tag source/build equivalence.');
  }
  if (evidence.providerConformanceClaimed !== false || evidence.productionProviderActivationAllowed !== false ||
      evidence.anatomicalLateralityResolved !== false || evidence.traditionalSemanticAuthority !== false) {
    throw new FaceAuthorityValidationError('FR-30 cannot promote provider conformance, production activation, anatomical laterality, or traditional semantics.');
  }
  return evidence;
}

export function assessMediaPipeNpmArtifactByteAttestationFR30(): MediaPipeNpmArtifactByteAttestationReadinessFR30V1 {
  validateMediaPipeNpmArtifactByteAttestationFR30();
  return Object.freeze({
    publishedTarballByteIdentityReady: true as const,
    lockfileSriIndependentRehashReady: true as const,
    installedRuntimeAssetLinkReady: true as const,
    releaseTagSourceIdentityAvailable: true as const,
    publishedArtifactSourceBuildEquivalenceReady: false as const,
    providerConformanceReady: false as const,
    productionProviderActivationReady: false as const,
    anatomicalLateralityReady: false as const,
    traditionalSemanticAuthorityGranted: false as const,
    blockers: Object.freeze([
      'The published npm tarball bytes are independently identified, but no trusted provenance attestation links those artifact bytes to a specific GitHub tag build invocation.',
      'FR-22 implementation registry remains empty.',
      'FR-23 reviewed conformance evidence registry remains empty.',
      'MediaPipe metrics/privacy/telemetry production review remains unresolved.',
      'Provider left/right labels remain non-anatomical for uncontrolled uploaded/selfie images.',
      'No traditional physiognomy semantic authority is granted by package or runtime byte identity.',
    ]),
  });
}
