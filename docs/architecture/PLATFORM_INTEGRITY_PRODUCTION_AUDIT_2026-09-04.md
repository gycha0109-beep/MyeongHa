# MyeongHa Platform Integrity Production Audit — 2026-09-04

> Repository: `gycha0109-beep/MyeongHa`  
> Production project: `cnsfpcdiyofqvhpcegfc`  
> Evidence run: GitHub Actions `33826080810`  
> Evidence head: `b61d105fe42d6e79fea6b43156ff838d5062bd76`  
> Artifact ID: `9920009104`  
> Artifact digest: `sha256:a68c5c5316158551bbc424e3a8331c2bc8953ab6e1e665b48eea44e5074024d6`  
> Status: **P0 AUTHORIZATION EXPOSURE CONFIRMED / NO PRODUCTION MUTATION IN THIS AUDIT**

---

## 1. Purpose

This document records production evidence recovered during the Platform Integrity architecture track. It does not redefine product semantics. It updates implementation-state facts that were previously unknown or stale.

The audit was executed with explicit read-only PostgreSQL transactions and GET-only Supabase Management API reads. The artifact's internal `SHA256SUMS` verified every captured file successfully.

---

## 2. Decision / source precedence

Current implementation-state precedence for this audit is:

1. Primary product/data authority and ERD invariants
2. Current explicit `P0_DECISION_REGISTER.md` decisions
3. Current source-gap adjudication
4. Derived implementation specs
5. Current runtime/catalog evidence

If an older derived spec says `OPEN` or `CANDIDATE` and a later explicit decision says `DECIDED`, the later explicit decision governs current implementation state, unless doing so would expand or contradict the higher product/data authority.

Known supersession examples:

| Older expression | Current authority |
|---|---|
| `SRC-04 / P0-AUTH-01 OPEN` | `P0-AUTH-01 DECIDED` |
| Guest TTL broadly unresolved under `P0-PR-01` | `P0-PR-01A = 604800s` DECIDED |
| broader retention semantics | `P0-PR-01` remains OPEN |

---

## 3. PI-P0-01 — Exact production catalog recovery

### Verdict

`PI-P0-01` is **CLOSED** by direct production evidence.

Recovered facts:

```text
repository head
→ b61d105fe42d6e79fea6b43156ff838d5062bd76

production project
→ cnsfpcdiyofqvhpcegfc

audit pooler
→ 6543 transaction pooler

audit mode
→ explicit_read_only_transactions

live migration max
→ 0860

public tables
→ 59

public RLS-enabled tables
→ 4

public FORCE RLS tables
→ 0

public policies
→ 10

public functions
→ 117
```

Repository migration inventory and production migration history both reach `0860`; the earlier documentation-only baseline of production through `0820` is superseded by this direct catalog evidence.

### Invariant

No future architecture or migration decision may treat the production catalog as unknown unless later evidence detects drift from this captured state.

---

## 4. PI-P0-04 — Supabase Data API table authorization exposure

### Verdict

`PI-P0-04` is **OPEN / CONFIRMED P0**.

This is not merely a theoretical grant residue. The Data API configuration directly exposes the affected schema.

Captured PostgREST configuration:

```json
{
  "db_schema": "public,graphql_public",
  "db_extra_search_path": "public, extensions",
  "max_rows": 1000,
  "db_pool_acquisition_timeout": 10
}
```

Captured schema privileges:

```text
anon               public USAGE=true CREATE=false
authenticated      public USAGE=true CREATE=false
service_role       public USAGE=true CREATE=false
myeongha_runtime   public USAGE=true CREATE=false
myeongha_api_executor public USAGE=true CREATE=false
```

Captured table privileges:

```text
anon
→ 59 / 59 public tables
→ SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER

authenticated
→ 59 / 59 public tables
→ SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER

service_role
→ 59 / 59 public tables
→ same broad privileges

myeongha_api_executor
→ 0 direct public-table grants

myeongha_runtime
→ 0 direct public-table grants
```

RLS coverage:

```text
RLS enabled
→ 4 / 59
→ subjects
→ profiles
→ birth_profiles
→ birth_profile_revisions

RLS disabled
→ 55 / 59
```

Therefore the following conjunction is true in production:

```text
schema exposed by PostgREST
+ API role has schema USAGE
+ API role has direct table privilege
+ table has no RLS
= Data API object/row authorization boundary is absent for that table
```

This contradicts the previous architecture assumption that non-activated user-owned surfaces are closed merely because the MyeongHa HTTP adapter does not call them.

### Affected authority categories

The 55 non-RLS tables include user records and operational authority such as:

- `guest_sessions`
- `conversation_threads`, `conversation_messages`, `chat_turns`, `chat_turn_attempts`
- `life_facts`, `memory_items`, `memory_proposals`, `record_access_grants`
- `reading_sessions`, `readings`, reading execution/provenance tables
- `relationship_events`, `user_character_states`
- entitlement and commerce tables
- notifications and delivery tables
- `outbox_events`
- deletion/merge operational tables

