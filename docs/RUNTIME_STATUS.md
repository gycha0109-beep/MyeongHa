# MyeongHa Runtime Status

> This document describes executable production/runtime state separately from repository-local build, test, and deployment-configuration checks.

## Current status

| Area | State | Notes |
|---|---|---|
| Static Web | DEPLOYED | Vercel builds the static `public/` output through `npm run build:web`. |
| Executable `/api` runtime | ACTIVE — INFRASTRUCTURE ONLY | `GET /api/health` is deployed as a root Vercel Function and has been remotely verified on the canonical production host. This does not imply user-data or DB runtime availability. |
| Browser → API | USER-DATA ROUTES NOT ACTIVE | `GET /api/me` remains intentionally inactive. Production Request credential verification is implemented, but the dedicated non-privileged PostgreSQL network login principal and Vercel user-data bindings are not yet provisioned. |
| Canonical Subject Resolution | DB + APPLICATION + REQUEST VERIFIER IMPLEMENTED / ROUTE NOT ACTIVE | P0-AUTH-01 defines Member/Guest evidence → canonical `subjects.id`; production request verification now maps Member JWTs through governed Supabase Auth and opaque Guest bearer credentials to the versioned HMAC fingerprint contract. |
| API → PostgreSQL execution identity | DECIDED / TRANSACTION + NODE PG POOL ADAPTER IMPLEMENTED / LOGIN PRINCIPAL MISSING | `P0-AUTH-01` selects a dedicated non-BYPASSRLS execution role + transaction-scoped canonical `subject_id`. Live production inspection confirms `myeongha_api_executor` and the subject-context functions exist, but the only current role membership observed is privileged `postgres`; a dedicated ordinary-user login principal is still required. |
| Production user-data config | CONTRACT + VERIFIER DEFINED / NOT PROVISIONED | `production-user-data-runtime-config.ts`, `PRODUCTION_USER_DATA_RUNTIME_CONFIG_V1.md`, and `PRODUCTION_REQUEST_IDENTITY_VERIFIER_V1.md` define fail-closed runtime requirements. This does not prove that required Vercel settings exist. |
| Character compatibility verdict | BLOCKED | `SRC-15` remains unresolved. |
| Subject-specific content rollout | BLOCKED | `SRC-16` remains unresolved. |
| Character HTTP activation | HOLD | Do not claim subject-specific activation while SRC-15/SRC-16 are unresolved. |
| Chat send/runtime activation | HOLD / FAIL-CLOSED | Do not invent compatibility or rollout fallback semantics. |
| Supabase production migration deployment | LIVE CORE AUTH SLICE CONFIRMED / DEPLOYMENT STILL SEPARATE | Read-only inspection confirms the execution role and first Member/Guest subject-context functions in production. `.github/workflows/supabase-production.yml` remains the governed migration deployment path. |

## Verification semantics

`npm run check` validates repository-local typechecking, tests, builds, static web output, and deployment-configuration contracts. It does **not** by itself prove that a remote Vercel user-data runtime exists or that its environment contains the required credentials.

`npm run verify:production:api` performs a networked remote check against the canonical production health endpoint by default. It is intentionally excluded from `npm run check` so repository CI does not depend on production availability. `MYEONGHA_PRODUCTION_ORIGIN` may override the origin for an explicit remote target.

Remote production state requires separate production checks. The executable infrastructure evidence remains:

```text
GET https://myeongha.vercel.app/api/health
→ 200
→ {"status":"ok"}
```

The next protected user-data contract remains intentionally inactive in production until the login/environment gate closes.

The application/HTTP boundary already defines the target unauthenticated behavior once the production route is wired:

```text
GET /api/me
without valid member or guest identity evidence
→ 401 AUTH_REQUIRED
→ no DB connection opened
```

## Production Request identity verifier

V1 implementation:

```text
Authorization: Bearer <credential>

JWT-shaped credential
→ governed Supabase /auth/v1/user verification
→ verified auth.users.id
→ Member subject resolver

non-JWT opaque Guest bearer
→ HMAC-SHA-256 versioned fingerprint
→ Guest subject resolver
```

A rejected JWT-shaped Member credential never falls through to Guest identity. Guest verification does not require a Supabase Auth network call. The raw Guest token is never sent to PostgreSQL.

The Supabase application key for Member verification is constrained to the modern publishable key class. Secret/service-role keys are not accepted by the production runtime config.

See `docs/PRODUCTION_REQUEST_IDENTITY_VERIFIER_V1.md` for the exact contract.

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

`postgres` is explicitly forbidden as the ordinary user runtime principal. Therefore this evidence proves the DB authority slice exists but **does not** satisfy the production network-login gate.

## Authority blockers and implementation gates

Authority blockers still open:

- `SRC-15`: client capability / asset manifest compatibility decision authority.
- `SRC-16`: subject-specific content rollout resolver authority.
- `P0-PR-01`: Guest TTL/retention remains open; the request fingerprint algorithm does not decide Guest expiry policy.

Resolved architecture decision:

- `P0-AUTH-01`: **DECIDED** — non-BYPASSRLS API execution role + transaction-scoped canonical `subject_id` context.

Completed Integration Spine foundations for the first user-data slice:

- production DB Member/Guest subject-context resolver functions.
- `SubjectIdentityResolver` trusted-evidence boundary.
- transaction-scoped PostgreSQL subject execution adapter.
- concrete `node-postgres` subject pool adapter with per-checkout login-principal and execution-role-membership preflight.
- source-safe `GET /api/me` application/HTTP boundary with 401/405/fail-closed tests.
- production user-data configuration parser contract with secret-redacted diagnostics.
- concrete production Member credential verification against governed Supabase Auth.
- concrete versioned Guest bearer fingerprint verifier shared with Guest bootstrap storage contract.
- production `/api/me` composition root.
- production current-subject Saju composition root owns its identity verifier rather than accepting caller-injected trusted evidence.

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
