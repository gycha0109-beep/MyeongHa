# Face Reading FR-60 — Central Chin External Trust Evidence Candidate Intake / Freeze v0.1

## 1. Status

FR-60 defines a research-only intake/freeze layer for **candidate external trust evidence** associated with a successful FR-59 central-chin provenance verification.

It does not establish external trust. It closes only the next deterministic gap:

```text
FR-59 verified cryptographic coordinates
+ actual candidate trust-evidence bytes
+ declared byte digests
+ claim metadata
→ deterministic frozen candidate-evidence bundle
```

Authority state:

```text
external_trust_evidence_candidate_intake_contract_defined_exact_bytes_frozen_no_external_trust_established
```

## 2. Why this slice exists

FR-59 can prove:

```text
recorded artifact digest == supplied artifact bytes
supplied public-key SPKI digest == declared SPKI digest
detached Ed25519 signature mathematically verifies over the FR-59 payload
```

but intentionally leaves these false:

```text
signerKeyTrustEstablished
pinnedExternalTrustRootAvailable
externalGovernanceIdentityVerified
provenanceTimestampExternallyVerified
externalAcquisitionProvenanceAuthenticated
realDatasetEstablished
```

The next external authority step needs actual evidence capable of supporting future trust decisions. Before such evidence can be reviewed or authenticated, the repository needs a source-safe way to bind the exact bytes to the exact FR-59 verification coordinates without accepting a caller-supplied `trusted=true` style promotion flag.

FR-60 provides that intake boundary only.

## 3. Upstream verification is re-executed at intake

FR-60 accepts the complete FR-59 verification input and calls:

```text
verifyCentralChinExternalProvenanceArtifactsFR59(...)
```

before any candidate trust-evidence bundle is frozen.

A valid FR-60 intake therefore binds to an FR-59 result with:

```text
allRecordedArtifactByteIdentitiesVerified = true
cryptographicSignatureMathematicallyVerified = true
```

while also requiring FR-59's trust/production flags to remain false.

## 4. FR-59 coordinates preserved by FR-60

The frozen candidate bundle records:

```text
provenanceRef
fr58ProvenanceDigest
datasetRef
datasetDigest
signerKeyRef
signerPublicKeySpkiDigest
signaturePayloadDigest
```

These fields are evidence coordinates. They are not external trust declarations.

In particular:

```text
signerKeyRef == string binding
signerPublicKeySpkiDigest == supplied key byte identity
signaturePayloadDigest == FR-59 signed payload identity
```

None of them establishes who controls the key.

## 5. Candidate trust-evidence artifact input

Each candidate artifact carries only:

```text
artifactRef
evidenceKindRef
declaredDigest
bytes
claimedIssuerRef | null
claimedSubjectRef | null
```

`evidenceKindRef`, `claimedIssuerRef`, and `claimedSubjectRef` are descriptive claim metadata only. FR-60 deliberately does not define a credential taxonomy, certificate hierarchy, institution registry, trusted CA list, reviewer class, or trust policy.

The caller cannot provide an authority-elevating field such as:

```text
trusted
verified
approvedAuthority
trustedReviewer
```

The runtime rejects undeclared input/artifact fields.

## 6. Exact byte identity

Every candidate artifact must satisfy:

```text
SHA-256(actual artifact bytes) == declaredDigest
```

Canonical digest form:

```text
sha256:<64 lowercase hex>
```

Artifact refs must be unique inside one bundle.

Repeated byte content across distinct artifact refs is not forbidden. The same document may legitimately be referenced for multiple candidate purposes; FR-60 does not invent an independence rule.

At least one artifact is required to perform an intake/freeze event. This is a structural non-empty requirement only. It is **not** a minimum evidence count for trust sufficiency.

Accordingly:

```text
minimumCandidateArtifactsForTrustSufficiency = null
```

## 7. Deterministic bundle identity

Candidate artifacts are normalized by:

```text
sort ascending by artifactRef
```

