# FR-DATA-15 — External Human Reference Review / Attestation Protocol

## Status

`external_review_attestation_contract_defined_no_authenticated_external_review`

FR-DATA-15 addresses the next gap after FR-DATA-14:

> How can a future external human review be bound to the exact construct and human-reference evidence that was reviewed without pretending that an arbitrary reviewer string or approval flag is authenticated authority?

This slice defines the attestation intake contract only.

It does **not** authenticate an external reviewer, verify a signature, establish signer-key trust, or promote the human reference standard.

---

## Upstream boundary

FR-DATA-14 freezes:

```text
construct.face.categorical_human_face_count_state.frdata14
```

and records the complete human-only admission state:

```text
zero_human_faces      -> admitted_reference_candidate
one_human_face        -> admitted_reference_candidate
multiple_human_faces  -> admitted_reference_candidate
indeterminate         -> preserved_non_scoring_indeterminate
unresolved            -> preserved_non_scoring_unresolved
```

FR-DATA-15 does not change those semantics.

It also does not introduce:

```text
exact numeric human face count
binary face-presence projection
exact-single-face projection
provider-output mapping
provider threshold
```

---

## Authority

Authority ref:

```text
authority.face.external_human_reference_review_attestation.frdata15
```

Version:

```text
0.1.0
```

State:

```text
external_review_attestation_contract_defined_no_authenticated_external_review
```

---

## Exact review package

A reviewer must not attest to an informal description such as:

```text
"the latest human labels"
```

FR-DATA-15 constructs an exact review package bound to:

```text
datasetRef
constructRef
constructVersion
constructDefinitionDigest
upstreamAnnotationLedgerDigest
upstreamAdjudicationLedgerDigest
admissionSetDigest
capture counts
non-scoring outcome counts
```

The package receives its own canonical SHA-256 digest:

```text
reviewPackageDigest
```

Canonicalization:

```text
sorted_object_keys_preserve_array_order_json_v1
```

Digest algorithm:

```text
sha256
```

The admission-set digest covers the exact FR-DATA-14 capture admission projection:

```text
captureRef
partition
canonicalAssetDigest
adjudicationOutcome
admissionState
scoringReferenceClass
```

Changing a human adjudication outcome or admission state changes the package digest.

---

## Provider evidence excluded from the review package

The FR-DATA-15 review package is human-reference-only.

It explicitly records:

```text
providerEvidenceIncluded = false
providerPerformanceIncluded = false
providerThresholdsIncluded = false
```

This prevents historical MediaPipe behavior from defining or influencing the human reference standard.

The external review declaration must also state:

```text
providerOutputVisibleDuringReview = false
providerPerformanceVisibleDuringReview = false
providerThresholdsVisibleDuringReview = false
providerEvidenceUsedToReachDecision = false
```

---

## External review attestation surface

A future external review record must bind to the exact `reviewPackageDigest` and record:

```text
attestationRef
reviewerRef
reviewerRole
reviewerOrganizationRef
reviewEvidenceBundleDigest
reviewStatementArtifactDigest
detachedSignatureArtifactDigest
signerKeyRef
reviewedAt
declaredDecision
```

Supported declared decisions are:

```text
approve_reference_candidate_set
changes_required
reject_reference_candidate_set
unable_to_conclude
```

These are **declared review decisions**, not authenticated authority states.

---

## Required review-scope declarations

The attestation must declare that the reviewer examined:

```text
construct definition
complete reference-candidate admission set
preserved indeterminate/unresolved outcomes
canonical capture assets
frozen independent annotations
frozen adjudications
```

It must also declare:

```text
reviewerIndependenceDeclared = true
automaticDecisionRuleUsed = false
syntheticFixtureUsedAsEmpiricalEvidence = false
```

The reviewer reference must differ from every original annotator and adjudicator reference.

This checks internal reference separation only. It does not authenticate the external reviewer's real identity.

---

## Review timestamp consistency

The recorded external review timestamp must not precede the frozen FR-DATA-10 adjudication ledger timestamp.

This proves only record consistency:

```text
reviewedAt >= adjudicationLedgerFrozenAt
```

It does not prove that the external review actually happened at that time.

Therefore:

```text
reviewTimestampExternallyVerified = false
```

---

## Detached statement and signature artifacts

FR-DATA-15 requires canonical SHA-256 references for:

```text
reviewEvidenceBundleDigest
reviewStatementArtifactDigest
detachedSignatureArtifactDigest
```

and a non-empty:

```text
signerKeyRef
```

This records which artifacts are claimed to support the external review.

It does **not** perform cryptographic verification.

FR-DATA-15 has no pinned external trust root and no trusted signer-key registry.

Therefore all of the following remain false:

```text
externalReviewerIdentityVerified
reviewerCredentialVerified
cryptographicSignatureVerified
signerKeyTrustEstablished
pinnedExternalTrustRootAvailable
reviewEvidenceBundleContentExternallyVerified
externalReviewAuthenticityValidated
```

---

## Why approval does not promote authority

Even this attestation:

```text
declaredDecision = approve_reference_candidate_set
```

cannot produce:

```text
externalConstructReviewCompleted = true
externalReferenceStandardReviewCompleted = true
reviewedHumanReferenceStandardAuthorityValidated = true
```

because FR-DATA-15 has not authenticated:

```text
who the reviewer really is
whether the claimed role/credential is valid
whether the detached signature verifies
whether the signer key is trusted
whether the evidence bundle actually contains the declared evidence
```

This avoids converting a self-authored JSON object into external authority.

---

## No invented policy

FR-DATA-15 deliberately leaves the following unset:

```text
minimumExternalReviewers = null
requiredReviewerCredential = null
allowedSignatureAlgorithm = null
externalReviewAcceptanceThreshold = null
```

No arbitrary reviewer count, credential rule, signature algorithm, or acceptance threshold is invented.

---

## Safe truths after a valid FR-DATA-15 report

A successful report can prove only that:

- an exact FR-DATA-15 review package was recomputed from FR-DATA-07/10/14,
- the construct definition digest is bound exactly,
- the frozen annotation ledger digest is bound exactly,
- the frozen adjudication ledger digest is bound exactly,
- the exact reference-candidate admission set is bound,
- a declared external review attestation references that exact package,
- review-scope and provider-blindness declarations are complete,
- the reviewer reference is distinct from upstream annotator/adjudicator refs,
- evidence/statement/signature artifact digests were recorded,
- a signer-key reference was recorded,
- the review timestamp is record-consistent with the frozen adjudication ledger.

It cannot prove external authenticity.

---

## Still false after FR-DATA-15

```text
externalReviewerIdentityVerified
reviewerCredentialVerified
cryptographicSignatureVerified
signerKeyTrustEstablished
pinnedExternalTrustRootAvailable
reviewEvidenceBundleContentExternallyVerified
reviewTimestampExternallyVerified
externalReviewAuthenticityValidated
externalConstructReviewCompleted
externalReferenceStandardReviewCompleted
reviewedHumanReferenceStandardAuthorityValidated
captureConsensusGroundTruthAuthorityValidated
interAnnotatorGroundTruthAuthorityValidated
providerDetectionConstructValidityValidated
providerFaceCandidateHumanIdentityValidated
facePresenceVerified
singleHumanFaceVerified
truePositiveFalsePositiveTerminologyAuthorized
confusionMatrixAuthorized
classificationMetricsAuthorized
classificationMetricsComputed
providerDecisionThresholdDefined
reviewedEmpiricalValidationCompleted
nearDuplicatePartitionLeakageValidated
captureQualityAuthorityValidated
anatomicalLandmarkAuthorityValidated
traditionalSemanticAuthorityValidated
productionGeometryAuthorized
```

---

## Synthetic contract tests

Repository tests use synthetic metadata only.

They verify:

- deterministic review-package digest,
- digest change when the admission set changes,
- canonical package-content validation,
- exact attestation-to-package binding,
- provider-blind external-review declarations,
- reviewer-ref separation from annotators/adjudicators,
- timestamp ordering after adjudication freeze,
- canonical evidence/statement/signature artifact digests,
- absence of invented reviewer/credential/signature/acceptance policy,
- fail-closed semantic/performance/production authority,
- fail-closed promotion.

Synthetic fixtures do not authenticate an external reviewer or signature.

---

## Next evidence gap

FR-DATA-15 makes the remaining blocker explicit:

> an authenticated external-review trust path does not yet exist.

A later slice may define a trust-root / signer-key verification surface only when a real external reviewer identity, credential policy, signature artifact, and trusted public-key material actually exist.

Until then, the correct state is:

```text
attestation recorded
!= external review authenticated
!= reference standard promoted
```
