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

Verification status remains `unverified_ocr` until the 576-page NLC `神相全編` scan page itself is visually checked.

### 2.2 《神相全編》 — 三才三停論

The same electronic witness separately contains:

> 自發際至眉為上停，眉至准頭為中停，准頭至地閣為下停。

This supports the same three-span morphology boundary, but the surrounding passage also contains period-direction wording that is not consistent with other transmitted formulations.

### 2.3 《麻衣相法》 — 1925 NLC 第1卷 scan

Witness:

- 文明書局 民國十四年本
- National Library of China
- 第1卷

The scan was visually checked around PDF pp. 35–36 / printed pp. 31–33.

Registered scan-checked passages:

```text
passage.mayi.sancai_three_divisions.boundaries
passage.mayi.sancai_three_divisions.period
```

The scan confirms the transmitted 三才三停 material and, critically, the period verse:

> 上停長老吉昌，中停長近君王，下停長少吉祥，三停平等富貴榮顯……

These passages are `scan_checked`, not merely electronic transcription candidates.

This matters because the `上停長老吉昌` formulation materially conflicts with another transmitted `神相全編` formulation (`上停長少年忙`). The conflict therefore cannot be dismissed as a trivial OCR error.

The Mayi witness is registered as its own methodology authority:

```text
method.mayi.face_three_divisions@0.1.0
reviewStatus = reviewed
```

`reviewed` here means the cited witness passage has been visually scan-checked. It does **not** mean its traditional claims are scientifically validated or that production fortune interpretation is authorized.

### 2.4 《柳莊相法》 — 永樂百問

Electronic witness:

- Chinese Text Project
- https://ctext.org/wiki.pl?chapter=570484&if=en

The fuller electronic passage states:

> 面上三停，髮際到山根為上停，為初限。山根到准頭，為中停，為中限。人中到地閣，為下停，主末限。

This is operationally different from the `神相全編` face-three-divisions map:

```text
柳莊 上停 = hairline → shangen
柳莊 中停 = shangen → nose tip / 準頭
柳莊 下停 = renzhong → dige
```

FR-2 therefore registers a separate research map:

```text
regionmap.liuzhuang.face_three_divisions@0.1.0
```

It is **not** normalized into the Shenxiang map and is not yet used by executable metrics. The 1925 NLC `柳莊相法` scan metadata is verified, but this exact passage has not yet been visually scan-checked, so the passage and map remain `research` / `unverified_ocr` authority.

## 3. Why 三停 is methodology-versioned

A single global `ThreeDivisionsMap` would erase source disagreement.

Current authority distinguishes:

```text
method.shenxiang.face_three_divisions@0.1.0
method.mayi.face_three_divisions@0.1.0
method.liuzhuang.face_three_divisions@0.1.0
```

Current maps:

```text
regionmap.shenxiang.face_three_divisions@0.1.0
regionmap.liuzhuang.face_three_divisions@0.1.0
```

The Mayi scan is preserved as a checked comparative witness and methodology rather than silently counted as an independent modern coordinate system. No composition policy currently authorizes mixing these maps in one reading.

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

Current executable research metric keys are Shenxiang-specific:

```text
metric.shenxiang.three_divisions.upper_length@0.1.0
metric.shenxiang.three_divisions.middle_length@0.1.0
metric.shenxiang.three_divisions.lower_length@0.1.0
```

Each metric now carries explicit:

```text
methodologyRef
regionMapRef
sourceRefs
reviewStatus
```

Semantic anchors are used instead of hard-coded extractor landmark indices:

```text
hairline_midpoint
brow_midline
nose_tip
chin_bottom
```

This is deliberate. The current FaceLab repository does not yet expose a production-neutral MyeongHa-compatible anchor contract. MediaPipe/provider-specific indices must not become traditional-method authority.

No Liuzhuang metric is executable yet; only its distinct research region map is recorded pending scan checking and measurement review.

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

## 7. Full promotion chain

Authority status cannot be upgraded independently at the last rule layer.

A production rule must have a fully promoted dependency chain:

```text
scan_checked source passages
→ production_authorized methodology
→ production_authorized region map
→ production_authorized metric
→ production_authorized operationalization
→ production_authorized rule
```

A rule depending directly on a methodology still requires that methodology itself to be `production_authorized`.

`reviewed` and `production_authorized` source-backed authority objects require at least `scan_checked` passages. Research objects may cite `unverified_ocr` passages but cannot outrun them into production.

## 8. F6 conflict gate

The current corpus contains materially different period-direction formulations around 三停.

Examples include:

- `神相全編 / 十觀`: `上停長少年忙，中停長福祿昌，下停長老吉祥`
- `神相全編 / 三才三停論`: `上停長老吉昌，中停長近君王，下停長少吉祥`
- `麻衣相法 / 1925 NLC scan`: `上停長老吉昌，中停長近君王，下停長少吉祥`
- `柳莊相法`: `上停 ... 初限`, `中停 ... 中限`, `下停 ... 末限`

The registry therefore contains:

```text
conflict.three_divisions.period_direction_v0
status = open
affectedTiers = [F6]
```

Any attempt to mark an F6 rule from the affected methodologies as `production_authorized` fails validation even when its selected passage has reached `scan_checked` and its methodology status has been promoted.

This makes source conflict an executable authority constraint rather than a documentation warning.

## 9. Promotion state

Current state:

| Layer | State |
|---|---|
| Source work/witness inventory | research established |
| `麻衣相法` 1925 三停 passages | `scan_checked` |
| `麻衣相法` 三停 methodology | `reviewed` |
| `神相全編` electronic passages | `unverified_ocr` |
| `柳莊相法` electronic passage | `unverified_ocr` |
| Shenxiang region map | `research` |
| Liuzhuang region map | `research` |
| Shenxiang metrics | `research` |
| Relative-order evaluator | executable research utility |
| F1 morphology rules | `research` |
| Near-equal / 平等 threshold | blocked |
| F6 period interpretation | blocked by open conflict |
| Production rules | none |

## 10. Next evidence work

1. Locate and visually scan-check the exact NLC `神相全編` pages for `面三停`, `三才三停論`, and the `十觀` variant.
2. Visually scan-check the 1925 NLC `柳莊相法` `永樂百問` 三停 passage.
3. Compare `麻衣相法` and `神相全編` wording at passage level to determine inheritance/compilation relationships rather than counting them as independent corroboration.
4. Resolve whether any stable, source-defensible F6 period mapping exists; until then keep F6 closed.
5. Separately calibrate image measurement tolerance for `平等`; calibration evidence must remain distinct from traditional source evidence.
6. Only after the neutral FaceLab anchor contract exists, bind semantic anchors to extractor-specific landmarks.
