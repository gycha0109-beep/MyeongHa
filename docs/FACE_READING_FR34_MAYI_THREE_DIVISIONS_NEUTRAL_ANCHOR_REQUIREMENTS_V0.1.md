# FACE READING FR-34 — Mayi Three Divisions Neutral Anchor Requirements v0.1

## Status

**Provider-independent requirements defined / neutral operationalization blocked**

FR-34 continues directly from FR-33. It does not choose between the two scan-checked `《麻衣相法》` Three Divisions boundary variants. Instead it defines the exact neutral observation requirements that any future Mayi Three Divisions metric implementation must satisfy before traditional anchors may be operationalized.

## Upstream authority

- FR-33 authority: `authority.face.mayi_three_divisions_boundary_variants.fr33@0.1.0`
- FR-14 binding profile: current neutral FaceLab consumer surface only
- FR-17 derivation registry: current neutral derivation readiness only
- coordinate frame: `canonical_image_normalized_2d`

FR-14 and FR-17 are dependencies, not traditional-semantic authority.

## Required traditional-anchor observation surfaces

| Traditional source anchor | Provider-independent neutral requirement | Existing neutral dependency | Current state |
| --- | --- | --- | --- |
| 髮際 / `hairline` | `neutral.requirement.face.hairline_mid_sagittal_reference` | none | no existing neutral surface |
| 眉 / `brow` | `neutral.requirement.face.brow_vertical_reference` | `left_brow`, `right_brow` | blocked on reviewed brow derivation |
| 印堂 / `yintang` | `neutral.requirement.face.interbrow_reference` | `brow_midline` | traditional↔neutral equivalence not authorized |
| 山根 / `shangen` | `neutral.requirement.face.nasal_root_reference` | `nose` | traditional↔neutral equivalence not authorized |
| 準頭 / `zhuntou` | `neutral.requirement.face.nose_tip_reference` | `nose` | blocked on reviewed nose derivation |
| 人中 / `renzhong` | `neutral.requirement.face.philtrum_midline_reference` | none | no existing neutral surface |
| 地閣 / `dige` | `neutral.requirement.face.chin_inferior_midline_reference` | none | no existing neutral surface |

Every requirement has only one permitted measurement role in FR-34: a **vertical reference coordinate candidate**. FR-34 does not claim that any listed modern neutral concept is already equivalent to the traditional term.

## Variant preservation

FR-34 carries all six FR-33 spans forward unchanged.

### Variant A — `mayi_sancai_noncontiguous`

- upper: `hairline → yintang`
- middle: `shangen → zhuntou`
- lower: `renzhong → dige`

### Variant B — `mayi_face_contiguous`

- upper: `hairline → brow`
- middle: `brow → zhuntou`
- lower: `zhuntou → dige`

No universal Three Divisions region map is created.

## Existing FR-14 / FR-17 reuse boundary

The following current neutral surfaces may be dependencies only:

- `left_brow` / `right_brow` → FR-17 brow-curve derivations are still blocked.
- `brow_midline` → FR-17 derivation is still dependency-blocked.
- `nose` → FR-17 nose-region derivation is still unresolved.

Therefore:

- `印堂 = brow_midline` is **not** authorized.
- `山根 = a provider nasal-root landmark` is **not** authorized.
- `準頭 = a provider nose-tip landmark` is **not** authorized.
- provider landmark indices remain an empty set in every FR-34 requirement.

## Missing neutral surfaces

The current FR-14 contract has no consumer surface for:

- hairline
- philtrum / 人中 candidate geometry
- inferior chin / 地閣 candidate geometry

FR-34 intentionally does not mutate FR-14. A later slice must define and review those neutral observation surfaces without embedding traditional semantics into provider output.

## Fail-closed authority boundary

FR-34 explicitly keeps all of the following false:

- mutation of the FR-14 consumer contract as a shortcut
- provider-specific landmark index authority
- traditional anchor names in neutral provider output
- direct traditional→neutral equivalence
- FR-33 source variant selection
- cross-method anchor normalization
- production metric authority
- production F1 authority
- production F6 authority

## Remaining blockers

1. FR-33 still has two unresolved Mayi boundary variants.
2. Hairline, 人中, and 地閣 have no existing FR-14 neutral observation surface.
3. Brow and nose neutral derivations are not reviewed/executable in FR-17.
4. Traditional terms still require explicit, reviewed operationalization to neutral geometry.
5. FR-5 has no production `三停平等` numeric tolerance.
6. The period-direction conflict remains open for F6.

## Next implementation slice

The next useful slice is not a Three Divisions fortune rule. It is the neutral-observation extension needed to represent **hairline / philtrum / chin** candidates and reviewed derivation contracts for **brow reference / nasal root / nose tip**, while preserving FR-33 variant ownership and keeping provider indices non-authoritative.
