# Saju bridge 2B-3C-8C-2A — protected Preview staging preflight

Watchtower-Track: saju-bridge

## Objective

Inspect the **existing** MyeongHa 8B server-internal Proof trust options against a separately reviewed, non-secret Saju 2B-3C-2 wire descriptor. This is a **zero-I/O preflight**, never a staging deployment, a live proof verification or an authority grant.

- MyeongHa source baseline: `apps/api/src/saju-held-current-birth-server-rehearsal-v1.ts` → existing 8A trust factory; HTTPS-only protected `POST /api/internal/preview/source-readings`, signer trust, separate PostgreSQL nonce claim.
- Saju source baseline: `src/host/source-reading-proof-issuer-http.ts` and `src/reading/source-reading-transport-proof.ts`; issuer signs Preview `held` only, with separate service Bearer and HMAC.
- Nonce DB baseline: `supabase/migrations/1540_saju_source_proof_nonce_claim_authority_v1.sql` and `test/db/saju_source_proof_nonce_claim_concurrency.sh`.
- The existing **Production calculation** env `MYEONGHA_SAJU_SERVICE_ORIGIN`/`MYEONGHA_SAJU_SERVICE_BEARER` is **not** evidence of a protected proof issuer. No reuse or automatic mapping is allowed.

## New zero-I/O checker

`assessSajuHeldStagingPreflightV1({ client, sourceDescriptor })` checks:

1. Server-only 8B construction contract (origin must be HTTPS, separate Subject/nonce pools, valid signer bytes, issuer/audience/key IDs and timeout; never connects or issues HTTP).
2. Service Bearer and HMAC secret bytes are not identical (the two independent secrets still require separately controlled provisioning).
3. The non-secret source descriptor has exactly the documented HTTP route, envelope/proof versions, issuer, audience, key ID and maximum 120-second TTL. The source descriptor is a **reviewed contract input**, **not** a live source assertion or a place to copy a signing secret.

The report exposes **only fixed PASS/BLOCKED check names and static external gate names**, never service Origin, source/subject data, signer secret, Bearer, nonce, hashes or customer data. Output differentiates `configuration=VALID` from `stagingConnection=NOT_VERIFIED` and **always** holds `stagingAdmission=HOLD` even when all contracts match. Factory preflight is not called from a public route or production readiness endpoint.

## Mandatory independent staging evidence (8C-2B/2C HOLD)

| Gate | Owner | Required observation |
| --- | --- | --- |
| Restricted issuer actually deployed | Saju + deployment | Protected route only; no public routing or public reading |
| HTTPS peer validation and service allowlist | Deployment | Actual TLS peer and ingress boundaries |
| Dedicated Bearer and HMAC key provisioning | Saju/MyeongHa operations | Secret custody, issuer/key ID pairing, expiry, rotation plan; no raw values in log |
| Independent nonce DB runtime login membership | DB Authority | Runtime principal can `SET LOCAL ROLE myeongha_saju_proof_nonce_runtime`; not broad API service role |
| Schema/RLS/unique index/GC in **target** DB | DB Authority | Real deployed migration, privilege inspection, expiration policy |
| Disposable authorized Subject/Birth fixture | MyeongHa | Verified identity, authorized current self Revision, revision mutation test |
| Real protected HTTP/replay/rotation/failover tests | Saju/MyeongHa/DB | Once-only claim under simultaneous replicas and failure matrix |
| Explicit staging change authorization | Deployment | Named rollout and observation record, rollback plan |

No staging endpoint, service credential, secret provider, privilege GRANT, key rotation, GC job or route mount is created by this PR. Synthetic PASS does not supersede independent deployment evidence.

## Validation and acceptance

- Unit tests: no I/O at construction; positive contract equality, route/version/issuer/audience/key ID/TTL drift; shared pools; unsafe origin/short key; identical Bearer/HMAC rejected; no secret disclosure; unconditional HOLD.
- Existing scoped CI and one SHA-pinned integrated CI, no new workflow.
- 8C-2A A: checker/test/contract document implemented; B: scoped/integrated CI PASS; C: HEAD/BASE-pinned Squash merge and main reread.
- 8C-2B is **not automatically authorized** even if 8C-2A is merged.

```text
sourceAuthority = NOT_EVALUATED
releaseAuthorization = NOT_EVALUATED
canExecute = false
canPublish = false
canSell = false
```
