# 명하 Commerce Payment Track Architecture v1

> Status: **CURRENT IMPLEMENTATION / PRE-PRODUCTION HOLD**  
> Track lineage: **결제 권한 / Commerce 결제 연속 트랙**  
> Baseline main: `9cb4f49e2511d2c2ff1283b63d9452d6b86c0059`  
> Baseline date: **2026-09-16**  
> Current trust-boundary frontier: **#844 — PortOne webhook verification config access**

이 문서는 명하 Commerce 결제 트랙의 **현재 authority, 구현 경계, PortOne V2 trust boundary, Production HOLD, 완료 provenance와 다음 작업 경계**를 한곳에서 읽기 위한 통합 설계 문서다.

이 문서는 새로운 결제 상품, 가격, 환불 정책, Entitlement 정책 또는 Production 활성화 권한을 결정하지 않는다. 기존 결정문과 구현 provenance를 현재 상태 기준으로 합성한다.

충돌 시 우선순위는 다음과 같다.

```text
P0 Decision Register의 최신 결정
→ provider/ownership 등 narrow decision 문서
→ 현재 main의 구현 및 merged provenance
→ Commerce Entitlement Architecture의 구조적 baseline
→ 본 통합 문서
```

`COMMERCE_ENTITLEMENT_ARCHITECTURE_V1.md`의 과거 시점 상태 문구 중 PSP 미결정, Commerce 미구현 등 현재와 불일치하는 내용은 **역사적 상태**로만 취급한다. Product/Capability/Intent/Evidence/Entitlement의 구조적 원칙은 계속 유효하지만, 현재 상태 판정은 최신 Decision Register와 구현 provenance를 따른다.

---

## 1. 현재 상태 요약

| 항목 | 현재 authority | 상태 |
|---|---|---|
| Launch rail | Web + one-off purchase | `P0-CM-01 DECIDED` |
| Web PSP | PortOne V2 | `P0-CM-02 DECIDED` |
| Canonical provider key | `portone_v2` | DECIDED |
| Completion authority | 서버의 PortOne V2 payment lookup | DECIDED |
| Browser redirect/callback | transport hint only | DECIDED |
| Guest purchase ownership | Guest + Member, canonical `subjects.id` | `P0-CM-04 DECIDED` |
| Launch paid Product/Capability | 미결정 | `P0-CM-03 OPEN-P0` |
| Saleable SKU | 없음 | HOLD |
| Live checkout | 비활성 | HOLD |
| Entitlement fulfillment activation | 비활성 | HOLD |
| Production Supabase governed deployment | authorization blocker | `#680 OPEN` |
| Public PortOne webhook | 공개 route 미활성 | `404 NOT_FOUND`, intentional HOLD |
| PortOne trust-boundary hardening | 진행 중 | current frontier `#844 OPEN` |

핵심적으로 현재 트랙은 **PortOne을 선택하고 provider verification/webhook/evidence infrastructure를 구현한 상태**이지만, 이를 곧바로 실제 판매 가능 상태로 간주하지 않는다.

```text
provider integration implemented
≠ saleable product authorized
≠ live merchant readiness proven
≠ Production checkout activated
≠ Entitlement fulfillment activated
```

---

## 2. Authority 계층

### 2.1 Product / Capability / Entitlement 구조

구조적 baseline은 다음 흐름을 유지한다.

```text
Product
→ Product Capability Set
→ Purchase Intent
→ Payment Attempt / provider correlation
→ Provider Verification
→ Verified Commerce Evidence
→ Commerce persistence
→ Entitlement Grant / effect
→ Fulfillment / Consumption
```

중요한 원칙은 다음과 같다.

- Product는 판매 단위이고 Capability는 사용 권한 단위다.
- Purchase Intent는 결제 시작 시점의 상품/가격/통화/Capability 관계를 immutable snapshot으로 고정한다.
- 브라우저 성공 화면, redirect callback, caller payload는 결제 완료 authority가 아니다.
- provider verification을 통과한 evidence만 내부 Commerce evidence로 승격될 수 있다.
- evidence와 entitlement는 같은 개념이 아니다. 결제 증거와 권한 부여를 분리한다.
- retry/replay는 동일한 semantic evidence를 중복 권한으로 확장해서는 안 된다.

