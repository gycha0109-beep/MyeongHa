# FR-DATA-10 — Independent Human Face-Count Adjudication

## Purpose

FR-DATA-07 preserves provider-blind independent human face-count annotations. FR-DATA-08 deliberately refuses to collapse multiple annotations into one capture-level ground truth, and FR-DATA-09 binds provider-run references to exact provider report instances without changing that limitation.

FR-DATA-10 defines a separate human adjudication ledger. It records how every capture receives one explicit provider-blind human adjudication record while preserving the original FR-DATA-07 annotations unchanged.

This closes a protocol gap. It does **not** by itself establish reviewed empirical ground-truth authority.

## Why adjudication is separate

The original independent annotations remain immutable evidence. An adjudicator may inspect the capture and the complete set of independent annotations for that capture, but must not see:

- provider output;
- provider candidate count;
- provider landmarks;
- provider result shape;
- provider-run identity;
- FR-DATA-08 raw scoring;
- FR-DATA-09 provider-run binding;
- calibration/holdout partition membership.

The adjudicator must also be distinct from every original annotator for that capture.

## `indeterminate` versus `unresolved`

These states are intentionally different.

- `indeterminate` is an FR-DATA-07 human face-count label. It means the human observer cannot assign zero / one / multiple human faces from the capture under the annotation protocol.
- `unresolved` is an FR-DATA-10 adjudication outcome. It means the adjudication process did not resolve the capture to one FR-DATA-07 label.

Neither state may be silently coerced into another label or dropped from evidence.

## No automatic consensus rule

FR-DATA-10 does not invent a majority rule, unanimity rule, annotator quorum, agreement threshold, or decision threshold.

Even when all independent annotators agree, a capture does not automatically become a reviewed adjudication label. The contract requires one explicit human adjudication record for every capture.

Likewise, a 2-to-1 or other vote count cannot define the adjudication outcome automatically.

The following remain unset:

- minimum independent annotators per capture;
- minimum adjudicators per capture;
- inter-annotator agreement threshold;
- adjudication decision threshold.

## Exact source-annotation review set

Each adjudication records `reviewedAnnotationRefs`.

FR-DATA-10 derives each source reference from the exact FR-DATA-07 annotation identity:

`captureRef + annotatorRef + annotationSessionRef`

For each capture, the recorded review set must match the complete FR-DATA-07 annotation set exactly. Omission, duplication, or substitution fails closed.

The FR-DATA-10 dataset also copies the frozen FR-DATA-07 `annotationLedgerDigest`; it must match exactly.

## Adjudication ledger digest

The adjudication ledger is canonicalized with deterministic lexicographic object-key ordering while preserving array order. The canonical projection excludes the digest field itself and includes:

- schema version;
- dataset ref;
- upstream ground-truth schema ref;
- upstream FR-DATA-07 annotation-ledger digest;
- adjudication records;
- ledger frozen state;
- ledger frozen timestamp.

The resulting UTF-8 JSON is SHA-256 hashed as:

`sha256:<64 lowercase hex>`

A frozen ledger must carry the exact canonical digest, and no included adjudication may occur after its declared freeze timestamp.

## Temporal boundary

Provider execution may already exist by the time adjudication occurs. FR-DATA-10 therefore does **not** pretend that adjudication necessarily happened before provider execution.

Instead, the required anti-circularity boundary is:

1. independent FR-DATA-07 annotation ledger is already frozen;
2. adjudication remains provider-blind;
3. adjudication ledger is frozen;
4. only a later slice may score provider behavior against adjudicated outcomes.

Thus the contract requires the adjudication ledger to freeze before any future provider scoring that consumes adjudicated outcomes.

FR-DATA-10 itself performs no such scoring.

## What a successful FR-DATA-10 report may state

It may state that:

- every FR-DATA-07 capture has exactly one adjudication record;
- every adjudication references the exact complete independent annotation set;
- every adjudicator is recorded as distinct from the original annotators;
- provider-blindness and partition-blindness fields satisfy the contract;
- no automatic majority / unanimity / annotation-count rule was applied;
- unresolved outcomes remain explicit;
- the adjudication ledger is frozen and its canonical digest matches its content.

## What remains false

FR-DATA-10 does not validate or authorize:

- capture-level ground-truth authority;
- inter-annotator ground-truth authority;
- provider detection construct validity;
- provider candidate ↔ human-face equivalence;
- face presence or single-human-face authority;
- TP / FP / TN / FN;
- sensitivity, specificity, precision, recall, accuracy, F-score, ROC, or AUC;
- provider decision thresholds or acceptance criteria;
- holdout tuning;
- near-duplicate / burst / transformed-image partition leakage exclusion;
- capture-quality authority;
- anatomical landmark authority;
- Menton / 地閣 equivalence;
- FR-35 contour binding;
- FR-36 promotion;
- 三停 / F1 / F6 production authorization;
- research-candidate admission;
- production geometry.

## Synthetic CI boundary

The dedicated tests use synthetic typed metadata only to verify the contract: exact annotation-set coverage, independent adjudicator separation, provider blindness, no automatic vote rules, unresolved preservation, canonical ledger hashing, freeze ordering, and fail-closed authority behavior.

Synthetic fixtures are not empirical human-face evidence and do not establish reviewed ground truth.

## Next step

After FR-DATA-10, the next coherent slice is a raw join between **frozen FR-DATA-10 adjudication outcomes** and the already-bound provider observations.

That future join must continue to preserve `unresolved` as its own evidence state and must not compute classification metrics until a separate reviewed evaluation policy explicitly authorizes which adjudicated outcomes are eligible for which metric definitions.
