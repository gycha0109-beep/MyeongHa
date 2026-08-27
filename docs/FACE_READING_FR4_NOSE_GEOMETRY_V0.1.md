# Face Reading FR-4 — 審辨官 Nose Geometry v0.1

Status: **executable source-neutral geometry / no morphology threshold / no 審辨官 criterion promotion**

## 1. Goal

FR-4 builds the first reusable visual-measurement vertical beneath the FR-3 五官 methodology.

```text
image / FaceLab
→ provider landmarks / contour
→ pose-normalized semantic nose geometry
→ neutral continuous metrics
→ calibration authority (where sufficiently observed)
→ traditional criterion operationalization
→ F2/F3 claim
```

Core boundary:

```text
measurement != physiognomy classification
```

A CV provider may measure a nose. It does not decide `梁柱端直`, `準圓庫起`, `審辨官成`, wealth, career, or fortune.

## 2. Neutral metric layer

The existing `FaceMetricDefinition` is methodology-bound. That is appropriate after a traditional concept has been operationalized, but too high-level for FaceLab/provider output.

FR-4 therefore introduces source-neutral geometry first:

```text
neutral.nose.bridge.centerline_rms_deviation@0.1.0
neutral.nose.tip.contour_circularity@0.1.0
```

Neither is registered as a traditional semantic metric yet.

## 3. Nose bridge metric

Input:

- pose-normalized 2D coordinate frame
- ordered semantic nose-bridge centerline points
- provider/extractor/model provenance
- source landmark references

Formula:

```text
reference axis = first bridge point → last bridge point
for each interior bridge point:
  normalized deviation = perpendicular distance to axis / axis length
metric = RMS(normalized deviation)
```

Properties:

- translation invariant
- uniform-scale invariant
- continuous
- zero for a mathematically straight centerline
- no threshold or label applied

It does **not** mean:

```text
metric <= X → 梁柱端直
```

until a separate calibration policy is reviewed.

## 4. Nose-tip contour metric

Input:

- pose-normalized 2D frame
- ordered, non-self-intersecting contour vertices
- no duplicated closing vertex
- provider provenance

Formula:

```text
circularity = 4πA / P²
```

Properties:

- scale invariant
- continuous
- approaches 1 for a circular contour
- no traditional interpretation applied

Crucially:

```text
nose-tip circularity != 準圓庫起
```

`準圓庫起` contains more than planar roundness. `庫起` implies fullness/projection that 2D contour circularity does not observe. FR-4 therefore records the traditional binding as:

```text
bindingStatus = blocked_under_observed
missing = [tip_fullness, tip_projection_or_depth]
calibrationAllowed = false
```

This is stronger than merely saying “threshold not decided”: **the current signal set is structurally insufficient for that criterion.**

## 5. Quality/provenance gate

FR-4 rejects geometry when:

- coordinates are non-finite
- bridge has fewer than 3 ordered points
- bridge endpoint axis has zero length
- nose-tip contour has fewer than 6 vertices
- a contour vertex is duplicated, including duplicated closure
- contour area/perimeter is degenerate
- contour self-intersects
- pose compensation is not declared
- source landmark refs are absent

Missing or invalid provider data cannot become traditional evidence.

## 6. Calibration authority

FR-4 currently permits a calibration contract only for:

```text
criterion.discernment.bridge_straight
← neutral.nose.bridge.centerline_rms_deviation@0.1.0
```

A future bridge calibration must pin:

```text
calibrationId
exact metricRef
exact criterionId
calibrationDatasetVersion
evidenceRefs
thresholdPolicy = max_inclusive(maxRmsDeviation)
status
```

Production classification remains blocked unless:

- status = `production_authorized`
- evidence refs exist
- calibration dataset version exists
- `maxRmsDeviation` is finite and non-negative

FR-4 ships **no threshold value**.

`criterion.discernment.tip_round_full` is not accepted by this calibration contract at all. It first needs additional depth/fullness observation dimensions.

## 7. MediaPipe current candidate

Current official Google Face Landmarker documentation checked on 2026-08-27 describes:

- FaceMesh-V2 output: 478 estimated 3D face landmarks
- 52 blendshape scores
- optional facial transformation matrices
- page last updated 2026-08-17 UTC

The older public Face Geometry / Canonical Face Model documentation describes a canonical 468-landmark topology and metric 3D geometry pipeline.

Therefore:

```text
current task output = 478 landmarks
legacy canonical geometry docs = 468 topology
```

FR-4 records:

```text
semanticAnchorBindingStatus = unresolved
productionBindingAllowed = false
```

No provider index is currently declared to be MyeongHa's `nose_bridge`, `山根`, `年壽`, or `準頭` authority.

A future adapter must pin:

```text
provider
model/task version
landmark topology version
semantic anchor map version
pose normalization method
metric implementation version
```

## 8. FaceLab relation

FaceLab should eventually expose a production-neutral observation contract such as:

```text
NoseGeometryObservation
- coordinate frame
- semantic bridge centerline points
- nose-tip contour
- depth/profile evidence where available
- pose quality
- occlusion
- source landmark provenance
- extractor/model versions
```

MyeongHa owns:

```text
neutral metric calculation
→ calibration
→ traditional criterion mapping
→ 五官 synthesis
```

FaceLab must not emit:

```text
審辨官
梁柱端直
準圓庫起
吉凶
재물운
직업운
```

## 9. Verification strategy

Synthetic geometry only:

1. straight bridge → deviation 0
2. displaced centerline → positive continuous deviation
3. uniform scaling → same normalized deviation
4. regular circular polygon → circularity near 1
5. circularity is scale invariant
6. pose-uncompensated input rejected
7. missing provenance rejected
8. degenerate geometry rejected
9. duplicate contour closure rejected
10. non-finite provider values rejected
11. no metric result carries classification
12. bridge criterion requires explicit production calibration
13. `準圓庫起` remains blocked as under-observed
14. MediaPipe semantic index binding remains unresolved

## 10. Consumer implication

This layer enables a strong visual experience later without fake scoring:

```text
코 중심축 overlay
실제 편차 visual
측정 근거 highlight
↓
reviewed calibration
↓
"코의 중심축은 審辨官의 직선 조건을 분명하게 충족합니다."
```

For the tip, the UI may show contour geometry as an observation, but may not yet state `準圓庫起` until fullness/depth evidence is added.

## 11. Current promotion state

| Layer | State |
|---|---|
| neutral bridge deviation | executable |
| neutral tip circularity | executable observation only |
| synthetic geometry verification | executable |
| provider semantic anchor binding | unresolved |
| FaceLab production-neutral geometry contract | unavailable |
| 梁柱端直 calibration | absent / allowed only through explicit calibration contract |
| 準圓庫起 calibration | **structurally blocked: under-observed** |
| F2 nose criterion production claim | blocked |
| 審辨官 full formation | blocked |

## 12. Next

1. Build synthetic discriminating-pair fixture catalog for bridge deviation.
2. Define calibration-evidence registry separate from traditional textual evidence.
3. Add depth/profile observation candidate for `年壽高隆` and `準圓庫起` fullness/projection.
4. Prototype provider adapter only after semantic anchor mapping is version-pinned.
5. Continue scan-level source verification for 審辨官 passages.
