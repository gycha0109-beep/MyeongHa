# 명하 Revenue Research — WTP / Cost / Launch Price Ladder v0.1

> Product: **명하 / MyeongHa**  
> Track: Revenue Architecture / Unit Economics / Monetization Strategy  
> Status: **Pass 4 research — NOT product authority**  
> Snapshot: **2026-08-30 KST**

---

## 0. 이번 패스의 질문

Pass 1~3는 `무슨 BM이 가능한가`와 `어디를 과금 경계로 둘 것인가`를 넓게 탐색했다.

Pass 4는 범위를 좁힌다.

```text
1. 한국 사용자가 현재 어떤 가격대에 실제로 노출되어 있는가?
2. MyeongHa의 C_chat / C_read는 최신 API 가격에서 어느 정도일 수 있는가?
3. Reading을 meter해야 하는 이유가 정말 원가 때문인가?
4. 초기 SKU / 가격 / 무료 범위를 어떤 순서로 실험해야 하는가?
```

중요:

> 이 문서는 실제 결제전환 데이터가 없는 상태의 launch-pricing hypothesis다.

경쟁사 가격은 revealed-WTP의 약한 proxy일 뿐이며, MyeongHa 가격의 근거 그 자체가 아니다.

---

# 1. 한국 시장의 현재 가격 사다리

## 1.1 초저가 automated report

### Saju-Link

공식 가격 페이지, 2026-07-26 시행:

```text
기본 명식 / 오늘의 운세     무료
Life reading + year PDF    ₩990
```

Source:
- https://saju-link.com/en/pricing

### 사주한컷

Google Play 현재 가격:

```text
사주 Reading        ₩1,900
궁합                ₩1,900
이번 달             ₩1,900
신년운세            ₩4,900
무료 preview         1~2 chapter
```

Source:
- https://play.google.com/store/apps/details?id=kr.sajuhancut.app

### 오늘사주

Google Play 현재 가격:

```text
2회 이용권           ₩990
1일 이용권           ₩2,900
월 구독              ₩4,900
```

Source:
- https://play.google.com/store/apps/details?id=com.kjaegu9771.todaysaju

### 해석

`₩990~₩4,900` 구간은 이미 존재한다.

따라서 MyeongHa가 모든 paid Reading을 ₩7,900 이상으로 시작하면:

- 가격 자체가 불가능한 것은 아니지만;
- 첫 결제 장벽에서 초저가 대체재와 직접 비교될 수 있다.

반대로 이 가격대를 그대로 따라가면:

- governed Saju;
- character continuity;
- Life Record;
- structured decision artifact

같은 상위 가치의 가격 앵커를 스스로 낮출 수 있다.

따라서 초저가 SKU는 **core SKU가 아니라 entry / sampler 용도**로만 검토하는 것이 안전하다.

---

## 1.2 중가 automated / AI product

### SAZU

현재 공개 서비스 가격:

```text
오늘의 운세          무료
월 상세운세          ₩5,900
일일운세 구독        ₩5,900 / month
연간 운세            ₩8,900
관계운               ₩9,900
연애 운              ₩13,900
고민 맞춤분석        ₩14,900
대운 보기            ₩18,900
인생흐름             ₩26,900
```

Source:
- https://www.sazu.app/services

### 자모 Jamo

현재 App Store IAP:

```text
Premium weekly       ₩3,300
Premium monthly      ₩8,800
Premium annual       ₩59,000
Premium+             ₩17,000
```

Source:
- https://apps.apple.com/kr/app/id6759788071

### K-Fortune

공식 Terms:

```text
Free tier
Premium $9.99 / month
Premium $59.99 / year
7-day trial
```

Source:
- https://fortuneknowsme.com/terms

### 해석

`₩5,900~₩17,000`은 한국 사용자에게 이미 낯설지 않은 디지털 운세/AI 사주 가격대다.

특히:

```text
~₩5,900       recurring/light utility
~₩8,800       mainstream subscription anchor
~₩9,900       relationship/report anchor
~₩13,900~17k  deep/premium analysis anchor
```

로 관찰할 수 있다.

---

## 1.3 고가 AI Saju / allowance hybrid

### 사주핑

현재 App Store IAP:

```text
5 Pings            ₩1,900
20 Pings           ₩11,000
50 Pings           ₩27,500
100 Pings          ₩49,000~49,500
Starter monthly    ₩35,900
Plus monthly       ₩74,900
Pro monthly        ₩189,000
```

Source:
- https://apps.apple.com/kr/app/id6752281515

공식 FAQ는:

