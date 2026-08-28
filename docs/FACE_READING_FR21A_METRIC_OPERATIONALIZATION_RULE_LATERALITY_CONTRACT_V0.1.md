# MyeongHa Face Reading FR-21A — Metric / Operationalization / Rule Laterality Contract v0.1

Status: implementation authority candidate
Scope: production-promotion laterality semantics for `FaceMetricDefinition`, `FaceOperationalizationDefinition`, and `FaceRuleDefinition`
Baseline: FR-20 laterality consumption policy

## 1. Problem closed by FR-21A

FR-20 decides whether a concrete neutral-slot consumption is safe under unknown source-pixel mirroring. Before FR-21A, however, a future production metric, operationalization, or rule could omit that semantic requirement entirely and still pass the generic authority validator.

FR-21A closes that schema-level promotion bypass.

Research definitions remain backward compatible: a research definition may omit a laterality contract. A definition promoted to `production_authorized` may not.

## 2. Production contract

Every production metric / operationalization / rule must declare:

```text
laterality.schemaVersion = fr21a-v1
laterality.inputs[]       = every direct definition input exactly once
laterality.outputRequirement
```

Output requirement is one of:

```text
side_invariant
pair_swap_invariant
anatomical_side
```

Direct input sensitivity is deliberately a different type:

```text
side_invariant
image_side_only
pair_swap_invariant
anatomical_side
```

This distinction prevents enum-max/inheritance logic from becoming semantic authority.

## 3. No implicit propagation

FR-21A does not compute an output class by taking the "strongest" input sensitivity.

Instead:

```text
upstream output sensitivity
→ downstream input binding must match
→ downstream definition declares its own output requirement
```

A raw two-sided input is not automatically swap invariant.

## 4. Direct image-side pair transform

A production definition that directly consumes `image_side_only` inputs must:

1. declare exactly two direct pair members,
2. bind them to an FR-20 pair group,
3. reference a registered pair operation,
4. use a `reviewed` operation,
5. use a structurally swap-invariant transform kind,
6. match the operation's exact input set,
7. match the FR-20 pair-group member set,
8. for metrics, match the actual metric formula to the reviewed operation formula.

Supported v1 structural transforms are bounded:

```text
absolute_difference
unordered_mean
unordered_min_max_span
```

The operation does not carry a trusted `swapInvariant: true` boolean. A forged `swapInvariant` field is rejected. Swap invariance follows from the bounded transform shape plus formula equality.

## 5. Anatomical side remains blocked

FR-21A does not create capture laterality authority.

Current state remains:

```text
ordinary file upload source-pixel mirror state = unresolved
FR-20 anatomical-side semantic consumption     = blocked
```

Therefore any `production_authorized` definition with an anatomical-side input or output fails closed.

A future FR-21B controlled-capture authority must not be smuggled into FR-21A through provider labels or arbitrary authority strings. The v1 laterality schema contains no provider/anatomical override field.

## 6. Provider landmark index boundary

A production metric carrying direct `extractorLandmarkRefs` is rejected by the FR-21A promotion gate.

Reason:

```text
provider-specific landmark topology
!= neutral semantic anchor authority
!= anatomical side authority
```

Provider indices may remain research/calibration evidence, but they cannot become a production semantic-side shortcut while provider activation and release-exact provenance remain unresolved.

## 7. Research compatibility

Existing Three Divisions and other research definitions are intentionally unchanged.

```text
research + no laterality field
→ valid

production_authorized + no laterality field
→ invalid
```

This prevents the current research corpus from being rewritten merely to introduce FR-21A.

## 8. Fail-closed cases

FR-21A rejects at least:

- missing production laterality declaration,
- unknown schema version / enum,
- unauthorized extra fields,
- omitted or duplicated direct input bindings,
- image-side slot falsely declared side-invariant,
- pair inputs with no governed operation,
- research-candidate pair operation at production,
- pair group mismatch,
- pair transform input mismatch,
- ordered metric formula disguised as swap-invariant,
- anatomical-side production input/output,
- provider landmark indices used as production semantic authority,
- downstream input sensitivity inconsistent with an upstream production definition.

## 9. Non-goals

FR-21A does not:

- authorize any new Face Reading meaning,
- activate MediaPipe / FaceLab as production observation authority,
- solve release-exact npm provenance,
- solve file-upload anatomical laterality,
- authorize neutral derivation algorithms,
- define a controlled camera contract,
- promote Three Divisions research rules to production.

## 10. Next track

FR-21B remains separate:

```text
controlled direct capture attestation
→ raw / preview / encoded / EXIF / canonical transform provenance
→ deterministic asymmetric target verification
→ final anatomical laterality assertion only when actually established
```
