# FR-52 authority decision

## Decision

FR-52 does **not** select the final left/right endpoints of FR-35 `neutral.face.chin_inferior_contour`.

It admits and separates three endpoint-related candidate families and sets only a research-acquisition priority:

1. `bilateral_menton_side` — highest currently operationalized research candidate.
2. `bilateral_soft_tissue_mental_tubercle` — real soft-tissue chin-region candidate, exact reproducible surface definition still missing.
3. `bilateral_mental_tubercle_anterior_reference` — reproducibly defined lateral chin-bulge comparison reference from FSTT/anatomical landmark literature, explicitly non-equivalent to soft-tissue Mt and not an inferior-contour endpoint.

Final endpoint selection remains `null`.

## Why Menton-side is prioritized for acquisition

Zupan et al. 2022 provides a bilateral operational rule:

`vertical through each Cheilion -> lowest point of the chin`

This is provider-independent, bilateral, and compatible with FR-51's selected `central_inferior_soft_tissue_chin_boundary` scope. It is therefore executable as a research candidate pair.

This priority is **not** endpoint authority.

## Why soft-tissue mental tubercle is not yet executable

Recent 3D facial-asymmetry studies explicitly use `soft tissue mental tubercle (Mt)` as the chin landmark and distinguish it from soft-tissue Gonion/mandible and Cheilion/lip.

However, the reviewed papers do not provide a sufficiently explicit anatomical surface definition that FR-52 can independently reproduce without borrowing hidden model/FaceGen/Meshmonk semantics.

Therefore:

- chin-region candidate: admitted;
- exact surface rule: not admitted;
- equality with Menton-side: not admitted;
- FR-35 endpoint authority: not admitted.

## Why mental-tubercle-anterior stays separate

Craniofacial soft-tissue-thickness landmark literature repeatedly defines `mental tubercle anterior` as the most prominent point on the lateral bulge of the chin mound.

That definition is useful as a reproducible lateral-chin comparison reference, but the cited lineage uses it as an anatomical/FSTT measurement location. FR-52 therefore does not silently convert it into the soft-tissue-surface `Mt` used in 3D facial-asymmetry studies or into an inferior-boundary endpoint.

## Still blocked

- final FR-35 endpoint pair;
- endpoint selection rule;
- endpoint-equivalence tolerance;
- exact soft-tissue Mt surface definition;
- candidate-family interchangeability;
- dense continuous curve;
- interpolation/smoothing;
- canonical 2D extraction;
- MediaPipe FACE_OVAL endpoint binding;
- provider index authority;
- traditional 地閣 edge equivalence;
- production 三停 / F1 / F6 / geometry.

## Consequence

The blocker changes from:

`no structured endpoint candidate comparison`

to:

`Menton-side is the strongest currently reproducible acquisition candidate; soft-tissue Mt remains a competing chin-region candidate pending an explicit surface definition; no final endpoint is selected`.
