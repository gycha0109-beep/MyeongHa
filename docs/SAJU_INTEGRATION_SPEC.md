# 명하 ↔ Saju Integration Specification v0.3 — Full Audit

> Product: **명하 (Myeongha)**  
> Pack Version: **v0.3**  
> Date: **2026-08-25**  
> Source Authority: `Usecase_re_reviewed_v2(1).md`, `Myeongha_DB_ERD_v0.6_AUTHORITY_FIRST(2).md`, `Myeonghwa_Personalized_Interpretation_Architecture_v1.3_THIRD_REVIEW(1).md`  
> Rule: source가 결정하지 않은 implementation-critical 사항은 `OPEN-P0`, 비차단 선택은 `CANDIDATE`, source 간 충돌은 `SOURCE_AUTHORITY_GAPS.md`에 기록한다.
> Current Saju Public Contract Audit Pin: `gycha0109-beep/Saju@7102dc8fe8483c0875f6a093a4fd585b0df51f8b` (`src/product-reading.ts`, `src/reading/product-reading-response.ts`, `src/host/product-host.ts`)

---

## 1. 목적

기존 `Saju` repository의 semantic authority를 보존하면서 명하 Product가 안정적으로 소비하는 경계를 정의한다.

```text
Birth Input
→ Canonical Snapshot
→ T0
→ T1~T7
→ T8 domain synthesis
→ Claim Graph
→ ReadingProfile / MUR
→ Evidence Bundle
→ governed Narrative
```

명하 Product DB는 이 내부 runtime을 복제하지 않는다.

## 2. 금지되는 Product DB 복제

```text
t0_facts / t5_claims / t6_claims / t8_claims
claim_graph / methodology_registry / rule_registry
claim_narrative_profiles
consumed_input_fingerprints / interpretation_signatures
```

## 3. Adapter Interface — Product Abstraction vs Current Saju Public Contract

Myeongha 내부에서 원하는 product abstraction은 다음 형태를 사용할 수 있다.

```ts
interface MyeonghaSajuRequest {
  birth: BirthProfileSnapshot;
  domain: SajuDomain;
  targetPerson?: BirthProfileSnapshot;
  requestId: string;
}
```

그러나 **이 abstraction을 현재 Saju public host가 그대로 지원한다고 가정하면 안 된다.** 현재 repository public host는 `birth + reading.text + optional targetPersonRef`를 받고 `ProductReadingResponse`를 반환한다. 두 번째 Birth snapshot을 직접 받는 public host contract가 아니다. 이 차이는 `SRC-08`이다.

Real adapter는 source-side public contract resolution 없이 `targetPerson` snapshot을 host가 소비한다고 가장하지 않는다. Mock adapter만 이 abstraction을 먼저 구현할 수 있다.

## 4. Transport

`OPEN-P0: P0-SA-01`.

```text
A. version-pinned package in-process
B. internal HTTP/RPC service
```

둘 다 **해당 시점 Saju repository의 exported public Product contract**를 사용한다. transport 종류가 business semantic key가 되면 안 된다.

Internal service 방식을 선택하면 추가로 반드시:

- service-to-service authentication/authorization
- server-side credential rotation
- client에서 internal Saju credential 접근 불가
- request timeout/retry/idempotency propagation
- external error body/secret의 Product response/log 유출 금지

를 만족한다. 구체 transport credential 방식은 `P0-SA-01` 결정 record에 포함한다.

## 5. Exact Contract Ownership

현재 확인된 public export는 `ProductReadingResponse`이며 response state/requiredAction/clarification/coverage/reading/calculation ambiguity의 정확한 shape는 Saju repository가 authority다. Myeongha spec이 자체 enum을 원본인 것처럼 재정의하지 않는다.

특히 현재 public response의 특징:

```text
state: delivered | delivered_with_fallback | clarification_required | ...
coverage.state: partial | insufficient | unsupported   # optional; delivered의 complete enum이 아님
reading.sections[].blocks: governed consumer-facing blocks
reading.disclosures: calculation/methodology/evidence/scope disclosures
reading.calculationSummary.ambiguity: public ambiguity summaries
```

Myeongha DB `product_response_state`는 validated public state key를 그대로 pin한다.

## 6. Reading Session / Clarification / Transport Retry

```text
reading_sessions
→ one user-level request with fixed birth revisions/domain

readings
→ user-level clarification attempt

reading_execution_attempts
→ transient package/service execution retry
```

- network/provider transient retry는 새 `readings` row를 만들지 않는다.
- user clarification answer는 새 `readings` row를 append한다.
- clarification chain은 server current pointer + expected parent로 linear하게 진행한다.
- current Saju host의 clarification option/state를 Myeongha가 새 meaning으로 재분류하지 않는다.

## 7. Product Response Provenance

성공 transport response는 최소:

```text
sajuEngineKey/version
readingContractVersion / responseVersion
source/target input provenance available to Myeongha
validated response state
requiredAction / clarification
calculation ambiguity
immutable ProductReadingResponse snapshot/hash
```

을 pin한다.

