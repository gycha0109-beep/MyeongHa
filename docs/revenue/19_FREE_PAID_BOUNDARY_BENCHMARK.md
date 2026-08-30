# MyeongHa Revenue Research — Free / Paid Boundary Benchmark v0.1

> Product: **명하 / MyeongHa**  
> Track: Revenue Architecture / Monetization  
> Status: **Research benchmark — NOT product authority**  
> Snapshot: **2026-08-30 KST**

---

## 0. 질문

이번 패스는 가격표가 아니라 아래 질문만 비교한다.

> 다른 서비스는 핵심 경험을 무료에 얼마나 남기고, 정확히 무엇부터 돈을 받는가?

목적은 특정 플랫폼의 BM을 복사하는 것이 아니라 MyeongHa에 사용할 수 있는 **free/paid boundary pattern**을 추출하는 것이다.

---

## 1. Boundary Matrix

| Platform | Free core | Paid boundary | Boundary type | MyeongHa relevance |
|---|---|---|---|---|
| Character.AI | basic chat models | better memory, latest/best models, ad-free, no slow mode, unlimited voice calls, customization | depth / quality / friction | 관계 채팅은 남기고 성능·기억·모달리티 과금 |
| Replika | chatting is explicitly stated to remain free | relationship status, premium activities, selfies/image gen, voice/calls; Ultra adds smarter conversation, emotional intelligence, save-to-memory | relationship-adjacent feature tiering | chat core free 사례지만 memory paywall은 MyeongHa와 충돌 가능 |
| Kindroid | as of 2026-08-30: unlimited Lite messages, 2 Kindroids, basic long-term memory | flagship models, 4x short-term context, cascaded/enhanced memory, more companions/groups, video/voice, higher media allowance; Ultra/MAX sell very large context | compute / memory / capacity | 가장 직접적인 `cost-shaped boundary`; high context is explicitly cost-driven |
| Nomi | indefinite free plan; 50 messages/day, daily messages/images; 1:1 relationships remain usable after downgrade | higher message capacity, longer user messages, group chat, video/voice, credits/add-ons | allowance + modality | 관계는 살아 있고 heavy usage / modality를 유료화하는 구조 |
| Tinder | free match, chat, connect | unlimited likes, rewind, passport, ad removal, see who likes you, boosts, prioritized likes | efficiency / discovery | 핵심 관계 형성은 무료, 유료는 탐색 효율·가시성 |
| Duolingo | core learning remains free | Super removes ads/friction and expands practice; Max adds high-cost AI experiences | friction removal + premium AI | free core를 깨지 않고 AI 고비용 기능을 상위 tier로 분리 |
| Finch | core self-care is explicitly promised free | customization, bonus content, faster progress, premium seasonal rewards | convenience / cosmetics / bonus | trust-sensitive product에서 핵심 기능 paywall을 피하는 사례 |
| The Pattern | daily personalized updates, basic Bonds/compatibility, some content | deeper relationship/timing insights, unlimited Bonds, full library/audio, Time Travel across wider past/future, dating perks | depth / longitudinal analysis | MyeongHa Life Chronicle에 매우 가까운 `현재 기본값 무료 → 깊은 시간축 분석 유료` |
| Co-Star | free astrology app and ongoing basic horoscope/social experience | one-time Advanced Self/Relationship reports, Year Ahead, Eros, question packs; optional Pro subscription | explicit artifact + questions + membership | H-R19과 가장 유사한 `free recurring value + paid artifact` 조합 |
| Nebula Astrology | daily/weekly/monthly/yearly horoscope, basic compatibility, articles/community | premium forecasts/readings, ad-free, deeper compatibility; web subscription includes psychic-chat credits | deep content + human expert | 무료 반복 retention + 깊은 분석/전문가 escalation |
| Sajuping | daily-recharging free Ping, daily fortune and AI Saju chat | paid Ping uses higher-performance model and produces more detailed/longer answers; subscriptions add more capacity/features | allowance + quality tier | 직접 경쟁사. 단, MyeongHa는 semantic validity를 가격에 따라 달리하지 않는 guardrail 유지 필요 |
| Jamo | daily fortune, elemental flow, compatibility, conversational Saju surface | Premium subscriptions; Premium+ adds answer-style choice and deeper multi-perspective interpretation | subscription-led depth | 사주 채팅 자체를 유지하면서 depth/experience를 tiering |
| DoSa | free chart, daily fortune/tarot, AI consultation trial | monthly VIP includes recurring bead currency | free trial + recurring currency | 전통적인 virtual-currency monetization reference |
| Patreon | free membership/following can coexist with public/free posts | paid membership tiers and one-time paid posts/collections/products | relationship/community + artifact | 관계/팬 연결은 무료, 소유·접근 가치가 명확한 결과물은 유료 |

---

## 2. Source Notes

### Character.AI
Official subscription page says Free includes basic chat models; c.ai+ adds better memory, ad-free chats, latest/best models, no slow mode, unlimited voice calls and customization.