### 2.2 Launch rail

현재 launch rail은 다음으로 고정되어 있다.

```text
Web
+
one-off purchase
```

Launch MVP에서 다음은 채택되지 않았다.

```text
subscription billing
bundle billing
Apple IAP
Google Play Billing
```

향후 native paid surface가 실제 scope가 되면 별도 provider/store authority를 다시 결정한다.

### 2.3 Provider authority

현재 Web PSP는:

```text
PortOne V2
canonical provider key = portone_v2
```

이다.

### 2.4 Ownership authority

Commerce owner는 client가 선택하지 않는다.

```text
canonical owner = server-resolved subjects.id
```

active Guest와 active Member 모두 Web one-off purchase owner가 될 수 있다.

---

## 3. Canonical 결제 흐름

현재 결제 구조는 다음 경계를 기준으로 이해한다.

```text
[Browser / Client]
  purchase UX
  redirect/callback hint
        │
        ▼
[Server identity boundary]
  active Guest / Member 검증
  canonical subjects.id 결정
        │
        ▼
[Purchase Intent]
  product revision snapshot
  amount_minor > 0
  currency
  capability set / product identity
  merchant-generated provider_request_id(paymentId)
        │
        ▼
[PortOne interaction]
  browser checkout transport
  webhook transport hint
        │
        ▼
[Server-side PortOne V2 lookup]
  authoritative payment status
  paymentId
  transactionId when present
  amount.total
  currency
  externalProductId
  provider-owned channel/environment facts
        │
        ▼
[VerifiedCommerceEvidenceV2]
  strict allowlisted projection
  evidence fingerprint
        │
        ▼
[Commerce persistence]
  idempotent/replay-safe convergence
        │
        ▼
[Entitlement authority structures]
  grant/effect/read model
        │
        └── Production sale/fulfillment activation is still HOLD
```

### 3.1 Browser의 역할

브라우저는 checkout UX를 시작하고 provider redirect/callback을 전달할 수 있지만, 다음 authority를 결정할 수 없다.

```text
결제 실제 완료 여부
verified amount/currency/product identity
provider environment
entitlement owner
entitlement grant 여부
```

### 3.2 Webhook의 역할

PortOne webhook도 entitlement-grade evidence 자체가 아니다.

```text
authenticated webhook
→ provider ingress hint
→ server-side payment lookup
→ verified payment evidence
```

따라서 webhook payload가 서명 검증을 통과했다는 이유만으로 권한을 부여하지 않는다.

---

## 4. Purchase Intent와 ownership

### 4.1 Purchase Intent

현재 구현에는 기존 Purchase Intent와 Guest/Member ownership을 반영한 v2 command가 존재한다.

```text
apps/api/src/purchase-intent-create-command.ts
apps/api/src/purchase-intent-create-command-v2.ts
```

Purchase Intent authority에서 중요한 것은 다음이다.

- owner는 인증된 server-side subject resolution 결과다.
- amount는 positive minor-unit authority를 유지한다.
- zero amount를 paid purchase로 넓히지 않는다.
- Product identity는 provider lookup 시 exact round-trip 검증에 사용된다.
- immutable snapshot과 provider verification 결과가 다르면 fail closed한다.

### 4.2 Guest purchase

`P0-CM-04`에 따라 active Guest purchase는 허용된다.

```text
Guest purchase owner
= exact Guest subjects.id
```

Guest가 새 Member로 promotion되는 경우 기존 subject가 유지되므로 Commerce owner rewrite가 필요하지 않다.

기존 Member와 merge되는 경로에서는 현재 접근 권한을 canonical Member와 direct merged-Guest lineage로 조합할 수 있지만, historical Commerce provenance를 새 owner로 다시 쓰지 않는다.

```text
historical Receipt/Event/Grant owner subject_id
→ promotion/merge를 이유로 rewrite 금지
```

Guest bearer/session 만료도 이미 검증된 paid right의 자동 revoke 사유가 아니다.

---

