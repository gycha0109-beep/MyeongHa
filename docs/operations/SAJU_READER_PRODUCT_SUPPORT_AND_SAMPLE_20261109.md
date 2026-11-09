# Saju Reader Product Support and Preview Sample — 2026-11-09

## Decision basis

This snapshot follows current `main` (`c29bc25`, 2026-11-09) and the current Saju `main` (`4feb7531`). It does not revive the historical `saju.general_natal.deep.v1` candidate or create, price, or activate a product.

The only currently specified paid Saju Product is `standard.love_relationship`: relationship / natal / general, with a required Reader selection and the Reader kept separate from the official Reading identity. Its list price is KRW 8,900, but the Product is disabled, no executable Offer or Charge Terms exist, and Saju Production interpretation and paid fulfillment remain blocked. The source is `STANDARD_LOVE_RELATIONSHIP_PRODUCT_V1.md` and `P0_DECISION_REGISTER.md` (`P0-CM-03`).

`commerce-saju-upgrade-pricing-v1.ts` contains a non-saleable quote calculator with 13 product keys and candidate prices. That file explicitly grants no checkout or purchase authority. Its `standard.love_relationship` value of KRW 9,900 conflicts with the approved KRW 8,900 product decision; neither that value nor the other quote values are executable price authority. No price or package changes are made here.

## Existing SKU fields versus Saju Reading support

“Preview supported” means the current Preview host can return a real engine-calculated Preview for the intent. It does not mean Production authority, paid Product support, Reader delivery, or a public sale is available.

| Existing quote key / field | Engine intent correspondence | Current engine evidence | Product / paid state |
|---|---|---|---|
| `standard.career` / `career` | career / natal | Preview supported | No current paid Product authority; Production blocked |
| `standard.wealth` / `wealth` | wealth / natal | Preview supported | No current paid Product authority; Production blocked |
| `standard.business` / `business` | business / natal | Preview supported | No current paid Product authority; Production blocked |
| `standard.love_relationship` / `relationship` | relationship / natal / general | Preview supported; exact intent matches the current Product spec | Product defined, but disabled; sale and Production Reading blocked |
| `standard.family` / `family` | family / natal | Preview unsupported | Product/paid support not established |
| `standard.spouse` / `spouse` | relationship / natal / spouse | Partial Preview only: bounded spouse-palace position statement; not an Official Reading interpretation | Not equivalent to a spouse-character or spouse-fortune reading; Production blocked |
| `standard.year` / `year` | No approved one-to-one period intent from this field alone | Annual Preview unsupported | Product semantics and paid support not established |
| `standard.month` / `month` | No approved one-to-one period intent from this field alone | Monthly Preview unsupported | Product semantics and paid support not established |
| `standard.compatibility` / `compatibility` | compatibility / natal would require two-person source handling | Preview unsupported; current calculation-only service decision does not authorize a second-Birth reading route | Product/paid support not established |
| `standard.current_concern` / `current_concern` | question-specific / natal would require a validated question contract | Preview unsupported | Product/paid support not established |
| `bundle.career_economy` / career + wealth + business | Three separate natal intents | Each component has Preview output | Bundle is quote-only; no package sale or combined Reading authority |
| `bundle.love_relationship` / relationship + family + spouse | relationship general + family + spouse | Relationship Preview supported; family unsupported; spouse position-only partial | Bundle is quote-only; no package sale or combined Reading authority |
| `bundle.full_saju` / six fields | Mixed natal intents | Mixed: career, wealth, business and relationship Preview; family unsupported; spouse position-only partial | Quote-only code entry; not a current approved Product and not part of this release mapping |

The Saju production interpretation audit on current Saju `main` still reports no real production-authorized interpretation registry. Thus every row above is **not supported for Production paid delivery today**, even where Preview works. Do not fill unsupported scopes by combining adjacent domains, by reading a bundle label as semantic authority, or by asking the Reader model to invent the missing result.

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
