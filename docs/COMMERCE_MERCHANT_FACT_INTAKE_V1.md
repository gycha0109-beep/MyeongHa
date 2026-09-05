# 명하 Commerce Merchant Fact Intake v1

> Product: **명하 (MyeongHa)**  
> Date: **2026-09-05**  
> Parent evaluation: `docs/COMMERCE_WEB_PSP_EVALUATION_V1.md`  
> Current evidence refresh: `docs/COMMERCE_WEB_PSP_EVIDENCE_REFRESH_V1.md`  
> Parent architecture: `docs/architecture/COMMERCE_ENTITLEMENT_ARCHITECTURE_V1.md`  
> Status: **P0-CM-02 INPUT CONTRACT / NO PROVIDER SELECTED / IMPLEMENTATION HOLD**

---

## 1. Purpose

`P0-CM-02`는 기술 문서만으로 닫을 수 없다. 실제 merchant/business facts와 provider onboarding evidence가 필요하다.

이 문서는 다음만 고정한다.

```text
어떤 사실이 필요한가
어떤 값은 저장소에 남겨도 되는가
어떤 값은 저장소에 남기면 안 되는가
누가/무엇이 각 사실을 확정할 수 있는가
어떤 조건에서 PSP 선택을 진행할 수 있는가
```

이 문서는 provider를 선택하지 않으며, provider-specific SDK/webhook/credential/persistence/money→rights 구현을 승인하지 않는다.

---

## 2. Privacy / repository recording rule

P0-CM-02를 닫기 위해 **실제 비밀값이나 고위험 식별자**를 Git 저장소에 기록할 필요가 없다.

### 저장소에 기록 가능한 분류값

예:

```text
merchant legal form = not_registered | individual_business | corporation | other
merchant registration country = not_applicable | KR | ...
settlement account country = not_established | KR | ...
launch buyer geography = korea_only | korea_first | international
presentment currency = KRW | ...
required payment methods = domestic_card, easy_pay, ...
```

### 저장소에 기록 금지

```text
사업자등록번호 원문
법인등록번호 원문
주민등록번호/개인식별번호
실제 은행 계좌번호
카드번호/PAN/CVV/PIN
provider API secret / client secret / bearer token
전자서명 private key / certificate private material
실제 계약서의 비공개 credential 또는 secret
```

필요한 경우 증거는 `verified externally`, `provider confirmed`, `contract confirmed`와 같은 상태 또는 비밀이 아닌 문서 locator만 기록한다.

---

## 3. M1-M9 canonical intake

### M1. Merchant legal form

허용값:

```text
not_registered
individual_business
corporation
other_eligible_entity
unknown
```

`not_registered`는 실제 merchant/operator가 현재 등록된 merchant/business entity가 없다고 명시한 상태다. `unknown`과 동일하지 않으며, provider eligibility를 자동 판정하지도 않는다.

확정 주체:

```text
actual merchant/operator
```

저장소에 필요한 것은 **법적 형태 분류값뿐**이다. 사업자등록번호 자체는 필요하지 않다.

### M2. Merchant registration country

허용값:

```text
not_applicable
ISO 3166-1 alpha-2 country code
unknown
```

예: `KR`

`not_applicable`는 M1이 `not_registered`인 경우처럼 현재 등록 국가 자체가 없는 상태를 표현한다. 등록 여부를 모르는 상태는 `unknown`으로 남긴다.

확정 주체:

```text
actual merchant/operator
```

### M3. Settlement bank/account country

허용값:

```text
not_established
ISO 3166-1 alpha-2 country code
unknown
```

`not_established`는 PSP 정산에 사용할 계좌가 아직 정해지지 않은 상태다. 개인이 보유한 임의의 은행계좌 국가를 대신 기록하지 않는다.

저장소에는 정산 계좌가 확정된 경우에도 **계좌 국가만** 기록한다. 은행명/계좌번호는 PSP 선택 authority에 필수값이 아니므로 저장하지 않는다.

확정 주체:

```text
actual merchant/operator
```

### M4. Launch buyer geography

허용값:

```text
korea_only
korea_first
international
other explicitly documented scope
unknown
```

이 값은 사용자 위치를 보고 추론하지 않는다. 실제 launch product decision이어야 한다.

확정 주체:

```text
product/operator decision
```

### M5. Launch presentment currency

허용값:

```text
one or more ISO 4217 currency codes
unknown
```

예: `KRW`

이 값 역시 한국 서비스라는 인상만으로 추론하지 않는다.

확정 주체:

```text
product/operator decision
```

### M6. Required payment methods

가능한 예:

```text
domestic_card
foreign_card
easy_pay
account_transfer
virtual_account
mobile_payment
other explicitly required method
```

Provider가 지원하는 결제수단 목록은 M6가 아니다. **명하 launch에 반드시 필요한 결제수단**만 M6이다.

확정 주체:

```text
product/operator decision
```

### M7. Website / merchant review readiness

현재 상태:

```text
NOT READY
```

현재 저장소 authority상 이유:

```text
launch paid Product/Capability = P0-CM-03 OPEN / Saju upstream blocked
merchant legal identity disclosure surface = not complete
refund/cancellation customer policy = not closed
payment terms/customer notice surface = not complete
```

M7은 실제 Web inventory와 Product/Legal authority를 다시 확인해서 닫는다. 가짜 상품/가짜 사업자 정보로 provider review를 통과시키지 않는다.

