# FR-54 — Provider-blind central chin inferior reference trace protocol

## Status

FR-51 selected the anatomical scope class:

`central_inferior_soft_tissue_chin_boundary`

FR-52 admitted bilateral Menton-side only as the strongest currently reproducible **endpoint research candidate**, while leaving final endpoint selection `null`.

FR-53 closed the soft-tissue mental-tubercle route for now because its independently reproducible surface definition and FR-51 boundary membership remain unsupported.

FR-54 addresses the resulting validation problem:

> How can a central-inferior chin boundary observation be recorded independently, before Menton-side or any provider landmarks are shown, so a future comparison does not use the candidate to define its own reference?

Authority state:

`provider_blind_reference_trace_protocol_defined_raw_trace_acquisition_allowed_endpoint_membership_scoring_blocked`

## 1. What FR-54 defines

FR-54 defines a research annotation contract for a **raw ordered polyline** representing an observed central-inferior soft-tissue chin boundary segment.

The annotation must:

- use frontal/en-face, neutral-expression capture state;
- remain blind to provider output;
- remain blind to traditional labels such as 地閣;
- remain blind to Menton-side candidate positions;
- remain blind to soft-tissue mental-tubercle candidate positions;
- contain the required midline soft-tissue Menton anchor as an interior raw-polyline vertex;
- explicitly attest that visible boundary coverage was observed on both anatomical sides of Menton;
- be frozen before any candidate annotation, overlay, or comparison;
- remain within the central chin scope rather than intentionally continuing through the full lower jawline;
- not use Gonion or Otobasion inferius as claimed trace endpoints;
- not treat the first/last trace points as anatomical FR-35 endpoints.

The stored point order means only:

`raw_annotator_draw_order_preserved_not_anatomical_direction`

FR-54 does not infer anatomical left/right membership from array position or increasing/decreasing image x.

## 2. Why a raw ordered point sequence is admissible

Windhager et al. 2019 represents 3D facial-surface lower-jawline curves with ordered sliding semilandmarks. This establishes that a facial-surface curve observation can be represented by an ordered set of surface points.

FR-54 imports only that representational fact.

It does **not** import:

- the study's five-semilandmark count;
- its full Otobasion-inferius-to-Menton jawline scope;
- sliding behavior;
- interpolation;
- smoothing;
- a Menton definition from that evidence record;
- any projection to MediaPipe or image-provider topology.

The FR-54 polyline is therefore a raw annotation sequence, not a reconstructed continuous anatomical curve.

## 3. Midline anchor and candidate separation

Zupan et al. 2022 explicitly defines:

- midline Menton as the most inferior midpoint of the chin;
- bilateral Menton-side points where verticals through the corresponding Cheilion reach the lowest point of the chin;
- separate bilateral Gonion landmarks.

FR-54 uses the existing FR-51/Zupan authority for the **soft-tissue Menton midline anchor**.

Crucially, it does **not** use Menton-side to place the reference trace. Menton-side remains a later candidate and must be invisible while the reference trace is produced.

This creates the required causal ordering:

```text
central-chin raw reference-trace annotation
→ freeze
→ later independent Menton-side candidate annotation
→ future raw join/comparison
```

not:

```text
show Menton-side
→ draw trace through Menton-side
→ claim Menton-side matches trace
```

## 4. Skomina corroboration without nomenclature collapse

Skomina et al., DOI `10.1111/ger.12774`, was published online as the Version of Record on 10 July 2024 and appeared in the March 2025 Gerodontology issue.

Its superficial 3D facial-landmark table defines:

- bilateral `Menton` (`meL`, `meR`) where the vertical through the corresponding Cheilion reaches the lowest point of the chin;
- midline `Gnathion` (`gn`) as the most inferior point on the soft-tissue contour of the chin;
- separate bilateral Gonion.

This independently corroborates a **central-inferior chin geometric construction family** distinct from the mandibular-angle region.

FR-54 deliberately does **not** convert those names into Zupan terminology:

```text
Skomina Gnathion != automatically Zupan Menton
Skomina bilateral Menton != automatically Zupan Menton-side
```

Similar geometric descriptions across papers are corroboration, not automatic cross-study landmark equivalence.

Accordingly, the Skomina evidence record does **not** carry `softTissueMentonInferiorMidlineAnchor` or `bilateralMentonSideCandidateDefinition` authority in FR-54.

## 5. Coverage endpoints are not anatomical endpoints

The raw trace must have a first and last stored point because a finite polyline has finite annotation coverage.

FR-54 assigns those points only this meaning:

`annotation_coverage_extent_only_not_anatomical_endpoint`

Therefore:

- first trace point != left FR-35 endpoint;
- last trace point != right FR-35 endpoint;
- trace coverage length != anatomical scope width;
- raw draw order != anatomical laterality;
- Menton-side proximity to a coverage endpoint has no endpoint meaning.

`lateralExtentSelectionRule` remains `null`.

## 6. Structural minimum versus empirical point-count rule

The validator requires at least three stored points only because the data structure requires:

- an interior Menton trace vertex; and
- at least two other observed trace points.

It separately requires an explicit attestation that visible boundary coverage existed on both anatomical sides of Menton.

This is a structural validity condition, not an empirical trace-density threshold and not a geometric proof that array positions correspond to anatomical sides.

Accordingly:

`tracePointDensityRule = null`

FR-54 does not prescribe how many points a real annotator must use beyond the structural minimum.

## 7. No invented scoring rule

FR-54 intentionally leaves all of the following `null`:

- `tracePointDensityRule`;
- `lateralExtentSelectionRule`;
- `endpointSelectionRule`;
- `interpolationMethod`;
- `smoothingMethod`;
- `membershipDistanceTolerance`;
- `minimumAnnotators`;
- `minimumSubjects`;
- `consensusRule`.

No candidate is classified as on/off the trace in FR-54.

No Euclidean-distance threshold, pixel tolerance, normalized-coordinate epsilon, agreement cutoff, or laterality rule is invented.

## 8. Reference trace candidate is not a reference standard

A frozen FR-54 trace has role:

`provider_blind_reference_trace_candidate_not_reference_standard`

Even a structurally valid contract instance does not establish:

- anatomical ground truth;
- inter-annotator reliability;
- a reviewed reference standard;
- empirical validation;
- Menton-side correctness;
- endpoint correctness.

Real annotations do not yet exist in this slice.

## 9. Explicit authority boundaries

FR-54 does not authorize:

- raw draw order == anatomical left/right order;
- Menton interior array index == geometric side membership;
- trace coverage endpoint == FR-35 endpoint;
- raw polyline == dense continuous anatomical curve;
- raw trace == reviewed reference standard;
- Menton-side influence on reference tracing;
- soft-tissue Mt influence on reference tracing;
- broader lower jawline substitution;
- Gonion/Otobasion endpoint substitution;
- provider-guided tracing;
- traditional-label-guided tracing;
- Skomina nomenclature == Zupan nomenclature;
- interpolation or smoothing;
- distance tolerance or candidate membership scoring;
- MediaPipe/provider mapping;
- traditional 地閣 equivalence;
- empirical validation;
- production 三停 / F1 / F6 / geometry.

## 10. Next evidence slice

The next admissible empirical step is:

1. acquire real FR-54 raw reference traces under provider/traditional/candidate blindness;
2. freeze them before Menton-side annotation or overlay;
3. separately acquire Menton-side candidate observations under the existing Zupan definition;
4. perform a **raw candidate-to-trace join** that reports geometry without converting proximity into membership via an invented threshold.

That later join should preserve unresolved/insufficient-coverage cases rather than forcing binary success/failure.
