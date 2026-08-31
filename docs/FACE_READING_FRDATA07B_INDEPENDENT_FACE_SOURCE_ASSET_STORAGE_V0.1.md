# FACE_READING_FRDATA07B_INDEPENDENT_FACE_SOURCE_ASSET_STORAGE_V0.1

## 1. Purpose

FR-DATA-07B closes the next mechanical gap in issue #224 after FR-DATA-07A:

```text
FR-DATA-07A exact-byte/provenance intake
→ controlled research-storage receipt
→ byte retrieval candidate
→ exact SHA-256 + byte-length re-verification
→ frozen storage/retrieval metadata
```

FR-DATA-07A deliberately does not retain raw bytes in its frozen metadata record. Issue #224 separately requires the acquired source bytes to remain in controlled storage so that later evidence packages can reproduce byte identity. FR-DATA-07B defines the research-evidence storage contract for that requirement without changing the production Face Reading raw-image retention policy.

## 2. Scope boundary

FR-DATA-07B is **research evidence storage only**. It does not authorize production runtime image retention.

The storage receipt records an opaque storage coordinate and exact binding to one already-verified FR-DATA-07A record:

```text
acquisitionRef
captureRef
sourceAssetRecordDigest
canonicalAssetDigest
byteLength
storageProviderRef
storageNamespaceRef
storageObjectRef
storageVersionRef (optional)
storedAt
```

The frozen receipt does not embed the source bytes.

## 3. Why a receipt is not enough

A storage coordinate or maintainer attestation is not independently authenticated evidence that bytes really exist in a backend, are immutable, will remain available for a required period, or came from the original source URL.

Therefore a receipt always preserves:

```text
storageProviderIdentityExternallyAuthenticated = false
storageBackendIntegrityIndependentlyAudited = false
storageObjectImmutabilityExternallyVerified = false
retentionDurationExternallyGuaranteed = false
storedBytesRetrievalReverifiedByReceipt = false
```

The required retention attestation has exactly one meaning: the acquisition process declares that the bytes were placed in a controlled research-evidence location. It is not external proof of that declaration.

## 4. Retrieval re-verification

FR-DATA-07B separately accepts bytes supplied as a retrieval candidate and recomputes:

```text
retrievedDigest = SHA-256(retrievedBytes)
retrievedByteLength = retrievedBytes.length
```

Acceptance requires exact equality with the upstream FR-DATA-07A record:

```text
retrievedDigest == canonicalAssetDigest
retrievedByteLength == byteLength
```

The retrieval timestamp must not precede the storage timestamp.

The frozen verification does not embed the retrieved bytes.

## 5. Critical origin limitation

The pure validation function receives a byte sequence from its caller. It cannot prove that the caller actually obtained those bytes from the declared storage object.

Accordingly every frozen retrieval verification fixes:

```text
providedRetrievalBytesProvenToOriginateFromDeclaredStorageObject = false
storageProviderIdentityExternallyAuthenticated = false
storageBackendIntegrityIndependentlyAudited = false
storageObjectImmutabilityExternallyVerified = false
sourceTransportAuthenticated = false
```

A governed acquisition workflow may perform a concrete backend readback, such as reading a content-addressed Git blob, and then pass those bytes to FR-DATA-07B. That process-level evidence is stronger operationally, but the FR-DATA-07B record itself still does not convert a backend locator into external trust authority.

## 6. Relationship to architecture raw-image retention

The general Face Reading architecture keeps normal runtime face images ephemeral. Issue #224 is a research validation evidence package with an explicit requirement to retain exact source bytes.

FR-DATA-07B therefore isolates retention to:

```text
storageScope = research_evidence_only
productionRuntimeImageRetentionAuthorized = false
```

It must not be reused as permission to retain ordinary user captures, production face images, embeddings, or identity material.

## 7. Exact FR-DATA-07A binding

A storage receipt is accepted only when all of these exactly equal the verified FR-DATA-07A record:

```text
acquisitionRef
captureRef
sourceAssetRecordDigest
canonicalAssetDigest
byteLength
```

This prevents a storage receipt for one byte sequence from being attached to another capture or source record.

The dataset-level storage binder additionally requires:

- one receipt per source-asset record;
- one retrieval verification per receipt;
- unique source-record digests and capture refs;
- unique receipt refs and retrieval refs; and
- unique exact storage coordinates.

No empirical minimum asset count is invented.

## 8. Deterministic metadata identity

Storage receipts and retrieval verification records carry deterministic SHA-256 metadata digests. Object keys are recursively sorted before JSON hashing.

The digests detect metadata mutation. They do not authenticate the storage provider, backend, source URL, legal rights, privacy state, or human label.

Both intake and persisted records reject undeclared top-level fields so callers cannot smuggle authority flags into a valid-looking record.

## 9. Unresolved storage governance

The following remain deliberately unset:

```text
storageBackendTrustPolicy = null
minimumRetentionDuration = null
encryptionAtRestRequirement = null
storageImmutabilityRequirement = null
acceptedStorageBackend = null
empiricalAdmissionCriterion = null
```

FR-DATA-07B does not invent a retention duration, approved vendor, encryption policy, or immutability standard merely to make issue #224 appear complete.

## 10. Fail-closed authority

Neither receipt nor successful byte re-hash establishes:

```text
source URL transport authenticity
source URL provenance authenticity
legal rights adjudication
privacy/personality clearance
human face-count ground truth
calibration/holdout assignment
provider scoring validity
empirical admission
production image retention
production geometry
```

The assertion function therefore always blocks empirical admission from FR-DATA-07B alone.

## 11. Synthetic fixtures

Unit tests use tiny synthetic PNG header bytes only to verify storage-coordinate binding, timestamps, retrieval digest matching, metadata tamper detection, duplicate storage-coordinate rejection, unknown-field rejection, and fail-closed authority behavior.

They do not prove any real asset was stored or retrieved.

## 12. #224 governed acquisition lane

The accompanying #224 acquisition workflow is intentionally separate from ordinary runtime processing. It is allowed to run only after merge to `main` and only for the pinned, pre-screened Wikimedia Commons batch encoded in the acquisition script.

The acquisition script must:

1. resolve each pinned Commons file through the MediaWiki API;
2. require the live per-file `LicenseShortName` to match the candidate's pinned permissive license family (`Public domain` or `CC0`) before any asset is admitted;
3. accept only `upload.wikimedia.org` original-media URLs;
4. download the exact original bytes;
5. verify MediaWiki-reported byte length and SHA-1 as transport/source consistency evidence;
6. compute the canonical SHA-256 locally;
7. run FR-DATA-07A against those exact bytes;
8. write the bytes under opaque capture refs, not semantic filenames;
9. store each byte sequence as a content-addressed Git blob;
10. read the bytes back from that Git blob;
11. run FR-DATA-07B retrieval re-verification;
12. freeze provenance/storage metadata without assigning human labels;
13. re-verify exact coverage of every pinned `captureRef` and its source-instance binding; and
14. push the evidence to a separate review branch rather than directly to `main`.

The live Commons metadata check is an acquisition-time consistency gate, not legal adjudication. The acquisition branch is still not empirical ground truth. Provider-blind human annotation and FR-DATA-10 adjudication remain separate later gates.