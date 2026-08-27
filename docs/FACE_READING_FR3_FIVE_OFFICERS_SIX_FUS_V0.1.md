# Face Reading FR-3 — 五官 / 六府 v0.1

Status: **research / executable static-support diagnosis / no production 官成 claim**

## 1. Goal

FR-3 turns 五官 and 六府 into separate source-governed methodology units.

```text
traditional source
→ 五官 / 六府 methodology
→ observable criterion or region
→ deterministic static-support claim
→ bounded configuration claim
→ later narrative renderer
```

It deliberately avoids:

- a hidden `五官 score`
- treating every source phrase as a landmark metric
- dropping dynamic appearance conditions merely because the first product version uses a static photo
- merging conflicting 六府 maps into one invented canonical face map

## 2. Source findings

### 2.1 《神相全編》 五官

Current electronic witness:

- Chinese Text Project
- https://ctext.org/wiki.pl?chapter=905153&if=en
- CText work metadata currently says the base edition is unknown, so these passages remain `unverified_ocr` until a scan witness is checked.

The mapping is explicit:

```text
耳 → 採聽官
眉 → 保壽官
眼 → 監察官
鼻 → 審辨官
口 → 出納官
```

The same text then defines `官成` by multiple conditions rather than by one scalar.

Examples used in the research registry:

```text
採聽官: 輪廓完成 / 高聳於眉 / 貼肉敦厚 / 風門寬大 / 色鮮
保壽官: 寬廣清長 / 雙分入鬢 / 首尾豐盈 / 高居額中
監察官: 含藏不露 / 黑白分明 / 瞳子端定 / 光彩射人
審辨官: 梁柱端直 / 印堂平闊 / 山根連印 / 年壽高隆 / 準圓庫起 / 色鮮黃明
出納官: 方大 / 端厚 / 角弓 / 開大合小 / 唇紅
```

A later `古今圖書集成` compilation also preserves the five-officer mapping. It is useful for transmission checking, not automatically independent rule evidence.

## 3. Observation classes

FR-3 classifies each traditional condition by what a vision system can actually observe.

```text
static_geometry
multi_view_static
capture_sensitive
dynamic_appearance
```

Examples:

| source concept | class | current handling |
|---|---|---|
| 鼻 梁柱端直 | static_geometry | research candidate |
| 鼻 準圓庫起 | static_geometry | research candidate |
| 耳 貼肉敦厚 | multi_view_static | blocked in frontal-only v1 |
| 眼 瞳子端定 | capture_sensitive | blocked until gaze capture contract |
| 口 開大合小 | capture_sensitive | blocked until expression contract |
| 耳 色鮮 | dynamic_appearance | static v1 blocked |
| 眼 光彩射人 | dynamic_appearance | static v1 blocked |
| 鼻 色鮮黃明 | dynamic_appearance | static v1 blocked |
| 口 唇紅 | dynamic_appearance | static v1 blocked |

This preserves source meaning instead of silently redefining `官成` as “whatever FaceLab can measure today”.

## 4. Executable diagnosis

`evaluateFiveOfficerStaticSupport()` evaluates only criteria explicitly admitted to static v1.

Output:

```text
complete
contradicted
insufficient
```

Rules:

- every eligible static criterion `met` → `complete`
- any eligible static criterion `not_met` → `contradicted`
- missing/unavailable eligible criterion and no explicit failure → `insufficient`
- missing observation is never negative evidence

It simultaneously returns:

```text
traditionalFormationState = not_authorized
```

when traditional `官成` still depends on blocked dynamic/capture/multi-view criteria.

This is not timid wording. It means the engine can state the static diagnosis decisively while keeping a different claim — full traditional formation — behind its own authority gate.

## 5. F2 / F3 claim behavior

`buildFiveOfficerResearchClaims()` emits:

```text
F2 = individual admitted static criterion result
F3 = officer-level static support configuration
```

Example semantic output:

```text
face.five_officers.discernment.bridge_straight.met
face.five_officers.discernment.tip_round_full.met
face.five_officers.discernment.static_support_complete
```

It does not emit:

```text
face.five_officers.discernment.formed
```

until a reviewed formation policy can account for the complete source condition set.

## 6. Consumer tone

The semantic caution above does **not** require vague consumer copy.

