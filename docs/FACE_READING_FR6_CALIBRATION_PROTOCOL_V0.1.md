# Face Reading FR-6 — Calibration Study Protocol v0.1

Status: **executable research protocol / human collection blocked / no threshold estimate**

## 1. Goal

FR-6 defines how a future real calibration study may be conducted without allowing data leakage, reviewer leakage, privacy ambiguity, or premature source promotion.

The pipeline is now:

```text
scan-checked traditional criterion
→ reviewed morphology-label instruction
→ reviewed capture/quality/retention protocol
→ consented pseudonymous participants
→ independent repeat captures
→ participant-level selection/holdout split
→ reviewers blind to metric + peer labels
→ deterministic label consensus
→ repeat-capture evidence
→ blinded expert evidence
→ threshold-selection artifact
→ FR-5 calibration authorization
```

FR-6 does **not** estimate a threshold.

## 2. Current research target

Initial vertical:

```text
methodology:
method.shenxiang.five_officers@0.1.0

criterion:
criterion.discernment.bridge_straight

traditional phrase:
梁柱端直

neutral metric:
neutral.nose.bridge.centerline_rms_deviation@0.1.0
```

Current direct source authority remains:

```text
passage.shenxiang.five_officers.discernment
verificationStatus = unverified_ocr
```

The 1925 NLC/Wikimedia PDF is indexed with the 五官/審辨官 text, and later transmission witnesses reproduce the passage, but the current environment could not fetch the approximately 19 MB PDF body for direct page screenshot verification.

Therefore:

```text
indexed scan text != scan_checked source passage
```

The calibration study remains blocked.

## 3. Research capture proposal

Current research protocol candidate:

```text
capture mode: frontal
sessions per participant: 2
accepted captures per session: 2
independent recapture: required
```

These numbers are **research defaults**, not production truth.

Their role is to make repeatability measurable before a production protocol is approved.

Production collection still requires explicit review of:

- capture quality policy
- device/camera variance policy
- session separation definition
- pose normalization acceptance
- review-artifact retention
- participant consent language

## 4. Face data terminology and privacy

FR-6 does not describe face imagery as truly deidentified.

A face remains potentially identifying even when:

- account identity is removed
- EXIF is stripped
- a pseudonymous participant key is used

Therefore FR-6 uses:

```text
consented_pseudonymous
```

The capture policy requires:

```text
EXIF stripped before processing
original source image deleted after review-artifact creation
training reuse = false
identity embedding = false
identity matching = false
```

The temporary review artifact explicitly declares:

```text
containsPotentiallyIdentifyingFace = true
```

It requires its own retention-policy authority before human collection is authorized.

FR-5's earlier `consented_deidentified` name should be treated as legacy terminology until the evidence-contract migration is completed; no real human calibration evidence currently exists under that value.

## 5. Review protocol

Current research labeling candidate:

```text
reviewers per item = 3
labels = met | not_met | abstain
blind to metric values = true
blind to peer labels = true
independent first labels = true
abstain = allowed
```

Reviewers judge the traditional morphology criterion, not the numeric metric.

They must not see:

- bridge RMS value
- proposed threshold
- other reviewers' labels
- predicted face-reading result
- wealth/career/fortune output

The label record schema contains no metric field.

## 6. Research consensus candidate

Current research candidate:

```text
kind = supermajority_non_abstain
min agreement fraction = 2/3
min non-abstain labels = 2
```

Examples:

```text
met / met / abstain
→ met

not_met / not_met / met
→ not_met

met / not_met / abstain
→ no_consensus
```

`no_consensus` is retained as data. It is not silently forced into either class.

These agreement values are protocol candidates and may be changed only through a versioned protocol revision, not by runtime code.

## 7. Participant-level split

FR-6 makes subject leakage a hard failure.

```text
partition = selection | holdout
split unit = participant
```

Forbidden:

```text
same participant
  capture A → selection
  capture B → holdout
```

Also forbidden:

```text
same capture family → multiple participants
same capture family → multiple partitions
```

The manifest validator requires accepted observations in both partitions.

## 8. Why capture-level random split is invalid

Repeated captures from one face are strongly correlated.

If one photograph of a participant is used to select the threshold and another photograph of the same participant appears in holdout evaluation, the apparent generalization is inflated.

Therefore:

```text
all observations from a participant
→ exactly one partition
```

This is enforced by code, not by convention.

