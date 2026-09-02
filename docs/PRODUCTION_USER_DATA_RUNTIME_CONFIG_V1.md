# MyeongHa Production User-Data Runtime Configuration V1

Status: **implementation contract + concrete DB pool + request identity verifier — public route credentials are not yet provisioned**

## Purpose

This contract defines the configuration boundary that a production Vercel user-data runtime must satisfy before `GET /api/me` can be activated.

It implements the deployment side of `P0-AUTH-01` without creating database login secrets, exposing privileged Supabase credentials, or claiming that the required Vercel environment variables already exist.

## Governed production targets

```text
Supabase project ref
cnsfpcdiyofqvhpcegfc

Supabase origin
https://cnsfpcdiyofqvhpcegfc.supabase.co

ordinary PostgreSQL execution role
myeongha_api_executor
```

`myeongha_api_executor` remains the migration-owned `NOLOGIN / NOBYPASSRLS` execution role. The network connection must use a separate, non-privileged login principal that is authorized to enter that role for the user-owned transaction.

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

The pool is deliberately bounded for a serverless runtime. This adapter does not provision the login role/password and does not make an absent Vercel binding valid.

## Required runtime settings

```text
MYEONGHA_DATABASE_URL
MYEONGHA_DATABASE_PRINCIPAL
MYEONGHA_SUPABASE_URL
MYEONGHA_SUPABASE_API_KEY
MYEONGHA_GUEST_FINGERPRINT_SECRET
```

These names are MyeongHa implementation choices. They are not claimed to be source-authored product semantics.

### `MYEONGHA_DATABASE_URL`

Must be a PostgreSQL URL with explicit login credentials. The configuration parser rejects:

- non-PostgreSQL schemes;
- missing host/user/password;
- `sslmode=disable`;
- known privileged/default principals such as `postgres`, `supabase_admin`, or `service_role`.

The URL itself is secret configuration and must never be emitted by runtime diagnostics.

### `MYEONGHA_DATABASE_PRINCIPAL`

Names the dedicated network login principal. It must be distinct from `myeongha_api_executor` because the latter is intentionally `NOLOGIN`.

Provisioning the login principal, its password, and its membership/ability to `SET LOCAL ROLE myeongha_api_executor` belongs to deployment configuration. Repository migrations do not create that password.

### `MYEONGHA_SUPABASE_URL`

Must exactly identify the governed production Supabase project origin above. Cross-project runtime drift fails closed.

### `MYEONGHA_SUPABASE_API_KEY`

The concrete Member verifier uses this only as the application API key for the governed Supabase Auth `/auth/v1/user` verification request.

V1 requires a modern `sb_publishable_...` key. Secret/service-role credentials and legacy JWT-style anon keys are rejected by the configuration parser. The access token itself remains in the request `Authorization` header and is never exposed in diagnostics.

### `MYEONGHA_GUEST_FINGERPRINT_SECRET`

Secret material for the concrete Guest bearer fingerprint contract.

V1 uses HMAC-SHA-256 with explicit domain/version separation and stores/passes only:

```text
myeongha-guest-bearer-hmac-sha256-v1:<64 lowercase hex chars>
```

The exact request transport, Member/Guest classification, HMAC message, and bootstrap-compatible fingerprint port are documented in `PRODUCTION_REQUEST_IDENTITY_VERIFIER_V1.md`.

Guest TTL/expiry selection remains outside this configuration contract and is still constrained by `P0-PR-01`.

## Security invariants

```text
client subjectId/userId
!= identity authority

network DB login principal
!= myeongha_api_executor

myeongha_api_executor
= transaction-scoped ordinary user execution role

service/admin/BYPASSRLS credential
!= ordinary user runtime baseline
```

Runtime logs and error envelopes must not contain:

- database URL/password;
- Supabase API key;
- raw Member access token;
- raw Guest bearer token;
- Guest fingerprint secret.

The parser therefore exposes a separate redacted summary containing only configuration presence, the explicit database principal name, the fixed execution role, and the fixed Supabase origin.

## Live production gate evidence — 2026-09-02

Read-only production inspection confirmed:

```text
myeongha_api_executor
→ exists
→ NOLOGIN
→ NOBYPASSRLS

begin_member_subject_context_v1
begin_guest_subject_context_v1
current_myeongha_subject_id
qry_subject_profile_current_v1
→ present in production
```

However, the only current role observed as a member of `myeongha_api_executor` is privileged `postgres`, which has `BYPASSRLS`. That role is explicitly forbidden as the ordinary user runtime login principal.

Therefore the dedicated production network login principal is still unprovisioned.

## Activation gate

The configuration contract, concrete pool adapter, and concrete request verifier do not activate `/api/me` by themselves.

Production activation still requires:

```text
1. provision dedicated non-privileged PostgreSQL login principal
2. grant only the ability required to enter myeongha_api_executor
3. bind MYEONGHA_DATABASE_URL / MYEONGHA_DATABASE_PRINCIPAL in Vercel production
4. bind the governed Supabase URL + publishable key
5. bind MYEONGHA_GUEST_FINGERPRINT_SECRET
6. add api/me.ts runtime adapter
7. unauthenticated smoke => 401
8. Member own-subject smoke => 200
9. Guest own-subject smoke => 200 when a production Guest session can be issued
10. cross-subject negative proof => denied
```

Until those gates are evidenced, `GET /api/me` remains production-inactive even though the application/HTTP boundary, database authority contracts, concrete Node/PostgreSQL pool adapter, and production Request identity verifier exist.
