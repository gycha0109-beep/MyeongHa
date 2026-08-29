# 명하 Revenue Architecture Decision Register v0.1

> Product: **명하 / MyeongHa**  
> Status: **Working decision register**  
> Date: **2026-08-30 KST**

---

## 0. Decision Levels

이 문서는 `가설`과 `결정`을 분리한다.

```text
RESEARCH_ONLY
→ 근거/관찰

WORKING_DECISION
→ 현재 설계/실험의 기본 방향으로 사용하지만 실제 데이터로 뒤집을 수 있음

PRODUCT_AUTHORITY
→ 실제 product policy / implementation에서 따라야 하는 결정
```

Revenue 문서가 기존 source authority를 임의로 덮어쓰지 않는다.

실행 세부는 해당 spec이 authority다.

- quota/abuse → `COST_QUOTA_ABUSE_SPEC.md`
- payment/entitlement → `COMMERCE_ENTITLEMENT_SPEC.md`
- analytics → `ANALYTICS_EXPERIMENT_SPEC.md`
- Saju semantics → Saju authority
- character/relationship → Character / Relationship authority

---

# D-R01 — Revenue track는 implementation authority와 분리

**Status: PRODUCT_AUTHORITY — documentation boundary**

결정:

```text
Revenue research
→ 무엇을 팔고 얼마의 경제성이 필요한지 정의

Runtime specs
→ 실제 gate / state / authority / retry / privacy 구현
```

Revenue 계산상의 quota 숫자를 runtime quota로 자동 승격하지 않는다.

이유:

- market price는 변한다.
- unit economics assumption은 실험값이다.
- authority 문서와 섞이면 revenue 가설이 server invariant로 굳어질 위험이 있다.

---

# D-R02 — 현재 Revenue Architecture는 단일 BM으로 확정하지 않는다

**Status: WORKING_DECISION**

현재 leading structure:

```text
Free Relationship Core
× Paid Saju / Decision Value
× Optional Membership
× Premium Compute
```

하지만 각 층은 독립적으로 kill 가능해야 한다.

예:

- relationship lift 실패 → character investment 축소 가능
- membership 실패 → transaction 중심 유지 가능
- fortune repeat 실패 → membership/IP/B2B 등 재검토 가능

`한 요소 실패 = 전체 프로젝트 실패` 구조로 만들지 않는다.

---

# D-R03 — Message Metering을 기본 monetization으로 사용하지 않는다

**Status: WORKING_DECISION**

기본 원칙:

```text
ordinary relationship message
→ per-message visible credit meter 없음
```

이유:

- 관계 대화의 자연스러운 짧은 메시지를 위축시킬 위험.
- 사용자가 관계 대신 비용 최적화를 시작할 가능성.

예외:

```text
user-selected premium compute class
```

는 사용량/세션/allowance 형태로 별도 과금할 수 있다.

Revisit trigger:

- ordinary chat COGS가 건강한 수준으로 내려가지 않음.
- abuse/fair-use control로도 contribution이 음수.

---

# D-R04 — Monetization state가 캐릭터 애정/관심을 조작하지 않는다

**Status: WORKING_DECISION — strong guardrail candidate**

금지 방향:

```text
pay → trust bonus
pay → closeness bonus
pay → affection multiplier
free user → 캐릭터가 사주를 더 자주 영업
paid user → 캐릭터가 더 다정함
```

결정 의도:

> 결제는 `접근 가능한 artifact / compute / content`를 바꿀 수 있지만 캐릭터의 진정성 자체를 사지 않게 한다.

사주 initiative는 캐릭터 capability / conversation context / Saju availability에 의해 결정하고 payer state를 motive로 사용하지 않는다.

이유:

- Pay-to-love 위험.
- 영업봇 인식 위험.
- Character Runtime과 commerce incentive가 혼합되는 architecture pollution 방지.

Revisit trigger:

- 없음이 기본. 변경하려면 별도 ethics/trust review 필요.

---

# D-R05 — Paid Value는 `더 긴 답변`이 아니라 별도 artifact / analysis여야 한다

**Status: WORKING_DECISION**

유료 후보:

```text
Detailed Saju Reading
Decision Reading
Compatibility
Annual / period analysis
Life Chronicle
Multi-character consultation
```

무료 chat을 의도적으로 바보로 만들지 않는다.

차이:

```text
free chat
→ 대화 / 현실적 조언 / 이미 허용된 해석의 가벼운 설명

paid value
→ 새 governed reading execution
→ 구조화된 비교
→ 기간 분석
→ reusable/savable artifact
→ richer bounded evidence
```

목표:

> 무료 답변을 숨겨 결제시키는 것이 아니라 **다른 종류의 결과물**을 판매한다.

---

# D-R06 — Membership은 `대화권`보다 continuity/value bundle로 검증

**Status: WORKING_DECISION**

기본 후보:

```text
memory / continuity benefits
+ proactive interaction
+ included monthly paid value
+ premium allowance
+ episode/content benefit
+ discount / ad-free benefit where applicable
```

아직 확정하지 않는 것:

- ₩9,900 / ₩12,900 / ₩14,900 등 가격
- exact memory depth
- exact monthly allowance
- exact episode access

이 값은 experiment 대상이다.

---

# D-R07 — Expensive compute는 core chat과 분리한다

**Status: WORKING_DECISION**

기본 전략:

```text
ordinary chat
→ cheap/efficient model path 우선

premium/high-cost experience
→ explicit premium path
```

premium 후보:

- advanced reasoning
- long-context reread
- multi-character consultation
- voice
- image

내부 목표:

> premium model leakage가 ordinary chat economics를 무너뜨리지 않게 한다.

실제 provider/model은 OPEN이며 benchmark 후 선택한다.

---

# D-R08 — Revenue Architecture의 핵심 KPI는 MAU/매출 단독이 아니다

**Status: WORKING_DECISION**

최소 primary viability metrics:

```text
1. free → payer conversion
2. effective AI cost / committed turn
3. Character/Relationship D30/D90 retention lift
```

보조 핵심:

```text
payer contribution
free-user cost
repeat purchase
subscription churn
refund
CAC
LTV:CAC
CAC payback
P90/P99 user cost
```

MAU 증가만으로 success 판정하지 않는다.

---

# D-R09 — Current Working Economic Guardrails

**Status: RESEARCH_ONLY / NOT runtime quota**

현재 v0.1 model에서:

```text
Base break-even payer share ≈ 2.61%
Base break-even chat cost   ≈ ₩4.72 / turn
```

Working healthy target candidate:

```text
effective ordinary chat cost
≈ ₩2~3 / committed turn 이하
```

이 값은 actual quality/usage/price telemetry가 들어오면 교체한다.

`COST_QUOTA_ABUSE_SPEC.md`의 quota를 이 숫자로 자동 변경하지 않는다.

---

# D-R10 — 광고는 금지도 채택도 하지 않는다

**Status: OPEN**

검토 가능한 역할:

> free-tier subsidy

유력 surface:

- discovery
- free daily content
- feed/result exploration
- optional rewarded access

부적합 후보:

- private emotional chat 중간 interruption
- sensitive consultation 중간
- paid reading

실제 광고 BM은 retention/brand/eCPM 실험 후 결정.

---

# D-R11 — Stage 0~1 self-hosting을 기본 전략으로 삼지 않는다

**Status: WORKING_DECISION**

초기:

```text
API / managed provider
+ routing
+ caching
+ context compression
```

을 먼저 최적화한다.

Self-host 검토 조건:

- sustained high token throughput
- model quality benchmark pass
- provider/API cost보다 총소유비용(TCO)이 낮음
- operational capacity 존재

단순 `MAU가 커졌다`만으로 self-host하지 않는다.

---

# D-R12 — Growth spend는 contribution economics 이후 확대

**Status: WORKING_DECISION**

금지:

```text
scale-negative economics
+ paid acquisition
→ MAU 성장으로 문제 은폐
```

paid growth 확대 전 최소 확인:

```text
positive contribution cohort
known CAC
known payback
known retention
known P90/P99 AI COGS
```

---

# Open Decisions

아직 결정하지 않음:

```text
O-R01 exact launch pricing
O-R02 exact free allowance / fair-use policy
O-R03 membership exact benefits
O-R04 ads adoption
O-R05 web/iOS/android sales mix
O-R06 annual subscription
O-R07 premium compute unit (credit / allowance / session)
O-R08 first paid Saju SKU
O-R09 B2B timing
O-R10 self-host crossover
```

---

# Decision Principle

> Revenue가 캐릭터를 조종하지 않고, **접근 가능한 가치와 계산 자원에 가격을 붙인다.**

그리고:

> 숫자가 가설을 반증하면 BM을 바꾸며, 이미 만든 기능을 지키기 위해 economics를 왜곡하지 않는다.
