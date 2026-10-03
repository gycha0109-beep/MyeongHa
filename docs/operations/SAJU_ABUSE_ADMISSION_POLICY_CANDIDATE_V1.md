# Saju Abuse Admission Policy Candidate V1

Status: **NOT APPROVED**

Issue authority: **#1526**

This document defines the parts of the Saju abuse-control policy that can be fixed before a usable organic Production baseline exists. It is a candidate contract only. It does not authorize Production enforcement or any numeric request limit.

## Current evidence state

The repository already proves:

- both public Saju execution routes are enumerated;
- Member/Guest identity is verified before the abuse observation boundary;
- the canonical privacy-safe pseudonymous key is `myeongha-saju-abuse-client-hmac-sha256-v1`;
- admission/outcome telemetry is active in Production;
- admission/outcome correlation by `requestId` is Production-proven;
- the baseline analyzer is merged;
- the first recorded Production snapshot contains no usable organic authenticated sample after governed synthetic canaries are excluded.

Therefore the organic baseline remains **INSUFFICIENT** and the numeric policy remains **HOLD**.

## Candidate admission shape

The candidate strategy is PostgreSQL application admission, following the already Production-proven Member Auth admission pattern rather than introducing a new external store dependency.

Candidate properties:

- algorithm: anchored fixed window;
- bucket identity: `routeId + clientKey`;
- storage: PostgreSQL **UNLOGGED** ephemeral counter state;
- direct counter-table authority for the API executor: false;
- mutation authority: a dedicated security-definer admission command;
- storage-unavailable behavior: **fail-closed**;
- unavailable response: HTTP **503**, code `SAJU_ADMISSION_UNAVAILABLE`;
- denied response: HTTP **429**, code `RATE_LIMITED`;
- cache policy: `no-store`;
- `Retry-After`: derived from the authoritative admission reset timestamp.

The numeric window, request count, saturation bound, Retry-After ceiling, and cleanup retention are deliberately absent. They remain blocked on evidence or explicit Product authority.

## Placement

A future admission gate must execute only after Member/Guest credential verification has produced trusted identity evidence and the canonical pseudonymous client key.

For denied requests the gate must complete before:

1. canonical subject resolution;
2. Birth Profile read;
3. Saju calculation or reading upstream execution.

The current observe-only identity wrapper is not an enforcement boundary and must not silently become one.

## Client key

The canonical client-key derivation remains:

```text
apps/api/src/saju-abuse-observability.ts
fingerprintSajuAbuseClientV1
myeongha-saju-abuse-client-hmac-sha256-v1
```

The enforcement bucket candidate combines that key with `routeId`, so calculation and Preview Reading do not consume the same bucket.

Raw Member UUIDs, raw Guest credential hashes, raw bearer credentials, IP addresses, request bodies, Birth data, and Saju payloads are not counter-store keys and must not be persisted by this policy.

## Retry boundary

The current shared API client performs one network fetch per Saju request. It has no automatic retry loop.

The current calculation and Preview Reading upstream adapters also perform one upstream fetch per accepted execution and have no automatic retry loop.

The policy candidate therefore fixes:

- no automatic client retry on 429;
- no automatic client retry on admission-storage 503;
- no server-side automatic replay of an upstream Saju request;
- every accepted repeated request consumes admission;
- a denied request must not reach subject resolution, Birth Profile access, or the Saju upstream.

This bounds platform-generated retry amplification. Repeated end-user requests remain subject to the future approved admission quota.

## RATE_LIMITED observability

Future enforcement must emit privacy-safe `RATE_LIMITED` evidence without including:

- raw or pseudonymous client keys;
- raw Member/Guest identity;
- request body;
- Birth data;
- Saju payload;
- database configuration;
- exception message or stack.

The event should retain only the minimum route/request/status/timing information needed for operational review.

## Explicitly undecided fields

The following remain intentionally undecided:

```text
windowSeconds
requestLimit
blockedCountSaturation
retryAfterMaximumSeconds
counter cleanup retention
Production canary threshold assertions
```

No numeric threshold may be filled from the synthetic Production smoke traffic.

## Activation guard

Until all approval requirements are satisfied:

```text
policyAuthority = NOT_APPROVED
activationState = hold-baseline-insufficient
enforcementAuthorized = false
productionMutationAuthorized = false
```

No Production mutation is authorized by this document.

The required next authority event is either:

1. a usable organic baseline with an evidence-backed numeric decision; or
2. explicit Product authority approving the numeric policy despite insufficient organic traffic.

Only after that authority exists may the candidate be promoted to an approved policy and enforcement implementation.
