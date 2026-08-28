# Face Reading FR-26 — MediaPipe FaceLandmarker Research Runtime v0.1

> Project: **MyeongHa / Face Reading Engine**  
> Scope: exact-package research runtime execution boundary for the existing FR-25 → FR-24 eye projection  
> Status: **Research runtime only — production provider activation remains blocked**

## 1. Purpose

FR-24 established a research-only unordered provider-labeled eye pair projection and FR-25 established a strict adapter from a witnessed `FaceLandmarkerResult` shape into that projection.

FR-26 adds the missing executable step in front of those contracts:

```text
in-memory image source
→ @mediapipe/tasks-vision@0.10.35
→ FilesetResolver.forVisionTasks(...)
→ FaceLandmarker.createFromOptions(...)
→ FaceLandmarker.detect(image)
→ raw FaceLandmarkerResult
→ FR-25 strict adapter
→ FR-24 research eye-pair artifact
```

FR-26 does **not** create a verified FR-22 provider implementation, FR-23 reviewed conformance evidence, an FR-15 production neutral observation, anatomical laterality, or traditional physiognomy semantics.

## 2. Runtime Pin

The default runtime pins:

```text
package
@mediapipe/tasks-vision@0.10.35

WASM reference
https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm

Face Landmarker model reference
https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task

runningMode = IMAGE
numFaces = 1
outputFaceBlendshapes = false
outputFacialTransformationMatrixes = false
```

The package version is an exact dependency of `@myeongha/face-reading`.

Reference pinning is not byte attestation. FR-26 deliberately records both the WASM digest and model digest as `null` with `reference_pinned_bytes_unverified` state. No release-exact source-equivalence claim is added.

## 3. Authority Boundary

Hard invariants:

```text
FR-26 authorityState = research_runtime_only
rawImagePersisted = false
rawProviderResponsePersisted = false
biometricEmbeddingPersisted = false
productionNeutralObservationIssued = false
productionProviderActivationAllowed = false
anatomicalLateralityResolved = false
traditionalSemanticAuthority = false
```

Provider `LEFT` / `RIGHT` topology labels remain provider provenance only.

FR-26 cannot assign:

```text
neutral.face.left_eye_region
neutral.face.right_eye_region
anatomical left/right
image-side left/right authority
traditional meaning
fortune meaning
```

The serialized FR-24 region order remains a deterministic provider-symbol serialization order, not side authority.

## 4. Reuse, Not Reimplementation

FR-26 does not implement eye topology graph logic.

The execution path is intentionally:

```text
FR-26 detect()
→ issueMediaPipeEyePairResearchArtifactFR25(...)
→ issueFaceEyePairResearchArtifactFR24(...)
→ FR-16 closed-cycle helpers
```

Therefore the existing FR-16 functions remain the sole closed-cycle ordering/projection implementation:

```text
orderClosedCycleProviderVerticesFR16(...)
projectClosedCycleRegionTestVectorFR16(...)
```

FR-26 also does not pre-sanitize arbitrary provider fields before FR-25. A runtime result with an unwitnessed root or landmark field is passed to FR-25 and rejected fail-closed. This prevents FR-26 from silently bypassing the FR-25 evidence boundary.

## 5. Input and Privacy Boundary

The request contains only:

```text
schemaVersion
providerRunRef
canonicalAssetDigest
image
```

`image` is an opaque in-memory runtime input. It is never copied into the returned artifact and this module implements no image persistence.

The caller remains responsible for the established raw-image ephemeral lifecycle outside this runtime boundary.

The returned artifact does not retain provider `z`, blendshape payloads, facial transformation matrices, or the raw provider result.

## 6. Runtime Resource Lifecycle

Once a runtime instance has been created, FR-26 closes it in a `finally` block after:

- successful projection,
- provider detection failure,
- FR-25 validation failure,
- FR-24 projection failure.

A test factory seam exists so deterministic unit tests can inject a bounded fake runtime. That seam is test/research infrastructure only. It is not FR-22 registry membership, runtime provenance, conformance evidence, or provider activation authority.

## 7. Verification

FR-26 tests cover:

- exact package/runtime reference pins,
- unverified WASM/model digest state,
- real runtime-result boundary → FR-25 → FR-24,
- deterministic identical input/result replay,
- unknown request field rejection,
- malformed run reference and canonical digest rejection,
- null image rejection before runtime creation,
- zero/multiple-face fail-closed behavior,
- hidden provider root-field rejection through FR-25,
- hidden landmark-field rejection through FR-25,
- malformed coordinate rejection through FR-25,
- runtime close on success and downstream/provider failure,
- non-persistence of depth/blendshape/transform/raw-image material,
- production/laterality/traditional-semantic readiness remaining false.

## 8. Remaining Production Blockers

FR-26 intentionally leaves the following blockers open:

1. FR-18 supply-chain evidence does not establish release-exact source equivalence for `@mediapipe/tasks-vision@0.10.35`.
2. The actually loaded MediaPipe WASM bytes are not independently hashed/attested by MyeongHa.
3. The actually loaded Face Landmarker model bytes are not independently hashed/attested by MyeongHa.
4. MediaPipe Tasks production telemetry/metrics and user-consent/privacy policy require explicit product review.
5. `FACE_OBSERVATION_PROVIDER_IMPLEMENTATIONS_FR22` remains empty.
6. `FACE_OBSERVATION_PROVIDER_CONFORMANCE_EVIDENCE_FR23` remains empty.
7. Provider LEFT/RIGHT does not resolve anatomical laterality.
8. Controlled direct capture remains unimplemented.
9. Nose, brow, and brow-midline production derivations remain blocked pending reviewed derivation/calibration evidence.
10. No traditional physiognomy semantic authority is granted by this runtime.

## 9. Next Executable Slice

The next work should continue toward runtime evidence rather than inventing nose/brow geometry or traditional meaning.

Recommended sequence:

```text
FR-27 fixture/browser execution corpus
→ independently pinned runtime/model byte evidence
→ deterministic replay evidence
→ privacy/failure evidence
→ FR-23 conformance runner/evidence candidate
```

Only after a full FR-22 implementation can satisfy the required six slots and reviewed FR-17 derivations should provider activation be reconsidered.
