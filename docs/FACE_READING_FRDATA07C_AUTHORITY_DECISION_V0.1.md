# FACE_READING_FRDATA07C_AUTHORITY_DECISION_V0.1

## Decision

Admit FR-DATA-07C only as a **provider/source/partition-hint-blind annotation-packet preparation contract** between real FR-DATA-07A/07B source-byte evidence and later real FR-DATA-07 human annotation.

## Why this slice is admissible

Issue #225 explicitly requires:

```text
#224 canonical bytes/digests
→ prepare a blinded annotation packet
→ independent humans annotate
→ freeze FR-DATA-07 annotation ledger
```

The repository already has FR-DATA-07A exact-byte/provenance intake and FR-DATA-07B controlled-storage/retrieval verification. It has no existing packet-preparation module. FR-DATA-07C therefore closes a mechanical evidence-handling gap without inventing a new human or empirical authority layer.

## Exact authority granted

FR-DATA-07C may:

- verify upstream FR-DATA-07A/07B records;
- re-hash exact canonical bytes before packet binding;
- derive deterministic opaque item refs;
- freeze an internal mapping from opaque item to exact canonical evidence;
- emit an allowlisted annotator-facing manifest;
- preserve exact image bytes unchanged under opaque packet paths; and
- verify that the wrapper excludes known source/provider/partition/prior-label hints.

## Authority explicitly not granted

FR-DATA-07C may not:

- generate a selected human face-count label;
- claim a human participant exists;
- create `annotatorRef` or `annotationSessionRef` on behalf of a person;
- assign calibration/holdout;
- execute or expose provider scoring;
- infer identity, demographics, emotion, attractiveness, health, personality, or physiognomy;
- assert legal/privacy clearance;
- claim packet item count is empirically sufficient;
- claim actual annotator blindness from an opaque wrapper alone;
- claim embedded image metadata is absent;
- admit FR-DATA-07 ground truth;
- admit FR-DATA-10 adjudication;
- authorize FR-DATA-14/15 as reviewed reference evidence;
- authorize provider thresholds/metrics; or
- authorize production Face Reading geometry.

## Embedded metadata decision

Changing image bytes to strip metadata would break the canonical FR-DATA-07A/07B digest. Therefore FR-DATA-07C does not mutate the bytes and does not pretend metadata sanitization occurred.

The later controlled delivery surface must present the image without exposing embedded metadata. Whether a real participant actually remained blind is human-process evidence and cannot be established by this contract.

## Partition decision

No partition is assigned in FR-DATA-07C. FR-DATA-07 requires calibration/holdout before provider scoring, but neither issue #224 nor the existing authority supplies an allocation rule. Inventing a split from the current three assets would create unsupported governance.

The packet therefore remains partition-blind and partition-unassigned. A later governed record must assign partitions independently of provider behavior before any provider scoring begins.

## State after successful Batch-A packet freeze

```text
real source bytes frozen = yes
exact packet-byte binding = yes
source/provider/partition hints excluded from packet wrapper = yes
real human annotation = no
FR-DATA-07 annotation ledger frozen = no
partition assignment = no
provider scoring = no
empirical admission = no
production geometry = no
```

The next evidence authority is real human annotation under #225, not another model-generated label or threshold.
