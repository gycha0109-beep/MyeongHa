# FACE READING FR-39 — Published Eyebrow Component Decomposition Evidence v0.1

## Status

**Exact published provider components measured / neutral eyebrow role unresolved**

FR-38 proved that each published `@mediapipe/tasks-vision@0.10.35` eyebrow graph contains eight edges, ten vertices, and two disconnected components. FR-39 decomposes those exact installed runtime graphs into their two connected components without selecting either component as the neutral eyebrow curve.

## Runtime finding

For both:

- `FACE_LANDMARKS_LEFT_EYEBROW`
- `FACE_LANDMARKS_RIGHT_EYEBROW`

the exact published connection array decomposes into:

```text
2 disconnected components per side

Each component:
- 4 edges
- 5 vertices
- 2 endpoints
- cycle rank 0
- max vertex degree 2
- topology class: open path
```

Every one of the eight published provider edges is accounted for exactly once across the two components.

## What the component ordinals mean

FR-39 serializes the two components deterministically so evidence remains reproducible. The `serializationOrdinal` values `1` and `2` are **not anatomical labels**.

They do not mean:

- superior / inferior
- inner / outer
- primary / secondary
- eyebrow upper line / lower line
- traditional brow boundary

The stored provider edge pairs are evidence of the exact installed runtime graph only. Their vertex indices carry no MyeongHa semantic authority.

## Why FR-39 does not choose a curve

FR-17 already forbids shortcuts such as:

- first-chain-only
- second-chain-only
- bridging disconnected chains
- pointwise average without correspondence authority
- Bezier smoothing

FR-39 therefore preserves both provider components and leaves `neutralRole=null` for each.

The following remain unresolved:

1. Which provider component, if either, corresponds to a neutral eyebrow curve?
2. Do both components jointly define a neutral eyebrow region or a curve?
3. Is cross-component point correspondence methodologically valid?
4. What pose/capture/expression stability is required before a neutral representation can be reviewed?

## Authority boundary

FR-39 does not authorize:

```text
component 1 -> neutral brow
component 2 -> neutral brow
component 1 + component 2 -> bridged neutral brow
pointwise average -> neutral brow
smoothed provider points -> neutral brow
provider index -> anatomical/traditional meaning
```

It also does not authorize:

- brow-midline derivation
- traditional/neutral equivalence
- FR-33 source-variant selection
- Three Divisions metric
- F1
- F6

## Verification

The test imports the actual installed `FaceLandmarker`, decomposes both published eyebrow connection arrays, and verifies:

- exactly two components per side;
- each component is a 4-edge / 5-vertex open path with two endpoints;
- all eight edges are partitioned exactly once;
- deterministic serialization order is explicitly non-semantic;
- neither component is selected as a neutral curve;
- selection / bridging / averaging / smoothing promotions fail closed.

## Next slice

The next valid step is an **eyebrow neutral-representation candidate review contract**, not a production algorithm.

It should define what evidence would be required to choose between:

- one provider path;
- both paths as a region boundary pair;
- another deterministic representation derived from both paths.

No candidate should become even `research_candidate` until it has explicit anatomical/neutral rationale plus pose/capture/expression stability and calibration evidence.
