# FR-DATA-08 — Provider Face-Count Raw Scoring Join

## Purpose

FR-DATA-07 defines provider-blind human face-count annotation and freeze ordering. FR-DATA-06 records the pinned MediaPipe Face Landmarker provider candidate count for the exact decoded image raster.

FR-DATA-08 joins those two evidence surfaces without inventing a consensus ground truth, performance threshold, or production claim.

The join is descriptive evidence only.

## Why this is a raw cross-tab, not a confusion matrix

FR-DATA-07 deliberately leaves the following empirical decisions unset:

- minimum independent annotators per capture;
- inter-annotator agreement threshold;
- disagreement adjudication rule;
- provider decision threshold;
- acceptable false-positive / false-negative rates.

Therefore multiple independent annotators may disagree about the same capture and there is not yet an authorized rule for collapsing those labels into one capture-level truth label.

Calling the result a TP/FP/FN confusion matrix would silently introduce ground-truth authority that does not exist.

FR-DATA-08 instead uses `annotation_provider_pair` as the raw scoring unit and preserves every independent annotation separately.

## Exact join boundary

FR-DATA-08 requires:

1. FR-DATA-07 dataset schema `fr-data07-independent-face-ground-truth-v1`;
2. FR-DATA-06 report schema `fr-data06-provider-face-candidate-observation-v1`;
3. exact `datasetRef` equality;
4. exact capture-ref set equality;
5. exact canonical encoded asset digest equality for every capture;
6. a frozen FR-DATA-07 annotation ledger;
7. FR-DATA-07 provider runs recorded after annotation freeze;
8. at least one independent annotation for every capture;
9. both `calibration` and `holdout` partitions.

A capture is not silently dropped when annotation or provider evidence is missing.

## Provider observation classes

The pinned FR-DATA-06 runtime has `numFaces = 1`, so the preregistered provider count domain is exactly:

- `0` → `zero_provider_candidates`
- `1` → `one_provider_candidate`

A value outside `0..1` fails closed.

This is a provider-output class only. It does **not** mean:

- zero provider candidates = no human face;
- one provider candidate = one human face.

## Human labels remain independent

FR-DATA-08 preserves all four FR-DATA-07 labels:

- `zero_human_faces`
- `one_human_face`
- `multiple_human_faces`
- `indeterminate`

`indeterminate` remains its own raw row and is never coerced into positive or negative.

For each capture, FR-DATA-08 records only:

- annotation count;
- count of each raw human label;
- whether more than one distinct human label was observed;
- provider candidate count/class.

It does not derive a consensus label.

## Partition output

The report emits separate `calibration` and `holdout` summaries.

Each summary contains:

- capture count;
- annotation-provider pair count;
- capture count with annotator disagreement;
- a four-row human-label × provider-class raw cross-tab.

The holdout output is descriptive evaluation evidence only. It may not be used to tune labels or thresholds.

## Deliberately absent metrics

FR-DATA-08 does not compute or authorize:

- true positives / false positives / true negatives / false negatives;
- sensitivity / recall;
- specificity;
- false-positive rate;
- false-negative rate;
- accuracy;
- precision;
- F-score;
- ROC / AUC;
- provider decision thresholds;
- acceptance criteria.

Those require a separately reviewed ground-truth/adjudication authority and preregistered evaluation design.

## Remaining evidence gaps

Even when a raw FR-DATA-08 report is successfully built, the following remain false:

- provider-run identity binding between the FR-DATA-07 `providerRunRef` metadata and the FR-DATA-06 report instance;
- canonical reconstruction of the entire FR-DATA-06 report from FR-DATA-01..05 prerequisites inside this slice;
- inter-annotator ground-truth authority;
- near-duplicate / burst-frame / transformed-image partition leakage validation;
- provider detection construct validity;
- provider candidate ↔ human-face identity validity;
- human-face presence verification;
- single-human-face verification;
- capture-quality authority;
- anatomical landmark authority;
- Menton / 地閣 equivalence;
- FR-35 contour binding;
- FR-36 vertical-reference promotion;
- 三停 / F1 / F6 production authorization;
- production geometry authorization.

These gaps are explicit blockers, not implicit assumptions.

## CI scope

The dedicated CI uses synthetic metadata only to test the contract. It proves that:

- exact capture/digest joins work;
- disagreement is preserved rather than collapsed;
- `indeterminate` stays separate;
- calibration and holdout cross-tabs are deterministic;
- capture-set drift, digest drift, missing annotations, invalid provider count, unfrozen ledgers, and upstream authority promotion fail closed;
- all semantic and production promotion remains blocked.

Synthetic CI metadata is not empirical human-face validation evidence.

## Next step

The next legitimate step is not to invent performance thresholds.

A future slice should address the **ground-truth adjudication / reviewer authority protocol** and provider-run report identity binding, then collect real multi-subject physical capture data under the frozen protocol. Only after that evidence exists should TP/FP/FN-style metrics or acceptance criteria be considered.
