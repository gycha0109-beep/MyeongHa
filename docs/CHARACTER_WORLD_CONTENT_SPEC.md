# 명하 Character / World Content Specification v0.4 — Source Aligned

> Product: **명하 (Myeongha)**  
> Pack Version: **v0.4**  
> Date: **2026-08-28**  
> Source Authority: `Usecase_re_reviewed_v2(1).md`, `Myeongha_DB_ERD_v0.6_AUTHORITY_FIRST(2).md`, `Myeonghwa_Personalized_Interpretation_Architecture_v1.3_THIRD_REVIEW(1).md`  
> Rule: 본 문서는 위 source authority를 구현 수준으로 구체화한다. source가 결정하지 않은 사항은 임의 확정하지 않고 `OPEN-P0`, `CANDIDATE`, 또는 numbered source-gap으로 표시한다.

---

## 1. 목적

캐릭터를 단순 prompt 텍스트가 아니라 **versioned canon content**로 관리한다.

DB는 canon 저작 authority가 아니다.

```text
Git/versioned source
→ validation
→ immutable content bundle
→ content hash/version
→ runtime catalog
→ operational release
```

## 2. Content Repository Candidate

```text
packages/character-content/
  schema/
  characters/
  deities/
  relations/
  episodes/
  scenes/
  assets-manifest/
  bundles/
```

## 3. Character Definition

```ts
interface CharacterDefinition {
  characterId: string;
  schemaVersion: string;
  display: { name: string; shortDescription: string };
  deity: { deityId: string; representationRole: string };
  persona: CharacterPersona;
  voice: CharacterVoice;
  specialties: string[];
  capabilities: CharacterCapabilityAuthoring[];
  relationshipBehavior: RelationshipBehavior;
  boundaries: CharacterBoundary[];
  policyTags: ContentPolicyTag[]; // bounded registry; age threshold 자체는 P0-AGE-01
  assets: CharacterAssetRefs;
}
```

UC-24는 character content에 `unlock 조건`이 포함되어야 한다고 요구한다. 다만 primary source는 그 조건의 positive executable schema/DSL을 정의하지 않는다. 따라서 실제 `unlockCondition` field shape/evaluator는 `SRC-23` 해결 전 위 interface의 source-backed field로 임의 확정하지 않는다.

## 4. Persona

필수 dimension:

- temperament
- values
- flaws
- desires
- dislikes
- contradiction/tension
- conflict behavior
- intimacy behavior
- jealousy/possessiveness 여부
- humor
- profanity intensity
- politeness style

**결함 없는 모범 답안형 캐릭터를 기본값으로 만들지 않는다.**

## 5. 신의 대리자 규칙

대리자는 신 그 자체가 아니며 전지전능하지 않다.

세계관상 최소 경계:

```text
태어난 순간의 기록/명식
→ 읽을 수 있음

현재 직업/연애/최근 사건
→ 사용자가 말하지 않으면 자동으로 알지 못함
```

이는 개인정보 UX와 canon 모두에 동일하게 적용한다.

## 6. Character Capability Authoring

대표 역할과 실제 Saju capability를 분리한다. `sajuDomain`, `role`, cue/action identifiers는 `SHARED_DOMAIN_CONTRACTS_SPEC.md`의 bounded registry/schema를 사용한다.

```text
career: 업 primary, 재 secondary, 시 secondary
relationship: 연 primary, 명 commentary
```

한 domain을 한 캐릭터가 독점하지 않는다.

Runtime availability는 `saju_domain_runtime`과 Capability Gate가 추가로 확인한다.

## 7. Character Relations

```ts
interface CharacterRelation {
  fromCharacterId: string;
  toCharacterId: string;
  relationKey: string;
  familiarity: string;
  tension: string;
  canonFacts: string[];
  allowedReferenceTopics: string[];
}
```

LLM이 관계의 공식 과거사를 즉흥 생성하지 않는다.

## 8. Episode Contract

UC-25가 요구하는 Episode authoring 개념:

- stable episode ID
- participants
- entry/unlock conditions
- scene graph
- node/choice keys
- relationship events
- unlock reward
- version

사주 의미 자체를 episode가 바꾸면 안 된다.

단, 각 개념의 **실행 schema가 source-backed라는 뜻은 아니다.** 실제 scene transition/condition/choice evaluator는 `SRC-17`, Relationship Event score/stage evaluator는 `SRC-22`, concrete Character Unlock condition/effect evaluator는 `SRC-23`이 각각 열린 상태다.

따라서 `entry/unlock condition`, `relationship events`, `unlock reward` authoring slot을 Pack이 임의 JSON/DSL로 정의하거나 source-complete evaluator가 존재한다고 주장하지 않는다.

## 9. Character Unlock / World Event Boundary — `SRC-23` OPEN

UC-14 fixes this product-level flow:

```text
Unlock condition satisfied
→ World Event created
→ Hall silhouette changes
→ first appearance scene
→ CHARACTER_UNLOCKED event recorded
```

Trigger examples include relationship stage, first domain Reading, episode completion, season event, and operator reveal.

ERD fixes:

```text
world_events        = append-only subject world ledger
character_unlocks   = locked/unlocked current projection
source_world_event_id = optional latest causal event
```

