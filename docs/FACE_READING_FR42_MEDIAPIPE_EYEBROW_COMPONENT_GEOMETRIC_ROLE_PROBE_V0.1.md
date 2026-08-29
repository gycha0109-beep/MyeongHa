# FACE READING FR-42 — MediaPipe Eyebrow Component Geometric Role Probe v0.1

## Status

**Single-fixture real-runtime image-space signal observed / provider anatomical role mapping remains blocked**

FR-41 established an external neutral target model with medial/lateral eyebrow endpoints and separate upper/lower boundary curves, while keeping the MediaPipe component-role mapping unresolved.

FR-42 attacks that unresolved gate experimentally instead of assigning semantics from provider source order.

## Question

Given the exact published MediaPipe eyebrow components and one controlled pinned face fixture:

> do the two disconnected provider components occupy a reproducibly different vertical position in normalized image space?

This is deliberately narrower than:

> which component is the anatomical upper/lower eyebrow boundary?

The first question can be measured from provider coordinates. The second requires independent anatomical mapping evidence and broader reproducibility/calibration.

## Exact runtime provenance

The dedicated probe reuses the already pinned FR-27 runtime inputs:

- package: `@mediapipe/tasks-vision@0.10.35`
- package bundle SHA-256: `55d7ab624fbb70dcc5adc4ae6d7ea9cfcb569139d3dbfbf2b1deafcb966bc0fe`
- model: official `face_landmarker.task` float16/1
- model SHA-256: `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff`
- fixture repository: `google-ai-edge/mediapipe-samples-web`
- fixture commit: `bbb8974ffd450650ad5a1e7c1656c9debb8e38bf`
- fixture blob: `7ec9d163603c98159d283b6ceb9086f9794d1dc9`
- fixture SHA-256: `75171e877e92b7a126cca2e7a388fc430225e07e9cd2e9e801eaa67ea6d7f4d9`

The probe runs in real headless Chrome and performs two detections of the same image.

## Measurement contract

For each provider-labeled eyebrow side independently:

1. FR-39 exact published topology is decomposed into its two 4-edge / 5-vertex components.
2. Each component's five unique provider vertices are resolved from the detected 478 normalized face landmarks.
3. For each component, FR-42 records mean, median, minimum, and maximum normalized `y`.
4. The component with smaller **mean normalized y** is recorded only as the component that is more image-upper by this aggregate statistic.
5. Exact two-replay determinism is required for the emitted probe object.

No hand-selected numeric separation threshold is introduced in FR-42.

## Discovery run

Initial discovery was executed by GitHub Actions workflow run `33256613542` against head commit:

`28ca9ee6e28313ef06368534f988abdb1b5a2eca`

Runtime:

- Chrome: `Google Chrome 151.0.7922.173`
- detected faces: `1`
- face landmarks: `478`
- exact replay equality: `true`

Observed left eyebrow:

| Component | Mean y | Median y | Min y | Max y |
| --- | ---: | ---: | ---: | ---: |
| 1 `[276,282,283,285,295]` | 0.3069044589996338 | 0.30272361636161804 | 0.29790958762168884 | 0.3190644085407257 |
| 2 `[293,296,300,334,336]` | 0.29455171823501586 | 0.291939914226532 | 0.28602972626686096 | 0.30588704347610474 |

Result: `component_2_image_upper`, absolute mean-y delta `0.012352740764617953`.

Observed right eyebrow:

| Component | Mean y | Median y | Min y | Max y |
| --- | ---: | ---: | ---: | ---: |
| 1 `[46,52,53,55,65]` | 0.3180065035820007 | 0.3163846731185913 | 0.31041011214256287 | 0.3281524181365967 |
| 2 `[63,66,70,105,107]` | 0.3062162816524506 | 0.3034819960594177 | 0.2988683581352234 | 0.321939617395401 |

Result: `component_2_image_upper`, absolute mean-y delta `0.011790221929550149`.

Thus the pinned fixture gives a coherent bilateral signal: **serialization ordinal 2 is image-upper by mean normalized y on both provider-labeled sides**.

This observation is now an execution-evidence contract, not anatomical authority.

## Coordinate scope

MediaPipe image coordinates use normalized image x/y and a top-left image origin. Therefore smaller normalized `y` corresponds to a position higher in the image.

This fact authorizes only an **image-coordinate interpretation**. It does not authorize anatomical eyebrow semantics.

## Explicit non-equivalences

FR-42 does **not** infer any of the following:

```text
image-upper provider component
  == anatomical upper eyebrow boundary

image-lower provider component
  == anatomical lower eyebrow boundary

same serialization ordinal image-upper on both sides
  == serialization ordinal has semantic meaning

mean-y ordering
  == pointwise upper/lower correspondence
```

Provider landmark indices remain evidence coordinates, not neutral anatomical landmark authority.

## Runtime evidence artifact

Workflow: `Face Reading Eyebrow Component Role Probe`  
Script: `scripts/face-reading-fr42-eyebrow-component-role-probe.mjs`  
Artifact: `artifacts/face-reading/fr42-eyebrow-component-role-probe.json`

The workflow now attests the discovered qualitative signal (`component_2_image_upper` on both sides) while still forbidding authority promotion.

The script explicitly clears its CDP evaluation timeout after success and waits for Chrome process exit before recursive temp-profile removal; this avoids the lingering timer and cleanup race patterns observed in the older FR-27 harness.

## Why one fixture cannot close the mapping gate

A single image cannot establish:

- cross-subject reproducibility
- repeated-capture repeatability
- pose stability
- expression stability
- capture-device stability
- population robustness
- calibration error thresholds
- independent anatomical labeling accuracy

FR-42 therefore intentionally defines `minimumIndependentSubjectsForRoleAdmission: null` rather than inventing an unsupported sample-size threshold.

## Authority boundary

All remain false:

- image-upper means anatomical upper boundary
- single-fixture signal means provider role mapping
- same ordinal signal on both sides means provider serialization semantics
- mean-y statistic means pointwise correspondence
- provider index means anatomical landmark authority
- runtime probe may promote the FR-41 provider mapping gate
- research candidate admission
- brow-midline algorithm authorization
- production Three Divisions metric
- production F1
- production F6

## Result

FR-42 has moved the eyebrow question from **“unknown provider topology semantics”** to **“one exact runtime fixture exhibits a deterministic bilateral image-space ordering signal.”**

That is genuine evidence progress, but the FR-41 `provider_component_role_mapping` gate remains blocked.

## Next slice

FR-43 should define an independently labeled, controlled multi-capture validation protocol for the component-role hypothesis. Its ground truth must come from an external anatomical upper/lower eyebrow boundary annotation protocol, never from MediaPipe component serialization order.
