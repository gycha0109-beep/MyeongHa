# 명하 Specification Traceability Matrix v0.5

> Product: **명하 (Myeongha)**  
> Pack Version: **v0.5**  
> Date: **2026-08-28**  
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
| UC-02 | 첫 캐릭터 선택/첫 만남 | `API_CONTRACT`, `CHARACTER_WORLD_CONTENT`, `AI_CHARACTER_RUNTIME`, `RELATIONSHIP_MEMORY_POLICY` | §7 Chat, §9 AI, §11 Content | COVERED |
| UC-03 | 호칭/닉네임 저장 | `API_CONTRACT`, `AUTH_RLS_PRIVACY`, `WEB_MOBILE_CLIENT_ARCHITECTURE` | §6 API, §15 Vertical Slice | COVERED |
| UC-04 | 명식록 입력/계산 요청 | `API_CONTRACT`, `SAJU_INTEGRATION`, `DB_DDL_MIGRATION` | §6 API, §8 Saju, §15 Vertical Slice | COVERED |
| UC-05 | 첫 Grounded Reading | `SAJU_INTEGRATION`, `AI_CHARACTER_RUNTIME`, `SHARED_DOMAIN_CONTRACTS`, `UX_SCREEN_STATE` | §8 Saju, §9 AI | COVERED-SOURCE-GAP (`SRC-09` explicit guard metadata; protected-block baseline available) |
| UC-06 | 필요한 현세록만 맥락적으로 질문 | `AI_CHARACTER_RUNTIME`, `RELATIONSHIP_MEMORY_POLICY`, `API_CONTRACT`, `UX_SCREEN_STATE` | §9 AI, §10 Relationship/Memory | COVERED-SOURCE-GAP (`SRC-05` durable proposal staging) |
| UC-07 | 기억 범위 사용자 결정 | `RELATIONSHIP_MEMORY_POLICY`, `API_CONTRACT`, `AUTH_RLS_PRIVACY`, `UX_SCREEN_STATE` | §10 Relationship/Memory, §5 Auth, §14 Deletion | COVERED-SOURCE-GAP (`SRC-05` proposal staging + `SRC-10` grant create/regrant authority) |
| UC-08 | 자연어/메뉴 Saju topic 요청 | `SAJU_INTEGRATION`, `AI_CHARACTER_RUNTIME`, `API_CONTRACT` | §8 Saju, §9 AI | COVERED |
| UC-09 | 비-Saju 일반 대화 | `AI_CHARACTER_RUNTIME`, `RELATIONSHIP_MEMORY_POLICY` | §7 Chat, §9 AI | COVERED |
| UC-10 | 과거 대화 기억 | `RELATIONSHIP_MEMORY_POLICY`, `AI_CHARACTER_RUNTIME`, `AUTH_RLS_PRIVACY` | §5 Auth, §10 Relationship/Memory | COVERED |
| UC-11 | 다른 캐릭터 canon 참조 | `CHARACTER_WORLD_CONTENT`, `AI_CHARACTER_RUNTIME` | §9 AI, §11 Content | COVERED |
| UC-12 | Multi-character scene | `AI_CHARACTER_RUNTIME`, `CHARACTER_WORLD_CONTENT`, `SHARED_DOMAIN_CONTRACTS` | §9 AI, §11 Content, §17 Failure | COVERED |
| UC-13 | 관계 progression | `RELATIONSHIP_MEMORY_POLICY`, `DB_DDL_MIGRATION` | §4 DB, §10 Relationship/Memory | COVERED |
| UC-14 | 캐릭터 unlock/reveal | `CHARACTER_WORLD_CONTENT`, `RELATIONSHIP_MEMORY_POLICY`, `API_CONTRACT` | §11 Content, §15 Vertical Slice | COVERED |
| UC-15 | 상세 Reading report | `SAJU_INTEGRATION`, `API_CONTRACT`, `WEB_MOBILE_CLIENT_ARCHITECTURE` | §8 Saju, §16 Real Saju | COVERED |
| UC-16 | 궁합/상대 Birth Profile | `API_CONTRACT`, `SAJU_INTEGRATION`, `AUTH_RLS_PRIVACY`, `UX_SCREEN_STATE` | §5 Auth, §6 API, §8 Saju, §14 Deletion | COVERED-SOURCE-GAP (`SRC-06` deletion + `SRC-08` real compatibility adapter) |
| UC-16A | revocable share artifact | `API_CONTRACT`, `AUTH_RLS_PRIVACY`, `DB_DDL_MIGRATION` | §5 Auth, §6 API | COVERED |
| UC-17 | 속마음 질문 경계 | `SAJU_INTEGRATION`, `AI_CHARACTER_RUNTIME` | §8 Saju, §9 AI | COVERED |
| UC-18 | Guest → 신규 계정 보관 | `API_CONTRACT`, `AUTH_RLS_PRIVACY`, `DB_DDL_MIGRATION` | §5 Auth, §6 API, §15 Vertical Slice | COVERED |
| UC-19 | 개인 기록 조회/수정/삭제 | `API_CONTRACT`, `AUTH_RLS_PRIVACY`, `RELATIONSHIP_MEMORY_POLICY`, `WEB_MOBILE_CLIENT_ARCHITECTURE`, `UX_SCREEN_STATE` | §5 Auth, §6 API, §14 Deletion | COVERED-SOURCE-GAP (`SRC-06`) |
| UC-20 | 일/월/연 return loop | `NOTIFICATION_RETURN_LOOP`, `SAJU_INTEGRATION`, `COST_QUOTA_ABUSE`, `WEB_MOBILE_CLIENT_ARCHITECTURE` | §13 Notification, §16 Real Saju | COVERED |
| UC-21 | 캐릭터 return message | `NOTIFICATION_RETURN_LOOP`, `AI_CHARACTER_RUNTIME`, `CHARACTER_WORLD_CONTENT`, `COST_QUOTA_ABUSE` | §9 AI, §13 Notification | COVERED |
| UC-22 | Web↔App deep link | `WEB_MOBILE_CLIENT_ARCHITECTURE`, `API_CONTRACT`, `AUTH_RLS_PRIVACY` | §5 Auth, §6 API, §13 Notification | COVERED |
| UC-23 | 기기 전환/동일 세계 | `WEB_MOBILE_CLIENT_ARCHITECTURE`, `API_CONTRACT`, `AUTH_RLS_PRIVACY` | §6 API, §15 Vertical Slice | COVERED |
| UC-24 | Admin 신규 캐릭터 publish | `CHARACTER_WORLD_CONTENT`, `API_CONTRACT`, `RELEASE_OBSERVABILITY` | §11 Content, §19 Promotion | COVERED-SOURCE-GAP (`SRC-01` affects per-character operational override only) |
| UC-25 | Admin episode release | `CHARACTER_WORLD_CONTENT`, `API_CONTRACT`, `RELEASE_OBSERVABILITY` | §11 Content, §19 Promotion | COVERED-SOURCE-GAP (`SRC-01` affects per-episode operational override only) |
| UC-26 | 유료 Reading/content 구매 | `COMMERCE_ENTITLEMENT`, `API_CONTRACT`, `SHARED_DOMAIN_CONTRACTS`, `COST_QUOTA_ABUSE` | §12 Commerce | COVERED-SOURCE-GAP (`SRC-18` product→entitlement mapping; provider rail additionally `P0-CM-01`) |
| UC-27 | entitlement restore | `COMMERCE_ENTITLEMENT`, `API_CONTRACT` | §12 Commerce | COVERED-SOURCE-GAP (`SRC-18` grant reconstruction semantics; provider rail additionally `P0-CM-01`) |
| UC-28 | notification controls/privacy | `NOTIFICATION_RETURN_LOOP`, `API_CONTRACT`, `WEB_MOBILE_CLIENT_ARCHITECTURE` | §13 Notification | COVERED-SOURCE-GAP (`SRC-12` missing-row/default/materialization authority) |
| UC-29 | unsupported Saju fail-closed | `SAJU_INTEGRATION`, `AI_CHARACTER_RUNTIME`, `API_CONTRACT` | §8 Saju, §9 AI | COVERED |
| UC-30 | Birth 수정/revision/stale | `API_CONTRACT`, `SAJU_INTEGRATION`, `DB_DDL_MIGRATION` | §4 DB, §6 API, §8 Saju | COVERED |
| UC-31 | 대화 삭제/캐릭터 forget/Life Fact revoke 분리 | `API_CONTRACT`, `AUTH_RLS_PRIVACY`, `RELATIONSHIP_MEMORY_POLICY`, `SOURCE_AUTHORITY_GAPS` | §5 Auth, §10 Relationship/Memory, §14 Deletion | COVERED-SOURCE-GAP (`SRC-14` duplicate transcript redaction authority; `P0-PR-01` retention also open) |
| UC-32 | Guest → 기존 Member merge | `API_CONTRACT`, `AUTH_RLS_PRIVACY`, `DB_DDL_MIGRATION` | §4 DB, §5 Auth, §6 API, §14 Deletion | COVERED |
| UC-33 | AI/Saju partial failure/retry | `API_CONTRACT`, `AI_CHARACTER_RUNTIME`, `SAJU_INTEGRATION`, `DB_DDL_MIGRATION`, `SERVER_COMMAND_TRANSACTION_SPEC.md` | §7 Chat, §8 Saju, §17 Failure | COVERED-P0 (`P0-AI-01`, `P0-SA-01`); Saju guard metadata also `SRC-09` |
| UC-34 | account data deletion | `AUTH_RLS_PRIVACY`, `API_CONTRACT`, `DB_DDL_MIGRATION`, `RELEASE_OBSERVABILITY` | §14 Deletion, §19 Promotion | COVERED-P0 (`P0-PR-01`) |

