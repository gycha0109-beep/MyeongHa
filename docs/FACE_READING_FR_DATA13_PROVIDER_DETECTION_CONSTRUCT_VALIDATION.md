# FR-DATA-13 — Provider Detection Construct Validation Protocol

## Purpose

FR-DATA-06 records what the pinned MediaPipe Face Landmarker runtime returned. FR-DATA-07/10 create provider-blind human annotation/adjudication contracts. FR-DATA-11 joins those frozen human outcomes to provider candidate counts as raw evidence. FR-DATA-12 then blocks classification metrics because evaluation semantics and reviewed empirical authority are still missing.

FR-DATA-13 addresses the next gap: **before provider candidate counts can be treated as evidence about human faces, the intended detection construct itself must be explicitly defined and independently validated.**

This slice defines that validation protocol/readiness boundary. It does not claim that MediaPipe has been validated as a human-face detector for MyeongHa.

## Current provider output boundary

The pinned FR-DATA-06 runtime configuration is:

- provider runtime: `mediapipe_tasks_vision_face_landmarker`;
- package: `@mediapipe/tasks-vision@0.10.35`;
- running mode: `IMAGE`;
- `numFaces = 1`.

Under this configuration, the provider candidate-count observation is restricted to the configured `0..1` range.

That is a provider output domain, not a human-face semantic claim.

Therefore FR-DATA-13 explicitly rejects all of the following inferences:

- `0 provider candidates` means `0 human faces`;
- `1 provider candidate` means `1 human face`;
- `numFaces = 1` means the capture contains exactly one human face;
- candidate count alone represents exact human face count;
- candidate count alone can represent `multiple_human_faces` exactly under this runtime configuration.

The last point is a representational constraint: an output whose configured count range is at most one cannot, by candidate count alone, encode an exact count greater than one.

## No target construct is selected

FR-DATA-13 deliberately does **not** choose whether the provider should be validated for:

- binary human-face presence;
- exact-single-human-face detection;
- exact human-face count;
- another future construct.

Those are different tasks with different semantics and failure modes. Selecting one from provider output names or from observed performance would manufacture the evaluation target after seeing evidence.

A future construct definition must therefore be explicit before confirmatory scoring begins.

## Human outcome handling remains undefined

FR-DATA-10 outcomes are:

- `zero_human_faces`;
- `one_human_face`;
- `multiple_human_faces`;
- `indeterminate`;
- `unresolved`.

FR-DATA-13 does not silently:

- collapse `multiple_human_faces` into a binary class;
- exclude `indeterminate`;
- exclude `unresolved`;
- turn label names into positive/negative roles.

A future construct specification must define scope and outcome handling before validation-data inspection.

## Reference-standard requirement

A provider-blind human annotation/adjudication chain is necessary but not sufficient for reviewed reference-standard authority.

FR-DATA-07 and FR-DATA-10 currently prove contract properties such as provider blindness, ledger freezing, exact annotation review coverage, and preservation of unresolved outcomes. They do not, by synthetic/self-test success alone, prove that the resulting labels are empirically valid ground truth.

FR-DATA-13 therefore requires a separately reviewed human reference-standard authority before provider construct validity may be promoted.

## Holdout non-retroactivity

FR-DATA-12 established that FR-DATA-11 already materializes the pairing between current holdout human outcomes and provider candidate counts.

FR-DATA-13 carries that boundary forward:

- the current FR-DATA-11 holdout may remain exploratory/research evidence;
- it may not later be reclassified as a future preregistered construct-validation holdout;
- a new unseen construct-validation dataset is required after the construct protocol is defined and frozen.

This prevents choosing a construct or acceptance rule after seeing current holdout behavior and then describing that same evidence as confirmatory.

## Required future construct-validation evidence

FR-DATA-13 records the following unresolved prerequisites:

1. explicit construct target definition;
2. reviewed human reference-standard authority;
3. capture-domain scope definition;
4. explicit out-of-scope outcome handling policy;
5. construct-validation protocol freeze before provider-output inspection;
6. new unseen construct-validation dataset after protocol freeze;
7. near-duplicate / burst / transformed-image leakage control;
8. acceptance criteria defined before validation-data inspection;
9. empirical provider-candidate ↔ human-face identity validation evidence;
10. external construct review completion.

These are blockers, not satisfied claims.

## Provider/runtime identity requirement

Any future construct-validation claim must remain bound to an exact provider/runtime/model identity.

FR-DATA-13 inherits the FR-DATA-09 exact provider-report binding chain and records the current pinned package/model provenance. A future validation performed against another package version, model asset, runtime configuration, or `numFaces` value is a different evidence object and cannot silently inherit this protocol result.

## Undefined empirical quantities

FR-DATA-13 does not invent:

- minimum validation capture count;
- minimum captures per construct stratum;
- minimum independent reviewer count;
- acceptance threshold;
- acceptable false-positive rate;
- acceptable false-negative rate;
- calibration threshold;
- provider decision threshold.

All remain `null` or unauthorized.

## What a successful FR-DATA-13 readiness report may state

It may state only that:

- the FR-DATA-12 exact upstream evidence chain was reconstructed successfully;
- exact provider-run binding remains intact;
- the current provider runtime/package/model identity is recorded;
- `numFaces = 1` and the configured candidate-count range is `0..1`;
- exact multiple-human-face count is not representable by candidate count alone under that configuration;
- the current FR-DATA-11 holdout is already materialized and is not future preregistered construct-validation evidence;
- a new unseen validation dataset is required after protocol freeze;
- construct validation remains blocked by explicit unresolved prerequisites.

## What remains false

FR-DATA-13 does not establish or authorize:

- reviewed human ground-truth authority;
- provider candidate ↔ human-face identity;
- provider detection construct validity;
- human-face presence verification;
- exact-single-human-face verification;
- exact human-face count;
- positive/negative class mapping;
- exclusion policy;
- confusion-matrix terminology;
- TP / FP / TN / FN;
- sensitivity / specificity;
- accuracy / precision / recall / F-score;
- ROC / AUC;
- provider decision thresholds;
- calibration thresholds;
- retrospective holdout requalification;
- near-duplicate leakage validation;
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

Dedicated tests use synthetic typed metadata only to verify the protocol and fail-closed readiness behavior. Synthetic fixtures do not validate MediaPipe as a human-face detector and cannot satisfy construct validity.

## Next step

FR-DATA-13 makes the next decision explicit: before collecting a new confirmatory dataset, MyeongHa needs a separately reviewed **construct definition / reference-standard admission surface** that specifies the intended human task, capture domain, outcome handling, and evidence review authority without consulting provider performance.
