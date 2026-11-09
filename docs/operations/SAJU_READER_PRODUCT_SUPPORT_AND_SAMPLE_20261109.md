# Saju Reader Product Support and Preview Sample — 2026-11-09

## Decision basis

This snapshot follows current `main` (`c29bc25`, 2026-11-09), current Saju `main` (`4feb7531`), and the user's supplied final-approved catalog dated 2026-11-06. That approval is the current catalog baseline for this work. It supersedes the older one-product/price description in `STANDARD_LOVE_RELATIONSHIP_PRODUCT_V1.md` and `P0_DECISION_REGISTER.md` (`P0-CM-03`); those older records must be reconciled before any executable Offer or Charge Terms are made. This does not revive the historical standalone `saju.general_natal.deep.v1` product.

The approved catalog has six single products, one relationship-comparison product, and five packages:

| Approved product | Composition / scope | Approved price |
|---|---|---:|
| 직업·커리어운 | Career / natal | KRW 9,900 |
| 사업운 | Business / natal | KRW 9,900 |
| 재물운 | Wealth / natal | KRW 9,900 |
| 나의 인연·관계운 | Relationship / natal / general | KRW 9,900 |
| 올해의 사주 | Current-year reading | KRW 7,900 |
| 이번 달의 사주 | Current-month reading | KRW 4,900 |
| 첫 번째 상대방과 관계 비교 | Two-person relationship comparison | KRW 12,900 |
| 두 번째 이후 상대방 1명당 | Additional person for relationship comparison | KRW 9,900 |
| 나의 인연·관계운 + 첫 관계 비교 | Relationship / natal / general + first comparison | KRW 19,900 |
| 커리어·경제 패키지 | Career + business + wealth | KRW 24,900 |
| 전체 사주 기본 | Career + business + wealth + relationship | KRW 29,900 |
| 전체 사주 기본 + 올해 | Basic package + current-year reading | KRW 35,800 |
| 전체 사주 기본 + 이번 달 | Basic package + current-month reading | KRW 33,800 |
| 전체 사주 기본 + 올해 + 이번 달 | Basic package + current-year + current-month readings | KRW 39,700 |

“전체 사주 기본” is an approved package of four named readings, not a separate standalone full-saju SKU. Relationship comparison and additional-person pricing are approved catalog items, but the engine must support the corresponding two-person source handling before those items can be fulfilled.

`commerce-saju-upgrade-pricing-v1.ts` is explicitly a non-saleable quote calculator, not the approved catalog or purchase authority. Its 13 keys do not match the approved list one-to-one: it includes `standard.family`, `standard.spouse`, `standard.compatibility`, `standard.current_concern`, and `bundle.love_relationship`, which are not in the supplied approval; its `bundle.full_saju` composition is career + wealth + business + relationship + family + spouse, unlike the approved four-field “전체 사주 기본”; and its `standard.love_relationship` KRW 9,900 value happens to match the approved single-product price but does not authorize sale. The older written KRW 8,900 decision is stale against the 2026-11-06 approval. No executable offer, live checkout, or payment authority is inferred from the screenshot or quote module.

## Approved catalog versus Saju Reading support

“Preview supported” means the current Preview host can return an engine-calculated Preview for that intent. It does not establish production-authorized interpretation, exact catalog fulfillment, Reader delivery, or public sale. Package scope is supported only when each component is supported; adjacent previews must not be merged into an invented interpretation.