## 5. PortOne V2 completion authority

### 5.1 Canonical verification source

결제 완료 판단의 최종 provider fact authority는:

```text
server-side PortOne V2 payment lookup
by merchant-generated paymentId
```

이다.

PortOne API credential은 server-only이며 browser/mobile 전달, log/persistence 노출을 금지한다.

### 5.2 반드시 검증하는 provider facts

Provider response를 내부 evidence로 승격하기 전에 최소 다음 authority를 일치시킨다.

```text
payment status
paymentId / provider_request_id
transactionId / provider_transaction_id when authoritative/present
amount.total
currency
externalProductId
sandbox / production environment authority
```

`externalProductId`는 caller가 임의 생성하는 값이 아니라 Purchase Intent의 immutable product identity와 정확히 대조하는 round-trip authority다.

PortOne upstream schema에서 `products`가 optional일 수 있더라도 현재 MyeongHa #771 contract는 의도적으로:

```text
exactly one product
→ externalProductId
```

를 요구한다. 이것은 현재 fail-closed product identity 정책이다.

### 5.3 Environment authority

Environment는 request origin이나 caller hint로 결정하지 않는다.

현재 repository authority는 PortOne V2 API 선택과 provider-owned payment/channel fact 및 server-owned configuration을 사용해 sandbox/production 경계를 유지한다.

`PaidPayment.version === V2` 같은 equality requirement는 현재 repository authority가 아니다. V2는 API/provider boundary 선택이며 임의의 새 payment-object version 정책을 추가하지 않는다.

---

## 6. Payment Verification Adapter trust boundary

현재 핵심 adapter:

```text
apps/api/src/portone-v2-payment-verification-adapter.ts
```

이 adapter는 PortOne HTTP response를 신뢰 가능한 내부 evidence로 직접 취급하지 않고, 단계별 runtime validation을 수행한다.

### 6.1 Configuration snapshot

Payment verification config는 현재 한 번 snapshot한다.

```text
apiSecret
evidenceHmacSecret
timeoutMs
fetchImpl
now
```

config accessor 자체가 throw하면 raw exception을 노출하지 않고 generic `INVALID_CONFIGURATION`으로 fail closed한다. snapshot 성공 이후에는 기존 field-specific validation을 유지한다.

### 6.2 Injected clock

Injected `now()`는 callback synchronous throw, invalid Date, Date validation failure, `verifiedAt` serialization failure를 기존 configuration failure boundary 안에서 처리한다.

### 6.3 HTTP status/header access

Injected/hostile response seam에 대해 다음을 별도로 보호한다.

```text
response.status accessor failure
header accessor failure
header runtime value shape
status runtime value shape
```

status는 runtime에서 `number`이면서 `Number.isSafeInteger(status)`를 만족해야 한다.

따라서 string/object/NaN/Infinity/fraction/unsafe integer는 기존 `NETWORK_FAILURE` 경계로 fail closed한다. 반면 정상 safe integer지만 일반적인 HTTP 범위 밖인 `700` 같은 값은 기존 `HTTP_UNEXPECTED_STATUS` 분류를 유지한다.

### 6.4 Response body streaming

Payment response는 bounded streaming을 사용한다.

- whole-body `response.text()` fallback을 사용하지 않는다.
- reader acquisition 실패를 transport boundary 안에서 처리한다.
- reader release는 best-effort이며 cleanup failure가 primary governed result를 덮지 않는다.
- malformed resolved reader result가 guard 밖의 raw runtime throw로 승격되지 않게 한다.
- body limit과 UTF-8/JSON schema validation을 통과한 값만 provider fact parsing으로 이동한다.

### 6.5 JSON / timestamp authority

현재 payment JSON은 invalid UTF-8을 거부한다. `paidAt`은 strict RFC3339 authority를 따르며 sub-millisecond precision을 임의로 손실하지 않는다.

---

## 7. PortOne Webhook trust boundary

Webhook 경계는 HTTP transport와 authenticated payment-completion boundary를 분리한다.

```text
apps/api/src/portone-v2-webhook-http.ts
apps/api/src/portone-v2-webhook-payment-completion.ts
apps/api/src/portone-v2-webhook-runtime.ts
```

