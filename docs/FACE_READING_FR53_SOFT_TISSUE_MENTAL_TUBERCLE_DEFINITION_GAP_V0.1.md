# FR-53 — Soft-tissue mental tubercle definition gap

## Status

FR-52 admitted `bilateral_soft_tissue_mental_tubercle` only as a chin-region candidate and prioritized bilateral Menton-side for actual research acquisition.

FR-53 performs the missing definition search:

> Is there a source-safe, independently reproducible anatomical rule for locating bilateral **soft-tissue mental tubercle (Mt)** on a facial surface, and does that point belong to the FR-51 `central_inferior_soft_tissue_chin_boundary`?

Authority state:

`surface_usage_corroborated_explicit_definition_not_found_fr51_scope_compatibility_not_established`

## 1. FR-52 correction

FR-52 v0.1.0 contained an internal inconsistency:

- prose: `Mt is not proven to lie on the inferior chin boundary`;
- code: `scopeCompatibleWithFR51 = true` and `centralInferiorScopeCompatibility = true`.

FR-53 corrects FR-52 to v0.1.1:

- `soft-tissue Mt chin-region association = true`;
- `soft-tissue Mt FR-51 inferior-boundary compatibility = false`;
- `soft-tissue Mt research acquisition executable = false`.

This is a narrowing correction, not a new promotion.

## 2. Zhang et al. 2023 — direct surface use confirmed, definition absent

Source:

- `Subjective evaluation of facial asymmetry with three-dimensional simulated images among the orthodontists and laypersons: a cross-sectional study`
- DOI `10.1186/s12903-023-03167-9`

The study constructs a 3D symmetric face and manipulates:

- soft-tissue mental tubercle (Mt) for the **chin**;
- soft-tissue Gonion for the **mandible**;
- Cheilion for the **lip**;
- zygion for the **cheek**.

This directly supports use of `soft-tissue Mt` as a facial-surface chin landmark label in a 3D model.

It does **not** provide a standalone anatomical rule such as:

`surface geometry -> uniquely locate Mt`.

The FaceGen template/preset is therefore evidence of usage, not anatomy authority.

## 3. Lü et al. 2024 — direct MeshMonk surface use confirmed, definition still absent

Source:

- `Preliminary evaluation of chin symmetry with three dimentional soft tissue spatial angle wireframe template`
- DOI `10.19723/j.issn.1671-167X.2024.01.017`
- PMCID `PMC10845189`

The study acquires Bellus 3D facial scans and obtains nine soft-tissue landmarks, including Mt, through MeshMonk non-rigid registration. It then translates the Mt coordinate in three dimensions for chin-asymmetry analysis.

This directly confirms:

- soft-tissue Mt is operationally used in a real 3D facial-surface pipeline;
- Mt is used as a chin-region landmark.

It does not solve:

- the anatomical definition of Mt independent of the template/registration system;
- whether Mt lies on the FR-51 inferior boundary;
- whether Mt equals Menton-side.

`MeshMonk output -> anatomical definition` is explicitly prohibited.

## 4. Langstaff 2016 — adjacent mental-tubercle surface catalogue only

A University of Edinburgh 3D facial-scan thesis places bilateral `protrusion of mental tubercle` among landmarks on the **surface of facial scans**.

This is useful adjacent evidence because a mental-tubercle-labelled point appears in a separate facial-surface landmark catalogue.

It is **not counted as direct soft-tissue Mt construct evidence** for FR-53 because:

- the source does not identify the label as the same `soft-tissue Mt` construct used in Zhang/Lü;
- no cross-source equivalence is supplied;
- the table description is effectively tautological:

`Protrusion of mental tubercle -> Protrusion of mental tubercle`.

That wording also does not tell an independent annotator how to locate the point from neutral facial anatomy.

Therefore:

`adjacent mental-tubercle surface catalogue == soft-tissue Mt`

remains false.

## 5. Mental-tubercle-anterior — explicit nearby definition, unsafe equivalence

The craniofacial FSTT / forensic reconstruction lineage repeatedly defines `mental tubercle anterior` as:

`most prominent point on the lateral bulge of the chin mound`

This is the strongest explicit nearby anatomical description found.

But FR-53 does not copy it onto soft-tissue Mt because the authority hop is still missing:

`FSTT/anatomical mental-tubercle-anterior == facial-surface soft-tissue Mt`

No reviewed source establishes that equivalence.

Likewise, the bony mental tubercles of the mandible cannot be substituted for a facial-surface Mt point without a validated soft-tissue mapping.

## 6. Result

FR-53 establishes:

1. direct `soft-tissue Mt facial-surface usage` — corroborated in **two reviewed 3D studies**;
2. `soft-tissue Mt chin-region association` — corroborated;
3. Langstaff `protrusion of mental tubercle` — adjacent facial-surface catalogue evidence only, not construct-equivalent;
4. `explicit independently reproducible soft-tissue Mt surface definition` — **not found in the reviewed corpus**;
5. `FR-51 inferior-boundary membership` — not established;
6. `Mt == Menton-side` — not established;
7. `Mt == mental-tubercle-anterior` — not established;
8. `paired Mt annotation readiness` — false;
9. `Menton-side vs Mt geometry comparison readiness` — false.

## 7. Null fields

FR-53 intentionally keeps these `null`:

- `softTissueMentalTubercleSurfaceDefinitionRule`;
- `crossRepresentationMappingRule`;
- `endpointSelectionRule`;
- `endpointEquivalenceTolerance`.

No tolerance, proximity threshold, curvature rule, or landmark index is invented.

## 8. Next admissible evidence

One of the following is required before Mt can re-enter the endpoint comparison path:

1. a peer-reviewed anthropometric standard / primary protocol with a reproducible facial-surface definition of bilateral soft-tissue Mt; or
2. a direct validation source establishing equivalence between facial-surface soft-tissue Mt and a separately defined mental-tubercle-anterior surface/anatomical reference.

After that, a separate evidence hop must still prove the defined Mt point belongs to the FR-51 central inferior soft-tissue chin boundary.

Until then:

- do not collect paired Mt annotations;
- do not compare Mt against Menton-side as competing FR-35 endpoints;
- do not map Mt to MediaPipe FACE_OVAL or provider indices;
- do not project Mt to traditional 地閣 semantics;
- do not authorize production 三停 / F1 / F6 geometry.