The resulting frozen bundle digest uses:

```text
canonicalization = sort_candidate_artifacts_by_artifact_ref_json_v1
digest = sha256
scope = fr59_cryptographic_coordinates_and_exact_candidate_trust_evidence_byte_digests_with_claim_metadata
```

Input array order therefore does not define evidence-bundle identity.

Changing any bound FR-59 coordinate, artifact ref, evidence kind ref, artifact digest, claimed issuer/subject ref, or freeze timestamp changes the bundle digest.

## 8. Retention boundary

FR-60 needs candidate artifact bytes only while verifying their digests at intake.

The frozen output does not retain:

```text
candidate evidence bytes
FR-59 signer public-key PEM
```

It retains their required digest/cryptographic coordinates instead.

Therefore:

```text
frozenArtifactRetainsCandidateEvidenceBytes = false
frozenArtifactRetainsSignerPublicKeyPem = false
```

This does not delete or control any external source repository where the evidence may separately exist.

## 9. Important verifier limitation

The frozen FR-60 artifact can later re-check:

- schema and authority boundary;
- artifact metadata shape;
- canonical ordering;
- canonical digests;
- frozen bundle digest integrity; and
- all fail-closed flags.

It intentionally cannot re-run FR-59 cryptographic verification from the frozen FR-60 artifact alone because FR-60 does not persist the FR-59 external artifact bytes, detached signature bytes, or signer public-key PEM.

Therefore the frozen bundle records both:

```text
fr59MechanicalVerificationPerformedAtIntake = true
fr59MechanicalVerificationReperformedByFrozenVerifier = false
```

The second flag prevents a persisted FR-60 bundle from overstating what can be independently recomputed without the original FR-59 verification input.

## 10. What byte identity does not prove

All of the following implications are forbidden:

```text
candidate evidence digest match
  != claim truth
  != issuer identity verification
  != subject identity verification
  != credential verification

trust-root candidate artifact
  != pinned trusted root

FR-59 signature math + candidate evidence
  != trusted signer
  != governance authority verification
  != authenticated external provenance

candidate timestamp evidence
  != trusted timestamp authority
  != external chronology proof

frozen candidate bundle
  != real dataset
  != empirical validity
  != calibration authority
  != production geometry
```

## 11. No invented trust policy

FR-60 leaves these unresolved:

```text
minimumCandidateArtifactsForTrustSufficiency = null
requiredReviewerCredential = null
acceptedTrustRootType = null
trustedTimestampMechanism = null
externalTrustAcceptanceCriterion = null
```

The existing empirical/design values also remain null:

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

## 12. Still false after a valid FR-60 freeze

```text
candidateMetadataClaimsExternallyAuthenticated
signerKeyTrustEstablished
pinnedExternalTrustRootAvailable
externalGovernanceIdentityVerified
reviewerCredentialVerified
trustedTimestampAuthorityVerified
artifactSemanticContentsExternallyVerified
externalAcquisitionProvenanceAuthenticated
realDatasetEstablished
empiricalValidationAuthorized
membershipThresholdAuthorized
endpointSelectionAuthorized
providerMappingAuthorized
traditionalDigeEquivalenceAuthorized
productionGeometryAuthorized
```

## 13. Synthetic fixtures

FR-60 tests may generate synthetic trust-evidence bytes and arbitrary claim refs only to exercise:

- exact byte hashing;
- undeclared trust-field rejection;
- FR-59 binding;
- deterministic canonicalization;
- tamper rejection; and
- fail-closed authority behavior.

Synthetic fixtures do not establish a real signer, organization, reviewer, credential, trust root, timestamp authority, evidence package, dataset, or empirical result.

## 14. Next admissible authority step

After FR-60, an authority promotion still requires an independently justified rule for authenticating candidate evidence against an actual external trust source, for example a verifiable key/identity provenance mechanism or trusted timestamp mechanism whose governing source is itself evidence-backed.

FR-60 deliberately does not select such a mechanism.