## 9. Threshold-selection blindness

The split policy fixes:

```text
thresholdSelectionMayReadHoldout = false
finalEvaluationMayReadSelectionLabels = false
```

The intended flow is:

```text
selection participants
→ repeatability analysis
→ blinded morphology labels
→ threshold selection

holdout participants
→ frozen threshold only
→ final evaluation
```

A threshold cannot be tuned after inspecting holdout outcomes without creating a new study/version.

## 10. Calibration manifest contract

Each observation records only pseudonymous study metadata:

```text
observationRef
reviewItemRef (accepted captures only)
participantKey
captureFamilyKey
captureSessionKey
captureOrdinal
partition
metricRef
protocolRef
accepted
rejectionReason
```

The manifest validator rejects:

- duplicate observation refs
- duplicate review-item refs
- duplicate ordinal within participant/session
- participant leakage
- capture-family leakage
- capture family shared by different participants
- accepted item without review artifact
- rejected item with review artifact
- rejected item without reason
- insufficient independent sessions
- insufficient accepted captures per session
- missing accepted selection or holdout data

## 11. Label dataset contract

A label record contains:

```text
itemRef
reviewerKey
label
labelingProtocolRef
```

It deliberately does not contain:

```text
metricValue
threshold
peerLabels
fortuneResult
```

Validation requires:

- every label item resolves to an accepted review artifact
- no duplicate reviewer label per item
- all accepted review items receive the protocol-required reviewer coverage
- exact protocol reference
- bounded label vocabulary

## 12. Deterministic consensus

`evaluateFaceCalibrationLabelConsensus()` converts the independent labels into:

```text
met
not_met
no_consensus
```

and records:

```text
metCount
notMetCount
abstainCount
nonAbstainCount
agreementFraction
```

No LLM adjudication is involved.

## 13. Human collection promotion gate

A study may use:

```text
executionState = authorized_to_collect
```

only when:

1. every traditional source used by the labeling protocol is at least `scan_checked`
2. the methodology is no longer research-only
3. capture protocol is no longer research-only
4. labeling protocol is no longer research-only
5. blocking reasons are empty
6. study status is no longer research

Current study fails these conditions by design.

## 14. Current research registry

```text
calibration-protocol.face.nose_bridge.research_v0@0.2.0
```

Contains:

```text
capture.nose_bridge.repeat_frontal@0.2.0
label.shenxiang.discernment.bridge_straight@0.2.0
split.face.calibration.participant_holdout@0.2.0
study.face.nose_bridge.straight@0.2.0
```

Current state:

```text
executionState = blocked
```

Blocking reasons include:

- direct 審辨官 source passage not yet scan-checked
- capture/labeling protocol still research-only
- quality/retention/instruction artifacts still research refs

## 15. Relation to FR-5

FR-6 generates the empirical evidence that FR-5 requires.

```text
FR-6 study
→ repeat_capture_stability
→ blinded_expert_operationalization
→ threshold_selection_result

FR-5
→ validate exact evidence chain
→ authorize calibration
→ immutable runtime authorization
```

FR-6 does not bypass FR-5.

FR-5 does not dictate how human data are collected.

## 16. Product effect

This infrastructure exists so that, once calibrated, MyeongHa can say something decisive such as:

```text
코 중심축은 審辨官의 직선 조건을 분명하게 충족합니다.
```

without the sentence being based on:

- arbitrary developer threshold
- one photograph
- a model's visual intuition
- reviewers who saw the metric
- leakage from the same participant into evaluation

The consumer sentence may be confident because the evidence chain is explicit and reproducible.

## 17. Not authorized yet

FR-6 does not authorize:

- human participant recruitment
- real face calibration collection
- any production threshold
- `梁柱端直` production claim
- `審辨官成`
- health/intelligence/morality/criminality inference
- identity recognition
- training reuse of participant faces

## 18. Next

FR-7 should close the remaining prerequisites in this order:

1. obtain direct scan-page verification for the 審辨官 source passage
2. define a versioned morphology-label instruction artifact from that verified wording
3. define concrete frontal quality acceptance criteria and their provenance
4. define review-artifact retention/deletion procedure
5. define subject recruitment/consent protocol
6. define repeat-capture stability statistic and acceptance criterion
7. define threshold-selection evaluation artifact over participant-disjoint selection/holdout data
8. only then consider a real calibration pilot
