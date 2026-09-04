# 명하 Auth / RLS / Privacy Specification v0.6 — Source Aligned

> Product: **명하 (Myeongha)**  
> Pack Version: **v0.6**  
> Date: **2026-09-05**  
> Source Authority: `Usecase_re_reviewed_v2(1).md`, `Myeongha_DB_ERD_v0.6_AUTHORITY_FIRST(2).md`, `Myeonghwa_Personalized_Interpretation_Architecture_v1.3_THIRD_REVIEW(1).md`  
> Rule: source가 결정하지 않은 implementation-critical 사항은 `OPEN-P0`, 비차단 선택은 `CANDIDATE`, source 간 충돌/공백은 `SOURCE_AUTHORITY_GAPS.md` 또는 numbered source-gap 문서에 기록한다. Production P0 decision은 `P0_DECISION_REGISTER.md`가 단일 관리한다.

---

## 1. 목적

Guest/Member/merged history/public share/service write의 identity와 authorization 경계를 정의한다.

## 2. Identity Authorities

```text
auth.users
→ authenticated account identity

subjects
→ Myeongha owner identity
```

모든 user-owned row는 `subject_id`로 소유한다. `auth_user_id`는 owner key가 아니라 authentication mapping이다.

## 3. Guest

```text
raw guest token
→ API verifier
→ guest_session fingerprint check
→ guest subject resolve
→ object authorization
```

Supabase anon direct row CRUD를 guest persistence mechanism으로 사용하지 않는다. Guest bearer/session authentication TTL은 `P0-PR-01A`로 **DECIDED: 7 days / 604800 seconds**다. Expired Guest product-data deletion, backup, legal retention은 parent `P0-PR-01`로 계속 OPEN이다.

## 4. New Signup Promotion

```text
guest subject
→ same subject kind=member
→ auth_user_id attach
→ guest_session consumed
```

owner FK 이동 없음. promotion command는 auth identity proof + active guest proof를 같은 transaction 경계에서 검증한다.

## 5. Existing Member Merge

Primary source가 고정하는 merge security/lifecycle envelope:

- guest raw immutable ledger `subject_id` reparent 금지
- one Guest Session → at most one canonical Member merge lineage
- conflict detection과 필요한 explicit user resolution 원칙
- source-approved 범위에서만 canonical member current projection import/merge
- completed guest subject는 merged read-only lineage로 유지
- merge 완료 뒤 새 writes는 canonical member만 수행
- generic current endpoint에 merged guest history를 자동 union하지 않음
- dedicated direct-lineage read는 canonical member authorization을 통해서만 허용

그러나 source는 full existing-member merge executor에 필요한 다음 authority를 정의하지 않는다.

```text
domain/resource별 conflict taxonomy
conflicts_jsonb positive schema
resolution_jsonb schema / allowed choices
policy_version content/selection/migration
resource → retain_readonly | import_new | merge_projection | discard mapping
domain별 import/merge algorithm
stale resolution handling
partial failure / retry / resume semantics
same-key different-request semantics beyond the relational one-job envelope
response-loss replay semantics
canonical member status=deletion_pending에서 start/resume/finish 허용 범위
```

따라서 이 실행 policy는 `SRC-24`가 OPEN이다. 특히 ERD가 merge target을 `active/deletion_pending` relational envelope로 표현할 수 있다는 사실도, 반대로 Pack이 `active only`를 production product rule로 좁히는 것도 source resolution 없이 확정하지 않는다.

현재 source-safe하게 유지 가능한 것은:

```text
subject_merge_jobs / subject_merge_actions relational envelope
one-job/direct-lineage integrity
merge-job current read
completed direct merged guest lineage read-only projection
raw historical ledger reparent deny
```

Full conflict detection → resolution → domain action apply → merge completion command는 `SRC-24` 해결 전 production-authoritative로 승격하지 않는다. Relationship/Character Unlock/Episode semantics가 merge action에 포함되면 각각 `SRC-22`/`SRC-23`/`SRC-17` 등 해당 domain authority도 추가로 필요하다.