Source: https://character.ai/subscribe

### Replika
Replika help center explicitly says chatting will always be free. Pro adds relationship status, activities, selfies/image generation, voice and calls. Ultra adds smarter conversations, elevated emotional intelligence, self-reflections and saving messages to memory.

Sources:
- https://help.replika.com/hc/en-us/articles/115001094511-Is-Replika-free
- https://help.replika.com/hc/en-us/articles/39551043419149-Choosing-a-Subscription

### Kindroid
Current subscription docs list unlimited Lite messages for free users with basic memory, while subscribers get flagship models, longer context, cascaded/enhanced memory, more Kindroids/groups and richer modalities. Ultra/MAX are explicitly described as high-cost context tiers designed mainly for cost coverage.

Important timeline note: an August 2026 update log announces that on **2026-10-01** Kindroid plans to replace permanent Lite access with a bounded preview. Therefore `unlimited Lite free` is current as of this snapshot but is not a stable long-term policy.

Sources:
- https://kindroid.ai/v2/docs/subscriptions/
- https://kindroid.ai/v2/docs/update-log/
- https://kindroid.ai/v2/docs/in-app-purchases/

### Nomi
Nomi's current public/wiki material states an indefinite free plan with 50 messages/day. Free accounts use 400-character user-message limits versus 800 for subscribers. After downgrade, existing Nomis and 1:1 chat remain available, while group chat/video/voice become read-only paid features.

Sources:
- https://nomi.ai/
- https://wiki.nomi.ai/Does_Nomi_offer_refunds%3F
- https://wiki.nomi.ai/Are_there_message_character_limits%3F
- https://nomi.ai/refund-policy/

### Tinder
Tinder explicitly states its free version supports match/chat/connect. Subscription layers sell unlimited likes, rewind, passport, ad removal, seeing who liked you, boosts and prioritized likes.

Sources:
- https://www.help.tinder.com/hc/en-us/articles/115004647686-Tinder-Overview
- https://www.help.tinder.com/hc/en-gb/articles/115004487406-Tinder-subscriptions

### Duolingo
Core learning remains free. Super primarily removes friction and expands usage/practice. Max adds high-cost AI interactions such as Video Call/Roleplay/personalized explanations.

Sources:
- https://blog.duolingo.com/duolingo-101-how-to-learn-a-language-on-duolingo/
- https://investors.duolingo.com/company-strategy-overview-0

### Finch
Finch explicitly states that all core self-care features are and will remain free. Plus monetizes customization, bonus content and faster progress.

Source: https://help.finchcare.com/hc/en-us/articles/37780200600589-Benefits-of-Finch-Plus

### The Pattern
Current App Store/support material says free users receive daily personalized updates, basic Bonds and some library content. Go Deeper+ adds unlimited premium insights, deeper romantic timing, Time Travel, unlimited Bonds, full library/audio and dating perks.

Sources:
- https://apps.apple.com/cg/app/the-pattern-astrology/id1071085727
- https://thepattern.zendesk.com/hc/en-us/articles/360055659311-What-does-the-Go-Deeper-Subscription-include
- https://thepattern.zendesk.com/hc/en-us/articles/4409939517972-What-is-the-Time-Travel-feature

### Co-Star
Current App Store listing shows one-time purchases for Advanced Self/Relationship Chart, Year Ahead, Eros and question packs plus Pro subscription.

Source: https://apps.apple.com/us/app/co-star-personalized-astrology/id1264782561

### Nebula Astrology
Nebula's FAQ says many personalized horoscope/compatibility/community features are free. Premium adds advanced forecasts/readings, ad-free experience and psychic/advisor credits.

Sources:
- https://www.asknebula.com/faq
- https://nebula-help-us.zendesk.com/hc/en-us/articles/47637969411473-Which-features-are-included

### Sajuping
Official FAQ says Ping replenishes every 24 hours and can also be earned via attendance/referral/social actions. Free and paid Ping use the same calendar calculation, but paid Ping uses a higher-performance model and is marketed as producing longer/more detailed answers.

Source: https://www.sajuping.ai/faq

### Jamo
Current App Store listing exposes daily fortune, elemental flow, compatibility and chat as the product surface. In-app purchases include Premium weekly/monthly/annual and Premium+. Version notes state Premium+ adds selectable answer style and deeper comparison of advanced Saju interpretation perspectives.

Source: https://apps.apple.com/kr/app/%EC%9E%90%EB%AA%A8-jamo-%EC%98%A4%EB%8A%98%EC%9D%98-%EC%82%AC%EC%A3%BC/id6759788071

### DoSa
Current App Store listing markets free chart/daily tarot/AI consultation trial and a monthly VIP subscription that includes recurring bead currency.

Source: https://apps.apple.com/kr/app/%EB%8F%84%EC%82%AC-no-1-ai-%EC%82%AC%EC%A3%BC-%ED%83%80%EB%A1%9C-%ED%94%8C%EB%9E%AB%ED%8F%BC/id6741585416

