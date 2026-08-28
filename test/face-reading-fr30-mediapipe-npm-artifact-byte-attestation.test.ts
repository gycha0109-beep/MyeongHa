import { describe, expect, it } from 'vitest';
import {
  FR27_EXPECTED_INSTALLED_WASM_DIGESTS,
  FR30_EXPECTED_PUBLISHED_PACKAGE_FILES,
  MEDIAPIPE_NPM_ARTIFACT_BYTE_ATTESTATION_FR30,
  MEDIAPIPE_REAL_RUNTIME_VERIFICATION_EVIDENCE_FR27,
  assessMediaPipeNpmArtifactByteAttestationFR30,
  validateMediaPipeNpmArtifactByteAttestationFR30,
} from '../packages/face-reading/src/index.js';

describe('FR-30 MediaPipe published npm artifact byte attestation', () => {
  it('pins the independently fetched registry tarball bytes to the FR-18 lockfile SRI', () => {
    const evidence = validateMediaPipeNpmArtifactByteAttestationFR30();
    expect(evidence.authorityState).toBe('published_npm_artifact_byte_identity_only');
    expect(evidence.tarball).toEqual({
      byteLength: 10231005,
      sha512Sri: 'sha512-HOvadwVRE6JC+45nyYhmnywnr5h/J8KZvOeUNVOG9q/0875pZgItznFB9bRTvLc264YSJqiZ1NsIpCStJw/egg==',
      sha512Hex: '1cebda77055113a242fb8e67c988669f2c27af987f27c299bce794355386f6aff4f3be6966022dce7141f5b453bcb736eb861226a899d4db08a424ad270fde82',
      sha256: 'sha256:84597a25e13d123b5f4cbe768bb72e97a2c28c7a465f0ace287d8cbe5246bff0',
      independentlyFetchedAndRehashed: true,
      lockfileSriMatched: true,
    });
    expect(evidence.archive).toEqual({
      entryCount: 13,
      sortedEntriesSha256: 'sha256:c9f26f4d68b9099272d6b2caca5b9658e5b7f2e06654af513b83bd32ae895d2f',
    });
  });

  it('pins the successful hardened npm artifact byte-attestation execution witness', () => {
    expect(MEDIAPIPE_NPM_ARTIFACT_BYTE_ATTESTATION_FR30.measurementWitness).toMatchObject({
      workflowRunId: 33152948600,
      checkoutMergeSha: '4ed68080d6a569797f8284ae270dd28224bd40ed',
      executionHeadSha: '4a633a810537e0f7ca955470fc0bfd81a95731f5',
      workflowPath: '.github/workflows/face-reading-npm-artifact-byte-attestation.yml',
      workflowBlobSha: '37f62fc7fee0775955fc1fa93917d90b127c8d14',
      harnessPath: 'scripts/face-reading-fr30-npm-artifact-byte-attestation.mjs',
      harnessBlobSha: 'db768e3594266e4b5a67ddadd79c14595729bb07',
      runnerOs: 'ubuntu-24.04',
      nodeVersion: '24.19.0',
      npmVersion: '11.17.0',
      artifactId: 9678441675,
      artifactArchiveDigest: 'sha256:72cfee05a5919fa48c34c9fbcb3784982ddaf2a159610651026a6cfbd7e7e369',
    });
  });

  it('links the published bundle and all six WASM assets to the FR-27 installed runtime evidence', () => {
    const published = new Map(FR30_EXPECTED_PUBLISHED_PACKAGE_FILES.map((entry) => [entry.path, entry] as const));
    expect(published.get('vision_bundle.mjs')?.sha256)
      .toBe(MEDIAPIPE_REAL_RUNTIME_VERIFICATION_EVIDENCE_FR27.installedPackageAssets.packageBundleDigest);
    for (const wasm of FR27_EXPECTED_INSTALLED_WASM_DIGESTS) {
      expect(published.get(`wasm/${wasm.file}`)?.sha256).toBe(wasm.digest);
      expect(published.get(`wasm/${wasm.file}`)?.installedByteIdentical).toBe(true);
    }
    expect(MEDIAPIPE_NPM_ARTIFACT_BYTE_ATTESTATION_FR30.runtimeBundleByteIdenticalToFR27InstalledEvidence).toBe(true);
    expect(MEDIAPIPE_NPM_ARTIFACT_BYTE_ATTESTATION_FR30.wasmBytesByteIdenticalToFR27InstalledEvidence).toBe(true);
  });

  it('pins package metadata and type declaration bytes without inventing repository provenance', () => {
    const evidence = MEDIAPIPE_NPM_ARTIFACT_BYTE_ATTESTATION_FR30;
    expect(evidence.packageMetadata).toEqual({
      main: 'vision_bundle.cjs',
      browser: 'vision_bundle.mjs',
      module: 'vision_bundle.mjs',
      types: 'vision.d.ts',
      repositoryFieldObserved: false,
      gitHeadFieldObserved: false,
    });
    expect(FR30_EXPECTED_PUBLISHED_PACKAGE_FILES.find((entry) => entry.path === 'vision.d.ts')).toEqual({
      path: 'vision.d.ts',
      byteLength: 116918,
      sha256: 'sha256:3825dba564fc06720dc0934b72a22711ac6b7491ae8662e573ac205699ea016b',
      installedByteIdentical: true,
    });
    expect(evidence.sourceOrBuildEquivalenceToReleaseTagVerified).toBe(false);
  });

  it('reports published artifact identity ready while all semantic and production promotions remain blocked', () => {
    const readiness = assessMediaPipeNpmArtifactByteAttestationFR30();
    expect(readiness.publishedTarballByteIdentityReady).toBe(true);
    expect(readiness.lockfileSriIndependentRehashReady).toBe(true);
    expect(readiness.installedRuntimeAssetLinkReady).toBe(true);
    expect(readiness.releaseTagSourceIdentityAvailable).toBe(true);
    expect(readiness.publishedArtifactSourceBuildEquivalenceReady).toBe(false);
    expect(readiness.providerConformanceReady).toBe(false);
    expect(readiness.productionProviderActivationReady).toBe(false);
    expect(readiness.anatomicalLateralityReady).toBe(false);
    expect(readiness.traditionalSemanticAuthorityGranted).toBe(false);
  });

  it('fails closed if the hardened measurement witness drifts', () => {
    const evidence = MEDIAPIPE_NPM_ARTIFACT_BYTE_ATTESTATION_FR30;
    expect(() => validateMediaPipeNpmArtifactByteAttestationFR30({
      ...evidence,
      measurementWitness: {
        ...evidence.measurementWitness,
        workflowBlobSha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      },
    } as never)).toThrow(/exactly pinned/u);
  });

  it('fails closed if independently pinned tarball or archive bytes drift', () => {
    const evidence = MEDIAPIPE_NPM_ARTIFACT_BYTE_ATTESTATION_FR30;
    expect(() => validateMediaPipeNpmArtifactByteAttestationFR30({
      ...evidence,
      tarball: {
        ...evidence.tarball,
        sha256: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      },
    } as never)).toThrow(/pinned published artifact/u);
    expect(() => validateMediaPipeNpmArtifactByteAttestationFR30({
      ...evidence,
      archive: {
        ...evidence.archive,
        sortedEntriesSha256: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      },
    } as never)).toThrow(/archive manifest identity/u);
  });

  it('fails closed if independent rehash evidence is withdrawn or lockfile SRI diverges', () => {
    const evidence = MEDIAPIPE_NPM_ARTIFACT_BYTE_ATTESTATION_FR30;
    expect(() => validateMediaPipeNpmArtifactByteAttestationFR30({
      ...evidence,
      tarball: { ...evidence.tarball, independentlyFetchedAndRehashed: false },
    } as never)).toThrow(/independently rehashed/u);
    expect(() => validateMediaPipeNpmArtifactByteAttestationFR30({
      ...evidence,
      tarball: { ...evidence.tarball, sha512Sri: 'sha512-invalid' },
    } as never)).toThrow(/independently rehashed/u);
  });

  it('fails closed if published runtime bytes drift from FR-27 or are promoted to Git source equivalence', () => {
    const evidence = MEDIAPIPE_NPM_ARTIFACT_BYTE_ATTESTATION_FR30;
    const changedFiles = evidence.selectedFiles.map((entry) => entry.path === 'vision_bundle.mjs'
      ? { ...entry, sha256: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }
      : entry);
    expect(() => validateMediaPipeNpmArtifactByteAttestationFR30({
      ...evidence,
      selectedFiles: changedFiles,
    } as never)).toThrow(/selected package file mismatch/u);
    expect(() => validateMediaPipeNpmArtifactByteAttestationFR30({
      ...evidence,
      sourceOrBuildEquivalenceToReleaseTagVerified: true,
    } as never)).toThrow(/must not be promoted/u);
  });

  it('fails closed on provider, production, laterality, or traditional-semantic promotion', () => {
    const evidence = MEDIAPIPE_NPM_ARTIFACT_BYTE_ATTESTATION_FR30;
    expect(() => validateMediaPipeNpmArtifactByteAttestationFR30({ ...evidence, providerConformanceClaimed: true } as never))
      .toThrow(/cannot promote/u);
    expect(() => validateMediaPipeNpmArtifactByteAttestationFR30({ ...evidence, productionProviderActivationAllowed: true } as never))
      .toThrow(/cannot promote/u);
    expect(() => validateMediaPipeNpmArtifactByteAttestationFR30({ ...evidence, anatomicalLateralityResolved: true } as never))
      .toThrow(/cannot promote/u);
    expect(() => validateMediaPipeNpmArtifactByteAttestationFR30({ ...evidence, traditionalSemanticAuthority: true } as never))
      .toThrow(/cannot promote/u);
  });
});