```text
무료 Ping = 24시간마다 충전
유료 Ping = 더 높은 성능 AI / 더 긴·상세한 풀이
```

라고 설명한다.

Source:
- https://www.sajuping.ai/faq

중요한 제한:

> listed plan price != realized willingness-to-pay.

2026-02 초기 공개수치는 당시 BM 기준:

```text
누적 사용자        10,000+
누적 대화          400,000+
유료 사용자        800+
누적 매출          ₩10M
D+7 revisit        15%
```

이었다.

Source:
- ChosunBiz 2026-02-25 company-reported metrics

현재 고가 plan은 이후 2.0 BM 개편 이후이므로 초기 매출 수치와 직접 연결하지 않는다.

---

## 1.4 mature fortune-app currency / membership

### HelloBot

현재 App Store IAP:

```text
12 hearts           ₩3,300
25 hearts           ₩6,600
50 hearts           ₩11,000
100 hearts          ₩17,000
membership          ₩26,000
```

App Store copy는 누적 판매 400,000회를 주장한다.

Source:
- https://apps.apple.com/kr/app/id1294957719

### Forceteller

현재 store copy:

```text
누적 사용자 9M
6,000+ free/paid fortune items
```

Source:
- https://apps.apple.com/kr/app/id1262949138

이 숫자는 company/store claim이며 audited unit economics가 아니다.

---

# 2. 인간 상담 가격 — AI 가격의 상단 anchor

현재 공개 판매 사례는 대략:

```text
1 question / simple tarot      ₩2,000~5,000
10 min consultation            ~₩7,000~12,000
20 min                         ~₩20,000~40,000
30 min                         ~₩15,000~55,000
full Saju                      ~₩50,000~110,000
compatibility                  ~₩70,000~110,000
```

예시:

- 크몽 사주 상담: 10분 ₩12,000 / 30분 ₩50,000 / 60분 ₩100,000
- 당근 타로 업체: 20분 ₩20,000, 30분 ₩28,000 등
- 여의도 사주/타로: 1인 사주 ₩55,000 / 종합 ₩110,000 / 궁합 ₩110,000

Sources:
- https://kmong.com/gig/737461
- current Daangn local price pages sampled 2026-08

### 해석

MyeongHa의 paid artifact가 인간상담을 완전히 대체한다고 주장해서는 안 된다.

하지만 가격 심리상:

```text
₩4,900~14,900 digital artifact
```

가 인간 상담 대비 터무니없는 가격은 아니다.

오히려 구매 이유는:

- 즉시성;
- 반복 확인;
- 구조화된 결과물;
- 개인 맥락 연결;
- 인간에게 말하기 어려운 질문의 낮은 진입장벽

에서 나와야 한다.

---

# 3. 수요 기반 시장 신호

2025년 엠브레인 조사(언론 보도 인용)는 점술서비스 관심/경험을 다음처럼 보도했다.

```text
관심
20대 68.0%
30대 67.5%

이용 경험
20대 58.0%
30대 66.0%
```

Source:
- 2026-04-21 media report citing Embrain Trend Monitor survey of 1,200 people

역사적 참고로 2022년 12월 네이버 엑스퍼트 매출에서 운세상담이 74%, 서비스 이용자의 72%가 20·30대였다는 보도도 있다.

Source:
- Hankyoreh/ESC 2023 report citing Naver Expert data

이 데이터는 MyeongHa 결제전환율을 알려주지 않는다.

다만:

> `젊은층에게 디지털 사주 자체가 낯선 category`라는 가정은 지지되지 않는다.

---

# 4. 최신 API 가격으로 C_chat 재산정

FX reference:

```text
2026-08-28 USD/KRW close ≈ 1,377.32
current quoted ≈ 1,378.64
```

계산 편의상 **₩1,378.64/USD**를 사용한다.

Source:
- current USD/KRW market page, 2026-08-30 snapshot

## 4.1 현재 공개 model price anchors

### OpenAI GPT-5.6 Luna — Standard short context

```text
input          $0.20 / 1M
cached input   $0.02 / 1M
cache write    $0.25 / 1M
output         $1.20 / 1M
```

Source:
- https://developers.openai.com/api/docs/pricing

### Gemini 3.1 Flash-Lite

```text
input          $0.25 / 1M
cache          $0.025 / 1M
output         $1.50 / 1M
```

### Gemini 3.7 Flash

```text
input          $0.75 / 1M
cache          $0.08 / 1M
output         $4.50 / 1M
```

Source:
- https://ai.google.dev/gemini-api/docs/pricing

