# Character Detailed Authoring Approval Matrix v1

> 상태: **AUTHORING / APPROVAL CONTROL · NOT PRODUCTION CHARACTER CONTENT**  
> 기준일: **2026-09-07**  
> 범위: 승인된 MVP Launch 9명의 detailed Character authoring에 필요한 현재 권한 상태와 schema-required authoring slot을 한 곳에서 관리  
> 비범위: 실제 canonical `characterId` 할당, 누락된 Character 사실 생성, immutable Character content 승인, `SRC-35` differentiation PASS, runtime catalog publication

## 1. 목적

이 문서는 **무엇을 이미 승인된 사실로 사용할 수 있고, 무엇을 아직 제안/검토해야 하는지**를 명시하는 authoring control ledger다.

현재 repository에는 exact-nine Launch roster/name authority와 Character content schema/validator가 존재하지만, 이 둘을 결합해 누락된 per-Character 값을 자동 생성하는 것은 허용되지 않는다.

```text
schema가 field를 요구함
!=
그 Character의 field 값이 source-authorized 됨
```

따라서 이 문서는 실제 `CharacterContentDefinition` payload가 아니며, 이 문서 자체를 근거로 Production Character bundle을 만들거나 publish해서는 안 된다.

### Authority sources

- `docs/character/CHARACTER_CONCEPT_V1_WORKING_ROSTER.md`
- `docs/source-authority-decisions/CHARACTER_LAUNCH_MVP_AUTHORITY_V1.md`
- `docs/source-authority-gaps/SRC-35_CHARACTER_ROSTER_DIFFERENTIATION_AUTHORITY.md`
- `docs/CHARACTER_WORLD_CONTENT_SPEC.md`
- `MyeongHa_Character_System_Architecture_C1_v0.1_SELF_REVIEWED(1).md`
- `packages/character-content/src/schema.ts`
- `packages/character-content/src/validate.ts`
- `packages/character-content/src/production.ts`

## 2. 상태 정의

| 상태 | 의미 | Production immutable content 사용 |
| --- | --- | --- |
| `APPROVED` | Product Owner 또는 source authority가 실제 값을 명시적으로 확정 | 해당 승인 범위 안에서만 가능 |
| `SOURCE-CONSTRAINED` | architecture/schema가 field·dimension·금지사항·형식을 요구하지만 per-Character 실제 값은 미확정 | 값 authoring/승인 전 불가 |
| `PROPOSAL-REQUIRED` | 실제 per-Character 값의 authoring + 별도 검토/승인이 필요 | 승인 전 불가 |
| `BLOCKED-DO-NOT-INFER` | 다른 승인 값/이름/hook/이미지/모델 출력에서 추론해서 채우면 안 됨 | 불가 |

`PROPOSAL-REQUIRED`는 “AI가 적당히 채워도 된다”는 뜻이 아니다. Draft/proposal은 만들 수 있으나 source/제품 검토를 통과하기 전까지 immutable canon이 아니다.

## 3. 현재 승인된 Launch identity surface

MVP Production Launch roster는 정확히 다음 9명이며 모두 정상 Member에게 Launch 시점부터 default available이다.

| 공식 표시 이름 | Launch membership | Member availability | 승인된 relationship-fantasy direction | 승인된 user-facing hook | canonical `characterId` |
| --- | --- | --- | --- | --- | --- |
| 세연 | `APPROVED` | `APPROVED` — default available | First Companion / 정실감 / 소꿉친구적 순애 | 돌아오면 얘가 있을 것 같다. | `PROPOSAL-REQUIRED` |
| 여울 | `APPROVED` | `APPROVED` — default available | 호감 부정 / 질투 / 숨길 수 없는 관심 | 신경 쓰는 게 너무 티 나는데 본인만 아니라고 우기는 여자. | `PROPOSAL-REQUIRED` |
| 서린 | `APPROVED` | `APPROVED` — default available | 오래 기억해주는 사람 / 잔잔하고 깊은 관계 | 이 사람은 내가 한 말을 정말 기억한다. | `PROPOSAL-REQUIRED` |
| 라현 | `APPROVED` | `APPROVED` — default available | 성숙한 매혹 / 주도권 / 심리전 | 이 사람한테 휘말리고 싶다. | `PROPOSAL-REQUIRED` |
| 미라 | `APPROVED` | `APPROVED` — default available | 잘생긴 여자 / 무심다정 / Friends-to-Lovers | 너무 자연스럽게 가까워서 사랑인지도 몰랐던 잘생긴 여자. | `PROPOSAL-REQUIRED` |
| 태겸 | `APPROVED` | `APPROVED` — default available | 냉미남 / 마찰 / 인정받는 관계 | 저 인간한테 인정받고 싶다. | `PROPOSAL-REQUIRED` |
| 윤호 | `APPROVED` | `APPROVED` — default available | 다정남 / 생활형 안정 / 안경 너드 미남 | 누군가에게 편하게 기대고 싶다. | `PROPOSAL-REQUIRED` |
| 도윤 | `APPROVED` | `APPROVED` — default available | 능글 / 아웃사이더 / 공범 / 선택적 특별취급 | 왜 나한테만 이러지? | `PROPOSAL-REQUIRED` |
| 백헌 | `APPROVED` | `APPROVED` — default available | 연상 / 베테랑 / 으른섹시 / 능력에서 오는 안정 | 흔들리지 않는 어른의 사적인 얼굴을 보고 싶다. | `PROPOSAL-REQUIRED` |

