# 명하 Source Authority Gap Register v0.3

> Product: **명하 (Myeongha)**  
> Pack Version: **v0.3**  
> Date: **2026-08-25**  
> Rule: source 문서끼리 충돌하거나 source가 implementation-critical authority를 제공하지 못하는 경우 Pack이 임의로 덮지 않는다.
> Saju Public Contract Audit Pin: `gycha0109-beep/Saju@7102dc8fe8483c0875f6a093a4fd585b0df51f8b`

---

## SRC-01 — Character / Episode Operational Disable Authority

**Status: BLOCKING BEFORE FINAL DDL BASELINE**

Use Case는 `character_runtime_catalog` / `episode_runtime_catalog`를 operational metadata authority로 설명하며 enabled/disabled, release window, availability를 DB runtime state로 둔다.

ERD v0.6은 같은 projection을 bundle publish 이후 immutable로 고정하고 operational rollback을 `content_releases` bundle 단위로 넘긴다. 따라서 **한 캐릭터 또는 한 episode만 긴급 disable**하는 authority가 사라졌다.

Pack은 이를 임의 해결하지 않는다. 다음 중 source authority가 하나를 선택해야 한다.

```text
A. 별도 operational override table / runtime gate를 추가
B. catalog의 operational columns만 canon projection과 분리해 mutable authority로 유지
C. per-character/per-episode disable을 비요구사항으로 낮추고 bundle-level rollback만 허용
```

`RELEASE_OBSERVABILITY_SPEC`는 해결 전 독립 character kill switch를 보장한다고 주장하면 안 된다.

## SRC-02 — Character-facing Saju Ambiguity Projection

**Status: RESOLVED AT PACK PROJECTION LEVEL; SOURCE TYPE VERIFIED**

현재 Saju public response는 `ProductReadingResponseCalculationAmbiguity { title, summary }`, `reading.calculationSummary.ambiguity`, 그리고 `type='ambiguity'` reading block을 export한다. 따라서 Pack은 존재하지 않는 별도 `SajuAmbiguityProjection`을 source type처럼 만들지 않고 해당 exported public consumer representation을 protected projection으로 전달한다.

Rich scenario internals가 public contract에 없으면 Myeongha가 내부 Claim Graph/scenario를 직접 조회하지 않는다.

## SRC-03 — Free-form Character Paraphrase vs Deterministic First Saju Renderer

**Status: RESOLVED IN PACK BY STRONGER SAJU AUTHORITY**

Saju architecture는 free-form LLM semantic equivalence를 현재 validator로 완전히 증명할 수 없으며 첫 production-capable renderer는 deterministic narrative를 우선한다고 명시한다.

따라서 Myeongha baseline은 Saju-bearing semantic segment를 free-form LLM이 다시 해석/요약하지 않는다. Character LLM은 비-semantic framing, 질문, 반응을 생성할 수 있다.

full character paraphrase는 별도 validated semantic-preservation gate가 생긴 이후에만 승격 가능하다.

## SRC-04 — API/RLS Database Execution Identity

**Status: OPEN-P0 `P0-AUTH-01`**

Use Case는 RLS 또는 동등한 authorization을 요구하지만 Shared API가 PostgreSQL에 어떤 identity/role로 접속하는지는 source가 결정하지 않는다.

이 결정 없이는 `RLS default deny`를 실제 SQL policy로 완성할 수 없다.

## SRC-05 — Memory Proposal Staging vs `session-only` / `reject` Privacy

**Status: BLOCKING BEFORE FINAL PERSONAL-RECORD DDL BASELINE**

Use Case는 `이 대화에서만`과 `기록하지 않기`를 durable personal record로 승격하지 않는 선택으로 정의한다. 그런데 ERD v0.6의 `memory_proposals`는 `proposed_value_jsonb NOT NULL`을 durable row에 저장하고 status가 `pending | accepted | rejected | expired`뿐이라 `session_only` resolution을 구조적으로 표현하지 못한다.

문제는 단순 status 이름이 아니다.

```text
사용자: 이 대화에서만 / 기록하지 않기
→ memory_items/life_facts는 생성 안 됨
BUT
→ proposed_value_jsonb가 무기한 durable staging copy로 남을 수 있음
```

이는 Memory authority를 우회하는 shadow personal-record가 될 수 있다.

Source에서 다음 중 하나를 명시적으로 결정해야 한다.

```text
A. memory_proposals에 resolution_mode/session_only를 추가하고
   terminal resolution 후 raw proposed payload를 purge/redact할 수 있게 schema 수정

B. sensitive proposal payload를 durable table에 저장하지 않고
   ephemeral proposal store + durable minimal resolution/dedupe metadata 분리

C. 다른 동등한 구조로 session-only/reject 후 derivative payload의 장기 보존을 금지
```

단순히 `session_only = rejected`로 매핑하고 raw proposal value를 계속 보존하는 것은 해결로 간주하지 않는다.