### Anthropic

```text
Claude Haiku 4.5   $1 input / $5 output per 1M
Claude Sonnet 5    $2 input / $10 output per 1M
```

Source:
- https://docs.anthropic.com/en/docs/about-claude/models/overview
- https://www.anthropic.com/news/claude-sonnet-5

---

## 4.2 illustrative ordinary chat turn

Not measured MyeongHa workload.

Assumption:

```text
input     4,000 tokens
output      300 tokens
```

### no cache

| Model | direct API COGS / turn |
|---|---:|
| GPT-5.6 Luna | ~₩1.60 |
| Gemini 3.1 Flash-Lite | ~₩2.00 |
| Gemini 3.7 Flash | ~₩6.00 |
| Claude Haiku 4.5 | ~₩7.58 |
| Claude Sonnet 5 | ~₩15.17 |

### 70% reusable-prefix cache assumption

Only where corresponding cache pricing is modeled:

| Model | direct API COGS / turn |
|---|---:|
| GPT-5.6 Luna | ~₩0.90 |
| Gemini 3.1 Flash-Lite | ~₩1.13 |
| Gemini 3.7 Flash | ~₩3.41 |

This excludes:

- planner call;
- memory classification;
- summarization;
- retries;
- moderation/guard overhead;
- embeddings/vector read;
- storage/network;
- cache writes;
- premium routing.

Therefore Pass 1 target:

```text
all-in average chat COGS ≈ ₩2~3 / committed turn
```

still looks **plausible**, but is not guaranteed.

It is now supported by current low-cost model pricing rather than being only a reverse-engineered wish.

---

# 5. C_read 재산정 — Pass 4의 가장 큰 변화

Illustrative full Reading narrative workload:

```text
input      10,000 tokens
output      1,500 tokens
```

No cache:

| Model | direct API cost / Reading |
|---|---:|
| GPT-5.6 Luna | ~₩5.24 |
| Gemini 3.1 Flash-Lite | ~₩6.55 |
| Gemini 3.7 Flash | ~₩19.65 |
| Claude Haiku 4.5 | ~₩24.13 |
| Claude Sonnet 5 | ~₩48.25 |

Even if orchestration / validation / retries multiply direct model cost by:

```text
2x → ~₩10~100 class
5x → ~₩25~250 class
```

for common routes, this is still tiny compared with a ₩4,900~₩14,900 consumer SKU.

### Architecture-specific correction

More importantly, MyeongHa personalization architecture explicitly says the first production-capable personalized reading should prefer:

```text
structured T8 semantic claim
→ ClaimNarrativeProfile
→ deterministic template renderer
```

and an LLM cannot create new semantic claims.

Therefore paid Saju Reading is **not structurally required to be an expensive long-reasoning LLM workflow**.

This makes the old Pass 2 `C_read = ₩100 / ₩250` allowance sensitivity useful only as a stress-test, not a likely base estimate.

---

# 6. Critical decision delta: Reading meter is NOT mainly cost recovery

Pass 2 elevated:

> `Replenishing Grounded Analysis Rights`

partly because a new semantic execution was a clean architecture boundary.

Pass 4 changes the economic interpretation.

If actual C_read is in tens of won, then:

```text
meter Reading because it costs too much
```

is weak reasoning.

A Reading boundary can still be valuable for:

- packaging;
- scarcity / perceived value;
- subscription allowance;
- abuse control;
- premium-depth distinction;

but it should be justified by **user value and product behavior**, not raw inference cost.

This matters because allowance systems create friction:

```text
"이 질문 하면 몇 개 빠지지?"
"이건 새 분석인가?"
"잘못 눌렀는데 왜 차감됐지?"
```

Direct competitor reviews already show this failure mode.

Therefore launch should not assume an internal currency is necessary.

---

# 7. Consumer price → usable net value

## 7.1 Web direct payment rough economics

Toss Payments current general card fee:

```text
3.4% + VAT on fee
```

Source:
- https://www.tosspayments.com/about/fee

For VAT-inclusive Korean consumer price P:

```text
net sales before PG ≈ P / 1.1
PG fee incl fee-VAT ≈ P × 3.74%
rough economic proceeds before refund/support ≈ 87.17% of P
```

Examples:

| Consumer Price | rough web value before COGS/refund |
|---|---:|
| ₩1,900 | ~₩1,656 |
| ₩4,900 | ~₩4,271 |
| ₩7,900 | ~₩6,886 |
| ₩9,900 | ~₩8,630 |
| ₩12,900 | ~₩11,245 |
| ₩14,900 | ~₩12,988 |

