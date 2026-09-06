# 명하 Saju Product Interpretation Inventory V1

> Repository: `gycha0109-beep/MyeongHa`  
> Status: **IN PROGRESS / GENERAL NATAL FIRST PASS / NOT PRODUCT AUTHORITY / P0-CM-03 OPEN / NO-BUILD**  
> MyeongHa observed main: `11eba9c4afcae534777fddd784418624306a0baf`  
> Saju observed main: `b7bc0d0b0c04a514ca849d57fca6ba3de03993c0`  
> Product interpretation authority: `MyeongHa_Saju_Product_Interpretation_Architecture_v1.2_FINAL_REVIEWED(1).md`  
> Current Saju production audit: `gycha0109-beep/Saju/docs/product/22-production-interpretation-authority-audit.md`

---

## 1. Purpose

이 문서는 실제 유료 SKU를 활성화하기 전에 Saju repository의 authority 축을 분리하여 확인하는 inventory다.

```text
Methodology
Rule
Interpretation Pack
Interpretation Claim
Reading Profile / selection authorization
Runtime reachability
Evidence / narrative grounding
Tests / benchmark
Product readiness
```

다음과 같은 단일 boolean은 사용하지 않는다.

```text
productionAuthorized
```

각 authority 축의 준비 상태와 실패 원인을 숨기기 때문이다.

이 문서나 Product Proposal의 존재는 다음을 의미하지 않는다.

```text
paid SKU enabled
production interpretation authority acquired
P0-CM-03 closed
price decided
Product/Capability seed authorized
payment enabled
```

---

## 2. Current global production boundary

Pinned Saju main `b7bc0d0b0c04a514ca849d57fca6ba3de03993c0`의 production audit 판정은 다음과 같다.

```text
PRODUCTION_RUNTIME_BLOCKED_BY_INTERPRETATION_AUTHORITY_GAPS
Decision = NO_BUILD
real repository-backed production interpretation package = NOT PROVEN / NO
PRODUCTION INTERPRETATION AUTHORITY = BLOCKED
PUBLIC PRODUCTION READING RUNTIME = BLOCKED
```

Runtime infrastructure와 calculation authority가 존재하더라도 research-grade methodology/rule/source 또는 synthetic production fixture를 product semantic authority로 승격하지 않는다.

Production rule에는 최소한 production pack, domain-reviewed/source-traceable rule, approved methodology, qualifying sources, domain ReviewAttestation 및 exact attestation hash를 pin한 reviewer trust가 필요하다.

---

## 3. Inventory schema

각 조사 row는 최소 다음 필드를 사용한다.

```text
domain
tier
subcategory
methodologyId
methodologyStatus
ruleId
ruleStatus
interpretationPackId
packStatus
claimType
claimMetadata
claimState
requiredInputs
readingProfile
profileAuthorizationState
runtimeReachable
expectedCoverage
existingTests
benchmarkEvidence
knownGap
productReadiness
```

`NOT YET ENUMERATED`는 해당 축이 존재하지 않는다는 뜻이 아니라 이 inventory에서 exact ID/status를 아직 repository-level로 열거하지 않았다는 뜻이다.

`BLOCKED`는 Product Layer가 prose 또는 LLM으로 우회해서는 안 된다.

---

## 4. General Natal — exact request/profile inventory

Pinned Saju source에서 General Natal request/profile identity는 다음과 같이 확인된다.

```text
Reading profile id      = myeonghwa-reading-profile-general-natal-v1
Reading profile version = 1.0.0
Profile registry        = myeonghwa-reading-profile-registry-v1
Required evidence group = NATAL_DOMAIN_SYNTHESIS_CLAIM_REQUIRED
Tier                     = T8 Natal Domain Synthesis
Domain/category          = general
```

이 profile은 General Natal request를 위한 profile이다. T9 time-dynamic, T10 compatibility, T11 question-specific semantics를 General Natal에 자동 포함시키는 근거가 아니다.

