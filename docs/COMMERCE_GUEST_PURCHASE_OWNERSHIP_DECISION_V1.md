# 명하 Guest Purchase / Ownership Decision v1

> Product: **명하 (MyeongHa)**  
> Date: **2026-09-05**  
> Decision: **P0-CM-04**  
> Repository baseline: `5f5b63241a278addb5cff5a354aae17cc335bf07`  
> Supersedes: Commerce Architecture v1의 Member-only Purchase Intent / Guest purchase OUT OF SCOPE 규칙  
> Status: **DECIDED / ARCHITECTURE DELTA CLOSED / IMPLEMENTATION NOT STARTED**

---

## 1. 결정

명하의 Web one-off Commerce는 **비회원(Guest) 구매를 허용한다.**

```text
active Guest OR active Member
→ server resolves exact canonical subjects.id
→ Purchase Intent
→ provider handoff
→ server-side payment verification
→ commerce evidence / grant / event under the exact purchase owner subject
→ Effective Entitlement
→ access
```

Guest 구매는 임시 결제가 아니다. 서버가 검증한 결제와 그로부터 생성된 권리는 Guest의 canonical `subjects.id`에 귀속되는 정상 Commerce lineage다.

이 결정은 다음 기존 규칙을 폐기한다.

```text
Guest purchase = OUT OF SCOPE v1
Member-only Purchase Intent = mandatory MVP rule
Guest must promote before starting purchase
```

단, 현재 구현된 `cmd_create_purchase_intent_v1`은 역사적 v1 command로 그대로 Member-only를 유지한다. Guest 지원은 기존 migration을 수정하지 않고 **새로운 Purchase Intent command/version**으로 구현한다.

---

## 2. 왜 이 모델을 선택하는가

명하의 canonical owner는 이미 Member account 자체가 아니라 `subjects.id`다.

현재 Guest bootstrap/auth도 Guest를 하나의 canonical subject로 해석하고, 새 계정으로 Guest→Member promotion할 때는 **동일한 subject row의 kind/auth binding만 바꾸고 owner FK를 이동하지 않는다.**

따라서 Guest 구매를 허용하기 위해 별도의 임시 구매자 ID나 이메일 기반 claim code를 발명할 필요가 없다.

```text
Guest subject G
→ purchase owned by G
→ new-account promotion
→ same subject G becomes Member
→ purchase/receipt/grant/event subject_id remains G
```

이 방식은 결제 원본과 권리 provenance를 재작성하지 않으면서 Guest→Member 연속성을 가장 단순하게 보장한다.

---

## 3. Canonical Commerce Owner

Commerce owner authority를 다음처럼 수정한다.

```text
canonical Commerce owner
= server-resolved canonical subjects.id

eligible purchase owner
= active Guest with currently authenticated Guest session
  OR
  active Member resolved from verified Member authentication
```

금지:

```text
client-supplied subject_id
client-supplied userId
provider customer id as MyeongHa owner
email/phone alone as ownership proof
payment redirect query parameter as ownership proof
raw checkout success callback as ownership proof
```

Guest와 Member 모두 같은 `subjects.id` ownership axis를 사용한다.

---

## 4. Guest Purchase Initiation

Guest가 결제를 시작할 때 서버는 현재 Guest 인증을 검증하고 exact Guest subject를 resolution한다.

```text
Guest bearer proof verified at API/auth boundary
→ canonical active Guest subject resolved
→ server-owned Product/Offer resolution
→ Purchase Intent created for that subject
→ provider checkout/session created outside rights transaction
```

Client가 전달할 수 있는 값은 Product/Offer 선택과 idempotency material 같은 요청 정보뿐이며, owner/price/currency/capability/scope는 authority가 아니다.

Guest session이 결제 도중 만료되더라도 이미 provider에서 확인된 결제 사실 자체를 무효화하지 않는다. 결제 권리의 lifecycle은 Guest bearer TTL이 아니라 verified Commerce evidence와 Entitlement Grant lifecycle을 따른다.

---

