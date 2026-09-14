# 명하 Commerce Web PSP Evidence Refresh v2

> Original evidence date: **2026-09-05**  
> Authority reconciliation: **2026-09-14**  
> Current governing decision: `docs/COMMERCE_WEB_PSP_DECISION_V1.md`  
> Merchant readiness: `docs/COMMERCE_MERCHANT_FACT_INTAKE_V1.md`  
> Status: **P0-CM-02 DECIDED / PORTONE V2 / HISTORICAL DIRECT-PROVIDER EVIDENCE RETAINED / LIVE ACTIVATION HOLD**

## 1. Authority correction

이 문서의 2026-09-05 Toss Payments direct / NHN KCP direct 비교는 P0-CM-02가 열려 있었을 때의 evidence snapshot이다.

현재 authority는 다음과 같다.

```text
P0-CM-02 exact Web PSP = DECIDED
selected provider      = PortOne V2
provider key           = portone_v2
```

따라서 과거의 아래 상태를 현재 결론으로 사용하지 않는다.

```text
P0-CM-02 = OPEN-P0
selection winner = NONE
Toss/KCP 중 production PSP를 선택해야 함
```

PortOne 결정은 downstream PG/channel 계약, merchant eligibility, settlement, live activation까지 자동 승인하지 않는다.

## 2. Operator facts preserved

2026-09-05 operator facts는 이후 명시적 변경 evidence가 없으므로 그대로 유지한다.

```text
M1 merchant legal form           = not_registered
M2 merchant registration country = not_applicable
M3 settlement account country    = not_established
M4 launch buyer geography        = korea_first
M5 presentment currency          = KRW
M6 required payment methods      = domestic_card + easy_pay(kakaopay, naverpay, payco)
```

## 3. Guest-purchase compatibility supersession

2026-09-05 evidence는 당시 Member-only purchase invariant를 기준으로 Toss/KCP compatibility를 비교했다.

그 product-policy premise는 이후 P0-CM-04로 supersede되었다.

현재:

```text
active Guest OR active Member purchase owner = AUTHORIZED BY P0-CM-04
Guest purchase policy compatibility           = RESOLVED
Guest purchase Production runtime              = NOT IMPLIED
```

따라서 과거 Toss Member-only conflict와 KCP Member-only unproven 상태는 current PortOne live-activation blocker가 아니다.

## 4. Current PortOne integration evidence

2026-09-14 공식 PortOne V2 문서 재검증 결과:

```text
server API host                 = api.portone.io
Store ID                        = PortOne store identifier used by checkout
channelKey                      = configured PG channel identifier
server-side payment lookup      = required completion authority
webhook configuration           = TEST/LIVE mode separated
V2 server authentication        = console-managed, server-side only
```

이 evidence는 repository integration design과 provider capability를 뒷받침한다.

다음은 증명하지 않는다.

```text
MyeongHa live merchant eligibility
actual PortOne account/store control
exact downstream LIVE PG/channel contract
KRW settlement acceptance
M6 methods enabled on the actual LIVE channel
Production provider binding complete
LIVE webhook registration complete
saleable SKU authority
Production route activation
```

## 5. Current live-readiness matrix

| Gate | Current state |
|---|---|
| P0-CM-02 provider selection | **DECIDED / PortOne V2** |
| merchant legal form | **BLOCKED — not_registered** |
| merchant registration country | **BLOCKED — not_applicable** |
| settlement account country | **BLOCKED — not_established** |
| launch geography | `korea_first` |
| presentment currency | `KRW` |
| required methods | domestic card + KakaoPay/NaverPay/PAYCO |
| truthful website/review readiness | **NOT READY** |
| commercial acceptance | **BLOCKED / NOT ACCEPTED** |
| Guest purchase policy compatibility | **RESOLVED BY P0-CM-04** |
| PortOne account/store control | **UNVERIFIED** |
| downstream LIVE PG/channel | **UNBOUND** |
| settlement support | **UNPROVEN** |
| required methods on actual LIVE channel | **UNPROVEN** |
| Production provider binding | **NOT ESTABLISHED** |
| LIVE webhook binding | **NOT ESTABLISHED** |
| governed Production deployment | **BLOCKED — #680 OPEN** |
| saleable Product/Capability | **BLOCKED — P0-CM-03 OPEN-P0** |
| Production payment/webhook route | **NOT AUTHORIZED** |

Overall:

```text
Production payment activation = HOLD
```

## 6. Historical Toss/KCP evidence

PR #453에서 재검증한 내용은 historical provenance로 유지한다.

```text
Toss direct technical/capability research = historical evidence
KCP direct technical/capability research  = historical evidence
```

이 historical evidence를 이용해 P0-CM-02를 다시 열거나 현재 provider winner를 재선정하지 않는다.

PortOne 내부 downstream PG/channel selection/contract는 별도 commercial/operational evidence로 다룬다.

## 7. Implementation consequence

Repository는 이미 PortOne-specific verification/webhook/runtime composition을 보유한다. 하지만 다음은 별도다.

```text
repository implementation complete ≠ live merchant ready
repository webhook runtime complete ≠ LIVE webhook registered
PortOne selected ≠ downstream PG/channel contracted
PortOne selected ≠ saleable Product authorized
PortOne selected ≠ Production route activated
```

독립 gate를 유지한다.

```text
#680 = OPEN
P0-CM-03 = OPEN-P0
P0-PR-01 = OPEN
```

## 8. Explicit non-goals

이 evidence reconciliation은 다음을 수행하거나 승인하지 않는다.

```text
PortOne console mutation
live merchant activation
LIVE channel binding
Production provider binding
LIVE webhook registration
Production route activation
Production Supabase mutation
paid SKU enablement
Entitlement mutation
refund/reversal/dispute/reconciliation implementation
```

## 9. Revalidated PortOne sources — 2026-09-14

- `https://developers.portone.io/api/rest-v2`
- `https://developers.portone.io/opi/ko/integration/ready/readme`
- `https://developers.portone.io/opi/ko/console/guide/channel-manage`
- `https://developers.portone.io/opi/ko/integration/start/v2/checkout`
- `https://developers.portone.io/opi/ko/integration/webhook/readme-v2`
- `https://developers.portone.io/opi/ko/integration/pg/v2/readme`

Current live activation authority는 `COMMERCE_WEB_PSP_DECISION_V1.md`, `P0_DECISION_REGISTER.md`, `COMMERCE_GUEST_PURCHASE_OWNERSHIP_DECISION_V1.md`, `COMMERCE_MERCHANT_FACT_INTAKE_V1.md`을 함께 읽어 판정한다.
