# FR-50 authority decision

## Admitted

- Provider-independent facial/lower-face contour operationalizations exist in peer-reviewed 3D facial-morphometric literature.
- A lower jawline can be represented on a 3D facial surface with curve semilandmarks between an anatomical endpoint and Menton.
- Lower-face soft-tissue contour can be sampled at predefined sagittal planes by intersections with a mandibular lower-border reference.
- Bilateral Menton-side landmarks and midline Menton provide a provider-independent sparse central-inferior chin scaffold.
- Soft-tissue Menton can be treated as a member/anchor of an inferior chin-boundary geometry family.
- An already independent provider-blind frozen annotation may be projected into a three-point research scaffold without provider semantics.

## Not admitted

- Any reviewed contour family is automatically identical to FR-35 `neutral.face.chin_inferior_contour`.
- The full lower jawline and the central chin-inferior boundary are interchangeable scopes.
- A three-point scaffold is a complete continuous contour.
- A study-specific semilandmark count is a universal sampling density.
- 3D surface geometry directly equals `canonical_image_normalized_2d` geometry.
- Skeletal/mandibular-border referenced contour sampling is available from an ordinary image without separate evidence.
- Any interpolation, smoothing, alignment tolerance, calibration threshold, or sample minimum.
- `FACE_OVAL == chin contour`, `152 == Menton`, or traditional `地閣 == Menton`.
- Any production 三停, F1, F6, provider mapping, or production geometry promotion.

## Consequence

FR-50 changes the blocker from:

`no provider-independent full-contour operationalization evidence`

to:

`multiple provider-independent contour operationalization families exist, but exact FR-35 anatomical scope and canonical 2D binding remain unresolved`.

This is a real narrowing of the geometry problem without pretending that a 3D jawline, bone-referenced contour sample, and sparse central-chin scaffold are the same object.
