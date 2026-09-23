# MyeongHa Guest Bootstrap Abuse Policy V1

Status: **PRODUCTION OBSERVE ACTIVE / EVIDENCE & TRAFFIC REVIEW PENDING**

Issue: `#646`

## Objective

Bound unauthenticated fresh-Guest durable-row amplification at the Vercel edge before `public.cmd_create_guest_session_runtime_v1` can allocate `subjects` and `guest_sessions` rows.

## Governed V1 contract

```text
route        = /api/session/bootstrap
method       = POST
algorithm    = fixed_window
window       = 60 seconds
limit        = 30 requests
key          = ip
observe      = log
enforce      = rate_limit
retry        = no automatic application retry
IP retention = no MyeongHa-owned durable persistence
```

The threshold is an initial V1 abuse bound, not a statement that 30 requests/minute is normal product behavior. Current same-tab browser behavior already single-flights concurrent bootstrap calls, and an existing Guest or Member identity avoids fresh Guest creation.

## Control-plane sequence

1. merge the reviewed repository contract;
2. dispatch `Production Guest Bootstrap Abuse Policy` with `mode=observe`;
3. verify exact active rule/config readback;
4. inspect legitimate bootstrap traffic before changing the mode;
5. promote to `enforce` only through another reviewed/recorded operator action;
6. verify excess requests receive the Vercel rate-limit response before application persistence;
7. keep the scheduled evidence workflow green for drift detection.

## Production observe evidence

Authoritative activation evidence:

```text
run                   = 35886551596
main SHA              = 6bc5e1f96415ab94c78a0de13331c5ecdb1952eb
mode                   = observe
active config id       = waf_HPi141YAu0mK
active config version  = 3
active rule id         = rule_myeongha_guest_bootstrap_rate_limit_v1_fAj5rl
rate-limit action      = log
```

The run verified the governed Vercel project, exact draft mutation/readback, draft activation, and exact post-activation active-rule readback. Observe mode is therefore active and inspectable; it is not inferred from generic DDoS protection.

A first runtime-log review immediately after activation found no `/api/session/bootstrap` traffic in the inspected post-activation window. That is not evidence that the threshold is safe for legitimate traffic, so it does **not** authorize promotion to `enforce`. Promotion remains gated on legitimate-traffic review plus a separately reviewed/recorded operator action.
The scheduled evidence workflow remains pinned to `expected_mode=observe` while this review gate is open.

## Safety boundaries

- no process-local counters;
- no database IP/fingerprint retention table;
- no Redis/Upstash dependency in V1;
- no global Guest population cap;
- no country/User-Agent/JA4 blacklist;
- no CAPTCHA/BotID change;
- no Guest TTL change;
- no Supabase Auth rate-limit change;
- no automatic client retry after a 429;
- a pre-existing different Vercel rate-limit rule causes the mutation workflow to fail closed instead of overwriting it.

## Production canary after enforce

Use invalid bootstrap bodies such as `{"probe":true}` so requests that pass the edge fail as `400 INVALID_REQUEST` before Guest persistence. The expected sequence is normal 400 responses until the configured bucket is exhausted, followed by edge rate limiting. Compare aggregate Guest row counts before/after the canary; the canary itself must create zero durable Guest rows.

A final real bootstrap is allowed only after the bucket window has cleared, followed by `GET /api/me` continuity verification.

## Closure boundary

Closing #646 proves a finite Production edge bound for this exact unauthenticated persistence ingress. It does not claim complete bot prevention, global exact request counting, or protection of unrelated routes.