## 6. Database Execution Identity — DECIDED

`P0-AUTH-01`은 2026-09-02에 다음으로 결정되었다.

```text
ordinary user HTTP request
→ API verifies Member or Guest evidence
→ canonical subjects.id resolution
→ dedicated non-BYPASSRLS API execution role
→ canonical subject_id bound to the current PostgreSQL transaction
→ RLS + existing qry_*/cmd_* object authorization
```

Member resolution:

```text
verified Supabase authentication identity
→ auth.users.id
→ subjects.auth_user_id
→ active/deletion_pending member subjects.id
```

Guest resolution:

```text
API-verified guest credential
→ verifier fingerprint
→ active, unconsumed guest_sessions row
→ active guest subjects.id
```

Canonical owner는 항상 `subjects.id`다. 다음 가정은 금지한다.

```text
auth.uid() == subject_id
client-supplied subject_id == current owner
```

Ordinary user execution baseline:

```text
dedicated NOLOGIN/NOBYPASSRLS API execution role contract
+ transaction-scoped trusted canonical subject context
```

실제 network/login principal과 credential 배포는 deployment configuration이 소유한다. Product migration은 login secret을 생성하지 않는다. 실행 principal이 execution role membership을 가질 경우 명시적으로 해당 role로 진입한 transaction 안에서만 user-owned query/command를 실행한다.

System/worker/admin/lifecycle operation은 ordinary user execution과 별도 privileged identity를 사용한다.

금지 baseline:

```text
service_role/BYPASSRLS 하나로 모든 user-owned CRUD
+ application WHERE subject_id만 믿음
```

P0 decision의 rationale/migration/change policy는 `docs/P0_DECISION_REGISTER.md`의 `P0-AUTH-01` record가 authority다.

## 7. Subject Resolution Function Contract

API가 raw credential을 DB에 전달하지 않는다. API verification 결과를 narrow resolver input으로 변환한다.

첫 runtime contract:

```text
begin_member_subject_context_v1(verified auth user id)
→ exactly one active/deletion_pending member subject
→ transaction-local canonical subject context

begin_guest_subject_context_v1(verified guest verifier fingerprint)
→ exactly one active guest with active/unconsumed session
→ transaction-local canonical subject context

current_myeongha_subject_id()
→ current transaction의 canonical subject_id 또는 NULL

assert_myeongha_subject_context_v1(p_subject_id)
→ p_subject_id와 trusted transaction subject가 동일하지 않으면 fail-closed
```

Resolver는 client-supplied `subject_id`를 입력으로 받지 않는다. Member resolver의 UUID는 API가 검증한 authentication identity이며 product owner ID가 아니다. Guest resolver는 raw bearer token이 아니라 API가 검증/정규화한 verifier fingerprint만 소비한다.

Resolver DB function은 direct public invocation을 허용하지 않고, ordinary API execution role에 필요한 `EXECUTE`만 부여한다. Resolver가 필요한 identity mapping table을 읽기 위해 broad table `SELECT`를 API role에 열지 않는다.

Transaction-local context는 connection pool에서 request 간 잔존해서는 안 된다. Production adapter는 다음 경계를 사용한다.

```text
BEGIN
→ enter API execution role
→ resolve + bind canonical subject
→ qry_*/cmd_*
→ COMMIT / ROLLBACK
→ context 소멸
```

## 7.1 Web / Mobile Session Transport Security

구체 token transport는 client implementation에 따라 달라질 수 있지만 다음은 필수다.

- browser cookie로 credential을 보내는 mutating route는 CSRF/Origin/SameSite 전략을 명시하고 검증
- browser-readable token을 사용할 경우 XSS 노출 위험을 security model에 포함
- mobile credential은 OS secure storage 사용
- logout/revocation 이후 old credential reuse 차단
- CORS는 허용 origin을 명시하며 wildcard credential origin 금지
- auth/guest bearer token을 URL/query/log/analytics에 기록 금지