| Field | Current finding |
|---|---|
| domain | `general` |
| tier | `T8 Natal Domain Synthesis` |
| subcategory | general natal |
| methodologyId | `NOT YET ENUMERATED` |
| methodologyStatus | qualifying real production-authorized General Natal methodology package not proven |
| ruleId | `NOT YET ENUMERATED` |
| ruleStatus | qualifying deterministic T8 general-natal production rule set not currently available according to the pinned Saju production audit |
| interpretationPackId | `NOT YET ENUMERATED` |
| packStatus | qualifying real General Natal production interpretation pack not proven |
| claimType | T8 general-domain synthesis claim required through `NATAL_DOMAIN_SYNTHESIS_CLAIM_REQUIRED` |
| claimMetadata | `NOT YET ENUMERATED` |
| claimState | product-ready production claim coverage not proven |
| requiredInputs | self Birth through the existing deterministic consumer-reading request / canonical Saju path; exact field contract remains Saju-owned |
| readingProfile | `myeonghwa-reading-profile-general-natal-v1` |
| profileAuthorizationState | profile/selection authorization code exists; **selection authorization is not interpretation semantic authority** |
| runtimeReachable | deterministic consumer request adapter and reading-profile orchestration are code-reachable; meaningful production General Natal execution remains blocked by interpretation authority |
| expectedCoverage | General Natal T8 synthesis only; no implicit Career/Wealth/Relationship deep-domain synthesis and no T9/T10/T11 borrowing |
| existingTests | request/profile infrastructure and authorization-gate tests exist in Saju; qualifying production General Natal semantic fixture/review matrix remains unproven |
| benchmarkEvidence | `NOT YET ENUMERATED` |
| knownGap | qualifying T8 general methodology/rules/source provenance/domain review/ReviewAttestation/reviewer trust/production pack/claim execution evidence |
| productReadiness | **BLOCKED / NOT SALEABLE / NO-BUILD** |

### 4.1 Authority distinction

다음 둘은 같은 판정이 아니다.

```text
Reading profile exists and can be selected
!=
Production interpretation semantics are authorized
```

`myeonghwa-reading-profile-general-natal-v1`의 존재, deterministic request adaptation, profile-selection authorization은 orchestration authority다. 이들이 누락된 General Natal T8 production claims를 생성하거나 production 승격하지 않는다.

### 4.2 Scope distinction

General Natal profile을 근거로 다음을 판매하거나 생성하지 않는다.

```text
Annual / Monthly reading (T9 required)
Compatibility (T10 + second-Birth provenance required)
Question-specific reading (T11 required)
Career/Wealth/Relationship deep-domain reading without their own authorized profiles/claims
```

General Natal Product Layer는 부족한 semantic coverage를 prose/LLM으로 채우거나 다른 domain claim을 암묵적으로 합성할 수 없다.

### 4.3 General Natal conclusion

```text
P1 product-design priority         = YES
request/profile orchestration      = PRESENT
profile selection authorization    = PRESENT
production semantic authority      = BLOCKED
saleable production SKU            = NO
P0-CM-03                           = OPEN
```

---

## 5. Core Natal follow-up rows

아래는 Phase 2 inventory 대상이며 이 first pass에서 exact methodology/rule/pack IDs를 아직 전수 열거하지 않는다.

| Surface | Required semantic coverage | Current readiness |
|---|---|---|
| Career Natal | T8 `category=career` | global production interpretation authority로 인해 **BLOCKED pending exact inventory** |
| Wealth Natal | T8 `category=wealth` | **BLOCKED pending exact inventory** |
| Relationship Natal | T8 relationship / spouse semantics as applicable | **BLOCKED pending exact inventory** |
| Family Natal | T8 family subcategory | **BLOCKED pending exact inventory** |
| Business Natal | T8 `category=business` | **BLOCKED pending exact inventory** |

