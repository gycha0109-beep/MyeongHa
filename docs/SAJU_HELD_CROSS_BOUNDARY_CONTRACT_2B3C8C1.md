# Saju bridge 2B-3C-8C-1 — server rehearsal integration contract

Watchtower-Track: saju-bridge

## Status

Synthetic end-to-end **contract rehearsal only**, not an actual cross-repository deployment or production authorization. The 8B server-internal caller remains unmounted.

## Executed boundary (one call)

1. An already-verified member identity enters the existing owner-authorized PostgreSQL Subject + current self Birth Revision reader.
2. The 8B caller fixes the Reading to `전체 사주`, generates an internal nonce and invokes only the protected HTTPS/Bearer proof path `/api/internal/preview/source-readings`.
3. An independent test double signs the **Saju 2B-3C-2 wire contract** using the documented domain-separated HMAC, bound request, nonce, response and source material. It is NOT the live Saju issuer.
4. The existing 8A verifier checks signature, source material and timing; its separate nonce pool attempts an atomic digest claim behind `SET LOCAL ROLE myeongha_saju_proof_nonce_runtime`.
5. The binder separately rereads authenticated Subject + current Birth and refuses a changed revision.
6. All results retain the same HOLD flags and expose no credential or raw Birth date.

## Negative matrix

Tampered response, wrong HMAC key, issuer, nonce, executed request, expiry, attempted release/Commerce override and HTTP 401 are blocked before a nonce write. Unavailable nonce DB and denied PostgreSQL role fail closed. A revision change after a valid proof and nonce claim is also blocked. A repeated signed envelope fails the shared replay claim.

The test double uses synthetic Subject/nonce pool connections to verify composition and failure routing. It **does not prove** real PostgreSQL RLS, concurrency, network TLS identity, Saju semantic validity, actual Saju HTTP execution or multi-replica failover. Real PostgreSQL claims/RLS already have a separate 7B integration gate; they do not become staging evidence through this test.

## Real staging gate remains HOLD

To perform 8C-2 safely, provision separately and verify:
- Actual Saju protected issuer deployment, HTTPS service origin, service-to-service allowlist, independent service Bearer and HMAC verification key.
- Independent PostgreSQL nonce runtime connection principal, permitted `SET LOCAL ROLE`, actual migration/RLS/unique constraint and managed expired-row GC.
- A disposable authenticated test Subject + Birth Revision, transient/replay/rotation/failover matrix, bounded request/response logging that excludes raw Birth and credentials.
- An explicit staging change authorization and observation record. Never infer these from repository CI or synthetic fixtures.

No route mount, environment resolver, credential provision, release/interpretation authorization or Commerce path is created by 8C-1.

```text
sourceAuthority = NOT_EVALUATED
releaseAuthorization = NOT_EVALUATED
canExecute = false
canPublish = false
canSell = false
```