### Important boundary

Relationship-fantasy direction과 hook은 **그 문구와 방향 자체의 승인**이다. 그 문구에 포함된 성별·연령·외형 뉘앙스를 `gender`, `apparentAgeBand`, visual canon 또는 기타 detailed field의 독립 authority로 승격하지 않는다.

예:

```text
hook에 “여자”가 등장함
!= gender canon field 승인

hook에 “연상”이 등장함
!= apparentAgeBand 승인

“안경 너드 미남” direction
!= final visual profile 승인
```

## 4. 9인 공통 detailed-authoring 권한 매트릭스

아래 상태는 **세연 / 여울 / 서린 / 라현 / 미라 / 태겸 / 윤호 / 도윤 / 백헌 모두 동일하게 적용**된다. 별도 Character-specific 승인 source가 추가되기 전에는 이름이나 relationship hook으로 값을 보충하지 않는다.

| Detailed authoring 영역 | 현재 상태 | 현재 source가 허용하는 것 | 아직 필요한 것 |
| --- | --- | --- | --- |
| `displayName` | `APPROVED` | 승인된 9개 공식 표시 이름 사용 | 없음 |
| Launch membership/cardinality | `APPROVED` | exact 9 유지 | 없음 |
| Launch Member availability | `APPROVED` | 정상 Member에게 9명 모두 default available | 없음 |
| relationship-fantasy direction/hook | `APPROVED` | 기존 direction/hook 보존 | 상세 behavior로의 승격은 별도 승인 |
| canonical `characterId` | `BLOCKED-DO-NOT-INFER` | stable ID가 필요하다는 schema 요구만 사용 | 9명 각각의 canonical ID 제안/승인 |
| `gender` | `BLOCKED-DO-NOT-INFER` | Production에서 source-authored gender가 필요하다는 gate | 각 Character의 final gender canon 승인 |
| `deityProxyLabel` | `PROPOSAL-REQUIRED` | authored non-placeholder value 필요 | 각 Character 값 승인 |
| `shortDescriptor` | `PROPOSAL-REQUIRED` | non-empty authoring slot | 각 Character 값 승인 |
| `personalityTraits[]` | `PROPOSAL-REQUIRED` | authored Character에서 non-empty 필요 | 각 Character 값 승인 |
| `flaws[]` | `PROPOSAL-REQUIRED` | real flaw가 필요하며 authored Character에서 non-empty | 각 Character 값 승인 |
| `values[]` | `PROPOSAL-REQUIRED` | authored Character에서 non-empty | 각 Character 값 승인 |
| `speech` | `SOURCE-CONSTRAINED` | speech shape와 `alter_saju_semantics` 금지 등 runtime boundary | 각 Character speech 값 승인 |
| `capabilities[]` | `SOURCE-CONSTRAINED` | non-empty, domain 중복 금지, versioned role/canInitiate shape | 각 Character capability 배치 값 승인 |
| `emotionIds` | `SOURCE-CONSTRAINED` | authored runtime Character에서 non-empty stable keys 필요 | 각 Character allowlist 승인 |
| `animationCueIds` | `SOURCE-CONSTRAINED` | stable-key list shape | 각 Character cue allowlist 승인 |
| `assetRefs[]` | `PROPOSAL-REQUIRED` | schema slot만 존재 | 실제 asset와 provenance 승인 |
| `canon` | `PROPOSAL-REQUIRED` | C1/schema가 required dimensions를 정의 | 각 Character actual canon 승인 |
| `visual` | `BLOCKED-DO-NOT-INFER` | Production에서 versioned authored visual이 필수 | 각 Character final visual canon 승인 |
| `persona` | `PROPOSAL-REQUIRED` | C1/schema가 dimensions를 정의 | 각 Character actual persona 승인 |
| `behavior` | `PROPOSAL-REQUIRED` | versioned policy/rule shape 존재 | 각 Character behavior rules 승인 |
| `sajuProfile` | `PROPOSAL-REQUIRED` | attention/framing/question strategy shape 존재 | 각 Character actual Saju framing/profile 승인 |
| `relationshipBehavior` | `PROPOSAL-REQUIRED` | relationship state/rule shape 존재 | 각 Character actual progression behavior 승인 |
| Character-to-Character relation graph | `BLOCKED-DO-NOT-INFER` | directed/asymmetric relation 개념 및 C1 evidence requirement | canonical relation/history authoring + 승인 |
| shared historical events | `BLOCKED-DO-NOT-INFER` | 각 Launch Character에 shared-history evidence가 필요하다는 C1 requirement | 실제 사건 canon + representation 승인 |
| asset-manifest provenance | `PROPOSAL-REQUIRED` | Production bundle은 versioned `sha256:v1` manifest provenance 필요 | 실제 assets 확정 후 hash/provenance 생성 |
| roster differentiation PASS | `BLOCKED-DO-NOT-INFER` | differentiation axes/evidence intent만 source-backed | `SRC-35` acceptance semantics resolution |

