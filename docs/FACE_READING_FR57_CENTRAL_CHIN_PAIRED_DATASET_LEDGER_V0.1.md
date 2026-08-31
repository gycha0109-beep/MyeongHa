# FR-57 — Central Chin Paired Dataset Ledger / Partition Freeze

## Status

Research-only evidence-governance slice.

Authority state:

```text
paired_dataset_partition_ledger_defined_subject_asset_leakage_blocked_outcome_blindness_attested
```

FR-57 defines how already-frozen FR-56 paired evidence records may be assembled into a deterministic `calibration | holdout` dataset ledger without inventing empirical validation authority.

It does **not** define a calibration ratio, minimum sample size, membership threshold, endpoint rule, acceptance criterion, reviewed reference standard or production geometry.

## Upstream boundary

Each constituent record must already pass FR-56 verification.

FR-56 binds:

```text
provided source asset bytes
== canonicalAssetDigest
== traceObservedAssetDigest
== mentonSideObservedAssetDigest
```

and freezes the paired source record without including the derived FR-55 raw join in `pairedRecordDigest`.

FR-57 consumes that frozen source identity. It does not reopen FR-54/FR-50 annotations or promote FR-55 geometry.

## Partition labels

The only labels are:

```text
calibration
holdout
```

No allocation policy is authorized:

```text
partitionAllocationRule = null
calibrationFraction = null
minimumPairs = null
minimumSubjects = null
```

The existence of these labels is dataset-governance structure only.

## Leakage invariants

### Subject isolation

A subject may occur in exactly one partition:

```text
subjectId -> one partition
```

The same subject in both `calibration` and `holdout` is rejected.

### Exact asset isolation

An exact source asset may occur in exactly one partition:

```text
canonicalAssetDigest -> one partition
```

This is distinct from subject leakage and is checked independently.

### Same-asset multi-annotation remains allowed

The same asset may appear in multiple FR-56 pair records **inside the same partition**. This preserves a future multi-annotator design.

This reuse is allowed only when identity remains consistent:

```text
canonicalAssetDigest
-> one exact subjectId + captureId

subjectId + captureId
-> one exact canonicalAssetDigest
```

Same-partition reuse does not imply an independent capture, independent subject or independent ground truth.

## Pair identity

The following are individually unique across the dataset:

```text
pairRef
pairedRecordDigest
```

Duplicate source records cannot silently gain extra statistical weight through duplicate ledger rows.

## Outcome-blind partition freeze

The manifest requires:

```text
partitionAssignmentFrozenBeforeFR55OutcomeInspectionAttested = true
fr55OutcomeVisibleDuringPartitionAssignment = false
datasetFrozenAfterAllPairRecordsAttested = true
```

These are declarations enforced by the contract. They are not external event-history evidence.

Therefore:

```text
partition freeze attestation
-> externally verified outcome blindness = false
```

No reviewer identity or external acquisition chronology is invented by FR-57.

## Freeze chronology

For every constituent pair:

```text
pair.pairedAt <= datasetFrozenAt
```

FR-57 validates canonical ISO-8601 UTC millisecond timestamps and rejects a dataset freeze preceding any pair record.

This is internal structural consistency only:

```text
timestamp order
-> cryptographic chronology proof = false
```

## Deterministic dataset digest

Dataset identity is computed with:

```text
canonicalization:
  sort pair manifest by pairedRecordDigest, then partition
  sorted object keys
  preserve array order inside already-frozen source records

digest:
  sha256
```

Digest material contains:

```text
datasetRef
datasetFrozenAt
partitionAssignmentFrozenBeforeFR55OutcomeInspectionAttested
fr55OutcomeVisibleDuringPartitionAssignment
datasetFrozenAfterAllPairRecordsAttested
pair manifest:
  partition
  pairRef
  pairedRecordDigest
  subjectId
  captureId
  canonicalAssetDigest
```

It deliberately excludes FR-55 raw outcomes:

```text
datasetDigestIncludesFR55Outcome = false
```

Consequences:

- caller input array order does not change dataset identity;
- a valid partition assignment change changes the digest;
- downstream FR-55 distances cannot retroactively define dataset identity.

The persisted frozen ledger itself is stored in canonical digest order and verification rejects a reordered persisted ledger.

## Descriptive counts only

FR-57 records counts such as:

```text
pairCount
subjectCount
canonicalAssetCount
calibrationPairCount
holdoutPairCount
calibrationSubjectCount
holdoutSubjectCount
```

These are bookkeeping facts only. They are not sample-size adequacy claims.

A non-empty ledger, or even a ledger containing both partitions, does not establish a real empirical dataset in this slice.

```text
realDatasetEstablished = false
```

Synthetic fixtures are contract/self-test evidence only.

## Unresolved empirical authority

The following remain exactly unresolved:

```text
partitionAllocationRule       = null
calibrationFraction           = null
minimumPairs                  = null
minimumSubjects               = null
membershipThreshold           = null
anchorAgreementTolerance      = null
endpointSelectionRule         = null
empiricalAcceptanceCriterion  = null
```

FR-57 does not create a default value for any of them.

## Fail-closed boundaries

The following remain false:

```text
datasetDigestMeansEmpiricalValidity

datasetDigestMeansReviewedReferenceStandard
partitionFreezeAttestationMeansExternallyVerifiedOutcomeBlindness
datasetTimestampMeansCryptographicChronologyProof
samePartitionAssetReuseMeansIndependentGroundTruth
calibrationPartitionMeansThresholdAuthority
holdoutPartitionMeansValidationPassed
partitionMembershipMeansEmpiricalValidity
providerMappingAuthorized
traditionalDigeEquivalenceAuthorized
empiricalValidationAuthorized
productionThreeDivisionsMetricAllowed
productionF1Allowed
productionF6Allowed
productionGeometryAuthorized
```

FR-57 also preserves the earlier prohibitions:

```text
FR-55 distance != trace membership
FR-55 zero distance != FR-35 endpoint
provider point != anatomical point without separate evidence
Menton != 地閣 exact equivalence
Menton-side != FR-35 exact endpoint
```

## What FR-57 authorizes

FR-57 authorizes only:

1. accepting verified FR-56 paired records into a manifest;
2. calibration/holdout partition labels;
3. subject leakage rejection;
4. exact asset leakage rejection;
5. bidirectional asset/subject/capture identity consistency;
6. pair identity uniqueness;
7. explicit outcome-blind/freeze attestations;
8. structural freeze chronology validation;
9. deterministic manifest canonicalization and dataset digest;
10. immutable ledger verification and descriptive counts.

## What FR-57 does not authorize

FR-57 does not authorize:

- threshold fitting;
- threshold tuning on holdout;
- endpoint selection;
- FR-35 contour endpoint promotion;
- reviewer-backed reference-standard status;
- empirical acceptance;
- provider mapping;
- `152 == Menton`;
- `地閣 == Menton`;
- `FACE_OVAL == FR35 curve`;
- production 三停/F1/F6 geometry.

## Next admissible evidence step

The next evidence step is not to invent a split ratio or threshold.

It is to acquire real FR-56 paired records under an externally governed acquisition process, freeze partition assignment before FR-55 outcome inspection, freeze the completed pair manifest, and only then define a separately justified empirical scoring/calibration protocol.
