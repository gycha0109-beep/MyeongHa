# C09 인증된 개인 학습 승인 이벤트 처리 경로 — 2026-10-30

**상태: 서버 Command Shadow 구현. 운영 HTTP 라우트 미등록, DB 신규 Proposal 미적용, 영구 학습 발행 미활성.**

## 입력과 신뢰 경계

- `apps/api/src/seyeon-c09-private-learning-optin-command-shadow-v1.ts`는 기존 `executePostgresSubjectTransactionV1`를 사용한다.
- **사용자 요청에서 허용하는 값은 오직 `action: "approve_private_learning"`과 `originalMessageId`**이다. `subjectId`, 공유 범위, 학습 Topic 및 승인 영수증은 요청에서 받지 않는다. 예상하지 않은 필드는 거부한다.
- `verifiedEvidence`는 **기존 인증 체계가 검증한 회원 식별 증거**를 호출 계층에서 전달해야 한다. 새 Command는 토큰 검증 함수가 아니며, HTTP JSON을 `verifiedEvidence`로 전달하는 사용은 금지한다. Guest는 거부한다.
- 기존 Subject 실행기가 `BEGIN → SET LOCAL ROLE myeongha_api_executor → begin_member_subject_context_v1 → assert_myeongha_subject_context_v1` 순서로 서버 정규 Subject를 확정한다. 클라이언트의 Subject ID는 입력받지 않는다.
- 데이터베이스에서 해당 Subject의 미삭제 사용자 메시지에 대해 원문·DB 원본 해시·생성 시간을 읽는다. 별도의 서버 관리 `topicAuthority.decide`가 원문/해시를 확인하고 Topic, 수준, 기간을 승인한 경우에만 다음 단계로 간다. 아직 실제 `topicAuthority` 운영 구현은 제공되지 않으며 미설치 상태는 실행 불가능하다.
- 동의를 명시한 현재 회원 요청마다 서버가 새로운 `actionRef`를 생성한다. DB 원본 해시가 계속 일치하는 경우에만 Proposed `character_learning_private_optin_receipts_v1`에 개인 학습 승인 영수증을 추가한다.
- **동일 트랜잭션**에서 `c09_capture_private_approved_source_shadow_v1`를 호출해 개인 Source 승인 + 감사 기록을 캡처하고, `createPostgresSeyeonC09PrivateApprovedSourceShadowV1`로 원본/현재 승인 상태를 다시 조회한다. 검증 실패 시 트랜잭션 전체 롤백(영수증과 감사 기록 모두 무효).
- 결과는 `scope:user_private`, `evidencePublished:false`, `productionActivated:false`다. 기존 Learning Publication Planner의 `mayExecuteInProduction=false`도 유지한다. 공유 동의·공통 캐릭터 학습 권한을 발행하지 않는다.

## 현재 확인된 테스트

- `test/seyeon-c09-private-learning-optin-command-shadow-v1.test.ts`: 인증된 회원의 요청에서 Subject를 확정한 뒤 영수증→원본 캡처→Source Authority 순서 및 COMMIT 검증.
- 암묵적 기억 등록 요청, Guest, 클라이언트 Subject/visibility 위조, 잘못된 ID는 DB 연결 전 거부.
- 원본 메시지 미존재, Topic 미승인, 영수증 INSERT 오류/누락, 캡처 오류/누락, 원본 검증 무효 시 ROLLBACK 확인.
- 기존 독립 격리 PostgreSQL 17 SQL 검증: `C09_APPROVED_PRIVATE_ORIGINAL_AUDIT_ISOLATED_PASS` (앞선 커밋).
- CI에 반영하여 새 Command와 테스트의 타입·회귀 상태를 검증해야 한다. 현재 PC 직접 테스트는 개발 PC 연결이 없어 수행하지 못했다.

## 미완료 / 운영 전 제한

1. **실제 HTTP Endpoint, 기존 인증 미들웨어에서 `verifiedEvidence` 주입, 사용자 확인 UI 및 사용자 지정 동의 문안 연결 미구현**. 현재는 서버 명령 처리 단위이며 요청 자동 수집 기능이 아니다.
2. Production에서 `character_learning_private_optin_receipts_v1`와 캡처/현재 검증 함수 미배포. 기존 운영 API 역할에는 Proposal 테이블 INSERT와 캡처 함수 EXECUTE 권한이 없어 실행할 수 없다.
3. 서버 통제 `topicAuthority` 구현 및 원본 내용 검증/민감정보 분류가 미완성. 모델 출력만으로 사실 승인·Canon 갱신 금지.
4. **대화 원본과 동의 영수증의 최종 잠금**, 충돌하는 철회·삭제의 직렬화, idempotent replay, 장기적 감사·권한 격리 및 실제 승인 상태 조회가 운영 준비 요건. 운영에 역할/권한을 확장하지 않음.
5. User-private 승인 이벤트와 Character-shared 전파는 별도 동의·비식별화·Privacy Review 체계로 계속 분리한다.