## 5. 결제 완료와 즉시 이용

Guest는 회원가입을 완료하기 전에도 서버가 정상 검증한 유료 권리를 사용할 수 있다.

```text
verified provider payment
→ Guest-owned Receipt / Provider Event provenance
→ Guest-owned Entitlement Grant/Event
→ Guest Effective Entitlement
→ paid capability access
```

단, 실제 rights mutation은 기존 Commerce 원칙대로 반드시 server-verified evidence에서 시작한다.

```text
client success UI → entitlement       # 금지
provider redirect → entitlement       # 금지
verified server evidence → entitlement # 유일한 허용 경로
```

---

## 6. Guest → 새 Member 전환

새 계정 생성 promotion은 현재 production Guest promotion authority를 그대로 재사용한다.

현재 promotion은 Guest의 exact `subject_id`를 유지한다.

```text
before
subjects.id = G
kind = guest

purchase_intents.subject_id = G
commerce_receipts.subject_id = G
entitlement_grants.subject_id = G

promotion
→ same row G: kind = member + auth_user_id binding

after
all Commerce rows still subject_id = G
```

따라서 **Commerce owner migration, receipt rewrite, grant transfer, entitlement copy를 하지 않는다.**

Promotion response loss/retry 또한 기존 same-subject promotion idempotency semantics를 사용한다.

---

## 7. Guest → 기존 Member 로그인/병합

기존 Member `M`이 이미 존재하는 상태에서 Guest `G`가 그 계정으로 로그인하는 경우에는 `G`를 `M`으로 바꿔 쓰거나 Commerce row의 `subject_id`를 UPDATE하지 않는다.

```text
Guest G paid purchase
→ verified Guest ownership remains G

verified existing-member merge completes
→ G.status = merged
→ G.merged_into_subject_id = M
→ immutable historical Commerce lineage remains owned by G
→ M access may compose current rights from M + verified direct merged Guest G
```

현재 저장소가 이미 사용하는 direct merged-Guest lineage 원칙을 Commerce에도 적용한다.

### Effective Commerce Subject Set

현재 권리 조회 시 사용할 conceptual subject set은 다음이다.

```text
active Guest G
→ { G }

canonical Member M
→ { M }
   UNION
   { G | G.kind='guest'
         AND G.status='merged'
         AND G.merged_into_subject_id=M }
```

v1에서는 **direct merged Guest만** 포함한다. 임의의 transitive graph traversal이나 client-provided lineage는 허용하지 않는다.

### Composite access

같은 `(entitlement_key, scope_key_norm)`에 대해 lineage subject set의 현재 유효 Grant가 하나라도 있으면 access는 active다.

기존 Effective Entitlement aggregate 원칙을 그대로 확장한다.

```text
current contributor count = lineage subject set의 current active Grant 수 합계

0
→ inactive

1+
→ active

active contributor 중 unbounded가 하나라도 있음
→ effective_valid_until = NULL

모두 finite
→ effective_valid_until = MAX(valid_until)
```

이 composite는 **read/access composition**이지 historical owner rewrite가 아니다.

### 중요한 현재 구현 경계

기존 Member로 Guest를 합치는 generic merge mutation은 현재 `SRC-24` 때문에 production-authoritative implementation이 아직 닫히지 않았다.

따라서 이 문서는 다음을 결정한다.

```text
Commerce가 merge 후 rights를 어떻게 보존/조합할지 = DECIDED
범용 Guest→existing Member merge executor 자체 = 여전히 별도 authority/implementation gate
```

`SRC-24`를 우회해 Commerce가 임의의 cross-domain merge command를 만들지 않는다.

Production Guest purchase activation 전에 **Guest→existing Member paid-right continuity path가 실제로 검증되어야 한다.**

---

## 8. Refund / Revoke / Restore

Refund/revoke/restore는 항상 original Commerce lineage를 따라간다.

예:

```text
Guest G purchase
→ G grant active
→ G later merged into Member M
→ M currently inherits G right
→ provider refund for original G transaction
→ original G grant revoked
→ composite M access recomputed
```

