# MyeongHa Runtime Status

> This document describes executable production/runtime state separately from repository-local build, test, and deployment-configuration checks.

## Current status

| Area | State | Notes |
|---|---|---|
| Static Web | DEPLOYED | Vercel builds the static `public/` output through `npm run build:web`. |
| Executable `/api` runtime | ACTIVE — INFRASTRUCTURE ONLY | `GET /api/health` is deployed as a root Vercel Function and has been remotely verified on the canonical production host. This does not imply user-data or DB runtime availability. |
| Browser → API | USER-DATA ROUTES NOT ACTIVE | `GET /api/me` still returns production 404. The source-safe application/HTTP boundary and concrete Member verifier exist, but Guest verification and production DB/Vercel binding are not wired. |
| Canonical Subject Resolution | DB + APPLICATION CONTRACT + MEMBER VERIFIER IMPLEMENTED / GUEST VERIFIER NOT WIRED | P0-AUTH-01 defines Member/Guest evidence → canonical `subjects.id`; migration `0790_subject_execution_context.sql`, `SubjectIdentityResolver`, the current-subject HTTP/application boundary, and Supabase Member token verification are implemented. Guest HTTP credential verification remains pending. |
| API → PostgreSQL execution identity | DECIDED / TRANSACTION + NODE PG POOL ADAPTER IMPLEMENTED | `P0-AUTH-01` selects a dedicated non-BYPASSRLS execution role + transaction-scoped canonical `subject_id`. The first `subjects`/`profiles` RLS slice, transaction adapter, and concrete `node-postgres` pool adapter exist. A dedicated production network login principal and Vercel credential binding remain separate deployment gates. |
| Production user-data config | CONTRACT DEFINED / NOT PROVISIONED | `production-user-data-runtime-config.ts` and `PRODUCTION_USER_DATA_RUNTIME_CONFIG_V1.md` define fail-closed environment requirements and redacted diagnostics. This does not prove that Vercel settings or a DB login principal exist. |
| Character compatibility verdict | BLOCKED | `SRC-15` remains unresolved. |
| Subject-specific content rollout | BLOCKED | `SRC-16` remains unresolved. |
| Character HTTP activation | HOLD | Do not claim subject-specific activation while SRC-15/SRC-16 are unresolved. |
| Chat send/runtime activation | HOLD / FAIL-CLOSED | Do not invent compatibility or rollout fallback semantics. |
| Supabase production migration deployment | SEPARATE WORKFLOW | `.github/workflows/supabase-production.yml` performs remote migration deployment when triggered; repository migration presence or local configuration verification does not prove current remote DB state. |

## Verification semantics

`npm run check` validates repository-local typechecking, tests, builds, static web output, and deployment-configuration contracts. It does **not** by itself prove that a remote Vercel API runtime exists or that the current Supabase production schema matches this repository.

`npm run verify:production:api` performs a networked remote check against the canonical production health endpoint by default. It is intentionally excluded from `npm run check` so repository CI does not depend on production availability. `MYEONGHA_PRODUCTION_ORIGIN` may override the origin for an explicit remote target.

Remote production state requires separate production checks. The executable infrastructure evidence is:

```text
GET https://myeongha.vercel.app/api/health
→ 200
→ {"status":"ok"}
```

The next protected user-data contract remains intentionally inactive in production:

```text
GET https://myeongha.vercel.app/api/me
→ 404
```

The application/HTTP boundary already defines the target unauthenticated behavior once the production route is wired:

```text
GET /api/me
without valid member or guest identity evidence
→ 401 AUTH_REQUIRED
→ no DB connection opened
```

Production activation still requires:

```text
Supabase Member bearer verifier + pending Guest credential verifier
→ trusted evidence
→ existing SubjectIdentityResolver/application boundary
→ concrete node-postgres pool + production DB login binding
→ connection preflight: current_user + pg_has_role(..., myeongha_api_executor, MEMBER)
→ explicit DB transaction
→ SET LOCAL ROLE myeongha_api_executor
→ begin_*_subject_context_v1(...)
→ qry_subject_profile_current_v1(...)
→ remote negative/positive smoke
```

## Authority blockers and implementation gates

Authority blockers still open:

- `SRC-15`: client capability / asset manifest compatibility decision authority.
- `SRC-16`: subject-specific content rollout resolver authority.

Resolved architecture decision:

- `P0-AUTH-01`: **DECIDED** — non-BYPASSRLS API execution role + transaction-scoped canonical `subject_id` context.

Completed Integration Spine foundations for the first user-data slice:

- DB Member/Guest subject-context resolver functions.
- `SubjectIdentityResolver` trusted-evidence boundary.
- transaction-scoped PostgreSQL subject execution adapter.
- concrete `node-postgres` subject pool adapter with per-checkout login-principal and execution-role-membership preflight.
- concrete Supabase Member bearer verifier using `GET /auth/v1/user`; only the verified Auth user UUID becomes Member evidence.
- source-safe `GET /api/me` application/HTTP boundary with 401/405/fail-closed tests.
- production user-data configuration parser contract with secret-redacted diagnostics.

Remaining production activation gates:

- provision a dedicated non-privileged PostgreSQL network login principal authorized to enter `myeongha_api_executor`.
- bind `MYEONGHA_DATABASE_URL`, `MYEONGHA_DATABASE_PRINCIPAL`, `MYEONGHA_SUPABASE_URL`, `MYEONGHA_SUPABASE_API_KEY`, and `MYEONGHA_GUEST_FINGERPRINT_SECRET` in Vercel production.
- implement concrete Guest credential fingerprint verification and transport, consistently with Guest bootstrap issuance/storage.
- add `/api/me` production route.
- verify unauthenticated 401, Member own-subject, Guest own-subject, and cross-subject denial against production-safe test identities.

## Canonical identity boundary

MyeongHa user-owned resources use canonical `subject_id` ownership. Authentication evidence and canonical product ownership remain distinct concepts:

```text
authentication / guest evidence
→ trusted verification
→ canonical current subject resolution
→ transaction-scoped subject_id
→ resolvedSubjectId
→ existing API use case / AuthorityPort
```

A client-supplied `userId` or `subjectId` is not current-owner authority.