Client가 보낸 `subject_id` header/body는 identity proof가 아니다.

## 8. RLS Baseline

- user-owned table: RLS/default deny
- normal current path: `row.subject_id = trusted current subject`
- user-facing query/command의 explicit `p_subject_id`는 transaction subject와 parity 검증
- merged guest history: generic current policy에 union하지 않음
- merged lineage read: dedicated view/command with direct one-hop lineage validation
- merged lineage write: deny except controlled security/lifecycle service command whose semantics are independently source-approved
- service-only ledger/projection tables: client policy 없음
- API execution role에는 concrete vertical slice가 요구하는 최소 table column/function privilege만 부여

RLS rollout은 한 번에 59개 table을 열지 않는다. 실제 Browser/API caller가 연결되는 vertical slice마다 해당 table의 policy/grant/negative test를 함께 활성화한다.

첫 activated DB slice:

```text
subjects
profiles
qry_subject_profile_current_v1
```

이 slice는 `/api/me`의 PostgreSQL authority 기반이며 HTTP identity verification/adapter가 아직 연결되지 않은 동안 production user-data route 활성화를 의미하지 않는다.

`SRC-24` 해결 전 merge executor를 privileged lifecycle path라는 이유만으로 허용하지 않는다. Privilege boundary와 merge policy authority는 별개다.

## 9. Object-Level Authorization

ID를 아는 것은 권한이 아니다.

```text
A → B thread/birth/memory/reading/target-person/device
→ DENY
```

Authorization은 route lookup 이전/이후 모두 resource ownership을 검증하며 error surface가 다른 user 존재를 불필요하게 드러내지 않는다.

## 10. Service-Only Writes

client direct write 금지:

- relationship/world/unlock/progress ledger/projection
- reading/ref/grounding provenance
- commerce receipt/provider/grant/event/entitlement
- AI logs/outbox
- deletion execution
- content release activation
- existing-member merge execution state/action mutation

Service-only라고 해서 source gap이 해소되는 것은 아니다. Existing-member merge action mutation은 `SRC-24` 해결 범위에서만 가능하다.

## 11. Memory / Life Fact Privacy

캐릭터 context read는 `record_access_grants` active explicit grant만 허용.

`현재 대리자들에게 공유` = 승인 당시 eligible character set snapshot. future character auto grant 금지.

`private` = durable record는 존재할 수 있으나 character grant 0.

`session-only` = durable Life Fact/Memory row 생성 없음.

## 12. Public Share

```text
raw public token
→ API fingerprint verify
→ active/unexpired artifact
→ minimized immutable share snapshot
```

Public token은 private Reading endpoint credential이 아니다. 기본 share에 full birth/chat/memory/target internal ID 금지.

## 13. Notification Privacy

default preview는 sensitive content를 포함하지 않는 mode. full preview도 server policy와 user opt-in 범위 안에서만 생성.

## 14. Logging / Analytics

일반 analytics/log 금지:

- raw birth date/time
- full transcript
- auth/service token
- raw receipt/provider account ID
- provider Authorization/OAuth/bearer credential
- raw receipt/purchase token
- full provider request/response or full `verified_payload_jsonb`
- card PAN/CVV/PIN/raw PCI authentication material

Stable ref/versioned HMAC fingerprint 우선. hash는 anonymization 주장이 아니다.

Commerce provider-evidence minimization은 `P0-PR-01B`로 DECIDED다. Commerce opaque equality/dedupe evidence는 provider lookup에 raw value가 필요하지 않을 경우 Commerce 전용 versioned keyed HMAC fingerprint를 사용하고, `verified_payload_jsonb`는 positive allowlist + bounded schema만 허용한다. Exact contract는 `docs/COMMERCE_EVIDENCE_DATA_MINIMIZATION_DECISION_V1.md`가 authority다.

