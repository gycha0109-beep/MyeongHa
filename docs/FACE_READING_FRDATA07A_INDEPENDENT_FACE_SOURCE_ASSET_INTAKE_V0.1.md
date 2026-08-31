# FACE_READING_FRDATA07A_INDEPENDENT_FACE_SOURCE_ASSET_INTAKE_V0.1

## 1. Purpose

FR-DATA-07A closes one mechanical gap in the FR-DATA-07 human-face-count validation chain:

```text
source page / source instance metadata
+ exact provided image bytes
+ declared SHA-256
→ byte digest + image header verified at intake
→ provenance metadata frozen beside those intake results
→ exact binding to FR-DATA-07 capture source coordinates
```

FR-DATA-07 currently records `sourceProvenanceRef`, `sourceInstanceRef`, and `canonicalAssetDigest`, but those fields are structurally validated as identifiers/digests. They are not, by themselves, evidence that a particular supplied byte sequence was inspected and bound to those coordinates.

FR-DATA-07A adds that byte/provenance intake layer. It does not promote the dataset to empirical authority.

## 2. Scope

FR-DATA-07A accepts an exact image byte sequence supplied to the intake function and requires:

- canonical lowercase `sha256:<64-hex>` declared digest;
- exact SHA-256 recomputation over the supplied bytes;
- supported PNG/JPEG/WebP header inspection using the existing FR-DATA-02 byte parser;
- exact source-reported width/height match when both are supplied;
- absolute HTTP(S) source page and source asset URLs;
- explicit source provenance and source-instance refs;
- source rights basis text and one or more rights evidence refs;
- explicit rights-review state that remains non-legal-adjudication;
- at least one privacy/subject-risk screening note;
- derivative source-instance linkage when applicable; and
- acquisition timestamp.

The frozen record does not retain the raw image bytes.

## 3. Relationship to issue #224

Issue #224 requires the first real empirical human-reference package to preserve exact source provenance, exact acquired bytes, SHA-256, rights/license basis, privacy/subject-risk screening, provider-blind annotation, and later adjudication.

FR-DATA-07A implements only the mechanical intake/binding portion needed before human annotation.

At the time this slice was authored, source/license candidate pages had been screened, but this execution environment could not reliably retrieve the binary originals from the external media host. Therefore:

```text
real source bytes acquired by this PR = false
real source SHA-256 established by this PR = false
real empirical dataset established by this PR = false
```

The test images are synthetic contract fixtures only.

## 4. Mechanical byte identity

For a supplied asset:

```text
actualDigest = SHA-256(provided bytes)
```

The intake is accepted only when:

```text
actualDigest == declaredCanonicalAssetDigest
```

A record produced by the intake function therefore records:

```text
exactByteDigestVerificationPerformedAtIntake = true
imageHeaderInspectionPerformedAtIntake = true
```

This proves only what the intake function checked while the supplied bytes were present. It does not prove that those bytes originated from the declared URL.

Accordingly the frozen record fixes:

```text
sourceAssetUrlCryptographicallyAuthenticatedByThisRecord = false
providedBytesProvenToOriginateFromSourceAssetUrl = false
```

## 5. Frozen-verifier limitation

The raw bytes are not embedded in the frozen record. A later call to `verifyFrozenIndependentFaceSourceAssetRecordFRData07A()` can validate schema, metadata shape, fail-closed fields, and the deterministic metadata digest, but it cannot hash the original bytes again.

Therefore:

```text
intakeVerificationReperformedByFrozenVerifier = false
frozenVerifierReperformsByteVerification = false
frozenMetadataDigestMeansBytesReverified = false
```

This distinction prevents persisted metadata from overstating later verification capability.

## 6. Image header inspection

FR-DATA-07A reuses:

```text
inspectImageByteDimensionsFRData02(bytes)
```

Supported encoded signatures are PNG, JPEG, and WebP.

The parser validates the supported format header and extracts encoded width/height. This is a byte/header structural check. It does not establish full image decodability, semantic content, human-face presence, identity, or suitability for a validation set.

When source-reported dimensions are supplied, width and height must be supplied together and must exactly equal the encoded dimensions recovered from the bytes. If neither is supplied, the record preserves `sourceReportedDimensionState = not_supplied` rather than inventing source metadata.

