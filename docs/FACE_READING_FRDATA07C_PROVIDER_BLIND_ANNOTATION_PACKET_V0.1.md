# FACE_READING_FRDATA07C_PROVIDER_BLIND_ANNOTATION_PACKET_V0.1

## 1. Purpose

FR-DATA-07C implements the mechanical step explicitly required by issue #225 between real FR-DATA-07A/07B source-byte evidence and real FR-DATA-07 human annotation:

```text
verified canonical source bytes
→ exact FR-DATA-07A/07B binding
→ exact bytes re-hashed for packet preparation
→ opaque packet-local item reference
→ source/provider/partition-hint-free annotator wrapper
→ real human annotation later
```

FR-DATA-07C does **not** create a human annotation, choose a face-count label, assign calibration/holdout, or authorize provider scoring.

## 2. Upstream evidence required

Every packet item must bind to all three existing records:

- a verified `fr-data07a-independent-face-source-asset-record-v1`;
- a verified `fr-data07b-independent-face-source-asset-storage-receipt-v1`; and
- a verified `fr-data07b-independent-face-source-asset-storage-retrieval-verification-v1`.

The exact canonical bytes supplied for packet preparation are re-hashed and their byte length is rechecked. The digest and length must exactly match FR-DATA-07A and FR-DATA-07B before the item can be frozen.

The packet cannot crop, resize, recompress, normalize, redact, or otherwise transform those bytes. FR-DATA-07 requires the human annotator to observe the exact canonical asset.

## 3. Opaque annotator-facing identity

The source `captureRef` is not exposed to the annotator-facing packet. FR-DATA-07C derives a deterministic packet-local item reference:

```text
itemRef = "item-" + SHA-256(packetRef + NUL + canonicalAssetDigest)
```

The full hash is retained rather than truncating it, so the contract does not invent a collision tolerance.

The public asset path is derived only from that opaque item reference and the already-verified media type.

## 4. Annotator-facing allowlist

The annotator-facing JSON manifest contains only:

```text
schemaVersion
packetRef
taskConstruct
labelVocabulary
instructions
items[]:
  itemRef
  assetPath
  mediaType
```

It deliberately excludes:

- source page title or description;
- original/source filename;
- source URL or source-instance reference;
- provenance references;
- rights/license metadata;
- privacy-screen notes;
- acquisition/storage/retrieval coordinates;
- source `captureRef`;
- canonical/source-record/storage digests;
- calibration/holdout partition;
- provider identity, run metadata, output, candidate count, landmarks, result shape, performance, or thresholds;
- suggested/expected labels; and
- another annotator's response.

The allowed label vocabulary is exactly the existing FR-DATA-07 vocabulary:

```text
zero_human_faces
one_human_face
multiple_human_faces
indeterminate
```

No assistant-generated or source-derived selected label is present.

## 5. Internal binding versus annotator-facing packet

FR-DATA-07C freezes two logically distinct surfaces.

### Internal binding

The controlled evidence binding preserves:

- source `captureRef`;
- FR-DATA-07A record digest;
- FR-DATA-07B receipt digest;
- FR-DATA-07B retrieval-verification digest;
- canonical asset digest and byte length;
- exact opaque item mapping; and
- deterministic packet/manifest digests.

This internal binding exists for audit and re-verification. It is **not** the payload to hand to annotators.

### Annotator-facing packet

The controlled delivery payload contains only:

- `manifest.json`;
- `INSTRUCTIONS.md`; and
- the exact canonical image bytes under opaque packet-local filenames.

The governed Batch-A generator rejects any unexpected file in this public packet directory.

## 6. Exact-byte versus embedded-metadata boundary

The contract may not strip EXIF/XMP/IPTC or other embedded image metadata by changing the canonical bytes, because doing so would create a different asset digest from the FR-DATA-07A/07B evidence.

Accordingly:

```text
embeddedAssetMetadataSanitizationPerformed = false
deliverySurfaceMustNotExposeEmbeddedAssetMetadata = true
```

This is an explicit operational boundary. The blinded delivery surface must render the canonical image without presenting embedded metadata to the annotator.

FR-DATA-07C does **not** claim that opaque filenames prove the participant was actually blind, or that wrapper metadata exclusion proves embedded metadata is absent. Those claims remain false until independently evidenced by the later human process.

## 7. Deterministic packet identity

Object keys are recursively sorted for SHA-256 metadata hashing while array order is preserved. Item bindings are canonicalized by opaque `itemRef` before packet freezing, so caller input order does not change the packet digest.

The frozen packet binds:

```text
sourceEvidenceManifestDigest
itemBindings
annotatorManifest
annotatorManifestDigest
itemCount
fail-closed authority flags
```

A packet digest is integrity evidence only. It is not a human ground-truth, reviewer, partition, empirical, provider, or production authority claim.

## 8. No invented empirical or staffing rule

FR-DATA-07C deliberately keeps these unresolved:

```text
minimumPacketItemsForEmpiricalAdmission = null
minimumIndependentAnnotatorsPerCapture = null
partitionAssignmentRule = null
humanAnnotationAcceptanceCriterion = null
empiricalAdmissionCriterion = null
```

The packet function requires at least one item only as a structural condition for constructing a packet. That is not an empirical minimum or a sufficiency claim.

## 9. Batch-A governed preparation lane

For issue #224/#225, the accompanying script reads the already-frozen Batch-A source evidence from:

```text
research-evidence/face-reading/frdata224/batch-a
```

Before generating a packet, the workflow re-runs the existing FR-DATA-07B `verify-existing` acquisition/storage verification. The packet generator then:

1. validates that no source asset already contains a human label, partition authority, provider output, or empirical promotion;
2. reads each exact canonical asset;
3. re-hashes and re-binds it through FR-DATA-07C;
4. copies the bytes unchanged to an opaque packet-local path;
5. writes the minimal annotator-facing manifest/instructions;
6. writes a separate internal binding record;
7. verifies byte-for-byte identity between packet and source evidence;
8. scans the public wrapper for known source/storage/digest/partition/provider hint leakage; and
9. pushes the result to a separate evidence review branch rather than directly to `main`.

## 10. Fail-closed authority

A valid packet fixes all of the following as false:

```text
annotationResponsesIncluded
annotatorIdentityBindingIncluded
annotationSessionBindingIncluded
humanAnnotationEstablished
annotationLedgerFrozen
partitionAssignmentAuthorized
empiricalAdmissionAuthorized
providerScoringAuthorized
productionGeometryAuthorized
```

It also does not establish:

- actual participant blindness;
- participant identity/authenticity;
- number or independence of annotators;
- privacy/personality-rights adjudication;
- legal rights adjudication;
- calibration/holdout assignment;
- face-count ground-truth authority;
- provider construct validity or metrics;
- FR35 endpoint authority;
- `地閣 == Menton`; or
- production 三停 / F1 / F6 geometry.

## 11. Next gate

After the real Batch-A packet is frozen, code-only work cannot truthfully complete the next evidence step. Issue #225 then requires real independent human participant evidence:

```text
controlled blinded delivery
→ real annotatorRef/session binding
→ real categorical response(s)
→ immutable FR-DATA-07 annotation ledger freeze
```

No assistant-generated label, maintainer guess, source-description-derived label, or synthetic fixture may substitute for that evidence.
