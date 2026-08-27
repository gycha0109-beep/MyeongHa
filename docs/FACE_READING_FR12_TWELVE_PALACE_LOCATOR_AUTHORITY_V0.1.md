# MyeongHa Face Reading — FR-12 Twelve Palace Locator Authority v0.1

Status: **RESEARCH ONLY**

## 1. Purpose

FR-12 replaces the old single `method.twelve_palaces.research_v0` placeholder with source-specific Twelve Palace locator authorities.

The objective is not to authorize Twelve Palace fortune claims yet. The objective is to answer a narrower question correctly:

> When a traditional text names a palace, what facial location or configuration does that witness actually point to?

The result can later drive an interactive Face Map without inventing twelve arbitrary dots.

## 2. Authority split

Two research methodologies are introduced:

```text
method.shenxiang.twelve_palaces@0.1.0
method.liuzhuang.twelve_palaces@0.1.0
```

They remain separate even when many palace names overlap.

Current source state:

```text
CText electronic transcription
→ locator passage extracted
→ unverified_ocr
→ research methodology only
```

No Twelve Palace locator in FR-12 is `scan_checked` or production-authorized.

## 3. Why Twelve Palaces are not twelve points

The source descriptions do not define twelve homogeneous point locations.

FR-12 therefore defines these locator kinds:

```text
local
paired
distributed
composite
global_configuration
```

Examples from the current research inventory:

| Palace | 神相系 locator | 柳莊系 locator |
|---|---|---|
| 命宮 | local: between brows / above 山根 | local: same broad locus |
| 財帛宮 | composite: 鼻 + 天倉/地庫/金甲櫃/井灶 | local: 鼻-centered passage currently verified only at transcription level |
| 兄弟宮 | paired brows | paired brows |
| 田宅宮 | paired eyes | paired eyes |
| 男女宮 | paired under-eye 淚堂/臥蠶 | paired under-eye 淚堂/臥蠶 |
| 奴僕宮 | composite 地閣 + 水星 | composite 地閣 + 水星 |
| 妻妾宮 | paired 魚尾/奸門 | paired 魚尾/奸門 |
| 疾厄宮 | local 印堂下/山根/年壽 | local 年壽/山根 |
| 遷移宮 | distributed 眉角/天倉 + 邊地/驛馬/山林/髮際 | paired 眉尾/天倉 in current locator passage |
| 官祿宮 | local span 中正→離宮 | local span 中正→離宮 |
| 福德宮 | distributed 天倉→地閣/地庫 | distributed 天倉→地閣 |
| 相貌宮 | global 五嶽 + 三停 configuration | global 五嶽 + 三停 configuration |

The table is a research projection of the cited electronic passages, not a modern anatomical truth claim.

## 4. Source-specific differences are material

FR-12 deliberately preserves differences between witnesses.

### 4.1 財帛宮

The current 神相全編 electronic passage includes a broader `財帛宮論` that names 鼻 together with 天倉, 地庫, 金甲櫃, 井, 灶.

The current 柳莊相法 locator passage directly identifies 鼻 as 財星/財帛宮, while broader warehouse references still require passage-level source expansion.

Therefore:

```text
shenxiang.wealth.kind = composite
liuzhuang.wealth.kind = local
```

This is not normalized away.

### 4.2 遷移宮

The current 神相全編 passage extends the palace from 眉角/天倉 into 邊地, 驛馬, 山林, 髮際.

The current 柳莊相法 locator sentence identifies 眉尾/天倉.

Therefore:

```text
shenxiang.migration.kind = distributed
liuzhuang.migration.kind = paired
```

A future direct scan or additional passage may expand the 柳莊 definition, but FR-12 does not infer that expansion now.

## 5. 相貌宮 cannot be rendered as a pin

Both current traditions describe 相貌宮 as a total configuration that first examines 五嶽 and then 三停.

FR-12 therefore requires:

```text
appearance.locator.kind = global_configuration
requiresConfigurationRefs = [five_yue, three_divisions]
interactionMode = whole_face_configuration
```

UI consequence:

- do not display 相貌宮 as a dot,
- highlight whole-face configuration,
- later resolve 五嶽 and 三停 submodules separately.

## 6. 疾厄宮 safety boundary

Traditional source terminology is preserved:

```text
疾厄宮
```

Its historical locator can be shown and researched.

It must not become a modern health inference engine.

Every FR-12 疾厄宮 definition blocks:

```text
medical_diagnosis
disease_prediction
health_status_inference
```

Therefore permitted:

```text
"전통 十二宮에서 이 부위를 疾厄宮이라 부릅니다."
```

Not permitted:

```text
"이 부위가 어두우므로 실제 질환이 있습니다."
"이 얼굴 구조 때문에 특정 질병에 걸립니다."
```

The traditional palace name is not medical evidence.

## 7. Region-map authority

FR-12 creates two research region maps:

```text
regionmap.shenxiang.twelve_palaces@0.1.0
regionmap.liuzhuang.twelve_palaces@0.1.0
```

Their `geometryDefinition` stores source-derived topology only:

```text
locatorKind
anchorRefs
relation
requiresConfigurationRefs?
```

It does **not** contain invented polygon coordinates.

Exact landmark polygons remain blocked until an operationalization/calibration authority is built.

## 8. Interactive projection

`projectTwelvePalaceResearchMapV0()` returns twelve ordered research items with interaction modes:

```text
local                → region
paired               → paired_regions
distributed          → distributed_regions
composite            → composite_highlight
global_configuration → whole_face_configuration
```

The projection contains topology and source refs only.

It does not emit fortune claims.

## 9. Pack migration

Historical research pack `0.2.0` remains preserved for audit.

FR-12 adds:

```text
pack.face.research_v0@0.3.0
```

The new pack removes the old placeholder methodology from its own method list and adds the two source-specific methodologies plus two region maps.

The old registry record is not rewritten or deleted.

## 10. Tests

FR-12 tests require:

1. full authority registry validation,
2. exactly 12 palaces per tradition,
3. separate methodology refs,
4. all five locator topology kinds represented in 神相系,
5. source-specific 財帛/遷移 differences preserved,
6. 相貌宮 remains global configuration,
7. 疾厄宮 medical inference blocks remain present,
8. projection remains `research_only`,
9. all current locator passages remain `unverified_ocr`,
10. FR-12 pack excludes the historical placeholder methodology,
11. missing-palace and removed-medical-block negative tests fail closed.

## 11. Current source findings

### 神相全編 electronic witness

The current CText transcription places the Twelve Palace section at `十二宮相論` and explicitly provides location language for all twelve palaces. The research inventory extracts only the location-bearing portions needed by FR-12.

### 柳莊相法 electronic witness

The current CText transcription places the section under `七十三、十二宮` and similarly provides the twelve named palaces and location language.

### 人相全編 lineage candidate

`新刻統會諸家風鑑全像人相全編` contains a highly similar 十二宮 sequence and wording. This is useful lineage evidence, but FR-12 does not count it as an independent second authority until textual genealogy is studied.

## 12. Still blocked

FR-12 does not authorize:

- production Twelve Palace claims,
- strongest/weakest palace ranking,
- medical inference from 疾厄宮,
- dynamic 氣色 interpretation,
- arbitrary polygon generation,
- cross-tradition locator merging,
- full 五嶽 implementation,
- automatic image → palace criterion classification.

## 13. Next

Recommended continuation:

```text
FR-13A direct scan verification for 十二宮 passages
FR-13B semantic anchor registry for 十二宮
FR-13C 五嶽 source/region authority
FR-13D research Face Map UI fixture
```

The preferred next technical slice is **semantic anchor registry**, because current locators correctly state `山根`, `天倉`, `奸門`, `地閣`, etc., but those names still need provider-neutral anatomical/landmark bindings before any image overlay can be trusted.
