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

## Four single-product Preview samples — paid-quality gate failed

On 2026-11-09, the current Saju Preview-only HTTP route returned a separate delivered Preview for each supported single intent using the same synthetic input (`1992-07-14 15:20`, solar, sex unspecified). Each response was HTTP 200 with lifecycle `preview`, response version `myeonghwa-product-reading-response-v2`, and chart pillars 壬申 / 丁未 / 辛卯 / 丙申; calculation state was `partially_ambiguous`. The following single-pass paraphrases are internal evaluation material, not satisfactory paid Reader readings:

**직업·커리어운 — approved KRW 9,900**

> 일에서는 찾아낸 것을 실제로 고쳐 결과로 보여주는 쪽에 힘이 실릴 수 있습니다. 익숙하지 않은 정보를 파고들고, 남들이 지나친 연결점을 찾아내는 과정이 일의 동력이 되기 쉽습니다. 거기서 멈추기보다 기존 방식의 문제를 발견해 더 나은 형태로 바꾸고, 생각을 결과물로 보여줄 수 있을 때 강점이 살아날 수 있어요.
>
> 역할과 기준이 분명한 환경도 중요합니다. 무엇을 지키고 어디까지 책임지는지 알 수 있으면 맡은 일을 안정적으로 끌고 가기 쉽습니다. 빠른 판단이나 책임이 필요한 상황을 정면으로 다루는 힘도 보이지만, 압박만 크고 결정권이 없는 자리는 소모적일 수 있습니다. 함께 일할 때는 기여와 역할 경계를 구체적으로 나누는 편이 안정적입니다.

**사업운 — approved KRW 9,900**

> 사업에서는 오래 검토만 하기보다 작은 형태로 먼저 실행하고, 실제 반응을 확인하면서 판단을 다듬는 방식이 맞을 수 있습니다. 내가 결정할 수 있는 영역이 있을 때 움직이기 편하고, 책임은 지는데 결정권은 거의 없는 구조에서는 답답함이 커질 수 있어요.
>
> 중요한 결정을 앞두고 정보를 모아 불확실성을 줄이는 과정도 필요합니다. 다만 완전히 확실해질 때까지 기다리면 결정 시기를 놓칠 수 있으니, 무엇을 확인하면 작게 시작할지 기준을 정해두는 편이 좋겠습니다. 시간과 돈을 어디에 먼저 써야 실제 반응을 볼 수 있는지 따져보고, 역할·기한·책임을 분명히 하는 운영 기준도 중요합니다. 이 풀이는 사업 성패나 투자 판단을 예언하거나 권하지 않습니다.

**재물운 — approved KRW 9,900**

> 돈의 흐름은 능력이나 생각을 실제 결과물로 바꾸는 과정에서 이해하기 쉬울 수 있습니다. 무엇을 만들었고 누가 왜 필요로 하는지가 보이면 금전적인 판단도 구체적으로 잡히기 쉽습니다. 돈은 단순히 모아두는 숫자라기보다 내가 선택할 수 있는 범위와 시간을 넓혀주는 자원으로 느낄 수 있어요.
>
> 배움이나 도구, 자료에 쓰는 돈도 앞으로의 선택지를 넓혀준다는 점에서 납득하기 쉬울 수 있습니다. 다만 준비에만 머물면 비용은 늘고 실제로 써보지 못할 수 있으니, 지출할 때 언제 어떻게 써볼지도 함께 정해두는 편이 좋습니다. 내가 원하는 선택과 예산, 배움과 당장 결과를 내야 하는 비용이 부딪힐 때는 선택권·성장·유지비를 나누어 보면 도움이 됩니다. 현재 재산, 수입 규모, 투자 수익이나 금전 시기는 이 응답에서 확정하지 않습니다.

**나의 인연·관계운 — approved KRW 9,900**

> 관계에서는 가까워져도 각자의 선택권이 남아 있는 편이 편할 수 있습니다. 필요할 때 나란히 움직이되 모든 것을 함께해야 하지는 않는 관계가 자연스럽고, 간섭받는 느낌이 커지면 가까운 사이에서도 거리를 두고 싶어질 수 있어요.
>
> 대화로 상대의 생각과 맥락을 이해하고 신뢰를 확인할 시간이 있어야 편할 수 있습니다. 생각과 감정을 말이나 행동으로 표현하고 반응을 주고받을 통로가 중요합니다. 가까울수록 약속과 책임, 실제로 서로 나누는 시간과 노력이 신뢰의 기준이 되기 쉽습니다. 내가 원하는 방식과 함께 써야 하는 시간·돈·에너지가 부딪힐 때, 또는 빨리 해결하고 싶은 마음과 먼저 충분히 이해하고 싶은 마음이 엇갈릴 때는 각자 결정할 일과 함께 정할 일, 이해할 시간과 결정할 시간을 구분해 볼 수 있겠습니다. 이 응답은 관계 변화의 시기나 상대방의 성격·결과를 말하지 않습니다.

**Paid product quality: FAIL for all four at KRW 9,900.** These Preview responses did not return a validated link from each sentence to its specific pillar or other chart evidence, nor explain `partially_ambiguous`. The text is short, generic advice; it does not show the chart-specific judgment, conditions, natal strengths and limits, auspicious/inauspicious reasoning, concrete life manifestations, or supported timing flow that would justify the approved price. Avoiding unsupported predictions is necessary, but does not make this a valuable paid reading. These samples prove the route can return a real calculation Preview; they do not establish a complete Reader experience or a finished product. The customer-facing evaluation copy is explicitly marked FAIL in `four-single-saju-reader-preview-samples-20261109.md` in the Outputs folder.

### Required Reader composition from the supplied format reference

The user-provided PDF gives the reading form to follow: begin with the core judgment; show the actual natal placements and their roles; explain strengths, limits, and tensions; connect those effects to concrete scenes in the purchased field; connect Daeun/Sewoon changes and real timing only when supported; close by integrating the person's story in the Reader's own conversational voice. This is a scene-by-scene 상담, not a report outline or a stack of short advice cards. The current four drafts do not meet that form because the Preview response omits claim-to-chart evidence links and supported timing. Do not present the six beats as filled when the engine has not supplied the facts.

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
