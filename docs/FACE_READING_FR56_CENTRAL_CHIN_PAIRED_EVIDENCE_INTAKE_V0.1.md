# FR-56 — Central chin paired evidence intake and freeze

## Status

FR-54 defines a provider/traditional/candidate-blind raw central-inferior chin trace. FR-55 defines a threshold-free raw geometric join between that trace and the FR-52 bilateral Menton-side research candidate.

FR-56 adds the missing **source-evidence intake boundary** before any future real paired dataset may be represented as a stable research record.

Authority state:

`paired_observation_intake_and_canonical_record_freeze_defined_no_empirical_validation`

FR-56 is not an empirical validation slice.

## 1. Valid pair contents

A single intake contains:

1. one FR-54 source trace annotation;
2. one FR-50 annotation from which FR-52 derives bilateral Menton-side candidates;
3. the exact source image bytes supplied at intake;
4. one canonical SHA-256 digest for those bytes;
5. the asset digest declared as observed by the trace annotation session;
6. the asset digest declared as observed by the Menton-side annotation session;
7. trace-freeze, candidate-freeze and pairing timestamps;
8. explicit freeze-order attestations.

The two source annotations must have exactly matching `subjectId` and `captureId`.

Cross-subject or cross-capture pairing fails closed.

## 2. Annotation-to-asset binding

Subject/capture identifiers alone are insufficient evidence that both annotations were made from the same image bytes.

FR-56 therefore requires three digests to converge:

```text
SHA-256(provided asset bytes)
== canonicalAssetDigest
== traceObservedAssetDigest
== mentonSideObservedAssetDigest
```

All digest values use canonical lowercase `sha256:<64-hex>` form.

This closes the structural error in which the same `captureId` could otherwise be reused for annotations made against different image bytes.

The frozen record stores:

```text
canonicalAssetDigest
traceObservedAssetDigest
mentonSideObservedAssetDigest
assetByteLength
assetDigestVerifiedAgainstProvidedBytes = true
exactObservedAssetDigestMatchVerified = true
```

However, these annotation-observed digests are declarations carried by the intake record. FR-56 does not have an independently verifiable historical event proving that a particular annotation session actually displayed those bytes at that time.

Therefore:

`observedDigestBindingProofState = annotation_declared_digests_match_intake_bytes_not_externally_attested_history`

and:

`observedAssetDigestEqualityMeansExternallyVerifiedAnnotationAssetHistory = false`

## 3. Raw asset retention

FR-56 hashes the supplied bytes during intake but does not place raw bytes into the resulting evidence record.

Retention state:

`ephemeral_digest_then_discard`

This preserves the raw-image ephemerality boundary.

Byte identity does not imply:

- image decodability;
- human-face presence;
- anatomical correctness;
- annotation quality;
- reference-standard authority.

Those remain separate validation concerns.

## 4. Freeze-order metadata

Required timestamps:

```text
traceFrozenAt
mentonSideAnnotationFrozenAt
pairedAt
```

They must use canonical ISO-8601 UTC millisecond representation and satisfy:

```text
traceFrozenAt <= mentonSideAnnotationFrozenAt <= pairedAt
```

FR-56 also requires:

```text
traceFrozenBeforeCandidateAnnotationAttested = true
pairingPerformedAfterBothAnnotationsFrozenAttested = true
```

This rejects internally contradictory chronology metadata. It does not prove chronology cryptographically or through an independent external service.

`chronologyProofState = attested_and_timestamp_consistent_not_cryptographically_proven`

## 5. No invented annotator-count rule

No reviewed evidence currently establishes that the trace and Menton-side annotations must be produced by different annotators, nor any minimum annotator count.

Accordingly:

```text
distinctAnnotatorsRequired = null
minimumPairs               = null
minimumSubjects            = null
```

Same-annotator intake can be structurally admissible under the existing blindness/freeze contracts, but it is not promoted to independent anatomical ground truth.

## 6. Canonical paired source record

After source validation and byte-digest verification, FR-56 creates a deeply frozen source record.

Canonicalization:

`sorted_object_keys_preserve_array_order_json_v1`

Digest algorithm:

`sha256`

