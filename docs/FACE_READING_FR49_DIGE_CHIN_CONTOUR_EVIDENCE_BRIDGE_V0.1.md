# FR-49 — 地閣 / chin-region and soft-tissue Menton / chin-contour evidence bridge

## Status

FR-49 reopens one narrow bridge that FR-46 had left completely blocked: **modern soft-tissue landmark literature explicitly defines soft-tissue Menton from the soft-tissue contour of the chin**. That is enough to support a conceptual point-from-contour relation.

FR-49 also adds a separate traditional/historical lexical layer showing that `地閣` belongs to the chin region. It deliberately does **not** collapse the traditional region into the modern point landmark.

Authority state:

`dige_chin_region_and_menton_contour_relation_supported_exact_equivalence_and_provider_mapping_blocked`

## 1. Traditional source layer

### 1.1 NLC 麻衣相法 witness — lower 三停 terminates at 地閣

FR-33 already pins `witness.mayi_xiangfa.nlc_1925_v1` and preserves two transmitted boundary variants rather than normalizing them.

The scan-checked contiguous-face formula on scan page 36 reads:

- `眉至準頭為中停`
- `準至地閣為下停`

The witness therefore supports **地閣 as the terminal traditional anchor of 下停** for that transmitted formula. The exact witness text is preserved; FR-49 does not silently rewrite `準至地閣` as `準頭至地閣`.

This does not select the contiguous variant over the other FR-33 variant, which separately records `自人中至地閣為下停`.

### 1.2 Traditional face-reading lexical evidence — 頦為地閣

A transmitted `神相全編 / 石室神異賦` text preserved in the `欽定古今圖書集成` records:

`頦為地閣`

Source:

`https://zh.wikisource.org/zh/欽定古今圖書集成/博物彙編/藝術典/第636卷`

The safe claim is **region-level**: traditional `地閣` is associated with `頦`, the chin. The passage does not establish that 地閣 is one modern punctual anatomical landmark.

### 1.3 Independent historical anatomical terminology

`御纂醫宗金鑒 / 正骨心法要旨` records under `地閣骨`:

`地閣骨，即兩牙車相交之骨，又名頦，俗名下巴骨`

Source:

`https://ctext.org/wiki.pl?chapter=882017&if=en`

This independently locates the historical `地閣` terminology in the chin/lower-jaw anatomical region. It is **bony historical anatomy**, not evidence that traditional soft-tissue 地閣 equals modern soft-tissue Menton.

## 2. Modern neutral anatomy / anthropometry layer

### 2.1 2014 three-dimensional facial soft-tissue study

`Three-dimensional evaluation of the relationship between jaw divergence and facial soft tissue dimensions`

- PMID: `24559507`
- Published landmark definition: soft-tissue Menton is the **most inferior midpoint on the soft-tissue contour of the chin**.

### 2.2 2024 3D reference-system validation study

`Validity and Reliability of New Three-Dimensional Reference Systems for Soft Tissue Analysis Using Non-Ionizing Three-Dimensional Imaging`

- DOI: `10.3390/app14125307`
- Published face-scan landmark definition: soft-tissue Menton is the **most inferior midpoint on the soft-tissue contour of the chin**, located at the level of the 3D hard-tissue Menton landmark.

These sources close the narrow conceptual gap that FR-46 described as having no reviewed point-from-contour derivation at all.

## 3. What the evidence now supports

FR-49 supports all of the following:

1. one scan-checked 麻衣相法 三停 transmission terminates 下停 at `地閣`;
2. traditional face-reading text associates `地閣` with `頦` / chin;
3. historical medical terminology independently associates `地閣骨` with `頦` / `下巴骨`;
4. modern soft-tissue literature defines Menton from the **soft-tissue chin contour**;
5. therefore a conceptual relation exists:

   `soft-tissue chin contour -> most inferior midline/midpoint -> soft-tissue Menton`.

This externally grounds the **target class** behind FR-35 `neutral.face.chin_inferior_contour` and supplies a reviewed conceptual point-from-contour definition.

## 4. What the evidence still does not support

FR-49 intentionally keeps all of these false:

- `traditional 地閣 == soft-tissue Menton`;
- `地閣 is a single punctual landmark`;
- `soft-tissue Menton == the whole FR-35 chin_inferior_contour curve`;
- `MediaPipe FACE_OVAL == reviewed soft-tissue chin contour`;
- `MediaPipe landmark 152 == soft-tissue Menton`;
- `FR-45 FACE_OVAL inferior extremum == soft-tissue Menton`;
- any provider mapping;
- any empirical tolerance or calibration threshold;
- selection of one FR-33 三停 source variant;
- traditional semantic projection;
- FR-36 production vertical-reference promotion;
- production 三停, F1, F6, or production geometry.

## 5. Research-only boundary candidate

FR-49 adds one deterministic research operation:

`algorithm.research.dige_lower_boundary.from_independent_soft_tissue_menton.fr49@0.1.0`

Input must already be an FR-46-shaped **provider-blind, frozen independent soft-tissue Menton observation** in normalized 2D image coordinates.

The output is only:

`verticalCoordinateY = annotation.y`

The result is explicitly labelled:

`neutral_research_boundary_candidate_not_traditional_equivalence`

This is not an extraction algorithm. It does not find Menton from MediaPipe or pixels. It only shows that once an independently identified Me′ point exists, its vertical coordinate is a deterministic neutral research candidate for operationalizing the lower boundary associated with the traditional chin-region anchor.

## 6. Updated interpretation of FR-46 blocker

FR-46 correctly blocked these stronger claims:

- provider candidate -> Menton mapping;
- Menton -> traditional 地閣 equivalence;
- point substitution for the whole FR-35 curve.

But its statement that no reviewed point-from-contour relation exists was too broad. FR-49 narrows that blocker:

- **conceptual anatomical point-from-contour definition: supported**;
- **exact FR-35 full-curve geometry: still blocked**;
- **provider curve/point extraction: still blocked**;
- **traditional punctual equivalence: still blocked**.

FR-49 is an overlay authority and does not mutate FR-46 history or retroactively promote FR-35/36.

## 7. Next evidence

The mainline can now continue without waiting for external reviewer signatures. The next useful evidence is:

1. provider-independent geometry for the full `neutral.face.chin_inferior_contour` curve;
2. independent provider-to-Me′ validation only if/when automated extraction needs production authority;
3. a documented operationalization decision for using a punctual neutral boundary inside the broader traditional `地閣` chin region;
4. separate FR-33 variant selection evidence before a complete 三停 metric is promoted.
