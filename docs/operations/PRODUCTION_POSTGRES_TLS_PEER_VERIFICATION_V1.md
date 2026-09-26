# Production PostgreSQL TLS Peer Verification V1

Status: **SECURITY GAP / PRODUCTION ACTIVATION HOLD**

Watchtower-Track: security

Tracking: #1330

## Purpose

This record governs SEC-01: PostgreSQL transport encryption must not be confused with
PostgreSQL server peer identity verification.

The active application runtime already requires PostgreSQL transport not to be explicitly
disabled, but the current contract still admits connection strings that do not prove
certificate and hostname verification.

## Confirmed repository state

Current runtime behavior on the SEC-01 baseline:

- `sslmode=require` is normalized with `uselibpqcompat=true`.
- Under current node-postgres / pg-connection-string libpq-compatible semantics, that means
  encrypted transport without CA/hostname verification when no root certificate is supplied.
- `sslmode=verify-ca` is preserved and represents CA verification without hostname verification.
- `sslmode=verify-full` is preserved and represents CA plus server identity verification.
- `parseProductionUserDataRuntimeConfigV1()` currently rejects only explicit
  `sslmode=disable`; Phase A deliberately does not tighten the live parser yet.

This is therefore a repository **Security Gap** even before the live Production value is known.

## External authority verified on 2026-09-26

Supabase current documentation supports SSL peer verification for the Session Pooler and
documents a connection using:

```text
sslmode=verify-full
+
project Server root certificate
+
Session Pooler hostname
```

Relevant official references:

- https://supabase.com/docs/guides/database/psql
- https://supabase.com/docs/guides/database/ssl-enforcement
- https://supabase.com/docs/guides/database/connecting-to-postgres

node-postgres / pg-connection-string current libpq-compatibility reference:

- https://github.com/brianc/node-postgres/blob/master/packages/pg-connection-string/README.md

## Production control remains unverified

The governed Production project ref is:

```text
cnsfpcdiyofqvhpcegfc
```

The connected Supabase account available to this track does not expose that project.
The connected Vercel surface identifies the `myeongha` project but does not currently
provide a safe environment-value readback action.

Therefore this track has not independently established whether the live
`MYEONGHA_DATABASE_URL` currently uses:

```text
absent
require
verify-ca
verify-full
other
```

No credential or connection URL may be printed merely to answer that question.

## Phase A — redacted posture evidence

`inspectProductionDatabaseTlsPostureV1()` classifies only non-secret posture:

```text
mode
peerVerification = none | ca_only | full | unknown
explicitRootCertificateConfigured = boolean
```

`summarizeProductionUserDataRuntimeConfigV1()` may expose only that posture together with
the existing redacted configuration summary.

It MUST NOT expose:

- database URL;
- hostname;
- username/password;
- root-certificate path or contents;
- Supabase API key;
- Guest fingerprint secret.

Phase A is diagnostic only. It MUST NOT make an unverified Production binding fail to boot.

## Phase B — activation gate

Do not tighten Production to `verify-full` until all are true:

1. the official Server root certificate for project `cnsfpcdiyofqvhpcegfc` is obtained
   through a supported Supabase authority;
2. a Vercel-compatible certificate delivery mechanism is defined without putting secret
   credentials in the repository;
3. a read-only Production-safe Session Pooler canary proves:
   - TLS negotiation succeeds;
   - certificate chain verification succeeds;
   - hostname verification succeeds;
   - connected login principal remains the governed `myeongha_runtime`;
4. rollback preserves the prior known-working binding without credential disclosure;
5. only after positive evidence is recorded does the runtime parser reject weaker modes.

## Forbidden shortcuts

- no Management PAT fallback;
- no Management API pooler discovery;
- no disabling certificate validation to make the canary pass;
- no `rejectUnauthorized: false` as the final state;
- no copying database credentials or full connection URLs into issues, CI logs, or evidence;
- no Production binding mutation before positive peer-verification connectivity evidence.
