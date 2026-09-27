# Production PostgreSQL TLS Peer Verification V1

Status: **B2A AUTHORITY + VERCEL METADATA PROVEN / B2B RUNTIME CANARY PENDING / PRODUCTION ACTIVATION HOLD**

Watchtower-Track: security

Tracking: #1330

## Purpose

This record governs SEC-01: PostgreSQL transport encryption must not be confused with
PostgreSQL server peer identity verification.

The active application runtime already requires PostgreSQL transport not to be explicitly
disabled, but the current contract still admits connection strings that do not prove
certificate and hostname verification.

## Confirmed repository state

Current active runtime behavior on the SEC-01 baseline remains:

- `sslmode=require` is normalized with `uselibpqcompat=true`.
- Under current node-postgres / pg-connection-string libpq-compatible semantics, that means
  encrypted transport without CA/hostname verification when no root certificate is supplied.
- `sslmode=verify-ca` is preserved and represents CA verification without hostname verification.
- `sslmode=verify-full` is preserved and represents CA plus server identity verification.
- `parseProductionUserDataRuntimeConfigV1()` currently rejects only explicit
  `sslmode=disable`; B1 deliberately does not tighten the live parser yet.

This is therefore a repository **Security Gap** even before the live Production value is known.

Repository runtime versions at the B1 implementation point:

```text
Node engine = >=24 <25
pg          = 8.23.0
```

## External authority verified on 2026-09-28

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

Current node-postgres SSL documentation also warns that when a connection string includes
`sslmode`, `sslcert`, `sslkey`, or `sslrootcert`, an explicit driver `ssl` object can be
replaced by connection-string parsing. B1 therefore validates the source mode first and then
removes the mode before passing CA material as an explicit driver TLS option.

Relevant references:

- https://node-postgres.com/features/ssl
- https://nodejs.org/download/release/v24.21.0/docs/api/tls.html
- https://nodejs.org/download/release/v24.21.0/docs/api/crypto.html

## Production root authority verified; live binding remains unverified

The governed Production project ref is:

```text
cnsfpcdiyofqvhpcegfc
```

On 2026-09-28 KST, the official Server root certificate downloaded from the governed
Supabase Production dashboard was supplied through the GitHub `production` Environment
secret and validated by the exact one-shot authority bridge.

Pinned SHA-256 fingerprint:

```text
80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA
```

Authority evidence:

```text
workflow run id = 36351386841
source main SHA = 4efdff400d415a7cfbe2dd2c8e003e228351da02
certificate parse = pass
certificate valid now = true
certificate private key present = false
Session Pooler host shape valid = true
Production database connection attempted = false
Production database URL read = false
Production database URL mutated = false
Production Vercel binding mutated = false
certificate PEM emitted = false
credential material emitted = false
```

The one-shot bridge is removed in the same governed change that pins this fingerprint.

The connected Vercel surface does not expose a safe environment-value readback action.
A one-shot GitHub Production metadata bridge therefore queried only the governed Vercel
project environment metadata endpoint without requesting decryption.

On 2026-09-28 KST, run `36354168577` established:

```text
MYEONGHA_DATABASE_URL exists = true
target = production
type = sensitive
value read = false
decrypt requested = false
preferred B2B execution = vercel-runtime-required
```

Because the binding is `sensitive`, B2B must execute inside the Vercel Production runtime.
The credential must not be copied or decrypted into GitHub Actions.

This metadata evidence still does not reveal the live URL's current `sslmode`.
That posture must be evaluated in-process without emitting the URL.

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

## Phase B1 — dormant strict target contract

B1 adds a strict target builder without changing the active Production parser or pool.

Implementation:

```text
apps/api/src/production-postgres-tls-peer-verification.ts
test/production-postgres-tls-peer-verification.test.ts
config/operations/production-postgres-tls-peer-verification-v1.json
```

The target contract requires all of the following before it can produce driver TLS material:

```text
governed project ref
+
contract version
+
sslmode=verify-full
+
exactly one parseable X.509 root certificate
+
uppercase colon-delimited SHA-256 certificate fingerprint pin
+
rejectUnauthorized=true
+
Node default hostname verification left intact
```

The builder rejects:

```text
missing/disable/no-verify/prefer/require/verify-ca
ambiguous sslrootcert/sslcert/sslkey/sslpassword query settings
uselibpqcompat overrides
empty/malformed/multiple certificate PEM input
private-key material
certificate fingerprint mismatch
non-governed authority records
```

After source validation, `sslmode` is removed from the driver connection string and the CA is
supplied separately through the node-postgres `ssl` object. This prevents connection-string
SSL parsing from replacing the explicit strict TLS object.

The redacted evidence object contains only:

```text
contract version
project ref
tls mode = verify-full
peer verification = full
rejectUnauthorized = true
root certificate SHA-256 fingerprint
root certificate pinned = true
```

It does not contain the database URL, database host, credentials, or certificate PEM.

### B1 is deliberately dormant

B1 does **not**:

- change `parseProductionUserDataRuntimeConfigV1()`;
- change `createNodePostgresSubjectPoolV1()`;
- add a required Production environment variable;
- alter `MYEONGHA_DATABASE_URL`;
- alter Vercel Production;
- claim that the official project Server root certificate has been obtained;
- pin a fabricated Production certificate fingerprint.

The operation contract therefore records:

```text
productionActivation=false
productionBindingMutated=false
productionFingerprint256=null
sourceStatus=pending-supported-supabase-authority
```

## Phase B2A — official authority intake preflight

B2A infrastructure is manual-only and does not connect to PostgreSQL.

Implementation:

```text
.github/workflows/production-postgres-tls-peer-preflight.yml
scripts/operations/run-production-postgres-tls-peer-preflight.mjs
test/production-postgres-tls-peer-preflight.test.ts
```

The workflow is valid only when all dispatch authority is exact:

```text
event = workflow_dispatch
ref = refs/heads/main
watchtower_track = ops
confirm = VERIFY_POSTGRES_TLS_PEER_B2A
GitHub Environment = production
```

The Production Environment must provide:

```text
SUPABASE_PRODUCTION_SERVER_ROOT_CERT_PEM
SUPABASE_PRODUCTION_SESSION_POOLER_HOST
VERCEL_TOKEN
```

B2A deliberately does not use `SUPABASE_DB_PASSWORD`.

The Server root certificate must be obtained from the governed Supabase Production
project dashboard through the supported Database Settings / SSL certificate surface.
The connected Supabase account available to this track still does not expose project
`cnsfpcdiyofqvhpcegfc`, so the repository must not fabricate or infer the Production
certificate.

The preflight validates, without emitting PEM contents:

- exactly one PEM encoded X.509 certificate;
- no private-key material;
- CA basic constraint;
- current validity interval;
- canonical SHA-256 fingerprint;
- governed bare `*.pooler.supabase.com` Session Pooler host shape.

It also calls the Vercel project environment metadata endpoint without requesting
decryption. It proves only that exactly one protected `MYEONGHA_DATABASE_URL` binding
targets Production and records whether its type is `sensitive` or `encrypted`.
The environment value is ignored and never emitted.

The B2A evidence is restricted to the certificate fingerprint and redacted booleans /
enum metadata. The workflow uploads no artifact.

B2A root-authority intake has now passed through the exact one-shot security bridge.
The repository pins only the safe SHA-256 fingerprint and does not retain certificate PEM.

The Vercel metadata-only preflight has now passed through the exact one-shot security
bridge. The bridge requested no decryption and did not inspect the database URL value.

Current B2A state:

```text
productionFingerprint256 = 80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA
sourceStatus = official-supabase-dashboard-preflighted
Vercel database env type = sensitive
preferred B2B execution = vercel-runtime-required
Production database connection attempted = false
Production database URL read = false
Production binding mutated = false
```

## Phase B2B — Production-safe connectivity canary

B2B may begin only after the exact official Server root certificate fingerprint for
project `cnsfpcdiyofqvhpcegfc` is pinned by repository authority **and** the governed
execution path can access the existing Production database binding without exporting or
logging credential material.

The canary must be read-only and must prove:

- TLS negotiation succeeds;
- certificate chain verification succeeds;
- hostname verification succeeds;
- connected login principal remains the governed `myeongha_runtime`;
- no database URL, password, or certificate PEM is emitted.

The Vercel Production database binding is confirmed `sensitive`. B2B therefore must run
inside the Vercel Production runtime. Exporting, decrypting, or copying the database URL
into GitHub Actions is forbidden for this path.

The canary must not mutate the live Production binding.

## Phase B3 — Production activation

Do not tighten Production to `verify-full` until all are true:

1. the official Server root certificate for project `cnsfpcdiyofqvhpcegfc` is obtained
   through a supported Supabase authority;
2. its exact SHA-256 fingerprint is pinned by governed repository authority;
3. a Vercel-compatible certificate delivery mechanism is defined without putting credential
   material in the repository;
4. the B2 read-only Production-safe Session Pooler canary passes;
5. rollback preserves the prior known-working binding without credential disclosure.

Only after positive evidence is recorded may the live Production binding be changed.

## Phase B4 — permanent fail-closed enforcement

After B3 succeeds, the ordinary Production runtime may be changed to reject weaker modes.

Target rejection set:

```text
sslmode absent
disable
no-verify
prefer
require
verify-ca
unknown

root CA missing
root CA malformed
root CA fingerprint mismatch
```

At that point the legacy `sslmode=require -> uselibpqcompat=true` compatibility path may be
removed from the Production execution path.

It must not be removed before positive Production peer-verification evidence exists.

## Forbidden shortcuts

- no Management PAT fallback;
- no Management API pooler discovery;
- no disabling certificate validation to make the canary pass;
- no `rejectUnauthorized: false` as the final state;
- no copying database credentials or full connection URLs into issues, CI logs, or evidence;
- no certificate PEM emission into logs or artifacts;
- no fabricated or guessed Production certificate fingerprint;
- no Production binding mutation before positive peer-verification connectivity evidence.
