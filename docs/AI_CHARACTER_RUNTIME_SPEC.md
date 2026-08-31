# 명하 AI / Character Runtime Specification v0.4 — SRC-33 Bound

> Product: **명하 (Myeongha)**  
> Pack Version: **v0.4**  
> Date: **2026-08-31**  
> Source Authority: `Usecase_re_reviewed_v2(1).md`, `Myeongha_DB_ERD_v0.6_AUTHORITY_FIRST(2).md`, `Myeonghwa_Personalized_Interpretation_Architecture_v1.3_THIRD_REVIEW(1).md`  
> Rule: source가 결정하지 않은 implementation-critical 사항은 `OPEN-P0`, 비차단 선택은 `CANDIDATE`, source 간 충돌/공백은 `SOURCE_AUTHORITY_GAPS.md` 또는 numbered source-gap 문서에 기록한다.

---

## 1. 목적

캐릭터 개성과 지속 관계를 유지하면서 Saju semantic authority, 개인정보 권한, 관계/해금/결제 authority를 LLM에게 넘기지 않는 runtime을 정의한다.

## 2. Runtime Pipeline

```text
User Message
→ Chat Turn RECEIVED
→ Dialogue Planner
→ Capability Gate
→ Server Retrieval
→ Policy-Filtered Context Assembler
→ Character Renderer
→ Output Guard
→ Atomic Commit
→ Controlled Reveal
```

## 3. Bounded Planner Contract

Planner는 제안자다. output의 key는 `SHARED_DOMAIN_CONTRACTS_SPEC.md` registry를 통과해야 한다.

```ts
interface DialoguePlanV1 {
  schemaVersion: 'v1';
  intent: IntentKey;
  sceneIntent: SceneIntentKey;
  needsSaju: boolean;
  sajuDomain?: SajuDomain;
  requiredLifeFactTypes: LifeFactTypeKey[];
  requestedMemoryScopes: MemoryScopeKey[];
  requestedActions: PlannedActionV1[];
}
```

unknown `intent/action/factType/domain/characterId`는 실행하지 않는다. Planner가 DB path/tool name을 만들 수 없다.

## 4. Capability Gate

```text
CharacterCapability
+ UserConsent
+ SajuDomainAvailability
+ WorldState
+ Entitlement
+ Age/Content Policy (OPEN-P0: P0-AGE-01)
+ ClientCapability
→ allowed / denied / clarification-required
```

Gate는 deterministic server code다.

## 5. Policy-Filtered Context Assembler

Renderer context에 들어갈 수 있는 것만 retrieval 단계에서 선택한다.

```text
character canon for pinned bundle
world relation canon for pinned bundle
current relationship projection
explicitly granted Life Facts
explicitly granted Memories
selected current-thread recent messages
source-approved validated CharacterSajuContextEnvelopeV2
scene state
```

비공개 데이터를 prompt에 넣고 숨기라고 지시하는 방식 금지.

`CharacterSajuContextEnvelopeV2`의 존재는 raw transport body를 runtime grounding으로 승격할 authority를 만들지 않는다. `SRC-33` 해결 전 real Saju transport response에서 production semantic envelope를 구성하지 않는다. Lower-level runtime/renderer invariants는 explicitly prevalidated canonical fixture로 독립 검증할 수 있다.

## 6. CharacterSajuContextEnvelopeV2 — `SRC-33` semantic-finalization prerequisite

Character Runtime은 Saju 내부 claim graph 또는 Pack이 임의 합성한 semantic claim DTO를 받지 않는다. Source-approved positive Product validator가 승인한 immutable Reading의 public `ProductReadingResponse` consumer blocks/disclosures/ambiguity만 protected ref로 전달받는다.

```ts
interface CharacterSajuContextEnvelopeV2 {
  schemaVersion: 'v2';
  readingRef: string;
  sajuResponseVersion: string;
  engineVersion: string;
  domain: SajuDomain;
  productState: ProductReadingResponseState;
  requiredAction: ProductReadingResponseRequiredAction;
  protectedReadingBlocks: readonly ProtectedProductBlockRef[];
  disclosures: readonly ProtectedDisclosureRef[];
  calculationAmbiguity: readonly ProductReadingResponseCalculationAmbiguity[];
  explicitGuardMetadata?: SajuPublicGuardMetadata;
}
```

