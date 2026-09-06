# 명하 Saju Product Interpretation Inventory V1

> Repository: `gycha0109-beep/MyeongHa`  
> Status: **IN PROGRESS / GENERAL NATAL FIRST PASS / NOT PRODUCT AUTHORITY / P0-CM-03 OPEN**  
> MyeongHa base: `1d90cec5bf9b00462bf3c13ab75248c1180da36d`  
> Saju observed main: `2b02687d2cf4f6dab7b849af5cb26bec3e955709`  
> Product interpretation authority: `MyeongHa_Saju_Product_Interpretation_Architecture_v1.2_FINAL_REVIEWED(1).md`  
> Current Saju production audit: `gycha0109-beep/Saju/docs/product/22-production-interpretation-authority-audit.md`

---

## 1. Purpose

이 문서는 실제 유료 SKU를 활성화하기 전에, Saju repository에서 다음 authority 축을 분리해서 확인하기 위한 inventory다.

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

이 문서의 존재나 Product Proposal은 다음을 의미하지 않는다.

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

Current Saju production audit의 판정은 다음과 같다.

```text
PRODUCTION_RUNTIME_BLOCKED_BY_INTERPRETATION_AUTHORITY_GAPS
Decision = NO_BUILD
real repository-backed production interpretation package = NOT PROVEN / NO
PRODUCTION INTERPRETATION AUTHORITY = BLOCKED
PUBLIC PRODUCTION READING RUNTIME = BLOCKED
```

Runtime infrastructure와 calculation authority가 존재하더라도, research-grade methodology/rule/source 또는 synthetic production fixture를 product semantic authority로 승격하지 않는다.

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

`NOT YET ENUMERATED`는 해당 축이 존재하지 않는다는 뜻이 아니라, 이 inventory에서 exact ID/status를 아직 repository-level로 열거하지 않았다는 뜻이다.

`BLOCKED`는 Product Layer가 prose 또는 LLM으로 우회해서는 안 된다.

---

## 4. General Natal — first-pass inventory

| Field | Current finding |
|---|---|
| domain | `general` |
| tier | `T8 Natal Domain Synthesis` |
| subcategory | general natal |
| methodologyId | `NOT YET ENUMERATED` |
| methodologyStatus | current real production-authorized methodology package not proven |
| ruleId | `NOT YET ENUMERATED` |
| ruleStatus | qualifying deterministic T8 general-natal production rule set not currently available according to Saju production audit |
| interpretationPackId | `NOT YET ENUMERATED` |
| packStatus | real product-domain production pack not proven |
| claimType | T8 general-domain synthesis claim |
| claimMetadata | `NOT YET ENUMERATED` |
| claimState | product-ready production claim coverage not proven |
| requiredInputs | self Birth / canonical Saju calculation path; exact consumer request contract remains Saju-owned |
| readingProfile | existing `general + natal` intent/profile |
| profileAuthorizationState | profile existence/selection authorization must remain separate from semantic readiness; exact hash/state to enumerate |
| runtimeReachable | governed runtime infrastructure exists, but meaningful production General Natal output remains blocked by interpretation authority |
| expectedCoverage | overall natal synthesis; no invented Career/Wealth/Relationship deep semantics |
| existingTests | infrastructure/gate tests exist; exact General Natal semantic fixture matrix to enumerate |
| benchmarkEvidence | `NOT YET ENUMERATED` |
| knownGap | qualifying T8 general-domain synthesis methodology/rules/sources/review trust/production pack |
| productReadiness | **BLOCKED / NOT SALEABLE** |

### General Natal conclusion

General Natal은 Product Architecture의 P1 후보이며 목표 질문은 다음과 같다.

```text
내 사주는 전체적으로 어떤 구조인가?
```

그러나 현재 상태는:

```text
P1 product-design priority = YES
saleable production SKU    = NO
```

Product Layer는 기존 `general + natal` intent/profile을 소비할 수 있을 뿐, 부족한 T8 general semantics를 새로 만들 수 없다.

---

## 5. Core Natal follow-up rows

아래는 Phase 2 inventory 대상이며, 이 first pass에서 exact methodology/rule/pack IDs를 아직 전수 열거하지 않는다.

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

결정한다:

```text
무엇을 계산할 수 있는가
무엇을 사주 의미로 해석할 수 있는가
Methodology / Rule / Pack / Claim authority
ReadingIntent / DomainReadingProfile
Profile selection authorization
Evidence selection / narrative grounding contract
```

### MyeongHa repository

결정한다:

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
[ ] exact reading profile identity
[ ] exact profile authorization state/hash
[ ] runtime reachability
[ ] evidence-selection behavior
[ ] narrative non-invention behavior
[ ] semantic fixture / negative / ambiguity / boundary tests
[ ] benchmark or equivalent governed evidence
[ ] domain ReviewAttestation
[ ] active reviewer trust pinned to exact attestation hash
[ ] production interpretation execution-plan preflight
[ ] General Natal browser/API E2E
```

이 조건을 충족하기 전 `P0-CM-03`을 General Natal을 근거로 닫지 않는다.

---

## 9. Next inventory action

다음 실제 작업은 결제나 Product seed가 아니다.

```text
General Natal T8
→ methodology
→ rule
→ source provenance
→ review/trust
→ production pack
→ claim
→ profile authorization
→ evidence/narrative
→ tests
```

의 exact IDs/status를 Saju current main에서 전수 열거하는 것이다.
