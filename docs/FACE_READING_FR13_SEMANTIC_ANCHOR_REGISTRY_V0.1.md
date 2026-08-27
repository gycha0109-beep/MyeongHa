# MyeongHa Face Reading — FR-13 Semantic Anchor Registry v0.1

Status: **RESEARCH ONLY**

## 1. Purpose

FR-12 established that the Twelve Palaces cannot be rendered as twelve homogeneous points. FR-13 addresses the next dependency: the traditional names used by those locator topologies must be versioned before any CV provider or UI overlay can bind to them.

The core rule is:

```text
traditional term
!= modern anatomical region
!= provider landmark index
!= polygon
```

FR-13 creates a provider-neutral semantic anchor layer between traditional source language and future observation adapters.

## 2. Authority classes

```text
neutral_observation
traditional_named_region
traditional_aggregate
traditional_configuration
legacy_alias
```

### neutral_observation
Examples: left/right eye, left/right brow, generic nose observation region.

These are product-neutral visual concepts. They do not need a classical source passage, but still require a provider contract before a concrete CV implementation is accepted.

### traditional_named_region
Examples: 山根, 印堂, 年壽, 地閣, 中正, 離宮.

These require traditional source refs and remain blocked until operationalization.

### traditional_aggregate
Examples: 天倉 pair, 地庫 aggregate, 邊地 aggregate, 驛馬 aggregate.

These must not be collapsed to one point. `_pair` compatibility names do not prove exact cardinality or geometry.

### traditional_configuration
Examples: 五嶽 configuration, 三停 configuration.

These are whole-face or multi-region structures.

### legacy_alias
Examples inherited from FR-12:

```text
left_tear_trough
right_tear_trough
mouth_shuixing
```

These remain for compatibility only. They cannot be provider-bound.

## 3. Provider binding states

```text
provider_contract_required
blocked_needs_operationalization
blocked_open_conflict
blocked_alias_migration
```

No FR-13 semantic anchor contains MediaPipe/FaceMesh indices, exact coordinates, or polygons.

## 4. 中央十三部位 source anchor

The current `神相全編` electronic witness preserves the central sequence including:

```text
中正
印堂
山根
年上
壽上
準頭
人中
水星
承漿
地閣
```

FR-13 uses this only as a traditional naming/relative-system source. It does not infer modern anatomical coordinates from the sequence.

Current passage status remains `unverified_ocr`.

## 5. 六府 remains an aggregate system

The current `神相全編` electronic witness describes upper/middle/lower 六府 with extended relations such as 輔角→天倉 and lower regions ending at 地閣.

The current `柳莊相法` electronic witness summarizes 六府 as:

```text
天倉 = upper pair
顴骨 = middle pair
地庫 = lower pair
```

This reinforces the FR-12 decision not to model these terms as arbitrary single points.

Both remain electronic-source research passages, not scan-checked authority.

## 6. 淚堂 / 臥蠶 conflict

This is the most important FR-13 source correction.

The 柳莊 Twelve Palace paragraph describes the under-eye children palace with wording that can read as though 淚堂 and 臥蠶 are aliases.

A later detailed 柳莊 passage states instead that the two are materially different and places 淚堂 below 臥蠶.

FR-13 therefore registers:

```text
conflict.liuzhuang.children_palace.leitang_wocan_equivalence_v0
```

Status:

```text
open
```

Consequences:

- do not bind `淚堂` to modern tear trough,
- do not collapse `淚堂` and `臥蠶`,
- do not generate exact provider geometry for 柳莊 男女宮,
- retain source-specific conflict provenance.

Canonical research anchors are introduced separately:

```text
left_leitang_region
right_leitang_region
left_wocan_region
right_wocan_region
```

The old FR-12 keys:

```text
left_tear_trough
right_tear_trough
```

are only `legacy_alias` migration refs pointing toward the 淚堂 research anchors. This pointer is not an equivalence claim with modern tear-trough anatomy.

## 7. 水星 correction

FR-12 used the convenience key:

```text
mouth_shuixing
```

FR-13 replaces the canonical semantic anchor with:

```text
shuixing_region
```

`mouth_shuixing` remains a blocked legacy alias.

This avoids prematurely declaring the traditional 水星 region identical to the whole modern mouth observation region.

## 8. FR-12 compatibility coverage

Every `anchorRef` currently used by FR-12 resolves through the FR-13 registry.

This includes neutral refs such as eyes/brows and traditional/aggregate refs such as:

```text
山根
天倉
地庫
奸門
印堂
年壽
中正
離宮
五嶽 configuration
三停 configuration
```

Resolution does not imply provider binding readiness.

## 9. Readiness projection

`evaluateTwelvePalaceAnchorReadinessFR13()` distinguishes:

```text
binding_candidate
blocked
```

A neutral-observation-only palace topology can become a provider-contract candidate.

A topology containing traditional, conflicting, aggregate, configuration, or legacy alias anchors remains blocked until the corresponding authority is resolved.

`binding_candidate` is not a production fortune claim. It means only that the anchor topology has no unresolved traditional geometry dependency at this layer.

## 10. Version pin

FR-13 adds:

```text
anchors.face.research_fr13@0.1.0
```

and a new research methodology pack:

```text
pack.face.research_v0@0.4.0
```

The new pack explicitly pins:

```text
semanticAnchorRegistryRef = anchors.face.research_fr13@0.1.0
```

Historical packs remain unchanged for audit.

## 11. Tests

FR-13 tests require:

1. full Face authority registry validation,
2. explicit semantic anchor registry version pin,
3. every FR-12 anchorRef resolves,
4. semantic anchor structure contains no provider index/coordinate/polygon binding,
5. neutral observations may be provider-contract candidates,
6. traditional named regions remain operationalization-blocked,
7. tear-trough compatibility aliases remain blocked,
8. 水星 is separated from the `mouth_shuixing` shortcut,
9. 柳莊 淚堂/臥蠶 contradiction remains an open conflict,
10. 柳莊 男女宮 exact binding remains blocked,
11. 相貌宮 configuration anchors remain configurations,
12. missing canonical/required anchors fail closed.

## 12. Still blocked

FR-13 does not authorize:

- exact MediaPipe landmark IDs,
- exact FaceMesh topology bindings,
- arbitrary polygons,
- modern anatomy equivalence for traditional regions,
- production Twelve Palace inference,
- medical inference from 疾厄宮,
- dynamic 氣色,
- automatic 五嶽 classification.

## 13. Next

Recommended next slice:

```text
FR-14 Provider Anchor Binding Contract
```

But FR-14 should bind only the neutral observation anchors first. Traditional anchors must remain blocked until source/operationalization work can justify their exact geometry.

In parallel, direct scan verification should continue for `神相全編` and `柳莊相法` passages so that anchor source authority can eventually move beyond electronic transcription.
