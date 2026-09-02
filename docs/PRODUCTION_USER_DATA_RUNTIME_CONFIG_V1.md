# MyeongHa Production User-Data Runtime Configuration V1

Status: **implementation contract + Member/Guest verifiers + live least-privilege DB login principal + production bindings + `/api/me` active; Guest bootstrap TTL decided and binding pending**

## Purpose

This contract defines the production Vercel user-data runtime configuration boundary for the active protected `GET /api/me` slice and the remaining Guest bootstrap activation sequence.

It implements the deployment side of `P0-AUTH-01` without committing database passwords or exposing privileged Supabase credentials. Guest authentication lifetime is now governed by `P0-PR-01A`; broader data-retention, backup, and legal-retention policy remains under parent `P0-PR-01`.

## Governed production targets

```text
Supabase project ref
cnsfpcdiyofqvhpcegfc

Supabase origin
https://cnsfpcdiyofqvhpcegfc.supabase.co

network PostgreSQL login principal
myeongha_runtime

ordinary PostgreSQL execution role
myeongha_api_executor
```

`myeongha_api_executor` remains the migration-owned `NOLOGIN / NOBYPASSRLS` execution role. `myeongha_runtime` is the separate non-privileged LOGIN principal and may enter that role only for the user-owned transaction.

## Concrete PostgreSQL pool adapter

`apps/api/src/node-postgres-subject-pool.ts` provides the concrete Node runtime adapter using `node-postgres`.

Each checked-out connection is verified before it is exposed to the subject transaction boundary:

```sql
select
  current_user::text as "currentUser",
  pg_catalog.pg_has_role(current_user, 'myeongha_api_executor', 'MEMBER')
    as "canEnterExecutionRole"
```

The adapter fails closed and discards the checkout when:

- `current_user` does not exactly match the configured `MYEONGHA_DATABASE_PRINCIPAL`;
- the login principal cannot enter `myeongha_api_executor`;
- the preflight projection is malformed.

The pool is deliberately bounded for a serverless runtime. It does not provision or recover database credentials and does not make an absent Vercel binding valid.

## Production login principal

Migration `0800_production_api_login_principal.sql` provisions the governed network login role:

```text
myeongha_runtime
→ LOGIN
→ NOSUPERUSER
→ NOCREATEDB
→ NOCREATEROLE
→ NOINHERIT
→ NOREPLICATION
→ NOBYPASSRLS
→ member of myeongha_api_executor
```

The migration creates the role with `PASSWORD NULL`. This is deliberate: repository migration authority may establish the role and its least-privilege membership, but it must not create an orphan production credential that has no secret-safe consumer binding.

The role carries the management marker:

```text
myeongha:production-api-login-principal:v1
```

Because PostgreSQL roles are cluster-wide while CI applies migrations across multiple isolated databases, a pre-existing role is accepted only when this marker and the exact least-privilege shape remain intact. Unmarked or privilege-drifted roles fail closed.

Production password assignment is performed only by the governed secret-safe binding operation that also binds its consuming Vercel runtime. The repository does not contain or recover the password.

## Concrete Supabase Member verifier

`apps/api/src/supabase-member-identity-verifier.ts` remains the authoritative production Member credential verifier introduced by PR #311.

The verifier accepts an HTTP Bearer credential and validates it by calling:

```http
GET https://cnsfpcdiyofqvhpcegfc.supabase.co/auth/v1/user
apikey: <MYEONGHA_SUPABASE_API_KEY>
Authorization: Bearer <user access token>
```

A successful response must contain a syntactically valid Auth user UUID. Only that UUID becomes trusted Member evidence:

```text
{ kind: "member", verifiedAuthUserId: <auth.users.id> }
```

The verifier does not trust `user_metadata`, client-supplied `subjectId`, or any profile field as owner authority. `401`/`403` produce no verified identity; upstream/network/malformed responses fail closed. Raw access tokens and API keys are not included in verifier error messages.

## Production Member/Guest request classifier

`apps/api/src/production-request-identity-verifier.ts` composes the authoritative Member verifier with the Guest fingerprint contract.

V1 request transport is:

```text
Authorization: Bearer <credential>
```

Classification is fail-closed and non-overlapping:

```text
JWT-shaped bearer
→ Supabase Member verifier only

supported non-JWT opaque bearer
→ Guest fingerprint only

missing / malformed / unsupported bearer
→ no verified identity
```

A Member credential rejected by Supabase does not fall through to Guest identity. A normal Guest request does not call Supabase Auth and therefore does not disclose the raw Guest bearer to that upstream.

## Concrete Guest fingerprint contract

Supported Guest bearers are non-JWT opaque printable credentials with bounded length. The raw bearer is converted locally using:

```text
algorithm
HMAC-SHA-256

version/domain
myeongha-guest-bearer-hmac-sha256-v1

message
"myeongha-guest-bearer-hmac-sha256-v1\0" + raw bearer token

key
MYEONGHA_GUEST_FINGERPRINT_SECRET

resolver/storage representation
myeongha-guest-bearer-hmac-sha256-v1:<64 lowercase hex chars>
```

Only this fingerprint is eligible to enter the Guest subject resolver. The raw Guest bearer is never passed to PostgreSQL.

`createProductionGuestBearerTokenFingerprintPortV1()` implements the same contract for `GuestBootstrapTokenFingerprintPortV1`, preventing Guest bootstrap storage and subsequent request verification from silently using different fingerprints.

Guest bearer/session authentication lifetime is governed by `P0-PR-01A`:

```text
7 days
= 604800 seconds
```

This decision governs authentication expiry only. Expired Guest data deletion timing, backup retention, AI trace retention, commerce/legal retention, and cleanup cadence remain under parent `P0-PR-01`.

## Required runtime settings

The active `/api/me` runtime requires:

```text
MYEONGHA_DATABASE_URL
MYEONGHA_DATABASE_PRINCIPAL
MYEONGHA_SUPABASE_URL
MYEONGHA_SUPABASE_API_KEY
MYEONGHA_GUEST_FINGERPRINT_SECRET
```

Guest bootstrap additionally requires the decided production authentication TTL:

```text
MYEONGHA_GUEST_SESSION_TTL_SECONDS=604800
```

There remains no application fallback/default. Production must bind the decided value explicitly through the dedicated Guest TTL operation before the bootstrap route is activated.

These names are MyeongHa implementation choices. They are not claimed to be source-authored product semantics.

### `MYEONGHA_DATABASE_URL`

Must be a PostgreSQL URL with explicit login credentials. The configuration parser rejects:

- non-PostgreSQL schemes;
- missing host/user/password;
- `sslmode=disable`;
- known privileged/default principals such as `postgres`, `supabase_admin`, or `service_role`.

The URL itself is secret configuration and must never be emitted by runtime diagnostics.

### `MYEONGHA_DATABASE_PRINCIPAL`

Must name the governed dedicated network login principal:

```text
myeongha_runtime
```

It is distinct from `myeongha_api_executor` because the execution role is intentionally `NOLOGIN`. Migration 0800 provisions the login role and executor membership but deliberately does not provision a usable password. Password assignment belongs to the same secret-safe activation operation that binds the consuming Vercel runtime.

### `MYEONGHA_SUPABASE_URL`

Must exactly identify the governed production Supabase project origin above. Cross-project runtime drift fails closed.

### `MYEONGHA_SUPABASE_API_KEY`

Credential/configuration material for the concrete Supabase Member identity verifier. It is sent only as the Auth server `apikey` header while the user's access token is sent separately in `Authorization: Bearer ...`.

The runtime contract stores the key only in parsed configuration; diagnostics expose only a configured/not-configured marker.

### `MYEONGHA_GUEST_FINGERPRINT_SECRET`

Secret HMAC key material for the concrete Guest bearer fingerprint contract. It is not a Guest session token and must never be returned to clients or emitted in diagnostics.

### `MYEONGHA_GUEST_SESSION_TTL_SECONDS`

`P0-PR-01A` fixes the production value for newly issued Guest credentials at `604800` seconds. The server remains authoritative for `expires_at`; clients cannot request or extend the TTL. Changing this value requires a new explicit decision record rather than an environment-only policy change.

## Security invariants

```text
client subjectId/userId
!= identity authority

network DB login principal
= myeongha_runtime
!= myeongha_api_executor

myeongha_api_executor
= transaction-scoped ordinary user execution role

service/admin/BYPASSRLS credential
!= ordinary user runtime baseline

rejected Member bearer
!= Guest credential fallback
```

