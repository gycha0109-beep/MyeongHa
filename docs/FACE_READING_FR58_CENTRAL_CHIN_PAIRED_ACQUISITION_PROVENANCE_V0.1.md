# FR-58 — Central Chin Paired Acquisition Provenance / Freeze Chronology

## Status

Research-only acquisition-governance slice.

Authority state:

```text
paired_acquisition_provenance_contract_defined_exact_fr57_binding_outcome_blind_freeze_attested_no_authenticated_external_provenance
```

FR-58 defines how a frozen FR-57 paired dataset ledger may be accompanied by acquisition provenance and freeze artifacts without falsely promoting caller-supplied attestations into authenticated external history, empirical validity, or production authority.

## Why FR-58 exists

FR-57 deliberately left these blockers open:

```text
outcome_blindness_only_attested_not_externally_verified
dataset_freeze_chronology_only_structurally_verified_not_cryptographic
real_paired_evidence_not_established
empirical_acceptance_rules_unreviewed
```

Its next admissible work explicitly requires real FR-56 pairs to be acquired under a separately governed procedure, with dataset membership and partition assignment frozen before FR-55 outcome inspection.

FR-58 therefore adds a provenance contract around the already-frozen FR-57 ledger. It does not claim that an external procedure has actually been authenticated.

## Upstream boundary

FR-58 accepts only a ledger that still passes `verifyFrozenCentralChinPairedDatasetLedgerFR57`.

It binds provenance to:

```text
FR-57 datasetRef
FR-57 datasetDigest
every FR-57 pairRef
pairedRecordDigest
partition
canonicalAssetDigest
```

No FR-54, FR-50, FR-55, or FR-56 source identity is reopened.

## One acquisition event per frozen pair

Every FR-57 pair must have exactly one acquisition event.

Each event records:

```text
pairRef
pairedRecordDigest
partition
canonicalAssetDigest
acquisitionEventRef
acquisitionEvidenceDigest
acquiredAt
```

The first four fields must exactly match one ledger entry. Missing rows, duplicates, or identity drift are rejected.

`acquisitionEventRef` is unique per pair event. `acquisitionEvidenceDigest` may be shared when one batch evidence artifact legitimately covers multiple pair events; the exact pair-to-event binding remains explicit in each row.

## Freeze chronology

The structural chronology is:

```text
FR-56 pair.pairedAt
<= acquisition event acquiredAt
<= partitionAssignmentFrozenAt
<= FR-57 ledger.datasetFrozenAt
<= optional fr55OutcomeFirstInspectedAt
```

If FR-55 outcomes have not yet been inspected, `fr55OutcomeFirstInspectedAt` is `null`.

This ordering rejects internally contradictory provenance. It is not a trusted timestamp service and is not cryptographic chronology proof.

## Outcome blindness

FR-58 requires all three declarations:

```text
partitionAssignmentFrozenBeforeFR55OutcomeInspectionAttested = true
datasetMembershipFrozenBeforeFR55OutcomeInspectionAttested = true
fr55OutcomeVisibleBeforePartitionAndMembershipFreeze = false
```

The completed FR-57 dataset freeze must precede an explicitly recorded first FR-55 outcome inspection when such an inspection timestamp is present.

These declarations remain attestations only.

## External-governance evidence fields

A provenance manifest records:

```text
acquisitionProcedureRef
governanceAuthorityRef
acquisitionEvidenceBundleDigest
acquisitionStatementArtifactDigest
partitionFreezeStatementArtifactDigest
datasetFreezeStatementArtifactDigest
detachedSignatureArtifactDigest
signerKeyRef
```

The digest fields use canonical lowercase `sha256:<64-hex>` form.

Their presence provides exact artifact identity for later review. It does not establish authenticity in FR-58.

The following therefore remain false:

```text
externalGovernanceIdentityVerified
acquisitionEvidenceBundleContentExternallyVerified
cryptographicSignatureVerified
signerKeyTrustEstablished
provenanceTimestampExternallyVerified
externalAcquisitionProvenanceAuthenticated
```

A later trust-root/signature/timestamp-verification slice would be required to promote those facts.

## Deterministic provenance digest

FR-58 canonicalizes pair events by:

```text
pairedRecordDigest
then partition
then pairRef
```

Caller input order is non-semantic. The frozen provenance artifact itself is stored in canonical order, and verification rejects persisted-order tampering.

The digest commits to:

```text
provenanceRef
acquisitionProcedureRef
governanceAuthorityRef
FR-57 datasetRef
FR-57 datasetDigest
canonical pair acquisition events
partitionAssignmentFrozenAt
FR-57 datasetFrozenAt
optional fr55OutcomeFirstInspectedAt
outcome-blind freeze declarations
acquisition/governance artifact digests
signerKeyRef
```

It deliberately does not include FR-55 outcome values:

```text
provenanceDigestIncludesFR55Outcome = false
```

Changing acquisition evidence or a freeze artifact changes provenance identity, but does not itself validate the truth of that evidence.

## Real-dataset boundary

FR-58 can structurally record a provenance package, including synthetic test fixtures.

It cannot conclude:

```text
realDatasetEstablished = true
```

because this slice does not authenticate the external governance identity, artifact contents, signature, key trust, or timestamp source.

Therefore even a non-empty, fully covered provenance manifest remains:

```text
externalAcquisitionProvenanceAuthenticated = false
realDatasetEstablished = false
empiricalValidationAuthorized = false
```

## Unresolved empirical authority

FR-58 leaves all empirical parameters unchanged and unresolved:

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

No threshold, ratio, sample-size requirement, endpoint rule, or acceptance criterion may be inferred from provenance presence.

## Fail-closed boundaries

The following interpretations remain forbidden:

```text
recorded acquisition event -> externally verified real capture
recorded evidence digest -> verified evidence content
recorded governance ref -> verified authority identity
recorded signature artifact -> verified signature
recorded signer key -> trusted key
timestamp order -> cryptographic chronology proof
freeze attestation -> externally verified outcome blindness
exact FR-57 binding -> real dataset established
exact FR-57 binding -> empirical validity
provenance digest -> reviewed reference standard
calibration partition -> threshold authority
holdout partition -> validation passed
```

And all earlier anatomical/production prohibitions remain in force:

```text
FR-55 distance != trace membership
FR-55 zero distance != FR-35 endpoint
Menton-side != FR-35 exact endpoint
provider index 152 != Menton
FACE_OVAL != FR-35 contour
地閣 != exact Menton equivalence
```

## What FR-58 authorizes

FR-58 authorizes only:

1. exact verification of the upstream frozen FR-57 ledger;
2. one acquisition-provenance event per FR-57 pair;
3. exact binding of pair identity and partition membership;
4. canonical acquisition and freeze timestamps;
5. structural chronology validation from FR-56 pair freeze through optional first FR-55 outcome inspection;
6. explicit partition and membership freeze-before-outcome attestations;
7. recording acquisition/governance evidence artifact digests and signer references;
8. deterministic provenance canonicalization, digesting, freezing, and tamper verification;
9. structural readiness reporting while external trust remains blocked.

## What FR-58 does not authorize

FR-58 does not authenticate external evidence, certify a real dataset, establish a reviewed reference standard, compute or authorize empirical metrics, fit thresholds, select endpoints, map provider landmarks, establish traditional equivalence, or authorize production geometry.

## Next admissible evidence step

The next admissible step is to ingest an actual acquisition package under this contract and independently verify the external governance identity, evidence bundle contents, detached signature, signer-key trust, and timestamp provenance. Only after that authentication may a later authority slice consider whether `realDatasetEstablished` can become true.
