# FACE READING FR-35 — Three Divisions Neutral Surface Extension v0.1

## Status

**Neutral surface contract defined / provider binding blocked**

FR-35 closes the exact contract gap identified by FR-34: the current FR-14/FR-15 neutral observation surface has no hairline, philtrum, or inferior-chin geometry that a future Three Divisions operationalization could consume.

FR-35 defines those surfaces without modifying the existing FR-15 base observation contract and without granting any traditional-semantic or provider-landmark authority.

## New provider-independent neutral surfaces

| Neutral slot | Geometry | Purpose |
| --- | --- | --- |
| `neutral.face.hairline_boundary` | curve | neutral visible hairline boundary surface |
| `neutral.face.philtrum_region` | region | neutral philtrum surface |
| `neutral.face.chin_inferior_contour` | curve | neutral inferior chin contour |

All three remain `providerBindingState=no_verified_binding`.

No provider landmark indices are stored or authorized.

## FR-34 dependency bridges

The new surfaces are connected to FR-34 requirements only as **candidate dependencies**:

- `hairline` → `neutral.face.hairline_boundary`
- `renzhong` → `neutral.face.philtrum_region`
- `dige` → `neutral.face.chin_inferior_contour`

These bridges do **not** mean:

- 髮際 equals a specific point on the hairline curve,
- 人中 equals a specific point in the philtrum region,
- 地閣 equals a specific point on the inferior chin contour.

The vertical-reference derivations required by FR-34 are explicitly still `not_defined`.

## Why FR-15 is not modified here

FR-15 is a closed neutral observation contract currently consumed by FR-14/FR-17/FR-22. Widening it in-place would implicitly change all existing provider conformance and observation validation assumptions.

FR-35 therefore uses `extensionMode=separate_contract_extension` and pins the existing base contract:

`myeongha-neutral-observation-v1`

A later integration can version the base observation contract deliberately after provider bindings and migration behavior are reviewed.

## Authority boundary

FR-35 keeps all of the following false:

- mutate FR-15 base contract as a shortcut
- provider-specific landmark index authority
- direct traditional-anchor binding
- traditional semantic output from the neutral surface layer
- claim that a vertical reference derivation already exists
- FR-33 source variant selection
- production metric authority
- production F1 authority
- production F6 authority

## Readiness after FR-35

Ready:

- provider-independent surface names and geometry classes
- exact coverage of the three missing FR-34 neutral surfaces
- explicit quality prerequisites
- deterministic contract validation

Still blocked:

1. no verified provider binding for any new surface
2. no reviewed extraction algorithm for hairline boundary / philtrum region / inferior chin contour
3. no reviewed vertical-reference derivation from those surfaces
4. no traditional↔neutral equivalence authority
5. FR-33 boundary variant selection unresolved
6. FR-5 `三停平等` calibration unresolved
7. F6 period-direction conflict unresolved

## Next slice

FR-36 should define provider-independent **vertical-reference derivation contracts** for all seven FR-34 requirements:

- derive a candidate hairline vertical reference from `hairline_boundary`
- derive a candidate brow vertical reference from the neutral brow pair
- derive candidate interbrow / nasal-root / nose-tip references from existing neutral brow/nose surfaces
- derive candidate philtrum and inferior-chin references from the new FR-35 surfaces

Those derivations must remain traditional-semantic neutral and must not use hard-coded provider landmark indices as authority.