| Approved product / package | Engine intent correspondence | Current engine evidence | Reading support today |
|---|---|---|---|
| 직업·커리어운 | career / natal | Preview supported | Partial: calculation Preview exists; Production interpretation and paid delivery blocked |
| 사업운 | business / natal | Preview supported | Partial: calculation Preview exists; Production interpretation and paid delivery blocked |
| 재물운 | wealth / natal | Preview supported | Partial: calculation Preview exists; Production interpretation and paid delivery blocked |
| 나의 인연·관계운 | relationship / natal / general | Preview supported; exact intent matches the older relationship Product spec | Partial: calculation Preview exists; Production interpretation and paid delivery blocked |
| 올해의 사주 | Current-year reading | Annual Preview unsupported | Insufficient; no current engine interpretation support established |
| 이번 달의 사주 | Current-month reading | Monthly Preview unsupported | Insufficient; no current engine interpretation support established |
| 첫 번째 상대방과 관계 비교 | Two-person compatibility / relationship comparison | Preview unsupported; no authorized second-birth reading route | Insufficient |
| 두 번째 이후 상대방 1명당 | Additional two-person comparison | Preview unsupported; no authorized second-birth reading route | Insufficient |
| 나의 인연·관계운 + 첫 관계 비교 | Relationship general + two-person comparison | One-person relationship Preview only; comparison unsupported | Partial; package as a whole unsupported |
| 커리어·경제 패키지 | Career + business + wealth | All three have Preview output | Partial; no production package reading authority |
| 전체 사주 기본 | Career + business + wealth + relationship | All four have Preview output | Partial; no production package reading authority |
| 전체 사주 기본 + 올해 | Basic four + annual | Basic components Preview; annual unsupported | Partial; package incomplete |
| 전체 사주 기본 + 이번 달 | Basic four + monthly | Basic components Preview; monthly unsupported | Partial; package incomplete |
| 전체 사주 기본 + 올해 + 이번 달 | Basic four + annual + monthly | Basic components Preview; annual/monthly unsupported | Partial; package incomplete |

The Saju production interpretation audit on current Saju `main` still reports no real production-authorized interpretation registry. Thus **none of these catalog entries is ready for Production paid delivery today**, even where Preview works. Do not fill unsupported scopes with generic advice, by combining adjacent domains as if they were one official interpretation, or by asking the Reader model to invent the missing result.

## One calculated Preview used for quality review

This is a synthetic, non-user input used only to inspect the existing Preview path:

```text
Solar date/time: 1992-07-14 15:20
Engine response state: delivered (Preview)
Calculation state: partially_ambiguous
Year pillar: 壬申
Month pillar: 丁未
Day pillar: 辛卯
Hour pillar: 丙申
Intent: 연애운 → relationship / natal / general
```

The engine returned these relationship meanings:

- Closeness is more comfortable when each person retains room to choose; excessive interference may lead to distance.
- The subject may need conversation and time to understand the other person before opening up.
- Expressing thoughts and feelings through words or actions matters.
- Clear promises, responsibility, and observable effort support trust.
- Tension can arise between personal choice and shared time, money, or energy; another tension can arise between solving a conflict quickly and first understanding it fully.
- This response does not establish relationship-event timing, scores, grades, or conclusions outside its stated scope.

### Reader delivery draft

> 먼저 관계에서 중요하게 읽히는 점부터 말씀드릴게요. 가까워져도 각자의 선택권이 남아 있고, 필요할 때 나란히 움직일 수 있는 관계가 편한 쪽입니다. 간섭받는 느낌이 커지면 가까운 사이에서도 거리를 두고 싶어질 수 있어요.
>
> 마음을 여는 속도도 살펴볼 부분입니다. 처음부터 서두르기보다 대화로 상대를 이해하고 신뢰를 확인할 시간이 있어야 편합니다. 생각과 감정을 말이나 행동으로 표현할 통로가 있는지도 중요하고요.
>
> 관계의 신뢰는 좋은 마음만으로 확인되기보다 약속을 지키고 서로 실제로 시간과 노력을 나누는 데서 생깁니다. 다만 내 선택과 함께 써야 하는 시간·돈·에너지가 부딪히거나, 갈등을 빨리 정리하려는 마음과 충분히 이해하고 싶은 마음이 엇갈릴 때는 답답함이 커질 수 있습니다. 무엇을 각자 결정하고 무엇을 함께 정할지 나누고, 이해할 시간과 결정할 시간을 구분하는 식으로 다뤄볼 수 있겠습니다.
>
> 이번 Preview 결과에는 관계가 바뀌는 구체적인 시기가 들어 있지 않습니다. 그래서 시기를 덧붙여 단정하지 않겠습니다.

This draft is a single-pass paraphrase of the returned Preview meanings. It adds no compatibility judgment, partner identity, event prediction, timing, or score. It is **not** a production reading, a real person's chart, or evidence that a paid Product is complete.

### Separate quality findings

