# Face Reading FR-32 — MediaPipe public source-build non-equivalence

Status: **MEASURED / FAIL-CLOSED**

FR-32 closes one narrow provenance question: whether the exact public MediaPipe `v0.10.35` source packaging path reproduces the published npm bytes for `@mediapipe/tasks-vision@0.10.35`.

It does not identify the actual npm publication process and grants no provider, production, laterality, or traditional physiognomy authority.

## 1. Pinned source and published artifact

Source build authority inherited from FR-31:

- repository: `google-ai-edge/mediapipe`
- tag: `v0.10.35`
- commit: `f8ef212d5c962c0e853db7e59d217056b187084b`
- Bazel: `7.4.1`
- public package target: `//mediapipe/tasks/web/vision:vision_pkg`
- declared tgz output: `vision_pkg.tgz`

Published artifact authority inherited from FR-30:

- package: `@mediapipe/tasks-vision@0.10.35`
- tarball bytes: `10231005`
- tarball SHA-256: `sha256:84597a25e13d123b5f4cbe768bb72e97a2c28c7a465f0ace287d8cbe5246bff0`

## 2. Archive target correction

The MediaPipe BUILD file uses rules_nodejs `pkg_npm`; the exact workspace pins rules_nodejs `5.8.5`.

In that implementation, `pkg_npm(name = "vision_pkg", tgz = "vision_pkg.tgz", ...)` exposes the package directory through `vision_pkg` and creates a separate genrule named `vision_pkg.tar` for the tgz output. The archive-producing target is therefore:

`//mediapipe/tasks/web/vision:vision_pkg.tar`

Runs #12–#15 successfully built the directory target and then could not recover a tgz. Run #16 corrected the target instead of guessing another output directory.

## 3. Successful measurement witness

- workflow run: `33238225619` (#16)
- job: `99062895346`
- execution head: `c8211facf161a236ddd978dc9f5c2b830d969dba`
- workflow: `.github/workflows/face-reading-source-reproducible-build-probe.yml`
- workflow blob: `3b370ce0cc31a792e61eca786ec136cb81ec0e5b`
- harness: `scripts/face-reading-fr32-mediapipe-source-build-non-equivalence.mjs`
- harness blob: `6d3478c96257fe1ff1cef85e334d6b1106217055`
- artifact ID: `9710656864`
- artifact digest: `sha256:ae16a02bb42c8829510b53244cf3940c2795383ac1e133cbc098ae88728228f2`
- measured at: `2026-08-28T23:29:07.697Z`

Bazel metadata resolved the archive as:

`bazel-out/k8-fastbuild/bin/mediapipe/tasks/web/vision/vision_pkg.tgz`

The exact source checkout, zlib preseed, archive-target build, source-vs-published measurement, and diagnostic artifact upload all succeeded.

## 4. Package-level observations

Source-built archive:

- name: `@mediapipe/tasks-vision`
- entry count: `12`
- `package.json` version: unresolved `__VERSION__`
- `vision.d.ts`: absent

Published npm archive:

- name: `@mediapipe/tasks-vision`
- version: `0.10.35`
- `vision.d.ts`: present

## 5. Exact selected runtime comparison

| file | source bytes | source SHA-256 | published bytes | published SHA-256 |
|---|---:|---|---:|---|
| `vision_bundle.cjs` | 137898 | `sha256:a64bdc609e896baa15a664db18d49002173951296761a85ac2c9496a6b511f72` | 137566 | `sha256:7fba4f9807297e229371318df577e96fc9f1b3d93e79075e3798ade2fc790c9e` |
| `vision_bundle.mjs` | 137324 | `sha256:d3403bbcca6abd841f09e6cac5fc4a1f81faf3d984a1a407eb0b0f8a45f22d44` | 136993 | `sha256:55d7ab624fbb70dcc5adc4ae6d7ea9cfcb569139d3dbfbf2b1deafcb966bc0fe` |
| `wasm/vision_wasm_internal.js` | 322467 | `sha256:b69007656557a0bbe44c9c73d6f23a9fac6465c4918711626cf5596ed0814ed7` | 322044 | `sha256:e7fd9858e8e8f221d9b96eddc11f8e077f263e0b7bbd79d3cbe882b134274f8c` |
| `wasm/vision_wasm_internal.wasm` | 13186311 | `sha256:e21b02c629886979772701d9a68a5b4ba600282fea1a25249e0538107e819aa0` | 11153617 | `sha256:6a5c64584c2ab61c763b6e204afbdbc7ce1caf7f5216187322bca8df94f646bc` |
| `wasm/vision_wasm_module_internal.js` | 322505 | `sha256:67fea4769a57678c53c27d7595fe9b9fc0e6218305077ed0abdf4cef8dfd984f` | 322082 | `sha256:1f1d6215324a1fe62f6742d49a3db911170987ca18ad8c1b75f1a1c82acf2b44` |
| `wasm/vision_wasm_module_internal.wasm` | 13186335 | `sha256:09c27fc5c4ad2428d8d1ffc754a3e72045abf60e8ec2e2173a73132254b43f69` | 11153641 | `sha256:617b8e0248dbd27e9d7ece4218004eae4cefb499196d1bb4fa0e3fef21708756` |
| `wasm/vision_wasm_nosimd_internal.js` | 322273 | `sha256:99fb7de1389dc57478d532dc23b909b0442d7e1968b8eaa0011a910bf442aebb` | 321847 | `sha256:438d1fe8ff7f4d946025bc211c291543c037d8a3785ed4eee60f1f521b236296` |
| `wasm/vision_wasm_nosimd_internal.wasm` | 12528421 | `sha256:bea9203065928ac962ed58a99b6119a6487b1f82c7ae0c935b81370be2b7e453` | 10481398 | `sha256:8a3092d34c79d3f57e6ba8592105e8a90f6b07c27891ffecd14cca428bfd3e31` |

All six WASM SHA-256 values differ, all six WASM byte lengths differ, and both bundle SHA-256 values differ. In fact all eight selected runtime files differ by both SHA-256 and byte length.

## 6. Authority conclusion

FR-32 establishes only:

> The exact public MediaPipe `v0.10.35` release-tag source, built through its public npm archive target with Bazel `7.4.1`, produces a Tasks Vision package that is not byte-equivalent to the published npm `@mediapipe/tasks-vision@0.10.35` artifact.

FR-32 does not establish which build/stamping/dependency/publication process produced the published artifact. Therefore all of the following remain false:

- `publishedReleaseProcessIdentified`
- `providerConformanceClaimed`
- `productionProviderActivationAllowed`
- `anatomicalLateralityResolved`
- `traditionalSemanticAuthority`

This is sufficient to stop treating the public release-tag target as a candidate byte-equivalent reproduction of the npm release. Further MediaPipe provenance work is not a prerequisite for returning to source-governed traditional methodology implementation.