Resolved static result examples:

```text
complete
→ "코의 정적 조건은 審辨官 쪽이 선명합니다."

contradicted
→ "審辨官의 핵심 정적 조건이 여기서 분명히 꺾입니다."

insufficient
→ "코끝 관측이 부족해 審辨官 정적 판독은 여기서 멈춥니다."
```

The renderer should avoid `아마`, `그럴 수도`, `조금 그런 편` when the semantic state itself is resolved.

The renderer still may not jump from static support to guaranteed career, wealth, health, morality, intelligence, or lifespan facts.

## 7. 六府 source conflict

### 7.1 《神相全編》 electronic witness

Current passage:

```text
天庭日月二角為天府
兩顴為人府
地角邊腮為末景地府
```

Research map:

```text
upper pair  = 天府  = 天庭 + 日月二角 system
middle pair = 人府  = 兩顴
lower pair  = 地府  = 地角 + 邊腮 system
```

### 7.2 《柳莊相法》 electronic witness

Current passage:

```text
天倉為上二府
顴骨為中二府
地庫為下二府
```

Research map:

```text
upper pair  = 天倉
middle pair = 顴骨
lower pair  = 地庫
```

These are not silently normalized together.

FR-3 registers:

```text
conflict.six_fus.region_mapping_v0
status = open
affected tiers = F2 / F3 / F7
```

Production rules using either affected methodology remain blocked until source lineage and exact region semantics are reviewed.

## 8. Additional Five-Officer textual variance

The current 《神相全編》 electronic witness labels the nose as `審辨官`.

The current 《柳莊相法》 CText transcription displays `審判官` in the five-officer list.

FR-3 does not silently correct one into the other before scan comparison.

```text
conflict.five_officers.nose_title_variant_v0
```

records the unresolved variant.

## 9. FaceLab integration

FR-3 does not import a beauty/style classifier as physiognomy evidence.

Future integration is:

```text
FaceLab neutral observation contract
→ source-neutral geometry / visibility / pose observations
→ MyeongHa criterion operationalizer
→ 五官 criterion states
→ FR-3 deterministic synthesis
```

Examples of useful future FaceLab capabilities:

```text
nose bridge centerline/deviation
nose-tip contour metrics
brow endpoint and temple relation
ear visibility + upper-point relation to brow
mouth width / lip thickness under neutral expression
occlusion and view-quality state
```

FaceLab must not output `採聽官`, `審辨官`, `吉`, `凶`, wealth/career claims, or any physiognomy semantic label. Those belong exclusively to the Face Reading Engine.

## 10. Fun/product modules unlocked by this structure

Without inventing scores, the product can later show:

```text
五官 판독 카드 5장
- 採聽官 / 保壽官 / 監察官 / 審辨官 / 出納官
- 정적 조건: 선명 / 꺾임 / 관측부족
- 어떤 얼굴 부위가 근거인지 highlight
- source methodology label

六府 face overlay
- 선택된 methodology pack의 upper/middle/lower pair만 표시
- 다른 전승을 동시에 섞지 않음
```

A future “가장 선명한 官” comparison requires a separate comparability policy. Raw counts of matched criteria must not be presented as a hidden fortune score because each 官 has a different condition set.

## 11. Promotion state

| Layer | State |
|---|---|
| 五官 mapping | research established |
| 五官 electronic passages | `unverified_ocr` |
| 五官 criterion taxonomy | executable research |
| static-support evaluator | executable research |
| F2 local claim generation | executable research |
| F3 static configuration claim | executable research |
| traditional 官成 | blocked |
| 神相六府 region map | research |
| 柳莊六府 region map | research |
| 六府 cross-method merge | blocked by open conflict |
| production FR-3 rules | none |

## 12. Next

1. Scan-check exact NLC pages for 《神相全編》 五官/六府.
2. Scan-check 《柳莊相法》 五官/六府 and the `審判官`/`審辨官` variant.
3. Compare 《麻衣相法》 六府 transmission without counting copied lineage as independent evidence.
4. Define the first source-neutral FaceLab geometry capability contract.
5. Operationalize only geometry concepts that can be calibrated reproducibly.
6. Add discriminating-pair fixtures for nose/brow/ear/mouth geometry.