확정 주체:

```text
repository inspection + product/legal closure
```

### M8. Commercial acceptance

필요한 판단:

```text
merchant is eligible for provider contract
required payment methods are commercially available
fees are acceptable
settlement cycle is acceptable
industry/category review is acceptable
required reserve/deposit/guarantee terms, if any, are acceptable
```

Public pricing 또는 provider 신청 화면의 요율은 **MyeongHa가 그 조건을 수락했다는 증거가 아니다**.

저장소에는 필요하면 다음 정도만 기록한다.

```text
commercial_terms = accepted | rejected | pending
verified_at = date
provider = candidate
```

비공개 계약 상세/계좌/credential은 저장하지 않는다.

확정 주체:

```text
actual provider application/contract + merchant/operator acceptance
```

### M9. Member-only purchase compatibility

명하 Commerce v1 invariant:

```text
Guest purchase = DENY
Purchase Intent = active Member only
```

따라서 M9는 다음 중 하나로만 닫는다.

```text
A. selected provider confirms Member-only checkout/onboarding is acceptable
OR
B. product/Commerce authority explicitly reopens and revises Member-only policy
```

현재 B는 승인되지 않았다.

사용자 추측 또는 provider SDK 기능만으로 M9를 `confirmed` 처리하지 않는다.

확정 주체:

```text
provider/contract confirmation
OR explicit architecture/product decision
```

---

## 4. Current values at this revision

```text
M1 merchant legal form              = UNKNOWN
M2 merchant registration country    = UNKNOWN
M3 settlement account country       = UNKNOWN
M4 launch buyer geography           = UNKNOWN
M5 launch presentment currency      = UNKNOWN
M6 required payment methods         = UNKNOWN
M7 website/review readiness         = NOT READY
M8 commercial acceptance            = UNKNOWN
M9 Member-only compatibility        = NOT PROVEN for Toss / NOT PROVEN for KCP
```

Do not replace `UNKNOWN` with an inferred value. A known negative/absent state such as `not_registered`, `not_applicable`, or `not_established` must also not be collapsed back into `UNKNOWN`.

---

## 5. Minimal operator input needed

Repository/provider research cannot truthfully supply the following six inputs:

```text
I1 = M1 merchant legal form
I2 = M2 merchant registration country
I3 = M3 settlement account country
I4 = M4 launch buyer geography
I5 = M5 launch presentment currency
I6 = M6 required payment methods
```

If M1 is `not_registered`, I2 may be `not_applicable`. If a PSP settlement account has not yet been selected, I3 may be `not_established`. These states are factual intake results, not provider eligibility conclusions.

M8 may require an operator preference before contracting, but final closure requires actual provider commercial evidence.

M7 and M9 are not satisfied by operator declaration alone.

No registration number, account number, credential, or private contract text should be requested for this intake.

---

## 6. Provider-selection gate

A provider may be selected only when all of the following are true:

```text
1. M1/M2/M3 are known enough to prove merchant/provider eligibility.
2. M4/M5/M6 are explicitly decided.
3. Provider supports M4/M5/M6 for the actual merchant eligibility context.
4. M7 has a truthful review-ready plan/surface; no fabricated commerce content.
5. M8 is accepted or contractually resolvable.
6. M9 is confirmed without silently weakening Member-only purchase.
7. Existing Commerce technical correctness requirements remain satisfied.
```

If more than one candidate satisfies the mandatory gate, this intake contract does **not** auto-select between them. Final provider choice remains an explicit `P0-CM-02` decision using the then-current technical, merchant, onboarding and commercial evidence.

---

## 7. Current candidate consequences

### Toss Payments direct

```text
technical fit                   = STRONG
webhook retry/transmission      = PROVEN
POST idempotency                = PROVEN in current evaluation
M9 Member-only compatibility    = NOT PROVEN
merchant production eligibility = NOT PROVEN
```

### NHN KCP direct

```text
technical fit                   = VIABLE
reconciliation query            = STRONG
webhook retry                   = PROVEN up to documented retry contract
provider mutation idempotency   = NOT SUFFICIENTLY PROVEN
M9 Member-only compatibility    = NOT PROVEN
merchant production eligibility = NOT PROVEN
```

No winner is selected by this document.

---

## 8. What remains HOLD

Until `P0-CM-02` closes:

```text
provider-specific canonical evidence serializer
provider-specific verifier/comparator
provider SDK integration
webhook route
production provider credential binding
provider-specific receipt/event persistence
provider ordering implementation
money → rights apply runtime
```

Independently, `P0-CM-03` remains blocked by Saju production interpretation/public reading authority and `P0-PR-01` remains open for legal/accounting/backup retention lifecycle.

---

## 9. Closure record shape

When enough evidence exists, a later decision revision should record only non-secret facts in a compact form such as:

```text
P0-CM-02 = DECIDED
provider = <selected provider>

M1 = <legal-form classification or not_registered>
M2 = <country code or not_applicable>
M3 = <country code or not_established>
M4 = <buyer geography>
M5 = <currency set>
M6 = <required method set>
M7 = READY / verified against actual site
M8 = ACCEPTED / provider-contract evidence verified
M9 = CONFIRMED / provider-compatible with Member-only purchase

decision evidence date = YYYY-MM-DD
```

Secret material must remain outside Git authority and under Production Operations secret handling.
