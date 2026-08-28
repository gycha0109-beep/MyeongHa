# MyeongHa Face Reading FR-24 — Research Eye-Pair Runtime Bridge v0.1

Status: executable research projection / production promotion blocked
Scope: pinned MediaPipe eye topology witness + neutralized provider x/y points → research-only eye-pair region artifact
Baseline: FR-16 provider adapter evidence, FR-20 laterality policy

## 1. Decision

FR-24 is the first executable bridge that consumes the existing FR-16 eye topology evidence instead of adding another authority-only registry.

```text
neutralized provider x/y points
+ pinned FR-16 eye topology witness edges
→ FR-16 deterministic closed-cycle projection
→ FR-24 research eye-pair artifact
```

It deliberately does **not** issue an FR-15 production neutral observation.

## 2. Pinned topology witness

FR-24 embeds the exact eye connection sets observed at the FR-16 upstream source witness:

```text
google-ai-edge/mediapipe
commit 30590fe8d3fdc57e63a0e9c5b2c0ececffb37301
mediapipe/tasks/web/vision/face_landmarker/face_landmarks_connections.ts
```

Both eye topologies contain 16 edges and are validated through the existing FR-16 closed-cycle implementation.

Callers do not supply arbitrary edge graphs. They supply only x/y points for the provider vertices referenced by the pinned witness.

This closes the bypass where an arbitrary 16-cycle could otherwise be labeled as a MediaPipe eye topology.

## 3. Runtime artifact shape

FR-24 emits:

```text
schemaVersion = fr24-eye-pair-research-v1
authorityState = research_projection_only
coordinateFrame = canonical_image_normalized_2d
regions = [provider-labeled eye region, provider-labeled eye region]
sideAuthority = provider_label_only
pairConsumptionState = unordered_provider_labeled_pair_only
consumerSlotAssignment = null
anatomicalLateralityResolved = false
traditionalSemanticAuthority = false
productionNeutralObservationIssued = false
```

The two provider topology labels are retained as provenance only.

## 4. LEFT / RIGHT is not side authority

The provider symbols are named:

```text
FACE_LANDMARKS_LEFT_EYE
FACE_LANDMARKS_RIGHT_EYE
```

FR-24 does not interpret those labels as:

- image-left/image-right,
- anatomical left/right,
- FR-15 left/right consumer-slot assignment,
- traditional left/right physiognomy meaning.

The artifact serialization order is fixed only for deterministic bytes. Array index 0/1 is not a side claim.

## 5. Why FR-15 issuance remains blocked

FR-16 currently records the MediaPipe topology as:

```text
sourceRefClass = upstream_master_structure_witness
releaseExactForInstalledPackage = false
```

The installed consumer dependency is still:

```text
@mediapipe/tasks-vision@0.10.35
```

FR-24 therefore does not claim that the upstream witness is release-exact for that package artifact.

In addition:

```text
FR-14 providerContractVersion = null
FR-14 activationState = blocked
FR-20 anatomicalSideConsumptionAllowed = false
```

These states are validated at runtime so a future authority change cannot silently alter FR-24 v0.1 semantics.

## 6. Input hardening

For each eye topology FR-24 requires exactly the provider vertices referenced by the pinned witness.

It rejects:

- missing eye topology input,
- additional topology symbols,
- unused provider vertices,
- malformed or out-of-range x/y coordinates,
- provider-specific point fields such as `z`,
- malformed canonical asset digests,
- empty provider run references.

The existing FR-16 graph traversal and projection code remains the single implementation of closed-cycle ordering.

## 7. Output hardening

Artifact validation rejects attempts to add or promote:

```text
imageSide
anatomicalSide
consumerSlot
consumerSlotAssignment != null
anatomicalLateralityResolved = true
traditionalSemanticAuthority = true
productionNeutralObservationIssued = true
releaseExactForInstalledPackage = true
```

Raw source images, raw provider responses, and biometric embeddings remain non-persistent in the artifact provenance contract.

## 8. Current readiness

FR-24 reports:

```text
researchProjectionReady = true
productionNeutralObservationReady = false
consumerSlotAssignmentReady = false
anatomicalLateralityReady = false
traditionalSemanticAuthorityGranted = false
```

This is intentional. FR-24 proves that the eye geometry path can now execute under the current evidence boundary; it does not bypass the provider, release-equivalence, laterality, or traditional-semantic gates.

## 9. What this enables next

The next functional slice can use FR-24 as the executable eye geometry substrate for research fixtures and pair-symmetric geometry experiments.

Production promotion still requires a separate reviewed path that closes the actual provider implementation and release/runtime evidence gap. Provider LEFT/RIGHT labels must never be used as a shortcut for anatomical laterality.
