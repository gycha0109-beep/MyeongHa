# FACE READING FR-33 — 麻衣相法 三停 Boundary Variant Authority v0.1

> Status: **CLOSED for source-variant preservation / OPEN for variant selection and production operationalization**  
> Scope: `method.mayi.face_three_divisions@0.1.0` only  
> Witness: `witness.mayi_xiangfa.nlc_1925_v1`  
> Production effect: **none — fail closed**

## 1. Why FR-33 exists

The 1925 NLC scan of `《麻衣相法》` does not support treating 三停 as one silently normalized coordinate map.

The existing research seed passage:

`passage.mayi.sancai_three_divisions.boundaries`

was intentionally an ellipsized composite used to record that the printed witness had been scan-checked. That composite is sufficient as research provenance, but it is **not sufficient to authorize a production region map** because it compresses multiple printed clauses and hides a material boundary distinction.

FR-33 therefore preserves the boundary clauses separately and makes the unresolved selection state executable.

## 2. Exact scan-checked clauses preserved by FR-33

### Variant A — `mayi_sancai_noncontiguous`

Scan page 35:

- upper: `三停者髮際至印堂為上停`
- middle: `自山根至準頭為中停`
- lower: `自人中至地閣為下停`

Traditional boundary spans:

- 髮際 → 印堂
- 山根 → 準頭
- 人中 → 地閣

This is preserved as `non_contiguous_source_formula`. FR-33 does **not** fill the intervals 印堂→山根 or 準頭→人中 by invention.

### Variant B — `mayi_face_contiguous`

Scan pages 35–36:

- upper: `自髮際至眉為上停`
- middle: `眉至準頭為中停`
- lower: `準至地閣為下停`

Traditional boundary spans:

- 髮際 → 眉
- 眉 → 準頭
- 準 → 地閣

This is preserved separately as `contiguous_face_formula`.

## 3. Authority decision

FR-33 makes **no choice** between Variant A and Variant B.

The current selection contract is:

- `status = unresolved`
- `selectedVariantId = null`
- production region map = blocked
- production metric = blocked
- F1 morphology production = blocked
- F6 period interpretation production = blocked

This is deliberate. A later review may establish whether the two formulations are contextual alternatives, a transmitted gloss plus a face-map formulation, or another source relationship. Until that review exists, selecting one in code would create Pack-authored traditional authority.

## 4. Legacy composite boundary

`passage.mayi.sancai_three_divisions.boundaries` remains part of the older research pack as provenance, but FR-33 sets:

`legacyCompositeOperationalizationAllowed = false`

No region map, metric, threshold, or claim may cite the ellipsized composite as though it were a single complete geometric definition.

## 5. No cross-method normalization

FR-33 explicitly forbids silently replacing Mayi anchors with another methodology's boundaries.

Examples of forbidden shortcuts include:

- replacing 印堂 with 眉 because the Shenxiang face map uses a brow boundary;
- replacing 山根 with 眉 or 印堂 to force contiguous spans;
- replacing 人中 with 準頭 to force a single universal lower division;
- treating 柳莊相法 `髮際→山根 / 山根→準頭 / 人中→地閣` as the Mayi map;
- collapsing `地閣` into a provider-specific chin landmark without a reviewed neutral-anchor derivation.

Methodology boundaries remain methodology-owned and versioned.

## 6. Observation boundary

FR-33 is source authority, not provider authority.

It does not authorize provider landmark indices for:

- hairline / 髮際
- brow / 眉
- 印堂
- 山根
- 準頭
- 人中
- 地閣

`neutralAnchorOperationalizationReady = false` and `providerLandmarkIndexAuthorityAllowed = false` remain mandatory.

The next implementation slice must define neutral observable anchor contracts without using MediaPipe indices as semantic authority and without collapsing traditional anchor differences.

## 7. Calibration boundary

The scan-checked period verse contains `三停平等`, but the source does not provide a modern numeric tolerance.

Therefore:

- `nearEqualTolerance = null`
- `nearEqualClassificationAllowed = false`

The existing strict-relative-order research helper may continue to distinguish exact numeric order for research morphology, but a production `平等` band requires FR-5-class calibration evidence.

## 8. F6 boundary

FR-33 independently blocks F6 while the Mayi boundary variant is unresolved. The existing cross-method conflict:

`conflict.three_divisions.period_direction_v0`

also remains open. FR-33 does not resolve that conflict.

## 9. Implemented artifacts

- `packages/face-reading/src/mayi-three-divisions-boundary-variants-fr33.ts`
- `test/face-reading-fr33-mayi-three-divisions-boundary-variants.test.ts`
- export through `packages/face-reading/src/index.ts`

The validator fails closed on:

- clause text drift;
- scan-page/provenance drift;
- traditional-anchor normalization;
- silent variant selection;
- legacy composite promotion;
- invented near-equal tolerance;
- provider-index promotion;
- cross-method boundary normalization.

## 10. FR-33 conclusion

FR-33 closes one source-governance gap:

> the 1925 Mayi witness contains multiple scan-checked 三停 boundary formulations, and MyeongHa now preserves those formulations separately instead of pretending they are one universal face map.

It does **not** make Mayi 三停 production-ready.
