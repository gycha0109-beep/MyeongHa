# 명하 Retention / Monetization Discovery / Referral Surfaces — Pass 2 v0.1

> Product: **명하 / MyeongHa**  
> Status: **Research / product hypothesis — NOT UI authority, NOT runtime authority**  
> Snapshot: **2026-08-30 KST**

---

## 0. 질문

초기 논의에서 다음 아이디어가 나왔다.

> 무료 사용자에게 캐릭터가 사주를 더 적극적으로 권하면 monetization이 좋아지지 않을까?

이 아이디어는 현재 working direction에서 제외되어 있다.

이 문서는 직접 경쟁사들이 **사주 discovery / return / monetization entry**를 실제 어디에 두는지 보고, 캐릭터를 영업사원으로 만들지 않고도 monetization opportunity를 만들 수 있는지 검토한다.

---

# 1. Sajuping — monetization discovery is largely product-surface driven

Current official user guide exposes:

```text
Home
├─ today's fortune
├─ career / money / love / health breakdown
├─ time-of-day score
├─ lucky ritual
├─ fortune diary
├─ fortune calendar
└─ personalized recommended questions for subscribers

Benefits / rewards
├─ daily attendance roulette
├─ free-Ping missions
├─ friend invitation
├─ SNS action rewards
└─ widgets
```

Chat is important, but **the product creates reasons to enter chat outside the character's conversational initiative**.

Official guide:
- https://www.sajuping.ai/guide

### Important detail

Recommended questions can directly connect to chat.

This creates a monetization/discovery surface without requiring the AI character itself to say:

> `You are free, so buy another Saju reading.`

---

# 2. Jamo — similar retention surface pattern

Current App Store description/version history exposes:

- daily fortune
- weekly/monthly home widgets
- daily-flow visualization
- notifications
- compatibility
- popular-question entry
- chat continuation
- synchronized conversation history

Recent updates added more expressive character reactions and richer chart views, while daily/home surfaces remain distinct from the conversation itself.

### Interpretation

Both direct competitors combine:

```text
low-effort recurring surface
→ interesting question / daily signal
→ deeper chat / analysis
```

rather than relying only on the chatbot to proactively sell.

---

# 3. This resolves a prior MyeongHa tension

Earlier concern:

```text
free users need more Saju exposure
BUT
character sales behavior damages immersion
```

A cleaner split is:

```text
Character Runtime
→ relationship / persona / contextual initiative

Hall / Home / Reading surfaces
→ discovery / recommendation / commerce entry
```

Therefore:

> Monetization discovery can be more aggressive at the **product surface** while character behavior remains monetization-neutral.

This preserves the working guardrail:

```text
payer state
↛ affection / concern / character warmth
↛ sales pressure from character
```

---

# 4. Candidate MyeongHa discovery surface

Not final UI; conceptual only.

## Hall / Home

Possible modules:

```text
오늘의 흐름
→ deterministic/light daily value

이번 주 다시 볼 질문
→ prior user concern / unresolved topic, privacy-safe

정밀하게 볼 수 있는 주제
→ explicit Reading entry

궁합 / 함께 보기
→ social/viral entry

기록에서 돌아보기
→ Life Record / past decision follow-up

새 에피소드 / 세계 이벤트
→ character/IP retention
```

The Hall can surface these without any character pretending to have spontaneous concern because the user is on a free plan.

---

# 5. Product-led recommendation should not be fake urgency

Avoid:

```text
"오늘 안 보면 운을 놓칩니다"
"지금 결제하지 않으면 관계가 멀어집니다"
"캐릭터가 당신을 기다리고 있어요" when no governed event occurred
```

Prefer:

```text
"지난번 이직 고민, 이번 달 흐름까지 이어서 볼 수 있어요"
"새로운 월간 흐름이 열렸습니다"
"궁합 기록에 새 사람을 추가해 비교할 수 있어요"
```

only when the underlying product state actually supports the statement.

This follows the existing MyeongHa principle that notifications/product copy must not fabricate character/world events.

---

# 6. Daily value can be a return mechanism without becoming the main paid SKU

Direct competitors heavily use daily fortune/widgets.

MyeongHa can use daily/light content as:

```text
return trigger
NOT necessarily main revenue product
```

Possible funnel:

```text
daily/light grounded value
→ user returns
→ sees relevant unresolved life topic
→ ordinary character conversation
→ user explicitly requests a new grounded analysis
→ analysis-right / paid artifact boundary
```

This is more coherent than:

```text
free user chats casually
→ character suddenly pitches Saju
```

---

# 7. Referral — reward activation, not signup

Sajuping's current official FAQ says friend referral reward occurs only after the invitee has consumed at least 10 Ping.

```text
invite
→ signup
→ meaningful product usage
→ reward
```

This is a stronger anti-low-quality-acquisition pattern than rewarding signup alone.

### MyeongHa candidate

Compatibility / Gift loop:

```text
A creates/share entry
→ B visits
→ B completes own Birth Record
→ B receives first grounded value
→ B performs activation event
→ referral reward eligible
```

Possible activation events to test:

- first grounded Reading completed;
- second active day;
- own compatibility input completed;
- first meaningful return session.

Do not reward mere account creation if it creates low-quality/farmed users.

---

# 8. Referral reward can use high-perceived-value / low-COGS rights

Current Sajuping top-up prices imply a visible nominal retail value per Ping roughly in the range:

```text
~₩439 to ₩550 / Ping for 20~1000-Ping packs
```

The official referral reward is 20 Ping to each side after invitee activation.

Therefore the **visible retail-equivalent** of the reward can be meaningful while the company's actual marginal compute cost may be much lower.

We do not know Sajuping's actual COGS/Ping, so no margin inference is made.

### MyeongHa implication

If `C_read` is measured and controlled, a referral reward could be:

```text
one bounded Grounded Analysis Right
```

whose perceived standalone value exceeds its marginal AI cost.

This can be economically superior to cash-like discounts if abuse is controlled.

---

# 9. But never reward relationship progress

Forbidden candidate:

```text
invite a friend
→ +relationship score

subscribe
→ character likes you more

share content
→ unlock affection
```

Reason:

- corrupts relationship semantics;
- creates farming incentive;
- creates Pay-to-love perception;
- mixes acquisition logic with Character Runtime authority.

Reward only economic/product rights:

- analysis allowance;
- paid-artifact discount;
- premium compute sample;
- cosmetic/non-affection content if later validated.

---

# 10. Growth chronology is also instructive

At its April 2026 milestone, Sajuping told Korea Economic Daily that user/message growth was occurring without separate marketing.

By June it was recruiting a 20-person supporter program for SNS content creation, with subscription-plan benefits and performance incentives.

Sources:
- Korea Economic Daily, 2026-04-06
- public supporter recruitment listing, June 2026

### Interpretation

This is compatible with a staged growth strategy:

```text
product / organic proof
→ establish repeat usage
→ add structured referral/reward/content loops
→ scale creator/supporter distribution
```

It does not prove marketing was literally zero across every channel; it is a company statement.

---

# 11. MyeongHa launch distribution implication

Before paid UA scale:

```text
1. grounded free/shareable value
2. compatibility share loop
3. Hall/Home recurring hooks
4. character/world shareable moments
5. SEO / seasonal Saju discovery
6. creator short-form content
```

Paid acquisition becomes more rational only after:

- C_chat known;
- C_read known;
- payer conversion known;
- D30 known;
- contribution LTV known.

---

# 12. Telemetry needed for discovery surfaces

Do not judge a recommendation module by CTR only.

Measure:

```text
impression
→ open
→ actual grounded analysis request
→ entitlement boundary
→ paid/allowance execution
→ completion
→ follow-up conversation
→ D7 / D30 return
→ contribution
```

For each surface distinguish:

```text
Hall recommendation
Daily value
Push/inbox
Compatibility share
Character organic initiative
Search/SEO landing
```

Otherwise product-led discovery and character-led initiative become impossible to compare.

---

# 13. Current working conclusion

The strongest answer to the earlier monetization-immersion conflict is:

> **캐릭터가 영업하지 않아도 된다. 제품이 사주를 발견하게 만들면 된다.**

More formally:

```text
Character Runtime owns relationship behavior.
Hall/Home/Reading UI owns monetization discovery.
Entitlement owns paid execution.
Saju Engine owns semantic authority.
```

This separation is both commercially plausible from current direct competitors and cleaner for MyeongHa architecture.
