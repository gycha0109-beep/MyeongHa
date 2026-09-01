# MyeongHa Runtime Status

> This document describes executable production/runtime state separately from repository-local build, test, and deployment-configuration checks.

## Current status

| Area | State | Notes |
|---|---|---|
| Static Web | DEPLOYED | Vercel builds the static `public/` output through `npm run build:web`. |
| Executable `/api` runtime | ACTIVE — INFRASTRUCTURE ONLY | `GET /api/health` is deployed as a root Vercel Function and has been remotely verified on the canonical production host. This does not imply user-data or DB runtime availability. |
| Browser → API | USER-DATA ROUTES NOT ACTIVE | The infrastructure API runtime exists, but web runtime clients that reference user-data `/api/*` routes are not yet backed by the production identity/evidence adapter. |
| Canonical Subject Resolution | DB CONTRACT IMPLEMENTED / HTTP NOT WIRED | P0-AUTH-01 now defines Member/Guest evidence → canonical `subjects.id`; migration `0790_subject_execution_context.sql` provides the narrow DB resolver/context contract. HTTP credential verification and application wiring remain pending. |
| API → PostgreSQL execution identity | DECIDED / FIRST DB SLICE IMPLEMENTED | `P0-AUTH-01` selects a dedicated non-BYPASSRLS API execution role + transaction-scoped canonical `subject_id`. The first `subjects`/`profiles` RLS slice exists in repository migrations; production deployment and application adapter verification are separate gates. |
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

The next protected user-data contract remains intentionally inactive:

```text
GET /api/me
without valid member or guest identity evidence
→ 401
```

`GET /api/me` is not considered active merely because the DB execution model is now decided. Production activation still requires:

```text
HTTP member/guest evidence verification
→ SubjectIdentityResolver/application boundary
→ explicit DB transaction
→ API execution role
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

Remaining Integration Spine implementation gates:

- HTTP Member evidence verification.
- HTTP Guest evidence verification/transport realization without inventing unsupported client semantics.
- application `SubjectIdentityResolver` wiring.
- concrete PostgreSQL transaction adapter.
- `/api/me` production route + 401/own-subject/cross-subject smoke.

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
