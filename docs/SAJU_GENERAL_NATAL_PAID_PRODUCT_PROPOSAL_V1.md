# 명하 General Natal Paid Product Proposal V1

> Consumer working name: **나의 명식 — 깊이 읽기**  
> Status: **PRODUCT PROPOSAL / DESIGNABLE / NOT SALEABLE / P0-CM-03 OPEN / NO-BUILD**  
> Candidate internal key: `saju_general_natal_deep_v1`  
> Inventory companion: `docs/SAJU_PRODUCT_INTERPRETATION_INVENTORY_V1.md`  
> MyeongHa observed main: `11eba9c4afcae534777fddd784418624306a0baf`  
> Saju observed main: `b7bc0d0b0c04a514ca849d57fca6ba3de03993c0`  
> Saju reading profile: `myeonghwa-reading-profile-general-natal-v1@1.0.0`

---

## 1. Verdict

General Natal을 명하의 첫 Hero 유료 Saju 상품으로 **설계하는 방향은 채택 후보**다.

하지만 현재는 판매 상품으로 활성화하지 않는다.

```text
Product concept/design        = PROCEED
Request/profile orchestration = PRESENT
Production semantic readiness = BLOCKED
Saleable SKU                  = NO
P0-CM-03                      = OPEN
Production Payment            = HOLD
```

이 문서는 Saju semantic authority를 만들지 않는다. 실제 활성화는 inventory와 Saju production interpretation authority가 충족된 뒤 별도 Product/Capability decision으로 결정한다.

---

## 2. Source-backed boundaries

다음은 Product Proposal이 아니라 현재 architecture와 pinned Saju source에서 고정된 경계다.

### 2.1 Product layer는 기존 Saju pipeline을 소비한다

```text
Product offer
→ ConsumerReadingRequestInput
→ deterministic Consumer Reading Request Adapter
→ ReadingRequest / ReadingIntent
→ DomainReadingProfile
→ profile-selection authorization
→ eligible existing InterpretationClaims
→ EvidenceSelector
→ governed Narrative
→ ProductReadingResponse / ReadingArtifact
```

새 semantic Product Mapper 또는 별도 interpretation engine을 만들지 않는다.

### 2.2 General Natal의 exact reading profile

Pinned Saju `b7bc0d0b0c04a514ca849d57fca6ba3de03993c0` 기준 General Natal profile은 다음과 같다.

```text
profileId              = myeonghwa-reading-profile-general-natal-v1
profileVersion         = 1.0.0
profileRegistryVersion = myeonghwa-reading-profile-registry-v1
requiredEvidenceGroup  = NATAL_DOMAIN_SYNTHESIS_CLAIM_REQUIRED
domain/category        = general
tier                    = T8 Natal Domain Synthesis
```

따라서 이 상품은 추상적인 `general + natal` 라벨이 아니라 위 Saju-owned reading profile을 소비하는 **atomic General Natal offer 후보**다.

중요:

```text
profile exists / selection authorized
!=
production interpretation semantics authorized
```

현재 profile/request orchestration이 존재한다는 사실만으로 saleable product가 되지 않는다.

### 2.3 General Natal의 의미론적 최소 요구는 T8 general-domain synthesis다

Current Saju production audit는 real repository-backed production interpretation package가 아직 입증되지 않았고 production interpretation authority를 BLOCKED로 판정한다.

따라서 `NATAL_DOMAIN_SYNTHESIS_CLAIM_REQUIRED`를 만족하는 qualifying production T8 General Natal claims가 실제 production pack/review/trust chain에서 제공되기 전까지 이 상품은 NO-BUILD다.

### 2.4 T9/T10/T11 및 타 domain을 자동 포함하지 않는다

이 General Natal profile을 근거로 다음을 포함하거나 판매하지 않는다.

```text
Annual / Monthly semantics       → T9 authority required
Compatibility                    → T10 + second-Birth provenance required
Question-specific interpretation → T11 authority required
Career deep natal                → own authorized T8 domain profile/claims required
Wealth deep natal                → own authorized T8 domain profile/claims required
Relationship deep natal          → own authorized T8 domain profile/claims required
```

General Natal은 Career/Wealth/Relationship를 암묵적으로 합친 종합 의미체계가 아니다.

### 2.5 Character는 표현 계층이다

Character는 persona/tone/presentation을 담당할 수 있지만 다음을 만들 수 없다.

```text
새 Saju meaning
새 Rule authority
없는 claim
fortune score
methodology conflict winner
```

Character narration은 authorized evidence를 표현하는 방식이며 semantic source가 아니다.

### 2.6 Product lifecycle과 rule lifecycle은 별개다

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

> **내 사주의 전체 구조는 무엇이며, 현재 권위가 허용하는 범위에서 그 구조를 어떻게 읽을 수 있는가?**

### Product promise

사용자는 단편 키워드 모음이 아니라, **현재 Saju authority가 근거를 갖고 제공할 수 있는 General Natal T8 synthesis를 하나의 구조화된 Reading Artifact로 받는다.**

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

## 4. Atomic product boundary

