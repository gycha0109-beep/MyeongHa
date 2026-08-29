# FACE READING FR-36 — Three Divisions Vertical-Reference Derivation Contracts v0.1

## Status

**Derivation contracts defined / algorithms unreviewed**

FR-36 defines the exact neutral derivation interfaces required to turn the FR-14 and FR-35 neutral surfaces into the seven `vertical_reference_coordinate` inputs required by FR-34.

It intentionally does not define extraction formulas. A deterministic formula without evidence would become hidden semantic authority, so every algorithm/formula field remains `null` until separately reviewed.

## Seven derivation contracts

| FR-34 traditional anchor | Neutral input surface(s) | Current blocker |
| --- | --- | --- |
| `hairline` | `neutral.face.hairline_boundary` | FR-35 surface has no verified binding; algorithm absent |
| `brow` | left/right brow neutral regions | FR-17 brow derivations non-executable; algorithm absent |
| `yintang` | `neutral.face.brow_midline` | FR-17 brow-midline derivation blocked; algorithm absent |
| `shangen` | `neutral.face.nose_region` | FR-17 nose-region derivation unresolved; algorithm absent |
| `zhuntou` | `neutral.face.nose_region` | FR-17 nose-region derivation unresolved; algorithm absent |
| `renzhong` | `neutral.face.philtrum_region` | FR-35 surface has no verified binding; algorithm absent |
| `dige` | `neutral.face.chin_inferior_contour` | FR-35 surface has no verified binding; algorithm absent |

Every output is specified only as:

- class: `normalized_vertical_coordinate`
- coordinate frame: `canonical_image_normalized_2d`
- axis: `y`

This says what downstream metrics need, not how to calculate it.

## Why no formulas are committed

Examples such as `min_y(hairline_boundary)`, curve centroid, bounding-box midpoint, extrema, or fixed landmark selection can materially change the measured Three Divisions proportions. None is source-authorized merely because it is easy to implement.

Therefore FR-36 requires:

- `algorithmRef = null`
- `formulaSpec = null`
- `providerLandmarkRefs = []`
- `calibrationRefs = []`
- `productionUseAllowed = false`

until algorithm/evidence review is completed.

## Existing upstream blockers

FR-17 currently leaves these dependencies non-executable:

- `derivation.neutral.left_brow_curve.pending`
- `derivation.neutral.right_brow_curve.pending`
- `derivation.neutral.brow_midline.pending`
- `derivation.neutral.nose_region.pending`

FR-35 currently leaves these extension surfaces without verified provider binding:

- `neutral.face.hairline_boundary`
- `neutral.face.philtrum_region`
- `neutral.face.chin_inferior_contour`

## Semantic boundary

A neutral vertical-coordinate derivation, once reviewed, still does not by itself prove:

- `interbrow_reference = 印堂`
- `nasal_root_reference = 山根`
- `nose_tip_reference = 準頭`
- `philtrum_midline_reference = 人中`
- `chin_inferior_midline_reference = 地閣`

Those equivalences remain a separate methodology operationalization decision.

FR-36 also does not choose between FR-33 Variant A and Variant B.

## Authority boundary

All remain false:

- invent algorithm without evidence
- provider-specific landmark index authority
- traditional↔neutral equivalence
- source variant selection
- cross-method anchor normalization
- production Three Divisions metric
- production F1 claim
- production F6 interpretation

## Next slice

FR-37 should investigate **neutral algorithm candidates and evidence requirements**, not production fortune rules. The useful sequence is:

1. establish a reviewable algorithm/evidence contract for each neutral reference;
2. close or isolate FR-17 brow/nose dependencies;
3. establish provider binding evidence for FR-35 surfaces;
4. only then create measured Three Divisions lengths;
5. keep `三停平等` tolerance blocked until FR-5 calibration supplies evidence.
