# MyeongHa Production Guest Bootstrap Activation Status V1

Status: **TTL DECIDED / PRODUCTION BINDING PENDING / ROUTE HOLD**  
Date: **2026-09-03**

## Decided authentication lifetime

`P0-PR-01A` is the authority for the production Guest bearer/session authentication lifetime:

```text
7 days
= 604800 seconds

MYEONGHA_GUEST_SESSION_TTL_SECONDS=604800
```

This decision governs the authentication lifetime of newly issued Guest credentials only. Parent `P0-PR-01` remains open for expired-Guest data deletion, backup retention, AI trace retention, commerce/legal retention, and cleanup cadence.

## Production binding gate

The governed binding operation is:

```text
.github/workflows/production-guest-bootstrap-ttl-binding.yml
```

Required inputs for the decided V1 policy:

```text
confirm = BIND_GUEST_TTL
ttl_seconds = 604800
```

The workflow mutates only `MYEONGHA_GUEST_SESSION_TTL_SECONDS` in Vercel production. It performs no DB password mutation, deployment, or route activation.

At the time of this status record, no successful production TTL-binding run has been verified. Therefore the route activation gate remains closed.

## Route preparation

Draft PR #329 prepares the thin root route:

```text
POST /api/session/bootstrap
```

Exact-head CI for #329 is green, but the PR is intentionally held in draft and must not be merged until the production TTL binding above succeeds and is verified.

## Activation sequence

```text
1. verify successful production TTL binding at 604800
2. mark #329 ready only after that proof
3. recheck latest main drift + exact-head CI + mergeability
4. squash-merge #329
5. verify merged-main CI and exact Vercel production deployment
6. POST /api/session/bootstrap -> fresh Guest credential
7. use that credential for GET /api/me -> 200 own Guest subject
8. unauthenticated GET /api/me -> 401 AUTH_REQUIRED
9. GET /api/health -> 200
10. verify cross-subject access remains denied
```

Raw Guest bearer material must not be written to repository files, logs, issue/PR comments, analytics, or ordinary status output.