## 5. Exact `CharacterContentDefinition` authoring checklist

이 절은 **현재 TypeScript schema/validator가 요구하는 authoring surface**를 기록한다. 빈칸의 값은 이 문서가 결정하지 않는다.

### 5.1 Top-level Character fields

```text
characterId                  → schema-required; per-Character actual value NOT APPROVED
contentVersion               → schema-required; bundle version과 일치

displayName                  → APPROVED exact-nine name authority
gender                       → schema optional / Production required; actual value NOT APPROVED
deityProxyLabel              → required; placeholder 금지 for authored Character
shortDescriptor              → required
personalityTraits[]          → authored Character non-empty
flaws[]                      → authored Character non-empty
values[]                     → authored Character non-empty
speech                       → required profile
capabilities[]               → non-empty; domain unique
assetRefs[]                  → schema-required array; actual refs/provenance NOT APPROVED
emotionIds[]                 → authored Character non-empty stable keys
animationCueIds[]            → stable-key list
canon                        → non-placeholder authored Character required
visual                       → Production required
persona                      → non-placeholder authored Character required
behavior                     → non-placeholder authored Character required
sajuProfile                  → non-placeholder authored Character required
relationshipBehavior         → non-placeholder authored Character required
developmentPlaceholder       → Production FORBIDDEN
```

### 5.2 Speech profile

Schema shape:

```text
register
sentenceRhythm
directness: low | medium | high
warmth: low | medium | high
profanity: none | light | moderate
forbiddenBehaviors[]:
  alter_saju_semantics
  invent_current_life_fact
  mutate_relationship_directly
  invent_world_canon
```

Validator requires `alter_saju_semantics` to be included. 이 boundary는 Character 표현이 Saju semantic authority를 변경하지 못하게 하는 runtime constraint이며, 각 Character의 실제 register/rhythm/directness/warmth/profanity 값은 별도 authoring 대상이다.

### 5.3 Canon

```text
worldRole
origin
apparentAgeBand

deityBond:
  deityId                 → stable lower-case key
  representationRole
  oath
  acceptedDoctrine[]
  resistedDoctrine[]

worldview:
  coreValues[]            → non-empty
  humanTheory
  agencyTheory
  truthTheory

psychology:
  desire
  fear
  flaw
  contradiction
  hiddenMotivation
```

현재 9명 각각의 위 값은 승인되지 않았다. 특히 display name, relationship fantasy, concept reference로부터 `origin`, `apparentAgeBand`, `deityId`, oath 또는 psychology를 추론하지 않는다.

### 5.4 Visual