### 7.1 Raw body transport

Webhook signature는 raw bytes에 대한 authority이므로 body를 먼저 JSON semantics로 변환하지 않는다.

```text
request raw bytes
→ bounded streaming
→ signature verification
→ verified payload parse
```

현재 webhook request body 최대 크기는 `65,536 bytes`다.

### 7.2 Reader acquisition / cleanup

현재 webhook streaming은 다음을 보호한다.

- `request.body.getReader()` synchronous acquisition failure → `400 INVALID_WEBHOOK`
- `releaseLock()` failure → best-effort cleanup, primary governed result overwrite 금지
- resolved reader result의 `done`은 runtime boolean
- `done === false`면 `value instanceof Uint8Array`
- accepted `byteLength`는 safe non-negative integer
- malformed result → 기존 `400 INVALID_WEBHOOK` 경계

의도적으로 `reader.cancel()` 또는 request body drain policy를 새로 도입하지 않는다. #780 authority에서 request-stream cancellation/drain 정책을 만들지 않았으며 transport hardening을 이유로 임의 추가하지 않는다.

### 7.3 Signature / replay boundary

Webhook 인증에서 현재 유지하는 authority:

```text
content-type validation
webhook-id validation
webhook-timestamp validation
Standard Webhooks v1 signature framing
PortOne whsec_ credential validation
one/two-secret rotation support
raw-byte signature verification
300-second timestamp tolerance
```

Payload parsing은 signature verification 이후에만 수행한다.

### 7.4 Webhook clock

`#842/#843`에서 webhook verification `now()` callback 경계를 닫았다.

```text
now() synchronous throw
invalid Date
getTime() validation failure
→ existing INVALID_CONFIGURATION
```

이 failure는 DB/provider verification으로 진행하지 않는다.

### 7.5 Current frontier — #844

현재 main에서 남은 concrete webhook configuration seam은 `#844`이다.

현재 authenticator는 config를 여러 번 직접 읽는다.

```text
input.config.environment
input.config.now
input.config.webhookSecrets
...
input.config.environment
```

확인된 defect class:

1. `environment`, `now`, `webhookSecrets` getter가 synchronous throw하면 raw injected exception이 기존 configuration boundary를 벗어날 수 있다.
2. `environment`를 검증한 뒤 원 accessor를 다시 읽기 때문에 stateful getter가 첫 read와 다른 값을 downstream `paidIngress(...)`에 제공할 수 있다.

#844의 구현 경계:

```text
webhook verification config를 guarded snapshot
→ accessor failure = generic INVALID_CONFIGURATION
→ snapshot 성공 후 field-specific validation 유지
→ accepted environment snapshot 재사용
→ raw accessor 재접근 금지
```

이 작업은 provider/payment 정책을 변경하지 않는다.

---

## 8. Verified Commerce Evidence

현재 implementation에는 provider-neutral evidence boundary가 존재한다.

```text
apps/api/src/verified-commerce-evidence.ts
apps/api/src/commerce-payment-verification-execution.ts
apps/api/src/commerce-verified-payment-evidence-persistence.ts
apps/api/src/production-commerce-evidence-fingerprint.ts
```

핵심 원칙:

```text
provider response
≠ persistence payload
```

Provider response에서 allowlisted facts만 내부 verified evidence로 투영한다.

### 8.1 Data minimization

현재 `P0-PR-01B` authority에 따라 다음을 raw 형태로 persistence/logging하지 않는다.

```text
PortOne API secret
Authorization bearer
webhook secret
raw provider payload 전체
receipt/card/account sensitive data
PCI-sensitive material
```

Evidence는 필요한 provider identifiers, verified amount/currency/product/environment facts, versioned fingerprint 등 최소 권한 정보만 보존한다.

Parent retention/legal/backup duration인 `P0-PR-01`은 별도 OPEN 상태이며 이 결제 트랙에서 임의 결정하지 않는다.

---

## 9. Persistence, replay, idempotency

결제 검증과 DB mutation을 한 네트워크 transaction처럼 취급하지 않는다.

