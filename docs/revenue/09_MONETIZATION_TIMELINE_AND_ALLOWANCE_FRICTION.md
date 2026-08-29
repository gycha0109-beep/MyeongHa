# 명하 Monetization Timeline / Allowance Friction Review — Pass 2 v0.1

> Product: **명하 / MyeongHa**  
> Status: **Research evidence — NOT product authority**  
> Snapshot: **2026-08-30 KST**

---

## 0. 왜 시간축이 필요한가

경쟁사의 현재 가격과 과거 공개 매출을 같은 BM의 결과로 취급하면 안 된다.

특히 사주핑은 2026년 상반기 중 monetization / retention surface가 크게 바뀐 정황이 공개 버전 기록에 남아 있다.

따라서:

```text
current sticker price
+ old revenue milestone
→ 직접 ARPU/전환율 역산 금지
```

---

# 1. Sajuping timeline

## 2025-10-03 — App Store launch metadata

Third-party store metadata service MWM lists the iOS release date as `2025-10-03`.

Source:
- https://mwm.ai/ko/apps/sajuping-ai-k-fortuntelling/6752281515

Use as metadata support only, not financial evidence.

---

## 2026-02-25 — early economic milestone

Company-reported via ChosunBiz:

```text
~3 months after launch
cumulative users        10,000
cumulative conversations 400,000+
paid users              800+
cumulative revenue      ₩10M
D+7 revisit             15%
```

Source:
- https://biz.chosun.com/industry/business_info/2026/02/25/BAKOEIEFNVF4ZJLNIRK3BIL3OU/

This predates the later visible `Energy Ping / roulette / reward` redesign.

---

## 2026-04-06 — usage milestone

Company-reported via Korea Economic Daily:

```text
cumulative users    20,000
cumulative messages 1,000,000
```

This also predates the June 2.0 monetization redesign visible in App Store version history.

---

## 2026-05-03 — memory controls already visible

App Store version `1.1.139` says:

- personalized settings
- naming / interpretation style
- saved-memory toggle
- view/delete memories referenced by chat

Therefore `memory` existed before the June 2.0 monetization redesign.

Implication:

> memory alone cannot be assumed to explain the later monetization architecture.

---

## 2026-06-02~05 — major 2.0 redesign

App Store version history for `2.0.9~2.0.14` explicitly mentions:

```text
new all-screen design
Saju-based soulmate generator
smarter/faster AI chat
interpretation difficulty control
manseryeok detail
free daily fortune unlock
attendance roulette
mailbox rewards
new Energy Ping
Ping shop top-up wording
```

Source:
- current Sajuping App Store version history.

This is strong evidence that the product's current monetization/retention loop was materially redesigned **after** the February/April public economic milestones.

What remains unknown:

- exact date current Starter/Plus/Pro prices were introduced;
- exact pre-2.0 Ping prices;
- current plan attach by tier;
- how much June 2.0 changed revenue/retention.

---

## 2026-07~08 — retention surfaces keep expanding

Subsequent version history adds or improves:

- attendance check
- chat archive
- personalized recommended questions
- invitation progress/share button
- roulette reward display
- daily question cards
- daily fortune / widgets

Current official user guide also includes:

```text
daily fortune
fortune diary
fortune calendar
personalized recommended questions for subscribers
attendance roulette
free-Ping missions
friend invitation
Instagram follow reward
widget
```

Sources:
- https://www.sajuping.ai/guide
- current App Store version history

### Strategic interpretation

Current Sajuping is no longer simply:

```text
AI chat + credit
```

It is closer to:

```text
daily retention surface
+ conversational Saju
+ replenishing/earned currency
+ referral loop
+ subscription
+ top-up
+ premium compute quality
```

This matters when comparing it with MyeongHa.

---

# 2. Current Sajuping sticker-price snapshot

Current KR App Store surface:

| Product | Price | Nominal KRW / Ping where applicable |
|---|---:|---:|
| 5 Ping | ₩1,900 | ₩380 |
| 20 Ping | ₩11,000 | ₩550 |
| 50 Ping | ₩27,500 | ₩550 |
| 100 Ping | ₩49,000 | ₩490 |
| 500 Ping | ₩229,000 | ₩458 |
| 1000 Ping | ₩439,000 | ₩439 |
| Starter monthly | ₩35,900 | tier allowance not current-publicly resolved here |
| Plus monthly | ₩74,900 | unknown here |
| Pro monthly | ₩189,000 | unknown here |

The 5-Ping item is unusually cheap per Ping and developer response in a public review mirror describes it as a first-taste benefit product.

Therefore it should not be used as the standard marginal price.

---

# 3. Current free/reward loop

Official FAQ currently says:

```text
Ping used for detailed readings
→ free Ping replenishes every 24h
→ daily Ping is consumed before purchased Ping
→ attendance roulette can reward Ping
→ friend invite = 20 Ping
→ Instagram follow = 2 Ping
```

Friend-invite reward is conditional:

```text
invitee signs up
AND
invitee consumes at least 10 Ping
→ both parties receive 20 Ping
```

This is notable because the referral reward is connected to **activation**, not signup alone.

Official user guide additionally exposes changing seasonal missions such as:

- profile/MBTI actions
- consecutive fortune diary use
- SNS actions
- referral

### Business interpretation

Sajuping is using virtual rights not only for monetization but for:

```text
activation
+ retention
+ referral
+ habit formation
```

This is stronger than a simple paywall pattern.

---

# 4. Allowance friction — actual user-review signals

The following are **anecdotal review signals**, not representative cohort statistics.

A third-party App Store review mirror currently surfaces several relevant reviews and developer replies.

Source:
- https://appshunter.io/ios/app/sajuping-ai-korean-astrology/id6752281515/reviews

Use cautiously because it is a third-party review mirror.

## Signal A — reduction in perceived free access causes frustration

One reviewer says earlier free usage felt better because a fixed amount refilled after 24h; after the update, they felt unable to ask questions once Ping ran out without payment.

Current exact refill quantity is not inferred from this review because official FAQ does not expose a number and reward rules have changed.

### MyeongHa implication

> Allowance reductions are highly salient because users mentally budget `questions`, not model tokens.

Avoid establishing a generous permanent promise before C_read is understood.

---

## Signal B — combined free + paid allowance can be perceived as one entitlement

Another reviewer complained their perceived monthly usage dropped after an update.

Developer response clarified:

```text
old Starter subscription
→ +10 Ping/day = 300/month

separate free Daily Ping
→ 5/day

post-redesign plan allocation
→ 310/month

free Daily Ping reward system changed toward attendance roulette
```

The user perceived the **combined experience** as a reduction even though the subscription component itself increased slightly.

### MyeongHa implication

Users do not care which accounting bucket a right came from.

They experience:

> `How many meaningful things can I ask this month?`

Therefore membership benefit changes must be modeled at **total experienced allowance**, not only paid-bucket amount.

---

## Signal C — accidental consumption is disproportionately painful

Multiple reviews complain that tapping a suggested question or making an input mistake can consume Ping for a question they did not intend to spend on.

One explicitly asks for a final confirmation before the charge.

### H-R17 product guardrail candidate

If MyeongHa adopts Grounded Analysis Rights:

```text
user text input
→ classify whether new governed Reading is required
→ show explicit analysis intent / scope / right cost
→ user confirms
→ only then allocate/consume the analysis right
→ execute Reading
```

Do not silently consume a right because a recommendation chip was tapped.

This is a much stronger requirement than ordinary `message send` confirmation.

---

## Signal D — sticker price/accessibility can still be a barrier

A public review says Ping top-up/subscription felt expensive and asks for ad-based access; another says the cheap 5-Ping entry purchase was attractive while larger packs caused hesitation.

Again this is anecdotal.

