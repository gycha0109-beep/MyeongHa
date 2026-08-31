# FR-57 authority decision

## Decision

FR-57 authorizes a **deterministic calibration/holdout ledger and partition leakage guard over verified FR-56 paired source records**.

It does not authorize empirical validation, threshold calibration, endpoint selection, reviewed-reference-standard status, provider/anatomy mapping, traditional equivalence or production geometry.

## Positive authority

FR-57 may:

- accept only FR-56 records that still pass frozen-record verification;
- require unique `pairRef` and `pairedRecordDigest` values;
- prevent one `subjectId` from crossing calibration/holdout partitions;
- prevent one `canonicalAssetDigest` from crossing calibration/holdout partitions;
- allow the same canonical asset to appear in multiple pair records inside one partition;
- require repeated same-asset records to preserve one exact `subjectId + captureId` identity;
- require one `subjectId + captureId` identity to preserve one exact canonical asset digest;
- require explicit pre-FR55-outcome partition-freeze attestation;
- require explicit post-pair-record dataset-freeze attestation;
- verify `pair.pairedAt <= datasetFrozenAt` for every constituent record;
- normalize manifest input order for deterministic dataset identity;
- freeze the persisted ledger in canonical digest order;
- compute SHA-256 over source-record identity, partition assignment and dataset-freeze metadata;
- expose descriptive pair/subject/asset counts.

## Partition decision

The authorized labels are:

```text
calibration
holdout
```

FR-57 does not decide how many records belong in either partition.

```text
partitionAllocationRule = null
calibrationFraction = null
minimumPairs = null
minimumSubjects = null
```

A calibration label is not threshold authority. A holdout label is not proof that validation passed.

## Leakage decision

Two independent leakage guards are mandatory:

```text
subjectId -> exactly one partition
canonicalAssetDigest -> exactly one partition
```

Checking only subject leakage is insufficient because identical image bytes could otherwise appear in both partitions under different labels.

## Same-asset repeat decision

Repeated annotation of one source image is not forbidden when all repeated pairs stay in the same partition and preserve exact identity:

```text
canonicalAssetDigest
-> one subjectId + captureId

subjectId + captureId
-> one canonicalAssetDigest
```

This permits future multi-annotator studies without treating reuse as independent ground truth.

```text
samePartitionAssetReuseMeansIndependentGroundTruth = false
```

## Outcome-blindness decision

A valid manifest declares:

```text
partitionAssignmentFrozenBeforeFR55OutcomeInspectionAttested = true
fr55OutcomeVisibleDuringPartitionAssignment = false
datasetFrozenAfterAllPairRecordsAttested = true
```

These are contract attestations, not external audit records.

```text
partitionFreezeAttestationMeansExternallyVerifiedOutcomeBlindness = false
```

No reviewer, annotator-history service or external chronology authority is implied.

## Timestamp decision

Every pair must satisfy:

```text
pairedAt <= datasetFrozenAt
```

The timestamp check blocks an internally contradictory manifest. It does not provide a cryptographic event history.

```text
datasetTimestampMeansCryptographicChronologyProof = false
```

## Dataset digest decision

The digest commits to:

```text
datasetRef
datasetFrozenAt
freeze/blindness attestations
sorted pair manifest:
  partition
  pairRef
  pairedRecordDigest
  subjectId
  captureId
  canonicalAssetDigest
```

The pair manifest is deterministically sorted by `pairedRecordDigest`, then `partition`.

Input array order therefore does not define dataset identity. A valid partition assignment change does.

FR-55 outcome values are deliberately absent:

```text
datasetDigestIncludesFR55Outcome = false
```

The dataset digest identifies frozen evidence membership and partition assignment. It does not identify empirical truth.

## Frozen-ledger order decision

Manifest input order is normalized, but the persisted ledger is emitted in canonical order and later verification rejects a reordered persisted ledger.

This separates:

```text
input order is non-semantic
```

from:

```text
frozen artifact representation is canonical
```

## Unresolved empirical parameters

FR-57 leaves all of the following null:

```text
partitionAllocationRule
calibrationFraction
minimumPairs
minimumSubjects
membershipThreshold
anchorAgreementTolerance
endpointSelectionRule
empiricalAcceptanceCriterion
```

No numeric default may be inferred from synthetic fixtures or partition presence.

## Synthetic fixture decision

The FR-57 tests generate synthetic FR-56 pair records to verify the contract.

They are not a collected face dataset and are not empirical evidence.

Therefore the runtime state remains:

```text
realDatasetEstablished = false
empiricalValidationAuthorized = false
```

including when a non-empty synthetic ledger contains both partitions.

## Fail-closed authority boundary

The following remain false:

```text
datasetDigestMeansEmpiricalValidity
datasetDigestMeansReviewedReferenceStandard
partitionMembershipMeansEmpiricalValidity
calibrationPartitionMeansThresholdAuthority
holdoutPartitionMeansValidationPassed
samePartitionAssetReuseMeansIndependentGroundTruth
providerMappingAuthorized
traditionalDigeEquivalenceAuthorized
empiricalValidationAuthorized
productionThreeDivisionsMetricAllowed
productionF1Allowed
productionF6Allowed
productionGeometryAuthorized
```

The following interpretations remain forbidden:

```text
FR-55 distance -> trace membership
FR-55 zero distance -> FR-35 endpoint
Menton-side -> FR-35 exact endpoint
provider index 152 -> Menton
FACE_OVAL -> FR-35 contour
地閣 -> exact Menton equivalence
```

## Final authority state

```text
paired_dataset_partition_ledger_defined_subject_asset_leakage_blocked_outcome_blindness_attested
```

This is a research evidence-governance authority only.

## Next admissible work

Acquire real FR-56 paired records under a separately governed acquisition procedure, freeze dataset membership and partition assignment before FR-55 outcome inspection, and define any future empirical threshold/acceptance protocol only from independently justified evidence.