```text
visualVersion
visualDirection
silhouette
palette[]                  → Production authored visual에서 non-empty
motifs[]                   → Production authored visual에서 non-empty
costumeDirection
prohibitedTropes[]         → Production authored visual에서 non-empty
```

Concept/reference image가 존재하더라도 그것은 final immutable visual canon이 아니다. Production validator는 authored `visual` presence를 요구하지만 **어떤 visual 값이어야 하는지는 결정하지 않는다.**

### 5.5 Persona

```text
communication:
  register
  sentenceRhythm
  verbosity
  humorStyle
  metaphorStyle
  profanityIntensity
  politenessStyle

cognition:
  thinkingTempo
  ambiguityTolerance
  conclusionStyle
  contradictionSensitivity

questioning:
  preferredStrategies[]    → non-empty stable keys
  avoidedStrategies[]      → stable keys; preferred와 중복 금지
  followUpDepth

emotion:
  expressiveness
  empathyStyle
  angerStyle
  embarrassmentStyle

conflict:
  confrontationStyle
  apologyStyle
  withdrawalStyle

intimacy:
  pace
  selfDisclosure
  boundaryStyle
  attachmentExpression
```

C1 differentiation dimensions는 이 authoring에 제약을 주지만, 9명의 실제 값은 아직 별도 proposal/approval 대상이다.

### 5.6 Behavior

```text
policyVersion
questionPriorities[]        → non-empty stable keys
supportPriorities[]         → non-empty stable keys
rules[]                     → non-empty

rule:
  ruleKey                   → stable key / unique
  triggerKey                → stable key
  priority                  → integer 0..1000
  preferredResponse
  avoid[]
  fallback?                 → supplied하면 non-empty
```

Schema가 behavior rule DSL shape를 제공한다고 해서 각 Character의 trigger/priority/response가 source-authorized 된 것은 아니다.

### 5.7 SajuProfile

```text
profileVersion
attentionAxes[]                     → non-empty stable keys
followUpQuestionStrategies[]        → non-empty stable keys
framingStyle
uncertaintyResponseStyle
insufficientEvidenceResponseStyle
referralBehavior:
  maySuggestAnotherCharacter
  conditions[]                      → stable keys
safeFraming?                        → optional schema slot
```

`maySuggestAnotherCharacter=false`이면 validator는 `conditions`를 허용하지 않는다.

`safeFraming`이 작성될 경우:

```text
schemaVersion = v1
catalogVersion
before[] / after[]                  → 각각 non-empty
entry.key                           → unique stable key
entry.text                          → non-empty, <= 500 chars, dynamic interpolation 금지
entry.purpose                       → record_transition |
                                      current_life_question |
                                      uncertainty_transition |
                                      relationship_transition
```

Character의 SajuProfile은 **Saju 의미를 새로 만드는 authority가 아니다.** Character는 source-authorized Saju semantic payload를 표현/질문/framing하는 범위 안에서만 작동한다.

### 5.8 RelationshipBehavior

```text
behaviorVersion

defaultMode:
  distance
  questionDepth
  selfDisclosure
  humorIntensity
  directness
  memoryReferenceFrequency
  nicknameBehavior
  conflictSensitivity

rules[]                     → non-empty
rule:
  ruleKey                   → stable key / unique
  priority                  → integer 0..1000 / rule set 내 unique
  when:
    stageKeys?
    trustBands?             → low | medium | high
    closenessBands?         → low | medium | high
    frictionBands?          → low | medium | high
    recentEventKeys?        → bounded RelationshipEventCandidate
  mode                      → complete CharacterRelationshipMode
```

각 rule은 최소 하나의 condition을 가져야 한다. 이 runtime shape는 relationship progression 구현 slot이며, approved relationship-fantasy phrase만으로 실제 rule을 자동 생성해서는 안 된다.

## 6. Bundle / Production publication prerequisites

`CharacterContentBundle` 및 Production boundary는 최소 다음을 요구한다.

```text
bundleId
contentVersion
assetManifestHash           → Production: sha256:v1:<64 hex>
cueSchemaVersion
minClientCapability
characters                  → exact approved 9 display names
```

Production publication 시:

- exact nine roster count/name set이어야 한다;
- `developmentPlaceholder`가 없어야 한다;
- 모든 Character에 source-authored `gender`가 있어야 한다;
- 모든 Character에 source-authored versioned `visual`이 있어야 한다;
- generic authored-character validator가 Canon/Persona/Behavior/SajuProfile/RelationshipBehavior 등 required content를 통과해야 한다;
- asset manifest provenance가 있어야 한다.

