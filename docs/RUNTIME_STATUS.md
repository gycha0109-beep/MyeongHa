# MyeongHa Runtime Status

> This document describes executable production/runtime state separately from repository-local build, test, and deployment-configuration checks.
>
> Guest/auth Production evidence refreshed: **2026-09-08**.

## Current status

| Area | State | Notes |
|---|---|---|
| Static Web | DEPLOYED | Vercel builds the static `public/` output through `npm run build:web`. |
| Executable `/api` runtime | ACTIVE | `GET /api/health`, protected `GET /api/me`, and POST-only `/api/session/bootstrap` are deployed as root Vercel Functions on the canonical production host. |
| Browser → API | `/api/me` ACTIVE / GUEST BOOTSTRAP ACTIVE | `GET /api/me` is production-active and rejects missing identity with `401 AUTH_REQUIRED`. The Guest bootstrap root route is production-active; a fresh GET on 2026-09-08 returned `405` with `Allow: POST` and `Cache-Control: no-store`. |
| Canonical Subject Resolution | DB + APPLICATION + MEMBER/GUEST REQUEST VERIFIERS ACTIVE FOR `/api/me` | P0-AUTH-01 defines trusted Member/Guest evidence → canonical `subjects.id`; Member JWT verification, Guest HMAC fingerprinting, and production composition roots are implemented. |
| API → PostgreSQL execution identity | PRODUCTION BOUND | `myeongha_runtime` is the governed production LOGIN principal, remains NOINHERIT / NOBYPASSRLS / non-privileged, and can enter the NOLOGIN `myeongha_api_executor` execution role. Its runtime credential was assigned together with the consuming Vercel production binding. |
| Production user-data config | BOUND FOR `/api/me` AND GUEST BOOTSTRAP | Vercel production has the governed DB/Supabase/Guest-fingerprint settings required by the current user-data runtime. `MYEONGHA_GUEST_SESSION_TTL_SECONDS=604800` was bound and read back successfully in governed run `33666141919`. |
| Guest bootstrap HTTP composition | ACTIVE / PRODUCTION VERIFIED | PR #334 activated the thin root route. Production smoke run `33670492068` then proved fresh Guest issuance, same-subject `/api/me`, same-session bearer reuse without bearer re-emission, invalid credential fail-closed behavior, and health regression. |
| Guest session TTL | DECIDED / PRODUCTION BOUND | `P0-PR-01A` fixes Guest bearer/session authentication lifetime at 7 days = 604800 seconds, and that exact value is bound in Production. Parent `P0-PR-01` remains open for broader expired-Guest data deletion, backup, AI-trace, commerce/legal, and cleanup retention policy. |
| Character compatibility verdict | BLOCKED | `SRC-15` remains unresolved. |
| Subject-specific content rollout | BLOCKED | `SRC-16` remains unresolved. |
| Canonical Character roster | BLOCKED / EMPTY IN PRODUCTION | `O-C1-05` remains OPEN for the actual initial five Character canon / gender / visual / names. Production roster audit run `33981084804` found `characterTotalCount=0`. No roster is inferred from UI presentation data. |
| Character content release | BLOCKED / NO ACTIVE DEFAULT RELEASE | `SRC-27` remains OPEN / BLOCKING for production-authoritative content lifecycle mutation. Production roster audit run `33981084804` found `activeDefaultReleaseCount=0`, `activeBundleCount=0`, and `eligibleCharacterCount=0`. |
| Character HTTP activation | HOLD | Do not claim canonical Character activation while `O-C1-05`, `SRC-15`, `SRC-16`, and `SRC-27` remain unresolved or blocking. |
| Production Member Chat reusable thread | BLOCKED / NONE | Governed read-only Chat smoke run `33980518338` found `ownedThreadCount=0` and `eligibleThreadCount=0`. |
| Chat thread creation authority | BLOCKED | `SRC-34` remains OPEN / BLOCKING; do not create a Production Character Chat thread merely to make E2E green. |
| Chat send/runtime activation | HOLD / FAIL-CLOSED | No canonical Character send smoke is claimed while canonical content/release authority is absent and `SRC-34` blocks production-authoritative Character Chat thread creation/open semantics. |
| Supabase production migration deployment | LIVE THROUGH 0820 | Production contains `0790_subject_execution_context`, `0800_production_api_login_principal`, `0810_guest_bootstrap_runtime_authority`, and `0820_guest_bootstrap_current_query` on project `cnsfpcdiyofqvhpcegfc`. `.github/workflows/supabase-production.yml` remains the governed migration deployment path. |

