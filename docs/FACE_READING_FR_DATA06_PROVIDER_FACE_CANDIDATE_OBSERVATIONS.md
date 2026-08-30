# FR-DATA-06 — Provider Face-Candidate Raw Observations

Status: implemented research-data gate  
Authority state: provider-output observation only  
Production face-presence authority: **not granted**

## 1. Purpose

FR-DATA-06 consumes the exact FR-DATA-05 capture-quality raw-observation report and adds a new evidence layer:

> What did the pinned MediaPipe Face Landmarker runtime return for the exact image whose browser raster identity was already established?

The slice deliberately does **not** answer:

- whether a human face is truly present,
- whether exactly one human face is present,
- whether the full face is framed correctly,
- whether the pose/expression/lighting/blur is acceptable,
- whether any provider landmark is anatomically correct,
- whether a provider candidate maps to Menton / 地閣 / FR-35,
- whether 三停, F1, F6, or production geometry may run.

A non-zero `faceLandmarks.length` is recorded as a **provider face candidate**, not as face-presence truth.

## 2. Prerequisite chain

FR-DATA-06 requires the canonical chain:

`FR-DATA-01 bytes`
→ `FR-DATA-02 byte dimensions`
→ `FR-DATA-03 browser decode`
→ `FR-DATA-04 exact browser RGBA raster`
→ `FR-DATA-05 threshold-free raw quality inputs`
→ `FR-DATA-06 provider face-candidate observations`

The FR-DATA-05 prerequisite is rebuilt from its own canonical observations and provenance. Any drift or prior claim promotion fails closed.

## 3. Provider/runtime pin

The runtime remains the bounded FR-26 path:

- package: `@mediapipe/tasks-vision@0.10.35`
- task: Face Landmarker
- running mode: `IMAGE`
- `numFaces = 1`
- blendshape output disabled
- facial transformation matrices disabled

FR-DATA-06 reuses FR-27's independently recorded package/model byte expectations:

- installed package bundle SHA-256,
- installed WASM file SHA-256 set,
- face-landmarker model SHA-256 and byte length.

The current browser runtime rechecks those bytes before provider execution.

## 4. Exact raster binding before provider execution

FR-DATA-06 does not merely reopen the same file and assume equivalence.

For every capture the browser performs, in this order:

1. load the exact bound encoded asset,
2. resolve `HTMLImageElement.decode()`,
3. draw that image to Canvas 2D,
4. call `getImageData`,
5. SHA-256 the exact RGBA byte sequence in browser Web Crypto,
6. require equality with the FR-DATA-05 / FR-DATA-04 `rasterSha256`,
7. only then call MediaPipe `FaceLandmarker.detect(image)`.

If step 6 fails, the provider call is not admitted as FR-DATA-06 evidence.

## 5. Persisted provider summary

Raw provider coordinates and the raw provider response are not persisted.

Per capture, FR-DATA-06 records only:

- exact capture/path/asset digest/raster SHA binding,
- provider result root field set,
- `faceCandidateCount = result.faceLandmarks.length`,
- per-provider-candidate ordinal,
- landmark count,
- observed landmark field set,
- booleans confirming:
  - all x values are finite and normalized to `[0,1]`,
  - all y values are finite and normalized to `[0,1]`,
  - all z values are finite,
  - visibility is finite whenever present,
- blendshape array count,
- facial transformation matrix array count.

Because `numFaces = 1`, admitted `faceCandidateCount` is bounded to `0..1`.

This is a provider-result-shape observation. It is not anatomical validation.

## 6. Runtime shape pin

For this pinned runtime/package, admitted non-empty candidate summaries retain the previously observed runtime field set:

`visibility, x, y, z`

A changed field set is treated as runtime-shape drift and fails closed. This does not convert those fields into anatomical semantics.

## 7. Deterministic replay

The browser performs two complete provider-summary passes over the capture set.

FR-DATA-06 requires exact equality of the persisted summaries.

This means:

> the persisted summary replayed identically in this runtime execution.

It does **not** claim that floating-point landmark coordinates are bit-identical across executions, machines, browser versions, or provider versions because raw coordinates are intentionally not persisted here.

## 8. Dedicated positive runtime control

The FR-DATA-06 workflow also runs the existing FR-27 real-runtime E2E control.

That control uses the pinned MediaPipe official sample fixture and requires the runtime to return one provider candidate with the previously observed landmark shape.

This validates that the workflow's MediaPipe runtime is capable of producing a positive provider candidate.

It does not make the FR-27 fixture a ground-truth human-face calibration dataset and does not define sensitivity, specificity, false-positive rate, or a face-presence threshold.

## 9. Claims admitted

A successful FR-DATA-06 report may claim only:

- FR-DATA-01..05 prerequisite chain verified,
- exact raster identity reconfirmed before provider execution,
- pinned MediaPipe runtime executed,
- provider result shape observed,
- provider candidate count observed,
- landmark payload summary observed,
- raw provider response not persisted,
- raw provider coordinates not persisted.

## 10. Claims that remain false

The following remain explicitly false:

- `pixelContentIntegrityVerified`
- `providerDetectionConstructValidityValidated`
- `providerFaceCandidateHumanIdentityValidated`
- `singleHumanFaceVerified`
- `facePresenceVerified`
- `fullFaceFramingValidityVerified`
- `neutralExpressionValidityVerified`
- `naturalHeadPositionValidityVerified`
- `sharpnessMetricValidated`
- `exposureMetricValidated`
- `lightingMetricValidated`
- `exposureAdequacyVerified`
- `lightingAdequacyVerified`
- `blurThresholdPassVerified`
- `occlusionValidityVerified`
- `captureQualityMetricConstructValidityValidated`
- `captureQualityThresholdsDefined`
- `captureQualityAuthorityValidated`
- `mentonAnnotationCorrectnessVerified`
- `mediaPipeInferenceCorrectnessVerified`
- `providerConformanceVerified`
- `empiricalScoringPerformed`
- `providerCandidateToMentonMappingValidated`
- `repeatedCaptureRepeatabilityValidated`
- `poseStabilityValidated`
- `calibrationThresholdsDefined`
- `fr35PointToContourRelationValidated`
- `traditionalDigeEquivalenceValidated`
- `fr36VerticalReferencePromoted`
- `productionThreeDivisionsMetricAllowed`
- `productionF1Allowed`
- `productionF6Allowed`
- `researchCandidateAdmitted`
- `productionGeometryAuthorized`

## 11. Interpretation rule

The critical semantic rule is:

`provider candidate observed`
≠ `human face verified`
≠ `single usable face verified`
≠ `capture quality passed`
≠ `anatomical landmark verified`
≠ `traditional semantic anchor verified`

FR-DATA-06 therefore advances observability, not semantic authority.

## 12. Next evidence gap

The next useful step is not to set `facePresenceVerified = true`.

A later slice must define an independent face-presence / single-subject validation protocol with real positive and negative capture evidence, frozen acceptance criteria, and calibration/holdout separation.

Until then, MediaPipe candidate count remains provider evidence only.
