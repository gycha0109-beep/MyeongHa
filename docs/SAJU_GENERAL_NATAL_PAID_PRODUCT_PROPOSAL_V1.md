# 명하 General Natal Paid Product Proposal V1

> Consumer working name: **나의 명식 — 깊이 읽기**  
> Status: **PRODUCT PROPOSAL / DESIGNABLE / NOT SALEABLE / P0-CM-03 OPEN**  
> Candidate internal key: `saju_general_natal_deep_v1`  
> Inventory companion: `docs/SAJU_PRODUCT_INTERPRETATION_INVENTORY_V1.md`  
> MyeongHa design base: `1d90cec5bf9b00462bf3c13ab75248c1180da36d`  
> Saju observed main: `2b02687d2cf4f6dab7b849af5cb26bec3e955709`

---

## 1. Verdict

General Natal을 명하의 첫 Hero 유료 Saju 상품으로 **설계하는 방향은 채택 후보**다.

하지만 현재는 판매 상품으로 활성화하지 않는다.

```text
Product concept/design        = PROCEED
Production semantic readiness = BLOCKED
Saleable SKU                  = NO
P0-CM-03                      = OPEN
Production Payment            = HOLD
```

이 문서는 Saju semantic authority를 만들지 않는다. 실제 활성화는 inventory와 Saju production interpretation authority가 충족된 뒤 별도 Product/Capability decision으로 결정한다.

---

## 2. Source-backed boundaries

다음은 Product Proposal이 아니라 현재 architecture/audit에서 고정된 경계다.

### 2.1 Product layer는 기존 Saju pipeline을 소비한다

```text
Product SKU
→ ConsumerReadingRequestInput
→ deterministic Consumer Reading Request Adapter
→ ReadingRequest / ReadingIntent
→ DomainReadingProfile
→ eligible existing InterpretationClaims
→ EvidenceSelector
→ governed Narrative
→ ProductReadingResponse
```

새 semantic Product Mapper 또는 별도 interpretation engine을 만들지 않는다.

### 2.2 General Natal은 P1 제품화 후보다

목표 질문:

```text
내 사주는 전체적으로 어떤 구조인가?
```

기존 `general + natal` intent/profile을 사용하며 제품 계층에서 새 general semantic rule을 만들지 않는다.

### 2.3 General Natal의 의미론적 최소 요구는 T8 general-domain synthesis다

Current Saju production audit는 meaningful General Natal product가 active T8 general-domain synthesis claim을 필요로 한다고 명시한다.

현재 real production interpretation package는 입증되지 않았고 production interpretation authority는 BLOCKED다.

### 2.4 Character는 표현 계층이다

Character는 persona/tone/presentation을 담당할 수 있지만 다음을 만들 수 없다.

```text
새 Saju meaning
새 Rule authority
없는 claim
fortune score
methodology conflict winner
```

### 2.5 Product lifecycle과 rule lifecycle은 별개다

Product가 `enabled`라고 해서 research rule이 production authority를 얻지 않는다. 반대로 semantic authority가 준비되어도 SKU를 노출할지는 MyeongHa Product decision이다.

---

## 3. Product proposition — PRODUCT PROPOSAL

### Consumer name

**나의 명식 — 깊이 읽기**

이름은 최종 마케팅 카피가 아니라 V1 working name이다.

### Candidate internal key

```text
saju_general_natal_deep_v1
```

현재 DB seed 또는 production catalog key로 승인한 것이 아니다.

### Core question

> **내 사주의 전체 구조는 무엇이며, 그 구조가 나에게 반복적으로 나타나는 성향과 선택의 맥락을 어떻게 설명하는가?**

### Product promise

사용자는 단편 키워드 모음이 아니라, **현재 Saju authority가 근거를 갖고 제공할 수 있는 General Natal synthesis를 하나의 구조화된 Reading Artifact로 받는다.**

상품 가치는 `더 많은 단정`이 아니라 다음에 둔다.

```text
구조화
연결 설명
근거 추적 가능성
불확실성/충돌 보존
재열람 가능한 완성 결과물
Character를 통한 읽기 쉬운 전달
```

---

## 4. Proposed result structure

아래는 **presentation/product proposal**이다. 각 섹션은 실제 inventory에서 대응 가능한 General Natal claim/evidence가 확인될 때만 활성화한다.

### 1. 한눈에 보는 명식

