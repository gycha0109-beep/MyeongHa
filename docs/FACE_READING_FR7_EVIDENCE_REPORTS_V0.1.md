# Face Reading FR-7 — Evidence Reports & Transmission Corroboration v0.1

Status: **executable evidence-report foundation / no human collection authorization / no numeric acceptance cutoff**

## 1. Scope

FR-7 closes three gaps left after FR-5/FR-6:

1. face calibration participants are pseudonymous, not truly deidentified;
2. a later transmission witness must not silently upgrade a direct source witness;
3. reliability/evaluation numbers must be versioned reports, not developer-authored PASS flags.

## 2. Privacy terminology migration

FR-5 previously used:

```text
consented_deidentified
```

FR-7 replaces the human-data policy with:

```text
consented_pseudonymous
```

Reason: removing account identifiers and EXIF does not make a face non-identifying.

The executable FR-5 validator now requires `consented_pseudonymous` for all human-derived calibration evidence.

No real human calibration evidence existed under the legacy value, so this is a pre-data contract correction rather than a data migration.

This document supersedes the privacy terminology in `FACE_READING_FR5_CALIBRATION_AUTHORITY_V0.1.md` §10 and the FR-6 note that described the migration as future work.

## 3. Direct source vs transmission corroboration

Direct MyeongHa passage:

```text
passage.shenxiang.five_officers.discernment
verificationStatus = unverified_ocr
```

Electronic Shenxiang text contains the Five Officers mapping and `審辨官` conditions, including `梁柱端直`.

A later transmission is also visible in:

```text
欽定古今圖書集成
博物彙編藝術典 第六百三十二卷
相術部彙考二 / 神相全編二
```

Research URLs:

- https://ctext.org/wiki.pl?chapter=905153&if=gb
- https://zh.wikisource.org/zh-hant/欽定古今圖書集成/博物彙編/藝術典/第632卷
- https://zh.wikisource.org/wiki/Page:Gujin_Tushu_Jicheng,_Volume_473_(1700-1725).djvu/16

FR-7 registers this as:

```text
relation = transmits
verificationStatus = indexed_transcription
mayPromoteDirectSource = false
status = research
```

The direct NLC 1925 Shenxiang passage therefore remains `unverified_ocr`.

Corroboration strengthens source-genealogy confidence; it does not replace direct witness verification.

## 4. Repeatability report

FR-7 introduces `FaceRepeatabilityReport`.

Required authority fields include:

```text
studyRef
metricRef
partition = selection
manifestRef
participantCount
acceptedObservationCount
ICC model/type/definition
estimate
confidence interval
methodRef
provenanceRefs
```

Current research direction:

```text
family = ICC
model = two-way mixed effects
measurement type = single measurement
definition = absolute agreement
```

This follows the research-design direction that test-retest reliability should specify ICC model/type/definition and use absolute agreement.

No acceptance cutoff is seeded.

## 5. Reviewer reliability report

FR-7 introduces `FaceReviewerReliabilityReport`.

Current research direction:

```text
statistic = Krippendorff alpha
level = nominal
abstain handling = missing for reliability statistic
confidence interval = bootstrap
```

The report records:

```text
itemCount
reviewerCount
estimate
confidence interval
bootstrapReplicates
methodRef
provenanceRefs
```

No alpha cutoff is seeded.

`abstain` remains a legitimate reviewer action in the FR-6 label dataset. Reliability analysis must state exactly how abstention is treated.

## 6. Holdout evaluation report

FR-7 introduces `FaceHoldoutEvaluationReport`.

Hard invariants:

```text
partition = holdout
thresholdValueExposed = false
selectionLabelsConsumed = false
```

The report may contain derived evaluation results such as:

```text
TP / TN / FP / FN
sensitivity
specificity
balanced accuracy
excluded no-consensus count
```

It references a calibration authority by ref but does not serialize the raw threshold into the evaluation record.

Selection labels cannot become final-evaluation truth.

## 7. Numeric result != acceptance decision

Every evidence report has:

```text
acceptanceDecision: null | {
  policyRef,
  state
}
```

A decision can only be attached if `policyRef` is present in an explicitly reviewed acceptance-policy authority set.

Therefore:

```text
ICC = 0.91
```

or:

```text
alpha = 0.82
```

is only a measured result.

It is not automatically:

```text
PASS
```

No report in FR-7 seeds a production acceptance threshold.

## 8. Research references

### ICC

Koo & Li (2016), *A Guideline of Selecting and Reporting Intraclass Correlation Coefficients for Reliability Research*:

- DOI: 10.1016/j.jcm.2016.02.012
- https://pmc.ncbi.nlm.nih.gov/articles/PMC4913118/

Relevant use in MyeongHa:

- explicitly report model/type/definition;
- report estimate and confidence interval;
- test-retest direction uses two-way mixed effects and absolute agreement.

The article's illustrative interpretation bands are not imported as MyeongHa production gates.

### Reviewer agreement

*Measuring inter-rater reliability for nominal data – which coefficients and confidence intervals are appropriate?*

- https://pmc.ncbi.nlm.nih.gov/articles/PMC4974794/

Relevant use:

- Krippendorff alpha supports two or more raters;
- nominal data are supported;
- missing values can be handled subject to sufficient ratings.

No published generic cutoff is imported as a product gate.

### Dependency-aware data splitting

REFORMS consensus recommendations:

- https://pmc.ncbi.nlm.nih.gov/articles/PMC11092361/

Relevant use:

- dependent observations from the same participant remain in the same split;
- duplicate/dependent data should not leak across train/test boundaries.

This supports FR-6 participant-level selection/holdout separation.

## 9. Current authority state

| Authority | State |
|---|---|
| FR-5 pseudonymous policy | implemented |
| Gujin Tushu transmission corroboration | research / indexed transcription |
| direct Shenxiang NLC passage | still unverified_ocr |
| repeatability report schema | executable |
| reviewer reliability report schema | executable |
| holdout evaluation report schema | executable |
| repeatability acceptance policy | absent |
| reviewer agreement acceptance policy | absent |
| holdout performance acceptance policy | absent |
| real human calibration evidence | absent |
| production nose threshold | absent |

## 10. Next gates

Before real human collection or production calibration:

1. directly verify the Shenxiang NLC page and promote only that direct passage if justified;
2. review the FR-6 quality artifact;
3. approve a finite review-artifact retention period;
4. review the source-bound labeling instruction;
5. collect consented pseudonymous repeat captures only after collection authority opens;
6. generate repeatability and reviewer-reliability reports;
7. review acceptance policies separately from measured reports;
8. select a threshold on selection subjects only;
9. evaluate the frozen calibration on holdout subjects only;
10. keep `準圓庫起` blocked until fullness/depth evidence exists.
