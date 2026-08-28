# MyeongHa Face Reading FR-25 — MediaPipe Raw Eye Landmark Adapter v0.1

Status: executable research adapter / production provider activation blocked
Scope: witnessed MediaPipe Web `FaceLandmarkerResult` shape → FR-24 research eye-pair projection
Baseline: FR-16 provider evidence + FR-24 research eye-pair runtime bridge

## 1. Decision

FR-25 adds the missing runtime adapter between a MediaPipe-shaped face-landmarker result and the already executable FR-24 eye projection.

```text
FaceLandmarkerResult
  faceLandmarks[one face][provider vertex] = {x,y,z}
↓ FR-25
select only pinned FR-24 eye vertices
validate x/y/z
intentionally discard z
ignore blendshape/transform payloads
↓
FR-24 topologyInputs with x/y only
↓
FR-24 research-only eye-pair artifact
```

This remains a research path. It is not a verified FR-22 production provider implementation.

## 2. Raw Web type witness

FR-25 pins the same upstream commit already used by FR-16:

```text
repository = google-ai-edge/mediapipe
commit = 30590fe8d3fdc57e63a0e9c5b2c0ececffb37301
sourceRefClass = upstream_master_structure_witness
releaseExactForInstalledPackage = false
```

Witnessed normalized landmark declaration:

```text
path = mediapipe/tasks/web/components/containers/landmark.d.ts
blob = bb6104d89c8f9917cc173b5bfe2b347bab71b71c
shape = {x:number, y:number, z:number}
```

Witnessed face result declaration:

```text
path = mediapipe/tasks/web/vision/face_landmarker/face_landmarker_result.d.ts
blob = 4af483ab3c1c61b268b9d92a28bab6160c60b47f
faceLandmarks = NormalizedLandmark[][]
faceBlendshapes = Classifications[]
facialTransformationMatrixes = Matrix[]
```

These are upstream source witnesses. They do not establish source equivalence to the installed `@mediapipe/tasks-vision@0.10.35` tarball.

## 3. Face selection is fail-closed

FR-25 v0.1 requires exactly one detected face.

```text
0 faces → reject
1 face  → process
2+ faces → reject
```

It does not guess which face belongs to the user and does not select the largest, nearest, or first face from a multi-face result.

## 4. Minimal provider-field consumption

Only provider vertices referenced by the exact FR-24 eye topology witness are selected.

For those vertices:

```text
x → validate finite [0,1] → emit to FR-24
y → validate finite [0,1] → emit to FR-24
z → validate finite → discard
```

`z` is not a neutral observation field and is not persisted in the FR-24 artifact.

Consumed landmarks reject unwitnessed fields such as `visibility`. This keeps FR-25 v0.1 bound to the exact witnessed `{x,y,z}` raw point shape rather than silently accepting a changed provider contract.

## 5. Provider result fields not consumed

The witnessed result also contains:

```text
faceBlendshapes
facialTransformationMatrixes
```

FR-25 requires the result arrays to exist so the root shape matches the witness, but their contents are not consumed, copied, persisted, or promoted into the research artifact.

## 6. No arbitrary topology input

FR-25 derives its required provider vertex set from:

```text
FR24_EYE_TOPOLOGY_WITNESS_EDGES
```

Callers cannot provide eye edge graphs or substitute another landmark index set.

The output is handed to FR-24, which continues to use the single FR-16 closed-cycle ordering/projection implementation.

## 7. Authority boundary

FR-25 evidence is fixed as:

```text
authorityState = research_adapter_only
productionProviderActivationAllowed = false
anatomicalLateralityResolved = false
traditionalSemanticAuthority = false
rawProviderResponsePersisted = false
providerDepthPersisted = false
```

Provider symbols containing `LEFT` and `RIGHT` remain provider-label provenance only. They do not become image-side or anatomical-side authority.

FR-25 does not issue an FR-15 production neutral observation. It only reaches the FR-24 research artifact.

## 8. Current external implementation state

Repository inspection found no current K_beauty `FaceLandmarker`, `faceLandmarks`, or `mediapipe` runtime implementation to attest as the actual provider implementation.

Therefore FR-25 is a MyeongHa-owned adapter contract and executable transformation, not evidence that K_beauty/FaceLab already runs MediaPipe in production.

## 9. Readiness

```text
rawResultAdapterReady = true
researchEyeProjectionReady = true
productionProviderActivationReady = false
anatomicalLateralityReady = false
traditionalSemanticAuthorityGranted = false
```

The practical eye path is now executable from a MediaPipe-shaped result through FR-24. Production provider activation still requires an actual inspected runtime implementation, FR-22 implementation registration, FR-23 reviewed conformance evidence, and the existing release/laterality gates.
