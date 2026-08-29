# FACE READING FR-44 — Preregistered Eyebrow Component-Role Scoring v0.1

## Status

**Scoring rule preregistered / acceptance thresholds unset / provider anatomical role mapping remains unvalidated**

FR-43 defined how an eyebrow validation dataset must be captured and independently annotated before MediaPipe provider output can enter scoring.

FR-44 defines the scoring rule **before seeing a future validation dataset result**.

It does not create a synthetic pass criterion and does not promote FR-42's image-upper observation into ground truth.

## Purpose

The remaining question is not:

> which component is higher in the image?

FR-42 already measured that on one pinned fixture.

The validation question is:

> which of the two provider components is geometrically closer to an independently annotated anatomical upper rim, while the other component is closer to the independently annotated lower rim?

FR-44 answers only how that comparison must be scored.

## Coordinate and distance contract

Input curves are finite normalized image coordinates in `[0,1] × [0,1]`.

For two point-sampled curves `A` and `B`:

1. compute the Euclidean nearest-neighbor distance from every point in `A` to `B`;
2. average those distances;
3. compute the reverse directed mean from `B` to `A`;
4. average the two directed means.

The resulting metric is recorded as:

`symmetric_mean_nearest_neighbor_l2_normalized_xy`

This scoring distance is an evaluation device only. It is not a production eyebrow-geometry algorithm and does not grant anatomical authority to provider indices.

## Two-assignment comparison

For each provider-labeled eyebrow side, four distances are recorded:

- component 1 → independent upper rim
- component 1 → independent lower rim
- component 2 → independent upper rim
- component 2 → independent lower rim

Two mutually exclusive assignment costs are then computed:

```text
A = d(component1, upper) + d(component2, lower)
B = d(component2, upper) + d(component1, lower)
```

Observed assignment:

- `A < B` → `component_1_upper_component_2_lower`
- `B < A` → `component_2_upper_component_1_lower`
- exact equality → `assignment_tie`

No epsilon, confidence cutoff, or minimum margin is invented in FR-44.

The absolute difference `|A - B|` is emitted as observational evidence for later calibration review.

## What is deliberately excluded

The scoring formula does not use:

- normalized image `y` ordering from FR-42
- the fact that FR-42 observed component 2 above component 1
- provider serialization order as a ground-truth role
- traditional physiognomy semantics
- a post-hoc threshold chosen after observing the result

Provider ordinal is used only as an identifier so that the two possible assignments can be stated deterministically.

## Dataset integration

FR-44 accepts only a valid `fr43-dataset-v1` dataset.

Before scoring:

- ground truth must already be frozen;
- provider runs must be attested as occurring after freeze;
- every scoring capture must exactly match one FR-43 capture;
- every supplied upper/lower rim curve must cite an annotator present in the provider-blinded FR-43 ground-truth records for that capture;
- left/right provider slots must remain explicit.

This prevents a scoring payload from silently introducing a provider-informed label outside the FR-43 dataset authority.

## Preregistered report outputs

The report emits:

1. per-side four-way distance matrix
2. the two assignment total costs
3. absolute assignment-cost margin
4. observed best assignment or exact tie
5. bilateral assignment concordance per capture
6. capture counts per FR-43 stratum
7. aggregate assignment counts

Each capture's `mappingPassFailDecision` remains `null`.

## Acceptance thresholds

All remain unset:

- minimum assignment-cost margin: `null`
- mapping accuracy: `null`
- bilateral concordance: `null`
- repeatability error: `null`
- pose error: `null`
- expression error: `null`

The report also keeps the following unavailable:

- mapping accuracy
- repeatability error
- pose error
- expression error

Those require actual reviewed dataset results and a later calibration methodology. FR-44 does not manufacture them from a synthetic fixture.

## Authority boundary

All remain false:

- scoring rule means provider role mapping validated
- lowest-cost assignment grants anatomical authority
- FR-42 image-upper signal may enter the scoring formula
- provider ordinal may define ground truth
- post-hoc threshold selection is allowed
- pass/fail is allowed without reviewed thresholds
- provider component-role mapping authorization
- neutral brow geometry authorization
- brow-midline algorithm authorization
- production Three Divisions metric
- production F1
- production F6

## Result

FR-44 closes the **scoring-method preregistration** gap while intentionally leaving the empirical-validation and calibration gates open.

The next legitimate slice must either acquire a real provider-blinded FR-43 dataset or define the calibration/review artifact that will consume real FR-44 observational scores without moving the scoring rule after results are known.
