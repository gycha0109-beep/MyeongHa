# FACE_READING_FRDATA07B_AUTHORITY_DECISION_V0.1

## Decision

Admit **FR-DATA-07B — Independent Face Source Asset Controlled Research Storage** as a research-only evidence preservation contract.

The slice is necessary because FR-DATA-07A verifies source bytes at intake but intentionally does not retain them, while issue #224 requires exact acquired bytes to remain reproducible from controlled storage.

## Authorized claims

FR-DATA-07B may claim only that:

1. a storage receipt is structurally bound to one verified FR-DATA-07A record;
2. opaque storage coordinates and a retention attestation were recorded;
3. supplied retrieval bytes were re-hashed and exactly matched the FR-DATA-07A canonical SHA-256 and byte length; and
4. receipt/retrieval metadata was frozen under deterministic metadata digests.

## Explicitly unauthorized claims

All of the following remain false:

```text
storageReceiptMeansBytesExistInDeclaredBackend
retentionAttestationMeansRetentionExternallyVerified
storageProviderRefMeansProviderIdentityVerified
storageObjectRefMeansObjectImmutable
storageVersionRefMeansObjectImmutable
providedRetrievalBytesProvenToOriginateFromDeclaredStorage
retrievalDigestMatchMeansSourceTransportAuthenticated
retrievalDigestMatchMeansSourceURLProvenanceAuthenticated
storageReceiptMeansRightsLegallyAdjudicated
storageReceiptMeansPrivacyClearance
retrievalVerificationMeansHumanFaceCountLabelEstablished
storageEvidenceMayAssignCalibrationOrHoldout
storageEvidenceMayDefineProviderOutcome
storageEvidenceMeansEmpiricalAdmissionAuthorized
storageEvidenceMeansProviderScoringAuthorized
storageEvidenceMeansProductionImageRetentionAuthorized
storageEvidenceMeansProductionGeometryAuthorized
```

No storage provider trust policy, minimum retention duration, encryption requirement, storage immutability requirement, accepted backend, or empirical admission criterion is defined.

## Raw-byte policy decision

FR-DATA-07B does not place bytes inside frozen metadata records. The exact source assets required by issue #224 are retained separately in a research-evidence storage location.

This exception is scoped to research evidence and does not alter the ordinary Face Reading runtime rule that user face images are ephemeral.

## #224 batch-A acquisition decision

A guarded main-only acquisition workflow may retrieve the already-screened Wikimedia Commons batch and push the resulting bytes/evidence metadata to a separate branch for review.

The workflow must not accept arbitrary URLs and must not generate face-count labels. Source metadata remains excluded from any later blinded annotation packet.

The acquisition result is not admitted directly to empirical authority. A branch containing real bytes must still undergo review, exact-byte re-verification, provider-blind human annotation, and later FR-DATA-10/14/15 gates.