```text
provider network await
→ open internal Commerce PostgreSQL transaction 안에서 수행 금지
```

먼저 provider verification을 완료하고 bounded verified evidence로 만든 뒤 내부 persistence authority를 호출한다.

동일한 semantic evidence의 retry/replay는 다음을 만족해야 한다.

```text
same evidence
→ converge
→ duplicate durable payment evidence 금지
→ duplicate grant/effect 금지
```

`#804/#807`에서 fresh verification timestamp 때문에 동일 결제 replay가 잘못 충돌하지 않도록 evidence semantics를 정리했다.

---

## 10. Entitlement와 현재 activation 경계

현재 repository에는 Entitlement 관련 구조와 read/effect implementation이 존재한다.

```text
apps/api/src/effective-entitlements-read-v2.ts
apps/api/src/entitlement-effect.ts
apps/api/src/entitlement-restore-command.ts
apps/api/src/entitlements-read.ts
```

그러나 이것은 현재 PortOne hardening 작업이 실제 판매/fulfillment를 활성화했다는 의미가 아니다.

```text
P0-CM-03 = OPEN-P0
```

따라서 현재 상태에서는:

```text
saleable SKU 없음
live checkout 없음
Entitlement fulfillment activation 없음
```

을 유지한다.

특히 upstream Saju Production Interpretation Authority가 독립 gate를 만족하지 않은 상태에서 Paid Deep/Detailed Reading을 임의 saleable SKU로 승격하지 않는다.

---

## 11. Production separation

### 11.1 Production runtime 상태

Baseline main `9cb4f49e...`의 exact-SHA Vercel Production 검증은 다음 상태였다.

```text
deployment = dpl_GWfMY82PdrMThoGb2ef531Hqp2Sg
state      = READY
target     = production
aliasError = null
```

Canonical runtime:

```text
https://myeongha.vercel.app/
→ HTTP 200

https://myeongha.vercel.app/api/commerce/webhooks/portone-v2
→ HTTP 404 NOT_FOUND
```

Webhook의 `404 NOT_FOUND`는 현재 오류가 아니라 **의도적 Production activation HOLD 증거**다.

### 11.2 Production Supabase HOLD

```text
#680
P0-OPS: restore Supabase Production deployment authorization
= OPEN
```

이 blocker를 우회하기 위해 Production migration을 수동 적용하지 않는다.

### 11.3 PortOne live readiness HOLD

PortOne V2를 provider로 선택했다는 결정과 live merchant activation은 분리한다.

Production 활성화 전 별도 증거가 필요한 항목:

```text
merchant/legal readiness
PG/channel contract
settlement / launch currency / tax readiness
live Store ID
live API secret provisioning proof
live webhook secret provisioning proof
PortOne console webhook registration
sandbox/production separation proof
public webhook route activation decision
saleable Product/Capability
Entitlement fulfillment authority
refund/reversal/dispute/reconciliation authority
```

이 중 일부가 구현되었다고 해서 나머지가 자동 승인되지 않는다.

---

## 12. Error boundary 원칙

PortOne trust-boundary hardening의 목적은 가능한 모든 defensive code를 추가하는 것이 아니다.

새 issue는 반드시 다음 세 조건을 모두 만족해야 한다.

```text
1. 실제 재현 가능한 runtime seam
2. 기존 authority만으로 기대 동작이 명확
3. 현재 코드가 그 authority를 위반
```

`이론상 더 방어할 수 있다` 수준만으로 issue를 생성하지 않는다.

### 12.1 대표 fail-closed classification

| Defect class | Governed result |
|---|---|
| payment response malformed runtime access/shape | `NETWORK_FAILURE` 계열 |
| accepted-but-unexpected integer HTTP status | `HTTP_UNEXPECTED_STATUS` |
| payment adapter invalid/unreadable injected config | `INVALID_CONFIGURATION` |
| webhook invalid request/stream/result shape | `400 INVALID_WEBHOOK` |
| webhook invalid credential/config | `INVALID_CONFIGURATION` |
| webhook bad signature | `INVALID_SIGNATURE` |
| webhook timestamp outside replay window | `STALE_WEBHOOK` |

