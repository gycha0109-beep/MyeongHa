# Face Reading FR-59 — Central Chin External Provenance Artifact Byte + Signature Verification v0.1

## 1. Status

FR-59 defines a research-only verification layer over the frozen FR-58 central-chin paired acquisition provenance artifact.

It closes two mechanical gaps left intentionally open by FR-58:

1. whether the concrete artifact bytes supplied at verification time hash to the exact digests recorded by FR-58; and
2. whether the exact detached-signature bytes recorded by FR-58 mathematically verify over a deterministic, non-circular projection of the substantive FR-58 provenance using a supplied Ed25519 public key.

FR-59 does **not** establish that the supplied public key belongs to a trusted reviewer, institution, data custodian, or governance authority. It does not establish an external timestamp, semantic truth of the evidence contents, real-dataset status, empirical validity, threshold authority, endpoint authority, provider mapping, traditional equivalence, or production geometry.

Authority state:

```text
external_provenance_byte_and_signature_verification_contract_defined_no_pinned_external_trust_root
```

## 2. Upstream dependency

FR-59 consumes only an artifact that passes:

```text
verifyFrozenCentralChinPairedAcquisitionProvenanceFR58(...)
```

This preserves the complete FR-56 → FR-57 → FR-58 chain before any FR-59 verification result is emitted.

FR-58 already binds:

```text
FR-57 dataset identity
+ every pair acquisition event
+ acquisition chronology
+ outcome-blind freeze attestations
+ recorded artifact digests
+ detached signature artifact digest
+ signerKeyRef
```

FR-59 does not reinterpret those semantics. It checks concrete bytes against the recorded identities.

## 3. Exact byte-verification scope

FR-59 requires actual bytes for every recorded evidence/artifact digest that FR-58 exposes:

```text
per-pair acquisitionEvidenceDigest × every FR-58 pair event
acquisitionEvidenceBundleDigest
acquisitionStatementArtifactDigest
partitionFreezeStatementArtifactDigest
datasetFreezeStatementArtifactDigest
detachedSignatureArtifactDigest
```

### 3.1 Pair-level evidence coverage

The caller must provide exactly one pair-evidence artifact entry for every FR-58 `acquisitionEventRef`.

Required properties:

```text
provided pair artifact count == FR-58 pair event count
acquisitionEventRef unique
for every FR-58 event:
  SHA-256(actual pair evidence bytes) == event.acquisitionEvidenceDigest
```

Shared byte content is allowed. FR-58 already permits one batch artifact to support multiple pair events, so FR-59 does not invent a uniqueness rule for evidence digests.

### 3.2 Dataset-level artifact byte identity

For each dataset-level artifact:

```text
SHA-256(actual bytes) == exact FR-58 recorded digest
```

A digest match establishes byte identity only.

It does **not** establish:

- semantic correctness of the document;
- truth of any statement inside it;
- author identity;
- institutional authority;
- chronology authenticity; or
- empirical validity.

## 4. Detached signature verification and the circularity problem

FR-58 `provenanceDigest` includes `detachedSignatureArtifactDigest`.

Therefore the following construction is invalid:

```text
sign(FR-58 provenanceDigest)
→ signature bytes
→ detachedSignatureArtifactDigest
→ FR-58 provenanceDigest changes
→ signature input changes
```

This is a direct circular dependency.

FR-59 breaks that cycle deliberately.

### 4.1 FR-59 signature payload

The detached signature covers a canonical substantive projection containing:

```text
schemaVersion
FR-58 schemaVersion
FR-58 algorithmRef
provenanceRef
acquisitionProcedureRef
governanceAuthorityRef
datasetRef
datasetDigest
canonical frozen pairEvents
partitionAssignmentFrozenAt
datasetFrozenAt
fr55OutcomeFirstInspectedAt
partitionAssignmentFrozenBeforeFR55OutcomeInspectionAttested
datasetMembershipFrozenBeforeFR55OutcomeInspectionAttested
fr55OutcomeVisibleBeforePartitionAndMembershipFreeze
acquisitionEvidenceBundleDigest
acquisitionStatementArtifactDigest
partitionFreezeStatementArtifactDigest
datasetFreezeStatementArtifactDigest
signerKeyRef
researchSignatureVerificationPrimitive
```

It explicitly excludes:

```text
detachedSignatureArtifactDigest
FR-58 provenanceDigest
```

Those exclusions are not omissions of substantive acquisition/freeze evidence. They remove the two recursive fields from the signature input.

The complete frozen FR-58 artifact is still independently verified first, including its `detachedSignatureArtifactDigest` and final `provenanceDigest`.

The combined proof is therefore:

```text
A. FR-58 frozen artifact verification
   → complete FR-58 structural/digest integrity, including signature artifact digest

B. FR-59 signature-payload verification
   → substantive FR-58 provenance projection was signed by the supplied key material
```

## 5. Canonicalization

Signature payload canonicalization:

```text
sorted_object_keys_preserve_array_order_json_v1
```

