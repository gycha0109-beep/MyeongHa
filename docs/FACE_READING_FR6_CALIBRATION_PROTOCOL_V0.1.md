# Face Reading FR-6 — Calibration Study Protocol v0.1

Status: **executable research protocol / human collection blocked / no threshold estimate**

## 1. Goal

FR-6 defines how a future real face-calibration study may be conducted without source drift, participant leakage, reviewer leakage, threshold leakage, or ambiguous face-data handling.

```text
scan-checked traditional criterion
→ reviewed labeling instruction
→ reviewed capture quality policy
→ reviewed review-artifact retention policy
→ consented pseudonymous participants
→ independent repeat captures
→ participant-level selection/holdout split
→ blinded independent labels
→ deterministic consensus
→ repeat-capture evidence
→ blinded expert evidence
→ threshold-selection result
→ FR-5 calibration authorization
```

FR-6 does **not** estimate or seed a production threshold.

## 2. Current vertical

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

The current direct MyeongHa source passage remains:

```text
passage.shenxiang.five_officers.discernment
verificationStatus = unverified_ocr
```

The 1925 NLC/Wikimedia scan is search-indexed with the relevant 五官/審辨官 content, but direct PDF-page verification remains blocked by the current large-file fetch limit. Later transmission material also corroborates the wording, but it does not convert the NLC witness to `scan_checked`.

Therefore the real calibration study remains blocked.

## 3. Protocol registry

Current registry:

```text
calibration-protocol.face.nose_bridge.research_v0@0.3.0
```

It contains four authority groups:

```text
support artifacts
capture protocol
labeling protocol
split policy
study protocol
```

The study cannot become `authorized_to_collect` merely by changing its own status.

Every linked authority must pass its own gate.

## 4. Support-artifact authority

FR-6 removes string-only quality/retention/instruction placeholders as sufficient authority.

The registry contains typed support artifacts:

### 4.1 Capture quality policy

```text
quality.face.calibration.frontal@0.1.0
```

Research checks include:

- one face
- frontal pose
- sharpness
- nose-bridge visibility
- major occlusion

The exact acceptance policy is still research-only and must be reviewed before collection.

### 4.2 Review-artifact retention policy

```text
retention.face.calibration.review_artifact@0.1.0
```

It declares:

```text
containsPotentiallyIdentifyingFace = true
deleteTrigger = labeling_and_audit_complete
accessScope = assigned_reviewers_and_auditors
trainingReuseAllowed = false
identityMatchingAllowed = false
```

A reviewed retention artifact must also define a positive `maxRetentionDays`.

The current research artifact intentionally has:

```text
maxRetentionDays = null
```

so it cannot be promoted accidentally.

### 4.3 Labeling instruction

```text
instructions.face.bridge_straight@0.1.0
```

It is pinned to:

```text
method.shenxiang.five_officers@0.1.0
criterion.discernment.bridge_straight
passage.shenxiang.five_officers.discernment
```

Reviewers must not see:

```text
metric values
candidate threshold
peer labels
fortune output
```

The instruction itself is still research-only because the direct source passage is not scan-checked.

## 5. Face-data terminology

FR-6 does not call face imagery truly deidentified.

Removing account identity and EXIF does not remove the possibility of identifying a person from their face.

FR-6 therefore uses:

```text
consented_pseudonymous
```

for human calibration participants and review artifacts.

The original source image policy requires:

```text
EXIF stripped before processing
original deleted after review-artifact creation
training reuse = false
identity embedding = false
```

The review artifact remains explicitly potentially identifying and is governed by its retention policy.

The older FR-5 `consented_deidentified` label is legacy terminology. No real human evidence exists under that label; evidence-contract terminology should be migrated before FR-6 outputs are converted into FR-5 human evidence artifacts.

## 6. Research capture proposal

Current research candidate:

```text
capture mode = single frontal
sessions per participant = 2
accepted captures per session = 2
independent recapture required = true
```

These are research protocol defaults, not universal production truths.

They exist to make repeatability measurable and are versioned so they can be changed after protocol review.

## 7. Labeling protocol

Current research candidate:

```text
reviewers per item = 3
labels = met | not_met | abstain
blind to metric values = true
blind to peer labels = true
independent initial labels = true
abstain allowed = true
```

Reviewer records structurally contain no metric or threshold fields.

The human task is to judge the morphology criterion, not reverse-engineer the numerical classifier.

## 8. Research consensus rule

Current candidate:

```text
kind = supermajority_non_abstain
minAgreementFraction = 2/3
minNonAbstainLabels = 2
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

`no_consensus` remains explicit evidence and is never force-labeled.

This is a research consensus rule. It is not a magical correctness threshold.

## 9. Participant-level split

The dataset is split by participant, never by image.

```text
partition = selection | holdout
splitUnit = participant
participantLeakageAllowed = false
captureFamilyLeakageAllowed = false
```

Forbidden:

```text
same participant:
photo A → selection
photo B → holdout
```

Repeated measurements from the same person are correlated; image-level random splitting would inflate apparent generalization.

This design is consistent with repeated-measures validation literature warning that subject overlap between development and evaluation can produce optimistic performance estimates.

## 10. Holdout isolation

The split policy fixes:

```text
thresholdSelectionMayReadHoldout = false
finalEvaluationMayReadSelectionLabels = false
```

Intended flow:

```text
selection participants
→ repeatability
→ labels
→ threshold selection
→ freeze threshold