## 15. Deletion Lifecycle

Account deletion 시작 즉시:

```text
block new AI/Saju/product commands
revoke share artifacts
revoke device installations
cancel scheduled notifications
terminate/limit active sessions
```

Deletion graph:

- canonical subject
- direct merged guest lineage
- birth/target/life fact/memory/conversation/reading personalization artifacts
- AI raw trace가 별도 restricted store에 있으면 동일 deletion/retention policy 대상

법적 commerce retention은 product personalization과 분리. 실제 legal/accounting/backup retention 기간과 account-deletion Commerce tombstone/pseudonymization/destructive schedule은 `OPEN-P0: P0-PR-01`이다.

`P0-PR-01B`는 Commerce evidence의 **저장 최소화/security shape**만 결정한다. 이를 legal retention 기간으로 해석하지 않는다. 반대로 legal retention 미결정을 이유로 raw provider payload 전체를 보존하지도 않는다.

`P0-PR-01` 결정 전 Commerce history cascade-delete/destructive scheduler, indefinite-retention default, raw provider payload archival을 활성화하지 않는다.

Standalone Birth/Target privacy deletion과 historical Reading provenance 충돌은 `SRC-06`이 authority다.

Final account erase 순서는 `subjects` CHECK와 충돌하지 않게 canonical/merged-lineage destructive phase를 완료한 뒤 member subject를 `deleted` 상태로 전환하고 auth mapping 제거를 수행한다. `deletion_pending` 상태에서 `auth_user_id`를 먼저 NULL로 만들지 않는다. Account delete는 전체 dependency graph를 함께 지울 수 있지만, 개별 Birth/Target delete를 단순 archive로 가장하지 않는다.

Conversation-only delete는 confirmed Life Fact/Memory를 보존해야 하므로, 해당 source FK가 필요한 동안 message/turn identity tombstone을 보존하고 원문을 redaction하는 방식이 baseline이다. 삭제된 원문은 UI/AI context에서 재노출 금지.

Canonical member가 deletion lifecycle에 들어간 동안 새로운 Guest merge를 시작/재개/완료할 수 있는 exact rule은 `SRC-24` 해결 전 임의 확정하지 않는다.

## 16. Admin / Content Security

`ADMIN_CONTENT`는 일반 member auth와 별도 authorization scope. Content bundle register/release activation은 actor/audit provenance 필수. Canon authoring은 Git review가 authority.

## 17. Negative Test Matrix

- own current row → allow expected operation
- different subject → deny
- missing transaction subject context → deny
- context/explicit subject mismatch → deny
- browser/client-supplied subject ID → never accepted as resolver evidence
- API role without trusted resolver context → RLS default deny
- API role auth mapping column read → deny
- API role direct Subject mutation → deny
- Guest direct public DB access → deny
- invalid/expired/consumed Guest verifier → resolver deny
- merged guest generic endpoint → deny
- merged history dedicated endpoint → read-only allow
- merged history write → deny
- merge-job current read → canonical member owner only
- raw historical ledger reparent → deny
- full existing-member conflict/resolution/action executor → excluded from production PASS until `SRC-24`
- service-only client write → deny
- revoked grant → context exclusion
- future character → old grant deny
- share token → minimized share only
- deletion_pending subject → new AI/Saju/purchase deny
- deletion_pending member merge lifecycle → no source-invented allow/deny claim before `SRC-24`
- transaction-local subject context → cleared after transaction boundary
- selected P0-AUTH-01 RLS negative tests PASS before production user-data activation
- raw provider secret/bearer/receipt fixture → business persistence/log/trace leak 없음
- unknown/oversized provider verified-payload field → drop/reject
- same Commerce opaque evidence replay → same versioned keyed HMAC fingerprint
- missing/weak Commerce fingerprint secret → evidence persistence fail-closed
- parent `P0-PR-01` OPEN 상태 → destructive Commerce retention/deletion scheduler 비활성
