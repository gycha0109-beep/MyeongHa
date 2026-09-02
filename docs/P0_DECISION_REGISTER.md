# 명하 Production P0 Decision Register — Full Audit v0.5

> Product: **명하 (Myeongha)**  
> Pack Version: **v0.5**  
> Date: **2026-09-03**  
> Source Authority: `Usecase_re_reviewed_v2(1).md`, `Myeongha_DB_ERD_v0.6_AUTHORITY_FIRST(2).md`, `Myeonghwa_Personalized_Interpretation_Architecture_v1.3_THIRD_REVIEW(1).md`  
> Rule: 본 문서는 위 source authority를 구현 수준으로 구체화한다. source가 결정하지 않은 사항은 임의 확정하지 않고 `OPEN-P0` 또는 `CANDIDATE`로 표시한다. Production 운영을 열기 위해 별도 security/operations decision을 확정할 경우 source requirement를 좁혀야 하며, 상위 미결정 retention/legal policy를 대신 결정한 것으로 간주하지 않는다.

---

## 1. 목적

미결정 production P0를 여러 문서에 중복 작성하지 않고 이 문서에서 단일 관리한다.

## 2. Decision Register

| ID | Decision | Status | Current Options / Required Resolution |
|---|---|---|---|
| `P0-SA-01` | Saju transport | **OPEN-P0** | version-pinned package vs internal HTTP/RPC service |
| `P0-CM-01` | Commerce rail | **OPEN-P0** | Web provider / Apple IAP / Google Play Billing 및 one-off/subscription/bundle matrix |
| `P0-AI-01` | AI provider/model/fallback | **OPEN-P0** | provider, model family, fallback, grounded-response validation implementation |
| `P0-AGE-01` | Minimum age / character content policy | **OPEN-P0** | 최소 이용 연령, 미성년 허용 여부, 표현 강도/제한; content bundle policy-tag slot은 미리 두되 threshold/matrix는 미확정 |
| `P0-PR-01` | Retention / backup / legal retention | **OPEN-P0** | 제품 개인정보, AI trace, 결제/회계 증적, backup retention/deletion |
| `P0-PR-01A` | Guest bearer/session authentication TTL | **DECIDED** | 7 days / 604800 seconds for newly issued Guest credentials; does not decide expired-Guest data deletion or parent retention policy |
| `P0-AUTH-01` | API→PostgreSQL execution identity / RLS enforcement model | **DECIDED** | non-BYPASSRLS API execution role + transaction-scoped trusted canonical `subject_id` context |

## 3. 상태 규칙

```text
OPEN-P0
→ 설계는 adapter/interface/policy slot만 만든다.

DECIDED
→ 결정 근거, 결정일, 선택안, migration impact 기록.

SUPERSEDED
→ 새 decision ID를 가리킨다.
```

## 4. Decision Records

### P0-AUTH-01

```yaml
id: P0-AUTH-01
status: DECIDED
decided_at: 2026-09-02
choice: non-BYPASSRLS API execution role + transaction-scoped trusted canonical subject context
canonical_owner: subjects.id
member_resolution:
  evidence: verified Supabase authentication identity
  mapping: auth.users.id -> subjects.auth_user_id -> canonical subjects.id
  eligible_subject: member with status active or deletion_pending
guest_resolution:
  evidence: API-verified guest credential
  mapping: guest verifier fingerprint -> guest_sessions -> canonical subjects.id
  eligible_subject: active guest with active unconsumed session
ordinary_user_execution:
  role: dedicated NOBYPASSRLS API execution role
  context: canonical subject_id scoped to the current PostgreSQL transaction
authorization:
  - RLS/default-deny on activated user-owned tables
  - existing qry_*/cmd_* object-level authorization
  - explicit subject-parameter/context parity checks on activated boundaries
system_execution:
  model: separate explicitly privileged execution identity for workers/admin/lifecycle operations
forbidden:
  - auth.uid() == subject_id assumption
  - client-supplied subject_id or userId as owner authority
  - service-role/BYPASSRLS-only ordinary user CRUD baseline
  - request subject context surviving the transaction or leaking through a pooled connection
rationale:
  - subjects.id is the canonical owner for both Guest and Member resources.
  - Guest identity has no auth.users identity and is already API-verified before canonical subject resolution.
  - A single server-trusted subject execution model keeps Member and Guest authorization on the same owner axis without making auth.uid() the product owner key.
  - Existing qry_*/cmd_* contracts already accept canonical subject_id and are compatible with an API-resolved execution context.
affected_specs:
  - docs/AUTH_RLS_PRIVACY_SPEC.md
  - docs/RUNTIME_STATUS.md
  - supabase/migrations/0010_auth_owner.sql
  - supabase/migrations/0510_subject_profile_current_query.sql
migration_impact:
  - introduce a dedicated non-login NOBYPASSRLS API execution role contract
  - introduce transaction-scoped canonical subject context and narrow Member/Guest resolver functions
  - activate RLS incrementally per user-owned vertical slice rather than enabling unverified broad access in one migration
  - grant only the table columns/functions required by each activated slice
rollback_or_change_policy: execution-model changes require a new explicit decision record and migration; never silently fall back to user-JWT delegation or privileged ordinary CRUD
```

### P0-PR-01A

```yaml
id: P0-PR-01A
parent: P0-PR-01
status: DECIDED
decided_at: 2026-09-03
choice: Guest bearer/session authentication TTL = 7 days = 604800 seconds
production_binding: MYEONGHA_GUEST_SESSION_TTL_SECONDS=604800
scope:
  decides:
    - authentication lifetime for newly issued unconsumed Guest bearer credentials
  does_not_decide:
    - expired Guest subject/product-data deletion timing
    - backup retention
    - AI trace retention
    - commerce/legal/accounting retention
    - anonymization/destructive cleanup cadence
rationale:
  - primary source requires a finite Guest Session TTL and forbids indefinite Guest retention but does not define the period.
  - seven days supports short-term D1/D7 continuation without carrying a browser/mobile bearer through a D30-style long-retention window.
  - a finite seven-day bearer lifetime limits credential exposure while preserving a practical no-login resume window.
  - authentication expiry remains separable from the still-open product/privacy/legal retention policy.
security_invariants:
  - server owns issued_at/expires_at and clients cannot request or extend TTL
  - raw Guest bearer is never stored in PostgreSQL
  - guest_sessions stores only the versioned keyed fingerprint
  - expired, consumed, or claimed sessions cannot authenticate
activation:
  - bind exactly 604800 through the dedicated production Guest TTL workflow
  - expose Guest bootstrap network route only after binding evidence
  - verify issuance -> Guest /api/me own-subject success
  - keep parent P0-PR-01 OPEN
change_policy: changing Guest authentication TTL requires a new explicit decision record; environment changes must not silently lengthen it
record: docs/GUEST_SESSION_SECURITY_TTL_DECISION_V1.md
```

### Remaining open decisions

Use the following template when another P0 becomes authoritative:

```yaml
id: P0-...
status: DECIDED
decided_at: YYYY-MM-DD
choice: ...
rationale: ...
affected_specs:
  - ...
migration_impact: ...
rollback_or_change_policy: ...
```

## 5. 금지

- 각 spec에서 서로 다른 임시 결론을 확정하는 것
- provider 이름을 business/domain model key로 사용하는 것
- 미결정 retention을 전제로 destructive migration을 작성하는 것
- commerce rail 결정 전 entitlement authority를 특정 store에 종속시키는 것
- `P0-PR-01A` Guest authentication TTL을 expired Guest data deletion/backup/legal retention 기간으로 재해석하는 것
