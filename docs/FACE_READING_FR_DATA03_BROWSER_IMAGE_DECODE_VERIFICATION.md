# Face Reading FR-DATA-03 — Browser Image Decode Verification

Status: implementation candidate on `codex/fr-data03-browser-image-decode`

## 1. Purpose

FR-DATA-03 closes exactly one gap left by FR-DATA-01/02:

```text
FR-DATA-01
asset path + digest + basic PNG/JPEG/WebP signature
        ↓
FR-DATA-02
encoded width/height derived from container/header bytes
        ↓
FR-DATA-03
exact asset bytes successfully loaded and decoded by the recorded Chrome/Chromium image decoder
```

A successful FR-DATA-03 report may set:

```text
imageDecodabilityVerified = true
```

The statement means only:

> These exact asset bytes, identified by their FR-47 canonical SHA-256 digest, emitted a successful HTML image load event, resolved `HTMLImageElement.decode()`, and exposed positive `naturalWidth` / `naturalHeight` exactly equal to the FR-DATA-02 encoded dimensions in the exact recorded browser runtime.

It does not mean that the image is usable facial measurement evidence.

## 2. Runtime evidence path

`scripts/face-reading-fr-data03-browser-image-decode.mjs` performs the evidence-producing run.

1. Validate the FR-DATA-01 manifest.
2. Re-run FR-DATA-01 exact asset path/digest/signature verification.
3. Re-run FR-DATA-02 byte-derived dimension verification.
4. Resolve each confined asset path.
5. Serve the exact file bytes from a local `127.0.0.1` HTTP server with the verified image MIME type.
6. Launch installed Chrome/Chromium headlessly with Chrome DevTools Protocol enabled.
7. Discover the exact page target and verify `location.href`, `location.origin`, and `document.readyState`.
8. For every capture, create an `HTMLImageElement`, observe `load` vs `error`, then require `HTMLImageElement.decode()` to resolve.
9. Read positive `naturalWidth` / `naturalHeight`.
10. Repeat the decode pass in the same browser run and require an identical evidence result.
11. Bind each browser result back to `captureRef`, `relativeAssetPath`, and exact canonical asset digest.
12. Require decoded natural dimensions to equal FR-DATA-02 encoded dimensions exactly.

No epsilon, fallback dimension, source-order priority, provider-index priority, anatomical mapping, or calibration threshold is introduced.

## 3. Browser provenance

The report records run-exact decoder provenance:

- protocol: Chrome DevTools Protocol
- primitive: HTML image load + `HTMLImageElement.decode()`
- browser product
- full browser version string
- process platform
- GitHub runner OS / architecture when present
- GitHub run ID / attempt / SHA when present
- verification timestamp
- verifier page URL / origin / ready state
- deterministic replay result

The workflow uses `ubuntu-24.04` and the Chrome/Chromium binary installed on that runner. The report records the exact browser version actually used; this contract does not silently treat future runner browser versions as byte-equivalent decoders.

## 4. Fail-closed cases

FR-DATA-03 rejects:

- FR-DATA-01 prerequisite drift or failure
- FR-DATA-02 prerequisite drift or failure
- missing / duplicate / unknown capture evidence
- capture path drift
- asset digest drift
- browser `error` event
- browser decode rejection or timeout
- `naturalWidth <= 0` or `naturalHeight <= 0`
- natural dimensions differing from FR-DATA-02
- page origin/readiness drift
- non-deterministic same-run replay

## 5. Header-valid but undecodable negative control

The dedicated workflow contains a deliberate negative control:

```text
valid PNG signature + readable IHDR width/height
+ truncated payload
```

Expected result:

```text
FR-DATA-01 → passes signature/digest/path checks
FR-DATA-02 → reads and verifies encoded dimensions
FR-DATA-03 → Chrome rejects the image, workflow negative control passes only because FR-DATA-03 fails closed
```

This is the contract-level proof that:

```text
header parsing success != full browser decode success
```

## 6. Authority boundary

FR-DATA-03 success leaves all of the following false:

```text
pixelContentIntegrityVerified
facePresenceVerified
fullFaceFramingValidityVerified
neutralExpressionValidityVerified
naturalHeadPositionValidityVerified
lightingAdequacyVerified
blurThresholdPassVerified
occlusionValidityVerified
captureQualityAuthorityValidated
mentonAnnotationCorrectnessVerified
mediaPipeInferenceCorrectnessVerified
empiricalScoringPerformed
providerCandidateToMentonMappingValidated
repeatedCaptureRepeatabilityValidated
poseStabilityValidated
calibrationThresholdsDefined
fr35PointToContourRelationValidated
traditionalDigeEquivalenceValidated
fr36VerticalReferencePromoted
productionThreeDivisionsMetricAllowed
productionF1Allowed
productionF6Allowed
researchCandidateAdmitted
productionGeometryAuthorized
```

In particular:

```text
browser decode success
!= face presence
!= capture-quality pass
!= soft-tissue Menton correctness
!= provider landmark anatomical authority
!= FR-45 image inferior extremum = Menton
!= FR-35 chin_inferior_contour binding
!= 地閣
!= FR-36 vertical reference promotion
!= production Three Divisions / F1 / F6
```

`assertMentonDatasetBrowserDecodeReadyForProductionFRData03()` always throws. FR-DATA-03 is an intake/evidence integrity gate, not a production geometry admission.

## 7. Dedicated workflow

Workflow:

```text
Face Reading Browser Image Decode Verification
```

The workflow uses fully decodable deterministic PNG fixtures for the positive path. It also runs the truncated-PNG negative control above. Browser decodability is therefore proven by a real Actions Chrome process rather than unit-test substitution.

## 8. Next empirical boundary

After FR-DATA-03, the highest-value next step is capture-quality tooling on the same exact decoded assets:

```text
actual decoded image
→ face presence / framing / pose / blur / occlusion evidence
```

Those checks require their own evidence and must not be inferred from FR-DATA-03 decode success.
