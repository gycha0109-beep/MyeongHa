# FR-56 authority decision

## Decision

FR-56 authorizes **same-capture paired source-evidence intake and canonical record freezing** for the FR-54 central-inferior chin trace and the FR-50/52 Menton-side annotation.

It does not authorize empirical validation, a reviewed reference standard, membership thresholds, endpoint selection, provider mapping, traditional equivalence or production geometry.

## Positive authority

FR-56 may:

- require exact `subjectId` and `captureId` equality across the two source annotations;
- compute SHA-256 directly from provided source asset bytes;
- require the computed digest to equal `canonicalAssetDigest`;
- require `traceObservedAssetDigest` and `mentonSideObservedAssetDigest` to each exactly equal that same canonical digest;
- discard raw bytes from the FR-56 evidence object after digest verification;
- validate FR-54 blindness/freeze constraints and FR-50/52 candidate constraints;
- reject internally contradictory freeze/pairing timestamps;
- canonicalize source evidence with sorted object keys while preserving array order;
- compute a canonical SHA-256 digest over the paired source record;
- detect later source-record mutations through digest recomputation;
- derive FR-55 threshold-free raw geometry only after the source record is frozen.

## Asset-binding decision

A shared `captureId` is not sufficient to prove that two annotations were made against identical image bytes.

FR-56 therefore requires:

```text
SHA-256(provided bytes)
== canonicalAssetDigest
== traceObservedAssetDigest
== mentonSideObservedAssetDigest
```

This is a stronger structural binding than subject/capture identity alone.

It is still not historical external attestation. The two observed digests are declarations in the intake record, so:

```text
observed digest equality -> externally verified annotation-to-asset history = false
```

Record state:

`annotation_declared_digests_match_intake_bytes_not_externally_attested_history`

## Pair digest scope

Included:

```text
pairRef
subjectId
captureId
canonicalAssetDigest
traceObservedAssetDigest
mentonSideObservedAssetDigest
assetByteLength
FR-54 trace annotation
traceFrozenAt
FR-50 annotation
mentonSideAnnotationFrozenAt
pairedAt
freeze-order attestations
```

Excluded:

```text
FR-55 derived raw join
membership decisions
endpoint decisions
provider output
traditional semantic output
```

The digest identifies acquired source evidence, not downstream computation.

## Timestamp interpretation

Required structural order:

```text
traceFrozenAt <= mentonSideAnnotationFrozenAt <= pairedAt
```

This is internal consistency only.

```text
timestamp consistency -> cryptographic chronology proof      false
freeze attestation -> externally verified chronology         false
```

## Annotator rule

No independently justified rule currently establishes that the two annotations must come from distinct annotators.

```text
distinctAnnotatorsRequired = null
```

Same-annotator intake is not treated as independent anatomical ground truth.

## Unresolved empirical parameters

```text
minimumPairs                 = null
minimumSubjects              = null
membershipThreshold          = null
anchorAgreementTolerance     = null
endpointSelectionRule        = null
empiricalAcceptanceCriterion = null
```

## Fail-closed boundary

```text
pair digest -> empirical validity                                      false
pair digest -> reviewed reference standard                            false
pair digest -> discarded asset-byte re-verification                   false
asset digest match -> anatomical correctness                          false
observed digest equality -> externally verified annotation history    false
timestamp order -> cryptographic chronology                            false
freeze attestation -> external chronology verification                 false
same capture -> distinct annotators                                    false
same capture -> independent anatomical ground truth                    false
paired observations -> post-hoc membership threshold                   false
paired observations -> post-hoc FR-35 endpoint selection               false
FR-55 distance -> trace membership                                     false
FR-55 zero distance -> exact FR-35 endpoint                            false
provider mapping                                                       false
traditional 地閣 equivalence                                          false
empirical validation                                                   false
production 三停 / F1 / F6 / geometry                                  false
```

## Evidence state

No real paired chin dataset is added by FR-56. Synthetic fixtures verify infrastructure behavior only.

Current state:

`paired_observation_intake_and_canonical_record_freeze_defined_no_empirical_validation`

## Next gate

A stronger claim requires real source observations acquired under the frozen protocols. If annotation-to-asset history itself must be independently verified, a separately verifiable acquisition/annotation event mechanism is required. Any empirical acceptance or endpoint-selection rule must be independently justified/preregistered rather than inferred post hoc from the same observed pair distances.
