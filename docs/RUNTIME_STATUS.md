# MyeongHa Runtime Status

> This document describes executable production/runtime state separately from repository-local build, test, and deployment-configuration checks.

## Current status

| Area | State | Notes |
|---|---|---|
| Static Web | DEPLOYED | Vercel builds the static `public/` output through `npm run build:web`. |
| Executable `/api` runtime | ACTIVE — INFRASTRUCTURE ONLY | `GET /api/health` is deployed as a root Vercel Function and has been remotely verified on the canonical production host. This does not imply user-data or DB runtime availability. |
| Browser → API | USER-DATA ROUTES NOT ACTIVE | `GET /api/me` still returns production 404. Member/Guest request verification and the dedicated DB login principal now exist, but the runtime password and Vercel user-data bindings are not provisioned. |
| Canonical Subject Resolution | DB + APPLICATION + MEMBER/GUEST REQUEST VERIFIERS IMPLEMENTED / ROUTE NOT ACTIVE | P0-AUTH-01 defines trusted Member/Guest evidence → canonical `subjects.id`; Member JWT verification, Guest HMAC fingerprinting, and production composition roots are implemented. |
| API → PostgreSQL execution identity | LIVE PRINCIPAL PROVISIONED / RUNTIME CREDENTIAL UNBOUND | `myeongha_runtime` now exists in production as LOGIN / NOINHERIT / NOBYPASSRLS / non-privileged and is a member of the NOLOGIN `myeongha_api_executor` execution role. It was created by migration 0800 with `PASSWORD NULL`; a usable runtime credential is intentionally not provisioned yet. |
| Production user-data config | CONTRACT + VERIFIERS + LOGIN PRINCIPAL READY / VERCEL BINDINGS NOT PROVISIONED | `production-user-data-runtime-config.ts` defines fail-closed environment requirements. The database role exists, but Vercel settings and the runtime password are not bound. |
| Character compatibility verdict | BLOCKED | `SRC-15` remains unresolved. |
| Subject-specific content rollout | BLOCKED | `SRC-16` remains unresolved. |
| Character HTTP activation | HOLD | Do not claim subject-specific activation while SRC-15/SRC-16 are unresolved. |
| Chat send/runtime activation | HOLD / FAIL-CLOSED | Do not invent compatibility or rollout fallback semantics. |
| Supabase production migration deployment | LIVE THROUGH 0800 | `Supabase Production #7` applied and verified migration `0800_production_api_login_principal` against project `cnsfpcdiyofqvhpcegfc`. `.github/workflows/supabase-production.yml` remains the governed migration deployment path. |

## Verification semantics

`npm run check` validates repository-local typechecking, tests, builds, static web output, and deployment-configuration contracts. It does **not** by itself prove that a remote Vercel user-data runtime exists or that its environment contains the required credentials.

`npm run verify:production:api` performs a networked remote check against the canonical production health endpoint by default. It is intentionally excluded from `npm run check` so repository CI does not depend on production availability. `MYEONGHA_PRODUCTION_ORIGIN` may override the origin for an explicit remote target.

Remote production state requires separate production checks. The executable infrastructure evidence remains:

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

## Production Request identity verification

The Shared API V1 classifier uses one bearer transport:

```text
Authorization: Bearer <credential>
```

Classification is deliberately disjoint:

```text
JWT-shaped bearer
→ existing Supabase Member verifier from PR #311
→ GET /auth/v1/user
→ verified auth.users.id

supported non-JWT opaque bearer
→ local HMAC-SHA-256 fingerprint
→ Guest subject resolver
```

A rejected JWT-shaped Member credential never falls through to Guest identity. Guest verification does not call Supabase Auth and only the fingerprint, never the raw Guest token, is eligible to enter PostgreSQL.

The same Guest fingerprint implementation is exposed through `GuestBootstrapTokenFingerprintPortV1` so bootstrap storage and later request verification use an identical token-hash contract.

Guest TTL remains outside this slice under `P0-PR-01`.

## Live production DB evidence — 2026-09-02

Read-only inspection against project `cnsfpcdiyofqvhpcegfc` confirms:

```text
myeongha_api_executor
→ rolcanlogin = false
→ rolbypassrls = false

myeongha_runtime
→ rolcanlogin = true
→ rolsuper = false
→ rolcreatedb = false
→ rolcreaterole = false
→ rolinherit = false
→ rolreplication = false
→ rolbypassrls = false
→ managed marker = myeongha:production-api-login-principal:v1
→ member of myeongha_api_executor = true

migration history
→ 0800 production_api_login_principal

present functions
→ begin_member_subject_context_v1(p_verified_auth_user_id uuid)
→ begin_guest_subject_context_v1(p_verified_token_hash text)
→ current_myeongha_subject_id()
→ qry_subject_profile_current_v1(p_subject_id uuid)
```

Current execution-role membership is:

```text
myeongha_runtime
→ LOGIN
→ NOBYPASSRLS
→ member of myeongha_api_executor

postgres
→ LOGIN
→ BYPASSRLS
→ member of myeongha_api_executor
```

`postgres` remains explicitly forbidden as the ordinary user runtime principal. `myeongha_runtime` is now the governed network-login principal, but migration 0800 deliberately created it with `PASSWORD NULL` so repository deployment cannot create an orphan runtime secret. Password assignment must occur only together with the Vercel secret binding that consumes it.

## Authority blockers and implementation gates

Authority blockers still open:

- `SRC-15`: client capability / asset manifest compatibility decision authority.
- `SRC-16`: subject-specific content rollout resolver authority.
- `P0-PR-01`: Guest TTL/retention remains open; the fingerprint algorithm does not decide expiry policy.

Resolved architecture decision:

- `P0-AUTH-01`: **DECIDED** — non-BYPASSRLS API execution role + transaction-scoped canonical `subject_id` context.

Completed Integration Spine foundations for the first user-data slice:

- DB Member/Guest subject-context resolver functions.
- `SubjectIdentityResolver` trusted-evidence boundary.
- transaction-scoped PostgreSQL subject execution adapter.
- concrete `node-postgres` subject pool adapter with per-checkout login-principal and execution-role-membership preflight.
- concrete Supabase Member bearer verifier using `GET /auth/v1/user`; only the verified Auth user UUID becomes Member evidence.
- concrete versioned Guest bearer HMAC fingerprint verifier shared with Guest bootstrap storage.
- production request classifier preventing Member→Guest fallback.
- source-safe `GET /api/me` application/HTTP boundary with 401/405/fail-closed tests.
- production `/api/me` composition root using the concrete request verifier and PostgreSQL pool.
- production current-subject Saju composition root owns the concrete request verifier instead of accepting caller-supplied trusted identity evidence.
- production user-data configuration parser contract with secret-redacted diagnostics.
- migration 0800 production `myeongha_runtime` login principal with managed-role marker and least-privilege executor membership.

Remaining production activation gates:

- assign a strong password to `myeongha_runtime` only in the same secret-safe operation that binds the consuming Vercel environment.
- bind `MYEONGHA_DATABASE_URL`, `MYEONGHA_DATABASE_PRINCIPAL`, `MYEONGHA_SUPABASE_URL`, `MYEONGHA_SUPABASE_API_KEY`, and `MYEONGHA_GUEST_FINGERPRINT_SECRET` in Vercel production.
- add `/api/me` production route only after those bindings are evidenced.
- add `/api/me/saju/calculation` only when the same identity/DB gate and its Saju service-origin deployment gate are evidenced.
- verify unauthenticated 401, Member own-subject, Guest own-subject when Guest issuance is active, and cross-subject denial against production-safe test identities.

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