V1 `나의 명식 — 깊이 읽기`는 **General Natal atomic product**다.

```text
Offer: saju_general_natal_deep_v1              # proposal only
Semantic profile: myeonghwa-reading-profile-general-natal-v1@1.0.0
Semantic scope: authorized General Natal T8 only
```

향후 소비자에게 더 넓은 `종합 리포트`를 판매하고 싶다면 다음 둘 중 하나만 허용한다.

### Option A — catalog bundle

```text
General Natal atomic reading
+ Career atomic reading
+ Wealth atomic reading
+ Relationship atomic reading
```

각 component가 독립적으로 production-authorized 되었을 때 Commerce/Product Layer가 bundle로 묶는다.

Bundle은 상품 조합일 뿐 새로운 Saju semantic synthesis authority가 아니다. 각 chapter의 provenance/coverage를 보존해야 한다.

### Option B — Saju-authorized composite reading

Saju repository가 별도 composite ReadingIntent/Profile과 semantic synthesis authority를 명시적으로 제공할 때만 cross-domain 종합 결론을 생성한다.

그 전에는 Product Layer나 LLM이 여러 atomic 결과를 합쳐 새 `종합 사주 결론`을 만들지 않는다.

---

## 5. Proposed result structure

아래는 **presentation/product proposal**이다. 각 섹션은 실제 inventory에서 대응 가능한 General Natal production claim/evidence가 확인될 때만 활성화한다.

### 1. 한눈에 보는 명식

목적:
- 전체 reading의 orientation 제공
- qualifying evidence가 존재하는 핵심 General Natal synthesis를 짧게 표현

금지:
- 근거 없는 성격 점수
- 운세 확률
- LLM이 임의로 뽑은 대표 키워드

### 2. 나를 설명하는 핵심 구조

목적:
- General Natal에서 production-authorized evidence가 직접 지지하는 구조 설명
- 왜 해당 설명이 가능한지 provenance-linked presentation 제공

### 3. 함께 읽어야 하는 균형과 긴장

목적:
- 단일 특징을 절대화하지 않고 함께 존재하는 조건/긴장/상충을 보여줌
- methodology conflict/scenario가 존재하면 자동 winner를 만들지 않고 보존

### 4. 반복적으로 드러날 수 있는 General Natal 패턴

목적:
- production-authorized General Natal synthesis가 직접 뒷받침하는 범위의 경향 설명

금지:
- Career/Wealth/Relationship deep-domain synthesis의 무단 편입
- 특정 사건의 확정 예언
- T9 timing 의미의 차용

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

Character/presenter가 동일한 governed result를 사용자 친화적으로 설명한다.

Character는 semantic source가 아니며 canonical semantic artifact보다 높은 authority를 갖지 않는다.

### 7. 더 깊게 볼 주제

별도 atomic reading으로 연결하는 navigation surface다.

```text
일과 재능  → Career Natal product
돈과 자원  → Wealth Natal product
사랑과 관계 → Relationship Natal product
```

General Natal 결과에 해당 domain의 deep semantic 내용을 선제 생성하지 않는다.

---

## 6. Free / paid boundary — PRODUCT PROPOSAL

### 6.1 Product principle

무료 첫 경험은 실제 가치를 제공해야 하지만, Product Layer가 임의로 paid claim 일부를 골라 의미를 바꾸는 방식으로 만들지 않는다.

```text
Free semantic selection policy
!=
Marketing layer arbitrarily truncates authorized claims
```

무료/유료 분리는 다음 중 repository-backed contract로 명시되어야 한다.

```text
A. 별도 authorized free ReadingProfile/Intent
또는
B. Saju가 허용한 deterministic presentation/output policy
```

어느 방식도 아직 이 문서에서 production authority로 가정하지 않는다.

### 6.2 Free: 첫 명식 읽기 — target experience

목표:

> 사용자가 결제 전에 "명하가 실제 내 명식을 읽었다"는 가치를 확인한다.

Target UX:

```text
짧지만 실제 grounded General Natal insight
소수의 의미 있는 포인트
필요한 qualifier를 보존한 짧은 설명
Character의 짧은 전달
```

금지:

```text
결제를 위해 의미 있는 결과를 고의로 숨기는 teaser-only UX
"엄청난 비밀이 있습니다"식 paywall
근거 없는 curiosity bait
Product Layer의 임의 claim ranking/truncation으로 의미 왜곡
```

### 6.3 Paid: 나의 명식 — 깊이 읽기 — target experience

차별점 후보:

```text
구조화된 General Natal artifact
더 풍부한 evidence-linked 설명
균형/긴장/한계 포함
저장된 결과물
지속 재열람
후속 atomic-domain navigation
```

무료와 유료의 차이는 `truth access`를 판매한다는 개념이 아니라 **authorized contract 안에서의 artifact depth, structure, persistence, presentation completeness**에 둔다.

### 6.4 Activation caveat

무료/유료 양쪽 모두 실제 production General Natal semantic authority와 각 output-selection policy가 확보되기 전에는 production reading으로 활성화하지 않는다.

---