그러나 위 validator PASS는 **authored payload가 source-approved라는 provenance를 대신하지 않으며**, `SRC-35` roster differentiation PASS도 대신하지 않는다.

## 7. C1 roster-level evidence boundary

C1은 Launch roster Character differentiation을 단순 말투 차이로 보지 않는다. 최소 design differentiation에는 다음 축이 포함된다.

```text
Human Theory
Question Strategy
Agency View
Conflict Style
Memory Attitude
Saju Attention
Relationship Progression
Other-character relations
Real flaw
Hidden motivation
```

또한 각 Launch Character는 roster/world relation 측면에서 다음 evidence를 가져야 한다.

```text
1 strong positive tie
1 meaningful tension
1 asymmetrical relation
1 shared historical event
```

현재 source는 이 qualitative evidence를 최종 `PASS/FAIL`로 변환하는 comparison topology, threshold, equivalence semantics 또는 review authority를 정의하지 않는다. 따라서 이 매트릭스는 `SRC-35`를 닫지 않는다.

## 8. 승인 transition

Detailed Character content는 다음 순서를 따른다.

```text
source-safe proposal / draft
→ Character-specific human / Product Owner source review
→ approved per-Character value ledger
→ immutable CharacterContentDefinition authoring
→ generic schema / validator
→ Production exact-nine / gender / visual / asset-provenance gate
→ SRC-35-governed roster differentiation acceptance once resolved
→ immutable bundle build + hash/version
→ runtime catalog publication
→ active release activation
```

어느 단계도 앞 단계를 추론으로 건너뛰지 않는다.

## 9. 금지되는 shortcut

다음은 이 문서 이후에도 금지한다.

1. 공식 표시 이름을 slug/영문명으로 변환해 canonical `characterId` authority라고 주장.
2. relationship-fantasy/hook의 “여자/남/연상/미남/잘생긴” 표현을 final `gender`, `apparentAgeBand`, visual canon으로 승격.
3. concept/reference image에서 의상·palette·silhouette·소품·나이·성별을 추출해 immutable canon으로 사용.
4. relationship-fantasy 방향만으로 Persona/Behavior/RelationshipBehavior rules 전체를 생성해 승인된 값으로 취급.
5. schema field 존재를 실제 per-Character 값 승인으로 오인.
6. LLM/generated prose를 별도 승인 없이 immutable Canon/Persona/Behavior/SajuProfile/RelationshipBehavior로 승격.
7. Launch 9개 이름이 확정됐다는 이유로 `SRC-35` differentiation PASS 선언.
8. Character별 SajuProfile이 Saju 계산/해석 semantic authority를 변경하도록 작성.
9. 개발 fixture/placeholder를 Production content로 승격.
10. 실제 asset provenance 없이 임의 manifest hash를 만들어 publication을 통과시킴.

## 10. `O-C1-05` / `SRC-35` 현재 상태

```text
O-C1-05
  Launch membership/cardinality    → RESOLVED
  official display names           → RESOLVED
  canonical characterId            → OPEN
  detailed canon/gender/visual     → OPEN
  detailed Persona/Behavior/Saju   → OPEN
  Character-to-Character canon     → OPEN
  asset provenance                 → OPEN

SRC-35
  exact roster/name input          → RESOLVED
  differentiation axes intent      → SOURCE-CONSTRAINED
  comparison/equivalence semantics → OPEN
  deterministic/human review authority → OPEN
  Production differentiation PASS  → BLOCKED
```

## 11. Definition of Done for this matrix

이 문서의 완료 조건은 Character content 자체의 완료가 아니다. 다음을 만족하면 이 control matrix는 역할을 수행한다.

- exact nine approved identity surface를 보존한다;
- schema-required authoring surface를 누락 없이 드러낸다;
- per-Character approved value와 schema requirement를 분리한다;
- 아직 승인되지 않은 값을 명확히 OPEN/PROPOSAL로 남긴다;
- authoring proposal → approval → immutable content → Production gate의 순서를 고정한다;
- `SRC-35`가 여전히 별도 blocker임을 보존한다.

이후 실제 9인 상세 authoring은 **이 매트릭스의 빈 권한 영역을 proposal로 채우고 Product Owner/source approval을 받는 별도 단계**에서 수행한다.
