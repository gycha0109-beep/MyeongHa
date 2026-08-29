import { describe, expect, it } from 'vitest';
import {
  FR30_EXPECTED_PUBLISHED_PACKAGE_FILES,
  FR32_EXPECTED_FILE_COMPARISONS,
  MEDIAPIPE_SOURCE_BUILD_NON_EQUIVALENCE_FR32,
  assessMediaPipeSourceBuildNonEquivalenceFR32,
  validateMediaPipeSourceBuildNonEquivalenceFR32,
} from '../packages/face-reading/src/index.js';

describe('FR-32 MediaPipe public source-build non-equivalence', () => {
  it('pins the exact source recipe and archive-generating target', () => {
    expect(validateMediaPipeSourceBuildNonEquivalenceFR32().sourceBuildRecipe).toEqual({
      repository: 'google-ai-edge/mediapipe',
      tagName: 'v0.10.35',
      sourceCommitSha: 'f8ef212d5c962c0e853db7e59d217056b187084b',
      bazelVersion: '7.4.1',
      packageTarget: '//mediapipe/tasks/web/vision:vision_pkg',
      archiveTarget: '//mediapipe/tasks/web/vision:vision_pkg.tar',
      archiveTargetOrigin: 'rules_nodejs_pkg_npm_tgz_genrule',
      rulesNodejsVersion: '5.8.5',
      declaredArchiveOutput: 'vision_pkg.tgz',
    });
  });

  it('pins the successful run #16 execution and artifact witness', () => {
    expect(MEDIAPIPE_SOURCE_BUILD_NON_EQUIVALENCE_FR32.measurementWitness).toEqual({
      repository: 'gycha0109-beep/MyeongHa',
      attempted: true,
      completed: true,
      buildCompleted: true,
      packageMeasured: true,
      workflowRunId: 33238225619,
      workflowRunNumber: 16,
      workflowJobId: 99062895346,
      executionHeadSha: 'c8211facf161a236ddd978dc9f5c2b830d969dba',
      workflowPath: '.github/workflows/face-reading-source-reproducible-build-probe.yml',
      workflowBlobSha: '3b370ce0cc31a792e61eca786ec136cb81ec0e5b',
      harnessPath: 'scripts/face-reading-fr32-mediapipe-source-build-non-equivalence.mjs',
      harnessBlobSha: '6d3478c96257fe1ff1cef85e334d6b1106217055',
      artifactId: 9710656864,
      artifactArchiveDigest: 'sha256:ae16a02bb42c8829510b53244cf3940c2795383ac1e133cbc098ae88728228f2',
      measuredAt: '2026-08-28T23:29:07.697Z',
    });
  });

  it('pins source package structural differences and the FR-30 published package identity', () => {
    const evidence = MEDIAPIPE_SOURCE_BUILD_NON_EQUIVALENCE_FR32;
    expect(evidence.sourcePackage).toEqual({
      packageName: '@mediapipe/tasks-vision',
      packageJsonVersion: '__VERSION__',
      packageJsonVersionIsUnresolvedTemplate: true,
      archiveEntryCount: 12,
      visionDtsPresent: false,
    });
    expect(evidence.publishedPackage).toEqual({
      packageName: '@mediapipe/tasks-vision',
      packageJsonVersion: '0.10.35',
      packageJsonVersionIsUnresolvedTemplate: false,
      tarballUrl: 'https://registry.npmjs.org/@mediapipe/tasks-vision/-/tasks-vision-0.10.35.tgz',
      tarballByteLength: 10231005,
      tarballSha256: 'sha256:84597a25e13d123b5f4cbe768bb72e97a2c28c7a465f0ace287d8cbe5246bff0',
      visionDtsPresent: true,
    });
  });

  it('pins all eight runtime measurements and cross-checks the published side against FR-30', () => {
    const evidence = MEDIAPIPE_SOURCE_BUILD_NON_EQUIVALENCE_FR32;
    expect(evidence.fileComparisons).toEqual(FR32_EXPECTED_FILE_COMPARISONS);
    expect(evidence.fileComparisons).toHaveLength(8);
    const published = new Map(FR30_EXPECTED_PUBLISHED_PACKAGE_FILES.map((entry) => [entry.path, entry] as const));
    for (const comparison of evidence.fileComparisons) {
      const fr30 = published.get(comparison.publishedPath.replace(/^package\//u, ''));
      expect(fr30).toBeDefined();
      expect(comparison.publishedByteLength).toBe(fr30?.byteLength);
      expect(comparison.publishedSha256).toBe(fr30?.sha256);
      expect(comparison.sourceByteLength).not.toBe(comparison.publishedByteLength);
      expect(comparison.sourceSha256).not.toBe(comparison.publishedSha256);
      expect(comparison.sha256Equal).toBe(false);
      expect(comparison.byteLengthEqual).toBe(false);
    }
  });

  it('pins the exact source byte evidence observed in run #16', () => {
    expect(FR32_EXPECTED_FILE_COMPARISONS.map(({ sourcePath, sourceByteLength, sourceSha256 }) => ({ sourcePath, sourceByteLength, sourceSha256 }))).toEqual([
      { sourcePath: 'package/vision_bundle.cjs', sourceByteLength: 137898, sourceSha256: 'sha256:a64bdc609e896baa15a664db18d49002173951296761a85ac2c9496a6b511f72' },
      { sourcePath: 'package/vision_bundle.mjs', sourceByteLength: 137324, sourceSha256: 'sha256:d3403bbcca6abd841f09e6cac5fc4a1f81faf3d984a1a407eb0b0f8a45f22d44' },
      { sourcePath: 'package/wasm/vision_wasm_internal.js', sourceByteLength: 322467, sourceSha256: 'sha256:b69007656557a0bbe44c9c73d6f23a9fac6465c4918711626cf5596ed0814ed7' },
      { sourcePath: 'package/wasm/vision_wasm_internal.wasm', sourceByteLength: 13186311, sourceSha256: 'sha256:e21b02c629886979772701d9a68a5b4ba600282fea1a25249e0538107e819aa0' },
      { sourcePath: 'package/wasm/vision_wasm_module_internal.js', sourceByteLength: 322505, sourceSha256: 'sha256:67fea4769a57678c53c27d7595fe9b9fc0e6218305077ed0abdf4cef8dfd984f' },
      { sourcePath: 'package/wasm/vision_wasm_module_internal.wasm', sourceByteLength: 13186335, sourceSha256: 'sha256:09c27fc5c4ad2428d8d1ffc754a3e72045abf60e8ec2e2173a73132254b43f69' },
      { sourcePath: 'package/wasm/vision_wasm_nosimd_internal.js', sourceByteLength: 322273, sourceSha256: 'sha256:99fb7de1389dc57478d532dc23b909b0442d7e1968b8eaa0011a910bf442aebb' },
      { sourcePath: 'package/wasm/vision_wasm_nosimd_internal.wasm', sourceByteLength: 12528421, sourceSha256: 'sha256:bea9203065928ac962ed58a99b6119a6487b1f82c7ae0c935b81370be2b7e453' },
    ]);
  });

  it('closes only public-target equivalence and leaves downstream authority blocked', () => {
    const evidence = MEDIAPIPE_SOURCE_BUILD_NON_EQUIVALENCE_FR32;
    expect(evidence.allSixWasmSha256Differ).toBe(true);
    expect(evidence.allSixWasmByteLengthsDiffer).toBe(true);
    expect(evidence.bothBundleSha256Differ).toBe(true);
    expect(evidence.publicTagTargetPublishedArtifactByteEquivalent).toBe(false);
    expect(evidence.nonEquivalenceVerified).toBe(true);
    expect(evidence.publishedReleaseProcessIdentified).toBe(false);
    expect(evidence.providerConformanceClaimed).toBe(false);
    expect(evidence.productionProviderActivationAllowed).toBe(false);
    expect(evidence.anatomicalLateralityResolved).toBe(false);
    expect(evidence.traditionalSemanticAuthority).toBe(false);

    expect(assessMediaPipeSourceBuildNonEquivalenceFR32()).toMatchObject({
      publicArchiveTargetBuildReady: true,
      sourcePackageMeasurementReady: true,
      publishedArtifactComparisonReady: true,
      publicTargetNonEquivalenceReady: true,
      publishedReleaseProcessReady: false,
      providerConformanceReady: false,
      productionProviderActivationReady: false,
      anatomicalLateralityReady: false,
      traditionalSemanticAuthorityGranted: false,
    });
  });

  it('fails closed on witness drift, byte drift, or downstream promotion', () => {
    const evidence = MEDIAPIPE_SOURCE_BUILD_NON_EQUIVALENCE_FR32;
    expect(() => validateMediaPipeSourceBuildNonEquivalenceFR32({ ...evidence, measurementWitness: { ...evidence.measurementWitness, artifactId: 1 } } as never)).toThrow(/exactly pinned/u);
    const first = evidence.fileComparisons[0]!;
    expect(() => validateMediaPipeSourceBuildNonEquivalenceFR32({ ...evidence, fileComparisons: [{ ...first, sourceSha256: first.publishedSha256 }, ...evidence.fileComparisons.slice(1)] } as never)).toThrow(/comparison mismatch|malformed or equivalent/u);
    expect(() => validateMediaPipeSourceBuildNonEquivalenceFR32({ ...evidence, publishedReleaseProcessIdentified: true } as never)).toThrow(/cannot promote/u);
    expect(() => validateMediaPipeSourceBuildNonEquivalenceFR32({ ...evidence, providerConformanceClaimed: true } as never)).toThrow(/cannot promote/u);
    expect(() => validateMediaPipeSourceBuildNonEquivalenceFR32({ ...evidence, productionProviderActivationAllowed: true } as never)).toThrow(/cannot promote/u);
    expect(() => validateMediaPipeSourceBuildNonEquivalenceFR32({ ...evidence, anatomicalLateralityResolved: true } as never)).toThrow(/cannot promote/u);
    expect(() => validateMediaPipeSourceBuildNonEquivalenceFR32({ ...evidence, traditionalSemanticAuthority: true } as never)).toThrow(/cannot promote/u);
  });
});