## 7. Purchase / fulfillment model — PRODUCT PROPOSAL

Launch rail의 `Web + one-off` decision과 정합되는 제품 모델 후보:

```text
one-off purchase
→ one paid General Natal reading fulfillment
→ successful detailed Reading Artifact creation
→ artifact ownership/history에 저장
→ 이후 persistent reread
```

사용자 관점에서는 `30일 기능 이용권`보다 `내 상세 리포트를 구매`하는 모델을 우선 검토한다.

다만 현재 Commerce DB/runtime이 실제로 one-shot consumption ledger를 제공한다고 이 문서는 가정하지 않는다. Exact grant/consumption/fulfillment transaction은 P0-CM-03 Product/Capability decision과 Commerce authority를 확인한 뒤 별도 설계한다.

### Candidate capability concept

```text
saju.reading.general_natal.deep.v1
```

**PROPOSAL ONLY**. Production DB에 seed하지 않는다.

---

## 8. Artifact ownership and provenance — PRODUCT PROPOSAL

상세 결과물은 최소 다음 제품 품질을 목표로 한다.

```text
artifact type/version identifiable
source Birth revision provenance preserved
ReadingIntent/Profile id + version preserved
Saju engine/version provenance preserved
production interpretation pack/rule provenance preserved where source contract supports it
selected evidence/grounding projection preserved
coverage state preserved
scenario/ambiguity/conflict not silently collapsed
Character/presentation identity distinguishable from semantic authority
historical reread does not silently reinterpret old result using mutable current rules
```

### Birth 수정 후 동작

사용자가 Birth 데이터를 수정해도 기존 구매 artifact를 조용히 새 명식으로 재생성하지 않는다.

```text
old artifact = old Birth/profile/pack provenance와 함께 historical result로 유지
new Birth reading = 별도 생성/fulfillment decision 필요
```

정확한 ProductReadingResponse / persisted Reading DTO 필드는 source contract를 따라야 하며 이 문서가 새 API schema를 발명하지 않는다.

### Revocation / refund boundary

향후 Commerce grant가 revoked되는 경우 기존 purchased artifact를 계속 읽을 수 있는지/회수할지는 별도 Product/Legal/Commerce decision이다.

```text
revoked != refund라고 자동 가정하지 않음
artifact delete를 자동 의미하지 않음
```

PSP/refund semantics가 열려 있는 동안 이 문서에서 결정하지 않는다.

---

## 9. Character participation contract

Character는 paid artifact의 전달 품질을 높일 수 있다.

가능:

```text
authorized evidence를 이해하기 쉬운 문장으로 설명
사용자와의 기존 관계 톤 반영
동일 semantic result의 presentation 구성
결과를 읽은 뒤 후속 대화 surface 제공
```

불가:

```text
새 claim 생성
coverage gap 보충
domain 간 새 결론 합성
methodology conflict 임의 해결
확률/점수/예언 추가
```

Canonical result와 Character rendering은 authority가 구분되어야 한다. Character persona 변경이 이미 구매한 semantic artifact의 의미를 조용히 변경해서는 안 된다.

---

## 10. Pricing

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

## 11. Product lifecycle — PRODUCT PROPOSAL

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
semantic readiness       = blocked
saleability              = no-build
```

Repository에 이 enum을 지금 추가하지 않는다.

Semantic gate와 product gate의 진행 순서:

```text
Product proposal
→ Product Interpretation Inventory complete
→ qualifying Saju production interpretation authority
→ General Natal semantic QA
→ free/paid output policy authority
→ Product/Capability exact decision
→ fulfillment semantics
→ pricing/offer decision
→ Commerce/provider independent gates
→ enabled
```

---

## 12. Explicit non-goals

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
T9/T10/T11 semantics borrowing
cross-domain composite conclusion 생성
fortune score 생성
unsupported certainty/prediction 생성
LLM로 missing claim 보충
```

---

## 13. P0-CM-03 closure gate for this SKU

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
[x] reading profile identity exact: myeonghwa-reading-profile-general-natal-v1@1.0.0
[x] profile-selection authorization layer present
[x] request/profile orchestration path present
[ ] qualifying semantic runtime reachability
[ ] evidence/narrative behavior against qualifying production claims
[ ] tests/benchmark exact
```

### Product QA

```text
[ ] free output selection has repository-backed authority
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
[ ] one-off consumption/fulfillment semantics decided
[ ] artifact ownership semantics decided
[ ] price/offer decided separately
```

그때까지:

```text
P0-CM-03 = OPEN
Saleable General Natal SKU = NO
Production Payment = HOLD
```

---

## 14. Next work

다음 작업은 UI mock이나 결제가 아니라 General Natal inventory의 missing semantic authority acquisition이다.

```text
Saju current main
→ T8 General Natal methodology/source acquisition
→ exact production rule/pack/claim construction or enumeration
→ review attestation / reviewer trust
→ production execution-plan preflight
→ semantic E2E
```

Product 설계와 semantic authority를 섞지 않는다. Inventory evidence가 확보될 때 이 proposal의 각 section/output policy activation 가능 여부를 다시 판정한다.
