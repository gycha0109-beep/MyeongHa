# 명하 Character / World Content Specification v0.3 — Full Audit

> Product: **명하 (Myeongha)**  
> Pack Version: **v0.3**  
> Date: **2026-08-25**  
> Source Authority: `Usecase_re_reviewed_v2(1).md`, `Myeongha_DB_ERD_v0.6_AUTHORITY_FIRST(2).md`, `Myeonghwa_Personalized_Interpretation_Architecture_v1.3_THIRD_REVIEW(1).md`  
> Rule: 본 문서는 위 source authority를 구현 수준으로 구체화한다. source가 결정하지 않은 사항은 임의 확정하지 않고 `OPEN-P0` 또는 `CANDIDATE`로 표시한다.

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

Episode authoring에는:

- stable episode ID
- participants
- entry/unlock conditions
- scene graph
- node/choice keys
- allowed relationship/world events
- reward/unlock
- min client capability

를 포함한다.

사주 의미 자체를 episode가 바꾸면 안 된다.

## 9. Asset / Cue Contract

Content bundle은 `ContentManifest`를 가진다.

```text
contentVersion
minClientCapability
assetManifestHash
cueSchemaVersion
characterIds
```

원격 content가 client가 모르는 cue를 강제해서 crash시키면 안 된다.

## 10. Release Semantics

- bundle = immutable canon artifact
- release = rollout/activation operational policy
- 기존 thread는 생성 당시 release/bundle pin 유지
- default release 변경만으로 기존 캐릭터 persona가 변하지 않음
- thread upgrade는 explicit content transition ledger

### Operational disable caveat

`SRC-01`이 열려 있다. Use Case의 캐릭터/에피소드별 operational enabled/disabled 요구와 ERD v0.6의 immutable runtime projection 사이 authority 충돌이 있으므로, source resolution 전에는 per-character/per-episode emergency toggle을 이 content spec이 임의 정의하지 않는다.

## 10.1 Retired Bundle Artifact Retention

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

## 11. Initial Roster Requirement

출시 product 기준:

```text
실제 사용 가능 5명 이상
세계관상 7명 이상 존재 가능
일부 unlock/locked/coming_soon
```

Engineering Slice는 더 작은 dev subset을 사용할 수 있다.

## 12. Content Validation

Publish 전에 자동 검증:

- stable IDs unique
- referenced deity/character/episode 존재
- relation target 존재
- capability domain stable key 존재
- asset references manifest 안에 존재
- cue allowlist schema 적합
- episode graph dangling node 없음
- unlock condition schema 적합
- profanity/persona fields schema 적합
- content policy tags bounded registry 적합
- bounded action/event/cue registry 적합
- minClientCapability valid
- bundle artifact bytes의 digest가 declared content_hash와 일치

## 13. Content Review

기계 검증 외 human review 필요:

- 캐릭터 말투가 서로 충분히 구분되는가
- 역할이 메뉴 담당자처럼만 보이지 않는가
- 강한 성격이 canon과 일관되는가
- 다른 캐릭터를 언급할 때 관계 canon을 위반하지 않는가
- Saju 영역과 character fiction이 혼동되지 않는가

## 14. Publish Flow

```text
Content PR
→ schema validation
→ canon/reference validation
→ asset validation
→ human review
→ immutable bundle build
→ hash/version
→ DB runtime catalog publish
→ release activation
```

Admin UI가 persona를 DB에서 직접 수정하는 방식은 금지한다.