raw provider/injected exception detail은 external/user-visible authority로 승격하지 않는다.

---

## 13. Current implementation map

### Commerce core

```text
purchase-intent-create-command.ts
purchase-intent-create-command-v2.ts
commerce-payment-verification-context-read.ts
commerce-provider-payment-verification-context-read.ts
commerce-payment-verification-execution.ts
commerce-provider-payment-completion-orchestration.ts
commerce-verified-payment-evidence-persistence.ts
verified-commerce-evidence.ts
production-commerce-evidence-fingerprint.ts
postgres-commerce-internal-execution.ts
```

### PortOne V2

```text
portone-v2-payment-verification-adapter.ts
portone-v2-webhook-http.ts
portone-v2-webhook-payment-completion.ts
portone-v2-webhook-runtime.ts
```

### Entitlement authority structures

```text
effective-entitlements-read-v2.ts
entitlement-effect.ts
entitlement-restore-command.ts
entitlements-read.ts
```

이 파일들의 존재는 구현 범위를 보여주지만, Production saleability/activation 여부는 Decision Register와 live readiness gate가 결정한다.

---

## 14. PortOne 완료 provenance

현재까지의 provider/payment hardening lineage:

```text
#733/#770  PortOne V2 PSP decision
#771/#772  server payment lookup verification adapter
#773/#775  authenticated paid webhook verification
#777/#779  webhook HTTP transport
#780/#781  webhook request streaming bound
#782/#784  runtime composition
#774/#776  payment response streaming bound
#785/#787  remove response.text whole-body fallback
#786/#789  live readiness authority reconciliation
#790/#791  payment response reader acquisition
#792/#794  webhook request reader acquisition
#793/#795  payment response reader release cleanup
#796/#797  paidAt canonicalization
#798/#800  sub-ms paidAt preservation
#799/#801  strict RFC3339 paidAt
#802/#803  invalid UTF-8 payment JSON rejection
#804/#807  fresh verification timestamp replay
#809/#810  whsec_ webhook secret requirement
#811/#813  official PaidPayment.channel authority
#814/#815  webhook request reader release cleanup
#817/#818  invalid zero-amount broadening
#819/#820  positive amount authority recovery
#816/#821  payment response header accessor failure
#822/#826  payment response status accessor failure
#827/#828  payment response reader resolved-result access
#831/#832  payment response header value shape
#833/#834  payment response status value shape
#836/#837  webhook request reader resolved-result value shape
#835/#839  payment verification injected clock failure
#840/#841  payment verification config accessor failure
#842/#843  webhook verification clock failure
#844       webhook verification config access — OPEN
```

이 chain은 결제 정책을 계속 추가한 기록이 아니라 대부분 **이미 결정된 payment/provider authority가 malformed runtime seam에서도 유지되도록 trust boundary를 닫은 기록**이다.

---

## 15. Audited non-defects / 재오픈 금지 경계

새 direct authority/evidence 없이 다음을 다시 defect로 만들지 않는다.

### Positive amount

Purchase Intent는 `amount_minor > 0`을 요구한다. zero paid amount를 다시 허용하지 않는다.

### Provider identifiers의 추가 규칙

provider id / transactionId에 대한 새로운 provider-neutral control-character policy를 임의 생성하지 않는다.

### Products optional upstream

PortOne upstream optionality와 별개로 MyeongHa는 exact one-product `externalProductId` identity를 요구한다. 현재 의도적 fail-closed contract다.

### Webhook projection

- `data.paymentId` / `data.transactionId` 사용은 current provider shape와 일치한다.
- `storeId`를 projection하지 않는 것은 data minimization authority와 일치한다.
- webhook-id dot rejection은 Standard Webhooks framing/security와 일치한다.
- raw-byte preservation은 signature authority를 위한 의도적 설계다.
- 별도 webhook payload `version` field를 임의 요구하지 않는다.

### Request cancellation/drain

Malformed/oversized/read failure 처리 명분으로 `reader.cancel()` 또는 drain policy를 새로 추가하지 않는다.

---

## 16. Current frontier — #844 상세

