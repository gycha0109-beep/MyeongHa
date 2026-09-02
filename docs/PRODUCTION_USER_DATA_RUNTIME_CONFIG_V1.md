# MyeongHa Production User-Data Runtime Configuration V1

Status: **implementation contract + concrete DB pool + Member/Guest request verifiers — public user-data routes remain gated**

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

This contract does not choose Guest TTL or retention. `P0-PR-01` remains separate.

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

Credential/configuration material for the concrete Supabase Member identity verifier. It is sent only as the Auth server `apikey` header while the user's access token is sent separately in `Authorization: Bearer ...`.

The runtime contract stores the key only in parsed configuration; diagnostics expose only a configured/not-configured marker.

### `MYEONGHA_GUEST_FINGERPRINT_SECRET`

Secret HMAC key material for the concrete Guest bearer fingerprint contract. It is not a Guest session token and must never be returned to clients or emitted in diagnostics.

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

The only observed role currently holding membership in `myeongha_api_executor` is privileged `postgres`, which has `BYPASSRLS`. It is explicitly forbidden as the ordinary user runtime login principal.

Therefore the dedicated non-privileged production network login principal is still unprovisioned.

## Activation gate

The configuration contract, concrete pool adapter, Member verifier, Guest verifier, and production composition roots do not activate `/api/me` by themselves.

Production activation still requires:

```text
1. provision dedicated non-privileged PostgreSQL login principal
2. grant only the ability required to enter myeongha_api_executor
3. bind the required settings in Vercel production
4. add api/me.ts runtime adapter
5. unauthenticated smoke => 401
6. Member own-subject smoke => 200
7. Guest own-subject smoke => 200 when Guest issuance is active
8. cross-subject negative proof => denied
```

Until those gates are evidenced, `GET /api/me` remains production-inactive even though the application/HTTP boundary, database authority contracts, concrete Node/PostgreSQL pool adapter, Member verifier, Guest verifier, and composition root exist.