Digest scope:

`source_annotations_capture_asset_and_freeze_metadata_excluding_derived_join`

The digest binds:

- pair reference;
- subject/capture identity;
- canonical asset digest;
- both annotation-observed asset digests;
- asset byte length;
- FR-54 source annotation;
- FR-50 source annotation;
- freeze/pairing timestamps;
- chronology attestations.

Array order is preserved because FR-54 trace point order is source evidence.

## 7. FR-55 result is derived, not source identity

The FR-55 raw join is deterministic downstream computation and is intentionally excluded from the pair digest:

```text
pairedRecordDigestIncludesDerivedJoin = false
```

The source record is frozen first. FR-55 is then regenerated from the frozen annotations.

Its fail-closed state must remain:

```text
membershipThreshold = null
endpointSelectionRule = null
membershipDecision = null
endpointDecision = null
```

Changing a future derived implementation therefore cannot silently redefine the identity of already acquired source evidence.

## 8. Persisted-record integrity

`verifyFrozenCentralChinPairedEvidenceRecordFR56` reconstructs the intake-shaped source content and recomputes the canonical pair digest.

Changes to a trace point, candidate point, identity field, observed asset digest, canonical asset digest, timestamp, or freeze attestation invalidate the stored digest.

This validates stored record-content integrity only. Once raw bytes are not retained by the FR-56 record, pair-digest verification cannot independently re-hash those discarded bytes.

Therefore:

`pairRecordDigestReverifiesDiscardedAssetBytes = false`

## 9. Deliberately unresolved

FR-56 keeps all of these `null`:

```text
minimumPairs
minimumSubjects
distinctAnnotatorsRequired
membershipThreshold
anchorAgreementTolerance
endpointSelectionRule
empiricalAcceptanceCriterion
```

No value may be inferred from synthetic fixtures or observed pair distances.

## 10. Synthetic tests are contract tests only

Synthetic fixtures validate:

- actual SHA-256 computation over supplied bytes;
- both annotation-observed digests matching the actual intake asset;
- exact subject/capture binding;
- FR-54 and FR-50/52 source validation;
- canonical timestamp representation;
- timestamp-order consistency;
- deterministic pair hashing;
- trace-array-order preservation;
- persisted-record mutation detection;
- FR-55 derivation only after source freeze;
- fail-closed authority boundaries.

They are not empirical face evidence.

Current static readiness:

```text
realPairedEvidenceDatasetPresent = false
externalAnnotationAssetHistoryAttestationPresent = false
externalChronologyAttestationPresent = false
reviewedReferenceStandardReady = false
empiricalValidationReady = false
endpointSelectionReady = false
providerMappingReady = false
productionGeometryReady = false
```

## 11. Explicitly not authorized

FR-56 does not authorize:

- pair digest -> empirical validity;
- pair digest -> reviewed reference standard;
- pair digest -> re-verification of discarded image bytes;
- byte/digest equality -> anatomical correctness;
- annotation-observed digest equality -> externally verified annotation-to-asset history;
- timestamp order -> cryptographic chronology proof;
- freeze attestation -> externally verified chronology;
- same capture -> distinct annotators;
- same capture -> independent anatomical ground truth;
- observed pair distances -> post-hoc membership threshold;
- observed pair distances -> FR-35 endpoint selection;
- FR-55 distance -> trace membership;
- FR-55 zero distance -> exact FR-35 endpoint;
- provider/MediaPipe mapping;
- traditional 地閣 equivalence;
- empirical validation;
- production 三停 / F1 / F6 / geometry.

## 12. Next evidence

The next material step is real acquisition under the frozen protocols:

1. record the exact source asset digest at each annotation session;
2. collect real FR-54 traces and FR-50/52 Menton-side annotations on the same capture bytes;
3. pass the actual bytes and both declared observed digests through FR-56;
4. persist frozen paired source records and their canonical digests;
5. derive FR-55 raw joins afterward without fitting a threshold post hoc.

If stronger annotation-to-asset history or chronology proof is required, it must come from a separately verifiable acquisition/annotation event mechanism rather than upgrading FR-56 digest equality or timestamp consistency.
