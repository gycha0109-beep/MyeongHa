# FR-52 — Chin contour endpoint candidate admission

## Status

FR-51 selected the FR-35 anatomical scope class as:

`central_inferior_soft_tissue_chin_boundary`

FR-52 asks the next narrower question:

> Which provider-independent bilateral landmarks are credible candidates for the left/right extent of that selected central chin boundary?

Authority state:

`endpoint_candidate_families_admitted_menton_side_operationally_prioritized_final_endpoint_selection_blocked`

Authority implementation revision: `0.1.1`.

The final FR-35 endpoint pair remains unresolved.

### v0.1.1 correction

FR-53 review found that v0.1.0 code had marked soft-tissue Mt as FR-51 scope-compatible even though this document already stated that Mt had **not** been proven to lie on the inferior chin boundary.

The corrected boundary is:

- `soft-tissue Mt chin-region association = true`;
- `soft-tissue Mt central-inferior scope compatibility = false`;
- `soft-tissue Mt scopeCompatibleWithFR51 = false`;
- `soft-tissue Mt research acquisition executable = false`.

No Mt evidence was removed; only the unsupported scope hop was removed.

## 1. Candidate A — bilateral Menton-side

Source:

- Zupan et al. 2022
- `An evaluation of three-dimensional facial changes after surgically assisted rapid maxillary expansion (SARME): an observational study`
- DOI `10.1186/s12903-022-02179-1`
- PMCID `PMC9063160`

The study's 3D facial landmark table defines:

- `Menton`: most inferior midpoint of the chin;
- left/right `Menton side`: the point where the vertical through the respective Cheilion reaches the lowest point of the chin;
- left/right `Gonion`: separately defined mandibular-angle landmarks.

FR-52 admission:

`admitted_reproducible_scope_compatible_research_candidate`

Why this candidate is currently strongest for acquisition:

- bilateral;
- soft-tissue facial landmark context;
- explicit operational rule;
- independent of MediaPipe/provider topology;
- compatible with the central-inferior chin scope selected by FR-51.

Research acquisition priority:

`bilateral_menton_side`

Important limitation:

Research priority is not final endpoint authority. The paper does not say that Menton-side is the endpoint of MyeongHa's FR-35 curve.

## 2. Candidate B — bilateral soft-tissue mental tubercle

Sources:

- Zhang et al. 2023, `Subjective evaluation of facial asymmetry with three-dimensional simulated images among the orthodontists and laypersons`, DOI `10.1186/s12903-023-03167-9`.
- Lü et al. 2024, `Preliminary evaluation of chin symmetry with three dimentional soft tissue spatial angle wireframe template`, DOI `10.19723/j.issn.1671-167X.2024.01.017`, PMCID `PMC10845189`.

The 2023 study explicitly separates regions by landmark:

- soft-tissue mental tubercle (Mt) -> chin;
- soft-tissue Gonion -> mandible;
- Cheilion -> lip;
- zygion -> cheek.

The 2024 3D facial-scan study again uses soft-tissue Mt as a chin-region landmark and obtains landmarks through MeshMonk registration.

FR-52 admission:

`admitted_chin_region_candidate_exact_surface_definition_missing`

Safe conclusion:

- soft-tissue Mt is a real bilateral chin-region landmark family in contemporary 3D facial work;
- it is distinct in use from Gonion/mandible.

Not safe:

- the reviewed text does not provide a sufficiently explicit surface definition that can be reproduced independently of the study's model/registration system;
- chin-region association does **not** prove FR-51 inferior-boundary membership;
- Mt is not proven to lie on the inferior chin boundary;
- Mt is not proven equal to Menton-side;
- Mt is not proven to be an FR-35 endpoint.

Therefore:

```text
mentalTubercleSurfaceDefinitionRule = null
scopeCompatibleWithFR51 = false
researchAcquisitionExecutable = false
```

## 3. Comparison reference — mental tubercle anterior

A separate landmark lineage in craniofacial soft-tissue-thickness / forensic reconstruction work repeatedly defines `mental tubercle anterior` as:

`most prominent point on the lateral bulge of the chin mound`

This definition is corroborated in later craniofacial measurement literature and traces to the De Greef soft-tissue-thickness landmark lineage.

FR-52 admission:

`admitted_non_equivalent_lateral_bulge_reference_only`

Why it is useful:

- bilateral lateral-chin location;
- explicit reproducible anatomical description;
- useful comparison geometry for determining what a `mental tubercle` family may mean spatially.

Why it cannot be promoted:

- the cited FSTT/ultrasound lineage uses the landmark as an anatomical measurement location, not as a demonstrated facial-surface inferior-contour endpoint;
- no reviewed source proves `mental tubercle anterior == soft-tissue Mt` from the 3D facial-asymmetry papers;
- the lateral bulge prominence is not established as lying on the inferior chin boundary selected in FR-51.

Therefore this candidate is not scope-compatible with the selected inferior-boundary endpoint problem.

## 4. Candidate-family separation

FR-52 prohibits these silent substitutions:

- `Menton-side == soft-tissue mental tubercle`;
- `mental tubercle anterior == soft-tissue mental tubercle`;
- `mental tubercle anterior == inferior contour endpoint`;
- `Menton-side == exact FR-35 endpoint`;
- `chin-region landmark == FR-51 inferior-boundary landmark`;
- any candidate == traditional 地閣 edge.

These are separate authority hops.

## 5. Executable research candidate

Function:

`deriveMentonSideEndpointCandidatePairFR52(...)`

It reuses the provider-blind frozen FR-50 annotation contract and returns:

- left Menton-side candidate;
- soft-tissue Menton inferior-midline anchor;
- right Menton-side candidate.

The result is explicitly labelled:

`highest_currently_operationalized_research_candidate`

and carries only false downstream flags:

- `exactFR35EndpointPairAuthorized`
- `denseCurveAuthorized`
- `providerMappingAuthorized`
- `traditionalDigeEdgeAuthorized`
- `productionGeometryAuthorized`

## 6. Unresolved fields

FR-52 preserves the following as `null`:

- `finalEndpointSelection`
- `endpointSelectionRule`
- `endpointEquivalenceTolerance`
- `mentalTubercleSurfaceDefinitionRule`

No numerical tolerance or selection criterion is invented.

## 7. What FR-52 resolves

FR-52 establishes:

1. endpoint candidate families can be compared without conflation;
2. bilateral Menton-side is the strongest currently reproducible provider-independent research-acquisition candidate;
3. soft-tissue mental tubercle is independently corroborated as a chin-region landmark family but lacks both an explicit reproducible surface definition and evidence of FR-51 inferior-boundary membership;
4. mental-tubercle-anterior is an explicit lateral-bulge reference but is not silently mapped to soft-tissue Mt or the inferior boundary;
5. no final FR-35 endpoints are authorized.

## 8. Next evidence

The highest-value next work is:

1. locate a peer-reviewed/standard source that gives a reproducible anatomical surface definition for **soft-tissue mental tubercle**;
2. separately establish whether that defined point lies on the FR-51 central-inferior chin boundary;
3. continue provider-blind Menton-side research without treating it as a final endpoint.

Only after candidate positions can be compared against independently traced central-inferior chin boundaries should a final endpoint rule be considered.

MediaPipe must remain outside that selection step.
