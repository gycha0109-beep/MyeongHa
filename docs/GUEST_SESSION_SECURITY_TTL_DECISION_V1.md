# MyeongHa Guest Session Security TTL Decision V1

> Decision ID: `P0-PR-01A`  
> Parent: `P0-PR-01`  
> Status: **DECIDED**  
> Decided at: **2026-09-03**

## Decision

The production Guest bearer/session authentication lifetime is:

```text
7 days
= 604800 seconds
```

Production binding:

```text
MYEONGHA_GUEST_SESSION_TTL_SECONDS=604800
```

## Scope

This decision governs only the lifetime during which an unconsumed Guest bearer may authenticate a Guest session.

It does **not** decide:

- deletion timing for expired Guest subjects or their product data
- backup retention
- AI trace retention
- commerce/legal/accounting retention
- post-expiry anonymization or destructive cleanup cadence

Those remain under parent `P0-PR-01`.

## Rationale

Primary product/source authority requires Guest sessions to have a TTL and forbids indefinite Guest retention, but leaves the concrete duration to privacy/operations policy.

The initial production security choice is seven days because it:

- supports short-term return continuity through the D1/D7 product window;
- avoids keeping a browser/mobile bearer valid through a D30-style long-retention window;
- limits exposure if an opaque Guest bearer is copied from client storage;
- remains long enough for a no-login user to leave and resume the initial value experience;
- keeps authentication expiry independent from later data-retention/deletion policy.

## Security invariants

```text
raw Guest bearer
→ server-generated opaque credential
→ never stored in PostgreSQL
→ HMAC fingerprint only in guest_sessions.token_hash

expires_at
= issued_at + 604800 seconds

expired / consumed / claimed session
→ cannot authenticate
```

The server remains authoritative for `expires_at`. Clients cannot request or extend TTL.

## Change policy

Changing the production Guest authentication TTL requires a new explicit decision record. Do not silently lengthen the TTL through environment changes or client behavior.

Changing the environment value governs newly issued credentials. Existing `expires_at` values remain authoritative unless a separately reviewed revocation/migration operation explicitly changes them.

## Activation sequence

```text
1. merge this decision
2. bind MYEONGHA_GUEST_SESSION_TTL_SECONDS=604800
   through .github/workflows/production-guest-bootstrap-ttl-binding.yml
3. verify the production binding
4. expose the thin root /api/session/bootstrap route
5. production smoke:
   POST /api/session/bootstrap
   → fresh Guest bearer
   → GET /api/me with that bearer
   → 200 own Guest subject
6. verify unauthenticated /api/me remains 401
7. verify /api/health remains 200
```