### Patreon
Patreon supports free membership alongside paid membership, and separately supports one-time paid posts/collections/digital products.

Sources:
- https://support.patreon.com/hc/en-us/articles/16303719836813-Selling-one-time-purchases-on-Patreon
- https://www.patreon.com/policy/legal

---

## 3. Five Boundary Patterns

### Pattern A — Core Action Free / Efficiency Paid

Examples: Tinder, Finch, Duolingo Super.

```text
core value remains usable for free
+
paid removes friction / improves speed / convenience / discovery
```

This works when destroying the free core would destroy network effects, trust or habit formation.

MyeongHa implication:

> Basic relationship continuity belongs here more naturally than behind a hard paywall.

---

### Pattern B — Relationship Free / Depth & Modality Paid

Examples: Character.AI, Replika, Kindroid, Nomi.

```text
basic relationship/chat
= free or bounded-free

higher model quality
long context
memory depth
voice/video/image
group interaction
= paid
```

Important split:

- Replika / Kindroid directly monetize some memory depth.
- Nomi preserves one-to-one relationship continuity after downgrade.

MyeongHa should not automatically copy the memory paywall because per-character continuity is part of the product identity.

---

### Pattern C — Repeated Free Value / Deep Analysis Paid

Examples: The Pattern, Co-Star, Nebula.

```text
daily / lightweight / current-state value
= free

cross-domain depth
longitudinal time travel
advanced compatibility
formal reports
= paid
```

This is currently the strongest analogue for H-R19/H-R20.

Especially relevant:

> The Pattern gives basic personalized current-state value free but charges for broader/deeper temporal and relationship analysis.

That resembles:

```text
natural callback / current conversation
= free

cross-history synthesis / Life Chronicle / formal Decision artifact
= paid
```

---

### Pattern D — Allowance Free / Heavy Usage Paid

Examples: Nomi, Sajuping, DoSa, many AI products.

```text
small recurring allowance
= free

more usage / higher tier / top-up
= paid
```

Strength:
- directly caps COGS.

Weakness:
- visible metering can distort natural conversation.
- users can become reluctant to ask small questions.

This remains a useful control or abuse/cost mechanism for MyeongHa, but not the leading default UX for ordinary relationship chat.

---

### Pattern E — Free Relationship / Paid Artifact or Ownership

Examples: Patreon, Co-Star.

```text
follow / relationship / recurring free touchpoint
= free

specific premium content / report / collection / artifact
= one-time paid
```

This is the cleanest direct support for H-R19.

---

## 4. What the Market Does NOT Show

The benchmark does **not** show one dominant universal rule.

There are successful products using:

```text
free core + subscription
bounded free + subscription
free relationship + paid modality
free daily value + paid deep report
free membership + one-time artifact
allowance + top-up
```

Therefore competitor research alone cannot decide MyeongHa's final boundary.

It can only remove weak assumptions.

---

## 5. Implication for MyeongHa

### 5.1 Strongest current boundary candidate

```text
FREE
- natural relationship conversation
- basic continuity / callback
- relationship progression
- current-state lightweight grounded value

PAID
- explicit cross-history synthesis
- formal Decision artifact
- deep Timing comparison
- relationship dynamics artifact
- Annual / Life Chronicle
- high-cost modalities / premium compute when economically required
```

This combines:

- Tinder/Finch: preserve the core reason to return;
- Character.AI/Nomi: charge around expensive/expanded experience, not every relationship micro-turn;
- The Pattern/Co-Star: monetize depth, time horizon and formal artifacts;
- Duolingo/Kindroid: isolate costly AI capability when needed.

### 5.2 What should remain experimental

Do not promote these to product authority yet:

- memory depth paywall;
- visible per-message credit;
- paid model = semantically more correct Saju;
- relationship-stage paywall;
- unlimited free chat promise;
- analysis-right currency as default launch economy.

### 5.3 Most important warning

Competitors prove that users accept paying for **more depth, more capacity and better tools**.

They do **not** prove that users will pay for an Artifact if free conversational answers already contain the same synthesis.

Therefore H-R19 still requires this product distinction:

```text
free character answer
!=
paid artifact with the same answer in longer prose
```

The paid layer must perform a materially different operation:

```text
multi-source aggregation
cross-history comparison
temporal synthesis
structured alternatives
formal persistent output
```

---

## 6. Current Revenue Judgment

This benchmark **strengthens H-R19**, but with a clearer boundary.

Current preferred formulation:

> **Keep the emotional/relationship loop usable without payment. Monetize depth, temporal scope, explicit synthesis, high-cost modality, and durable artifacts.**

The strongest external analogue is not any single competitor. It is the combination:

```text
Tinder / Finch
→ core experience survives free

Nomi / Character.AI
→ relationship survives; expanded capability is paid

The Pattern / Co-Star
→ deep / longitudinal / formal analysis is paid

Duolingo / Kindroid
→ expensive compute is separately bounded
```

This remains a research hypothesis, not product authority.