But it supports testing a **low-risk first purchase** rather than making a large monthly subscription the only conversion path.

---

# 5. Important conflict: free access appears valuable, but its generosity is unstable

Current official FAQ markets the product as usable without payment and says free Ping replenishes every 24 hours.

Current App Store copy also says daily fortune / AI Saju chat can be used for free.

At the same time user-review signals show users notice and react strongly when free/reward mechanics change.

Therefore:

> Free allowance can be a retention asset **and** a future pricing liability.

This is directly relevant to MyeongHa H-R17.

---

# 6. MyeongHa should not copy the virtual-currency surface literally

Sajuping's Ping economy is useful evidence for economic mechanics, but MyeongHa has different product identity.

Potentially harmful literal copy:

```text
chat header constantly shows gems/coins
roulette determines ability to ask a serious life question
random reward decides whether emotional consultation continues
mis-tap instantly burns currency
```

These can make a relationship/world product feel transactional or game-economy heavy.

### Better MyeongHa abstraction to test

```text
Grounded Analysis Right
or
정밀 풀이 이용권
```

with:

- deterministic/transparent replenishment;
- no random availability for core serious analysis;
- explicit pre-execution confirmation;
- no consumption for ordinary relationship continuation;
- no consumption on failed/aborted execution;
- refund/re-credit on infrastructure failure;
- clear distinction between new analysis and follow-up explanation.

Exact naming and quantity remain open.

---

# 7. Acquisition insight — reward after activation, not signup

Sajuping's official referral rule requires the invitee to consume 10 Ping before the 20-Ping reward is granted.

This is economically smarter than:

```text
signup → reward
```

because it pays reward after a meaningful product-use threshold.

### MyeongHa candidate

For Compatibility / Gift growth loop:

```text
A shares compatibility/gift entry
→ B joins
→ B completes own Birth Record
→ B receives first grounded value
→ B performs meaningful activation
→ reward becomes eligible
```

Reward should be a **non-affection economic right**, never relationship score.

Candidate rewards to test:

- one bounded analysis right;
- discount on compatibility artifact;
- premium-compute sample.

Do not reward character affection/trust.

---

# 8. What the timeline changes in our interpretation

## Before timeline normalization

It was tempting to infer:

```text
current ₩35.9K~₩189K plans
+ February 800+ paid users
+ February ₩10M revenue
→ direct evidence for high-price subscription demand
```

That inference is invalid.

## After timeline normalization

What we can safely say:

1. Early version already generated paid users/revenue.
2. By June, product introduced a much more explicit Energy-Ping/reward/retention economy.
3. Current high-priced plans exist after that redesign.
4. Current take-rate and revenue under the new architecture remain unknown.

Therefore current pricing is **willingness-to-list**, not willingness-to-pay evidence.

---

# 9. New H-R17 UX requirements from competitor failure signals

If H-R17 proceeds to product experiment, minimum rules should include:

```text
R17-UX-01
ordinary chat never silently consumes a Grounded Analysis Right

R17-UX-02
new governed analysis requires explicit scope preview/confirmation

R17-UX-03
failed or uncommitted execution consumes no final right

R17-UX-04
recommendation-card mis-tap cannot directly commit paid/limited execution

R17-UX-05
free/paid allowance changes are communicated in total-experience terms

R17-UX-06
replenishment is deterministic for serious core analysis in early tests

R17-UX-07
rewards never alter affection/trust/relationship score
```

These are experiment guardrail candidates, not current runtime authority.

---

# 10. Current conclusion

The direct competitor lesson is no longer simply:

> `allowance + subscription works in market.`

The deeper lesson is:

> **Allowance is a powerful retention/monetization/acquisition primitive, but users become highly sensitive to fairness, accidental consumption, and entitlement reductions.**

MyeongHa can potentially capture the economic advantage while avoiding the worst UX failure by metering a structurally explicit `new grounded analysis execution` rather than every message or every suggested question.
