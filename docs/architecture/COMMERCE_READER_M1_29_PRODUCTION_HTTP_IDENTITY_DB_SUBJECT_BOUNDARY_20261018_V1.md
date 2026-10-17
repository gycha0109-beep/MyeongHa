# M1-29 — Production HTTP Guest/Member identity to canonical PostgreSQL Subject boundary

> 2026-10-18 · Watchtower-Track: commerce · stacked Draft on M1-28 #2281. No live deploy, Reader public route, Provider activity, production SQL or secret use.

## Actual backend surfaces audited

The current shared `GET /api/me` path composes:

1. `api/me.ts` dispatch into `createProductionCurrentSubjectProfileRuntimeV1`.
2. `production-request-identity-verifier.ts`: parse exactly one Bearer. JWT-shaped Bearer is **only** passed to Supabase Auth `GET /auth/v1/user` using the approved *publishable/anon* API key. Opaque 32–512 character non-JWT Guest Bearer is locally HMACed with the server-held Guest fingerprint secret.
3. `current-subject-profile-http.ts`: rejects unsupported HTTP method or missing/rejected evidence; only then calls `executePostgresSubjectTransactionV1`.
4. `postgres-subject-execution.ts`: starts a transaction, switches only to fixed `myeongha_api_executor`, passes a **parameterized** verified Supabase auth user ID to `begin_member_subject_context_v1`, or a server-created Guest HMAC to `begin_guest_subject_context_v1`. It then asserts the canonical resolved Subject and queries the scoped profile using that ID. A request-supplied role, Subject ID or custom GUC is not used for any SQL binding.
5. `node-postgres-subject-pool.ts`: production pool uses a configured dedicated login and verifies its PostgreSQL current user and API-role membership on checkout (config/TLS and identity checked by existing tests). There is no request-driven database connection string or role switch.

M1-29 adds **`production-current-subject-auth-boundary-m1-29.test.ts`**, a composition-level regression calling the real production profile runtime, real production request verifier, real Supabase Member verifier with **synthetic upstream fetch**, and real PostgreSQL subject transaction adapter with a **strict simulated driver**. It intentionally does *not* connect to live Supabase or a real database and does not certify live infrastructure configuration.

## Test cases and fail-closed expectations

- Valid synthetic opaque Guest Bearer: only server-derived HMAC enters the Guest resolver. Forged HTTP `x-myeongha-subject-id`, `x-myeongha-subject-guc`, `x-db-role`, SQL-query-like header and cookie do not affect canonical Subject, SQL text or parameter bindings; Member upstream must not be called.
- JWT-shaped Member Bearer: Supabase `GET /auth/v1/user` is called, and only the verified **upstream user ID** reaches `begin_member_subject_context_v1`. A forged `x-auth-user-id` header and `service_role` claim cannot change its identity or SQL.
- Missing/malformed short Bearer: 401 and **zero DB connections**.
- Supabase Member 401 or 403: 401 to caller, **no fallback** to Guest, zero DB connections.
- Syntactically supported Guest Bearer with no matching canonical database Guest session: resolver rejects, transaction rolls back, response 401. The HMAC by itself is **not** a verified Subject.
- Unsupported HTTP method: 405 before any authentication/DB access.
- Approved calls issue only canonical `BEGIN`, static `SET LOCAL ROLE myeongha_api_executor`, exactly one parameterized resolver, `assert_myeongha_subject_context_v1`, scoped profile read, `COMMIT`. They do not emit direct `set_config`, arbitrary SQL/GRANT or raw source-table queries.

## Limits and next security boundary

This is **source-code + in-process integration** evidence, not a live Vercel/Supabase penetration test or real external HTTP network deployment. The simulated DB enforces only the enumerated SQL commands; M1-28 remains the genuine disposable-PG17 test of Guest resolver SQL, RLS and writable-GUC limitations. A trusted backend or compromised API-login identity that can issue arbitrary SQL could still set the custom Subject GUC directly: **PostgreSQL GUC equality is not authentication**. The current M1-17 minimal Reader port `observeOfficialReaderUnknownCommitWithMinimalReadV1` receives `verifiedSubjectId` as a trusted internal argument and is **not** exposed by a new public Reader HTTP route in M1-29; no external-to-Reader authorization is claimed.

Production managed Owner, 0860 migration grantor, live migration ledger (dated 173 applied/217 in source/45 missing plus one remote-only SeYeon restore), confidential restore bytes, DR and 15 Owner approvals remain open. No deployments, paid Reader, direct D2 Writer, real provider charge/refund, migration ledger change or PR merge. **Draft / HOLD.**