Tax accounting can vary; this is a planning simplification, not bookkeeping guidance.

## 7.2 App-store planning

Apple Small Business Program currently reduces commission to 15% for eligible developers below the program threshold.

Source:
- https://developer.apple.com/kr/app-store/small-business-program/

Google Play Korea currently retains the familiar 15%-class small-developer/subscription structures; announced new fee programs roll out further in Korea on 2026-12-31 and must be re-checked before launch.

Source:
- https://support.google.com/googleplay/android-developer/answer/112622?hl=ko-KR

Pass 1's blended **79% gross→net realization** remains a conservative app-oriented planning assumption, not an official payout formula.

### Apple alternative billing warning

Current Korea-specific Apple external purchase entitlement charges a **26% Apple commission** on user price, while the developer also owns PSP/tax/support responsibilities.

Source:
- https://developer.apple.com/kr/support/storekit-external-entitlement-kr/

Therefore:

> `third-party billing inside Korean iOS = automatically cheaper`

is false.

If eligible for Small Business 15%, Apple IAP may be economically simpler than Korea-specific alternative billing.

---

# 8. Price ladder hypothesis

## 8.1 Do NOT launch with 8 confusing SKUs

The market supports many prices, but early MyeongHa needs a small number of explicit value objects.

Recommended first test ladder:

```text
FREE
→ first grounded profile / basic relationship / daily light value

ENTRY ARTIFACT
→ ₩4,900 candidate

CORE DECISION / DEEP READING
→ ₩7,900 or ₩9,900 candidate

HIGH-VALUE ARTIFACT
→ ₩12,900 or ₩14,900 candidate

MEMBERSHIP
→ later/parallel test around ₩9,900~12,900
```

This is not final pricing.

---

## 8.2 Entry SKU — ₩4,900 candidate

Possible job:

- first paid deep topic;
- monthly deep reading;
- compact relationship/career analysis;
- low-friction conversion test.

Why not ₩1,900 as primary?

- category already has ₩1,900 commodity report;
- MyeongHa needs room for differentiated governed artifact;
- low price does not guarantee conversion enough to offset lower ARPPU.

₩1,900 may still work as:

- launch sampler;
- one-time first purchase;
- limited micro artifact;

but should not define the core price anchor before testing.

---

## 8.3 Core SKU — ₩7,900 / ₩9,900 test

Best candidates:

- Decision Reading;
- deep career/love/money analysis;
- meaningful timing analysis;
- saved structured artifact.

Why this band:

- sits above commodity report;
- below many premium AI/human consultation anchors;
- current Korean digital-fortune products already occupy ₩8,900~14,900 report range.

### A/B arithmetic

Ignoring small COGS difference:

```text
₩7,900 → ₩9,900
```

The ₩9,900 arm can tolerate roughly **20.2% lower purchase conversion** and still generate similar gross revenue per exposure.

Likewise:

```text
₩4,900 → ₩7,900
```

₩7,900 can tolerate about **38% lower conversion** before losing gross revenue/exposure.

Therefore price tests should optimize:

```text
net contribution / eligible exposure
```

not conversion alone.

---

## 8.4 High-value artifact — ₩12,900 / ₩14,900

Candidates:

- full compatibility;
- annual deep report;
- multi-axis Decision analysis;
- future Life Chronicle.

Do not make it merely:

> "same answer, longer."

It needs a distinct value object:

- persistent;
- structured;
- evidence-linked;
- multi-dimensional;
- shareable/saveable where appropriate.

---

# 9. Membership hypothesis — simplify

Current market anchors range wildly:

```text
₩4,900        low-cost unlimited utility
₩8,800        Jamo Premium
₩17,000       Jamo Premium+
₩26,000       HelloBot membership
₩35,900+      Sajuping Starter+
```

The range is too wide to infer MyeongHa WTP directly.

Therefore first membership test should answer one thing:

> **Does a user want recurring value, or only episodic paid readings?**

Candidate first bundle:

```text
₩9,900~12,900 / month

+ 1 included core artifact or equivalent monthly benefit
+ deeper continuity / memory service
+ premium model/depth allowance
+ ad-free / convenience
+ paid artifact discount
```

Do not sell:

```text
"character likes you more"
"relationship level faster because paid"
```

Do not promise absolute unlimited premium compute.

---

# 10. Free boundary — economic correction

Pass 4 makes free Reading more economically feasible than Pass 2 implied.

Because C_read may be low:

```text
free micro-reading 0 vs 1/day
```

