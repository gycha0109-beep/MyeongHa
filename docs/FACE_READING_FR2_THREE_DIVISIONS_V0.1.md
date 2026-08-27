# Face Reading FR-2 — 三停 Source & Operationalization v0.1

Status: **research / executable morphology only / no production fortune interpretation**

## 1. Goal

FR-2 converts the traditional 三停 concept into a source-traceable, deterministic morphology boundary without inventing modern numeric thresholds.

Pipeline:

```text
Source Work
→ Witness
→ Passage
→ Methodology
→ Region Map
→ Geometry Metric
→ Relative-order Operationalization
→ F1 Morphology Claim
```

F6 period interpretation is intentionally blocked until the source conflict described below is resolved.

## 2. Current source evidence

### 2.1 《神相全編》 — 面三停

Electronic witness:

- Chinese Text Project
- https://ctext.org/wiki.pl?chapter=905153&if=gb

Relevant text currently registered as:

> 面之三停者，自發際下至眉間為上停，自眉間下至鼻為中停，自准下人中至頦為下停。

Operational reading used only for the research region map:

```text
上停 = hairline midpoint → brow midline
中停 = brow midline → nose tip / 準頭
下停 = nose tip / 準頭 → chin / 頦·地閣
```

Verification status remains `unverified_ocr` until the NLC scan page itself is checked.

### 2.2 《神相全編》 — 三才三停論

The same electronic witness separately contains:

> 自發際至眉為上停，眉至准頭為中停，准頭至地閣為下停。

This supports the same three-span morphology boundary, but the surrounding passage also contains period-direction wording that is not consistent with other transmitted formulations.

### 2.3 《柳莊相法》 — 永樂百問

Electronic witness:

- Chinese Text Project
- https://ctext.org/wiki.pl?chapter=90958&if=gb

Relevant text:

> 面上三停，髮際到山根為上停，為初限。准頭為中限，人中到地閣為下限……

This is **not normalized into the 神相全編 region map**. The boundary semantics differ and the middle division is not fully operationalizable from the current electronic sentence alone. It therefore remains a separate methodology candidate.

## 3. Why 三停 is methodology-versioned

A single global `ThreeDivisionsMap` would erase source disagreement.

Current authority therefore distinguishes:

```text
method.shenxiang.face_three_divisions@0.1.0
method.liuzhuang.face_three_divisions@0.1.0
```

The first has an executable research region map. The second is preserved as a separate research methodology and is not force-fit into the first coordinate system.

## 4. No invented `平等` threshold

The traditional text uses qualitative terms such as:

- 長
- 短
- 平等
- 相稱

It does **not** provide a numeric tolerance such as ±3%, ±5%, or ±10%.

Therefore FR-2 implements only strict relative order:

```text
upper_longest
middle_longest
lower_longest
upper_middle_tie_longest
upper_lower_tie_longest
middle_lower_tie_longest
all_equal_exact
```

There is currently no `near_equal` class.

Example:

```text
1.00000 / 1.00000 / 1.00000 → all_equal_exact
1.00000 / 1.00001 / 1.00000 → middle_longest
```

`near_equal` requires a separate measurement/calibration authority and must not be smuggled in as traditional doctrine.

## 5. Metric model

Research metric keys:

```text
metric.shenxiang.three_divisions.upper_length@0.1.0
metric.shenxiang.three_divisions.middle_length@0.1.0
metric.shenxiang.three_divisions.lower_length@0.1.0
```

Semantic anchors are used instead of hard-coded extractor landmark indices:

```text
hairline_midpoint
brow_midline
nose_tip
chin_bottom
```

This is deliberate. The current FaceLab repository does not yet expose a production-neutral MyeongHa-compatible anchor contract. MediaPipe/provider-specific indices must not become traditional-method authority.

## 6. F1 rule scope

FR-2 registers research F1 rules for morphology only:

```text
face.three_divisions.upper_longest
face.three_divisions.middle_longest
face.three_divisions.lower_longest
face.three_divisions.exact_equal_measurement
face.three_divisions.no_unique_longest
```

These claims say only what the measured geometry supports. They do not create fortune, personality, morality, health, lifespan, wealth, or career claims.

## 7. F6 conflict gate

The current corpus contains materially different period-direction formulations around 三停.

Examples include:

- `上停長少年忙，中停長福祿昌，下停長老吉祥`
- `上停長老吉昌，中停長近君王，下停長少吉祥`
- 柳莊系統의 `上停 ... 初限` wording

Until scan-level checking and textual-lineage reconciliation are complete, the registry contains:

```text
conflict.three_divisions.period_direction_v0
status = open
affectedTiers = [F6]
```

Any attempt to mark an F6 rule from the affected methodologies as `production_authorized` fails validation even if a passage is later marked `scan_checked`.

This makes source conflict an executable authority constraint rather than a documentation warning.

## 8. Promotion state

Current state:

| Layer | State |
|---|---|
| Source work/witness inventory | research established |
| Electronic passages | `unverified_ocr` |
| 神相全編 region map | `research` |
| Metrics | research contract |
| Relative-order evaluator | executable |
| F1 morphology rules | `research` |
| Near-equal / 平等 threshold | blocked |
| F6 period interpretation | blocked by open conflict |
| Production rules | none |

## 9. Next evidence work

1. Locate exact NLC scan pages for the registered `面三停` and `三才三停論` passages.
2. Mark passage `scan_checked` only after visual page comparison.
3. Compare the same passage across 麻衣相法 / 神相全編 witnesses to identify inheritance vs independent attestation.
4. Resolve whether a stable, source-defensible F6 period mapping exists.
5. Separately calibrate image measurement tolerance for `平等`; calibration evidence must remain distinct from traditional source evidence.
