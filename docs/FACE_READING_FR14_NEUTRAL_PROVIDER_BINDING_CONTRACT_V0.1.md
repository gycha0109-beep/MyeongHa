# MyeongHa Face Reading — FR-14 Neutral Provider Binding Contract v0.1

Status: **BLOCKED / RESEARCH CONTRACT**

## 1. Purpose

FR-13 created a provider-neutral semantic anchor registry. FR-14 defines the next boundary: which semantic anchors may be connected to a future production-neutral FaceLab observation contract.

The rule is intentionally narrow:

```text
neutral observation anchors
→ provider binding candidate

traditional named/aggregate/configuration anchors
→ blocked
```

FR-14 does not bind 山根, 天倉, 奸門, 淚堂, 地閣, 中正, 離宮 or other traditional regions to MediaPipe/FaceMesh indices.

## 2. Consumer slots

MyeongHa defines six neutral consumer slots:

```text
neutral.face.brow_midline
neutral.face.nose_region
neutral.face.left_brow_region
neutral.face.right_brow_region
neutral.face.left_eye_region
neutral.face.right_eye_region
```

These are MyeongHa-side requirements, not claims that a current FaceLab API already exports such fields.

## 3. Required provider capabilities

FR-14 requires a future provider contract to expose enough neutral information for:

```text
neutral_pose_quality
neutral_brow_regions
neutral_brow_midline_derivation
neutral_eye_regions
neutral_nose_region
```

All outputs remain `source_neutral_geometry`.

No provider output may directly be a physiognomy claim.

## 4. Current Visually state

Current profile:

```text
providerKey = visually_facelab
providerContractVersion = null
activationState = blocked
```

This is deliberate.

The repository evidence currently available for `@bejewely/face-contracts` is still evaluation/synthetic-oriented rather than a stable production-neutral FaceLab observation API.

Therefore even if all theoretical capability names are supplied to the readiness checker, the real default profile remains blocked.

## 5. Readiness

`assessNeutralProviderBindingReadinessFR14()` requires all of the following:

```text
profile.activationState == candidate
providerContractVersion != null
FaceLab compatibility == production_neutral_contract_available
all required neutral capabilities are available
```

Only then does:

```text
ready = true
```

This is still provider binding readiness, not physiognomy production authorization.

## 6. Traditional anchor gate

Every binding resolves its `anchorRef` through the pinned FR-13 semantic anchor registry.

The anchor must satisfy:

```text
authorityClass == neutral_observation
providerBindingStatus == provider_contract_required
```

Therefore a forged binding such as:

```text
anchorRef = shangen
```

fails closed.

## 7. No raw provider topology in this layer

A binding object may contain only:

```text
anchorRef
consumerSlot
requiredCapabilities
outputClass
```

Fields such as:

```text
providerLandmarkIndices
mediapipeIndex
polygon
coordinateMap
```

are outside FR-14 authority and are rejected when smuggled into a binding object.

If a future adapter needs provider-specific topology, that topology must live in a provider adapter package/version, downstream of this consumer contract and upstream of neutral observations. It must not mutate the traditional semantic anchor registry.

## 8. Why this layer exists

Wrong architecture:

```text
MediaPipe landmark #N
→ 山根
→ 疾厄宮
→ interpretation
```

FR-14 architecture:

```text
provider-specific geometry
→ production-neutral provider contract
→ neutral MyeongHa consumer slots
→ provider-neutral observations

traditional anchor authority
→ separate operationalization

only after both sides are validated
→ bounded mapping candidate
```

This prevents model/index upgrades from silently changing traditional semantic meaning.

## 9. Tests

FR-14 tests require:

1. current profile validates structurally,
2. current real FaceLab compatibility remains blocked,
3. a hypothetical versioned production-neutral contract can become ready only with every capability,
4. one missing capability blocks readiness,
5. only neutral anchors may be bound,
6. 山根 and other traditional anchors are rejected,
7. provider-specific landmark/index fields are rejected,
8. consumer slots are unique,
9. candidate state without provider contract version is rejected.

## 10. Still blocked

FR-14 does not authorize:

- current FaceLab production integration,
- MediaPipe index mappings,
- exact eye/brow/nose polygons,
- traditional anchor geometry,
- Twelve Palace classification,
- physiognomy claims from raw provider output,
- FaceLab archetype/style output as Face Reading evidence.

## 11. Next

There are two useful continuations after FR-14:

### FR-15A — Neutral Observation Region Schema
Define the actual provider-neutral geometry payload for regions/curves/points and its provenance/quality fields.

### FR-15B — Source expansion
Continue direct source verification and 五嶽/六府 authority research.

The recommended order is to do both in parallel, but production Face Reading must remain blocked until source authority and observation operationalization meet at an explicitly reviewed mapping layer.