should be treated mainly as a **retention/cannibalization experiment**, not a cost emergency.

Candidate free structure:

```text
A. first natal grounded experience
B. ordinary relationship chat with invisible fair-use / abuse controls
C. daily light value
D. possibly one small grounded micro-analysis refresh
```

But do NOT make `one free full paid-equivalent artifact per day` the default.

The key question is:

> Does free grounded value increase paid intent by creating trust and habit, or satisfy the exact need that would otherwise convert?

Measure:

- D1/D7/D30;
- first paid conversion;
- paid artifact view→purchase;
- free analysis consumption/user;
- cannibalization survey;
- C_chat and C_read separately.

---

# 11. Chat economics remains the bigger marginal-cost problem

This is an important inversion.

A one-time Reading may cost tens of won.

But a heavy relationship user can generate:

```text
450 turns × ₩3 all-in  = ₩1,350 / month
1,000 turns × ₩3       = ₩3,000 / month
1,000 turns × ₩10      = ₩10,000 / month
```

Therefore the dangerous cost driver is likely:

> **persistent high-volume relationship chat, not deterministic Saju computation itself.**

This strengthens:

- cheap-model routing;
- context compression;
- memory retrieval caps;
- P95/P99 cost telemetry;
- premium model entitlement;
- abuse/rate controls.

It weakens:

- artificial scarcity around every governed Reading solely for COGS protection.

---

# 12. Launch recommendation after Pass 4

## Current leading launch candidate

```text
OPEN / LOW-FRICTION RELATIONSHIP
+
FREE GROUNDED FIRST VALUE
+
EXPLICIT PAID ARTIFACTS
+
OPTIONAL MEMBERSHIP
+
PREMIUM COMPUTE AS COST GUARD
```

### Key change from H-R17 wording

Do not assume:

```text
new grounded semantic execution
= must consume visible currency
```

Instead:

```text
new grounded execution
= measurable cost/usage boundary

paid artifact
= explicit value boundary
```

These are allowed to coincide, but do not have to.

---

# 13. Recommended launch experiments

## E-P4-01 — first-purchase price

Same artifact:

```text
₩4,900
vs
₩7,900
vs
₩9,900
```

Primary metric:

```text
net contribution / eligible user
```

Secondary:

- conversion;
- refund;
- completion/open rate;
- repeat purchase within 30/90 days.

## E-P4-02 — free analysis depth

```text
A: first-value only
B: first-value + daily/light grounded micro-analysis
```

Measure retention AND paid cannibalization.

## E-P4-03 — explicit SKU vs internal allowance

Only after enough traffic:

```text
A: explicit "Decision Reading ₩X"
B: analysis-right bundle / replenishing allowance
```

Hypothesis:

- explicit SKU is cognitively cleaner;
- allowance may improve repeat use/subscription but increase meter anxiety.

## E-P4-04 — transaction vs membership

After a user has at least one meaningful return visit / paid-intent event:

```text
transaction offer
vs
membership bundle
```

Do not hard-paywall onboarding to answer this.

---

# 14. Kill / promotion conditions

### Promote visible analysis allowance if:

- users naturally perform many distinct governed Reading executions;
- explicit pay-per-artifact becomes repetitive/frictional;
- allowance materially increases repeat purchase/subscription;
- users understand consumption without anxiety/surprise.

### Demote visible allowance if:

- `what costs Ping?` confusion is common;
- users avoid asking natural questions;
- refund/support from accidental consumption rises;
- direct C_read is negligible and allowance does not improve monetization.

### Promote membership if:

- 30/60/90-day repeat usage is real;
- included monthly value is actually consumed;
- member contribution remains positive at P95 usage;
- churn is materially better than AI-subscription benchmark risk.

### Keep transaction-first if:

- usage is episodic around life events;
- repeat purchase exists but monthly habit is weak;
- membership churn is high;
- explicit artifact WTP is stronger than continuity WTP.

---

# 15. Pass 4 bottom line

The strongest new result is not a specific price.

It is this:

> **MyeongHa should not confuse a clean technical execution boundary with a necessary consumer billing unit.**

Current evidence suggests:

```text
C_chat is the persistent cost problem.
C_read may be cheap because Saju semantics are deterministic/governed.
Paid Reading should therefore be priced mainly on user value, not tokens.
```

That shifts the launch preference toward:

```text
relationship remains natural
→ free grounded trust is demonstrated
→ user buys explicit high-value result
→ repeat users are offered membership
→ expensive compute is bounded separately
```

instead of forcing every meaningful Saju question through a visible coin meter from day one.
