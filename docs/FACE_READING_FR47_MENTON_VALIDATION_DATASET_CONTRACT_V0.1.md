# FR-47 — Provider-blind soft-tissue Menton validation dataset contract

## Status

FR-47 defines the dataset structure required to test the FR-45 face-oval inferior-extremum candidate against the independent soft-tissue Menton (Me′) target established by FR-46.

It does **not** claim that such a reviewed dataset currently exists, and a structurally complete dataset does not itself validate the provider mapping.

## Upstream authority

FR-46 established:

- an independently supported neutral target: soft-tissue Menton (Me′), the most inferior midline point of the soft-tissue chin;
- provider-blind annotation requirements;
- annotation freeze before provider scoring;
- descriptive candidate-to-Me′ Euclidean distance scoring;
- no calibration threshold;
- no FR-35 contour binding;
- no `地閣` equivalence.

FR-47 preserves all of those boundaries.

## Dataset partitioning

Every subject is assigned once at the **subject level** to exactly one research partition:

- `calibration`
- `holdout`

The same subject must not appear in both partitions. The holdout partition is not available for post-hoc threshold tuning.

This separation is a research-validation mechanism, not Primary Source semantic authority.

## Required physical-capture strata

Each subject is expected to provide the following strata for readiness assessment:

1. `neutral_frontal_baseline`
2. `repeat_neutral_capture`
3. `pose_yaw_perturbation`
4. `pose_pitch_perturbation`
5. `pose_roll_perturbation`

Baseline and repeat must have distinct `physicalCaptureInstanceRef` values. Re-running inference twice on one image cannot satisfy repeated physical capture evidence.

Pose captures must record the appropriate axis and a finite, non-zero **signed degree value**. FR-47 intentionally does not define an accepted pose magnitude; `allowedPoseMagnitudeDegrees` remains `null` until empirical review.

All captures retain:

- immutable asset digest;
- capture timestamp;
- image dimensions;
- device reference;
- neutral-expression instruction;
- head-position instruction;
- subject linkage.

## Independent annotation

Every Me′ annotation must remain compatible with the FR-46 independent annotation protocol:

- target = `soft_tissue_menton`;
- normalized 2D coordinates;
- provider output invisible during annotation;
- annotation frozen before provider scoring.

Provider indices, the exact `FACE_OVAL`, the FR-45 candidate, and the observed single-fixture index `152` may not define ground truth.

Annotation records are keyed by `(captureRef, annotatorRef)` and must reference known captures.

## Freeze order and provider execution

Provider execution may be attached only after ground truth has been frozen.

If a dataset claims `providerRunsExecutedAfterFreeze = true`:

- `groundTruthFrozen` must be true;
- every capture must have a provider run reference;
- every provider run must explicitly state it occurred after ground-truth lock;
- every capture must already have independent Me′ annotation coverage.

This is an ordering/provenance rule only. It does not make the provider output anatomically correct.

## Thresholds deliberately unset

The following remain `null`:

- minimum subject count;
- minimum captures per stratum;
- minimum independent annotators per capture;
- maximum point error;
- repeatability error threshold;
- pose error threshold;
- allowed pose magnitude.

Those values must come from reviewed empirical distributions and a preregistered scoring/calibration slice. They are not inferred from FR-45's single pinned fixture or invented to make a dataset pass.

## Readiness versus validation

A structurally complete dataset may establish only that the required evidence **can be scored**:

- calibration and holdout subjects exist;
- each subject has the required capture strata;
- baseline and repeat are distinct physical captures;
- yaw/pitch/roll samples are labeled;
- each capture has independent Me′ annotation;
- ground truth was frozen before provider execution;
- provider output is available for every capture.

Even when every item above is true, FR-47 still returns:

- provider candidate → Menton mapping validated: `false`;
- repeatability validated: `false`;
- pose stability validated: `false`;
- calibration thresholds defined: `false`;
- research candidate admitted: `false`;
- production geometry authorized: `false`.

Those require a later scoring/calibration review.

## Authority boundary

FR-47 does not authorize:

- dataset contract = reviewed dataset exists;
- dataset presence = provider mapping validated;
- holdout data used to tune thresholds;
- provider index = anatomical ground truth;
- provider index `152` = Me′;
- repeated inference on one image = repeated physical capture;
- unlabeled pose data = pose evidence;
- invented pose or point-error thresholds;
- Me′ point = FR-35 `neutral.face.chin_inferior_contour` curve;
- Me′ = `地閣`;
- FR-36 vertical-reference promotion;
- production 三停 metrics;
- F1 or F6.

## Next slice

FR-48 should preregister the scoring and calibration procedure that consumes a reviewed FR-47 dataset:

1. derive candidate-to-Me′ error distributions separately for calibration and untouched holdout subjects;
2. quantify physical-repeat error and yaw/pitch/roll stability;
3. prohibit threshold selection from holdout outcomes;
4. leave all thresholds unset until actual dataset evidence is reviewed;
5. keep FR-35 point↔curve and `地閣` equivalence as separate gates.
