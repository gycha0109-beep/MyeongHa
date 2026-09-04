# MyeongHa Platform Integrity — Post-0880 Production Evidence

> Repository: `gycha0109-beep/MyeongHa`  
> Production project: `cnsfpcdiyofqvhpcegfc`  
> Current verified production application: `8f008002690748583beedfd82da0337731f1f41b`  
> Date: 2026-09-04  
> Status: **APPLICATION API-ROLE ACL REMEDIATED / DATA API CONTAINED / SUPABASE_ADMIN DEFAULT-ACL FOLLOW-UP OPEN**

---

## 1. Purpose and supersession

This document records the production result of the Platform Integrity Data API / database ACL remediation performed after `PLATFORM_INTEGRITY_PRODUCTION_AUDIT_2026-09-04.md` confirmed the original exposure.

For implementation-state facts covered here, this document supersedes the pre-remediation status in that earlier audit and the stale production-baseline language on `docs/platform-integrity-v1-final-review`.

It does **not** redefine product semantics and does **not** declare the whole platform Migration-Ready, Production-Safe, or Integrity-Complete.

---

## 2. Change lineage

### Initial permanent hardening

PR `#404` implemented migration:

```text
0880_api_role_acl_default_privilege_hardening.sql
```

Exact-head CI:

```text
cd6ddeb1aa2f4c560f11fc52f3cf8159f5615661
21 / 21 workflows SUCCESS
```

Squash merge:

```text
85b7701491f01425866e74b4095cf2d735120fb3
```

### Production-only owner boundary found

Supabase Production run:

```text
33836446616
```

The first production `db push` safely failed with SQLSTATE `42501` because a schema-wide function `REVOKE` attempted to mutate `cmd_promote_guest_runtime_v1`, which is deliberately owned by the narrow role `myeongha_guest_promotion_owner`.

The failed `0880` was not recorded in remote migration history and the failed statement rolled back.

### Owner-aware forward fix

PR `#405` changed `0880` so that:

```text
postgres/current_user-owned public functions
→ ACL mutation allowed

myeongha_* narrow-owner functions
→ no mutation by postgres migration principal
→ effective ACL verified instead

myeongha_api_executor
→ required explicit runtime EXECUTE retained
```

It also added a static CI guard forbidding schema-wide public-function REVOKE from returning.

Exact-head CI:

```text
fdcded4e1e8a89110b30edb26f14a685de7dabf7
21 / 21 workflows SUCCESS
CI / db-authority-core SUCCESS
Web Browser Render Smoke SUCCESS
```

Squash merge / production application baseline:

```text
e9ed33ff1eeefde45069610f029556cf045d41c5
```

---

## 3. Production migration deployment

Supabase Production run:

```text
33836944615
```

Result:

```text
Preview pending production migrations        SUCCESS
Apply pending production migrations          SUCCESS
Verify production migration state            SUCCESS
```

Therefore migration `0880` is applied and present in production migration history.

Vercel production for commit `e9ed33ff1eeefde45069610f029556cf045d41c5` was independently observed as `READY`.

---

## 4. Fresh post-0880 read-only evidence

The post-deploy audit re-ran GitHub Actions run `33826080810` using the exact same immutable workflow/audit implementation as current `main`.

Verified blob identities before re-run:

```text
.github/workflows/production-platform-integrity-read-audit.yml
b65bbbf564d18d94dbe976c19b5c941d8dd455dc

scripts/run-production-platform-integrity-read-audit.sh
a57e40d94350465e04f8df6935d6467052018056

scripts/run-production-platform-integrity-data-api-surface-audit.sh
67447088f84ac62ebe51c36900339cfd6d657dee
```

Fresh artifact:

```text
artifact id
9923667044

artifact digest
sha256:f0e88b9349f915953fe837f9aefc095cbb38575321117678d568f8f2dc9abeed

captured_at_utc
2026-09-04T04:32:45Z

audit_mode
explicit_read_only_transactions
```

Every artifact file passed its internal `SHA256SUMS` verification.

No production row mutation was performed by this audit.

---

## 5. Fresh production catalog result

### Migration / schema summary