holdout participants
→ final evaluation only
```

If holdout outcomes are used to retune the threshold, that requires a new study/version.

## 11. Calibration manifest

Accepted records carry pseudonymous study references:

```text
observationRef
reviewItemRef
participantKey
captureFamilyKey
captureSessionKey
captureOrdinal
partition
metricRef
protocolRef
accepted
```

Rejected records carry a rejection reason and do not expose a review item.

The validator rejects:

- duplicate observation refs
- duplicate review item refs
- duplicate ordinal within participant/session
- participant leakage
- capture-family leakage
- one capture family attached to multiple participants
- accepted capture without review artifact
- rejected capture with review artifact
- rejected capture without reason
- insufficient sessions
- insufficient accepted captures per session
- no accepted selection partition
- no accepted holdout partition

## 12. Label dataset

A label record contains only:

```text
itemRef
reviewerKey
label
labelingProtocolRef
```

The validator rejects:

- item not present as accepted review artifact
- duplicate label by the same reviewer for the same item
- unsupported label
- wrong labeling protocol
- any accepted review item without required reviewer coverage

## 13. Deterministic consensus

`evaluateFaceCalibrationLabelConsensus()` returns:

```text
state = met | not_met | no_consensus
metCount
notMetCount
abstainCount
nonAbstainCount
agreementFraction
```

No LLM adjudication is used.

## 14. Human collection gate

`executionState = authorized_to_collect` is valid only when all of the following are true:

1. all traditional source passages used by the study are at least `scan_checked`
2. methodology is at least reviewed
3. capture protocol is at least reviewed
4. labeling protocol is at least reviewed
5. split policy is at least reviewed
6. linked capture-quality artifact is at least reviewed
7. linked review-retention artifact is at least reviewed and has a positive retention limit
8. linked labeling instruction is at least reviewed
9. blocking reasons are empty
10. study itself is no longer research-only

Thus changing the study enum alone cannot authorize human face collection.

## 15. Current state

Current research refs:

```text
quality.face.calibration.frontal@0.1.0
retention.face.calibration.review_artifact@0.1.0
instructions.face.bridge_straight@0.1.0
capture.nose_bridge.repeat_frontal@0.3.0
label.shenxiang.discernment.bridge_straight@0.3.0
split.face.calibration.participant_holdout@0.3.0
study.face.nose_bridge.straight@0.3.0
```

Current study:

```text
executionState = blocked
```

Principal blockers:

- direct 審辨官 source not scan-checked
- quality/retention/instruction/capture/label/split authorities remain research-only

## 16. Statistical research direction

FR-6 does not hard-code a repeatability cutoff yet.

Current literature review supports the following **research candidates**:

### Repeated metric reliability

For test-retest numeric measurements, an intraclass correlation coefficient should explicitly state:

```text
model
type
definition
confidence interval
```

Absolute agreement is the relevant definition for repeated measurements if the same value is expected across sessions.

Candidate future specification:

```text
model = two-way mixed-effects
type = single measurement
definition = absolute agreement
```

This still needs a protocol-specific acceptance rule rather than importing a generic rule-of-thumb cutoff blindly.

### Reviewer reliability

Because the labeling task is nominal and permits `abstain`, Krippendorff's alpha with bootstrap confidence intervals is a research candidate for inter-rater reliability reporting.

Again, FR-6 does not seed a pass/fail alpha threshold.

## 17. Relation to FR-5

```text
FR-6 study
→ repeat_capture_stability
→ blinded_expert_operationalization
→ threshold_selection_result

FR-5
→ exact evidence validation
→ exact selected threshold binding
→ immutable authorization
→ criterion classifier
```

FR-6 governs collection and evaluation design.

FR-5 governs calibration promotion and runtime authorization.

Neither layer may bypass the other.

## 18. Product consequence

Once this chain is genuinely closed, a consumer-facing result can be decisive:

```text
코 중심축은 審辨官의 직선 조건을 분명하게 충족합니다.
```

That confidence comes from reproducible evidence, not vague prose or an LLM's visual intuition.

## 19. Not authorized

FR-6 does not authorize:

- recruiting real participants
- collecting real calibration faces
- production bridge threshold
- `梁柱端直` production claim
- `審辨官成`
- identity recognition
- training reuse of calibration faces
- health/intelligence/morality/criminality inference

## 20. Next

FR-7 should close prerequisites in this order:

1. direct scan-page verification of the 審辨官 passage
2. migrate FR-5 human evidence terminology to `consented_pseudonymous`
3. turn the labeling instruction into a reviewed artifact based on scan-checked wording
4. define concrete frontal capture acceptance policy
5. approve a bounded review-artifact retention duration
6. define repeatability statistic/report schema
7. define reviewer-reliability statistic/report schema
8. define selection/holdout evaluation artifact schemas
9. only after those gates, consider a consented pilot
