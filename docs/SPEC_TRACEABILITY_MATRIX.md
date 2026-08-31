# 명하 Specification Traceability Matrix v0.16

> Product: **명하 (Myeongha)**  
> Pack Version: **v0.16**  
> Date: **2026-08-31**  
> Authority: `Usecase_re_reviewed_v2(1).md`의 UC-01~UC-34(UC-16A 포함)  
> Rule: Use Case가 implementation spec과 verification gate에 연결되지 않으면 구현 완료로 간주하지 않는다.

---

## 1. 상태 정의

```text
COVERED
→ 구현 명세 + 검증 gate가 존재

COVERED-P0
→ 구현 경계는 정의됐지만 OPEN-P0 결정이 필요한 부분 존재

COVERED-SOURCE-GAP
→ Pack이 임의 결정할 수 없는 source authority gap 존재
```

한 UC에 P0와 source gap이 동시에 있으면 둘 다 명시한다. P0 결정이 source gap을 자동 해결한다고 간주하지 않는다.

## 2. Use Case Traceability

| UC | 핵심 요구 | Primary Implementation Specs | Verification Gate | Status |
|---|---|---|---|---|
| UC-01 | Guest 진입/세션 bootstrap | `API_CONTRACT`, `AUTH_RLS_PRIVACY`, `WEB_MOBILE_CLIENT_ARCHITECTURE`, `DB_DDL_MIGRATION` | §6 API, §15 Vertical Slice | COVERED |
| UC-02 | 첫 캐릭터 선택/첫 만남 | `API_CONTRACT`, `CHARACTER_WORLD_CONTENT`, `AI_CHARACTER_RUNTIME`, `RELATIONSHIP_MEMORY_POLICY` | §7 Chat, §9 AI, §11 Content | COVERED-SOURCE-GAP (`SRC-22` if first-meeting candidate mutates relationship score/stage; `SRC-23` if first-meeting flow conditionally reveals/unlocks another character) |
| UC-03 | 호칭/닉네임 저장 | `API_CONTRACT`, `AUTH_RLS_PRIVACY`, `WEB_MOBILE_CLIENT_ARCHITECTURE` | §6 API, §15 Vertical Slice | COVERED |
| UC-04 | 명식록 입력/계산 요청 | `API_CONTRACT`, `SAJU_INTEGRATION`, `DB_DDL_MIGRATION` | §6 API, §8 Saju, §15 Vertical Slice | COVERED |
| UC-05 | 첫 Grounded Reading | `SAJU_INTEGRATION`, `AI_CHARACTER_RUNTIME`, `SHARED_DOMAIN_CONTRACTS`, `API_CONTRACT`, `UX_SCREEN_STATE`, `SOURCE_AUTHORITY_GAPS` | §8 Saju, §9 AI | COVERED-SOURCE-GAP (`SRC-33` validated `ProductReadingResponse` semantic-finalization authority before production grounding; `SRC-09` explicit guard metadata transport remains separate) |
| UC-06 | 필요한 현세록만 맥락적으로 질문 | `AI_CHARACTER_RUNTIME`, `RELATIONSHIP_MEMORY_POLICY`, `API_CONTRACT`, `UX_SCREEN_STATE` | §9 AI, §10 Relationship/Memory | COVERED-SOURCE-GAP (`SRC-05` durable proposal staging; proposal generation itself does not authorize a durable personal-record value) |
| UC-07 | 기억 범위 사용자 결정 | `RELATIONSHIP_MEMORY_POLICY`, `SHARED_DOMAIN_CONTRACTS`, `API_CONTRACT`, `AUTH_RLS_PRIVACY`, `UX_SCREEN_STATE` | §10 Relationship/Memory, §5 Auth, §14 Deletion | COVERED-SOURCE-GAP (`SRC-05` proposal staging + `SRC-10` grant create/regrant authority + `SRC-25` Life Fact/Memory positive type-schema registry for long-term accept) |
| UC-08 | 자연어/메뉴 Saju topic 요청 | `SAJU_INTEGRATION`, `AI_CHARACTER_RUNTIME`, `API_CONTRACT`, `SHARED_DOMAIN_CONTRACTS`, `SOURCE_AUTHORITY_GAPS` | §8 Saju, §9 AI | COVERED-SOURCE-GAP (`SRC-33` blocks promotion of transport success to a validated product-semantic Reading response; capability/domain request gating remains independently available) |
| UC-09 | 비-Saju 일반 대화 | `AI_CHARACTER_RUNTIME`, `RELATIONSHIP_MEMORY_POLICY` | §7 Chat, §9 AI | COVERED |
| UC-10 | 과거 대화 기억 | `RELATIONSHIP_MEMORY_POLICY`, `AI_CHARACTER_RUNTIME`, `AUTH_RLS_PRIVACY` | §5 Auth, §10 Relationship/Memory | COVERED-SOURCE-GAP (`SRC-25` where the flow creates a new durable Character Memory value; reads of already-valid stored Memory remain available) |
| UC-11 | 다른 캐릭터 canon 참조 | `CHARACTER_WORLD_CONTENT`, `AI_CHARACTER_RUNTIME` | §9 AI, §11 Content | COVERED |
| UC-12 | Multi-character scene | `AI_CHARACTER_RUNTIME`, `CHARACTER_WORLD_CONTENT`, `SHARED_DOMAIN_CONTRACTS` | §9 AI, §11 Content, §17 Failure | COVERED |
| UC-13 | 관계 progression | `RELATIONSHIP_MEMORY_POLICY`, `DB_DDL_MIGRATION`, `SERVER_COMMAND_TRANSACTION_SPEC`, `SOURCE_AUTHORITY_GAPS` | §4 DB, §10 Relationship/Memory | COVERED-SOURCE-GAP (`SRC-22` event registry/payload → score delta/stage/anti-farming policy evaluator; concrete Character Unlock reward additionally `SRC-23`) |
| UC-14 | 잠긴 캐릭터 reveal/unlock | `CHARACTER_WORLD_CONTENT`, `DB_DDL_MIGRATION`, `SERVER_COMMAND_TRANSACTION_SPEC`, `SOURCE_AUTHORITY_GAPS` | §4 DB, §11 Content, §15 Vertical Slice | COVERED-SOURCE-GAP (`SRC-23` unlock condition schema + World Event/condition→character effect authority; relationship-stage trigger additionally `SRC-22`, episode-completion trigger additionally `SRC-17` where applicable) |
| UC-15 | 상세 Reading report | `SAJU_INTEGRATION`, `API_CONTRACT`, `WEB_MOBILE_CLIENT_ARCHITECTURE`, `SHARED_DOMAIN_CONTRACTS`, `SOURCE_AUTHORITY_GAPS` | §8 Saju, §16 Real Saju | COVERED-SOURCE-GAP (`SRC-33` complete positive `ProductReadingResponse` validation/finalization is required before an external transport body is authoritative report content) |
| UC-16 | 궁합/상대 Birth Profile | `API_CONTRACT`, `SAJU_INTEGRATION`, `AUTH_RLS_PRIVACY`, `UX_SCREEN_STATE`, `SOURCE_AUTHORITY_GAPS` | §5 Auth, §6 API, §8 Saju, §14 Deletion | COVERED-SOURCE-GAP (`SRC-06` deletion + `SRC-08` real compatibility request adapter + `SRC-33` validated Product response consumption; supporting post-create Target Person metadata edit additionally `SRC-28`, while Target Birth revision append remains available) |
| UC-16A | revocable share artifact | `API_CONTRACT`, `AUTH_RLS_PRIVACY`, `DB_DDL_MIGRATION`, `SOURCE_AUTHORITY_GAPS` | §5 Auth, §6 API | COVERED-SOURCE-GAP (`SRC-20` positive public snapshot + create/retry/raw-token/expiry authority; public read + owner revoke baseline available) |
| UC-17 | 속마음 질문 경계 | `SAJU_INTEGRATION`, `AI_CHARACTER_RUNTIME` | §8 Saju, §9 AI | COVERED |
| UC-18 | Guest → 신규 계정 보관 | `API_CONTRACT`, `AUTH_RLS_PRIVACY`, `DB_DDL_MIGRATION` | §5 Auth, §6 API, §15 Vertical Slice | COVERED |
| UC-19 | 개인 기록 조회/수정/삭제 | `API_CONTRACT`, `AUTH_RLS_PRIVACY`, `RELATIONSHIP_MEMORY_POLICY`, `SHARED_DOMAIN_CONTRACTS`, `WEB_MOBILE_CLIENT_ARCHITECTURE`, `UX_SCREEN_STATE` | §5 Auth, §6 API, §10 Relationship/Memory, §14 Deletion | COVERED-SOURCE-GAP (`SRC-25` blocks production-authoritative creation of new Life Fact/Memory values without positive type schemas; existing read/revoke/Life Fact supersession lineage remains available; `SRC-06` additionally affects standalone Birth/Target deletion) |
| UC-20 | 일/월/연 return loop | `NOTIFICATION_RETURN_LOOP`, `SAJU_INTEGRATION`, `COST_QUOTA_ABUSE`, `WEB_MOBILE_CLIENT_ARCHITECTURE`, `SHARED_DOMAIN_CONTRACTS`, `SOURCE_AUTHORITY_GAPS` | §13 Notification, §16 Real Saju | COVERED-SOURCE-GAP (`SRC-32` final autonomous scheduler trigger/cadence/frequency-cap/dedupe/template/materialization authority; production Push delivery additionally requires `SRC-31` provider resolution/routing authority; source-backed grounded/non-spam goal, bounded categories, preference/quiet-hours constraints and stored delivery mechanics remain available) |
| UC-21 | 캐릭터 return message | `NOTIFICATION_RETURN_LOOP`, `AI_CHARACTER_RUNTIME`, `CHARACTER_WORLD_CONTENT`, `COST_QUOTA_ABUSE`, `SHARED_DOMAIN_CONTRACTS`, `SOURCE_AUTHORITY_GAPS` | §9 AI, §13 Notification | COVERED-SOURCE-GAP (`SRC-32` final return-message scheduler condition/cadence/frequency-cap/template/materialization authority; production Push delivery additionally requires `SRC-31` provider resolution/routing authority; Use Case timing conditions remain candidate examples until source resolution and stored delivery mechanics remain available) |
| UC-22 | Web↔App deep link | `WEB_MOBILE_CLIENT_ARCHITECTURE`, `API_CONTRACT`, `AUTH_RLS_PRIVACY` | §5 Auth, §6 API, §13 Notification | COVERED |
| UC-23 | 기기 전환/동일 세계 | `WEB_MOBILE_CLIENT_ARCHITECTURE`, `API_CONTRACT`, `AUTH_RLS_PRIVACY`, `NOTIFICATION_RETURN_LOOP` | §6 API, §13 Notification, §15 Vertical Slice | COVERED-SOURCE-GAP (`SRC-19` blocks authoritative device register/re-register/token-rotation lifecycle; revoke baseline available) |
| UC-24 | Admin 신규 캐릭터 publish | `CHARACTER_WORLD_CONTENT`, `API_CONTRACT`, `RELEASE_OBSERVABILITY` | §11 Content, §19 Promotion | COVERED-SOURCE-GAP (`SRC-27` content bundle/release lifecycle mutation authority; `SRC-01` per-character operational override; `SRC-23` executable unlock-condition schema/evaluator; activation additionally composes with `SRC-15`) |
| UC-25 | Admin episode release | `CHARACTER_WORLD_CONTENT`, `API_CONTRACT`, `RELEASE_OBSERVABILITY` | §11 Content, §19 Promotion | COVERED-SOURCE-GAP (`SRC-27` content bundle/release lifecycle mutation authority; `SRC-01` per-episode operational override; `SRC-17` episode transition evaluator; `SRC-23` if episode reward concretely unlocks a character; activation additionally composes with `SRC-15`) |
| UC-26 | 유료 Reading/content 구매 | `COMMERCE_ENTITLEMENT`, `API_CONTRACT`, `SHARED_DOMAIN_CONTRACTS`, `COST_QUOTA_ABUSE` | §12 Commerce | COVERED-SOURCE-GAP (`SRC-18` product→grant target + `SRC-21` event apply/aggregate projection; provider rail additionally `P0-CM-01`) |
| UC-27 | entitlement restore | `COMMERCE_ENTITLEMENT`, `API_CONTRACT` | §12 Commerce | COVERED-SOURCE-GAP (`SRC-18` historical source→grant target + `SRC-21` restore event/aggregate transition; provider rail additionally `P0-CM-01`) |
| UC-28 | notification controls/privacy | `NOTIFICATION_RETURN_LOOP`, `API_CONTRACT`, `WEB_MOBILE_CLIENT_ARCHITECTURE` | §13 Notification | COVERED-SOURCE-GAP (`SRC-12` missing-row/default/materialization authority) |
| UC-29 | unsupported Saju fail-closed | `SAJU_INTEGRATION`, `AI_CHARACTER_RUNTIME`, `API_CONTRACT` | §8 Saju, §9 AI | COVERED |
| UC-30 | Birth 수정/revision/stale | `API_CONTRACT`, `SAJU_INTEGRATION`, `DB_DDL_MIGRATION` | §4 DB, §6 API, §8 Saju | COVERED |
| UC-31 | 대화 삭제/캐릭터 forget/Life Fact revoke 분리 | `API_CONTRACT`, `AUTH_RLS_PRIVACY`, `RELATIONSHIP_MEMORY_POLICY`, `SOURCE_AUTHORITY_GAPS` | §5 Auth, §10 Relationship/Memory, §14 Deletion | COVERED-SOURCE-GAP (`SRC-14` duplicate transcript redaction authority; generic cross-scope deletion-job create additionally `SRC-29`, while existing direct Life Fact/Memory/character-forget boundaries remain available; `P0-PR-01` retention also open) |
| UC-32 | Guest → 기존 Member merge | `API_CONTRACT`, `AUTH_RLS_PRIVACY`, `DB_DDL_MIGRATION`, `SERVER_COMMAND_TRANSACTION_SPEC`, `SOURCE_AUTHORITY_GAPS` | §4 DB, §5 Auth, §6 API, §14 Deletion | COVERED-SOURCE-GAP (`SRC-24` conflict classification + conflicts/resolution schemas + domain action planning/apply + retry/resume/member-lifecycle authority; `SRC-25` additionally for any imported durable Life Fact/Memory value; `SRC-22` additionally for relationship projection transformation, `SRC-23` for Character Unlock transformation, `SRC-17` where Episode transition/effect semantics are involved; stored merge-job read + direct merged-history lineage remain available) |
| UC-33 | AI/Saju partial failure/retry | `API_CONTRACT`, `AI_CHARACTER_RUNTIME`, `SAJU_INTEGRATION`, `DB_DDL_MIGRATION`, `SERVER_COMMAND_TRANSACTION_SPEC.md`, `SHARED_DOMAIN_CONTRACTS`, `SOURCE_AUTHORITY_GAPS` | §7 Chat, §8 Saju, §17 Failure | COVERED-P0 / COVERED-SOURCE-GAP (`P0-AI-01`, `P0-SA-01`; `SRC-09` guard metadata; `SRC-33` prevents successful transport from being promoted to validated Product response and blocks public clarification positive validation) |
| UC-34 | account data deletion | `AUTH_RLS_PRIVACY`, `API_CONTRACT`, `DB_DDL_MIGRATION`, `RELEASE_OBSERVABILITY` | §14 Deletion, §19 Promotion | COVERED-P0 (`P0-PR-01`); account-specific start command remains independent of `SRC-29` |

