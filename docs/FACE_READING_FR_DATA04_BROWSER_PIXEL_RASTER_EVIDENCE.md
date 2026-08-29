# FR-DATA-04 — Browser Pixel Raster Evidence

## Status

`runtime_evidence_collection_only_capture_quality_promotion_blocked`

FR-DATA-04 extends the empirical Menton dataset intake pipeline after FR-DATA-03:

`FR-DATA-01 exact file/path/digest/signature`
→ `FR-DATA-02 encoded dimensions from bytes`
→ `FR-DATA-03 real browser image decode`
→ `FR-DATA-04 real browser decoded-raster readback`

The purpose is to establish deterministic, exact evidence about the raster that the pinned browser actually produced before any capture-quality classification is attempted.

## Runtime contract

For every FR-47 capture asset, the dedicated runtime:

1. re-runs FR-DATA-01 path/digest/signature verification,
2. re-runs FR-DATA-02 byte-derived dimension verification,
3. loads and decodes the exact asset bytes in installed Chrome/Chromium,
4. requires the FR-DATA-03 `load` + `HTMLImageElement.decode()` contract,
5. draws the decoded image into a same-origin Canvas 2D surface,
6. obtains the full raster with `getImageData`,
7. requires raster dimensions to equal the FR-DATA-03 natural dimensions,
8. requires `pixelCount = width * height`,
9. requires `rgbaByteLength = pixelCount * 4`,
10. records SHA-256 of the exact browser-returned RGBA byte sequence,
11. records integer-only R/G/B/A min, max, and sum observations,
12. records exact transparent / partial-alpha / opaque pixel counts,
13. replays the entire browser operation and requires byte-for-byte identical reported evidence.

The runtime provenance records the exact browser product/version, runner information when present, GitHub run provenance when present, page URL/origin/readiness, CDP use, and the Canvas 2D `drawImage` + `getImageData` primitive.

## What FR-DATA-04 proves

A successful FR-DATA-04 report may claim only that, for the exact bound asset bytes and browser provenance:

- FR-DATA-01 intake remained valid,
- FR-DATA-02 dimensions remained valid,
- FR-DATA-03 browser decode remained valid,
- the decoded image could be drawn to a same-origin Canvas 2D raster,
- the full RGBA raster could be read back,
- the raster dimensions and RGBA byte count were structurally self-consistent,
- an exact SHA-256 fingerprint of that browser-produced RGBA raster was observed,
- threshold-free channel and alpha occupancy statistics were observed,
- the operation replayed deterministically within the same browser run.

This is decoded-raster evidence. It is not a capture-quality verdict.

## What FR-DATA-04 does not prove

The following remain explicitly false:

- `pixelContentIntegrityVerified`
- `facePresenceVerified`
- `fullFaceFramingValidityVerified`
- `neutralExpressionValidityVerified`
- `naturalHeadPositionValidityVerified`
- `lightingAdequacyVerified`
- `blurThresholdPassVerified`
- `occlusionValidityVerified`
- `captureQualityThresholdsDefined`
- `captureQualityAuthorityValidated`
- `mentonAnnotationCorrectnessVerified`
- `mediaPipeInferenceCorrectnessVerified`
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

In particular:

**browser raster readback success ≠ usable facial measurement evidence**

and:

**raw pixel statistics ≠ a blur, exposure, lighting, framing, pose, expression, or occlusion pass**

No quality threshold is introduced by FR-DATA-04.

## Pixel SHA-256 boundary

`rasterSha256` fingerprints the exact RGBA bytes returned by the identified browser's Canvas 2D readback for that run. It is deliberately not called source pixel integrity.

Different decoders, color-management behavior, orientation handling, browser versions, or rasterization implementations can legitimately produce different decoded pixel bytes for some formats. Therefore FR-DATA-04 binds the raster fingerprint to exact decoder provenance and does not assert cross-decoder equivalence.

The dedicated workflow uses tiny generated PNGs whose uncompressed RGBA bytes are known at fixture creation time. For those workflow fixtures only, it additionally checks the browser raster SHA-256 against the known fixture raster bytes. That self-test validates the harness; it does not create a general independent pixel ground truth for user datasets.

## Next empirical step

The next capture-quality slice should consume FR-DATA-04 raster evidence and add **observations**, not invented acceptance thresholds.

Candidates include independently reviewable feature extraction for blur/exposure/lighting and provider-neutral or provider-explicit face/framing evidence. Any pass/fail threshold must remain unset until a reviewed calibration dataset or external authority supports it.
