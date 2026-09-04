# 명하 Commerce Evidence Data Minimization Decision V1

> Status: **DECIDED — P0-PR-01B / parent P0-PR-01 remains OPEN**  
> Date: **2026-09-05**  
> Repository: `gycha0109-beep/MyeongHa`  
> Architecture Authority: `docs/architecture/COMMERCE_ENTITLEMENT_ARCHITECTURE_V1.md`  
> Privacy Authority: `docs/AUTH_RLS_PRIVACY_SPEC.md`  
> Parent Decision Register: `docs/P0_DECISION_REGISTER.md`

---

## 1. 목적

`P0-PR-01` 전체 retention/legal 기간을 임의 확정하지 않으면서, 실제 Commerce 구현 전에 반드시 고정되어야 하는 **provider evidence 저장 최소화 경계**를 결정한다.

이 결정은 다음 문제를 막는다.

```text
provider SDK/raw response
→ 그대로 JSONB dump
→ secret/token/account identity/payment material 과수집
→ logs/traces/support export로 재노출
→ retention/deletion policy 확정 전 불필요한 민감 증적 축적
```

Commerce correctness에는 충분한 provenance가 필요하지만, raw provider payload 자체가 authority일 필요는 없다.

---

## 2. 상위 Authority에서 이미 고정된 것

현재 authority는 다음을 이미 요구한다.

- raw provider secret / bearer / Authorization을 business DB, response, log, trace에 노출하지 않는다.
- raw receipt / purchase token 저장을 최소화하고 versioned keyed fingerprint/reference를 우선한다.
- `verified_payload_jsonb`는 correctness/support에 필요한 최소 verified field만 저장한다.
- card number / CVV / raw PCI-sensitive payment data를 MyeongHa가 직접 처리하거나 저장하지 않는다.
- 일반 analytics/log에는 raw receipt/provider account ID를 기록하지 않는다.
- legal Commerce retention은 product personalization deletion과 분리하되 exact retention period는 `P0-PR-01`로 남긴다.

이 문서는 위 원칙을 provider-neutral implementation contract로 좁힌다.

---

## 3. Decision

`P0-PR-01B`의 선택은 다음과 같다.

```text
Commerce persistence
= normalized first-class provenance
+ bounded schema-versioned allowlisted verified payload
+ versioned keyed fingerprint where opaque secret/account evidence is needed

NOT
= provider response archive
```

Parent `P0-PR-01`은 계속 OPEN이다.

따라서 이 결정은 **무엇을 저장할 수 있는지**를 정하지만 **얼마나 오래 저장하는지**를 정하지 않는다.

---

## 4. Data Classification

### 4.1 NEVER STORE / NEVER EMIT

다음은 production business DB, ordinary logs, traces, analytics, API response, support export에 저장/노출하지 않는다.

```text
provider API secret / secret key
Authorization header
OAuth/access/refresh bearer credential
checkout/session bearer secret
raw receipt / raw purchase token / opaque payment bearer token
full provider request/response headers containing credentials
card PAN
CVV/CVC
PIN
raw 3DS authentication material or equivalent PCI authentication secret
```

Selected provider가 future verification/restore를 위해 raw bearer-like receipt/token의 durable storage를 **필수**로 요구한다면 generic exception을 사용하지 않는다.

```text
P0-CM-02 provider selection
→ explicit provider-specific security/retention review
→ encrypted restricted-store design
→ deletion/rotation/access/audit contract
→ dedicated decision
```

없이는 production provider로 선택할 수 없다.

### 4.2 FIRST-CLASS PROVENANCE — STORE WHEN REQUIRED

다음은 idempotency, reconciliation, historical fulfillment, rights correctness에 필요할 때 first-class column으로 저장할 수 있다.

```text
provider
platform
environment
external product ID
external transaction ID
external original transaction ID
external event ID
provider occurred-at
provider ordering key/cursor when applicable
resolved MyeongHa subject / Purchase Intent / Offer / Capability Set lineage
verification status
verified-at
provider event received/processed state
verifier/schema revision
```

단, provider reference ID는 credential이 아니어야 한다. Provider가 어떤 identifier를 bearer secret으로 취급한다면 해당 값은 이 allow category에서 제외한다.

Raw provider account identity는 first-class raw storage보다 `commerce_account_links.external_account_fingerprint`를 사용한다.