Relationship Natal은 상대 Birth 없이 `compatibility`로 표현하지 않는다. 한 사람의 natal relationship/spouse interpretation과 두 사람의 T10 Compatibility는 별개다.

---

## 6. Extension inventory skeleton

| Surface | Required semantic coverage | Activation boundary |
|---|---|---|
| Annual | matching T8 domain + T9 annual | 둘 중 하나만 있으면 partial coverage; profile 존재만으로 활성화 금지 |
| Monthly | matching T8 domain + T9 monthly | profile 존재만으로 활성화 금지 |
| Compatibility | T10 + explicit source/target Birth provenance + second-Birth path | 상대 Birth 없이 생성 금지 |
| Question-specific | T11 + deterministic request/intent contract | question text를 LLM domain authority로 변환 금지 |
| Daewoon / luck-cycle | calculation + period identity + claims + methodology/rule/pack + profile/runtime/narrative | exact inventory 완료 전 readiness unconfirmed |

Daily temporal coverage가 별도로 입증되기 전 `오늘의 운세`, `오늘의 한 줄`, `행운 점수`를 제품화하지 않는다.

---

## 7. Repository responsibility boundary

### Saju repository

결정한다.

```text
무엇을 계산할 수 있는가
무엇을 사주 의미로 해석할 수 있는가
Methodology / Rule / Pack / Claim authority
ReadingIntent / DomainReadingProfile
Profile selection authorization
Evidence selection / narrative grounding contract
```

### MyeongHa repository

결정한다.

```text
어떤 허용된 reading을 상품으로 노출할지
무료/유료 경계
SKU / entitlement / purchase lifecycle
UX / Character presentation
결과 저장과 historical product experience
```

### Character runtime

가능:

```text
persona
tone
relationship-aware expression
presentation
conversation continuity
```

불가:

```text
새 Saju meaning 생성
Rule authority 생성
fortune score 생성
methodology conflict winner 선택
missing claim 보충
```

---

## 8. Exit criteria — General Natal inventory complete

General Natal을 `productReadiness != BLOCKED`로 올리려면 최소 다음을 exact repository evidence로 채운다.

```text
[ ] exact methodologyId/status
[ ] exact ruleId/status
[ ] exact interpretationPackId/status
[ ] exact T8 general claim type/metadata/state
[ ] exact required inputs
[x] exact reading profile identity
[x] profile-selection authorization layer presence
[x] deterministic request/profile orchestration reachability
[ ] qualifying semantic runtime reachability with production claims
[ ] evidence-selection behavior against qualifying production claims
[ ] narrative non-invention behavior against qualifying production claims
[ ] semantic fixture / negative / ambiguity / boundary tests
[ ] benchmark or equivalent governed evidence
[ ] domain ReviewAttestation
[ ] active reviewer trust pinned to exact attestation hash
[ ] production interpretation execution-plan preflight
[ ] General Natal browser/API E2E
```

이 조건을 충족하기 전 `P0-CM-03`을 General Natal을 근거로 닫지 않는다.

---

## 9. Smallest honest unblock path

```text
1. traceable Saju source material
2. semantic propositions with qualifying locators/methodology
3. fixtures / negative / ambiguity / boundary coverage
4. domain review
5. ReviewAttestation
6. reviewer trust grant pinned to the exact attestation hash
7. production interpretation pack + T8 General Natal claims
8. execution-plan preflight
9. browser/API E2E
```

Product Layer는 이 순서를 shortcut하지 않는다.

---

## 10. Next inventory action

다음 실제 작업은 결제나 Product seed가 아니다.

```text
General Natal T8
→ methodology/source
→ rule
→ source provenance
→ review/trust
→ production pack
→ claim
→ semantic runtime
→ evidence/narrative
→ tests/E2E
```

의 exact IDs/status를 Saju current main에서 전수 열거하는 것이다.