이 interface는 **downstream context envelope target shape**이지 `ProductReadingResponse` positive validator가 아니다. Current exported TypeScript shape compile/deserialization, successful transport, JSON persistence만으로 이 envelope를 production-authoritative하게 생성하지 않는다. `SRC-33`은 complete Product response positive schema/state-specific nested rules/unknown-field/cardinality/null semantics/contract evolution/validator result contract가 source-approved되기 전 real semantic promotion을 차단한다.

`explicitGuardMetadata`는 Saju **public contract가 실제 제공할 때만** 존재한다. 현재 public response에 없는 `semanticClaims/qualifiers/prohibitedInferences`를 Character Runtime용으로 임의 만들어 넣지 않는다. `SRC-08`, `SRC-09`, `SRC-33`을 따른다.

## 7. Saju-bearing Text: Production Baseline

Saju source architecture는 free-form LLM semantic equivalence를 현재 validator만으로 완전 증명할 수 없으며 첫 production-capable narrative는 deterministic rendering을 우선한다. 따라서 명하 baseline은 source-approved validated Product response가 존재하는 경우 다음을 따른다.

```text
source-approved validated Saju public ProductReadingResponse governed block/disclosure
→ PROTECTED_SEMANTIC_SEGMENT

Character Renderer
→ non-semantic framing / reaction / transition / current-life question
```

`SRC-33` 해결 전 transport success body 또는 exported-shape-compatible fixture를 real production `PROTECTED_SEMANTIC_SEGMENT`로 승격하지 않는다. Prevalidated canonical fixture는 downstream renderer/guard 테스트에만 사용할 수 있으며 Product response validation PASS evidence가 아니다.

### 금지

- protected Saju block을 LLM이 자유 요약/재해석/강화
- protected public response 밖의 새 소비자 명리 문장을 LLM이 즉흥 생성
- ambiguity를 하나의 결과로 임의 선택

### 허용

- deterministic approved block을 그대로 또는 source-approved deterministic template로 표시
- 그 앞뒤에 캐릭터의 감정/말투/질문을 추가하되 Saju claim을 추가하지 않음

향후 full character paraphrase를 허용하려면 별도 semantic-preservation validator/eval gate가 필요하다. 이것은 단순 provider 선택만으로 승격되지 않는다.

## 8. Character Renderer Output

```ts
interface CharacterDialogueEnvelopeV1 {
  schemaVersion: 'v1';
  framingBefore?: string;
  protectedSajuSegments?: ProtectedSajuSegmentRef[];
  framingAfter?: string;
  emotion: EmotionId;
  animationCue?: AnimationCueId;
  memoryProposals?: MemoryProposalDraftV1[];
  relationshipEventProposals?: RelationshipEventCandidateV1[];
  suggestedActions?: SuggestedActionV1[];
}
```

General non-Saju chat은 `framingBefore/After`가 본문 역할을 할 수 있다. Saju-bearing response는 protected segment provenance가 유지되어야 한다.

## 9. Persona Contract

Content bundle authority:

```text
identity / deity symbolism
values / flaws / desires / dislikes
speech / profanity / conflict / intimacy style
relationship behavior
other-character relations
asset/cue allowlist
hard prohibitions
```

모든 캐릭터를 착하고 정중하게 평준화하지 않는다. hard policy와 Saju truth boundary가 persona보다 우선한다.

## 10. Output Guard

최소 검증:

- protected semantic segment hash/ref가 source-approved validated `reading_refs.response_snapshot_jsonb` projection과 일치
- public disclosures/ambiguity를 누락하거나 의미를 바꾸지 않음
- `SRC-09` 해결 전 explicit prohibited-inference metadata 검증을 했다고 허위 PASS하지 않음
- `SRC-33` 해결 전 raw transport/exported-shape response를 validated Reading provenance로 간주하지 않음
- public calculation/reading ambiguity가 존재하는데 이를 확정 단정으로 평탄화하지 않음
- 다른 user/private memory 누출 없음
- canon에 없는 공식 과거사 사실화 없음
- emotion/cue/action registry + character allowlist 통과
- LLM proposal이 authority mutation으로 직접 commit되지 않음

