# Supabase Management Token Policy V1

> Issue: #1135  
> Status: **APPROVED IMPLEMENTATION AUTHORITY**  
> Project ref: `cnsfpcdiyofqvhpcegfc`

## Purpose

MyeongHa must not use one broad Supabase Personal Access Token as a general Production credential. Each trust boundary owns its own credential.

- Hosted Auth Admin operations use `MYEONGHA_SUPABASE_AUTH_ADMIN_SECRET`.
- PostgreSQL routing uses `SUPABASE_PRODUCTION_SESSION_POOLER_HOST`.
- PostgreSQL authentication uses `SUPABASE_DB_PASSWORD`.
- Supabase Management API access uses `SUPABASE_ACCESS_TOKEN` only where a Management API operation is intrinsically required.

## V1 Management PAT authority

The only approved repository consumer is:

```text
.github/workflows/production-data-api-containment.yml
```

The token must be a Supabase **scoped personal access token**, scoped only to project `cnsfpcdiyofqvhpcegfc`.

Approved permission:

```text
Data API Config — Read-write
```

Approved Management API operations:

```text
GET   /v1/projects/{projectRef}/postgrest
PATCH /v1/projects/{projectRef}/postgrest
```

No other workflow may receive `secrets.SUPABASE_ACCESS_TOKEN`.


### Denial-only evidence exception

The same approved workflow may be manually dispatched with mode `verify-least-privilege` and confirmation `VERIFY_SUPABASE_MANAGEMENT_TOKEN_LEAST_PRIVILEGE`.

That evidence mode may issue read-only denial probes to these otherwise forbidden surfaces:

```text
GET /v1/projects/{projectRef}/config/database/pooler  -> 403
GET /v1/projects/{projectRef}/api-keys?reveal=true   -> 403
GET /v1/projects/{projectRef}/config/auth             -> 403
```

These requests are not operational authority. A 2xx response is a hard failure because it proves the PAT is broader than V1 allows. Probe bodies are discarded and never uploaded or logged.

The positive write proof PATCHes the already-observed governed `db_schema` value back to itself and then re-reads it. Evidence requires `state_changed=false`; unexpected Production schema state fails closed before PATCH.

## Explicitly forbidden PAT authority

The V1 token must not be granted API Keys, API Key Secrets, Connection Pooling, Database, Database Config, Migrations, Auth Config, Project Settings, Edge Functions, Storage, Organizations, or Projects (account-wide) permissions.

Auth canaries must fail closed when `MYEONGHA_SUPABASE_AUTH_ADMIN_SECRET` is absent. They must not recover an Auth Admin credential through the Management API.

Database workflows must fail closed when the explicit Session Pooler host is absent or invalid. They must not discover the pooler through the Management API and must not use `supabase link` as a PAT fallback.

## Provider-stage boundary

Supabase scoped personal access tokens are currently public alpha and may not yet be enabled for every account. Repository surface reduction is valid independently of token availability. Credential rotation is not complete until the operator can create a scoped token and Production evidence proves the required positive and negative permissions.

If scoped-token creation is unavailable for the account, #1135 remains open/HOLD. A classic broad PAT is not accepted as closure evidence.

## Rotation order

1. Merge repository consumer-surface reduction while the existing credential remains available.
2. Verify Auth and database workflows no longer consume the PAT.
3. Create a project-scoped PAT with only Data API Config Read-write.
4. Replace the GitHub `production` environment secret `SUPABASE_ACCESS_TOKEN`.
5. Run governed least-privilege evidence.
6. Require PostgREST read/write success and forbidden-surface denial.
7. Re-run dependent Production workflows.
8. Revoke the superseded broad PAT only after all evidence passes.

## Evidence and logging

Credential values, Authorization headers, token hashes, raw Management API bodies, API-key payloads, JWT secrets, database passwords, and credential-bearing database URLs must never be emitted as evidence.

Safe evidence may contain only bounded status facts such as project ref, expected/observed HTTP status, permission class, state-change boolean, and explicit credential/raw-response logging booleans.

## Closure boundary

This authority does not claim that the GitHub secret has already been rotated. #1135 closes only after a scoped PAT is installed, least-privilege positive/negative Production evidence passes, dependent Production workflows remain healthy, and the superseded broad PAT is revoked.