### 4.3 FINGERPRINTED EVIDENCE

Opaque evidence의 equality/dedupe/audit linkage만 필요하고 raw value 재사용이 필요하지 않으면 raw value를 저장하지 않고 versioned keyed HMAC fingerprint를 저장한다.

대상:

```text
receipt_fingerprint
provider-event payload_fingerprint
provider-account external_account_fingerprint
future equivalent opaque Commerce evidence fingerprint
```

Hash/fingerprint는 anonymization claim이 아니다.

---

## 5. Commerce Fingerprint Security Binding

Existing Birth fingerprint security pattern을 재사용하되 key/domain은 Commerce 전용으로 분리한다.

```text
algorithm      = HMAC-SHA-256
stored format  = hmac-sha256:k1:<64 lowercase hex>
key version    = k1
secret env     = MYEONGHA_COMMERCE_EVIDENCE_HMAC_K1_SECRET
minimum secret = 32 UTF-8 bytes
```

Domain separation:

```text
myeongha.commerce.receipt-evidence.v1
myeongha.commerce.provider-event-payload.v1
myeongha.commerce.provider-account.v1
```

HMAC message envelope:

```text
UTF8(domain)
+ 0x00
+ adapter-defined canonical evidence bytes
```

Provider-specific canonical evidence bytes는 `P0-CM-02` 이후 adapter contract가 결정한다. 같은 provider evidence가 retry/redelivery에서 동일 fingerprint를 생성해야 하며, canonicalization에 secret/value truncation이나 lossy normalization을 사용해서는 안 된다.

Commerce HMAC secret은 Birth/Guest/auth/service secret과 독립이다. Client input, PostgreSQL, API response, log, trace에 저장/노출하지 않는다.

Future rotation은 새 key version을 추가하며 기존 `k1` bytes를 silently replace하지 않는다. Historical fingerprint는 version prefix를 유지한다.

---

## 6. `verified_payload_jsonb` Admissibility Contract

Current schema의 다음 두 컬럼은 provider raw-object archive가 아니다.

```text
commerce_receipts.verified_payload_jsonb
commerce_provider_events.verified_payload_jsonb
```

각 provider adapter는 저장 직전에 **positive allowlist serializer**를 사용한다.

Admissible payload의 조건:

1. schema version이 명시된다.
2. provider adapter revision/version이 식별 가능하다.
3. first-class column으로 이미 보존되는 값을 불필요하게 중복하지 않는다.
4. rights correctness, reconciliation, conflict diagnosis, support 중 하나에 실제 필요성이 있다.
5. 값의 최대 길이/배열 cardinality가 bounded다.
6. unknown/unrecognized provider fields는 drop한다.
7. raw request/response body 전체를 nested field 하나에 다시 넣는 우회를 금지한다.
8. secret/bearer/raw receipt/raw account identifier/card/PCI material이 포함되지 않는다.
9. free-form provider error body/HTML/debug dump를 저장하지 않는다.
10. payload만으로 entitlement를 결정하지 않는다. First-class verified identity + immutable Product/Capability lineage가 authority다.

Provider-specific allowlist는 adapter implementation과 함께 test fixture로 고정한다.

---

## 7. Logging / Tracing / Analytics Boundary

Commerce observability는 다음 stable references를 우선한다.

```text
internal purchase_intent_id
internal receipt_id
internal provider_event_id
internal grant_id
internal entitlement_event_id
provider name/platform/environment
bounded status/error class
versioned fingerprint prefix or shortened non-secret correlation representation
```

금지:

```text
raw provider secret/token
raw receipt/purchase token
raw provider account ID
full verified_payload_jsonb
full provider request/response
Authorization/request headers dump
```

Support tooling도 ordinary logs보다 넓은 raw-secret view를 갖지 않는다.

---

## 8. Account Deletion / Retention Boundary

이 결정은 legal/accounting retention 기간을 정하지 않는다.

Account deletion 시 Commerce evidence를 어떻게 삭제/tombstone/pseudonymize/retain하는지는 parent `P0-PR-01`이 결정한다.

현재 안전한 경계:

```text
product personalization deletion
!= automatic commerce evidence deletion

commerce legal/accounting evidence
!= permission to retain unrelated personalization/raw provider payload
```

`P0-PR-01` 결정 전 다음을 금지한다.

