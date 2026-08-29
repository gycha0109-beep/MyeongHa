# FACE READING FR-37 — MediaPipe Published Topology Surface Gap v0.1

## Status

**Published runtime named-topology surface measured / provider binding blocked**

FR-37 inspects the exact published `@mediapipe/tasks-vision@0.10.35` `FaceLandmarker` runtime surface for the three FR-35 neutral extensions.

Pinned boundary:

- package: `@mediapipe/tasks-vision`
- version: `0.10.35`
- type surface: `vision.d.ts`
- runtime class: `FaceLandmarker`

## Reflected named topology surface

The runtime reflection test requires the exact `FACE_LANDMARKS_*` surface:

- `FACE_LANDMARKS_LIPS`
- `FACE_LANDMARKS_LEFT_EYE`
- `FACE_LANDMARKS_LEFT_EYEBROW`
- `FACE_LANDMARKS_LEFT_IRIS`
- `FACE_LANDMARKS_RIGHT_EYE`
- `FACE_LANDMARKS_RIGHT_EYEBROW`
- `FACE_LANDMARKS_RIGHT_IRIS`
- `FACE_LANDMARKS_FACE_OVAL`
- `FACE_LANDMARKS_CONTOURS`
- `FACE_LANDMARKS_TESSELATION`

No direct named topology is exposed for a hairline boundary, philtrum region, or chin-specific contour.

## FR-35 result

| Neutral surface | Direct named binding | Candidate search surface | Authority |
| --- | --- | --- | --- |
| `neutral.face.hairline_boundary` | none | face oval / contours / tessellation | blocked |
| `neutral.face.philtrum_region` | none | lips / contours / tessellation | blocked |
| `neutral.face.chin_inferior_contour` | none | face oval / contours / tessellation | blocked |

Candidate topology references are search surfaces only. They do not authorize a subset, formula, or provider landmark index.

## Non-conclusion

FR-37 does not claim that neutral extraction is impossible. Absence of a dedicated named topology only proves that the published package does not hand us a direct binding under those names.

A later research slice may review candidate extraction algorithms over the full provider landmark graph, but must separately establish provider binding evidence and stability requirements.

## Fail-closed boundary

FR-37 keeps all of the following blocked:

- arbitrary face-oval subgraph selection
- arbitrary contours subgraph selection
- arbitrary lips subgraph selection
- arbitrary tessellation subgraph selection
- provider landmark-index authority
- traditional/neutral equivalence
- FR-33 source-variant selection
- production Three Divisions metric
- production F1
- production F6

## Verification

The test imports the installed published `FaceLandmarker` runtime and reflects its static property names. It fails on topology-surface drift, candidate-subgraph promotion, or provider-index injection.

## Next slice

Review algorithm candidates and evidence requirements for FR-35 hairline/philtrum/chin surfaces and the still-blocked FR-17 brow/nose derivations. Do not move to Three Divisions measurement until those provider-neutral bindings are reviewed.