## 3. Cross-Cutting Traceability

| Requirement | Spec Authority | Verification |
|---|---|---|
| object-level authorization | `AUTH_RLS_PRIVACY_SPEC.md` | Auth/RLS negative tests |
| API→DB trusted subject identity | `P0_DECISION_REGISTER.md` `P0-AUTH-01` | RLS harness must reflect chosen model |
| idempotent chat/reading/commerce/world writes | `API_CONTRACT`, `DB_DDL_MIGRATION`, `SERVER_COMMAND_TRANSACTION_SPEC.md` | DB/API/concurrency/failure gates; unresolved World Event domain semantics remain source-gated |
| version pinning | DB / AI / Saju / Release specs | provenance assertions |
| no parallel Saju semantic runtime | `SAJU_INTEGRATION_SPEC.md` | Saju/AI gates |
| material ambiguity preservation | `SAJU_INTEGRATION`, `AI_CHARACTER_RUNTIME` | scenario/ambiguity tests after validated Product response authority exists; raw transport shape alone is not semantic evidence |
| deterministic baseline Saju-bearing narrative | `SAJU_INTEGRATION`, `AI_CHARACTER_RUNTIME` | Saju/AI gates after validated Product response authority exists |
| Saju Product response / clarification validation authority | `SAJU_INTEGRATION_SPEC`, `API_CONTRACT`, `SHARED_DOMAIN_CONTRACTS_SPEC`, `SERVER_COMMAND_TRANSACTION_SPEC`, `SOURCE_AUTHORITY_GAPS` (`SRC-33`) | complete positive `ProductReadingResponse` validation, transport→`reading_ref` semantic finalization, `ClarificationAnswerV1`, question/answer correlation, canonicalization/hash identity, public clarification mutation, validator failure details and pending cross-version compatibility blocked; lower-level clarification persistence remains testable with explicitly prevalidated canonical fixtures |
| explicit record grants | `RELATIONSHIP_MEMORY_POLICY` | cross-character privacy tests |
| personal-record type/schema registry authority | `RELATIONSHIP_MEMORY_POLICY`, `SHARED_DOMAIN_CONTRACTS`, `API_CONTRACT`, `SOURCE_AUTHORITY_GAPS` (`SRC-25`) | new durable Life Fact/Memory positive type-schema validation and proposal-accept persistence gate blocked; existing stored reads/revokes/Life Fact lineage invariants remain testable |
| record grant create/regrant authority | `RELATIONSHIP_MEMORY_POLICY`, `API_CONTRACT`, `SOURCE_AUTHORITY_GAPS.md` (`SRC-10`) | create/regrant/idempotency gate blocked pending source resolution |
| relationship event apply policy authority | `RELATIONSHIP_MEMORY_POLICY`, `SHARED_DOMAIN_CONTRACTS`, `SERVER_COMMAND_TRANSACTION_SPEC`, `SOURCE_AUTHORITY_GAPS` (`SRC-22`) | event registry/payload, score bounds/delta, stage transition, anti-farming, concurrency apply gate blocked pending source resolution; ledger/revision structure remains testable |
| Character Unlock condition/effect authority | `CHARACTER_WORLD_CONTENT`, `SERVER_COMMAND_TRANSACTION_SPEC`, `SOURCE_AUTHORITY_GAPS` (`SRC-23`) | unlock condition schema, World Event payload/causality, condition→target/effect, replay/concurrency and bundle-migration gate blocked; stored projection/current-read remains testable |
| existing-Member Guest merge policy authority | `API_CONTRACT`, `AUTH_RLS_PRIVACY`, `SERVER_COMMAND_TRANSACTION_SPEC`, `SOURCE_AUTHORITY_GAPS` (`SRC-24`) | conflict classification, conflicts/resolution schema, domain action planning/apply, stale-resolution, retry/resume and member-lifecycle gate blocked; merge-job current read + direct merged-history projection remain testable |
| Target Person metadata mutation authority | `API_CONTRACT`, `SOURCE_AUTHORITY_GAPS` (`SRC-28`) | post-create display/relationship label mutation blocked pending mutability/schema/validation/CAS/idempotency/history authority; Target Person create/read + owned Target Birth revision append remain testable |
| episode progress single-projection bundle selection | `CHARACTER_WORLD_CONTENT`, `API_CONTRACT`, `SOURCE_AUTHORITY_GAPS.md` (`SRC-11`) | `GET /api/episodes/:id/progress` projection gate blocked pending source resolution |
| notification preference missing-row/default/materialization | `NOTIFICATION_RETURN_LOOP`, `API_CONTRACT`, `SOURCE_AUTHORITY_GAPS.md` (`SRC-12`) | preference mutation/default gate blocked pending source resolution |
| notification inbox status membership | `NOTIFICATION_RETURN_LOOP`, `API_CONTRACT`, `SOURCE_AUTHORITY_GAPS.md` (`SRC-13`) | inbox projection gate blocked pending source resolution |
| notification delivery provider-resolution/routing authority | `NOTIFICATION_RETURN_LOOP`, `SERVER_COMMAND_TRANSACTION_SPEC`, `SOURCE_AUTHORITY_GAPS` (`SRC-31`) | production provider resolver/mapping/configuration/failover and canonical provider selection remain blocked; caller-supplied provider must not be treated as authoritative routing evidence; stored logical delivery, attempt-number allocation/finalization, and stored delivery/attempt reads remain independently testable |
| notification scheduler cadence/frequency/eligibility authority | `NOTIFICATION_RETURN_LOOP`, `SHARED_DOMAIN_CONTRACTS`, `SOURCE_AUTHORITY_GAPS` (`SRC-32`) | final trigger schema, cadence/threshold, frequency-cap scope/window/count, scheduler dedupe/template selection, replay/concurrency, stale-candidate and policy-provenance gate blocked; stored notification/preference/read/delivery boundaries remain independently testable |
| conversation delete duplicate transcript redaction | `API_CONTRACT`, `AUTH_RLS_PRIVACY_SPEC.md`, `SOURCE_AUTHORITY_GAPS.md` (`SRC-14`) | message + turn request snapshot + attempt generated payload redaction/tombstone gate blocked pending source resolution |
| generic data-deletion-job request authority | `API_CONTRACT`, `AUTH_RLS_PRIVACY`, `SOURCE_AUTHORITY_GAPS` (`SRC-29`) | arbitrary non-account scope/type/id job creation blocked; account-specific start + owner-scoped stored job status read + direct record revoke boundaries remain testable |
| commerce Purchase Intent minimal offer mapping snapshot | `API_CONTRACT`, `COMMERCE_ENTITLEMENT`, ERD v0.6 | Purchase Intent create/idempotency/concurrency gate |
| purchased product → grant target authority | `SOURCE_AUTHORITY_GAPS` (`SRC-18`), `COMMERCE_ENTITLEMENT` | purchase/restore grant-target resolution gate blocked pending source resolution |
| entitlement grant event transition + logical aggregate authority | `SOURCE_AUTHORITY_GAPS` (`SRC-21`), `COMMERCE_ENTITLEMENT`, `SERVER_COMMAND_TRANSACTION_SPEC` | event-type transition/stale-order/valid-grant predicate/active-count/effective-expiry/revision/outbox gate blocked pending source resolution |
| device installation register/re-register lifecycle | `NOTIFICATION_RETURN_LOOP`, `API_CONTRACT`, `SOURCE_AUTHORITY_GAPS` (`SRC-19`) | register/re-register/token-rotation/row-lineage gate blocked; standalone owner revoke remains testable |
| Share Artifact create/public projection authority | `API_CONTRACT`, `AUTH_RLS_PRIVACY`, `SOURCE_AUTHORITY_GAPS` (`SRC-20`) | positive snapshot allowlist + Reading eligibility + retry/raw-token/expiry create gate blocked; public read + revoke remain testable |
| content release lifecycle mutation authority | `CHARACTER_WORLD_CONTENT`, `API_CONTRACT`, `RELEASE_OBSERVABILITY`, `SOURCE_AUTHORITY_GAPS` (`SRC-27`) | bundle register/release create/activate/retire/default-switch mutation gate blocked; stored bundle/release projections and active-default read remain testable; activation additionally requires `SRC-15` |
| transactional outbox | `DB_DDL_MIGRATION`, `RELEASE_OBSERVABILITY`, `SERVER_COMMAND_TRANSACTION_SPEC`, `SOURCE_AUTHORITY_GAPS` (`SRC-30`) | source-backed enqueue/dedupe, pending claim, expired-processing lease reclaim, and successful completion remain testable; publisher failure finalization/classification, retry scheduling/backoff, `attempt_count` lifecycle, dead-letter transition/threshold, and manual replay/requeue remain blocked pending `SRC-30` resolution |
| content/client compatibility | `CHARACTER_WORLD_CONTENT`, `WEB_MOBILE_CLIENT_ARCHITECTURE`, `UX_SCREEN_STATE_SPEC.md`, `SOURCE_AUTHORITY_GAPS` (`SRC-15`) | compatibility decision/activation gate remains source-gated; raw version/capability components remain testable |
| rate-limit/quota/context budget | `COST_QUOTA_ABUSE_SPEC.md` | cost/quota/abuse gate |
| analytics event schemas/experiments | `ANALYTICS_EXPERIMENT_SPEC.md` | analytics/experiment gate |
| current Saju request/guard contract compatibility | `SAJU_INTEGRATION_SPEC.md`, `SOURCE_AUTHORITY_GAPS.md` (`SRC-08`,`SRC-09`) | current public host input/exported fixture tests are integration audit/conformance evidence only; they do not substitute for `SRC-33` Product semantic validation |
| server command lock/transaction order | `SERVER_COMMAND_TRANSACTION_SPEC.md` | concurrency/deadlock/failure tests |
| screen/state semantic consistency | `UX_SCREEN_STATE_SPEC.md` | screen-state gate |

## 4. Completion Rule

모든 UC row가 `COVERED*` 상태여도 기능이 완료된 것은 아니다.

```text
Spec traceability
+ implementation
+ automated positive tests
+ negative authorization/integrity tests
+ concurrency/idempotency tests
+ vertical-slice E2E
= 완료 evidence
```

`COVERED-P0`는 해당 기능을 production enable하기 전에 decision이 `DECIDED`여야 한다. `COVERED-SOURCE-GAP`은 해당 gap이 영향을 주는 operational capability를 production gate로 삼기 전에 source resolution이 필요하다.
