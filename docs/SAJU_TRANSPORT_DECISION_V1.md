# Saju Transport Decision V1 — P0-SA-01

Status: **DECIDED**

Decision date: **2026-09-03**

Decision ID: `P0-SA-01`

## Decision

MyeongHa V1 will consume the governed Saju **production calculation-only** boundary through an **authenticated internal HTTP service**.

```text
MyeongHa server runtime
→ authenticated HTTPS
→ Saju calculation-only service
→ POST /api/calculations
→ governed production-calculation response
→ MyeongHa production calculation ingress
```

The alternative `version-pinned package in-process` path is not selected for V1.

This decision chooses transport only. It does **not** authorize Saju interpretation, ProductReadingResponse finalization, Reading persistence, Character grounding, compatibility, or `/api/readings` production activation.

## Why this option

The current repositories already contain the matching transport seam:

- `gycha0109-beep/Saju` exports the production calculation-only host and its `POST /api/calculations` contract.
- MyeongHa already contains `SajuProductionCalculationHttpAdapterV1` for that exact endpoint shape.
- MyeongHa already contains `myeongha-saju-production-calculation-ingress-v1`, which validates the producer response as `semanticAuthority = calculation_only` and `interpretationAuthorized = false`.
- The Saju repository currently has no GitHub Release and no package-publish pipeline; its package is private and versioned `0.0.0`, so choosing the package path would first require a new distributable artifact/release authority before MyeongHa could consume it reproducibly.
- Keeping the engine in its own runtime avoids copying or vendoring Saju semantic authority into the MyeongHa repository while preserving an independently deployable producer revision.

The extra network boundary is accepted only with the security and failure rules below.

## Scope

### Authorized by this decision

```text
Birth Profile current revision
→ MyeongHa server
→ authenticated Saju calculation service
→ governed calculation-only response
→ MyeongHa calculation ingress artifact
```

### Not authorized by this decision

```text
/api/readings production activation
ProductReadingResponse semantic finalization
reading_refs creation from transport success
Character Saju grounding
LLM Saju fallback
compatibility / second-Birth transport
interpretation or narrative generation
```

Existing `SRC-08`, `SRC-09`, and `SRC-33` gates remain independent and unchanged.

## Producer runtime contract

The production Saju deployment must use the calculation-only host composition.

Required network surface for V1:

```text
GET  /healthz
POST /api/calculations
```

The deployment must not wire a Reading host dependency merely because the underlying host implementation can support one. `/api/readings` remains unavailable until separately authorized.

The deployed producer revision must be an explicitly recorded exact Git SHA that passes the Saju repository verification suite. MyeongHa does not infer semantic compatibility from deployment freshness. The returned calculation response must still pass the exact producer-schema/runtime/policy checks in `myeongha-saju-production-calculation-ingress-v1`.

## Service authentication

The Saju calculation service is server-to-server only.

V1 authentication uses an opaque, high-entropy service bearer credential over HTTPS:

```text
Authorization: Bearer <service credential>
```

Consumer binding:

```text
MYEONGHA_SAJU_SERVICE_ORIGIN
MYEONGHA_SAJU_SERVICE_BEARER
```

Producer binding names are producer-owned, but the producer must support an active credential plus a bounded previous credential during rotation so rotation does not require an unauthenticated window.

Required invariants:

- browser/mobile clients never receive the internal service origin credential;
- the raw credential is never written to PostgreSQL, response bodies, application logs, workflow logs, or analytics;
- comparison is performed server-side with a timing-safe verifier over decoded credential material of equal length;
- missing, malformed, or invalid credentials fail closed before calculation execution;
- authentication failure is not distinguishable through secret-bearing error detail;
- redirects are not followed by the MyeongHa consumer;
- HTTPS is mandatory in production;
- secret rotation stages the new producer credential first, switches the MyeongHa consumer second, then retires the previous producer credential after verification;
- changing the authentication mechanism requires a new explicit transport-security decision rather than silently weakening this contract.

## Request correlation, timeout, retry

Every MyeongHa service request must carry a server-generated correlation identifier that is safe to log and contains no Birth input or credential material.

V1 rules:

- calculation execution is side-effect-free at the Saju service boundary;
- MyeongHa owns the request timeout and keeps it bounded by the existing production runtime maximum;
- a timeout/network failure never falls back to generic AI/LLM Saju generation;
- automatic unbounded retry is forbidden;
- if a higher orchestration layer retries the same logical calculation, it reuses its logical request identity and remains semantically equivalent to a repeated side-effect-free calculation request;
- upstream error bodies are not passed through to Product clients.

## Version and authority pinning

Transport success is insufficient.

MyeongHa accepts a response only when the existing production calculation ingress validates all governed producer metadata and the response matches the initiating Birth revision.

At minimum, activation evidence must record:

```text
Saju repository exact deploy SHA
Saju CI result for that SHA
Saju deployment identifier / production origin
MyeongHa repository exact deploy SHA
producer HTTP schema/runtime/policy identity
MyeongHa ingress version
```

A newer Saju deployment is not automatically trusted merely because its endpoint remains reachable.

## Failure policy

```text
missing service configuration
→ fail startup/composition closed

service authentication failure
→ no calculation

network / timeout / non-200 / non-JSON
→ SAJU_TEMPORARILY_UNAVAILABLE

response fails governed ingress
→ no calculation artifact promotion

service unavailable
→ no LLM/generic Saju fallback
```

Raw upstream secret-bearing or implementation-specific error detail must not escape into the MyeongHa Product response.

## Deployment model

The Saju calculation service is deployed independently from the MyeongHa web/API project.

Production activation sequence:

```text
1. implement producer service-auth gate and tests
2. implement MyeongHa authenticated consumer header/correlation support and tests
3. deploy exact verified Saju calculation-only revision
4. bind producer service credentials
5. verify /healthz without exposing credentials or semantic data
6. bind MYEONGHA_SAJU_SERVICE_ORIGIN + MYEONGHA_SAJU_SERVICE_BEARER to MyeongHa production
7. deploy thin MyeongHa /api/me/saju/calculation route
8. unauthenticated MyeongHa route smoke -> 401
9. authenticated current-subject calculation smoke -> 200 calculation-only artifact
10. verify no Reading/Character persistence or interpretation promotion occurs
```

The service must not be exposed as a browser-facing product API contract. Network reachability alone does not confer authorization; the service credential gate remains mandatory even if the deployment platform assigns a public HTTPS URL.

## Migration impact

No PostgreSQL migration is required by this transport choice.

Required implementation changes are limited to:

- Saju calculation-only host service authentication and correlation handling;
- MyeongHa service credential configuration and authenticated HTTP adapter headers;
- production binding/deployment verification;
- thin current-subject calculation route activation after producer readiness.

Reading DB authority remains unchanged and blocked by its existing semantic gates.

## Rollback / change policy

Operational rollback may point MyeongHa back to the last verified compatible Saju calculation service deployment while keeping the same authenticated transport contract.

Changing from internal HTTP service to an in-process package, enabling `/api/readings`, weakening service authentication, or bypassing the governed MyeongHa ingress requires a new explicit decision/review. No silent fallback is permitted.