The audit did not read or enumerate production row contents. P0 is established from the effective exposure configuration and privileges alone.

---

## 5. Recurrence cause — default ACL

Production `pg_default_acl` confirms automatic grant recurrence.

For objects created by `postgres` in `public`:

```text
tables
→ anon/authenticated/service_role receive arwdDxtm

functions
→ anon/authenticated/service_role receive EXECUTE

sequences
→ anon/authenticated/service_role receive rwU
```

Equivalent defaults also exist for `supabase_admin` in `public`.

Thus deleting current grants alone is insufficient. Without default-ACL correction, a future migration can silently reopen the Data API surface.

### Function surface

Current evidence:

```text
public functions
→ 117

anon EXECUTE
→ 107

authenticated EXECUTE
→ 107

SECURITY DEFINER directly executable by anon/authenticated
→ 0 confirmed in this snapshot

myeongha_api_executor EXECUTE
→ narrow runtime function set only
```

The absence of directly exposed `SECURITY DEFINER` functions lowers immediate function-escalation severity but does not make 107 unintended RPC surfaces acceptable. Function EXECUTE must become opt-in for API roles.

---

## 6. Runtime dependency check

Repository exact-head code search found no application dependency on:

```text
@supabase/supabase-js createClient
/rest/v1
/graphql/v1
SUPABASE_URL
SUPABASE_ANON*
```

The production user-data runtime instead uses a direct PostgreSQL pool and verifies the governed login/execution path:

```text
myeongha_runtime
→ BEGIN
→ SET LOCAL ROLE myeongha_api_executor
→ transaction-scoped canonical subject context
→ narrow query/command authority
→ COMMIT / ROLLBACK
```

This supports a containment design that removes the public Data API without changing the intended ordinary MyeongHa user-data execution path.

Absence of a repository reference does not prove that no undocumented external consumer exists. Production change still requires an explicit smoke/rollback gate.

---

## 7. Remediation invariants

### `AUTHZ-DATAAPI-01` — Data API is opt-in, not ambient

If MyeongHa does not have an explicitly approved Data API consumer, the production Data API must be disabled or expose no product-data schema.

`public` must not be an ambient client API merely because Supabase defaults expose it.

### `AUTHZ-DATAAPI-02` — Unactivated tables are inaccessible at the database/API boundary

An unactivated table must satisfy at least one hard closure condition, independent of application routing:

```text
not in an exposed Data API schema
OR
API roles lack object privilege
OR
RLS is enabled with an approved policy set
```

"The frontend does not call it" is not an authorization control.

### `AUTHZ-DATAAPI-03` — API-role object privileges are explicit allowlists

`anon`, `authenticated`, and `service_role` must not receive blanket table/function/sequence privileges for MyeongHa product authority objects.

Every intentional API grant requires:

```text
named consumer
+ operation scope
+ RLS / function authorization boundary
+ negative test
+ revocation path
```

### `AUTHZ-DATAAPI-04` — Default ACL is fail-closed

Default privileges for roles creating objects in exposed/internal product schemas must not automatically grant Data API access.

Current `postgres` and `supabase_admin` defaults are fail-open and must be corrected.

### `AUTHZ-DATAAPI-05` — Function EXECUTE is opt-in

Public function creation must not automatically create an RPC endpoint for `PUBLIC`, `anon`, `authenticated`, or `service_role`.

### `AUTHZ-DATAAPI-06` — Ordinary MyeongHa execution remains the canonical server path

Containment must preserve:

```text
myeongha_runtime LOGIN
→ SET LOCAL ROLE myeongha_api_executor
→ canonical subject context
→ narrow ACL/RLS/function authority
```

A security fix must not replace this path with service-role/BYPASSRLS execution.

---

## 8. Negative / regression test matrix

| ID | Case | Expected result | Gate |
|---|---|---|---|
| TEST-DATAAPI-01 | unauthenticated REST request to internal product table | inaccessible | post-containment |
| TEST-DATAAPI-02 | authenticated REST request to another subject's internal table | inaccessible | post-containment |
| TEST-DATAAPI-03 | direct REST INSERT/UPDATE/DELETE to unactivated table | inaccessible | post-containment |
| TEST-DATAAPI-04 | RPC call to non-allowlisted public function as anon | inaccessible | post-containment |
| TEST-DATAAPI-05 | RPC call to non-allowlisted public function as authenticated | inaccessible | post-containment |
| TEST-DATAAPI-06 | inspect current Data API exposed schemas | `public` absent or Data API disabled | post-containment |
| TEST-DATAAPI-07 | create throwaway table under migration-owner defaults in isolated test DB | no automatic anon/auth/service_role privilege | post-default-ACL fix |
| TEST-DATAAPI-08 | create throwaway function under migration-owner defaults in isolated test DB | no automatic PUBLIC/anon/auth/service_role EXECUTE | post-default-ACL fix |
| TEST-DATAAPI-09 | production `/api/health` and `/api/me` | remain green | post-containment |
| TEST-DATAAPI-10 | authenticated Birth Profile create/read governed path | unchanged | post-containment |
| TEST-DATAAPI-11 | guest Birth Profile create/read governed path | unchanged | post-containment |
| TEST-DATAAPI-12 | current-subject Saju governed path | unchanged | post-containment |
| TEST-DATAAPI-13 | fresh read-only catalog snapshot | no broad API-role product-table grants; default ACL fail-closed | final verification |

