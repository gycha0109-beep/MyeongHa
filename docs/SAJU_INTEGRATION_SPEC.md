# 명하 ↔ Saju Integration Specification v0.5 — SRC-33 Response Admission Split

> Product: **명하 (Myeongha)**  
> Pack Version: **v0.5**  
> Date: **2026-09-12**  
> Source Authority: `Usecase_re_reviewed_v2(1).md`, `Myeongha_DB_ERD_v0.6_AUTHORITY_FIRST(2).md`, `Myeonghwa_Personalized_Interpretation_Architecture_v1.3_THIRD_REVIEW(1).md`  
> Rule: source가 결정하지 않은 implementation-critical 사항은 `OPEN-P0`, 비차단 선택은 `CANDIDATE`, source 간 충돌/공백은 `SOURCE_AUTHORITY_GAPS.md` 또는 numbered source-gap 문서에 기록한다.  
> Current Saju Public Contract Audit Pin: `gycha0109-beep/Saju@04a0f1ce1977c8b0bf348fcec05a3a1adab80e5d` (`src/product-reading.ts`, `src/reading/product-reading-response.ts`, `src/reading/product-reading-response-admission.ts`, `src/host/product-host.ts`)  
> Canonical ProductResponse admission evidence: Saju PR `#421`, merged as `d84a1fe4510755ef4c95bdc07e71af055fa9a677`; current main still exports the dedicated ProductReadingResponse admission boundary.  
> Production Interpretation Authority at this audit pin: **HOLD**. Saju main `04a0f1ce...` explicitly preserves the unchanged **2/5 HOLD authority ledger**; contract admission does not promote interpretation authority or enable public Production Reading runtime.

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

## 5. Exact Contract Ownership — canonical ProductReadingResponse v2 admission is source-owned

현재 audit pin에서 `ProductReadingResponse` public export와 host input/output shape뿐 아니라 **canonical `ProductReadingResponse v2` admission boundary**가 Saju source에 존재한다.

Saju PR `#421`이 추가한 source-owned entry point:

```ts
admitSajuProductReadingResponseV2(input: unknown): ProductReadingResponse
```

이 boundary는 canonical response version/identity, response state/message/action, payload, nested consumer-reading structure를 검증하고 malformed/contradictory input을 거부한다. 현재 Saju의 9-state delivery authority를 따르며 calculation ambiguity는 `reading.calculationSummary.ambiguity`에 보존한다. 이 validator는 wire/state invariant를 검증할 뿐 Rule Registry logic을 재실행하거나 claim truth/methodology를 재해석하지 않는다.

따라서 `SRC-33`은 더 이상 하나의 단일 BLOCKED 항목으로 취급하지 않는다.

```text
SRC-33 / ProductReadingResponse v2 canonical positive admission = CLOSED by Saju PR #421
SRC-33 / public clarification-answer positive admission          = OPEN
Production Interpretation Authority                              = HOLD
Public Production Reading Runtime                                = BLOCKED
```

Myeongha는 Saju validator를 통과하지 않은 transport body를 `validated ProductReadingResponse`로 승격하지 않는다. 반대로 Saju validator가 승인한 canonical response는 contract-admitted response로 취급할 수 있다.

단, **ProductReadingResponse admission closure는 Production interpretation authority가 아니다.** 현재 Production Interpretation Authority가 HOLD이므로, admitted response contract가 존재한다는 사실만으로 실제 Production Reading execution을 활성화하거나 synthetic/research fixture를 Production success로 저장하면 안 된다.

Myeongha DB `product_response_state`와 `reading_refs.response_snapshot_jsonb`는 다음 조건을 모두 만족하는 경우에만 authoritative ProductResponse provenance로 finalize할 수 있다.

```text
Saju ProductReadingResponse v2 admission PASS
+ transport/execution invariants PASS
+ response is an admitted delivered-success state
+ corresponding Saju Production Reading runtime is authority-admitted and enabled
```

현재 마지막 조건이 충족되지 않았으므로 real Production success finalization path는 계속 fail closed다.

## 6. Reading Session / Clarification / Transport Retry — `SRC-33` clarification input remains blocked

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

Canonical ProductReadingResponse v2 admission이 존재하더라도 **public clarification answer input**은 별도 경계다. 현재 확인된 source는 완전한 `ClarificationAnswerV1` positive admission, question↔answer correlation, cardinality, canonicalization/request-hash material, pending-contract-version compatibility를 아직 production-authoritatively 고정하지 않았다.

따라서:

```text
public arbitrary clarification JSON
→ cmd_append_reading_clarification_v1
```

직결은 금지한다.

허용되는 lower-level boundary는 다음뿐이다.

```text
future trusted clarification application validator
→ already-validated canonical clarification request snapshot/hash
→ public.cmd_append_reading_clarification_v1(...)
→ same Reading Session에 immutable child Reading append
```

