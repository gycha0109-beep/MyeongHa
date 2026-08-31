# Face Reading FR-60 Authority Decision — External Trust Evidence Candidate Intake / Freeze v0.1

## Decision

**ADMIT as a research-only candidate-evidence intake/freeze authority. Do not promote signer trust, governance identity, external provenance authenticity, empirical authority, or production geometry.**

## Admissible claims

FR-60 may establish only that:

```text
FR-59 mechanical verification succeeded at intake
candidate artifact bytes matched their declared SHA-256 digests
candidate artifact refs were unique
the bundle was normalized deterministically
FR-59 cryptographic coordinates and candidate evidence metadata were frozen under one digest
```

## Input authority hardening

FR-60 accepts no caller-controlled trust result.

The top-level input and candidate artifact objects are checked for exact contract keys. Undeclared fields are rejected, including attempts to smuggle in fields such as:

```text
trusted: true
verified: true
trustedReviewer: true
```

This is required because TypeScript excess-property checks do not protect JavaScript/runtime callers.

## Upstream decision

FR-60 must execute FR-59 verification from the supplied FR-59 verification input. A caller-provided report object alone is insufficient because it could be forged as JSON.

The successful FR-59 result must still state:

```text
signerKeyTrustEstablished = false
externalGovernanceIdentityVerified = false
externalAcquisitionProvenanceAuthenticated = false
realDatasetEstablished = false
productionGeometryAuthorized = false
```

## Candidate evidence decision

FR-60 records arbitrary non-empty evidence-kind refs and optional claimed issuer/subject refs without deciding which kinds are sufficient or which claims are true.

A candidate artifact is therefore evidence **for future trust evaluation**, not trusted evidence in the authority sense.

## Retention decision

The frozen FR-60 artifact stores digest and claim metadata only. It does not persist candidate artifact bytes or the FR-59 public-key PEM.

This minimizes accidental elevation of an intake bundle into a de facto credential store and avoids claiming replayable FR-59 verification from data that FR-60 does not retain.

## Frozen verifier decision

A later frozen-artifact verifier may re-check deterministic integrity and fail-closed boundaries, but cannot claim that it independently re-ran FR-59 without the original FR-59 verification bytes/key material.

Therefore:

```text
fr59MechanicalVerificationPerformedAtIntake = true
fr59MechanicalVerificationReperformedByFrozenVerifier = false
```

## Trust policy decision

No trust policy is invented:

```text
minimumCandidateArtifactsForTrustSufficiency = null
requiredReviewerCredential = null
acceptedTrustRootType = null
trustedTimestampMechanism = null
externalTrustAcceptanceCriterion = null
```

No key registry, reviewer CA, institutional root key, credential rule, or timestamp authority is created in-repository without external evidence.

## Fail-closed authority

These remain false:

```text
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

## Production gate

`assertCentralChinExternalTrustEvidenceReadyForProductionFR60()` must fail closed unconditionally in v0.1.

## Final authority state

```text
external_trust_evidence_candidate_intake_contract_defined_exact_bytes_frozen_no_external_trust_established
```
