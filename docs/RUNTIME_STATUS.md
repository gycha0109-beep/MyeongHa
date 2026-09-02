# MyeongHa Runtime Status

> This document describes executable production/runtime state separately from repository-local build, test, and deployment-configuration checks.

## Current status

| Area | State | Notes |
|---|---|---|
| Static Web | DEPLOYED | Vercel builds the static `public/` output through `npm run build:web`. |
| Executable `/api` runtime | ACTIVE — INFRASTRUCTURE ONLY | `GET /api/health` is deployed as a root Vercel Function and has been remotely verified on the canonical production host. This does not imply user-data or DB runtime availability. |
| Browser → API | USER-DATA ROUTES NOT ACTIVE | `GET /api/me` still returns production 404. Member and Guest request verification now exist, but the dedicated DB login principal and Vercel user-data bindings are not provisioned. |
| Canonical Subject Resolution | DB + APPLICATION + MEMBER/GUEST REQUEST VERIFIERS IMPLEMENTED / ROUTE NOT ACTIVE | P0-AUTH-01 defines trusted Member/Guest evidence → canonical `subjects.id`; Member JWT verification, Guest HMAC fingerprinting, and production composition roots are implemented. |
| API → PostgreSQL execution identity | DECIDED / TRANSACTION + NODE PG POOL ADAPTER IMPLEMENTED / LOGIN PRINCIPAL MISSING | `P0-AUTH-01` selects a dedicated non-BYPASSRLS execution role + transaction-scoped canonical `subject_id`. Live production inspection confirms the governed execution role/functions exist, but a dedicated non-privileged network login principal does not. |
| Production user-data config | CONTRACT + VERIFIERS DEFINED / NOT PROVISIONED | `production-user-data-runtime-config.ts` and `PRODUCTION_USER_DATA_RUNTIME_CONFIG_V1.md` define fail-closed environment requirements and redacted diagnostics. This does not prove Vercel settings are bound. |
| Character compatibility verdict | BLOCKED | `SRC-15` remains unresolved. |
| Subject-specific content rollout | BLOCKED | `SRC-16` remains unresolved. |
| Character HTTP activation | HOLD | Do not claim subject-specific activation while SRC-15/SRC-16 are unresolved. |
| Chat send/runtime activation | HOLD / FAIL-CLOSED | Do not invent compatibility or rollout fallback semantics. |
| Supabase production migration deployment | LIVE AUTH SLICE CONFIRMED / DEPLOYMENT STILL SEPARATE | Read-only inspection confirms the first execution-role and subject-context slice in production. `.github/workflows/supabase-production.yml` remains the governed migration deployment path. |

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

Read-only inspection against project `cnsfpcdiyofqvhpcegfc` confirmed:

```text
myeongha_api_executor
→ rolcanlogin = false
→ rolbypassrls = false

present functions:
→ begin_member_subject_context_v1(p_verified_auth_user_id uuid)
→ begin_guest_subject_context_v1(p_verified_token_hash text)
→ current_myeongha_subject_id()
→ qry_subject_profile_current_v1(p_subject_id uuid)
```

Role-membership inspection found only:

```text
postgres
→ LOGIN
→ BYPASSRLS
→ member of myeongha_api_executor
```

`postgres` is explicitly forbidden as the ordinary user runtime principal. Therefore the DB authority slice exists, but the production network-login gate is not satisfied.

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

Remaining production activation gates:

- provision a dedicated non-privileged PostgreSQL network login principal authorized to enter `myeongha_api_executor`.
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