DB persistence/concurrency authority는 public input validation authority가 아니다.

## 7. Product Response Provenance — admitted contract ≠ Production runtime authorization

Transport execution 자체는 다음 provenance를 확보할 수 있다.

```text
sajuEngineKey/version
transport attempt identity/lifecycle
request-side immutable Birth/session provenance
provider/package execution outcome
```

Saju `admitSajuProductReadingResponseV2`가 승인한 response는 다음 product-semantic material의 source-owned contract validation 근거가 될 수 있다.

```text
readingContractVersion / responseVersion
validated response state
requiredAction / clarification response payload
calculation ambiguity
validated immutable ProductReadingResponse snapshot/hash
```

그러나 authoritative `reading_ref` success finalization에는 **contract admission과 별도로** 실제 Production runtime authority가 필요하다.

현재 boundary:

```text
ProductReadingResponse v2 contract admission = available
Production Interpretation Authority          = HOLD
Production Reading execution                 = unavailable
→ no real Production succeeded Reading promotion
```

`response_snapshot_jsonb`는 **validated internal provenance**이며 API가 raw snapshot을 그대로 Web/Mobile에 serialize하지 않는다. 현재 Saju response의 internal/legacy branding(`myeonghwa`/`명화`)도 Myeongha product UI authority가 아니다.

## 8. Scenario / Ambiguity Preservation

Saju architecture의 scenario-aware coverage를 손실하지 않는다.

- one scenario evidence가 다른 scenario missing evidence를 대신 충족하면 안 됨
- scenario semantic result가 다르면 Product가 임의 하나 선택 금지
- admitted public response가 존재하는 경우 `calculationSummary.ambiguity` 및 `type='ambiguity'` blocks/disclosures를 character layer에서 버리지 않음

현재 audit pin의 `ProductReadingResponse` admission은 calculation ambiguity를 nested public contract의 일부로 검증한다. Pack은 source가 export하지 않은 별도 ambiguity DTO를 만들어 public source type인 것처럼 취급하지 않는다.

## 9. Character-Safe Projection

Character layer는 raw ProductResponse 전체가 아니라 **Saju source-owned admission을 통과한 public response에서 허용된 consumer narrative와 disclosure를 그대로 참조하는 projection**을 받는다.

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

`ProtectedProductBlockRef`는 admitted `reading.sections[].blocks`의 exact normalized content/hash/ref를 가리킨다. Myeongha는 `semanticClaims`, `qualifiers`, `prohibitedInferences`를 public response에 없는데도 합성하지 않는다.

Admitted response만으로 이 envelope의 Production delivery가 자동 허용되는 것은 아니다. Envelope projection source는 authority-admitted Production execution에서 생성되고 immutable `reading_ref`로 finalize된 response여야 한다. 현재 Production Interpretation Authority HOLD 동안 real Production projection은 enable하지 않는다.

## 10. Current Public Contract Gaps

현재 Saju audit pin 기준 Myeongha integration에는 서로 다른 gap/gate가 남는다.

- `SRC-08`: domain/target Birth request adapter mismatch
- `SRC-09`: explicit Saju guard metadata transport gap
- `SRC-33` remaining half: clarification-answer positive application validation authority
- Production Interpretation Authority: Saju-side semantic/runtime gate, currently `HOLD`

`SRC-33`의 **ProductReadingResponse v2 positive admission half는 Saju PR #421로 CLOSED**다. 이를 clarification-input authority 또는 Production interpretation authority closure로 확대 해석하지 않는다.

```text
P0-SA-01 transport 선택
!= SRC-08 host/input conformance 해결
!= SRC-09 grounding guard metadata 해결
!= SRC-33 clarification validator 해결
!= Production Interpretation Authority admission
```

Future authoritative Saju public clarification contract가 complete positive request schema와 correlation/canonicalization/evolution semantics를 명시하고 Myeongha가 그대로 채택하면 `SRC-33`의 remaining clarification portion을 source decision으로 닫을 수 있다. 그 전에는 Pack이 누락 규칙을 보충하지 않는다.

## 11. Production Narrative Boundary

Authority-admitted Production runtime이 생성하고 Saju admission을 통과한 valid ProductReadingResponse가 존재하는 경로에서 production baseline은 다음과 같다.

```text
admitted Saju ProductReadingResponse governed block/disclosure
→ protected semantic segment

Character LLM
→ non-semantic framing / reaction / transition / current-life question only
```

금지:

- unadmitted transport body를 governed ProductReadingResponse로 승격
- public response block을 자유 paraphrase/강화
- public response에 없는 semantic claim 생성
- compatibility를 second chart 분석처럼 가장
- ambiguity flattening
- contract admission을 근거로 Production Interpretation Authority를 우회

