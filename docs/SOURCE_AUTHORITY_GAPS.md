# 명하 Source Authority Gap Register v0.4

> Product: **명하 (Myeongha)**  
> Pack Version: **v0.4**  
> Date: **2026-08-27**  
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

## SRC-10 — Record Access Grant Create / Regrant Authority

**Status: BLOCKING BEFORE `POST /api/memories/:id/grants` WRITE FINALIZATION**

Use Case는 durable Memory/Life Fact visibility를 explicit `record_access_grants`로 표현하고, `current_characters` 선택을 **승인 시점의 현재 eligible character 집합 snapshot**으로 확장하라고 요구한다. 그러나 source는 여기서 `eligible`의 authoritative predicate를 끝까지 정의하지 않는다.

현재 source만으로는 다음을 확정할 수 없다.

```text
character row 존재
vs character unlock 상태
vs current content release/runtime availability
vs retired/disabled character 처리
vs subject가 실제 접근 가능한 캐릭터 집합
```

또한 ERD는 active grant에만 partial unique를 두므로 revoked history 뒤 같은 `(record, character)` 조합의 새 row를 구조적으로 허용하지만, API `POST .../grants`가 다음 중 어느 command semantics를 가져야 하는지는 source가 정하지 않는다.

```text
A. revoked grant를 다시 활성화
B. 새 grant row를 append하여 과거 revoke history를 보존
C. 별도 grant lineage/regrant event를 기록
```

단순 DB 가능성을 product command authority로 승격하지 않는다. Source는 최소 다음을 정해야 한다.

```text
1. current_characters snapshot의 exact eligibility predicate
2. explicit one-character grant의 eligibility predicate
3. revoke 후 regrant의 lineage/history semantics
4. retry/idempotency 시 동일 logical grant create의 dedupe authority
```

해결 전에는 current grant read와 revoke/forget 경계는 유지할 수 있으나, **새 grant create command를 final production authority로 확정하지 않는다.**

## SRC-11 — Episode Progress Query Bundle Selection Authority

**Status: BLOCKING BEFORE `GET /api/episodes/:id/progress` PROJECTION FINALIZATION**

ERD v0.6의 `user_episode_progress` authority는 다음 키로 version-pinned current projection을 보존한다.

```text
(subject_id, episode_id, content_bundle_id)
```

따라서 한 사용자가 동일 stable `episode_id`에 대해 서로 다른 content bundle의 progress row를 역사적으로 둘 이상 가질 수 있다. `CHARACTER_WORLD_CONTENT_SPEC`도 retired bundle을 기존 pinned progress가 참조하는 동안 유지하도록 요구한다.

반면 Shared API는:

```text
GET /api/episodes/:id/progress
```

만 정의하고 bundle/version selector를 받지 않는다. Source는 여러 pinned progress가 공존할 때 어떤 row가 이 endpoint의 authoritative response인지 결정하지 않는다.

임의로 다음을 선택하면 안 된다.

```text
latest updated row
highest revision row
active/completed 우선순위
latest content release의 bundle
현재 default release와 동일한 bundle
```

Source에서 다음 중 하나 또는 동등한 contract가 필요하다.

```text
A. endpoint에 contentBundleId/progressId selector 추가
B. current/continuable progress를 고르는 deterministic authority 정의
C. episode별 모든 pinned progress summary를 반환하고 client가 explicit 선택
```

해결 전 episode start/advance write authority와 historical pinned rows는 유지할 수 있으나, bundle을 숨긴 단수형 current projection을 임의 구현하지 않는다.

## SRC-12 — Notification Preference Default / Materialization Authority

**Status: BLOCKING BEFORE NOTIFICATION PREFERENCE MUTATION FINALIZATION**

Use Case는 카테고리별 opt-in/out, quiet hours, timezone, preview privacy를 요구하고 ERD는 `notification_settings` 1-row projection과 `notification_preferences(subject_id, category)` rows를 둔다. 그러나 source는 **row가 아직 없을 때의 effective value와 materialization rule**을 정의하지 않는다.

현재 source가 확정하지 않은 항목:

```text
notification_settings 미존재 시 global_enabled 기본값
notification_preferences(category) 미존재 시 enabled 기본값
초기 5개 category row를 bootstrap 시 모두 생성하는지 여부
PATCH가 insert-or-update인지 existing-row-only update인지 여부
새 category가 registry에 추가될 때 기존 사용자에게 어떤 default를 적용하는지
preview 기본값이 discreet인지 character_only인지 — source는 "민감 내용을 노출하지 않는 mode"까지만 요구
```

이 값들은 단순 UI default가 아니라 scheduler eligibility와 개인정보 노출을 직접 바꾸므로 Pack이 임의 선택하지 않는다.

Source는 최소 다음을 명시해야 한다.

```text
1. missing-row effective default authority
2. subject bootstrap/materialization policy
3. PATCH create/update semantics와 idempotency
4. category registry 확장 시 existing-user default/migration policy
5. exact default preview mode
```

해결 전 current stored-row projection은 읽을 수 있지만, absence를 임의 default로 합성하거나 PATCH를 암묵 upsert로 확정하지 않는다.

## SRC-13 — Notification Inbox Status Membership Authority

**Status: BLOCKING BEFORE `GET /api/notifications` INBOX PROJECTION FINALIZATION**

ERD v0.6의 logical notification 상태는 다음과 같다.

```text
queued | ready | read | cancelled | expired
```

`NOTIFICATION_RETURN_LOOP_SPEC`는 `notifications.status='read'`를 사용자가 inbox item을 읽은 상태로 정의하지만, Shared API `GET /api/notifications`가 위 status 중 **어떤 항목을 사용자 inbox에 노출해야 하는지**는 source가 정하지 않는다.

특히 다음은 의미가 서로 다르다.

```text
queued     → 미래 scheduled item일 수 있음
ready      → 현재 노출 가능한 item일 수 있음
read       → 읽은 history
cancelled  → 생성됐지만 더 이상 유효하지 않은 item
expired    → 과거 유효기간 종료 item
```

Source authority 없이 `WHERE status IN (...)`를 임의 작성하면 future notification 선노출, 취소된 world event 노출, 또는 읽은 history의 비의도적 소실이 발생할 수 있다.

Source는 최소 다음을 결정해야 한다.

```text
1. inbox visible status membership
2. read history 포함 여부
3. cancelled/expired history의 사용자 노출 여부
4. queued item의 scheduled-before-ready visibility 여부
```

해결 전 `POST /api/notifications/:id/read`처럼 explicit 대상의 read command는 유지할 수 있으나, 전체 inbox projection은 source-backed status membership이 생기기 전까지 final authority로 구현하지 않는다.