**Delivery quality:** the Preview meanings can be presented as a direct Reader conversation, beginning with a conclusion and then connecting relationship patterns, friction, and an explicit timing boundary. The current Preview itself still renders as report sections rather than a Reader's scene-by-scene talk.

**Saju grounding quality:** the response exposed the four calculated pillars and the overall `partially_ambiguous` state, but did not expose a positive-validated semantic unit/source map tying each relationship conclusion to the specific chart evidence, conditions, and source interpretation. The response also did not explain the ambiguity. Therefore this sample proves a real calculation and Preview delivery, but it cannot pass the requested production-quality Saju accuracy audit. No pillar-to-relationship rationale or timing was invented to mask that gap.

## Existing implementation handoff

The intended existing flow is:

```text
authenticated subject + exact Saju Record/Birth revision
→ current exact Record-scoped purchase Grant
→ Saju-owned Product Reading for the Product's explicit intent
→ source-approved positive ProductReadingResponse validation
→ immutable owner-scoped Reading
→ selected Reader candidate generated once from admitted semantic units
→ independent meaning/output review
→ protected delivery to the same subject and Reader thread
→ each follow-up rechecks the same active Grant and anchors to the last committed, reviewed Reading unit
```

Existing MyeongHa work to reuse:

- #3090 adds Record-scoped Saju purchase rights and original-purchase admission; its PR explicitly leaves Offers, public checkout, and live payment disabled.
- #3131 adds private, shadow-only consultation generation and two-Reader evaluation; the PR states it has not validated a real user's chart or live model quality and does not expose a customer response.
- `character-standard-reading-chat-bounded-candidate-v1.ts` and `character-standard-reading-chat-followup-evidence-v1.ts` already bind candidate/follow-up work to the exact subject, thread, Reader, Reading hash, grounding hash, and selected source units.
- `official-reader-paid-chat-message-http-v1.ts` is a separate owner-scoped paid reread endpoint and remains hard-off in its production adapter.
- `AI_CHARACTER_RUNTIME_SPEC.md` blocks real Saju semantic promotion until `SRC-33` supplies the source-approved positive response validator. The current Saju decision `P0-SA-01` authorizes the authenticated calculation endpoint only; it does not authorize `/api/readings` production activation.

The existing candidate flow must remain private until these conditions are met. Passing a chart response through a TypeScript interface or storing its JSON is not the missing semantic validation. A model may compose the Reader's first Korean reading once from approved units; a second model must not rewrite a completed Saju script. The official Saju result remains the sole source of claims and timing.

## Current PR, CI, and runtime snapshot

- MyeongHa `main`: `c29bc25` (`2026-11-09`).
- #3090: open and unmerged at `29c7c1f`; latest observed PR CI run `42494306304` is **failure** (`Work Track · commerce` and `DB dependency · postgres17` failed). Other reported gates in that run succeeded. The PR body requires full CI and PG17 success before merge.
- #3131: open and unmerged at `3d0159f`; latest observed PR workflows reported CI, Web PR Domain Gates, Reader Grounding Cross-Service E2E, and Governance **success**. Its cross-service Reading and model responses are synthetic/stubbed per the PR description.
- Current MyeongHa Worker `myeongha` has a 100% deployment from 2026-11-08. This confirms a running application version, not Production Saju Reading authority, paid fulfillment, or Saju route activation.
- Current Saju `main` (`4feb7531`) still records Production interpretation authority and public Production Reading runtime as blocked.

## Remaining gates before this becomes a customer product

1. Saju source owner supplies a source-approved positive `ProductReadingResponse` validator and semantic-unit/source map; explain the sample's ambiguity and relationship claim grounds without promoting research material.
2. A supported intent has a real production-authorized interpretation pack, including admitted conditions and actual timing where the product promises it.
3. Continue and land the existing Record-scope and Reader shadow tracks; resolve #3090's red CI first. Validate the full reading with actual, non-stub model output separately for Saju correctness and Reader delivery quality.
4. Bind exact current Grant, official Reading, selected Reader, and follow-up continuity in an owner-scoped end-to-end path. Keep public paid reading and AI output closed until the applicable source, privacy, AI, commerce, and operations gates are met.

No database migration, entitlement permission change, checkout activation, model-provider call, production deployment, or public-release switch was performed by this work.