목적:
- 전체 reading의 orientation 제공
- 근거가 존재하는 핵심 General Natal synthesis를 짧게 요약

금지:
- 근거 없는 성격 점수
- 운세 확률
- LLM이 임의로 뽑은 대표 키워드

### 2. 나를 설명하는 핵심 구조

목적:
- General Natal에서 실제로 중요한 구조를 설명
- 왜 해당 구조가 선택됐는지 evidence-linked presentation 제공

### 3. 함께 읽어야 하는 균형과 긴장

목적:
- 단일 특징을 절대화하지 않고 함께 존재하는 조건/긴장/상충을 보여줌
- methodology conflict/scenario가 존재하면 자동 winner를 만들지 않고 보존

### 4. 반복적으로 나타날 수 있는 패턴

목적:
- production-authorized General Natal synthesis가 직접 뒷받침하는 범위에서 반복 경향을 설명

금지:
- Career/Wealth/Relationship의 deep domain synthesis를 General Natal 상품에 무단 편입
- 특정 사건의 확정 예언

### 5. 이 해석의 근거와 한계

표현 대상:

```text
근거가 충분한 부분
partial coverage
insufficient evidence
scenario / ambiguity
conflicting methodology가 보존된 부분
```

유료 상품이라고 해서 빈 semantic coverage를 prose로 채우지 않는다.

### 6. 명하 대리자의 해설

Character/presenter가 위의 governed result를 사용자 친화적으로 설명한다.

Character는 semantic source가 아니다.

### 7. 더 깊게 볼 주제

향후 별도 상품으로 연결할 수 있는 navigation surface다.

예:

```text
일과 재능
돈과 자원
사랑과 관계
```

단, General Natal 결과에 해당 domain의 deep semantic 내용을 선제적으로 생성하지 않는다.

---

## 5. General Natal vs domain products

Hero 상품이 모든 분야를 삼키지 않도록 boundary를 고정한다.

| 상품 | 질문 | 의미 범위 |
|---|---|---|
| 나의 명식 — 깊이 읽기 | 내 사주의 전체 구조는? | General Natal T8 synthesis |
| 일과 재능 | 나는 어떻게 일할 때 강한가? | Career T8 |
| 돈과 자원 | 재물과 자원을 어떻게 다루는가? | Wealth T8 |
| 사랑과 관계 | 관계에서 어떤 방식이 반복되는가? | Relationship/Spouse Natal T8 |
| 우리의 궁합 | 두 사람의 관계 구조는? | T10 Compatibility + two-Birth provenance |

General Natal 안에서 domain product로 이어지는 **signpost**는 가능하되, deep Career/Wealth/Relationship claim을 borrowing하여 상품 중복을 만들지 않는다.

---

## 6. Free / paid boundary — PRODUCT PROPOSAL

### Free: 첫 명식 읽기

목표:

> 사용자가 결제 전에 "명하가 실제 내 명식을 읽었다"는 가치를 확인한다.

제안:

```text
짧지만 실제 grounded General Natal insight
핵심 포인트 소수
근거가 있는 짧은 설명
Character의 짧은 전달
```

금지:

```text
결제를 위해 의미 있는 결과를 고의로 숨기는 teaser-only UX
"엄청난 비밀이 있습니다"식 paywall
근거 없는 curiosity bait
```

### Paid: 나의 명식 — 깊이 읽기

차별점:

```text
완전한 구조화된 General Natal artifact
더 풍부한 evidence-linked 설명
균형/긴장/한계까지 포함
저장된 결과물
지속 재열람
후속 domain navigation
```

무료와 유료의 차이는 `truth access`가 아니라 **해석의 깊이, 구조, 연결, artifact completeness**에 둔다.

### Activation caveat

무료/유료 양쪽 모두 실제 production General Natal semantic authority가 확보되기 전에는 production reading으로 활성화하지 않는다.

---

## 7. Purchase / fulfillment model — PRODUCT PROPOSAL

Launch rail의 Web + one-off decision과 정합되는 후보 모델:

```text
one-off purchase
→ one paid General Natal reading fulfillment
→ successful detailed Reading Artifact creation
→ artifact ownership/history에 저장
→ 이후 persistent reread
```

사용자 관점에서는 `30일 기능 이용권`보다 `내 상세 리포트를 구매`하는 모델을 우선 검토한다.

이 절은 Commerce semantic authority가 아니다. 실제 entitlement key/scope/validity와 fulfillment transaction은 P0-CM-03 Product/Capability decision 및 Commerce architecture에 맞춰 별도 확정한다.