## 3. Cross-Cutting Traceability

| Requirement | Spec Authority | Verification |
|---|---|---|
| object-level authorization | `AUTH_RLS_PRIVACY_SPEC.md` | Auth/RLS negative tests |
| API→DB trusted subject identity | `P0_DECISION_REGISTER.md` `P0-AUTH-01` | RLS harness must reflect chosen model |
| idempotent chat/reading/commerce/world writes | `API_CONTRACT`, `DB_DDL_MIGRATION`, `SERVER_COMMAND_TRANSACTION_SPEC.md` | DB/API/concurrency/failure gates |
| version pinning | DB / AI / Saju / Release specs | provenance assertions |
| no parallel Saju semantic runtime | `SAJU_INTEGRATION_SPEC.md` | Saju/AI gates |
| material ambiguity preservation | `SAJU_INTEGRATION`, `AI_CHARACTER_RUNTIME` | scenario/ambiguity tests |
| deterministic baseline Saju-bearing narrative | `SAJU_INTEGRATION`, `AI_CHARACTER_RUNTIME` | Saju/AI gates |
| explicit record grants | `RELATIONSHIP_MEMORY_POLICY` | cross-character privacy tests |
| record grant create/regrant authority | `RELATIONSHIP_MEMORY_POLICY`, `API_CONTRACT`, `SOURCE_AUTHORITY_GAPS.md` (`SRC-10`) | create/regrant/idempotency gate blocked pending source resolution |
| episode progress single-projection bundle selection | `CHARACTER_WORLD_CONTENT`, `API_CONTRACT`, `SOURCE_AUTHORITY_GAPS.md` (`SRC-11`) | `GET /api/episodes/:id/progress` projection gate blocked pending source resolution |
| notification preference missing-row/default/materialization | `NOTIFICATION_RETURN_LOOP`, `API_CONTRACT`, `SOURCE_AUTHORITY_GAPS.md` (`SRC-12`) | preference mutation/default gate blocked pending source resolution |
| notification inbox status membership | `NOTIFICATION_RETURN_LOOP`, `API_CONTRACT`, `SOURCE_AUTHORITY_GAPS.md` (`SRC-13`) | inbox projection gate blocked pending source resolution |
| conversation delete duplicate transcript redaction | `API_CONTRACT`, `AUTH_RLS_PRIVACY_SPEC.md`, `SOURCE_AUTHORITY_GAPS.md` (`SRC-14`) | message + turn request snapshot + attempt generated payload redaction/tombstone gate blocked pending source resolution |
| commerce Purchase Intent minimal offer mapping snapshot | `API_CONTRACT`, `COMMERCE_ENTITLEMENT`, ERD v0.6 | Purchase Intent create/idempotency/concurrency gate |
| purchased product → entitlement mapping authority | `SOURCE_AUTHORITY_GAPS` (`SRC-18`), `COMMERCE_ENTITLEMENT` | purchase/restore grant-apply gate blocked pending source resolution |
| transactional outbox | `DB_DDL_MIGRATION`, `RELEASE_OBSERVABILITY` | failure/recovery tests |
| content/client compatibility | `CHARACTER_WORLD_CONTENT`, `WEB_MOBILE_CLIENT_ARCHITECTURE`, `UX_SCREEN_STATE_SPEC.md` | content/client compatibility + screen-state tests |
| rate-limit/quota/context budget | `COST_QUOTA_ABUSE_SPEC.md` | cost/quota/abuse gate |
| analytics event schemas/experiments | `ANALYTICS_EXPERIMENT_SPEC.md` | analytics/experiment gate |
| current Saju public contract compatibility | `SAJU_INTEGRATION_SPEC.md`, `SOURCE_AUTHORITY_GAPS.md` (`SRC-08`,`SRC-09`) | exact exported contract fixture tests |
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
