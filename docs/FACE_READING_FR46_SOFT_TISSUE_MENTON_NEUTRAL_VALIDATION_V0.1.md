# FR-46 — Soft-tissue Menton neutral validation protocol

## Status

FR-46 establishes an **independent neutral anatomical target and validation protocol** for the inferior chin point. It does not map MediaPipe to that target, does not convert the target point into the FR-35 `neutral.face.chin_inferior_contour` curve, and does not equate the target with the traditional `地閣` anchor.

The intended neutral target is **soft-tissue Menton (Me′)**: the most inferior point of the soft-tissue chin on the facial midline / midsagittal plane.

## Independent evidence

### Negi & Chitra 2019

- Title: `Photogrammetric reliability of frontal facial photographs with radiographs and anthropometric measurements`
- DOI: `10.1016/j.jobcr.2019.06.011`
- PMCID: `PMC6593212`
- Population: 300 Indian adults aged 18–25
- Relevant definition: soft-tissue Menton (Me′) is the most inferior point of the soft-tissue chin in the midsagittal plane.
- Relevant result: `N′–Me′` was the measurement reported as reliable across the photographic, cephalometric, and direct anthropometric methods in that study.

Boundary: the authors explicitly conclude that frontal photogrammetry is reliable for only a limited subset of parameters and cannot generally replace radiographic diagnosis. This source therefore supports the **target definition**, not an automated MediaPipe mapping or a MyeongHa calibration threshold.

### Zhang et al. 2024

- Title: `Three-dimensional analysis of hard and soft tissue changes in skeletal class II patients with high mandibular plane angle undergoing surgery`
- DOI: `10.1038/s41598-024-51322-1`
- PMCID: `PMC10827781`
- Relevant 3D soft-tissue definition: Menton′ (Me′) is the lowest point on the midline of the chin.

Boundary: this is a clinical skeletal-Class-II surgical cohort using 3D facial analysis. It supports an independently defined soft-tissue inferior-midline point, but does not supply a 2D MediaPipe correspondence, provider-index semantics, a general-population error threshold, or the FR-35 contour definition.

## Admission gates

FR-46 separates target validity from provider mapping.

| Gate | State | Meaning |
|---|---|---|
| external soft-tissue Menton target | satisfied | independent literature supports a neutral inferior-midline chin point |
| provider candidate → Menton mapping | blocked | no blinded multi-subject comparison dataset |
| provider candidate midline stability | blocked | no reviewed distribution against independent Me′ labels |
| controlled multi-subject capture | blocked | FR-45 has one pinned fixture only |
| repeated-capture repeatability | blocked | replaying one image is not repeated physical capture |
| pose stability | blocked | no yaw/pitch/roll perturbation distribution |
| calibration error thresholds | blocked | no held-out error distribution; no threshold is invented |
| FR-35 point → contour relation | blocked | Me′ is a point; FR-35 requires a curve |
| traditional `地閣` equivalence | blocked | neutral anatomy does not establish traditional-semantic equivalence |

Only the first gate is satisfied.

## Independent annotation protocol

Protocol: `protocol.face.chin_inferior.soft_tissue_menton_annotation.fr46@0.1.0`

Target definition: `most_inferior_midline_point_of_soft_tissue_chin`

Required annotation conditions:

- frontal en-face capture;
- neutral expression;
- natural/protocol-neutral head position;
- normalized 2D image coordinates for scoring;
- annotator is blind to provider output;
- MediaPipe indices, `FACE_OVAL`, and the FR-45 extremum are hidden from the annotator;
- traditional labels are hidden from the annotator;
- the human annotation is frozen before provider scoring.

FR-46 intentionally leaves the following as `null`:

- minimum subject count;
- maximum allowed point error;
- repeatability threshold;
- pose-stability threshold.

Those values require empirical calibration evidence and must not be invented from the FR-45 single fixture.

## Candidate scoring

Scoring algorithm:

`algorithm.validation.chin_inferior.menton_point_distance.fr46@0.1.0`

Input A: a unique fail-closed FR-45 image-space face-oval inferior extremum.

Input B: a provider-blinded, frozen independent Me′ annotation in the same normalized 2D coordinate frame.

Metric:

`normalizedEuclideanDistance = hypot(candidate.x - annotation.x, candidate.y - annotation.y)`

The score is descriptive only:

- `passThreshold = null`
- `passed = null`
- `mappingValidated = false`

A numerical distance by itself cannot promote the mapping.

## Point versus contour

FR-35 defines:

`neutral.face.chin_inferior_contour`

as a **curve** surface.

FR-46 defines/validates a candidate **point** target, soft-tissue Menton.

Therefore the following remain false:

- Me′ may substitute for the FR-35 contour;
- FR-45 face-oval extremum is automatically an extremum of a reviewed chin contour;
- a reviewed contour-membership rule exists;
- a reviewed point-from-contour derivation exists.

A later slice must explicitly define and review this point↔curve relation before FR-35 provider binding can move.

## Authority boundary

FR-46 does **not** authorize:

- `provider index 152 = soft-tissue Menton`;
- `FACE_OVAL inferior extremum = soft-tissue Menton` without independent validation;
- single-fixture evidence as generalized geometry;
- Me′ = `neutral.face.chin_inferior_contour`;
- Me′ = `地閣`;
- FR-36 dige vertical-reference promotion;
- Three Divisions production metrics;
- F1 or F6.

## Next evidence required

1. Provider-blinded multi-subject frontal neutral captures with frozen independent Me′ annotations.
2. Repeated physical captures and bounded pose perturbations.
3. Held-out error distributions from which calibration thresholds can be reviewed.
4. A reviewed geometric relation between Me′ and the FR-35 chin-inferior contour curve.
5. Separate traditional-neutral equivalence review before any `地閣` or 三停 promotion.