현재 다음 implementation task는:

```text
#844
fix(commerce): govern PortOne webhook verification config access
```

이다.

대상 파일:

```text
apps/api/src/portone-v2-webhook-payment-completion.ts
```

정확한 boundary:

```text
fresh config input
→ guarded snapshot(environment, webhookSecrets, now)
→ accessor throw = generic INVALID_CONFIGURATION
→ readable snapshot 이후 기존 field-specific validator 실행
→ accepted environment snapshot을 downstream 재사용
→ original config accessor 재접근 금지
```

필수 regression intent:

```text
throwing required config accessor
→ generic INVALID_CONFIGURATION
→ raw error reflection 없음

throwing now accessor
→ config-access failure로 containment
→ #842의 accepted now() invocation boundary와 구분

unreadable config
→ DB connect 0회
→ provider payment verification 0회

stateful environment accessor
→ 정확히 1회 read
→ 검증된 snapshot과 downstream environment 동일
```

#844 완료 후에만 fresh main에서 다음 PortOne trust-boundary audit으로 이동한다.

---

## 17. 이 트랙이 현재 하지 않는 일

현재 PortOne trust-boundary track에서 다음을 추가하거나 활성화하지 않는다.

```text
Production PortOne webhook activation
Production PortOne live credential provisioning
saleable SKU activation
P0-CM-03 임의 결정
new Entitlement mutation authority
refund implementation
reversal implementation
dispute implementation
reconciliation worker expansion
Production Supabase migration manual bypass
```

이 항목들은 별도 authority/readiness가 필요한 독립 작업이다.

---

## 18. 운영 작업 프로토콜

결제 트랙의 narrow hardening은 항상 다음 순서로 진행한다.

```text
fresh main 재조회
→ duplicate issue / PR / branch / code 검색
→ 현재 authority와 exact implementation boundary 확인
→ 실제 재현 가능한 defect인지 판정
→ concrete unresolved defect일 때만 좁은 issue 생성
→ exact fresh-main branch
→ 최소 구현 + deterministic regression
→ 정확히 1 commit
→ exact-head CI
→ fresh-main merge preflight
→ expected_head_sha가 있는 squash merge
→ exact merged-SHA push CI
→ exact-SHA Vercel Production 검증
→ canonical runtime / HOLD 검증
→ permanent closure evidence
→ issue closed/completed readback
→ fresh main에서 다음 audit
```

금지:

```text
force push
force merge
stale-head CI를 merge 근거로 사용
expected_head_sha 없는 merge
#680 우회 Production migration
Production PortOne webhook 임의 활성화
saleable SKU 임의 활성화
기존 authority 없는 provider/payment 정책 발명
실제 defect 없는 defensive-code issue 생성
secret/token/raw provider payload 노출
```

---

## 19. Source authority / reference documents

본 문서는 다음 current authority를 합성한다.

```text
docs/P0_DECISION_REGISTER.md
docs/architecture/COMMERCE_ENTITLEMENT_ARCHITECTURE_V1.md
docs/COMMERCE_WEB_PSP_DECISION_V1.md
docs/COMMERCE_GUEST_PURCHASE_OWNERSHIP_DECISION_V1.md
```

그리고 current main의 실제 Commerce/PortOne implementation과 merged issue/PR provenance를 상태 근거로 사용한다.

이 문서가 source decision을 대체하지 않는다. 새로운 Product/Capability, live merchant activation, refund/reversal/dispute/reconciliation, retention/legal 정책을 결정하려면 각각의 authority를 별도로 갱신해야 한다.

---

## 20. Current one-line architecture verdict

```text
MyeongHa Commerce는
provider-neutral Purchase Intent / Verified Evidence / Entitlement 구조 위에
PortOne V2 server-lookup + authenticated webhook 경계를 구현했고,
현재는 Production 판매를 여는 단계가 아니라 malformed external/injected runtime에서도
기존 결제 authority가 깨지지 않도록 trust boundary를 닫는 단계다.

Current frontier = #844
Production PortOne webhook = HOLD / 404
P0-CM-03 = OPEN-P0
#680 = OPEN
```
