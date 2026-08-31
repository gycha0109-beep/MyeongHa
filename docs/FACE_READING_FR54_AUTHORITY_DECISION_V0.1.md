# FR-54 authority decision

## Decision

FR-54 authorizes a **research acquisition protocol for provider-blind raw central-inferior chin reference traces**.

It does not authorize a reviewed reference standard, endpoint selection, Menton-side membership scoring, or cross-study landmark-name equivalence.

The reference trace must be created and frozen before any endpoint candidate is visible.

## Authorized

```text
selected scope
= central_inferior_soft_tissue_chin_boundary

trace representation
= raw_ordered_polyline

trace order meaning
= raw annotator draw order only

required interior anchor
= soft_tissue_menton

visible coverage on both anatomical sides of Menton
= explicit annotation attestation required

first/last trace-point meaning
= annotation coverage extent only

provider blind
= required

traditional-label blind
= required

Menton-side candidate blind
= required

soft-tissue Mt candidate blind
= required

freeze before candidate comparison
= required
```

This is sufficient to begin collecting raw research traces under the contract.

## Evidence separation

Zupan et al. 2022 is the exact source used here for the existing soft-tissue Menton anchor and Menton-side candidate definition.

Skomina et al. provides independent geometric corroboration, but its nomenclature differs:

```text
Skomina meL/meR = bilateral Menton
Skomina gn      = Gnathion
```

FR-54 therefore does not assert:

```text
Skomina Gnathion == Zupan Menton
Skomina bilateral Menton == Zupan Menton-side
```

## Not authorized

```text
raw draw order == anatomical laterality             false
Menton interior index == anatomical side relation   false
coverage endpoint == anatomical endpoint             false
raw polyline == dense continuous curve               false
raw trace == reviewed reference standard             false
Menton-side candidate membership scoring             false
Skomina nomenclature == Zupan nomenclature            false
provider mapping                                     false
traditional 地閣 equivalence                         false
empirical validation                                 false
production geometry                                  false
```

## Null / deliberately undefined

- trace point density rule;
- lateral extent selection rule;
- endpoint selection rule;
- interpolation method;
- smoothing method;
- membership distance tolerance;
- minimum annotator count;
- minimum subject count;
- consensus rule.

The three-point structural minimum is not an empirical sampling threshold. It only permits an interior Menton vertex plus two additional raw observed points. Whether visible coverage existed on both anatomical sides of Menton is represented by an explicit attestation, not inferred from array index or image x.

## Anti-circularity requirement

FR-54 freezes the following order:

```text
reference trace first
→ freeze
→ endpoint candidate later
→ future raw comparison
```

Any annotation produced while Menton-side, soft-tissue Mt, MediaPipe/provider output, or traditional labels are visible is invalid under this contract.

## Next blocker

The next blocker is no longer `reference trace protocol missing`.

It is:

`no real frozen provider-blind reference traces exist yet; no threshold-free Menton-side-to-trace raw join has been executed`.
