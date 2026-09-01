# MyeongHa Production User-Data Runtime Configuration V1

Status: **implementation contract + concrete DB pool adapter — credentials are not provisioned by this document**

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

Credential/configuration material for the future concrete Supabase Member identity verifier. The runtime contract stores it only in parsed configuration; diagnostics expose only a configured/not-configured marker.

The concrete Member HTTP transport and verifier are a separate implementation slice.

### `MYEONGHA_GUEST_FINGERPRINT_SECRET`

Secret material reserved for the future concrete Guest credential fingerprint verifier. This configuration contract does **not** choose the fingerprint algorithm, key-id format, token transport, rotation procedure, or bootstrap issuance format.

Those semantics must be implemented consistently with `GuestBootstrapTokenFingerprintPortV1` and the stored `guest_sessions.token_hash` verifier contract before a Guest production route is activated.

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

## Activation gate

The configuration contract and concrete pool adapter do not activate `/api/me` by themselves.

Production activation still requires:

```text
1. provision dedicated PostgreSQL login principal
2. grant only the ability required to enter myeongha_api_executor
3. bind the required settings in Vercel production
4. implement concrete Member identity verifier
5. implement concrete Guest fingerprint verifier/transport
6. add api/me.ts runtime adapter
7. unauthenticated smoke => 401
8. Member own-subject smoke => 200
9. Guest own-subject smoke => 200
10. cross-subject negative proof => denied
```

Until those gates are evidenced, `GET /api/me` remains production-inactive even though the application/HTTP boundary, database authority contracts, and concrete Node/PostgreSQL pool adapter exist.
