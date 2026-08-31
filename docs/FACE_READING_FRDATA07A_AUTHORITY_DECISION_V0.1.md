# FACE_READING_FRDATA07A_AUTHORITY_DECISION_V0.1

## Decision

**ADMIT FR-DATA-07A as a research-only mechanical source-asset intake/binding contract.**

Do not treat FR-DATA-07A as empirical admission, source authentication, legal rights adjudication, privacy clearance, human ground truth, provider validation, or production geometry authority.

## Problem closed

FR-DATA-07 captures currently carry:

```text
sourceProvenanceRef
sourceInstanceRef
canonicalAssetDigest
```

but FR-DATA-07 validation only requires structurally valid non-empty source refs and canonical SHA-256 syntax. That leaves a mechanical evidence gap between issue #224's exact-byte acquisition requirement and the FR-DATA-07 capture record.

FR-DATA-07A closes that gap by requiring actual supplied image bytes at intake, recomputing SHA-256, inspecting the supported encoded image header, recording provenance/rights/privacy-screen metadata, and requiring exact binding back to the FR-DATA-07 capture coordinates.

## Authority state

```text
source_asset_byte_and_provenance_binding_contract_defined_no_real_asset_admission
```

A record produced by the intake function means only:

```text
provided bytes matched the declared SHA-256 at intake
AND
supported image header/dimensions were mechanically inspected at intake
AND
provenance metadata was frozen next to those recorded intake results
```

It does not prove the bytes were downloaded from the declared source URL. Because raw bytes are not retained inside the frozen record, later frozen-record verification does not re-run the byte hash or image-header inspection.

## Required fail-closed statements

All remain false:

```text
byteDigestMatchMeansSourceTransportAuthenticated
sourcePagePresenceMeansAssetOriginAuthenticated
frozenMetadataDigestMeansBytesReverified
rightsBasisTextMeansRightsLegallyAdjudicated
rightsEvidencePresenceMeansRightsLegallyAdjudicated
privacyRiskNotesMeanPrivacyClearance
sourceFilenameMeansHumanFaceCountLabel
sourceDescriptionMeansHumanFaceCountLabel
sourceMetadataMayAssignCalibrationOrHoldout
sourceMetadataMayDefineProviderOutcome
exactByteBindingMeansEmpiricalAdmissionAuthorized
exactByteBindingMeansProviderScoringAuthorized
captureQualityAuthorityValidated
anatomicalLandmarkAuthorityValidated
traditionalSemanticAuthorityValidated
productionGeometryAuthorized
```

The persisted-record chronology is explicit:

```text
exactByteDigestVerificationPerformedAtIntake = true
imageHeaderInspectionPerformedAtIntake = true
intakeVerificationReperformedByFrozenVerifier = false
sourceAssetByteVerificationReperformedByBinding = false
```

## Explicitly unresolved

```text
minimumAssetsForEmpiricalAdmission = null
acceptedRightsBasis = null
privacyRiskAcceptanceCriterion = null
```

No values are inferred from the currently screened Commons/NASA/public-domain candidate pool.

## Runtime claim-smuggling decision

Both intake inputs and persisted frozen records reject undeclared top-level fields. A caller cannot attach a `trusted`, `empiricalAdmissionAuthorized`, `rightsLegallyAdjudicated`, or similar field and have it accepted merely by recomputing the metadata digest.

## Real-evidence status at this decision

The repository has source/license-screened candidates recorded in issue #224, but the current execution environment has not successfully retrieved those external binary originals into controlled storage.

Therefore this decision does not claim:

```text
real source asset acquired
real canonical SHA-256 established
real human annotation completed
real adjudication completed
real empirical package frozen
```

Tests use synthetic bytes only.

## Next gate

A real FR-DATA-07A record becomes admissible input only when maintainers possess the exact original bytes and can recompute their SHA-256 locally. After that, the record may be bound to the corresponding FR-DATA-07 capture.

That still does not authorize provider scoring until the independent provider-blind annotation freeze requirements of FR-DATA-07 are satisfied.
