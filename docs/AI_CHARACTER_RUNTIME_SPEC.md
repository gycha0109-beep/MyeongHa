# 명하 AI / Character Runtime Specification v0.3 — Full Audit

> Product: **명하 (Myeongha)**  
> Pack Version: **v0.3**  
> Date: **2026-08-25**  
> Source Authority: `Usecase_re_reviewed_v2(1).md`, `Myeongha_DB_ERD_v0.6_AUTHORITY_FIRST(2).md`, `Myeonghwa_Personalized_Interpretation_Architecture_v1.3_THIRD_REVIEW(1).md`  
> Rule: source가 결정하지 않은 implementation-critical 사항은 `OPEN-P0`, 비차단 선택은 `CANDIDATE`, source 간 충돌은 `SOURCE_AUTHORITY_GAPS.md`에 기록한다.

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
validated CharacterSajuContextEnvelopeV2
scene state
```

비공개 데이터를 prompt에 넣고 숨기라고 지시하는 방식 금지.

## 6. CharacterSajuContextEnvelopeV2

Character Runtime은 Saju 내부 claim graph 또는 Pack이 임의 합성한 semantic claim DTO를 받지 않는다. 현재 Saju public `ProductReadingResponse`에서 검증된 consumer blocks/disclosures/ambiguity를 protected ref로 전달받는다.

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

`explicitGuardMetadata`는 Saju **public contract가 실제 제공할 때만** 존재한다. 현재 public response에 없는 `semanticClaims/qualifiers/prohibitedInferences`를 Character Runtime용으로 임의 만들어 넣지 않는다. `SRC-08`, `SRC-09`를 따른다.

## 7. Saju-bearing Text: Production Baseline

Saju source architecture는 free-form LLM semantic equivalence를 현재 validator만으로 완전 증명할 수 없으며 첫 production-capable narrative는 deterministic rendering을 우선한다. 따라서 명하 baseline은 다음을 따른다.

```text
Saju public ProductReadingResponse governed block/disclosure
→ PROTECTED_SEMANTIC_SEGMENT

Character Renderer
→ non-semantic framing / reaction / transition / current-life question
```

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

- protected semantic segment hash/ref가 source `reading_refs.response_snapshot_jsonb` projection과 일치
- public disclosures/ambiguity를 누락하거나 의미를 바꾸지 않음
- `SRC-09` 해결 전 explicit prohibited-inference metadata 검증을 했다고 허위 PASS하지 않음
- public calculation/reading ambiguity가 존재하는데 이를 확정 단정으로 평탄화하지 않음
- 다른 user/private memory 누출 없음
- canon에 없는 공식 과거사 사실화 없음
- emotion/cue/action registry + character allowlist 통과
- LLM proposal이 authority mutation으로 직접 commit되지 않음

Guard가 semantic equivalence를 증명할 수 없는 free-form Saju paraphrase는 **baseline에서 허용 대상이 아니다**.

## 11. Controlled Reveal

```text
generation
→ structural/output validation
→ atomic commit
→ controlled reveal
```

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
- exact grounding refs
- token/latency/status

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

## 18. Acceptance Gates

- unknown planner key/action → no execution
- non-granted memory absent from context dump
- unavailable Saju domain → no Saju call
- protected public block 밖의 free-form Saju generation → deny baseline
- public calculation/reading ambiguity → preserved to visible response
- output guard fail → no commit/reveal
- same committed retry → same message
- failed retryable abandon → next turn possible
- canon mismatch participant → deny
- LLM proposal alone → no relationship/unlock/entitlement mutation
