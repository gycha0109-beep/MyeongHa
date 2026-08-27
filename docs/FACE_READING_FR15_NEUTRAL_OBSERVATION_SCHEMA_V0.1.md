# MyeongHa Face Reading — FR-15 Neutral Observation Schema v0.1

Status: Research contract

## 1. Purpose

FR-15 defines the data boundary between a future production-neutral FaceLab/provider contract and MyeongHa Face Reading.

It does **not** define traditional physiognomy geometry.
It does **not** bind provider landmark indices to 山根, 天倉, 奸門, 淚堂, 地閣, 中正, 離宮, or other traditional anchors.

The authority chain remains:

```text
provider raw output
→ provider adapter
→ FR-15 neutral observation bundle
→ later traditional operationalization
→ later source-governed Face claims
```

FR-15 only owns the middle neutral-observation layer.

## 2. Current provider state

The currently observed Visually/FaceLab state remains blocked for production-neutral use:

```text
providerKey = visually_facelab
providerContractVersion = null
activationState = blocked
```

Therefore a valid FR-15 bundle cannot currently be admitted under the real FaceLab profile.

Tests may use a hypothetical future provider contract only to validate the contract mechanics.
Such fixtures are not evidence that FaceLab is currently production-ready.

## 3. Why not expose raw MediaPipe landmarks

Current Google Face Landmarker documentation describes a face mesh with 478 three-dimensional normalized landmarks, optional blendshape scores, and optional facial transformation matrices.

FR-15 deliberately does not make those raw structures the MyeongHa consumer contract.

Reasons:

1. provider index topology is provider/version specific;
2. raw indices are not traditional physiognomy semantics;
3. blendshapes are dynamic expression outputs and are outside the static Face Reading v1 input allowlist;
4. MyeongHa needs stable consumer semantics even if the underlying provider changes;
5. traditional region mapping still requires separate source and operationalization authority.

External reference checked during FR-15 research:

- Google AI Edge / Face Landmarker overview, last checked 2026-08-27
- Google AI Edge / Face Landmarker Web result schema, last checked 2026-08-27

## 4. Coordinate frame

FR-15 accepts only:

```text
canonical_image_normalized_2d
```

Each point has:

```ts
{x, y}
```

with both values in `[0,1]`.

No `z`, provider landmark index, mesh index, polygon id, or provider-specific connection id is allowed in this contract.

This does not deny that a provider may internally use 3D data.
It means a provider adapter must project the information into the bounded neutral contract before MyeongHa accepts it.

## 5. Geometry classes

FR-15 supports exactly three neutral geometry kinds:

```text
point
curve
region
```

The initial FR-14 slots require:

| Consumer slot | Geometry |
|---|---|
| neutral.face.brow_midline | point |
| neutral.face.left_brow_region | curve |
| neutral.face.right_brow_region | curve |
| neutral.face.left_eye_region | region |
| neutral.face.right_eye_region | region |
| neutral.face.nose_region | region |

These are neutral observation shapes only.

For example:

```text
neutral.face.nose_region
!= 山根
!= 年壽
!= 準頭
!= 審辨官
```

## 6. Explicit unavailable state

Missing observation is not negative evidence.

Every FR-14 neutral anchor must have exactly one FR-15 observation item.
If geometry cannot be observed, the item is explicitly:

```text
availability = unavailable
geometry = absent
quality.visibility = not_visible
quality.confidence = null
quality.reasons = non-empty
```

This allows a bundle to become `section_limited` without manufacturing a negative facial feature.

## 7. Pose and quality

Pose contains finite:

```text
yawDegrees
pitchDegrees
rollDegrees
```

and a provider-neutral quality state:

```text
usable
limited
unusable
```

FR-15 does not invent numeric pose acceptance thresholds.
Those thresholds belong to a reviewed provider/capture quality policy.

An `unusable` pose blocks neutral ingestion.
A `limited` pose may produce a section-limited neutral artifact.

## 8. Provenance

Every bundle pins:

```text
providerKey
providerContractVersion
adapterVersion
providerModelRef
providerRunRef
canonicalAssetDigest
evidenceRefs
```

The canonical asset digest must be:

```text
sha256:<64 lowercase hex>
```

Persistence invariants are explicit:

```text
rawSourcePersisted = false
rawProviderResponsePersisted = false
biometricEmbeddingPersisted = false
```

The schema rejects additional provenance fields.

## 9. Exact-key boundary

FR-15 applies exact-key validation to:

```text
bundle
pose
observation item
quality
geometry
point
provenance
```

This is intentional.

The following cannot be smuggled into the neutral contract:

```text
landmarkIndex
meshIndex
z
faceEmbedding
identityCandidate
rawProviderResponse
```

A future contract expansion requires a version change rather than an undeclared field.

## 10. Capability provenance

Every observation declares which neutral provider capabilities produced it.

The capability must:

1. exist in the FR-14 neutral capability vocabulary;
2. be declared at bundle level;
3. satisfy every capability required by that anchor's FR-14 binding.

This prevents a consumer slot from being populated by an unrelated provider output.

## 11. Issuance

A bundle may be issued only when:

```text
FR-14 binding profile valid
+ exact provider contract version pinned
+ production-neutral compatibility state
+ required capabilities complete
+ FR-15 bundle valid
+ pose not unusable
```

Issued artifacts are detached deep-frozen snapshots.

Mutating the caller's source object after issuance cannot change the issued artifact.

Runtime issuance is also tracked so a caller cannot fabricate an equivalent-looking artifact and pass it as issued authority.

## 12. Authority state

Even a successfully issued FR-15 artifact is only:

```text
authorityState = neutral_observation_only
```

It explicitly prohibits:

```text
traditional_anchor_equivalence
physiognomy_claim_generation
fortune_claim_generation
identity_matching
```

FR-15 therefore cannot by itself generate:

```text
山根이 높다
官祿宮이 강하다
재물운이 좋다
```

Those require later source-governed operationalization and Face Rule authority.

## 13. Readiness states

```text
usable
section_limited
blocked
```

But semantic promotion remains:

```text
blocked_traditional_operationalization_required
```

for all FR-15 artifacts.

## 14. Self-review findings closed in FR-15

### FR15-R1 — Missing != negative

Closed by mandatory explicit `unavailable` items.

### FR15-R2 — Provider topology leakage

Closed by exact-key validation through point/curve/region structures.

### FR15-R3 — Identity/embedding leakage

Closed by exact bundle/provenance key sets and `biometricEmbeddingPersisted=false`.

### FR15-R4 — Post-issuance mutation

Closed by detached deep-frozen issued snapshots.

### FR15-R5 — Fake issued artifact

Closed by runtime issuance registry.

### FR15-R6 — Dynamic expression leakage

Blendshape/expression/color appearance is not part of FR-15 static neutral schema.

## 15. Intentionally unresolved

FR-15 does not solve:

- real FaceLab production-neutral contract availability;
- MediaPipe/provider-specific adapter implementation;
- exact neutral eye/brow/nose extraction topology;
- provider model calibration;
- traditional 山根/天倉/奸門/淚堂 geometry;
- Twelve Palace semantic classification;
- Five Officers/Palace fortune interpretation.

## 16. Next step

FR-16 should define a provider adapter evidence contract:

```text
provider raw topology/version
→ adapter mapping definition
→ neutral slot geometry
→ deterministic adapter test vectors
→ provider-model/adapter version provenance
```

Only after that should a real FaceLab contract be considered for `candidate` activation.
