# FR-50 — Provider-independent chin contour geometry

## Status

FR-50 reviews provider-independent anatomical and facial-morphometric constructions for lower facial/chin contour geometry after FR-49 established only a conceptual Menton-from-chin-contour relation.

Authority state:

`provider_independent_contour_operationalizations_supported_exact_fr35_2d_curve_binding_blocked`

The important result is that provider-independent contour geometry is not hypothetical: the literature contains multiple explicit constructions. The equally important limitation is that these constructions are not interchangeable and none is automatically identical to the unresolved FR-35 `neutral.face.chin_inferior_contour` slot.

## 1. Upstream boundary

FR-35 defines:

- `neutral.face.chin_inferior_contour`
- geometry kind `curve`
- coordinate frame `canonical_image_normalized_2d`
- no verified provider binding.

FR-49 adds:

- traditional `地閣` is supported at the chin-region level;
- soft-tissue Menton is explicitly defined from the soft-tissue contour of the chin;
- Menton does not substitute for the entire FR-35 curve;
- provider mapping and production geometry remain blocked.

FR-50 therefore asks a narrower neutral-geometry question only:

> Are there reviewed provider-independent ways to operationalize lower-jaw/chin soft-tissue contour geometry, and if so, what can be reused without silently redefining FR-35?

## 2. Reviewed operationalization family A — 3D lower-jawline curve semilandmarks

Source:

- Sonja Windhager et al.
- `Facial aging trajectories: A common shape pattern in male and female faces is disrupted after menopause`
- DOI `10.1002/ajpa.23878`
- PMID `31189026`
- PMCID `PMC6771603`

The study uses 3D facial surface scans and a geometric-morphometric landmark scheme. For each side of the jawline it places five sliding semilandmarks between `Otobasion inferius` and `Menton`, along the lower border of the mandible.

Safe admission:

- a lower-jawline facial-surface curve can be operationalized independently of MediaPipe/provider topology;
- Menton is used as an endpoint/member of that curve family.

Not admitted:

- the study-specific count of five semilandmarks is a universal MyeongHa point count;
- the entire Otobasion-inferius-to-Menton jawline is exactly the FR-35 `chin_inferior_contour` scope;
- the 3D surface curve directly defines canonical 2D image coordinates.

## 3. Reviewed operationalization family B — bilateral Menton-side + Menton scaffold

Source:

- Jurij Zupan, Nataša Ihan Hren, Miha Verdenik
- `An evaluation of three-dimensional facial changes after surgically assisted rapid maxillary expansion (SARME): an observational study`
- DOI `10.1186/s12903-022-02179-1`
- PMID `35501780`
- PMCID `PMC9063160`

The 3D facial-scan landmark protocol defines:

- `Menton`: the most inferior midpoint of the chin;
- left/right `Menton side`: the point where the vertical through the corresponding Cheilion reaches the lowest point of the chin.

This supports a provider-independent sparse central-inferior chin scaffold:

`left Menton-side -> Menton -> right Menton-side`

FR-50 makes that scaffold executable for research acquisition from an already independent, frozen, provider-blind annotation.

The output is deliberately labelled:

`provider_independent_sparse_central_chin_scaffold_not_full_fr35_contour`

The code does not invent a tolerance to machine-check whether each Menton-side point is exactly vertically aligned with its Cheilion. That source definition remains an annotation instruction until an empirical annotation/measurement protocol supplies a reviewed tolerance or exact coordinate construction.

No interpolation or smoothing method is selected.

## 4. Reviewed operationalization family C — lower-face contour sampled across sagittal planes

Source:

- Yun-Fang Chen et al.
- `Facial asymmetry outcome of orthognathic surgery in mild craniofacial microsomia compared to non-syndromic class II asymmetry`
- DOI `10.1007/s00784-024-05899-6`
- PMID `39196436`
- PMCID `PMC11358178`

The study creates predefined sagittal planes from skeletal reference landmarks and assigns soft-tissue contour points where the facial soft-tissue surface intersects the mandibular lower border.

Safe admission:

- lower-face soft-tissue contour geometry can be explicitly sampled by a provider-independent anatomical construction;
- contour points can be treated as geometry rather than provider landmark semantics.

Important limitation:

- this construction relies on skeletal reference geometry/mandibular lower border and therefore is not an image-only production rule for MyeongHa;
- its bilateral lower-face contour scope is not silently treated as the FR-35 chin-only curve;
- study-specific plane positions and sample counts are not imported as universal constants.

## 5. What FR-50 now supports

The evidence is sufficient for these claims:

1. provider-independent lower-jaw/lower-face contour operationalizations exist;
2. a facial-surface lower-jawline may be represented as a curve using semilandmarks;
3. lower-face soft-tissue contour points may be sampled by predefined anatomical planes;
4. bilateral Menton-side landmarks plus midline Menton provide a sparse central-inferior chin scaffold;
5. Menton is supported as a member of the inferior chin boundary/contour family.

## 6. What remains blocked

FR-50 intentionally keeps all of the following false:

- exact anatomical scope of FR-35 `chin_inferior_contour` selected;
- any cited lower-jawline curve `==` FR-35 chin contour;
- any cited plane-sampled lower-face contour `==` FR-35 chin contour;
- three-point Menton-side/Menton scaffold `==` full chin contour;
- 3D facial-surface geometry `==` canonical image-normalized 2D geometry;
- authoritative MyeongHa point count;
- authoritative interpolation or smoothing;
- empirical point-alignment tolerance;
- image-only access to mandibular skeletal border;
- `FACE_OVAL == reviewed chin contour`;
- MediaPipe index `152 == Menton`;
- traditional `地閣 == Menton`;
- production 三停 / F1 / F6 / geometry.

## 7. Research acquisition protocol opened

Protocol:

`protocol.face.chin_inferior.central_sparse_scaffold.fr50@0.1.0`

Required annotation fields include:

- left/right Cheilion;
- left/right Menton-side;
- soft-tissue Menton;
- frontal en-face normalized image coordinates;
- provider hidden during annotation;
- annotation frozen before provider scoring;
- traditional labels hidden during annotation.

The derived research geometry contains exactly the three chin points, in this order:

`left_menton_side -> soft_tissue_menton -> right_menton_side`

That three-point output is a sparse scaffold only. It is not a dense contour and is not a production binding.

## 8. Next evidence

The remaining decision is no longer "does any provider-independent chin/lower-face contour geometry exist?" The answer is yes.

The next authority question is:

> What exact anatomical extent should `neutral.face.chin_inferior_contour` mean in MyeongHa: the central inferior chin boundary around Menton, or a broader lower-jawline curve?

That scope decision must be made explicitly from the traditional consumer requirement plus neutral anatomy. Only then should real provider-blind contour annotations/traces be acquired for that selected scope and later compared against any provider candidate.
