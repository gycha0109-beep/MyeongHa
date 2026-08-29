# Face Reading FR-DATA-05 — Capture-Quality Raw Observations

Status: implementation gate

## Purpose

FR-DATA-05 is the next evidence layer after FR-DATA-04 browser pixel raster readback. It does **not** decide whether a capture is sharp, correctly exposed, evenly lit, unobstructed, properly framed, or otherwise usable for production face reading.

Its only purpose is to bind deterministic, threshold-free numeric observations to the exact browser-decoded RGBA raster already identified by FR-DATA-04.

The authority chain remains:

`image bytes → FR-DATA-01 intake → FR-DATA-02 byte dimensions → FR-DATA-03 browser decode → FR-DATA-04 exact RGBA raster → FR-DATA-05 raw quality inputs`

## Exact measurement primitive

FR-DATA-05 uses Chrome/Chromium through CDP, loads the same confined asset bytes, decodes them with `HTMLImageElement`, draws them to a same-origin Canvas 2D surface, and reads the RGBA raster with `getImageData`.

Before any FR-DATA-05 observation is admitted, the SHA-256 of the newly read RGBA bytes must exactly equal the FR-DATA-04 `rasterSha256` for that capture.

The measurement primitive is identified as:

`canvas_rgba_integer_rgb_sum_neighbors_spatial_moments`

All reported aggregates are exact JavaScript safe integers. If the mathematical maximum for a declared raster could exceed `Number.MAX_SAFE_INTEGER`, the contract fails closed rather than silently losing integer precision.

## Threshold-free observations

For each pixel `(x, y)`:

`I(x,y) = R + G + B`

where each channel is the browser-returned 8-bit RGBA value. Therefore `I` is an integer in `[0, 765]`.

FR-DATA-05 records:

### RGB intensity summary

- minimum `I`
- maximum `I`
- sum of `I`
- sum of `I²`
- count of exact black pixels (`R=G=B=0`)
- count of exact white pixels (`R=G=B=255`)
- count of pixels where any RGB channel is exactly `0`
- count of pixels where any RGB channel is exactly `255`

These are raw channel/intensity observations. They are **not** an exposure adequacy decision.

### Adjacent intensity differences

For every horizontally adjacent pair and vertically adjacent pair, FR-DATA-05 records:

- exact pair count
- sum of `|I₂-I₁|`
- sum of `(I₂-I₁)²`

These are raw local-difference observations. They are **not** a validated sharpness/blur metric and there is no blur cutoff.

### Spatial intensity moments

Using the raster's top-left coordinate origin, FR-DATA-05 records:

- `Σ I(x,y) * x`
- `Σ I(x,y) * y`

These are raw spatial brightness-distribution observations. They are **not** a validated lighting-uniformity metric and there is no lighting cutoff.

### Alpha state

`alphaAllOpaque` must exactly agree with the FR-DATA-04 alpha occupancy counts. This records whether every returned pixel has alpha `255`; it does not declare a capture valid or invalid.

## Deterministic runtime gate

The dedicated workflow:

1. creates deterministic PNG fixtures with independently known RGBA bytes,
2. runs FR-DATA-04 real Chrome raster verification,
3. runs FR-DATA-05 in a second real Chrome/CDP pass,
4. requires the second-pass raster SHA-256 to equal FR-DATA-04 exactly,
5. independently computes the expected FR-DATA-05 integer aggregates from the fixture's known pixel-generation formula,
6. requires exact equality for every raw aggregate,
7. requires deterministic replay,
8. verifies that all quality, anatomical, traditional, and production authority remains closed.

This deliberately proves a stronger boundary than simply accepting self-reported aggregate numbers.

## Explicit non-claims

A successful FR-DATA-05 report does **not** establish any of the following:

- pixel semantic/content integrity
- human face presence
- full-face framing validity
- neutral expression validity
- natural head position validity
- validated sharpness metric
- validated exposure metric
- validated lighting metric
- exposure adequacy
- lighting adequacy
- blur threshold pass
- occlusion validity
- capture-quality metric construct validity
- capture-quality thresholds
- capture-quality authority
- Menton annotation correctness
- MediaPipe inference correctness
- provider candidate → soft-tissue Menton mapping
- repeated-capture repeatability
- pose stability
- FR-35 point/contour relation
- 地閣 equivalence
- FR-36 promotion
- production 三停/F1/F6 authorization
- production geometry authorization

No capture-quality threshold or tolerance is introduced in FR-DATA-05.

## Next evidence step

After FR-DATA-05, a future slice may evaluate whether one or more raw observations are suitable constructs for blur/exposure/lighting assessment and may collect calibration data. That step must be independently evidenced; it must not infer thresholds from this contract alone.