The pair-event array order is the already-frozen FR-58 canonical order. FR-59 does not reorder or reinterpret it.

Signature payload digest:

```text
SHA-256(canonical UTF-8 payload bytes)
```

The digest is diagnostic/provenance identity only. It is not an empirical-validation digest.

## 6. Research signature primitive

FR-59 implements one mechanical research verification primitive:

```text
ed25519_node_crypto_v1
```

The supplied public key must parse as an Ed25519 public key. The detached signature is verified with Node.js cryptography over the exact canonical payload bytes.

This does **not** mean Ed25519 has been selected as the production governance signature standard.

Accordingly:

```text
productionSignatureAlgorithm = null
researchEd25519PrimitiveMeansProductionSignatureAlgorithmAuthorized = false
```

## 7. Signer key material

Input includes:

```text
signerKeyRef
signerPublicKeyPem
declaredSignerPublicKeySpkiDigest
```

FR-59 checks:

```text
input.signerKeyRef == FR-58 signerKeyRef
SHA-256(SPKI DER of supplied public key) == declaredSignerPublicKeySpkiDigest
```

This proves only local consistency of the supplied key material and declaration.

There is no pinned trust-root mapping in FR-59 from:

```text
signerKeyRef → trusted SPKI digest / institution / reviewer identity
```

Therefore these remain false:

```text
signerKeyTrustEstablished
pinnedExternalTrustRootAvailable
externalGovernanceIdentityVerified
```

A mathematically valid signature under an untrusted supplied key is not external identity authentication.

## 8. Verification report

A successful FR-59 report may assert only mechanical facts such as:

```text
exactFrozenFR58ProvenanceVerified = true
pairAcquisitionEvidenceByteIdentitiesVerified = true
allRecordedArtifactByteIdentitiesVerified = true
detachedSignatureArtifactByteIdentityVerified = true
signerKeyRefExactMatchVerified = true
suppliedSignerPublicKeyTypeVerified = ed25519
declaredSignerPublicKeySpkiDigestExactMatchVerified = true
cryptographicSignatureMathematicallyVerified = true
```

The same report must retain:

```text
artifactSemanticContentsExternallyVerified = false
externalGovernanceIdentityVerified = false
signerKeyTrustEstablished = false
pinnedExternalTrustRootAvailable = false
provenanceTimestampExternallyVerified = false
externalAcquisitionProvenanceAuthenticated = false
realDatasetEstablished = false
empiricalValidationAuthorized = false
membershipThresholdAuthorized = false
endpointSelectionAuthorized = false
providerMappingAuthorized = false
traditionalDigeEquivalenceAuthorized = false
productionGeometryAuthorized = false
```

## 9. Explicit non-implications

The following implications are forbidden:

```text
byte digest match
  != semantic evidence truth

mathematical signature validity
  != trusted signer identity
  != governance identity verification
  != authenticated external provenance

supplied public key
  != pinned trust root

signed timestamp text
  != externally trusted timestamp

FR-59 research Ed25519 primitive
  != production signature-algorithm authorization

exact FR-58 + byte + signature math
  != real dataset
  != empirical validity
  != reviewed reference standard
  != calibration authority
  != holdout validation passed
```

## 10. Still unresolved

FR-59 must not assign values to the following empirical/design parameters:

```text
partitionAllocationRule = null
calibrationFraction = null
minimumPairs = null
minimumSubjects = null
membershipThreshold = null
anchorAgreementTolerance = null
endpointSelectionRule = null
empiricalAcceptanceCriterion = null
productionSignatureAlgorithm = null
```

The historical Face Reading boundaries also remain unresolved:

```text
地閣 == Menton                    unauthorized
provider index 152 == Menton      unauthorized
FACE_OVAL == FR-35 contour        unauthorized
Menton-side == FR-35 endpoints    unauthorized
3-point scaffold == full contour  unauthorized
FR-54 trace endpoints == FR-35    unauthorized
FR-55 distance threshold          undefined
三停 / F1 / F6 production use     blocked
```

## 11. Synthetic fixtures

FR-59 tests may generate an ephemeral Ed25519 key pair and synthetic artifact bytes solely to exercise:

- digest matching;
- pair-evidence coverage;
- canonical payload construction;
- signature verification;
- tamper rejection; and
- fail-closed authority flags.

Such fixtures are contract/self-tests only.

They do not establish:

```text
real external signer
real governance organization
real evidence package
trusted key root
external timestamp
real paired dataset
empirical validation
```

## 12. Next admissible authority step

The next authority promotion cannot come from another self-declared key string.

It requires externally governed trust evidence that can bind at least:

```text
signerKeyRef
→ pinned public-key identity
→ governance/reviewer identity
→ acceptable key provenance / trust root
```

and, if chronology is to be externally authenticated, an independently justified timestamp-attestation mechanism.

Only after those authorities exist can `externalAcquisitionProvenanceAuthenticated` or `realDatasetEstablished` be reconsidered. FR-59 itself must leave both false.
