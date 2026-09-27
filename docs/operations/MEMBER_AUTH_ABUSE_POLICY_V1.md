# MyeongHa Member Auth Abuse Policy V1

Status: **REPOSITORY CONTRACT / PRODUCTION ACTIVATION HOLD**

Issue: `#1332`

## Objective

Establish a per-client abuse admission boundary for the unauthenticated or pre-session Member Auth ingress before repeated requests consume MyeongHa Function and Supabase Auth resources.

The governed ingress set is intentionally exact:

```text
POST /api/auth/sign-in
POST /api/auth/sign-up
POST /api/auth/refresh
```

`/api/auth/sign-out` is outside V1 because it already requires an Authorization bearer before the upstream logout call.

## Existing application safeguards

The shared auth proxy already bounds request bodies, applies an absolute ingress-body completion deadline, bounds upstream JSON responses, applies an upstream deadline, sanitizes upstream failures, and uses the breached-password guard where applicable. SEC-02 is therefore an edge admission-control gap rather than a replacement for those resource controls.

## Governed Phase A contract

Each endpoint owns an independent Vercel Firewall rate-limit rule and therefore an independent bucket:

```text
algorithm = fixed_window
window    = 60 seconds
limit     = 30 requests
key       = IP
observe   = log
enforce   = rate_limit
```

The **30 requests per 60 seconds per IP** value is a provisional pre-launch bound, not a claim about normal legitimate traffic.

V1 adds no durable IP or fingerprint persistence, no application-local counter, no Redis/Upstash dependency, no CAPTCHA, and no automatic client retry after a 429.

## Why the boundary is at Vercel

The browser reaches MyeongHa first and MyeongHa then proxies to Supabase Auth using the governed publishable API key. This policy adds **no Supabase secret key** merely to forward authoritative client-IP information upstream. The abuse boundary is therefore placed at the Vercel edge, before the MyeongHa auth route executes.

## Managed WAF registry

`config/operations/vercel-waf-managed-rate-limit-rules-v1.json` is the ownership authority for MyeongHa-managed rate-limit rule names.

A Production operation fails closed when it sees:

- an unregistered active rate-limit rule;
- a duplicate managed rule name;
- a managed rule whose repository contract has drifted;
- an active managed rule whose registry authority is `hold`;
- a missing non-target rule whose registry authority is `production-active`.

The existing Guest bootstrap rule remains `production-active`. All three Member Auth rules remain `hold` in Phase A.

## Phase A control-plane boundary

Phase A deliberately has **no Firewall mutation implementation** for Member Auth. The manual Production workflow supports a read-only `verify` path. Selecting `observe`, `enforce`, or `disable` fails closed before any Firewall mutation can occur.

No scheduled evidence workflow is admitted while the policy is still HOLD.

## Phase B activation requirements

Phase B is a separate reviewed change. It must not hard-code an unverified Vercel plan quota. Capability is proven against the actual Firewall draft validation response.

The activation sequence must:

1. read the complete active Firewall configuration;
2. preserve unrelated rules;
3. stage all three Member Auth rules in the same draft;
4. require every candidate rule to be valid;
5. never activate a partial three-rule draft;
6. perform a **single activation** only after the complete draft is exact;
7. read back the active configuration;
8. run route-safe synthetic canaries;
9. roll a failed enforce attempt back to observe without overwriting unrelated Firewall configuration.

The three endpoint buckets must remain independent. Final canary evidence must demonstrate that exhausting one endpoint does not consume another endpoint's bucket.

Sign-up canary design requires additional care because a syntactically valid repeated signup can create hosted-auth side effects. Phase A does not pretend that risk is solved; the Phase B canary must prove its mutation safety before Production enforcement is authorized.

## Closure boundary

Closing #1332 requires Production activation evidence, exact active-rule readback, independent-bucket canary evidence, and a documented rollback result. Merging this Phase A contract alone does not close SEC-02.