## Verification semantics

`npm run check` validates repository-local typechecking, tests, builds, static web output, deployment-configuration contracts, the production user-data binding workflow contract, and the Guest bootstrap TTL binding workflow contract. It does **not** by itself prove remote Vercel environment state or successful remote request execution.

`npm run verify:production:api` performs a networked remote check against the canonical production health endpoint by default. It is intentionally excluded from `npm run check` so repository CI does not depend on production availability. `MYEONGHA_PRODUCTION_ORIGIN` may override the origin for an explicit remote target.

Remote production evidence currently includes:

```text
latest inspected Production deployment
→ dpl_757Za7arQoiEnfBeGRZkSSdkPsYR
→ READY
→ Git SHA 583b086936f539a69fe1d21471c1e1738b2efc9d

GET https://myeongha.vercel.app/api/health
→ 200
→ {"status":"ok"}

GET https://myeongha.vercel.app/api/session/bootstrap
→ 405
→ Allow: POST
→ Cache-Control: no-store

GET https://myeongha.vercel.app/api/me
without valid member or guest identity evidence
→ 401 AUTH_REQUIRED
→ Cache-Control: no-store
```

The `/api/me` `401` proves that the protected production function exists and rejects missing identity through the application boundary. The `/api/session/bootstrap` `405` proves the root route is currently network-routable and POST-only; it is not by itself positive issuance evidence.

Positive Guest Production evidence is recorded separately in guarded run `33670492068`, executed after the #337 PostgreSQL TLS compatibility fix merged at `bc88f005be514fb9495aa560d39fd12298f52bd5`:

```text
fresh POST /api/session/bootstrap
→ 200
→ kind = guest
→ non-empty canonical subjectId / guestSessionId / expiresAt / bearerToken
→ TTL ≈ 604800 seconds

GET /api/me with the fresh Guest bearer
→ 200
→ same canonical subjectId
→ subjectKind = guest

POST /api/session/bootstrap with the same bearer
→ 200
→ same canonical subjectId
→ same guestSessionId
→ bearerToken = null

invalid opaque bearer
→ 401 AUTH_REQUIRED

invalid JWT-shaped bearer
→ 401 AUTH_REQUIRED

GET /api/health
→ 200
```

The raw Guest bearer remained runner-local and was not emitted to the job log. Later auth/browser hardening through #592 preserves fail-closed client-side Guest/Member credential cleanup behavior; current main `583b086936f539a69fe1d21471c1e1738b2efc9d` is deployed READY.

Guest bootstrap activation history is therefore:

```text
P0-PR-01A
→ DECIDED
→ Guest authentication TTL = 7 days = 604800 seconds

MYEONGHA_GUEST_SESSION_TTL_SECONDS
→ production binding/read-back SUCCESS
→ run 33666141919

PR #329
→ superseded activation draft
→ not the active merge authority

PR #334
→ MERGED
→ merge SHA ca503767d89553dd31026b3a995bee788e304adf
→ root /api/session/bootstrap activated

Production Guest positive smoke
→ run 33670492068 SUCCESS
```

## Production Request identity verification

The Shared API V1 classifier uses one bearer transport:

```text
Authorization: Bearer <credential>
```

Classification is deliberately disjoint:

```text
JWT-shaped bearer
→ Supabase Member verifier
→ GET /auth/v1/user
→ verified auth.users.id

supported non-JWT opaque bearer
→ local HMAC-SHA-256 fingerprint
→ Guest subject resolver
```

A rejected JWT-shaped Member credential never falls through to Guest identity. Guest verification does not call Supabase Auth and only the fingerprint, never the raw Guest token, is eligible to enter PostgreSQL.

The same Guest fingerprint implementation is exposed through `GuestBootstrapTokenFingerprintPortV1` so bootstrap storage and later request verification use an identical token-hash contract.

Guest bootstrap issuance uses an opaque server-generated bearer and stores only its deterministic keyed fingerprint. Its issuer requires an explicit positive whole-number `MYEONGHA_GUEST_SESSION_TTL_SECONDS`; there is deliberately no application fallback TTL. `P0-PR-01A` fixes the production value for newly issued credentials at `604800` seconds, and governed Production binding run `33666141919` verified that exact value.

## Live production DB evidence — 2026-09-03

Read-only inspection against project `cnsfpcdiyofqvhpcegfc` confirms:

```text
myeongha_api_executor
→ rolcanlogin = false
→ rolsuper = false
→ rolbypassrls = false

myeongha_runtime
→ rolcanlogin = true
→ rolsuper = false
→ rolcreatedb = false
→ rolcreaterole = false
→ rolinherit = false
→ rolreplication = false
→ rolbypassrls = false
→ password present = true
→ member of myeongha_api_executor = true

production migration history
→ 0790 subject_execution_context
→ 0800 production_api_login_principal
→ 0810 guest_bootstrap_runtime_authority
→ 0820 guest_bootstrap_current_query
```

Current ordinary execution path remains:

```text
network connection
→ myeongha_runtime
→ BEGIN
→ SET LOCAL ROLE myeongha_api_executor
→ begin_member_subject_context_v1(...)
   or begin_guest_subject_context_v1(...)
→ same transaction authority work
→ COMMIT / ROLLBACK
```

`postgres`, `supabase_admin`, `service_role`, or another BYPASSRLS identity remains forbidden as the ordinary user runtime principal.

## Live production Character / Chat evidence — 2026-09-06

The governed Character roster and Member Chat discovery checks are read-only audits. They do not seed, publish, activate, create, or mutate Production data.

Production Character roster audit (`33981084804`) observed only sanitized aggregate state:

```text
activeDefaultReleaseCount=0
activeBundleCount=0
characterTotalCount=0
activeRuntimeCount=0
enabledRuntimeCount=0
candidateAvailabilityCount=0
releaseWindowStartedCount=0
notRetiredCount=0
eligibleCharacterCount=0
auditMode=explicit_read_only
```

Governed Production Member Chat discovery (`33980518338`) observed:

```text
ownedThreadCount=0
activeThreadCount=0
pinnedActiveThreadCount=0
eligibleThreadCount=0
auditMode=explicit_read_only
```

These zero states are readiness evidence, not permission to synthesize missing authority. In particular:

```text
O-C1-05
→ actual initial five Character canon / gender / visual / names remain OPEN

SRC-27
→ content release lifecycle mutation authority remains OPEN / BLOCKING

SRC-34
→ Character Chat thread creation/open mutation authority remains OPEN / BLOCKING
```

No Production Character content, release, runtime catalog row, Chat thread, or Chat message was mutated to obtain these results.

## Production binding operations

The already-completed one-time user-data credential workflow is:

```text
.github/workflows/production-user-data-bindings.yml
```

It atomically paired the `myeongha_runtime` password assignment with the Vercel production bindings for:

```text
MYEONGHA_DATABASE_URL
MYEONGHA_DATABASE_PRINCIPAL
MYEONGHA_SUPABASE_URL
MYEONGHA_SUPABASE_API_KEY
MYEONGHA_GUEST_FINGERPRINT_SECRET
```

