# Production Account-Deletion Worker PostgreSQL TLS Peer Verification V1

Status: **B3A STRICT RUNTIME CANARY PASS / PRODUCTION WORKFLOW ACTIVATION PENDING**

Watchtower-Track: security

Tracking: #1427

## Scope

This authority applies only to the dedicated account-deletion worker PostgreSQL path:

- login principal: `myeongha_worker_runtime`
- execution role: `myeongha_system_executor`
- governed Supabase Production project: `cnsfpcdiyofqvhpcegfc`

It does not change the worker's database privileges, deletion authority, retry policy, or hosted Auth authority.

## Confirmed gap

The Production privacy recovery canary has previously exercised the real dedicated worker path successfully. The current canonical worker URL path rebuilds the protected credential onto the governed Session Pooler and sets `sslmode=require`, after which the worker pool uses the legacy libpq-compatible helper.

Therefore the worker path has encrypted transport but does not yet require CA + hostname peer verification.

## B1 dormant authority

PR #1428 added a dormant worker-specific strict authority layer that:

- pins the exact Production project identity;
- pins the dedicated worker principal;
- validates direct vs Supavisor endpoint authority;
- reuses the SEC-01 strict TLS target;
- requires the governed Production Server root fingerprint;
- preserves `rejectUnauthorized=true`;
- preserves Node default hostname verification;
- emits only redacted evidence.

The B1 contract does not alter the active worker pool.

## B2 positive Production canary

The one-shot fixed read-only worker canary passed:

```text
workflow run id = 36502283223
workflow run number = 1
source main SHA = 8f1d97b454078f4e12deb22eab48fb258a30d2eb

endpoint kind = supavisor
endpoint authority pinned = true
tls mode = verify-full
peer verification = full
rejectUnauthorized = true
default hostname verification = true
root certificate pinned = true
connection succeeded = true
strict TLS handshake succeeded = true
transaction read only = true
principal match = true
execution role membership = true
write executed = false

database URL emitted = false
credential material emitted = false
root certificate PEM emitted = false
```

The same main push also completed CI #4149, including `db-authority-core` and the account-deletion worker PostgreSQL synthetic E2E, plus Governance #1253.

## B3A concrete worker runtime proof

PR #1434 fixed the dormant migration bridge so the historical protected worker credential carrier may remain `sslmode=require` while the internal strict target is reconstructed as `verify-full`. Connection-string SSL parameters are removed before the governed explicit TLS object reaches node-postgres.

PR #1435 armed the exact one-shot Production runtime canary. The canary passed:

```text
workflow run id = 36505985106
workflow run number = 1
source main SHA = dc3e4cef2af448fa97b393b232ff57fea5791da6

concrete worker pool = true
source TLS mode = require
effective TLS mode = verify-full
peer verification = full
rejectUnauthorized = true
default hostname verification = true
root certificate pinned = true
connection succeeded = true
transaction read only = true
principal match = true
execution role membership = true
write executed = false

database URL emitted = false
credential material emitted = false
root certificate PEM emitted = false
```

The same main push completed CI #4170 including `db-authority-core` and the account-deletion worker PostgreSQL synthetic E2E, Governance #1274, and Supabase Production #331.

This proves the concrete `createNodePostgresAccountDeletionWorkerPoolV1()` Production path can establish the governed strict TLS connection without changing deletion behavior.

## B3 next boundary

The Production privacy recovery workflow still does not bind the strict worker TLS activation environment, so its worker execution remains on the historical legacy path until a separate activation change is merged and exercised.

B3 must remain fail-safe:

1. keep the protected worker URL as credential carrier only;
2. provide explicit worker TLS activation authority and protected root CA binding;
3. reconstruct the governed Supavisor target with `verify-full`;
4. strip connection-string SSL parameters before node-postgres receives the explicit `ssl` object;
5. keep the worker principal and execution-role preflight unchanged;
6. prove the activated runtime in Production before removing transitional legacy support.

No Production worker DB credential or certificate material may be emitted.
