# MyeongHa Face Reading Source & Methodology Inventory v0.1

> Status: RESEARCH FOUNDATION — NOT PRODUCTION RULE AUTHORITY  
> Date: 2026-08-27  
> Scope: source witnesses, textual lineage, initial methodology units, implementation promotion gates

## 1. Research verdict

The first source pass supports building the Face Reading Engine around a real traditional system rather than isolated internet face-reading sayings.

The strongest starting corpus is:

1. `《神相全編》` — broad compendium; explicit systems include 三停, 五官, 六府, 五岳, 十二宮, 十三部位, 流年, body/voice/appearance material.
2. `《人倫大統賦》` — older named text preserved inside the `神相全編` tradition; useful for textual lineage and for 五官/六府/五岳 formulations.
3. `《柳莊相法》` — later manual containing 十二宮 and the same broad structural vocabulary; useful as a comparative witness, not automatically independent evidence.
4. `《麻衣相法》` — verified NLC 1925 scan witness exists; exact passages still need page-level extraction before any rule promotion.
5. Livia Kohn (1986), “A Textbook of Physiognomy: The Tradition of the Shenxiang quanbian” — scholarly lineage authority for the textual tradition, not a face-rule source.

## 2. Verified witness metadata

### 2.1 神相全編

- National Library of China scan, `NLC416-13jh001662-59167`
- Publisher: 文明書局
- 1925 (民國十四年)
- 576-page scan on Wikimedia Commons
- Commons catalog explicitly lists: `十三部位總要之圖`, `十二宮五官之圖`, `十二宮訣`, `面三停`, `五官說`, `五嶽`, `六府三才三停圖`, `三才三停論`, and `人倫大統賦`.
- Witness metadata: https://commons.wikimedia.org/wiki/File:NLC416-13jh001662-59167_神相全編.pdf

Electronic transcription used for search only:
- Chinese Text Project: https://ctext.org/wiki.pl?chapter=905153&if=gb

Promotion status: **witness verified; passages not yet scan-checked.**

### 2.2 麻衣相法

- National Library of China scan
- 文明書局, 1925
- `NLC416-12jh002690-44091`, 第1卷, 153 pages
- `NLC416-12jh002690-44092`, 第2卷, 115 pages
- https://commons.wikimedia.org/wiki/File:NLC416-12jh002690-44091_麻衣相法_第1卷.pdf
- https://commons.wikimedia.org/wiki/File:NLC416-12jh002690-44092_麻衣相法_第2卷.pdf

Promotion status: **witness verified; methodology passage extraction pending.**

### 2.3 柳莊相法

- National Library of China 1925 witness exists: `NLC416-13jh001257-42702`
- Catalog includes `命宮 / 財帛宮 / 兄弟宮 / 田宅宮 / 男女宮 / 奴僕宮 / 妻妾宮 / 疾厄宮 / 遷移宮 / 官祿宮 / 福德宮 / 相貌宮`.
- https://commons.wikimedia.org/wiki/File:NLC416-13jh001257-42702_柳莊相法.pdf

Electronic transcription:
- Chinese Text Project: https://ctext.org/wiki.pl?chapter=90958&if=gb

Promotion status: **witness verified; exact palace passages need scan check.**

### 2.4 人倫大統賦

Electronic transcription:
- https://zh.wikisource.org/zh/人倫大統賦/卷上

The `神相全編` NLC catalog explicitly includes `人倫大統賦`, so it must not be counted as a fully independent confirming source when the same passage is encountered inside `神相全編`.

Promotion status: **lineage-relevant; direct independent witness acquisition/scan checking still required.**

### 2.5 Scholarly lineage

Livia Kohn, 1986, “A Textbook of Physiognomy: The Tradition of the Shenxiang quanbian,” *Asian Folklore Studies* 45(2), 227–258. DOI `10.2307/1178619`.

Use: textual-history / source-genealogy support only. Do not use it to create morphology thresholds or consumer diagnoses.

## 3. Source-supported methodology units found in this pass

### 3.1 Three Divisions / 三停

`神相全編` electronic text explicitly defines the face Three Divisions and describes upper / middle / lower length relations and an equal-balance state.

Research implication:

```text
Three-section geometry
→ F1 morphology classification
→ F6 life-phase interpretation
```

But the text gives qualitative categories, not modern landmark thresholds. Therefore:

```text
source statement = acquired
metric operationalization = NOT YET AUTHORIZED
production rule = BLOCKED
```

### 3.2 Five Officers / 五官 and Six Fu / 六府

`人倫大統賦` gives an explicit formulation that 五官 should be clear/upright and 六府 full/substantial. `神相全編` also has dedicated 五官/六府 sections.

Research implication:

- treat 五官 as a structured configuration, not five unrelated internet tips;
- preserve local-feature claims at F2;
- overall “成/不成” configuration belongs at F3 and must consume multiple observations.

### 3.3 Twelve Palaces / 十二宮

`柳莊相法` electronic text contains sequential palace entries. Example: 財帛宮 identifies the nose as the relevant palace and describes morphology such as height, prominence, centrality and nostril exposure.

Research implication:

```text
palace region authority
+ region-local morphology
→ FACE_PALACE_STATUS
```

Critical blocker: exact region geometry cannot be invented from UI convention. A versioned `FaceRegionMapDefinition` must be built from source diagrams / passages before production.

### 3.4 Configuration before simplistic single-feature judgement

`柳莊相法` contains an explicit caution against deciding good/bad from superficial beauty alone and says to inspect further features/configuration.

Engineering implication:

- F2 local readings are allowed and useful;
- F7 whole-domain conclusions must not be generated from a single local claim unless a reviewed methodology explicitly authorizes it;
- Hidden Tension must be a governed F3/F7 claim, never free LLM composition.

## 4. Genealogy decision

Initial lineage register:

```text
神相全編 --quotes/preserves--> 人倫大統賦
柳莊相法 --same-tradition, independence unresolved--> 神相全編
Kohn 1986 --scholarly lineage analysis--> 神相全編 tradition
```

No automatic `number of sources = confidence score` is allowed.

## 5. Implementation promotion gates

No consumer diagnosis rule is production-authorized from this research pass.

To promote a rule:

1. exact witness selected;
2. page/scan location recorded;
3. passage visually checked against scan;
4. traditional term normalized without deleting ambiguity;
5. modern observable input identified;
6. metric formula versioned;
7. classification band reviewed;
8. claim type schema validated;
9. comparison policy checked;
10. deterministic tests added.

## 6. First rule candidates after scan verification

Priority order:

1. `三停` geometry + equal / upper-dominant / middle-dominant / lower-dominant classification.
2. `鼻 / 財帛宮` local morphology — only after reliable nose metrics and palace mapping are pinned.
3. `五官` local feature schemas.
4. `五岳 / 六府` configuration rules.
5. `十二宮` full map.
6. `F3 Hidden Tension` combinations.
7. bounded `F7` career / wealth / relationship / social lenses.

## 7. Deliberately not implemented yet

- 氣色 / dynamic color diagnosis
- medical / lifespan diagnosis
- criminality / protected-trait inference
- full 100-year map
- mole/scar interpretation
- hidden fortune scores
- LLM-generated physiognomy semantics

The product can still render decisive language once a bounded claim is actually resolved. The restriction is on unsupported semantic expansion, not on tone.
