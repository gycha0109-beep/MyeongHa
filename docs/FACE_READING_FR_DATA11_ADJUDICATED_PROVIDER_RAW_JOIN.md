# FR-DATA-11 — Adjudicated Outcome × Provider Raw Evidence Join

## Purpose

FR-DATA-10 freezes explicit provider-blind human adjudication outcomes, including `indeterminate` and adjudication-only `unresolved`. FR-DATA-09 binds each FR-DATA-07 provider run reference to the exact FR-DATA-06 report instance and capture observation.

FR-DATA-11 joins those two already-validated evidence surfaces at capture level. The result is a raw cross-tab only. It is not a confusion matrix and it does not authorize classification metrics.

## Inputs

FR-DATA-11 requires:

- FR-DATA-07 independent face-count dataset;
- frozen FR-DATA-10 adjudication dataset;
- FR-DATA-06 provider face-candidate observation report.

Before emitting any FR-DATA-11 report, the builder executes the FR-DATA-10 adjudication report validation and FR-DATA-09 provider-run identity binding validation.

## Exact join keys

Every capture must match across all upstream surfaces by:

- `datasetRef`;
- exact capture-ref set;
- canonical asset digest;
- FR-DATA-09 exact provider-run report-instance/capture binding;
- frozen FR-DATA-10 adjudication-ledger digest.

A missing, substituted, duplicated, or drifted capture fails closed.

## Join unit

The unit is:

`capture_adjudication_provider_observation`

Each emitted row contains:

- capture ref;
- calibration/holdout partition as already assigned by FR-DATA-07;
- canonical asset digest;
- FR-DATA-10 adjudication outcome;
- provider candidate count;
- provider candidate-count bucket;
- exact provider run ref;
- exact provider report digest;
- frozen adjudication-ledger digest.

Provider candidate count remains constrained by the existing `numFaces: 1` FR-DATA-06 runtime contract:

- `0` → `zero_provider_candidates`
- `1` → `one_provider_candidate`

This is provider output vocabulary only. It is not human-face-count authority.

## Raw cross-tab

The cross-tab preserves all five FR-DATA-10 outcomes:

1. `zero_human_faces`
2. `one_human_face`
3. `multiple_human_faces`
4. `indeterminate`
5. `unresolved`

For each outcome, FR-DATA-11 records only the number of captures with zero or one provider candidate.

`indeterminate` and `unresolved` remain distinct and cannot be silently removed.

## Why this is not a confusion matrix

FR-DATA-10 explicitly does not establish reviewed empirical ground-truth authority. FR-DATA-06/09 explicitly do not establish that a provider candidate is a human face.

Therefore FR-DATA-11 does not authorize:

- TP / FP / TN / FN terminology;
- sensitivity or specificity;
- precision or recall;
- accuracy;
- F-score;
- ROC or AUC;
- provider decision thresholds;
- acceptance criteria.

An explicit later metric-eligibility policy would have to define which human adjudication outcomes are eligible for which metric semantics. FR-DATA-11 does not invent that policy.

## Holdout boundary

FR-DATA-11 reports raw calibration and holdout evidence using partitions already frozen upstream. Holdout behavior may not be used to invent or tune a metric-eligibility policy, adjudication rule, or provider decision threshold.

## What a successful report may state

It may state that:

- a frozen FR-DATA-10 adjudication ledger was bound before this join was emitted;
- every capture has an exact FR-DATA-09 provider-run binding;
- every capture joins on the exact asset digest;
- every adjudication outcome is preserved as recorded;
- the provider candidate count is preserved as raw provider evidence;
- a five-row raw cross-tab was computed.

## What remains false

FR-DATA-11 does not validate or authorize:

- capture-level ground-truth authority;
- inter-annotator ground-truth authority;
- provider detection construct validity;
- provider candidate ↔ human-face equivalence;
- face presence or single-human-face authority;
- classification metrics;
- metric eligibility policy;
- decision or calibration thresholds;
- holdout tuning;
- external provider execution identity;
- near-duplicate / burst / transformed-image leakage exclusion;
- reviewed empirical validation;
- capture-quality authority;
- anatomical landmark authority;
- Menton / 地閣 equivalence;
- FR-35 contour binding;
- FR-36 promotion;
- 三停 / F1 / F6 production authorization;
- research-candidate admission;
- production geometry.

## Synthetic CI boundary

Dedicated tests use synthetic typed metadata only to verify exact joins, raw cross-tab preservation, `indeterminate` / `unresolved` retention, provider-run drift rejection, frozen-ledger requirements, and fail-closed metric/semantic/production authority.

Synthetic fixtures are contract self-tests only. They are not empirical human-face evidence.

## Next step

The next coherent slice is a separate **metric-eligibility / evaluation-semantics authority**. That slice must define, without inspecting holdout performance, whether any adjudicated outcomes can legitimately participate in binary or multiclass metric definitions.

Until such a policy is independently justified and frozen, FR-DATA-11 remains raw evidence organization only.