```text
migration_max_version                 0880
public_table_count                    59
public_rls_enabled_table_count         5
public_force_rls_table_count           0
public_policy_count                   14
public_function_count                118
```

`PI-P0-01` exact production catalog recovery remains **CLOSED**.

The earlier architecture baseline that described production as only documented through `0820` or repository inventory only through `0860` is stale for current implementation-state decisions.

---

## 6. Data API containment

Fresh Management API snapshot:

```json
{
  "db_schema": "",
  "db_extra_search_path": "public, extensions",
  "max_rows": 1000
}
```

Production PostgREST therefore remains normalized to the disabled Data API state:

```text
db_schema = ""
```

The Data API was **not** re-enabled by migration `0880` or subsequent verification.

### Verdict

```text
Direct external Data API exposure
→ CONTAINED
```

---

## 7. Existing public object ACL remediation

Fresh `information_schema.table_privileges` evidence:

```text
anon public table privilege rows             0
authenticated public table privilege rows    0
```

The previous state was 413 rows per role (`59 tables × 7 privileges`).

Fresh routine privilege evidence:

```text
anon public routine EXECUTE rows             0
authenticated public routine EXECUTE rows    0
```

Fresh schema privilege evidence:

```text
anon               public USAGE=true CREATE=false
authenticated      public USAGE=true CREATE=false
```

Schema `USAGE` is retained for platform compatibility; object authority and schema `CREATE` are not.

### service_role boundary

`service_role` was intentionally not included in this P0 revoke.

Fresh evidence still shows broad `service_role` object privileges. `service_role` is a privileged Supabase BYPASSRLS role and requires a separately scoped authority review. This document does not reinterpret it as an ordinary application principal.

---

## 8. Function authority preservation

The production owner-specific failure proved that function ownership is part of the security boundary.

Current intended pattern:

```text
postgres-owned application functions
→ migration-controlled ACL

narrow myeongha_* owner functions
→ owner-transfer migration controls ACL
→ postgres migration verifies but does not mutate them

myeongha_api_executor
→ explicit required runtime EXECUTE only
```

Fresh catalog examples confirm the narrow runtime-owner functions remain closed to `anon`, `authenticated`, and `PUBLIC`, while the executor retains its intended explicit grant.

This prevents ACL hardening itself from becoming a privilege-escalation or production-owner violation.

---

## 9. postgres default ACL recurrence prevention

Fresh `pg_default_acl` evidence for `postgres` shows:

```text
global functions
→ {postgres=X/postgres}
→ PUBLIC EXECUTE removed

public tables
→ postgres + service_role only
→ no anon
→ no authenticated

public sequences
→ postgres + service_role only
→ no anon
→ no authenticated

public functions
→ postgres + service_role only
→ no anon
→ no authenticated
```

The PostgreSQL global function default matters because per-schema default privileges are additive and cannot subtract the built-in global `PUBLIC EXECUTE` grant.

### Verified regression behavior

CI now creates transaction-scoped future objects and asserts:

```text
future postgres-owned public table
→ anon/authenticated no privilege

future postgres-owned public sequence
→ anon/authenticated no privilege

future postgres-owned public function
→ anon/authenticated no EXECUTE
```

Therefore recurrence through the ordinary repository migration owner (`postgres`) is **REMEDIATED**.

---

## 10. Remaining `supabase_admin` default-ACL surface

Fresh production evidence still shows `supabase_admin` default ACL entries in schema `public` that automatically grant `anon` and `authenticated` privileges on future objects created by `supabase_admin`.

Captured shape:

```text
supabase_admin / public / tables
→ anon + authenticated + service_role broad table privileges

supabase_admin / public / sequences
→ anon + authenticated + service_role sequence privileges

supabase_admin / public / functions
→ anon + authenticated + service_role EXECUTE
```

Current public object ownership was also checked:

```text
public table-like objects owned by supabase_admin    0
public functions owned by supabase_admin             0
```

So this residual default ACL does **not** describe a current exposed MyeongHa object. It is a future-object recurrence path if `supabase_admin` later creates an object in `public`.

### Authority rule

Migration `0880` intentionally does not execute:

```text
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin ...
```

