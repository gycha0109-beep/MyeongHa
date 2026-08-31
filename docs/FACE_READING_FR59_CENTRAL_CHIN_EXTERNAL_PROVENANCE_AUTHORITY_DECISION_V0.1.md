# Face Reading FR-59 Authority Decision — External Provenance Byte + Signature Verification v0.1

## Decision

**ADMIT as a research-only mechanical verification authority. Do not promote external trust, empirical authority, or production geometry.**

FR-58 records external artifact digests, a detached signature artifact digest, and `signerKeyRef`, but intentionally authenticates none of them. FR-59 is allowed to close only the next machine-verifiable layer:

```text
recorded digest ↔ actual bytes
recorded signature artifact digest ↔ actual signature bytes
canonical substantive provenance payload ↔ detached Ed25519 signature math
supplied public-key bytes ↔ self-declared SPKI digest
FR-58 signerKeyRef ↔ supplied signerKeyRef string
```

## Why this slice is admissible

These checks are deterministic, local, and evidence-preserving. They do not require an invented reviewer, credential, trust root, empirical threshold, or anatomical/traditional equivalence.

The pattern is consistent with the existing Face Reading authority model: byte identity may be established while stronger provenance/source/conformance claims remain explicitly false.

## Circularity resolution

FR-58 `provenanceDigest` includes `detachedSignatureArtifactDigest`; therefore signing the final FR-58 digest would be recursive.

FR-59 instead signs the substantive FR-58 projection while excluding exactly:

```text
detachedSignatureArtifactDigest
FR-58 provenanceDigest
```

The final FR-58 artifact is independently verified in full first. The signature then verifies the non-recursive substantive projection.

This exclusion is part of the authority contract and must remain explicit.

## Pair-level evidence requirement

All FR-58 `pairEvents[*].acquisitionEvidenceDigest` values must be checked against actual supplied pair-evidence bytes with exact `acquisitionEventRef` coverage.

FR-59 must not verify only the dataset-level bundle and silently leave pair-level evidence digests unbound.

Shared evidence bytes/digests across multiple pair events remain legal because FR-58 permits batch evidence reuse.

## Signature decision

FR-59 uses:

```text
researchSignatureVerificationPrimitive = ed25519_node_crypto_v1
productionSignatureAlgorithm = null
```

This is an implementation-scoped test/verification primitive, not a production governance-algorithm decision.

A successful signature check means:

> the exact detached signature bytes mathematically verify over the canonical FR-59 payload under the supplied Ed25519 public key.

It does **not** mean:

> the public key belongs to the claimed signer, reviewer, institution, or governance authority.

## Key trust decision

FR-59 may calculate and verify the SPKI SHA-256 digest of the supplied public key, but no repository authority currently pins that digest to a trusted identity.

Therefore:

```text
signerKeyTrustEstablished = false
pinnedExternalTrustRootAvailable = false
externalGovernanceIdentityVerified = false
```

`signerKeyRef` exact equality is a label-binding check only.

## Timestamp decision

FR-58 chronology remains structurally verified. A mathematically signed payload can bind the timestamp strings that it contains, but FR-59 has no independent trusted timestamp source.

Therefore:

```text
provenanceTimestampExternallyVerified = false
signedTimestampClaimMeansExternallyTimestamped = false
```

## Semantic evidence decision

Digest equality establishes exact byte identity, not truth or adequacy of evidence contents.

Therefore:

```text
artifactSemanticContentsExternallyVerified = false
externalAcquisitionProvenanceAuthenticated = false
realDatasetEstablished = false
```

## Empirical / geometry decision

All empirical and geometry promotion remains blocked:

```text
partitionAllocationRule = null
calibrationFraction = null
minimumPairs = null
minimumSubjects = null
membershipThreshold = null
anchorAgreementTolerance = null
endpointSelectionRule = null
empiricalAcceptanceCriterion = null

empiricalValidationAuthorized = false
providerMappingAuthorized = false
traditionalDigeEquivalenceAuthorized = false
productionGeometryAuthorized = false
```

No FR-35 endpoint or FR-55 threshold may be inferred from FR-59.

## Production gate

`assertCentralChinExternalProvenanceReadyForProductionFR59()` must fail closed unconditionally in v0.1.

The remaining blockers are not code-quality blockers. They are missing authority/evidence:

```text
trusted external governance identity
pinned signer public-key trust root
external timestamp authority
semantic evidence-content review/authentication
real paired-evidence dataset authentication
reviewed empirical acceptance rules
```

## Final authority state

```text
external_provenance_byte_and_signature_verification_contract_defined_no_pinned_external_trust_root
```