Guard가 semantic equivalence를 증명할 수 없는 free-form Saju paraphrase는 **baseline에서 허용 대상이 아니다**.

Output Guard의 downstream ref/hash 일치 검사는 missing positive `ProductReadingResponse` validator를 대체하지 않는다. 입력 Reading 자체의 semantic promotion은 `SRC-33` source-approved application validation이 선행되어야 한다.

## 11. Controlled Reveal

```text
generation
→ structural/output validation
→ atomic commit
→ controlled reveal
```

여기서 structural/output validation은 Character Renderer output에 대한 downstream validation이다. `SRC-33`이 막는 upstream Product response positive validation을 대신하지 않는다.

검증 전 Saju semantic token 공개 금지. 일반 비-Saju streaming은 `OPEN-P0: P0-AI-01` provider/runtime 결정 뒤 세부화 가능.

## 12. Chat Attempt Retry / Abandon

`chat_turns` = logical turn. `chat_turn_attempts` = orchestration attempt.

- failed_retryable retry → same turn, new attempt
- committed/delivered → regeneration 금지
- retryable turn을 사용자가 포기할 수 있는 explicit `abandon` transition 필요
- one-in-flight 정책 때문에 abandon/retry UX 없이 다음 turn을 영구 차단하면 안 됨

## 13. Memory Proposal

LLM은 `Life Fact candidate` 또는 `Character Memory candidate`만 제안. type/schema는 bounded registry.

사용자 resolution:

```text
accept long-term
session-only
reject
```

`session-only`는 durable Life Fact/Memory row를 생성하지 않는다.

## 14. Relationship Proposal

LLM은 allowlisted semantic event candidate만 제안할 수 있다. 실제 delta/stage/unlock은 Relationship Engine policy가 결정한다.

## 15. Multi-Character Scene Director

```ts
interface ScenePlanV1 {
  schemaVersion: 'v1';
  participants: CharacterId[];
  maxTurns: number;
  turns: readonly { speaker: CharacterId; purpose: ScenePurposeKey }[];
}
```

- same pinned bundle
- finite maxTurns
- participant capability/privacy/canon gate
- autonomous infinite loop 금지

## 16. AI Execution Provenance

기록:

- provider/model
- planner/renderer/guard versions
- content release/bundle
- character
- exact grounding refs when source-approved validated grounding exists
- token/latency/status
- `SRC-33` status when Saju product-semantic finalization is blocked

Transport execution provenance may be recorded independently. `SRC-33` 해결 전 `readingContractVersion`/grounding ref를 successful transport body에서 임의 합성해 validated semantic provenance로 기록하지 않는다.

일반 observability에 raw Birth/full transcript/auth token/service secret 금지.

## 17. Provider Boundary

`OPEN-P0: P0-AI-01`.

```ts
interface AiRuntimeProvider {
  plan(input: PlannerProviderInput): Promise<PlannerProviderOutput>;
  render(input: RendererProviderInput): Promise<RendererProviderOutput>;
}
```

Provider output은 shared schema validation 전에는 domain object가 아니다. Provider 자체가 authorization/output truth authority가 아니다.

Saju transport/provider output도 동일하게 transport 성공만으로 product-semantic Reading 또는 Character grounding authority가 되지 않는다. 해당 promotion은 `SRC-33`의 별도 source-approved positive Product validator를 요구한다.

## 18. Acceptance Gates

- unknown planner key/action → no execution
- non-granted memory absent from context dump
- unavailable Saju domain → no Saju call
- Saju transport success + exported shape deserialize only → no authoritative `CharacterSajuContextEnvelopeV2` / grounding / protected reveal while `SRC-33` is open
- explicitly prevalidated canonical Product fixture → downstream envelope/renderer/guard invariants testable, but not Product semantic-validation PASS evidence
- protected public block 밖의 free-form Saju generation → deny baseline
- public calculation/reading ambiguity → preserved to visible response only when source-approved validated Product response exists
- output guard fail → no commit/reveal
- same committed retry → same message
- failed retryable abandon → next turn possible
- canon mismatch participant → deny
- LLM proposal alone → no relationship/unlock/entitlement mutation