because production evidence has not yet established that the repository migration principal may safely and durably alter Supabase-managed `supabase_admin` defaults.

Do not mutate this surface until one of the following is proven:

```text
A. supported Supabase platform setting / administrative procedure
OR
B. production-authorized principal and rollback semantics for supabase_admin default ACL
```

### Verdict

```text
supabase_admin public default-ACL recurrence path
→ OPEN-PLATFORM
```

---

## 11. PI-P0-04 current status

The umbrella issue must not be collapsed into a single overclaim.

```text
External Data API surface
→ CONTAINED

Existing anon/authenticated public table ACL
→ REMEDIATED / production verified zero

Existing anon/authenticated application routine EXECUTE
→ REMEDIATED / production verified zero

postgres-owned future public default ACL
→ REMEDIATED / production verified fail-closed for anon/authenticated

narrow MyeongHa runtime-owner function ACL
→ PRESERVED / production verified

supabase_admin future public default ACL
→ OPEN-PLATFORM
```

Therefore the correct umbrella classification is:

```text
PI-P0-04
→ APPLICATION PATH REMEDIATED
→ EXTERNAL SURFACE CONTAINED
→ PLATFORM DEFAULT-ACL FOLLOW-UP OPEN
```

Do **not** use either of these blanket statements:

```text
"PI-P0-04 completely closed"
"remaining authorization surfaces are closed"
```

until the `supabase_admin` recurrence path is explicitly resolved or proven impossible for MyeongHa production.

---

## 12. Runtime smoke evidence boundary

The canonical Guest runtime smoke contract is:

```text
POST /api/session/bootstrap
→ HTTP 200
→ API contract v0.9
→ Guest subject/session
→ Cache-Control: no-store

returned Guest bearer
→ GET /api/me
→ HTTP 200
→ same active canonical Guest subject
→ Cache-Control: no-store
```

A fresh post-0880 positive smoke was re-established through the governed Supabase Production workflow using a temporary, one-time activation marker.

### One-time production smoke

PR `#411` temporarily enabled the existing canonical Guest verifier only when the merge commit message contained:

```text
[pi-guest-smoke-once]
```

Marker merge:

```text
2395527528c09b75d512a1b43f76d018f5758d0b
```

Supabase Production run:

```text
33842794502
```

Observed log contract:

```text
guestBootstrap=200
apiMe=200 canonicalGuest
cacheControl=no-store

post-transition:
apiMe=200 same canonicalGuest
cacheControl=no-store
```

The run did not print the Guest bearer or subject UUID.

The one-time smoke validated the canonical production Guest bootstrap and `/api/me` path after the ACL remediation. It was intentionally separated from the permanent post-deploy read-only integrity verifier.

### Deployment boundary discovered during smoke closeout

The Vercel deployment for merge `2395527528c09b75d512a1b43f76d018f5758d0b` itself was not READY because an unrelated test file had been placed under `api/`, taking the Hobby deployment from 12 to 13 Serverless Functions.

Vercel reported:

```text
exceeded_serverless_functions_per_deployment
```

PR `#412` moved the Birth Profile adapter test out of the Vercel function root and added a 12-function deployment budget guard.

Verified production after `#412`:

```text
commit
afb5724e575fcde3fec98d0d33ee7815c1185dc3

Vercel deployment
dpl_H3HLeWQNgryY1xA8YnbsUvRUtF1a

state
READY

lambdaRuntimeStats
nodejs=12
```

No Guest bootstrap or `/api/me` runtime implementation was changed by `#412`.

### One-time path cleanup and final production verification

PR `#413` removed the temporary one-time Guest smoke step after evidence capture.

Cleanup merge / current verified production application:

```text
8f008002690748583beedfd82da0337731f1f41b
```

The merged workflow no longer contains the one-time Guest smoke step. Permanent migration parity, read-only post-deploy integrity verification, and artifact upload remain enabled.

Merged-main Supabase Production run:

```text
33848781287
→ SUCCESS
```

Verified production state in that run:

```text
migration Local/Remote through 0880             MATCH
supabase db push --dry-run                       Remote database is up to date
supabase db push                                 Remote database is up to date
production catalog snapshot                      checksum OK
Data API/default-ACL surface snapshot            checksum OK
ACL drift gate                                   PASS
post-deploy read-only verification               PASS
```

