# MyeongHa Runtime Status

> This document describes executable production/runtime state separately from repository-local build, test, and deployment-configuration checks.

## Current status

| Area | State | Notes |
|---|---|---|
| Static Web | DEPLOYED | Vercel builds the static `public/` output through `npm run build:web`. |
| Executable `/api` runtime | ACTIVE | `GET /api/health` and protected `GET /api/me` are deployed as root Vercel Functions on the canonical production host. |
| Browser → API | `/api/me` ACTIVE / GUEST BOOTSTRAP ROUTE NOT ACTIVE | `GET /api/me` is production-active and rejects missing identity with `401 AUTH_REQUIRED`. Guest bootstrap application/production composition exists, but no root network route is exposed yet. |
| Canonical Subject Resolution | DB + APPLICATION + MEMBER/GUEST REQUEST VERIFIERS ACTIVE FOR `/api/me` | P0-AUTH-01 defines trusted Member/Guest evidence → canonical `subjects.id`; Member JWT verification, Guest HMAC fingerprinting, and production composition roots are implemented. |
| API → PostgreSQL execution identity | PRODUCTION BOUND | `myeongha_runtime` is the governed production LOGIN principal, remains NOINHERIT / NOBYPASSRLS / non-privileged, and can enter the NOLOGIN `myeongha_api_executor` execution role. Its runtime credential was assigned together with the consuming Vercel production binding. |
| Production user-data config | BOUND FOR `/api/me`; GUEST TTL BINDING PENDING | Vercel production has the governed DB/Supabase/Guest-fingerprint settings required by the current user-data runtime. `P0-PR-01A` now fixes Guest authentication TTL at `604800` seconds; that separate production binding is not yet verified. |
| Guest bootstrap HTTP composition | IMPLEMENTED / NETWORK ROUTE HOLD | Source-safe POST boundary, production composition, DB authority, current-session lookup, credential issuer, and activation gate exist. Draft PR #329 prepares the thin root route, but it remains held until the TTL binding is verified. |
| Guest session TTL | DECIDED / BINDING PENDING | `P0-PR-01A` fixes Guest bearer/session authentication lifetime at 7 days = 604800 seconds. Parent `P0-PR-01` remains open for broader expired-Guest data deletion, backup, AI-trace, commerce/legal, and cleanup retention policy. |
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
GET https://myeongha.vercel.app/api/health
→ 200
→ {"status":"ok"}

GET https://myeongha.vercel.app/api/me
without valid member or guest identity evidence
→ 401 AUTH_REQUIRED
→ Cache-Control: no-store
```

The `401` proves that the protected `/api/me` production function exists and rejects missing identity through the application boundary. It does not by itself prove Member own-subject or Guest own-subject success; those require production-safe credentials and subject fixtures.

Guest bootstrap remains intentionally non-routable:

```text
production Guest bootstrap composition
→ implemented

P0-PR-01A
→ DECIDED
→ Guest authentication TTL = 7 days = 604800 seconds

MYEONGHA_GUEST_SESSION_TTL_SECONDS
→ decided production value = 604800
→ application fallback/default = none
→ production binding not yet verified

root /api/session/bootstrap route
→ not active
→ draft activation PR #329 remains HOLD until binding proof
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

Guest bootstrap issuance uses an opaque server-generated bearer and stores only its deterministic keyed fingerprint. Its issuer requires an explicit positive whole-number `MYEONGHA_GUEST_SESSION_TTL_SECONDS`; there is deliberately no application fallback TTL. `P0-PR-01A` fixes the production value for newly issued credentials at `604800` seconds.

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

The workflow transports the already-decided value. It is not the authority that chose seven days. A successful production binding run has not yet been verified in the current activation evidence, so route activation remains held.

A guarded Member own-subject positive-smoke workflow is also prepared:

```text
.github/workflows/production-member-me-smoke.yml
```

Repository CI verifies that workflow's security contract, but does not execute its credentialed production request automatically. No successful Member positive-smoke run is claimed until explicit production evidence exists.

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
- `P0-PR-01A`: **DECIDED** — Guest bearer/session authentication lifetime = 7 days = 604800 seconds for newly issued credentials.

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
- manual, TTL-only production Vercel binding operation.
- `P0-PR-01A` Guest authentication TTL decision at 604800 seconds.
- draft PR #329 thin root Guest bootstrap route implementation with exact-head CI green; merge remains gated on verified TTL binding.

Remaining activation gates:

- execute the governed TTL-only production binding with `BIND_GUEST_TTL` and `604800`.
- verify the successful production binding before changing route state.
- only after that proof, mark draft PR #329 ready, recheck latest `main` drift/exact-head CI/mergeability, and merge the thin root Guest bootstrap route.
- verify Guest bootstrap issuance remotely without logging or persisting the raw bearer outside its intended client return path.
- verify Guest own-subject `/api/me` using the issued credential.
- verify Member own-subject `/api/me` using a production-safe Member identity.
- verify cross-subject negative behavior.
- keep `/api/health` regression at 200.
- activate Birth Profile production HTTP only after the generic identity/runtime spine is fully evidenced for supported Member/Guest paths.

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
