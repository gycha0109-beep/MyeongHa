# Face Reading FR-20 — Laterality Consumption Policy v0.1

> Project: MyeongHa
> Scope: safe semantic use of neutral observations when source-pixel mirroring is unresolved
> Authority state: research-only
> Date: 2026-08-27

## 1. Purpose

FR-19 established:

```text
EXIF transform = normalized
source-pixel anatomical mirror state = unresolved
```

A naive response would disable every eye/brow observation until direct-camera capture exists. That would over-block useful geometry.

The opposite naive response would consume `left_*` / `right_*` provider slots as anatomical side, which is not authorized.

FR-20 introduces a middle layer:

```text
extract geometry freely within the neutral observation contract
↓
classify how laterality-sensitive that geometry is
↓
allow only semantic operations invariant to the unresolved mirror transform
```

## 2. Three semantic requirements

### `side_invariant`

A single observation whose meaning does not depend on left/right swap.

Current FR-14 examples:

```text
neutral.face.brow_midline
neutral.face.nose_region
```

These remain consumable even when source pixels may have been mirrored.

### `pair_swap_invariant`

A two-sided operation is allowed only if swapping pair members leaves the semantic result unchanged.

Examples of operation shapes that may qualify after review:

```text
abs(metric(A) - metric(B))
min/max as an unordered set
symmetric aggregate
```

Examples that do not qualify:

```text
metric(left) - metric(right)
"left is stronger than right"
branching based on which named side is larger
```

FR-20 does not authorize any particular physiognomy meaning. It only governs whether an observation transformation survives unknown mirroring.

### `anatomical_side`

Any meaning requiring trusted anatomical left/right identity.

Current file-upload state:

```text
always blocked
```

## 3. Individual side slots are image-side observations only

Current classifications:

```text
brow_midline   → side_invariant
nose_region    → side_invariant

left_brow      → image_side_only
right_brow     → image_side_only
left_eye       → image_side_only
right_eye      → image_side_only
```

`image_side_only` does not mean the geometry is unusable.

It means:

```text
individual slot label
!= semantic anatomical side
```

The pair can still participate in a governed swap-invariant operation.

## 4. Pair groups

FR-20 defines two neutral pair groups:

```text
pair.neutral.brows
pair.neutral.eyes
```

Each group:

- has exactly two FR-14 member slots;
- permits only `pair_swap_invariant` use under current capture state;
- requires an explicit reviewed operation contract;
- cannot carry anatomical-side meaning.

## 5. Pair operation contract

A pair operation must declare:

```text
operationRef
pairGroupRef
reviewState
swapInvariant = true
formulaSpec
evidenceRefs
```

An arbitrary rule using both sides is not automatically safe.

```text
uses left + right
!=
swap invariant
```

Research-candidate operations remain blocked from semantic consumption until reviewed.

## 6. Why this is not a physiognomy rule

FR-20 is observation/admission governance only.

It does not say:

```text
eye asymmetry means X
brow asymmetry means Y
```

Those meanings still require the normal chain:

```text
source passage
→ methodology
→ metric / operationalization
→ rule
→ claim
```

FR-20 merely answers:

> Does this rule depend on anatomical side in a way that an unresolved mirror transform could reverse?

## 7. Current file-upload policy

```text
currentCaptureState = file_upload_unknown_source_mirror
anatomicalSideConsumptionAllowed = false
```

Allowed:

```text
side-invariant single feature
reviewed pair operation proven invariant under member swap
```

Blocked:

```text
individual left/right semantic interpretation
ordered pair semantics
anatomical-side rules
```

## 8. Negative tests

FR-20 rejects:

- opening anatomical-side consumption;
- classifying a paired image-side slot as an individual semantic side;
- pair definitions that permit anatomical-side meaning;
- non-swap-invariant pair operations;
- pair operation applied to the wrong pair;
- research-only pair operations used as reviewed semantics;
- smuggled anatomical/provider fields.

## 9. Runtime consequence

When later rules are introduced, their observation dependency should be resolved through a laterality requirement before semantic evaluation.

Conceptually:

```text
rule observation inputs
+ capture state
+ laterality requirement
+ optional reviewed pair operation
↓
allowed
or
unavailable for this reading
```

Failure is availability loss, not negative evidence.

```text
side-specific input blocked
!=
feature absent
!=
unfavorable face
```

## 10. Next step

FR-20 provides the governance needed before side-sensitive metrics/rules are added.

Next useful tracks are now independent:

### A. FR-21 Direct Capture Attestation

Define a controlled camera acquisition artifact capable of proving canonical anatomical laterality.

### B. FR-21 Rule/Metric Laterality Binding

Extend future metric/operationalization/rule input contracts so each semantic consumer declares one of:

```text
side_invariant
pair_swap_invariant
anatomical_side
```

No implicit default for production-authorized side-sensitive semantics.

### C. FR-18 publication provenance

Still separately unresolved; FR-20 does not activate the MediaPipe bridge.

## 11. Final invariant

```text
unknown mirror
!=
all geometry unusable

left/right image slot
!=
anatomical side

two-sided input
!=
swap-invariant operation

swap-invariant geometry
!=
physiognomy meaning
```