`response_snapshot_jsonb`는 **internal provenance**다. API가 raw snapshot을 그대로 Web/Mobile에 serialize하지 않는다. 현재 Saju response의 internal/legacy branding(`myeonghwa`/`명화`)도 Myeongha product UI authority가 아니다.

## 8. Scenario / Ambiguity Preservation

Saju architecture의 scenario-aware coverage를 손실하지 않는다.

- one scenario evidence가 다른 scenario missing evidence를 대신 충족하면 안 됨
- scenario semantic result가 다르면 Product가 임의 하나 선택 금지
- public response의 `calculationSummary.ambiguity` 및 `type='ambiguity'` blocks/disclosures를 character layer에서 버리지 않음

현재 public `ProductReadingResponseCalculationAmbiguity`는 `title + summary` 형태다. Pack은 source가 export하지 않은 별도 ambiguity DTO를 만들어 public source type인 것처럼 취급하지 않는다.

## 9. Character-Safe Projection

Character layer는 raw ProductResponse 전체가 아니라 **source public response에서 허용된 consumer narrative와 disclosure를 그대로 참조하는 projection**을 받는다.

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
  explicitGuardMetadata?: SajuPublicGuardMetadata; // source public contract가 제공할 때만
}
```

`ProtectedProductBlockRef`는 current `reading.sections[].blocks`의 exact normalized content/hash/ref를 가리킨다. Myeongha는 `semanticClaims`, `qualifiers`, `prohibitedInferences`를 public response에 없는데도 합성하지 않는다.

## 10. Current Public Contract Gap

현재 Saju public `ProductReadingResponse`는 governed consumer blocks/disclosures/ambiguity를 제공하지만, Use Case grounding 예시가 요구한 explicit `semanticClaims`, `qualifiers`, `prohibitedInferences` 구조를 모두 제공하지 않는다. 또한 current public host는 second Birth snapshot 기반 compatibility request contract가 아니다.

따라서:

- `SRC-08`: domain/target Birth request adapter mismatch
- `SRC-09`: explicit Saju guard metadata transport gap

을 닫기 전에는 해당 기능을 지원한다고 가장하지 않는다.

## 11. Production Narrative Boundary

현재 production baseline:

```text
Saju ProductReadingResponse governed block/disclosure
→ protected semantic segment

Character LLM
→ non-semantic framing / reaction / transition / current-life question only
```

금지:

- public response block을 자유 paraphrase/강화
- public response에 없는 semantic claim 생성
- compatibility를 second chart 분석처럼 가장
- ambiguity flattening

이 baseline은 `SRC-09`를 완전히 해결하는 것이 아니라, explicit prohibited-inference metadata가 없는 동안 LLM의 semantic freedom을 0에 가깝게 제한하는 fail-closed mitigation이다.

## 12. Grounding / Projection Invariants

- `delivered`/`delivered_with_fallback`인데 protected reading block이 0개면 character Saju delivery를 fail closed
- `partial_evidence`/`insufficient_evidence`는 public response state/disclosure를 그대로 보존하고 character가 새 Saju meaning으로 채우지 않음
- source public response에 없는 semantic claims/guard metadata를 Myeongha가 합성하지 않음
- projection source = succeeded logical reading + validated immutable `reading_refs`
- public calculation ambiguity/ambiguity block → envelope에 explicit presence
- `SRC-09` 해결 전 explicit prohibited-inference transport PASS라고 주장하지 않음

## 13. Stale Reading

```text
source session revision != current source profile revision
OR target session revision != current target profile revision
→ stale
```

Stale은 과거 snapshot 삭제/변경이 아니다. 재계산을 제안한다.

## 14. Character Capability

Character-triggered reading:

```text
pinned bundle membership
+ character_capabilities(domain)
+ can_initiate
+ saju_domain_runtime availability
+ entitlement/product gate if applicable
→ allowed
```

대표 캐릭터 archetype만 보고 domain 허용 금지.

## 15. Failure Policy

- timeout → generic AI Saju fallback 금지
- transient execution → same logical reading retry
- invalid Product contract → fail closed
- unavailable domain → normalized capability response
- ambiguity contract invalid → no character rendering

## 16. Version Pinning

```text
birth revision / input hash
engine key/version
reading contract version
grounding adapter key/version
protected narrative block refs/hash
```

과거 snapshot을 현재 engine으로 silent reinterpret하지 않는다.

## 17. Verification

- source/target cross-user revision deny
- transient retry same readings row
- clarification new readings row
- exact public Product contract state validation
- grounding failed source deny
- complete empty grounding deny
- semantic invention deny
- current exported ProductReadingResponse fixture exact-deserialize
- raw Saju response snapshot is not directly exposed as Myeongha client DTO
- material calculation ambiguity/ambiguity block preserved to CharacterSajuContextEnvelopeV2
- public response absent semanticClaims/prohibited metadata is not fabricated
- compatibility target Birth is not sent to a host contract that cannot consume it (`SRC-08`)
- free-form Saju prose deny baseline
- engine update does not mutate historical snapshot