It must **not** be rerun merely to add Guest TTL configuration, because it is designed around first-time password provisioning.

Guest TTL has a separate manual operation:

```text
.github/workflows/production-guest-bootstrap-ttl-binding.yml
```

For the decided V1 authentication policy, the governed inputs are:

```text
confirm = BIND_GUEST_TTL
ttl_seconds = 604800
```

That workflow:

```text
requires GitHub production environment
+ exact BIND_GUEST_TTL confirmation
+ operator-supplied positive whole-number TTL
+ exact governed Vercel project/team verification
→ upserts only MYEONGHA_GUEST_SESSION_TTL_SECONDS for production
→ performs no DB password mutation
→ performs no deployment
→ performs no route activation
```

The workflow transports the already-decided value. It is not the authority that chose seven days. Production binding and exact single-environment read-back succeeded in run `33666141919`; route activation then proceeded separately through merged PR #334.

A guarded Member own-subject positive-smoke workflow is also prepared:

```text
.github/workflows/production-member-me-smoke.yml
```

Repository CI verifies that workflow's security contract, but this Guest-status refresh does not infer a Member positive-smoke result from Guest evidence. Member Production evidence remains independently governed.

## Authority blockers and implementation gates

Authority blockers still open:

- `O-C1-05`: actual initial five Character canon / gender / visual / names.
- `SRC-15`: client capability / asset manifest compatibility decision authority.
- `SRC-16`: subject-specific content rollout resolver authority.
- `SRC-27`: production content bundle/release lifecycle mutation authority, including registration, activation/default-switch, and retirement semantics.
- `SRC-34`: production-authoritative Character Chat thread creation/open semantics.
- `P0-PR-01`: broader retention remains open for expired Guest data deletion, product-personal data retention, AI trace, backup, commerce/legal/accounting retention, and cleanup cadence. It no longer blocks the narrower Guest authentication-lifetime decision recorded in `P0-PR-01A`.

Resolved architecture / production decisions:

- `P0-AUTH-01`: **DECIDED** — non-BYPASSRLS API execution role + transaction-scoped trusted canonical `subject_id` context.
- `P0-PR-01A`: **DECIDED / PRODUCTION BOUND** — Guest bearer/session authentication lifetime = 7 days = 604800 seconds for newly issued credentials.

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
- active root `api/me.ts` Vercel Function.
- `Cache-Control: no-store` on `/api/me` application responses.
- production user-data configuration parser contract with secret-redacted diagnostics.
- production `myeongha_runtime` login principal and live Vercel user-data bindings.
- Guest bootstrap DB create/current-query authorities through migration 0820.
- Guest bootstrap production DB runtime, opaque credential issuer, source-safe POST HTTP boundary, and production HTTP composition root.
- successful TTL-only Production binding/read-back at `604800` seconds in run `33666141919`.
- root Guest bootstrap route activation through merged PR #334 (`ca503767d89553dd31026b3a995bee788e304adf`).
- Production Guest positive smoke run `33670492068`: fresh issuance, same-subject `/api/me`, same-session reuse without bearer re-emission, invalid credential fail-closed, health 200.
- subsequent browser auth hardening through current main `583b086936f539a69fe1d21471c1e1738b2efc9d`, deployed READY as `dpl_757Za7arQoiEnfBeGRZkSSdkPsYR`.

Remaining identity/runtime follow-ups are independent of the now-complete Guest route activation:

- keep `/api/health` regression at 200.
- preserve Production Guest issuance/reuse and fail-closed credential behavior after future auth/runtime changes.
- verify Member own-subject Production behavior only with a production-safe Member identity and its dedicated evidence path; do not infer it from Guest smoke evidence.
- preserve cross-subject negative authorization evidence on every newly activated user-data surface.
- keep broader retention/deletion/backup decisions under `P0-PR-01` independent from the already-bound Guest authentication TTL.

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