# Face Reading FR-4 — 審辨官 Nose Geometry v0.1

Status: **executable source-neutral geometry / no morphology threshold / no 審辨官 criterion promotion**

## 1. Goal

FR-4 builds the first reusable visual-measurement vertical beneath the FR-3 五官 methodology.

```text
image / FaceLab
→ provider landmarks / contour
→ pose-normalized semantic nose geometry
→ neutral continuous metrics
→ calibration authority (future)
→ traditional criterion operationalization (future)
→ F2/F3 claim
```

The core boundary is:

```text
measurement != physiognomy classification
```

A CV provider may measure a nose. It does not decide `梁柱端直`, `準圓庫起`, `審辨官成`, wealth, career, or fortune.

## 2. Why a neutral metric layer is separate

The existing `FaceMetricDefinition` is methodology-bound. That is appropriate after a traditional concept has been operationalized, but it is too high-level for FaceLab/provider output.

FR-4 therefore introduces neutral geometry definitions first:

```text
neutral.nose.bridge.centerline_rms_deviation@0.1.0
neutral.nose.tip.contour_circularity@0.1.0
```

These are observation measurements. They are not registered as traditional semantic metrics yet.

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
- ordered non-self-intersecting nose-tip contour polygon
- provider provenance

Formula:

```text
circularity = 4πA / P²
```

where `A` is polygon area and `P` is perimeter.

Properties:

- scale invariant
- continuous
- approaches 1 for a circular contour
- no traditional interpretation applied

It is only one geometric signal. `準圓庫起` contains more meaning than 2D contour circularity, including fullness/projection that may require depth or side-view evidence.

Therefore:

```text
nose-tip circularity != 準圓庫起
```

## 5. Quality/provenance gate

FR-4 rejects geometry when:

- coordinate values are non-finite
- bridge has fewer than 3 ordered points
- bridge endpoint axis has zero length
- nose-tip contour has fewer than 6 ordered points
- contour area/perimeter is degenerate
- contour self-intersects
- pose compensation is not declared
- source landmark refs are absent

This prevents arbitrary provider output from becoming evidence.

## 6. Calibration authority

FR-4 defines a calibration contract but ships **no calibration**.

A future criterion calibration must pin:

```text
calibrationId
metricRef
criterionId
calibrationDatasetVersion
evidenceRefs
thresholdPolicy
status
```

Current target criteria:

```text
criterion.discernment.bridge_straight
criterion.discernment.tip_round_full
```

Production criterion classification is blocked unless calibration status is explicitly `production_authorized` and calibration evidence/version are present.

This prevents a developer from silently writing:

```text
bridge deviation < 0.02 = straight
circularity > 0.8 = round
```

without calibration evidence.

## 7. MediaPipe current candidate

Current official Google Face Landmarker documentation (checked 2026-08-27) describes:

- FaceMesh-V2 output: 478 estimated 3D face landmarks
- 52 blendshape scores
- optional facial transformation matrices
- official page last updated 2026-08-17 UTC

The older public Face Geometry / Canonical Face Model documentation describes a canonical 468-landmark topology and a metric 3D geometry pipeline.

This creates an important adapter boundary:

```text
current task output = 478 landmarks
legacy canonical geometry documentation = 468 topology
```

FR-4 therefore records:

```text
semanticAnchorBindingStatus = unresolved
productionBindingAllowed = false
```

No provider index is currently declared to be MyeongHa's `nose_bridge`, `山根`, `年壽`, or `準頭` authority.

A future adapter must explicitly pin:

```text
provider
model/task version
landmark topology version
semantic anchor map version
pose normalization method
metric implementation version
```

## 8. Relation to FaceLab

FaceLab should eventually provide a production-neutral contract such as:

```text
NoseGeometryObservation
- coordinate frame
- semantic bridge centerline points
- nose-tip contour/depth evidence
- pose quality
- occlusion
- source landmark provenance
- extractor/model versions
```

MyeongHa then owns:

```text
neutral metric calculation
→ calibration
→ traditional criterion mapping
→ 五官 synthesis
```

FaceLab still must not emit:

```text
審辨官
梁柱端直
準圓庫起
吉凶
재물운
직업운
```

## 9. Verification strategy

FR-4 tests use synthetic geometry only.

Required invariants:

1. exactly straight bridge → deviation 0
2. displaced interior bridge point → positive continuous deviation
3. uniform scaling → same normalized deviation
4. regular high-resolution circular polygon → circularity near 1
5. uniform scaling → same circularity
6. pose-uncompensated input rejected
7. missing provenance rejected
8. degenerate geometry rejected
9. non-finite provider values rejected
10. no metric result contains a physiognomy classification
11. no criterion classification without explicit calibration
12. current MediaPipe semantic index binding remains unresolved

## 10. Consumer/product implication

This layer enables a strong visual experience later without fake certainty:

```text
코 중심축 visual overlay
코끝 contour overlay
측정 근거 highlight
↓
calibrated traditional criterion
↓
"코의 중심축이 審辨官의 직선 조건을 강하게 충족합니다."
```

The confidence in the sentence comes from a resolved calibrated criterion, not from adding vague wording or inventing a fortune score.

## 11. Current promotion state

| Layer | State |
|---|---|
| neutral bridge metric | executable |
| neutral tip circularity | executable |
| synthetic geometry verification | executable |
| provider semantic anchor binding | unresolved |
| FaceLab production-neutral geometry contract | unavailable |
| 梁柱端直 calibration | absent / blocked |
| 準圓庫起 calibration | absent / blocked |
| F2 nose criterion production claim | blocked |
| 審辨官 full formation | blocked |

## 12. Next

1. Build synthetic discriminating-pair fixture catalog for bridge deviation and tip contour.
2. Define a calibration-evidence registry separate from traditional source evidence.
3. Prototype a provider adapter only after semantic anchor mapping is version-pinned.
4. Add depth/profile metric candidate for `年壽高隆` / fullness without forcing it into single-view 2D.
5. Continue scan-level source verification for 審辨官 passages.