### Candidate capability concept

```text
saju.reading.general_natal.deep.v1
```

**PROPOSAL ONLY**. Production DB에 seed하지 않는다.

---

## 8. Artifact requirements — PRODUCT PROPOSAL

상세 결과물은 최소 다음 제품 품질을 목표로 한다.

```text
artifact type/version identifiable
source Birth revision provenance preserved
ReadingIntent/Profile provenance preserved
Saju engine/version provenance preserved
selected evidence/grounding projection preserved
coverage state preserved
scenario/ambiguity/conflict not silently collapsed
Character/presentation identity distinguishable from semantic authority
historical reread does not reinterpret old result using current mutable rules
```

정확한 ProductReadingResponse / persisted Reading DTO 필드는 별도 source contract를 따라야 하며 이 문서가 새 API schema를 발명하지 않는다.

---

## 9. Pricing

```text
PRICE = OPEN
CURRENCY / OFFER = OPEN
```

가격을 먼저 고정하지 않는다.

선행 조건:

```text
actual semantic coverage
artifact depth/length
generation COGS
free-vs-paid delta
competitive/product research if performed
refund/support expectations
```

가격 결정을 위해 unsupported content를 늘리거나 결과 길이를 억지로 채우지 않는다.

---

## 10. Product lifecycle — PRODUCT PROPOSAL

후보 lifecycle:

```text
internal
→ qa
→ enabled
→ hidden
→ retired
```

General Natal은 현재:

```text
productStatus candidate = internal
```

단, repository에 이 enum을 지금 추가하지 않는다.

Semantic gate와 product gate의 진행 순서:

```text
Product proposal
→ Product Interpretation Inventory complete
→ qualifying Saju production interpretation authority
→ General Natal semantic QA
→ Product/Capability exact decision
→ pricing/offer decision
→ Commerce/provider independent gates
→ enabled
```

---

## 11. Explicit non-goals

이 proposal로 다음을 하지 않는다.

```text
P0-CM-03 close
PSP 선택
provider SDK 추가
payment webhook 추가
receipt verification 구현
entitlement activation 구현
Product/Capability production seed
실제 가격 seed
T8 semantic rule 생성
research rule production promotion
Career/Wealth/Relationship deep semantics borrowing
fortune score 생성
unsupported certainty/prediction 생성
LLM로 missing claim 보충
```

---

## 12. P0-CM-03 closure gate for this SKU

`나의 명식 — 깊이 읽기`를 실제 launch paid Product/Capability로 확정하려면 최소 다음이 필요하다.

### Semantic authority

```text
[ ] qualifying deterministic T8 general-natal rule set
[ ] qualifying source locators and methodology definitions
[ ] fixture / negative / ambiguity / boundary coverage
[ ] real domain review
[ ] ReviewAttestation
[ ] active reviewer trust pinned to exact attestation hash
[ ] production interpretation pack
[ ] execution-plan preflight
```

### Inventory

```text
[ ] methodologyId/status exact
[ ] ruleId/status exact
[ ] packId/status exact
[ ] claim type/metadata/state exact
[ ] requiredInputs exact
[ ] reading profile + authorization exact
[ ] runtime reachability exact
[ ] evidence/narrative behavior exact
[ ] tests/benchmark exact
```

### Product QA

```text
[ ] free surface does not invent semantics
[ ] paid surface does not invent semantics
[ ] partial/insufficient coverage displayed fail-closed
[ ] Character presentation does not alter semantic meaning
[ ] historical artifact/provenance behavior verified
[ ] browser/API E2E
```

### Commerce/Product authority

```text
[ ] exact Product decided
[ ] exact Capability Set decided
[ ] fulfillment semantics decided
[ ] price/offer decided separately
```

그때까지:

```text
P0-CM-03 = OPEN
Saleable General Natal SKU = NO
Production Payment = HOLD
```

---

## 13. Next work

다음 작업은 UI mock이나 결제가 아니라 General Natal inventory의 exact authority acquisition이다.

```text
Saju current main
→ T8 general methodology/source candidate discovery
→ exact rule/pack/claim enumeration
→ production-authority gap map
```

Product 설계와 semantic authority를 병렬로 섞지 않고, inventory evidence가 확보될 때 이 proposal의 섹션별 activation 가능 여부를 다시 판정한다.
