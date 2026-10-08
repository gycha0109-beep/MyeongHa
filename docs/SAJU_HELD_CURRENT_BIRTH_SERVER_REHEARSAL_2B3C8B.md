# Saju bridge 2B-3C-8B: current Birth Preview server rehearsal

Watchtower-Track: saju-bridge

## Scope

Bind the existing 8A server-only Preview HTTP/HMAC/PostgreSQL nonce ports to the existing authenticated current-Subject and Birth-Revision rehearsal. This is the first concrete server-side caller of the trust composition, limited to the fixed General Natal ('전체 사주') rehearsal.

## Contract

- The caller supplies **already verified** identity evidence, an owner-authorized Subject/Birth pool and independently provisioned protected Proof trust.
- The Subject/Birth pool cannot be the same pool object as the dedicated nonce registry pool. This identity check supplements, and does not replace, database role/GRANT verification.
- The existing 2B-3C-4 binder owns current Revision reads before and after the upstream Saju request, independent expectation pinning, HMAC proof verification and fail-closed rejection.
- The trust factory owns HTTPS transport, HMAC credentials and durable PostgreSQL nonce claims.
- No browser request, user-chosen Reading, manifest, env resolver, service listening, route registration, database role grant, or secret provisioning is introduced.
- Factory construction does not perform HTTP or PostgreSQL I/O.

## Verification

The synthetic runtime test checks exact composition, no construction-time I/O, no exposed credential properties, preservation of HOLD/block verdicts, and rejection of shared pools or invalid trust. Prior 2B-3C-4/5/7A/7B/8A tests retain responsibility for signed proof, Birth mutation, slot crossing, real PostgreSQL concurrency, replay and role failures.

## Explicitly pending

Operational nonce DB role membership, issuer deployment, staged real service credentials and HTTPS, secret rotation, multi-instance/failover testing, release/interpretation authorization and any Product/Commerce activation. No staging or production service is activated by this change.

```text
sourceAuthority = NOT_EVALUATED
releaseAuthorization = NOT_EVALUATED
canExecute = false
canPublish = false
canSell = false
```