Source does not define:

```text
final unlock condition schema/DSL
World Event registry/payload schema for unlock causality
condition → target character mapping
first-appearance/reward effect mapping
already-unlocked/replay/concurrency semantics
content-bundle condition migration semantics
season/operator reveal execution authority
unlock-specific outbox/event contract
```

Accordingly:

- stored `character_unlocks` projection may be read/rendered;
- same-subject World Event FK proves provenance shape only;
- `source_world_event_id` alone does not prove that event is authorized to unlock the selected character;
- caller/LLM-supplied `character_id`, `unlock=true`, condition result, or reward target is not authority;
- authoritative Character Unlock mutation remains blocked until `SRC-23`.

Relationship-stage-driven character unlock additionally requires `SRC-22`; episode-completion-driven unlock additionally requires `SRC-17` where the episode completion transition itself is not yet source-complete.

## 10. Asset / Cue Contract

Content bundle은 `ContentManifest`를 가진다.

```text
contentVersion
minClientCapability
assetManifestHash
cueSchemaVersion
characterIds
```

원격 content가 client가 모르는 cue를 강제해서 crash시키면 안 된다.

## 11. Release Semantics

- bundle = immutable canon artifact
- release = rollout/activation operational policy
- 기존 thread는 생성 당시 release/bundle pin 유지
- default release 변경만으로 기존 캐릭터 persona가 변하지 않음
- thread upgrade는 explicit content transition ledger

### Operational disable caveat

`SRC-01`이 열려 있다. Use Case의 캐릭터/에피소드별 operational enabled/disabled 요구와 ERD v0.6의 immutable runtime projection 사이 authority 충돌이 있으므로, source resolution 전에는 per-character/per-episode emergency toggle을 이 content spec이 임의 정의하지 않는다.

### Unlock condition caveat

Default release/content bundle 변경만으로 기존 subject의 `character_unlocks` projection을 임의 재평가하거나 자동 rewrite하지 않는다. 조건 version 변경 시 locked/unlocked 사용자에 어떤 migration semantics를 적용할지는 `SRC-23` resolution이 필요하다.

## 11.1 Retired Bundle Artifact Retention

`content_releases` retirement은 immutable bundle artifact 삭제를 의미하지 않는다.

기존 thread/episode progress가 과거 bundle에 pin되어 있는 동안 runtime은 해당 artifact를 계속 resolve할 수 있어야 한다.

```text
release retired
→ new resolution 대상에서 제외 가능
→ existing pinned thread/progress artifact는 유지
```

Artifact garbage collection은 최소 다음을 확인한 뒤에만 가능하다.

- active/continuable thread pin 없음
- active episode progress pin 없음
- forced safety transition이 필요한 대상 처리 완료
- historical reproduction/retention policy 충족

실제 장기 보존 기간은 `OPEN-P0: P0-PR-01`을 따른다.

## 12. Initial Roster Requirement

출시 product 기준:

```text
실제 사용 가능 5명 이상
세계관상 7명 이상 존재 가능
일부 unlock/locked/coming_soon
```

Engineering Slice는 더 작은 dev subset을 사용할 수 있다.

## 13. Content Validation

Publish 전에 source-complete 범위의 자동 검증:

- stable IDs unique
- referenced deity/character/episode 존재
- relation target 존재
- capability domain stable key 존재
- asset references manifest 안에 존재
- cue allowlist schema 적합
- episode graph dangling node 없음 once the source-approved episode graph contract exists
- profanity/persona fields schema 적합 where the authored schema defines them
- content policy tags bounded registry 적합
- bounded action/event/cue registry 적합 only for registries actually defined by source
- minClientCapability valid
- bundle artifact bytes의 digest가 declared content_hash와 일치

`SRC-23` 해결 전 **`unlock condition schema 적합`을 source-complete validation gate로 두지 않는다.** Source가 condition concept을 요구하는 것과 executable schema를 제공하는 것은 별개다.

Episode graph/condition semantic validation은 `SRC-17`, relationship event policy validation은 `SRC-22`, Character Unlock eligibility/effect validation은 `SRC-23` resolution 이후 각각 source-approved contract로 추가한다.

## 14. Content Review

기계 검증 외 human review 필요:

- 캐릭터 말투가 서로 충분히 구분되는가
- 역할이 메뉴 담당자처럼만 보이지 않는가
- 강한 성격이 canon과 일관되는가
- 다른 캐릭터를 언급할 때 관계 canon을 위반하지 않는가
- Saju 영역과 character fiction이 혼동되지 않는가
- unlock authoring concept이 UC-14/UC-24 의도와 일치하는가; 단 human review가 missing executable schema를 대체하지는 않는다.

## 15. Publish Flow

```text
Content PR
→ source-complete schema validation
→ canon/reference validation
→ asset validation
→ human review
→ immutable bundle build
→ hash/version
→ DB runtime catalog publish
→ release activation
```

Admin UI가 persona를 DB에서 직접 수정하는 방식은 금지한다.

Character Unlock condition/effect evaluator는 content publish 자체와 별도 authority이며 `SRC-23` 해결 전 production mutation path로 승격하지 않는다.