현재 작업은 운영 DB를 건드리지 않으며, 테스트가 아닌 실제 사용자가 동의를 했다거나 세연이 영구 학습을 수행했다고 주장하지 않는다.


## 2026-10-30 follow-up: retry/idempotency and production readback

- Auth-bound command shadow now treats `(canonical subject_id, original_message_id)` as its immutable private-approval replay key.
- A retry after a committed response loss reads the existing approved receipt and checks the current Source+Audit proof, without issuing a second receipt or source capture. Concurrent unique-key winners are re-read and verified.
- A withdrawn receipt, changed original hash, missing current Source proof, or incomplete capture fails closed; a withdrawn approval cannot be resurrected by a retry.
- PostgreSQL receipt/capture remain PROPOSAL_NOT_APPLIED; no public HTTP mount, user UI, production private learning or character-shared publication is enabled.
- Read-only production catalog check (2026-10-30): private receipt table=false, capture audit table=false, capture function=false, current API role Source SELECT=true/INSERT=false.
- Production `public.conversation_messages.content_hash` column SELECT=false for `myeongha_api_executor`; relevant message columns are otherwise SELECT=true and UPDATE=false. PostgreSQL `SELECT ... FOR SHARE` requires UPDATE privilege on at least one column, so the current command cannot run as that ordinary read-only executor. No privileges were modified.
- Follow-up: design and approve a narrowly scoped verified-action writer/locking authority, independently governed Topic/Content review, and receipt/audit migration before any production route/UI is activated.


## 2026-10-30 continuation: governed original-review and Topic authorization

- Added `seyeon-c09-reviewed-original-topic-authority-shadow-v1.ts`: positive read-only authorization of one *independently reviewed* original message, bound to canonical Member Subject, message UUID, current original content hash, private visibility, valid learning dates, and current governed Topic publication. The adapter does **not** classify original text or accept LLM/topic claims as authority.
- Added `postgres-seyeon-c09-published-topic-authority-shadow-v1.ts`: read-only Topic lookup against the **already deployed** `myeongha_internal.character_knowledge_topics_v1`, using the same existing canonical Member Subject transaction. The SQL only admits presently published, non-revoked `seyeon` topics; no privileged role or DML is created.
- Integrated the independent-original path into the existing private opt-in Command, using the same transaction that checks the original, finds an existing approval, inserts an approval receipt, and verifies Source+Audit. Existing legacy `topicAuthority` injection remains solely for isolated Shadow tests; a real integration must use the independently approved original-source provider.
- The independent reviewed-original **data provider is still missing**. This integration does not mean that any real original review is available or trusted. The Topic registry can be read, but an empty/nonpublished Topic or missing independent review fails closed. Existing private receipt/audit capture Proposal remains not deployed and its writer privileges are absent.
- The HTTP Shadow is still unmounted; no consent UI, Production route, user-private durable evidence publication, shared knowledge, or Core Persona mutation is activated.
- Focused regressions: 55 PASS (reviewed-original, Topic SQL read adapter, opt-in Command, opt-in HTTP); `tsc -p tsconfig.build.json --noEmit` PASS on pinned repository toolchain. Production database was not modified.
- Next: durable server-governed original-content review source, approved least-privilege writer/row-lock permissions + isolated concurrency validation, then explicit user approval UX and separately authorized rollout.


## 2026-10-30 follow-up — persisted independent original-review source (proposal only)