Post-deploy evidence artifact:

```text
artifact id
9927560359

artifact digest
sha256:25a19ae342f7773270cbde3eb962e89027c8446c8e8255fc63aaec2a63ea57dd
```

Current Vercel production:

```text
deployment
dpl_8NdhPRnBWP2hffAQMbytJFac4Lac

commit
8f008002690748583beedfd82da0337731f1f41b

state
READY

lambdaRuntimeStats
nodejs=12
```

Merged-main CI also passed:

```text
CI run 33848781385
→ foundation SUCCESS
→ db-authority-core 63/63 SUCCESS

Web Browser Render Smoke run 33848781336
→ Hall SUCCESS
→ Auth SUCCESS
→ My SUCCESS
→ My Birth Profile SUCCESS
→ Conversation SUCCESS
```

Therefore:

```text
fresh post-0880 Guest positive smoke
→ RE-ESTABLISHED / PASS

one-time smoke activation path
→ REMOVED

current Vercel production
→ READY / 12 functions

current post-deploy platform-integrity read-only gate
→ PASS
```

This closes the runtime-smoke evidence gap recorded by the earlier revision of this document. It does **not** convert the broader platform into a blanket `Production-Safe` state because the `supabase_admin` default-ACL recurrence path and the unrelated P0/governance blockers below remain open.

---

## 13. Other Platform Integrity blockers unchanged

The ACL remediation does not close unrelated product/platform blockers.

```text
PI-P0-01 catalog recovery
→ CLOSED

PI-P0-02 outbox
→ publisher enqueue coverage PARTIAL
→ claim / expired lease reclaim IMPLEMENTED
→ success completion IMPLEMENTED
→ failed-event lifecycle/retry MISSING / SRC-30 BLOCKED

PI-P0-03 deletion finalization
→ OPEN
→ P0-PR-01 + SRC-06

PI-P0-04 Data API / API-role ACL
→ application path remediated
→ external surface contained
→ supabase_admin default-ACL follow-up OPEN

PI-GOV-01
→ OPEN
→ main branch protection disabled
→ repository rulesets empty
```

Product P0 blockers remain outside this remediation:

```text
P0-CM-01
P0-AI-01
P0-AGE-01
P0-PR-01
```

Relevant source blockers also remain open where previously recorded, including `SRC-05`, `SRC-06`, `SRC-07`, `SRC-15`, `SRC-16`, `SRC-17`, `SRC-18`, `SRC-21`, `SRC-22`, `SRC-23`, `SRC-24`, `SRC-30`, and `SRC-33`.

---

## 14. Readiness verdict

```text
0880 production deployment
→ PASS

fresh read-only artifact integrity
→ PASS

migration max 0880
→ PASS

Data API remains disabled
→ PASS

anon/authenticated existing public table authority
→ CLOSED

anon/authenticated existing application function authority
→ CLOSED

postgres-owned default ACL recurrence
→ CLOSED for anon/authenticated

supabase_admin default ACL recurrence
→ OPEN-PLATFORM

fresh post-0880 Guest positive smoke
→ PASS / governed production evidence

one-time Guest smoke activation cleanup
→ PASS / removed after evidence capture

current Vercel production 8f008002690748583beedfd82da0337731f1f41b
→ READY / 12 Serverless Functions

merged-main CI and browser smoke
→ PASS

Migration-Ready (blanket)
→ NO

Production-Safe (blanket)
→ NO

Integrity-Complete
→ NO
```

The correct current statement is narrower:

> The ordinary MyeongHa application database path has had its `anon` / `authenticated` latent object authority removed in production, the external Data API remains contained, recurrence through `postgres` defaults is blocked, and the canonical Guest positive runtime contract has been re-established under governed production verification. The temporary smoke activation path has been removed, current Vercel production is READY at 12 functions, and the permanent post-deploy read-only integrity gate passes. A Supabase-managed `supabase_admin` future-object default-ACL path remains open for separate platform-authority resolution, and unrelated Platform Integrity/product/governance blockers remain open.
