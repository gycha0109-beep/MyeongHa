# FR-DATA-12 — Metric Eligibility / Evaluation Semantics Readiness

## Purpose

FR-DATA-11 organizes frozen provider-blind adjudication outcomes and exact provider observations into a raw cross-tab. It explicitly does not define a confusion matrix or classification metrics.

FR-DATA-12 does not fill that gap by guessing semantics. Instead, it defines the prerequisites that must exist before metric roles, exclusions, denominators, or classification metrics can be authorized, then records that the current evidence chain is still blocked.

## Why no positive/negative mapping is defined

The current evidence does not justify assumptions such as:

- `zero_human_faces` means a metric-negative class;
- `one_human_face` means a metric-positive class;
- `multiple_human_faces` may be collapsed into either binary class;
- `indeterminate` may be excluded;
- `unresolved` may be excluded;
- `zero_provider_candidates` means a metric-negative provider output;
- `one_provider_candidate` means a metric-positive provider output.

Those choices would be evaluation semantics, not mechanical consequences of the field names.

FR-DATA-12 therefore leaves all binary role mappings, multiclass mapping references, exclusion policy, and denominator policy undefined.

## Upstream prerequisite

The builder reconstructs FR-DATA-11 from the exact upstream inputs:

- FR-DATA-07 independent human annotations;
- frozen FR-DATA-10 provider-blind adjudication ledger;
- FR-DATA-06 provider observations;
- FR-DATA-09 exact provider-run binding transitively enforced by FR-DATA-11.

The readiness assessment is emitted only after the FR-DATA-11 exact raw join succeeds.

## Current blockers

FR-DATA-12 records the following unresolved prerequisites:

1. reviewed capture-level ground-truth authority;
2. provider detection construct validity;
3. provider-candidate ↔ human-face identity validity;
4. explicit human-outcome metric-role policy;
5. explicit provider-output metric-role policy;
6. explicit outcome-exclusion policy;
7. explicit metric-denominator policy;
8. evaluation-policy freeze before holdout inspection;
9. a new unseen holdout collected/admitted after that policy freeze for confirmatory metrics.

These are blockers, not inferred facts.

## Holdout boundary

Neither calibration performance nor holdout performance may be used to invent evaluation semantics.

There is an additional non-retroactivity constraint: **FR-DATA-11 already materializes the pairing between holdout adjudication outcomes and provider candidate counts.** Therefore the existing FR-DATA-11 holdout cannot later be relabeled as a policy-preregistered confirmatory holdout after metric semantics are chosen.

For any future confirmatory performance claim:

1. the evaluation semantics must first be justified and frozen;
2. then a new unseen holdout must be admitted without using its provider behavior to change the policy;
3. only that new untouched holdout could become eligible for confirmatory metric evaluation, subject to all other authority gaps also being closed.

The existing FR-DATA-11 holdout may remain research/exploratory evidence, but FR-DATA-12 does not authorize it as future preregistered confirmatory evidence.

In particular, already materialized holdout results cannot be used to decide:

- which human outcomes count as positive or negative;
- which outcomes are excluded;
- which provider bucket is positive or negative;
- which denominator produces a preferred metric;
- which threshold gives a preferred score.

## Undefined empirical quantities

FR-DATA-12 does not invent:

- minimum evaluation sample size;
- minimum samples per class;
- acceptance threshold;
- binary provider decision threshold;
- agreement threshold;
- performance target.

These remain `null` or otherwise unauthorized.

## What a successful readiness report may state

It may state only that:

- the exact FR-DATA-11 raw join is available;
- the FR-DATA-10 adjudication ledger is frozen;
- exact provider-run binding is preserved;
- `indeterminate` remains present;
- `unresolved` remains present;
- the raw cross-tab remains non-confusion-matrix evidence;
- FR-DATA-11 has already materialized the current holdout outcome/provider pairing;
- the current holdout is not eligible to be retroactively treated as a future policy-preregistered confirmatory holdout;
- a new unseen holdout is required after evaluation-policy freeze for any future confirmatory metric claim;
- metric semantics are blocked because named prerequisites remain unresolved.

## What remains false

FR-DATA-12 does not establish or authorize:

- reviewed ground-truth authority;
- inter-annotator ground-truth authority;
- provider detection construct validity;
- provider candidate ↔ human-face identity;
- positive/negative class mapping;
- multiclass mapping;
- exclusion policy;
- metric denominator policy;
- confusion-matrix terminology;
- TP / FP / TN / FN;
- sensitivity / specificity;
- accuracy / precision / recall / F-score;
- ROC / AUC;
- provider decision thresholds;
- calibration thresholds;
- retrospective requalification of the existing holdout as preregistered confirmatory evidence;
- holdout tuning;
- near-duplicate / burst / transformed-image leakage validation;
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

Dedicated tests use synthetic typed metadata only to verify the readiness gate and its fail-closed semantics. They do not supply reviewed human-face evidence, validate MediaPipe as a human-face detector, or establish metric performance.

## Next step

The next step should not be metric computation. The current blockers show that a meaningful evaluation policy still depends on external authority work.

A coherent next slice is to define a **provider detection construct-validation protocol** or a **reviewed ground-truth admission protocol**. Either must remain separate from observed holdout performance and must not manufacture empirical thresholds merely to unblock CI. Once a metric policy is eventually justified and frozen, confirmatory evaluation must use a new unseen holdout rather than the already-materialized FR-DATA-11 holdout.
