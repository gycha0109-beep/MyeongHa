# FR-58 authority decision

## Decision

FR-58 authorizes a **deterministic acquisition-provenance and freeze-chronology contract exactly bound to a verified FR-57 central-chin paired dataset ledger**.

It does not authenticate external governance evidence and does not establish a real empirical dataset.

## Positive authority

FR-58 may:

- verify the embedded frozen FR-57 ledger;
- require exactly one acquisition event for each FR-57 pair;
- bind each event to exact `pairRef`, `pairedRecordDigest`, `partition`, and `canonicalAssetDigest` values;
- require unique acquisition event references while allowing a shared evidence digest when one batch artifact legitimately covers multiple pair events;
- record a separately governed acquisition procedure and governance authority reference;
- record acquisition, partition-freeze, dataset-freeze, detached-signature, and signer-key artifact identities;
- enforce canonical ISO-8601 UTC millisecond timestamps;
- enforce the structural chronology `pairedAt <= acquiredAt <= partition freeze <= dataset freeze <= optional first FR-55 outcome inspection`;
- require explicit partition-assignment and dataset-membership freeze-before-outcome attestations;
- compute a deterministic provenance digest excluding FR-55 outcomes;
- freeze pair events in canonical order and detect persisted-order tampering.

## Exact FR-57 binding

The provenance package is subordinate to the exact upstream dataset identity:

```text
FR-57 datasetRef
FR-57 datasetDigest
```

Each pair event must bind one and only one frozen ledger row:

```text
pairRef
pairedRecordDigest
partition
canonicalAssetDigest
```

A caller cannot substitute a different pair identity, asset, or partition while retaining the provenance package.

## Chronology decision

The required structural order is:

```text
FR-56 pair.pairedAt
<= acquiredAt
<= partitionAssignmentFrozenAt
<= FR-57 datasetFrozenAt
<= fr55OutcomeFirstInspectedAt  (when non-null)
```

`fr55OutcomeFirstInspectedAt = null` is valid when outcomes have not yet been inspected.

Timestamp order is consistency evidence only:

```text
timestampOrderMeansCryptographicChronologyProof = false
```

## Outcome-blindness decision

A valid manifest declares:

```text
partitionAssignmentFrozenBeforeFR55OutcomeInspectionAttested = true
datasetMembershipFrozenBeforeFR55OutcomeInspectionAttested = true
fr55OutcomeVisibleBeforePartitionAndMembershipFreeze = false
```

These declarations are not an external audit log:

```text
freezeAttestationMeansExternallyVerifiedOutcomeBlindness = false
```

## External evidence decision

The package requires non-empty procedure/governance/signer references and canonical SHA-256 identities for evidence artifacts.

Recorded artifact identity is useful for future authentication, but FR-58 performs none of the following:

```text
external governance identity verification
external evidence bundle content verification
detached signature cryptographic verification
signer key trust establishment
pinned trust-root validation
external timestamp verification
```

Accordingly:

```text
externalAcquisitionProvenanceAuthenticated = false
```

This matches the repository's established authority pattern that a recorded external attestation is not automatically a trusted attestation.

## Provenance digest decision

The digest commits to the exact FR-57 dataset plus acquisition/freeze metadata and artifact identities, including the optional first FR-55 inspection timestamp as chronology metadata.

Pair event input order is normalized by `pairedRecordDigest`, `partition`, then `pairRef`.

FR-55 outcome values are absent:

```text
provenanceDigestIncludesFR55Outcome = false
```

Therefore an inspection-time change or acquisition/freeze artifact change changes provenance identity, while FR-55 result values themselves do not define the provenance digest.

## Real-dataset decision

The presence of a provenance package does not prove that the external artifacts are authentic.

Thus:

```text
exactFR57BindingMeansRealDatasetEstablished = false
realDatasetEstablished = false
```

Synthetic fixtures may test the contract but cannot establish real evidence.

## Unresolved empirical parameters

The following remain `null`:

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

FR-58 cannot invent a numeric default or empirical acceptance rule.

## Fail-closed authority boundary

All authority-boundary flags remain false, including:

```text
recordedAcquisitionEventMeansRealCaptureExternallyVerified
recordedEvidenceBundleMeansEvidenceContentsExternallyVerified
recordedGovernanceAuthorityRefMeansVerifiedGovernanceIdentity
recordedSignatureArtifactMeansCryptographicallyVerifiedSignature
recordedSignerKeyRefMeansTrustedSignerKey
timestampOrderMeansCryptographicChronologyProof
freezeAttestationMeansExternallyVerifiedOutcomeBlindness
exactFR57BindingMeansRealDatasetEstablished
exactFR57BindingMeansEmpiricalValidity
provenanceDigestMeansEmpiricalValidity
provenanceDigestMeansReviewedReferenceStandard
calibrationPartitionMeansThresholdAuthority
holdoutPartitionMeansValidationPassed
providerMappingAuthorized
traditionalDigeEquivalenceAuthorized
empiricalValidationAuthorized
productionThreeDivisionsMetricAllowed
productionF1Allowed
productionF6Allowed
productionGeometryAuthorized
```

## Final authority state

```text
paired_acquisition_provenance_contract_defined_exact_fr57_binding_outcome_blind_freeze_attested_no_authenticated_external_provenance
```

## Next admissible work

Supply a real acquisition package satisfying FR-58 and independently authenticate its governance identity, evidence bundle, signature, signer key, and timestamp provenance. Do not promote real-dataset or empirical authority merely because the structural FR-58 contract passes.