## SRC-06 — Standalone Birth / Target-Person Deletion vs Reading Provenance

**Status: BLOCKING BEFORE FINAL DELETION DDL BASELINE**

Use Case는 개인 기록 삭제와 target-person 기록의 별도 삭제를 요구한다. 반면 ERD v0.6은 `reading_sessions`가 source/target `birth_profile_revisions`를 immutable FK로 pin하며, `data_deletion_jobs.scope`에는 `birth_profile`이 없다.

따라서 다음 시나리오의 authority가 비어 있다.

```text
상대방 Birth Profile로 궁합 Reading 생성
→ 사용자가 그 상대 기록 삭제 요청
→ Reading provenance FK는 target birth revision을 계속 요구
```

self Birth Profile 단독 삭제도 과거 Reading을 유지할지 삭제할지 동일 문제가 있다.

Source에서 최소 하나를 결정해야 한다.

```text
A. Birth/Target 삭제 시 해당 revision에 의존하는 Reading/Share까지 deletion graph에 포함
B. raw Birth를 실제 제거하면서 Reading provenance를 유지할 별도 privacy tombstone/projection schema 설계
C. UI에서 archive와 privacy delete를 엄격히 분리하고,
   privacy delete는 관련 dependent artifact까지 명시적으로 처리
```

사용자가 삭제한 Birth/Target 원문을 단지 "provenance"라는 이유로 무기한 유지하는 것은 기본 해결안으로 간주하지 않는다.

## SRC-07 — Manual Commerce Provider-Event Resolution Lacks Audited Proof Field

**Status: BLOCKING IF `resolution_source_type='manual'` IS ENABLED IN PRODUCTION**

ERD v0.6은 `commerce_provider_events.resolution_source_type='manual'`을 허용하지만 manual resolution의 actor/evidence를 강제하는 별도 column/ledger FK가 없다.

이 event가 이후 entitlement effect의 source가 될 수 있으므로 단순 운영 편의 기능으로 취급할 수 없다.

해결 전 production baseline:

```text
manual resolution → DISABLED
```

Source가 manual resolution을 필요로 한다면 최소:

```text
actor/admin identity
reason code
verified evidence ref
resolved_at
immutable audit provenance
```

를 강제하는 schema 또는 별도 audited command ledger가 필요하다.

## SRC-08 — Myeongha Domain/Target-Birth Adapter vs Current Saju Public Host Contract

**Status: BLOCKING FOR REAL ADAPTER FINALIZATION / COMPATIBILITY ENABLEMENT**

현재 Myeongha Use Case/Pack abstraction은 `domain + source Birth snapshot + optional target Birth snapshot` 형태를 기대한다. 그러나 현재 Saju public host contract는:

```text
birth: one Birth input
reading.text: string
reading.targetPersonRef?: string
→ ProductReadingResponse
```

형태이며 second Birth snapshot을 public host input으로 받지 않는다. Consumer request adapter의 compatibility intent도 `targetPersonRef` 존재 여부를 요구할 뿐, 이 자체가 두 번째 명식 계산/해석 authority를 제공하지 않는다.

따라서 다음 중 하나가 source에서 필요하다.

```text
A. Saju public Product contract에 normalized intent/domain + target Birth snapshot contract 추가
B. Myeongha-safe dedicated exported adapter 추가
C. current public contract로 실제 지원되는 domain만 enable하고 compatibility/T10은 unavailable 유지
```

Pack은 domain string을 임의 한국어 문구로 변환한 것을 영구 public authority로 가장하지 않는다. 임시 mapping을 사용한다면 exact Saju contract version에 pin된 adapter implementation detail이며 compatibility support를 주장할 근거가 아니다.

## SRC-09 — Use Case Grounding Guard Metadata vs Current Saju Public Response

**Status: BLOCKING BEFORE `reading_groundings` SEMANTIC BASELINE / EXPLICIT GUARD-METADATA CLAIM; FAIL-CLOSED MITIGATION ACTIVE**

Use Case의 `CharacterSajuGrounding` 예시는 `semanticClaims`, `qualifiers`, `prohibitedInferences`를 명시하고 Output Guard까지 보존하도록 요구한다. 현재 exported `ProductReadingResponse`는 governed consumer reading blocks, disclosures, calculation ambiguity를 제공하지만 위 guard metadata를 동일 구조로 public export하지 않는다.

Myeongha가 이를 내부 Saju registry/claim graph에서 직접 긁어오면 Saju/Product authority boundary를 깨므로 금지한다.

해결 전 baseline:

```text
public governed reading block/disclosure = protected segment
Character LLM semantic paraphrase/new Saju claim = DENY
```

이 방식은 semantic drift를 fail-closed로 줄이지만 **explicit prohibitedInferences transport가 구현됐다는 뜻은 아니다.** source가 public guard metadata를 export하거나 Use Case contract를 현재 public ProductResponse 경계에 맞게 수정해야 해당 invariant를 완전히 CLOSED로 판정할 수 있다.