- Commerce history를 cascade delete하는 destructive migration
- indefinite retention을 사실상 default로 만드는 policy
- account deletion을 이유로 financial/rights provenance를 무조건 제거하는 implementation
- legal retention을 이유로 raw provider payload 전체를 장기 보존하는 implementation

Backup retention도 parent `P0-PR-01`에 남는다.

---

## 9. Schema / Migration Impact

이 decision 자체는 production schema mutation을 실행하지 않는다.

Current schema는 다음을 이미 표현할 수 있다.

```text
commerce_account_links.external_account_fingerprint
commerce_receipts.receipt_fingerprint
commerce_provider_events.payload_fingerprint
commerce_receipts.verified_payload_jsonb
commerce_provider_events.verified_payload_jsonb
```

Provider implementation 시 필요한 additive hardening candidate:

- fingerprint format CHECK or command-level validator
- allowlisted payload builder/validator
- provider `environment` first-class provenance if target migration does not already add it
- raw secret/token field가 생기지 않았음을 확인하는 schema negative test

`verified_payload_jsonb` 컬럼이 존재한다는 사실은 arbitrary JSON storage authority가 아니다.

---

## 10. Verification Matrix

Implementation은 최소 다음을 검증해야 한다.

| Case | Expected |
|---|---|
| provider response contains Authorization/secret | persisted payload/log에 없음 |
| raw receipt/purchase token received | raw value 미저장; approved fingerprint/reference만 저장 |
| same opaque evidence replay | same versioned fingerprint |
| one-byte-different evidence | different fingerprint |
| unknown provider payload field | drop/reject according to adapter allowlist |
| nested full raw response field | reject |
| oversized string/array | reject |
| raw provider account ID in log | fail test |
| PAN/CVV-like fixture reaches serializer | reject/fail test |
| fingerprint secret missing/weak | fail closed before persistence |
| sandbox evidence | production rights effect 없음 |
| support lookup | internal lineage/fingerprint로 reconstruct 가능; raw bearer 불필요 |
| parent retention period absent | no destructive retention scheduler activated |

Secret leakage tests는 exact secret value가 output/log/error에 등장하지 않음을 검증해야 한다.

---

## 11. Activation Consequence

이 decision으로 닫히는 것:

```text
P0-PR-01 implementation-safe Commerce evidence minimization subset
→ CLOSED as P0-PR-01B
```

이 decision만으로 열리지 않는 것:

```text
P0-PR-01 legal/accounting/backup retention period
P0-CM-02 exact PSP
P0-CM-03 launch paid Product/Capability
provider SDK/credential
production webhook
production evidence persistence
paid catalog activation
production Commerce
```

Provider-neutral serializer/fingerprint validator 설계 및 tests는 이후 구현할 수 있지만, production provider evidence persistence activation은 remaining provider/product/legal gates를 함께 만족해야 한다.

---

## 12. Change Policy

다음 변경은 새 명시적 review/decision이 필요하다.

- raw provider receipt/purchase/bearer token durable storage 허용
- provider account raw identity durable storage 확대
- Commerce HMAC algorithm/key format/domain change
- `verified_payload_jsonb`를 raw provider archive로 확대
- card/PCI-sensitive material handling scope 확대
- parent retention/deletion duration 결정

Provider가 바뀌어도 이 baseline은 약화되지 않는다.

---

## 13. Recursive Self-Review

### A. Authority collision

PASS. Parent `P0-PR-01`의 legal/accounting/backup retention 기간을 확정하지 않는다.

### B. Money / rights correctness

PASS. Transaction/event identifiers와 immutable lineage는 보존 가능하고, raw secret/token을 authority로 만들지 않는다.

### C. Recovery

PASS WITH PROVIDER GATE. Provider transaction/reference lookup을 우선하며, raw bearer token durable storage가 필수인 provider는 별도 decision 없이는 선택할 수 없다.

### D. Privacy minimization

PASS. Positive allowlist, bounded payload, HMAC fingerprint, log/trace 금지 경계를 명시했다.

### E. Scope

PASS. Provider SDK/schema migration/retention scheduler/production activation을 시작하지 않는다.

### Verdict

```text
P0-PR-01B = DECIDED
P0-PR-01  = OPEN
implementation-safe Commerce evidence minimization boundary = CLOSED
production provider evidence persistence = STILL HOLD
```
