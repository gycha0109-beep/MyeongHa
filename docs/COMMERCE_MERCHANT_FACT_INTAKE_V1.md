# 명하 Commerce Merchant Fact Intake v1

> Original intake: **2026-09-05**  
> Authority reconciliation: **2026-09-14**  
> Status: **P0-CM-02 DECIDED / PORTONE V2 / LIVE ACTIVATION HOLD**

## 1. Current authority

PR #453 당시의 `P0-CM-02 OPEN`, `provider winner = NONE`, `Guest purchase = DENY`, `Member-only Purchase Intent mandatory` 상태는 역사적 기록이다.

현재 authority:

```text
P0-CM-02 = DECIDED / PortOne V2
P0-CM-04 = DECIDED / active Guest OR active Member purchase owner
```

현재 authority source:

```text
docs/P0_DECISION_REGISTER.md
docs/COMMERCE_WEB_PSP_DECISION_V1.md
docs/COMMERCE_GUEST_PURCHASE_OWNERSHIP_DECISION_V1.md
```

이 문서는 PortOne을 다시 선정하지 않는다. 실제 Production activation readiness만 추적한다.

## 2. Canonical operator facts

2026-09-05에 명시적으로 제공된 값은 이후 변경 evidence가 없으므로 유지한다.

```text
M1 merchant legal form              = not_registered
M2 merchant registration country    = not_applicable
M3 settlement account country       = not_established
M4 launch buyer geography           = korea_first
M5 launch presentment currency      = KRW
M6 required payment methods         = domestic_card + easy_pay(kakaopay, naverpay, payco)
```

이 값들은 추론으로 변경하지 않는다.

## 3. Current M7-M9

```text
M7 website / merchant review readiness = NOT READY
M8 commercial acceptance               = BLOCKED / NOT ACCEPTED
M9 Guest purchase compatibility        = RESOLVED BY P0-CM-04
```

M7/M8은 실제 merchant, PortOne account, downstream live channel, settlement, launch-site readiness가 외부 evidence로 확인되기 전 닫지 않는다.

P0-CM-04로 Guest purchase 정책 충돌은 해소되었지만 Guest purchase Production runtime activation까지 승인된 것은 아니다.

## 4. PortOne live-readiness gate

현재 필요한 evidence:

```text
merchant eligibility                    = UNPROVEN
PortOne account/store control            = UNVERIFIED
exact downstream LIVE PG/channel         = UNBOUND
KRW settlement support                   = UNPROVEN
required LIVE payment-method availability= UNPROVEN
Production provider binding              = NOT ESTABLISHED
LIVE webhook binding                     = NOT ESTABLISHED
governed Production deployment           = FAIL / #680 OPEN
saleable Product/Capability              = FAIL / P0-CM-03 OPEN-P0
Production payment/webhook route         = NOT AUTHORIZED
```

TEST와 LIVE 환경을 혼합하지 않는다. Repository implementation 완료는 external live readiness 완료를 의미하지 않는다.

## 5. Current verdict

```text
P0-CM-02 PortOne selection            = PASS / DECIDED
M1-M3 merchant/settlement readiness   = BLOCKED
M4 korea_first                        = PASS
M5 KRW                                = PASS as product decision
M6 required method definition         = PASS
M7 review readiness                   = FAIL
M8 commercial acceptance              = BLOCKED
M9 Guest purchase compatibility       = PASS / RESOLVED
external PortOne live readiness       = INCOMPLETE
#680                                  = OPEN / Production HOLD
P0-CM-03                              = OPEN-P0 / saleable capability BLOCKED

Overall Production payment activation = HOLD
```

## 6. Historical PR #453 evidence

PR #453의 Toss Payments direct / NHN KCP direct 비교는 당시 P0-CM-02가 열려 있던 시점의 historical research provenance다.

```text
historical direct-provider shortlist = preserved as history
current selected PSP boundary        = PortOne V2
```

당시 winner-selection, Member-only 비교, `P0-CM-02 OPEN` 문구를 현재 operational gate로 사용하지 않는다.

## 7. Independent HOLDs

```text
Issue #680 Production deployment authorization = OPEN
P0-CM-03 saleable Product/Capability            = OPEN-P0
P0-PR-01 parent retention/legal policy          = OPEN
Production route activation                     = NOT AUTHORIZED
Entitlement mutation from unverified evidence   = FORBIDDEN
```

## 8. Revalidated PortOne references — 2026-09-14

- `https://developers.portone.io/opi/ko/integration/ready/readme`
- `https://developers.portone.io/opi/ko/console/guide/channel-manage`
- `https://developers.portone.io/opi/ko/integration/webhook/readme-v2`
- `https://developers.portone.io/opi/ko/integration/start/v2/checkout`
- `https://developers.portone.io/api/rest-v2`

이 자료들은 integration capability를 증명한다. 실제 MyeongHa live merchant readiness는 별도 외부 evidence가 필요하다.