`SRC-09`가 열린 동안 valid protected block이 존재해도 explicit prohibited-inference metadata transport가 완전히 구현됐다고 주장하지 않는다.

## 12. Grounding / Projection Invariants

- grounding source = Saju ProductReadingResponse admission을 통과한 succeeded logical Reading + immutable `reading_refs`
- transport success만으로 grounding source가 되지 않음
- Production Interpretation Authority HOLD 동안 real Production succeeded grounding source를 새로 만들지 않음
- admitted `delivered`/`delivered_with_fallback`인데 protected reading block이 0개면 character Saju delivery fail closed
- admitted `partial_evidence`/`insufficient_evidence`는 public response state/disclosure를 그대로 보존하고 character가 새 Saju meaning으로 채우지 않음
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

Capability가 허용돼도 Production Interpretation Authority가 HOLD인 runtime을 자동 enable하지 않는다. 또한 remaining `SRC-33` clarification validation authority가 없는 public clarification path도 자동 enable하지 않는다.

## 15. Failure Policy

- timeout → generic AI Saju fallback 금지
- transient execution → same logical reading retry
- Product response admission failed → fail closed; transport success를 semantic success로 승격 금지
- Production Interpretation Authority/runtime unavailable → Product response contract가 존재해도 real Production success 생성 금지
- public clarification positive validation unavailable → public clarification mutation fail closed (`SRC-33` remaining)
- unavailable domain → normalized capability response
- admitted response의 ambiguity contract invalid → no character rendering

## 16. Version Pinning

```text
birth revision / input hash
engine key/version
reading contract version — authoritative product finalization 시 admitted source value
grounding adapter key/version
protected narrative block refs/hash — admitted ProductResponse 이후
```

과거 snapshot을 현재 engine으로 silent reinterpret하지 않는다.

Contract version 문자열을 저장할 수 있다는 사실만으로 그 version의 Production interpretation semantics가 authority-admitted되었다고 보지 않는다.

## 17. Verification

### Source-complete / independently testable now

- source/target cross-user revision deny
- transient retry same `readings` row
- Reading Session/attempt relational provenance
- lower-level clarification append/current-pointer/parent/idempotency invariants with an **explicitly prevalidated canonical fixture**
- current public host input shape vs adapter contract checked (`SRC-08`)
- canonical `ProductReadingResponse v2` positive/negative admission through Saju `admitSajuProductReadingResponseV2`
- response version/identity/state/action/message/payload/nested reading structural rejection paths
- admitted calculation ambiguity preservation
- blocked/non-success response is not promoted to Reading `succeeded`
- raw Saju transport/response material is not directly exposed as Myeongha client DTO
- public response absent semanticClaims/prohibited metadata is not fabricated

These tests prove **contract admission behavior**, not that Production interpretation/runtime is authorized.

### Blocked by remaining `SRC-33` clarification authority

Do not claim production PASS for:

- `ClarificationAnswerV1` positive validation
- question/answer correlation
- clarification canonicalization/request hash identity
- public clarification mutation from arbitrary client JSON
- pending clarification cross-version compatibility
- stable clarification validation-failure API detail contract

### Blocked by Production Interpretation Authority

Do not claim production PASS for:

- real Saju Production Reading execution while authority state is `HOLD`
- synthetic/research fixture promotion to Production reading success
- actual Production transport → admitted response → authoritative succeeded `reading_ref` E2E
- Production character grounding derived from a runtime that has not been authority-admitted

### After Production runtime authority exists

- exact Saju commit dependency pin and execution
- admitted delivered-success → authoritative `reading_ref` semantic finalization
- material calculation ambiguity/ambiguity block preserved to `CharacterSajuContextEnvelopeV2`
- grounding failed source deny
- complete empty grounding deny
- semantic invention deny
- protected block ref/hash integrity
- protected-block 밖 free-form Saju generation denied in production baseline
- compatibility target Birth is not sent to a host contract that cannot consume it (`SRC-08`)

## 18. Production Activation Gate

Current state at audit pin `gycha0109-beep/Saju@04a0f1ce1977c8b0bf348fcec05a3a1adab80e5d`:

```text
Saju ProductReadingResponse v2 contract/admission   = READY
Exact-SHA package consumption                       = READY
Production Interpretation Authority                 = HOLD (2/5 ledger)
Public Production Reading Runtime                   = BLOCKED
MyeongHa Production Saju transport activation       = BLOCKED
MyeongHa Production success persistence / grounding = BLOCKED
```

Activation condition is a future Saju source decision that explicitly admits the relevant Production interpretation authority/rule pack and enables the corresponding Product Reading runtime. Until then Myeongha may prepare/test contract boundaries fail-closed, but it must not manufacture a semantic success path.