M 자체 또는 다른 merged Guest가 동일 capability에 별도 active grant를 가지고 있으면 그 grant는 영향을 받지 않는다.

즉 한 purchase source의 revoke가 다른 independent grant를 제거하지 않는 기존 `CE-08`을 그대로 유지한다.

---

## 9. Guest Session 만료와 결제 복구

Guest authentication TTL은 현재 7일이지만, 이 TTL은 **결제 권리의 만료시간이 아니다.**

```text
Guest bearer expired
≠ payment revoked
≠ entitlement revoked
```

다만 사용자가 Guest credential을 잃은 뒤 다시 권리를 찾으려면 selected PSP가 제공하는 authoritative transaction/current-state lookup을 통한 recovery가 필요하다.

따라서 P0-CM-02 provider selection은 다음 조건을 추가로 만족해야 한다.

```text
server-owned Purchase Intent ↔ provider transaction correlation
provider-side authoritative transaction lookup
redirect/client callback 없이도 current payment state 재확인 가능
replay-safe recovery
no raw bearer/receipt secret durable storage requirement unless separately approved
```

Provider-specific recovery identifier/canonicalization은 PSP가 확정되기 전 임의로 만들지 않는다.

---

## 10. Revised Commerce Invariants

기존 Commerce invariant 중 다음을 supersede한다.

### CE-07 — owner isolation

기존 Member-only 문구를 canonical subject 기준으로 일반화한다.

```text
한 canonical Commerce owner subject의 evidence/right를
unrelated subject/account가 claim하거나 inherit할 수 없다.

예외는 서버가 검증한 동일-subject promotion 또는
완료된 canonical Guest→Member merge lineage뿐이다.
```

### CE-12 — Guest purchase

기존 CE-12를 폐기하고 다음으로 교체한다.

```text
active Guest 또는 active Member만 purchase를 시작할 수 있다.
owner는 server-resolved canonical subjects.id다.
Guest-owned verified commerce effect는 허용한다.
```

### CE-23 — no commerce reparent

```text
Guest→Member lifecycle 때문에 immutable Receipt/Event/Grant provenance의
historical subject owner를 rewrite하지 않는다.
```

### CE-24 — session lifetime separation

```text
Guest credential/session expiry alone cannot revoke or expire a verified paid right.
```

### CE-25 — merged lineage isolation

```text
Member가 inherited Commerce access를 얻으려면 server-verified direct merged-Guest lineage여야 한다.
unrelated Guest lineage, client-supplied lineage, email match만으로 rights를 합치지 않는다.
```

### CE-26 — inherited revoke correctness

```text
merged Guest의 source grant가 refund/revoke/expire되면
canonical Member의 composed current access에도 즉시 반영되어야 한다.
다른 independent active grant는 유지한다.
```

기존 `CE-01..06`, `CE-08..11`, `CE-13..22`는 변경하지 않는다.

---

## 11. Schema / Command 영향

현재 Commerce base schema는 이미 `subject_id → subjects(id)`로 소유권을 표현하며 DB table 자체에 Member-only check가 없다. Member-only restriction은 현재 Purchase Intent command에 있다.

따라서 이 architecture decision 자체는 기존 migration을 수정하지 않는다.

### 구현 시 필요한 새 version

```text
Purchase Intent v2
- active Guest | active Member 허용
- exact current canonical subject context 검증
- server-owned Offer/Capability pinning
- existing v1 replay semantics 보존

Guest-aware entitlement access/read
- active Guest: self only
- Member: self + verified direct merged Guest lineage
- no historical row reparent

verified apply runtime
- evidence owner must equal original Purchase Intent/Receipt lineage
- Guest/Member 모두 동일 owner invariant 적용
```

현재 `0660_purchase_intent_create_command.sql`을 수정하거나 의미를 바꾸지 않는다.

---

## 12. Negative / Concurrency / Recovery Test Matrix 추가

Guest purchase implementation은 최소 다음을 증명해야 한다.