Runtime logs and error envelopes must not contain:

- database URL/password;
- Supabase API key;
- raw Member access token;
- raw Guest bearer token;
- Guest fingerprint secret.

The parser therefore exposes a separate redacted summary containing only configuration presence, the explicit database principal name, the fixed execution role, and the fixed Supabase origin.

## Live production evidence — 2026-09-03

Production project `cnsfpcdiyofqvhpcegfc` is recorded as live through migration `0820_guest_bootstrap_current_query` in `docs/RUNTIME_STATUS.md`.

The governed execution shape is:

```text
myeongha_api_executor
→ NOLOGIN
→ NOBYPASSRLS

myeongha_runtime
→ LOGIN
→ NOSUPERUSER
→ NOCREATEDB
→ NOCREATEROLE
→ NOINHERIT
→ NOREPLICATION
→ NOBYPASSRLS
→ password bound through the secret-safe production operation
→ member of myeongha_api_executor

production migration history
→ 0790 subject_execution_context
→ 0800 production_api_login_principal
→ 0810 guest_bootstrap_runtime_authority
→ 0820 guest_bootstrap_current_query
```

The active production HTTP invariant is now:

```text
GET https://myeongha.vercel.app/api/health
→ 200

GET https://myeongha.vercel.app/api/me
without valid identity evidence
→ 401 AUTH_REQUIRED
→ Cache-Control: no-store

GET https://myeongha.vercel.app/api/session/bootstrap
→ 404 / route not active
```

`/api/me` is therefore network-active and fail-closed for missing identity. The unauthenticated `401` does **not** prove Member own-subject or Guest own-subject positive behavior.

## Completed production binding operations

The one-time user-data credential workflow is:

```text
.github/workflows/production-user-data-bindings.yml
```

It paired the `myeongha_runtime` password assignment with the Vercel production bindings for:

```text
MYEONGHA_DATABASE_URL
MYEONGHA_DATABASE_PRINCIPAL
MYEONGHA_SUPABASE_URL
MYEONGHA_SUPABASE_API_KEY
MYEONGHA_GUEST_FINGERPRINT_SECRET
```

It must **not** be rerun merely to add Guest TTL configuration, because it is designed around first-time password provisioning.

The protected `/api/me` root route is active through the production Vercel adapter and canonical Member/Guest identity composition. Response caching is explicitly disabled with `Cache-Control: no-store`.

A guarded Member positive-smoke operation is prepared at:

```text
.github/workflows/production-member-me-smoke.yml
```

It is manual-only, uses the GitHub `production` environment, requires exact `VERIFY_MEMBER_ME` confirmation, pins the canonical production origin, rejects redirects, and consumes only governed production secrets for the Member bearer and expected canonical subject ID. Repository CI validates this workflow contract but does not execute the credentialed production smoke automatically.

## Guest TTL binding operation

Guest TTL has a separate manual operation:

```text
.github/workflows/production-guest-bootstrap-ttl-binding.yml
```

For the decided V1 policy it must be invoked with:

```text
confirm = BIND_GUEST_TTL
ttl_seconds = 604800
```

The workflow:

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

The workflow transports the decided policy; it is not itself the authority that chose seven days.

## Remaining activation and verification gates

The `/api/me` network route and its underlying production DB/configuration spine are already active. Remaining evidence/gates are:

```text
1. Member own-subject /api/me positive smoke => 200 using production-safe Member evidence
2. bind MYEONGHA_GUEST_SESSION_TTL_SECONDS=604800 through the dedicated TTL-only workflow
3. verify the production TTL binding
4. expose the thin root /api/session/bootstrap Vercel route over the existing production composition boundary
5. Guest bootstrap issuance remote smoke without logging/persisting the raw bearer outside its intended client return path
6. Guest own-subject /api/me positive smoke => 200 using the issued credential
7. cross-subject negative proof => denied
8. keep /api/health regression => 200
```

Birth Profile production HTTP activation remains downstream of the generic identity/runtime spine being fully evidenced for the supported Member/Guest paths.

The broader `P0-PR-01` retention policy remains open, but it no longer blocks the explicitly narrowed Guest authentication TTL decision in `P0-PR-01A`.
