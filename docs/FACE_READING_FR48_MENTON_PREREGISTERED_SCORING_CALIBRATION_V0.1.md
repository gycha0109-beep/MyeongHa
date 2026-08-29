# FR-48 — Preregistered Menton Scoring / Calibration Contract v0.1

## Purpose

FR-48 freezes the descriptive scoring method that will be applied to a future FR-47-compliant, provider-blind Menton validation dataset. It does **not** claim that the MediaPipe face-oval inferior extremum is Menton, and it does not admit production geometry.

## Upstream authority

- FR-45: exact `FACE_LANDMARKS_FACE_OVAL` provider-neutral image-inferior-extremum candidate.
- FR-46: independent neutral soft-tissue Menton (`Me′`) target and point-distance scoring primitive.
- FR-47: provider-blind, frozen-annotation, subject-level calibration/holdout dataset contract with real physical repeats and labeled yaw/pitch/roll perturbations.

## Preregistered metrics

FR-48 fixes the following calculations before reviewed empirical results exist:

1. Candidate → independent Menton error: normalized image-space Euclidean L2 for every independent annotation.
2. Capture aggregation: mean and maximum annotation error.
3. Physical-repeat candidate displacement: L2 distance between baseline and repeat provider candidate points for the same subject.
4. Physical-repeat error change: absolute difference between baseline and repeat mean Menton error.
5. Pose error: mean Menton point error for each labeled yaw, pitch, and roll perturbation capture.
6. Partition reporting: calibration and holdout summaries are always reported separately.

The provider landmark index is preserved only as observed provenance. It is never anatomical ground truth, including observed index `152`.

## Calibration / holdout boundary

Calibration results may only inform a later threshold proposal **after separate review**. FR-48 itself never proposes or applies thresholds.

The holdout partition may not be used to tune thresholds. Its role is reserved for later generalization validation after a calibration-derived proposal has been independently reviewed and frozen.

## Intentionally unset

All acceptance values remain `null`:

- maximum mean Menton point error
- maximum capture Menton point error
- maximum repeat candidate displacement
- maximum repeat Menton error delta
- maximum pose Menton error
- minimum holdout subject count

Therefore all mapping/repeatability/pose pass-fail decisions remain `null`.

## Fail-closed authority

Even a structurally complete synthetic or future real report does not itself establish:

- provider candidate → Menton mapping validity
- repeatability validity
- pose stability
- reviewed calibration thresholds
- FR-35 `neutral.face.chin_inferior_contour` binding
- traditional `地閣` equivalence
- FR-36 vertical-reference promotion
- production 三停 metrics
- production F1/F6

## Next required evidence

The next evidence-bearing step is not another threshold contract. It is a **real FR-47-compliant multi-subject capture dataset**, independently annotated and frozen before provider execution, followed by FR-48 descriptive scoring and review. Only after reviewing the calibration error distributions may a separate threshold-proposal gate be considered. The holdout set must remain untouched until that proposal is frozen.