```text
1. active Guest purchase intent                     → PASS
2. expired/consumed/unrelated Guest session         → DENY
3. client subject override                           → DENY
4. Guest purchase verified once, callback ×N         → one commerce effect
5. Guest purchase → new Member promotion             → same subject / rights preserved
6. promotion response loss + retry                    → no duplicate rights
7. Guest G → existing Member M verified merge         → M can read G current right
8. unrelated Member X attempts G lineage claim        → DENY
9. same Guest lineage → two Member destinations       → DENY
10. historical receipt/grant/event subject rewrite    → DENY
11. Guest session expiry after verified purchase      → right remains
12. refund after Guest→Member merge                   → inherited right removed
13. refund one grant while another active grant exists→ access remains
14. concurrent Guest purchase replay                  → one Purchase Intent/effect
15. provider verify success + DB failure              → retry-safe
16. DB success + response loss                        → replay-safe
17. sandbox evidence                                  → no production grant
18. raw provider credential/receipt secret leakage    → fail-closed
```

---

## 13. PSP 결정에 미치는 영향

이 결정으로 **“명하는 비회원 구매를 금지한다”는 제품 정책 blocker는 제거된다.**

따라서 TossPayments 등 비회원 구매가 가능한 Web PSP 평가에서 Member-only 정책 충돌을 더 이상 blocker로 사용하지 않는다.

하지만 P0-CM-02 자체는 아직 닫히지 않는다.

현재 알려진 merchant facts상 사업자 미등록 상태이므로 provider 계약/Production activation은 계속 HOLD다.

```text
Guest purchase policy compatibility = RESOLVED
merchant registration / settlement eligibility = STILL BLOCKED
provider ordering/webhook/refund/reconciliation proof = STILL REQUIRED
```

이 결정은 TossPayments 또는 다른 PSP를 자동 선택하지 않는다.

---

## 14. P0-CM-03 / 유료 상품 gate는 그대로 유지

Guest가 살 수 있다는 결정은 **무엇을 팔 것인지**를 결정하지 않는다.

현재 launch paid Product/Capability는 Saju production interpretation authority 때문에 여전히 OPEN-P0다.

금지:

```text
Guest purchase 허용
→ Paid Deep Reading SKU 자동 승인
```

P0-CM-03이 닫히기 전 enabled paid catalog / production fulfillment은 계속 HOLD한다.

---

## 15. 현재 상태

```text
P0-CM-01 Web + one-off launch rail               = DECIDED
P0-CM-02 exact Web PSP                            = OPEN-P0
P0-CM-03 launch paid Product/Capability           = OPEN-P0 / upstream blocked
P0-CM-04 Guest purchase ownership model           = DECIDED

Guest purchase architecture                       = AUTHORIZED
Guest Purchase Intent/runtime                     = NOT IMPLEMENTED
Guest verified payment→grant runtime               = NOT IMPLEMENTED
Guest→new Member Commerce continuity               = ARCHITECTURALLY SATISFIED BY SAME SUBJECT
Guest→existing Member paid-right continuity        = DESIGNED / IMPLEMENTATION GATED BY MERGE AUTHORITY
Provider SDK/webhook                               = HOLD
Production Commerce activation                     = NOT AUTHORIZED
```

---

## 16. Supersession

이 문서는 2026-09-05 이후 다음 historical 문구보다 우선한다.

```text
COMMERCE_ENTITLEMENT_ARCHITECTURE_V1.md
- canonical Member owner
- Member-only Purchase Intent
- Guest purchase OUT OF SCOPE v1
- CE-12 Guest promotion-before-purchase requirement
- §9 v1 is Member-only

COMMERCE_ENTITLEMENT_SPEC.md
- Member-owned Purchase Intent
- Member-only Purchase Intent hardening as future requirement
```

단, 현재 구현 상태를 기술한 “`cmd_create_purchase_intent_v1`이 Member-only다”라는 사실은 계속 맞다.

나머지 provider-neutral Commerce/Entitlement invariants와 P0 decision은 변경하지 않는다.
