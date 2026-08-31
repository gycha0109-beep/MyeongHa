# 명하 ↔ Saju Integration Specification v0.4 — SRC-33 Bound

> Product: **명하 (Myeongha)**  
> Pack Version: **v0.4**  
> Date: **2026-08-31**  
> Source Authority: `Usecase_re_reviewed_v2(1).md`, `Myeongha_DB_ERD_v0.6_AUTHORITY_FIRST(2).md`, `Myeonghwa_Personalized_Interpretation_Architecture_v1.3_THIRD_REVIEW(1).md`  
> Rule: source가 결정하지 않은 implementation-critical 사항은 `OPEN-P0`, 비차단 선택은 `CANDIDATE`, source 간 충돌/공백은 `SOURCE_AUTHORITY_GAPS.md` 또는 numbered source-gap 문서에 기록한다.
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

## 5. Exact Contract Ownership — exported shape observation ≠ positive validator authority

현재 audit pin에서 `ProductReadingResponse` public export와 host input/output shape는 확인할 수 있다. Myeongha spec이 자체 enum을 Saju 원본인 것처럼 재정의하지 않는다.

현재 export에서 관찰되는 response 특징의 예:

```text
state: delivered | delivered_with_fallback | clarification_required | ...
coverage.state: partial | insufficient | unsupported   # optional; delivered의 complete enum이 아님
reading.sections[].blocks: governed consumer-facing blocks
reading.disclosures: calculation/methodology/evidence/scope disclosures
reading.calculationSummary.ambiguity: public ambiguity summaries
```

그러나 **exported TypeScript shape를 발견했다는 사실만으로 Myeongha의 source-approved positive application validator가 완성된 것은 아니다.** `SRC-33`은 현재 Primary Source가 다음을 production-authoritatively 고정하지 않았다고 등록한다.

```text
complete ProductReadingResponse positive schema
state별 required/optional nested payload rule
required_action / clarification / ambiguity positive payload variants
unknown/additional field handling
cardinality / bounds / null-vs-absent semantics
contract evolution / legacy-write behavior
stable validator result/error contract
```

따라서 current Saju export에 대한 compile/deserialization/conformance 확인은 **integration audit evidence**일 수 있지만, 그 자체를 `validated ProductReadingResponse` 승격 authority로 사용하지 않는다.

Myeongha DB `product_response_state`와 `reading_refs.response_snapshot_jsonb`는 future trusted validator가 승인한 public Product contract projection만 pin한다. `SRC-33` 해결 전 transport 성공 body를 이 authoritative state/snapshot으로 바로 승격하지 않는다.

## 6. Reading Session / Clarification / Transport Retry — `SRC-33` public input blocked

```text
reading_sessions
→ one user-level request with fixed birth revisions/domain

readings
→ user-level clarification attempt

reading_execution_attempts
→ transient package/service execution retry
```

Source-complete relational boundary:

- network/provider transient retry는 새 `readings` row를 만들지 않는다.
- user-level clarification은 source-approved application validator가 승인한 경우 새 `readings` row를 append한다.
- clarification chain은 server current pointer + expected parent로 linear하게 진행한다.
- current Saju host의 clarification option/state를 Myeongha가 새 meaning으로 재분류하지 않는다.

그러나 public clarification body는 `SRC-33` 해결 전 production-authoritative하지 않다. Source는 완전한 `ClarificationAnswerV1`, question↔answer correlation, cardinality, canonicalization/request-hash material, pending-contract-version compatibility를 아직 고정하지 않았다.

따라서:

```text
public arbitrary clarification JSON
→ cmd_append_reading_clarification_v1
```

직결은 금지한다.

허용되는 lower-level boundary는 다음뿐이다.

```text
future trusted application validator
→ already-validated canonical clarification request snapshot/hash
→ public.cmd_append_reading_clarification_v1(...)
→ same Reading Session에 immutable child Reading append
```

DB persistence/concurrency authority는 public input validation authority가 아니다.

## 7. Product Response Provenance — transport success ≠ semantic finalization

Transport execution 자체는 다음 provenance를 확보할 수 있다.

```text
sajuEngineKey/version
transport attempt identity/lifecycle
request-side immutable Birth/session provenance
provider/package execution outcome
```

하지만 다음 product-semantic material을 authoritative `reading_refs`로 finalize하려면 `SRC-33`의 trusted positive validator가 선행되어야 한다.

```text
readingContractVersion / responseVersion
validated response state
requiredAction / clarification
calculation ambiguity
validated immutable ProductReadingResponse snapshot/hash
```

`SRC-33` 해결 전 가능한 boundary:

```text
successful transport body
→ transport execution evidence
→ product semantic validation unavailable
→ no authoritative reading_ref/ProductReadingResponse promotion
```

`response_snapshot_jsonb`는 **validated internal provenance**이며 API가 raw snapshot을 그대로 Web/Mobile에 serialize하지 않는다. 현재 Saju response의 internal/legacy branding(`myeonghwa`/`명화`)도 Myeongha product UI authority가 아니다.

## 8. Scenario / Ambiguity Preservation

Saju architecture의 scenario-aware coverage를 손실하지 않는다.

- one scenario evidence가 다른 scenario missing evidence를 대신 충족하면 안 됨
- scenario semantic result가 다르면 Product가 임의 하나 선택 금지
- valid public response가 존재하는 경우 `calculationSummary.ambiguity` 및 `type='ambiguity'` blocks/disclosures를 character layer에서 버리지 않음

현재 audit pin의 exported `ProductReadingResponseCalculationAmbiguity`는 `title + summary` 형태로 관찰된다. Pack은 source가 export하지 않은 별도 ambiguity DTO를 만들어 public source type인 것처럼 취급하지 않는다.

