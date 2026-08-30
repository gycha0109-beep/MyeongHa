# FR-DATA-14 — Human Construct Definition / Reference-Candidate Admission

## Status

`categorical_construct_defined_reference_candidate_admission_only_no_reviewed_reference_authority`

FR-DATA-14 closes one narrow gap left by FR-DATA-13:

> What human construct are the provider observations eventually supposed to be validated against?

It does **not** validate MediaPipe, human ground-truth authority, or classification performance.

---

## Upstream authority

FR-DATA-14 reuses existing human-only authority rather than inventing a new target from provider behavior.

FR-DATA-07 defines the provider-blind human label vocabulary:

```text
zero_human_faces
one_human_face
multiple_human_faces
indeterminate
```

FR-DATA-10 preserves those outcomes during independent human adjudication and adds:

```text
unresolved
```

Therefore FR-DATA-14 freezes the target construct as:

```text
categorical_human_face_count_state
```

This definition is derived from the already-existing human label authority, not from MediaPipe candidate counts or observed provider performance.

---

## Construct definition

Authority ref:

```text
authority.face.human_construct_reference_candidate_admission.frdata14
```

Construct ref:

```text
construct.face.categorical_human_face_count_state.frdata14
```

Construct version:

```text
0.1.0
```

Scoring-reference classes:

```text
zero_human_faces
one_human_face
multiple_human_faces
```

Preserved non-scoring outcomes:

```text
indeterminate
unresolved
```

The construct definition receives a deterministic SHA-256 digest so later validation work can identify the exact frozen definition version.

---

## Important semantic limit: categorical is not exact numeric count

`multiple_human_faces` means only that the human adjudication outcome is in the multiple-face category.

It does **not** supply an exact numeric count.

Therefore FR-DATA-14 explicitly keeps:

```text
multipleHumanFacesMeansExactNumericCount = false
exactNumericHumanFaceCountRepresented = false
```

The current human label vocabulary cannot support a claim such as:

```text
humanFaceCount = 3
```

unless a separate reviewed exact-count authority is introduced later.

---

## No silent projection

FR-DATA-14 does not silently turn the categorical construct into another task.

The following remain undefined:

```text
binary face presence projection
exact-single-human-face projection
provider-output mapping
provider decision threshold
```

In particular:

```text
zero_human_faces / one_human_face / multiple_human_faces
```

are human reference categories. They are not automatically mapped to:

```text
0 / 1 MediaPipe candidates
```

and they are not automatically collapsed into a binary presence task.

---

## Reference-candidate admission

FR-DATA-14 consumes only FR-DATA-07 + FR-DATA-10 human evidence.

It does not require a provider run and does not consume provider output to define the construct.

For each validated FR-DATA-10 adjudication outcome:

```text
zero_human_faces
→ admitted_reference_candidate
→ scoringReferenceClass = zero_human_faces

one_human_face
→ admitted_reference_candidate
→ scoringReferenceClass = one_human_face

multiple_human_faces
→ admitted_reference_candidate
→ scoringReferenceClass = multiple_human_faces

indeterminate
→ preserved_non_scoring_indeterminate
→ scoringReferenceClass = null

unresolved
→ preserved_non_scoring_unresolved
→ scoringReferenceClass = null
```

`reference candidate` is deliberately weaker than `reviewed reference standard`.

---

## What admission proves

A successful FR-DATA-14 report can prove only that:

- the FR-DATA-07 ground-truth ledger was accepted by FR-DATA-10,
- the FR-DATA-10 adjudication ledger is frozen and digest-bound,
- every capture has the exact complete independent annotation review set,
- provider-blind adjudication is recorded,
- the adjudicator is distinct from original annotators,
- the human target construct is the frozen categorical face-count state,
- resolved categorical outcomes are recorded as reference candidates,
- `indeterminate` and `unresolved` are preserved as non-scoring evidence.

It does **not** prove that the adjudicated result is externally reviewed truth.

---

## Still false after FR-DATA-14

The following remain false:

```text
reviewedHumanReferenceStandardAuthorityValidated
externalConstructReviewCompleted
externalReferenceStandardReviewCompleted
providerDetectionConstructValidityValidated
providerFaceCandidateHumanIdentityValidated
facePresenceVerified
singleHumanFaceVerified
truePositiveFalsePositiveTerminologyAuthorized
confusionMatrixAuthorized
classificationMetricsAuthorized
classificationMetricsComputed
providerDecisionThresholdDefined
reviewedEmpiricalValidationCompleted
nearDuplicatePartitionLeakageValidated
captureQualityAuthorityValidated
anatomicalLandmarkAuthorityValidated
traditionalSemanticAuthorityValidated
productionGeometryAuthorized
```

FR-DATA-14 therefore cannot authorize provider metrics or production face geometry.

---

## No invented empirical policy

FR-DATA-14 deliberately leaves all empirical quantities unset:

```text
minimumReferenceCaptures = null
minimumIndependentAnnotators = null
minimumAdjudicators = null
interAnnotatorAgreementThreshold = null
referenceAdmissionThreshold = null
```

No majority rule, agreement percentage, sample minimum, or pass threshold is introduced.

---

## Historical provider evidence and future validation

Historical FR-DATA-06/11 provider outputs already exist.

FR-DATA-14 does not use them to define the human construct and they cannot validate this construct definition.

The FR-DATA-13 non-retroactivity boundary remains:

```text
frozen construct definition
→ new unseen construct-validation dataset
→ human reference freeze
→ provider outcome comparison
```

Existing materialized provider/human pairings cannot be relabeled as future preregistered confirmatory evidence.

---

## Synthetic tests

Repository tests use synthetic metadata to verify the contract only.

They test:

- exact construct vocabulary,
- deterministic construct digest,
- categorical reference-candidate admission,
- preservation of `indeterminate`,
- preservation of `unresolved`,
- no exact numeric conversion of `multiple_human_faces`,
- no binary/exact-single/provider projection,
- provider-free report construction,
- complete annotation review enforcement,
- provider-blind adjudication enforcement,
- unset empirical thresholds,
- fail-closed promotion.

Synthetic fixtures do not establish human ground-truth correctness or provider construct validity.

---

## Next evidence gap

FR-DATA-14 leaves two major blockers before provider metrics are meaningful:

1. reviewed external authority for the human reference standard / construct definition,
2. a future unseen validation dataset collected after the frozen definition, with near-duplicate leakage controls and preregistered acceptance policy.

A subsequent slice should define the external review / reference-standard attestation surface without converting synthetic self-tests into empirical authority.