- Added `supabase/proposals/seyeon_c09_original_review_authority_PROPOSAL_NOT_APPLIED.sql`: append/revoke-oriented independently reviewed-original registry keyed to canonical Member Subject + original message, with original content hash, reviewer and review-policy references, approved Topic, awareness and validity times. Private-only constraints, `FORCE RLS`, Subject-scoped API SELECT and no INSERT/UPDATE/DELETE to API, PUBLIC, anon or authenticated. No real review events are created by the proposal.
- Added `postgres-seyeon-c09-reviewed-original-source-shadow-v1.ts` and an explicit opt-in Command review mode (`reviewedOriginalSource: 'postgres_reviewed_original_v1'`). The existing canonical Subject transaction reads the independent record and published Topic; a missing, revoked, foreign-Subject, content-hash-mismatched or invalid record blocks receipt issuance before writes.
- The previous independently supplied review provider and isolated legacy fixtures remain available for test-only compatibility. The server does not silently substitute user text, Memory or model output for reviewer authority.
- Synthetic real PostgreSQL 17: `C09_ORIGINAL_REVIEW_ISOLATED_PG17_PASS` from the committed bootstrap/assert fixtures, verifying RLS/FORCE RLS, subject separation, role ACL and review revocation. Focused API/Command tests: 73 PASS; build TypeScript check PASS.
- **Not deployed**: the reviewed-original table does not exist in production. Neither the reviewer issuance identity nor a trusted reviewed-content approval workflow has been implemented; any stored synthetic review belongs to disposable isolation only. Receipt/audit Proposal and its privileged mutation/row-locking authority are also not deployed. Further review-revocation rechecks during later Source/Evidence reads and concurrency-safe writer admission remain required before live activation.
- Production schema and privileges, chat HTTP mount, consent UI and durable/private/shared learning remain unchanged in this commit. Safe next implementation: approved server review issuance, separate authenticated opt-in/write role, source revalidation under concurrent redaction/revocation, and user-visible consent path.


## 2026-10-30 independent-review revocation readback

- The C09 private Source publication reader now requires BOTH the existing current original+member-opt-in Source proof and a still-approved, non-revoked independent original review at every readback, before and after Source approval retrieval.
- The review proof is joined on canonical Member Subject, original message UUID, original hash, Character, Topic and awareness. A revoked/missing review fails closed and cannot sustain a private Source issue plan. No character-shared access is granted.
- Relevant tests: 76 PASS; TypeScript build check PASS. This is a readback guarantee only: the future writer must still serialize approval, review revocation, original redaction and publication using governed row locks in the same transaction. The review registry, private receipt and source capture proposals are not deployed.


## 2026-10-30 — Dedicated independent-review issuance writer (isolated only)

- Added `supabase/proposals/seyeon_c09_review_issuance_writer_PROPOSAL_NOT_APPLIED.sql`: a separate `NOLOGIN / NOBYPASSRLS / NOINHERIT` original-review writer role, locked-original and locked-Topic SECURITY INVOKER issuance function, Subject-bound RLS, and minimal review INSERT/SELECT. No role membership is granted to the ordinary API runtime or any login identity.
- PostgreSQL `FOR SHARE` requires SELECT and limited UPDATE privilege on a column. This proposal grants the dedicated writer only the minimum lock-enabling UPDATE columns on the original and Topic, combines Subject-aware RLS with `WITH CHECK(false)`, and installs a direct-UPDATE rejection trigger. No corresponding privileges are given to `myeongha_api_executor`.
- The function locks the original message and published Topic; rejects foreign Subject, missing/redacted or changed original hash, unapproved Topic, unknown reviewer/policy refs and invalid timestamps. An exact review replay returns the existing record; a conflicting replay fails. It creates ONLY an independently reviewed-original record — no Member opt-in receipt, private Source capture, durable learning Evidence or shared-knowledge publication.
- Added `apps/api/src/seyeon-c09-original-review-issuance-shadow-v1.ts`: unmounted server-only issuance step. It requires a separately injected `verifyOriginalReview` port, exact canonical Member Subject and original message, strict verified approval payload, and a dedicated writer SQL response. It intentionally does NOT accept client JSON or a model response as verified reviewer evidence and exposes no public endpoint.
- Disposable synthetic PostgreSQL 17 results: `C09_REVIEW_WRITER_ISOLATED_PG17_PASS`, including role ACL, normal API write denial, exact replay, conflicting replay, cross-Subject rejection, original hash rejection and direct original/Topic mutation denial. New focused C09 Vitest total 93 PASS, build TypeScript check PASS.
- **Not production-ready:** there is still NO real independently authenticated reviewer credential or review-evidence service, NO dedicated trusted writer transaction connector, NO review-audit/withdrawal transaction race proof, and NO operational approval of new DDL/privileges. This is a proposal plus isolated proof, not an active service. Production DB remains unchanged, and default deny remains mandatory.