이 관찰 shape 역시 `SRC-33`의 complete positive ProductReadingResponse validation contract를 대체하지 않는다.

## 9. Character-Safe Projection

Character layer는 raw ProductResponse 전체가 아니라 **source-approved validator를 통과한 public response에서 허용된 consumer narrative와 disclosure를 그대로 참조하는 projection**을 받는다.

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

`ProtectedProductBlockRef`는 validated `reading.sections[].blocks`의 exact normalized content/hash/ref를 가리킨다. Myeongha는 `semanticClaims`, `qualifiers`, `prohibitedInferences`를 public response에 없는데도 합성하지 않는다.

`SRC-33` 해결 전에는 transport body에서 이 envelope를 production-authoritatively 생성하지 않는다. Envelope projection source는 validated immutable `reading_ref`여야 한다.

## 10. Current Public Contract Gaps

현재 Saju audit pin은 governed consumer blocks/disclosures/ambiguity와 public host shape를 보여주지만, Myeongha production contract에는 서로 다른 세 gap이 남는다.

- `SRC-08`: domain/target Birth request adapter mismatch
- `SRC-09`: explicit Saju guard metadata transport gap
- `SRC-33`: ProductReadingResponse + clarification-answer positive application validation authority

이 셋은 대체 관계가 아니다.

```text
P0-SA-01 transport 선택
!= SRC-08 host/input conformance 해결
!= SRC-09 grounding guard metadata 해결
!= SRC-33 positive Product/clarification validator 해결
```

Future authoritative Saju public contract가 complete positive response/request schemas와 validation/evolution semantics까지 명시하고 Myeongha가 그대로 채택하면 `SRC-33`의 관련 부분을 source decision으로 닫을 수 있다. 그 전에는 current export를 보고 Pack이 누락 규칙을 보충하지 않는다.

## 11. Production Narrative Boundary

`SRC-33`이 해결되어 valid ProductReadingResponse가 존재하는 경로에서 production baseline은 다음과 같다.

```text
validated Saju ProductReadingResponse governed block/disclosure
→ protected semantic segment

Character LLM
→ non-semantic framing / reaction / transition / current-life question only
```

금지:

- unvalidated transport body를 governed ProductReadingResponse로 승격
- public response block을 자유 paraphrase/강화
- public response에 없는 semantic claim 생성
- compatibility를 second chart 분석처럼 가장
- ambiguity flattening

`SRC-09`가 열린 동안 valid protected block이 존재해도 explicit prohibited-inference metadata transport가 완전히 구현됐다고 주장하지 않는다.

## 12. Grounding / Projection Invariants

- grounding source = source-approved validator를 통과한 succeeded logical Reading + immutable `reading_refs`
- transport success만으로 grounding source가 되지 않음 (`SRC-33`)
- `SRC-33` 해결 전 valid ProductReadingResponse를 가정한 production grounding finalize PASS 주장 금지
- valid `delivered`/`delivered_with_fallback`인데 protected reading block이 0개면 character Saju delivery fail closed
- valid `partial_evidence`/`insufficient_evidence`는 public response state/disclosure를 그대로 보존하고 character가 새 Saju meaning으로 채우지 않음
- source public response에 없는 semantic claims/guard metadata를 Myeongha가 합성하지 않음
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

Capability가 허용돼도 `SRC-33` validation authority가 없는 response finalization/public clarification path를 자동 enable하지 않는다.

## 15. Failure Policy

- timeout → generic AI Saju fallback 금지
- transient execution → same logical reading retry
- Product response positive validation unavailable/failed → fail closed; transport success를 semantic success로 승격 금지 (`SRC-33`)
- public clarification positive validation unavailable → public clarification mutation fail closed (`SRC-33`)
- unavailable domain → normalized capability response
- valid response의 ambiguity contract invalid → no character rendering

## 16. Version Pinning

```text
birth revision / input hash
engine key/version
reading contract version — authoritative product finalization 시 validated source value
grounding adapter key/version
protected narrative block refs/hash — validated ProductResponse 이후
```

과거 snapshot을 현재 engine으로 silent reinterpret하지 않는다.

Contract version 문자열을 저장할 수 있다는 사실만으로 그 version의 positive validation/evolution semantics가 source-complete하다고 보지 않는다.

## 17. Verification

### Source-complete / independently testable now

- source/target cross-user revision deny
- transient retry same `readings` row
- Reading Session/attempt relational provenance
- lower-level clarification append/current-pointer/parent/idempotency invariants with an **explicitly prevalidated canonical fixture**
- current public host input shape vs adapter contract checked (`SRC-08`)
- current exported TypeScript/Product response fixture compile/deserialization compatibility check as **audit/conformance evidence only**
- raw Saju transport/response material is not directly exposed as Myeongha client DTO
- public response absent semanticClaims/prohibited metadata is not fabricated

### Blocked by `SRC-33`

Do not claim production PASS for:

- complete ProductReadingResponse positive validation
- state-specific nested requiredAction/clarification/ambiguity validation
- transport success → authoritative `reading_ref` semantic finalization
- `ClarificationAnswerV1` positive validation
- question/answer correlation
- clarification canonicalization/request hash identity
- public clarification mutation
- pending clarification cross-version compatibility
- stable validation-failure API detail contract
- grounding built from an unvalidated transport body

`current exported ProductReadingResponse fixture exact-deserialize` alone is **not** a substitute for these gates.

### After valid ProductResponse authority exists

- material calculation ambiguity/ambiguity block preserved to `CharacterSajuContextEnvelopeV2`
- grounding failed source deny
- complete empty grounding deny
- semantic invention deny
- protected block ref/hash integrity
- protected-block 밖 free-form Saju generation denied in production baseline
- compatibility target Birth is not sent to a host contract that cannot consume it (`SRC-08`)