## 7. Rights and privacy boundary

The intake requires rights evidence metadata because #224 requires per-asset rights/provenance records. Metadata presence is not legal adjudication.

Allowed rights-review states are deliberately limited to:

```text
source_rights_basis_recorded_not_legally_adjudicated
source_rights_restrictions_or_uncertainty_recorded_not_legally_adjudicated
```

The frozen record always states:

```text
rightsLegallyAdjudicated = false
privacySubjectRiskIndependentlyAdjudicated = false
```

A public-domain/CC0/license statement may be recorded as evidence metadata, but FR-DATA-07A does not decide whether that basis is legally sufficient in a jurisdiction or whether separate privacy/personality restrictions are satisfied.

## 8. Human-label blindness

Source pages, filenames, descriptions, captions, and collection metadata can leak the expected human-face-count answer. They are provenance evidence, not annotation evidence.

FR-DATA-07A therefore fixes:

```text
sourceMetadataThatCouldHintLabelMayBeIncludedInHumanAnnotationPacket = false
filenameOrSourceDescriptionMayDefineHumanFaceCountLabel = false
humanFaceCountLabelEstablished = false
partitionAssignmentAuthorized = false
```

Later human annotation must use a separately prepared blinded packet under FR-DATA-07/#225.

## 9. FR-DATA-07 binding

`bindIndependentFaceDatasetSourceAssetsFRData07A()` requires exact one-record-per-capture coverage and exact equality for:

```text
captureRef
canonicalAssetDigest
sourceProvenanceRef
sourceInstanceRef
```

Duplicate capture refs, acquisition refs, or source-instance refs in the intake record set are rejected.

The resulting binding report asserts only persisted mechanical coordinates and explicitly records that byte verification is not re-run:

```text
captureCoverageComplete = true
canonicalAssetDigestBindingsExact = true
sourceProvenanceBindingsExact = true
sourceInstanceBindingsExact = true
sourceAssetByteVerificationRecordedAtIntake = true
sourceAssetByteVerificationReperformedByBinding = false
```

It still fixes all of the following to false:

```text
sourceTransportAuthenticated
rightsLegallyAdjudicated
privacySubjectRiskIndependentlyAdjudicated
humanFaceCountLabelsEstablishedBySourceMetadata
empiricalAdmissionAuthorized
providerScoringAuthorized
productionGeometryAuthorized
```

## 10. Frozen metadata identity and claim-smuggling guard

The frozen record carries a deterministic SHA-256 `recordDigest` over its canonicalized metadata. Object keys are sorted recursively while array order is preserved.

This detects mutation of the frozen provenance record itself. It is not a substitute for re-reading the raw source asset.

Both intake objects and frozen records reject undeclared top-level fields. This blocks runtime callers from attaching fields such as:

```text
trusted = true
empiricalAdmissionAuthorized = true
rightsLegallyAdjudicated = true
humanFaceCountLabel = ...
```

and treating them as supported authority claims, even if a caller recomputes a metadata digest.

## 11. Unresolved authority

FR-DATA-07A deliberately leaves these unset:

```text
minimumAssetsForEmpiricalAdmission = null
acceptedRightsBasis = null
privacyRiskAcceptanceCriterion = null
```

It does not change FR-DATA-07's null empirical thresholds or minimum counts.

## 12. Synthetic fixtures

The unit tests construct minimal synthetic PNG header bytes solely to exercise exact SHA-256 matching, supported image-header parsing, source-reported dimension matching, source/dataset binding, deterministic metadata identity, claim-smuggling rejection, tamper rejection, and fail-closed authority behavior.

Synthetic bytes do not establish a real source asset, license, privacy clearance, human annotation, empirical dataset, or provider validity.

## 13. Next admissible work

The immediate evidence task remains issue #224:

```text
retrieve exact original bytes from an independently auditable source
→ retain them in controlled storage
→ compute SHA-256 locally
→ run FR-DATA-07A intake
→ bind the frozen intake record to an FR-DATA-07 capture
```

Only after real source assets are frozen may provider-blind human annotation under FR-DATA-07/#225 proceed. Human labels must not be synthesized from source metadata, model output, or maintainer guesses.