No test may fetch arbitrary production user rows merely to demonstrate exploitability. Catalog/config evidence is sufficient to establish the defect.

---

## 9. Remediation sequence

This is a **recommended integrity-dependency sequence**, not source-authoritative product priority.

### Phase A — Immediate containment

Preferred if there is no approved Data API consumer:

```text
Disable Supabase Data API
```

Supabase's current security guidance explicitly recommends disabling the Data API when the application does not use Supabase client libraries, REST, or GraphQL data endpoints.

Fallback where Data API must remain enabled:

```text
remove public from Exposed Schemas
→ expose only a dedicated reviewed API schema
```

Do not mass-enable RLS on 55 tables as an emergency shortcut; that has a larger runtime blast radius and requires per-table policy design.

### Phase B — Recurrence prevention

Correct default privileges for all relevant migration owners, at minimum `postgres` and `supabase_admin` where applicable:

```text
revoke automatic API-role table privileges
revoke automatic API-role routine EXECUTE
revoke automatic API-role sequence privileges
revoke function EXECUTE from PUBLIC by default
```

### Phase C — Existing object ACL normalization

After consumer inventory:

```text
revoke unintended anon/authenticated/service_role privileges
→ re-grant only explicit approved Data API allowlist objects, if any
```

This phase must be migration-controlled and catalog-diffed.

### Phase D — Verification

Required evidence:

```text
exact-head CI
+ production configuration snapshot
+ production catalog snapshot
+ Data API negative smoke
+ governed HTTP positive smoke
+ default-ACL regression test
+ rollback/forward-fix statement
```

---

## 10. Rollback / recovery rule

The immediate containment rollback must restore only the previously captured Data API configuration if a documented consumer fails. It must not reintroduce broader grants as a convenience workaround.

ACL/default-ACL changes are forward-repaired through a reviewed migration. Do not use migration-history repair to conceal a failed ACL rollout.

If a positive governed API smoke fails after Data API containment, restore the Data API configuration only if evidence proves the governed API unexpectedly depends on it; otherwise repair the governed runtime path.

---

## 11. Architecture document correction delta

Until consolidated into `PLATFORM_INTEGRITY_ARCHITECTURE_V1.md`, the following stale statements from its earlier self-reviewed branch must not be used as current state:

1. `PI-P0-01` is no longer open. It is CLOSED by runs `33824671550` and `33826080810`; production migration history reaches `0860`.
2. The statement that non-activated surfaces are closed is false at the Supabase Data API boundary. `PI-P0-04` is OPEN / CONFIRMED P0.
3. Memory Proposal Resolution should be classified `SCHEMA-ONLY`, not `PARTIAL`, until an executable production resolution command is proven.
4. Outbox status must distinguish confirmed publisher enqueue (`PARTIAL` by publisher coverage), claim/reclaim (`IMPLEMENTED`), success completion (`IMPLEMENTED`), and failure/retry/dead-letter/manual replay (`MISSING / SRC-30`).
5. Entitlement wall-clock expiry is an effective access-decision invariant; `qry_entitlements_v1` is a projection read authority, not final capability authority.
6. Rate/quota/abuse wording must describe a layered production server-enforced control path, not require one centralized DB mutation authority.
7. Source-resolution ordering is a recommended integrity-dependency sequence, not source-authoritative product priority.
8. Explicit current P0 decisions supersede stale lower-level `OPEN/CANDIDATE` implementation-state text, without expanding higher-level product/data authority.

---

## 12. Self-review verdict

```text
Evidence integrity
→ PASS

Production mutation during audit
→ NONE

PI-P0-01 catalog recovery
→ CLOSED

PI-P0-04 Data API exposure
→ CONFIRMED P0 / OPEN

Root recurrence mechanism
→ CONFIRMED default ACL

Intended ordinary runtime dependency on Data API
→ NOT FOUND in repository exact-head search

Immediate containment architecture
→ DATA API DISABLE preferred
→ dedicated API schema fallback

Mass RLS activation as emergency fix
→ REJECTED due blast radius

Migration-Ready
→ NO

Production-Safe
→ NO while PI-P0-04 remains open

Integrity-Complete
→ NO
```

No production ACL, RLS, schema, row, or Supabase Data API configuration was mutated while producing this audit record.
