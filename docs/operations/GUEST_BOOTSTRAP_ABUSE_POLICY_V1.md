# MyeongHa Guest Bootstrap Abuse Policy V1

Status: **PRODUCTION ENFORCE ACTIVE / CANARY VERIFIED**

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
4. while the MVP is pre-launch, record that no legitimate end-user traffic is expected and do not wait for a traffic sample that cannot exist;
5. promote to `enforce` only through another reviewed/recorded operator action;
6. bind the canary to the exact main Production deployment, prove edge `429` before Guest persistence with invalid bodies, then prove one fresh Guest plus existing-Guest reuse continuity;
7. automatically roll a failed `enforce` attempt back to `observe`;
8. after successful enforce evidence, pin scheduled drift evidence to `enforce` and close the issue only when every acceptance criterion is recorded.

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

A first runtime-log review immediately after activation found no `/api/session/bootstrap` traffic in the inspected post-activation window. The MVP has not launched, so no legitimate end-user traffic is expected in Production. The empty traffic sample is therefore expected and is not treated as threshold-safety evidence, but it is also not a reason to block the pre-launch protection gate indefinitely.

The pre-launch replacement for live-traffic review is the governed synthetic canary below. Production enforce subsequently passed that canary in run `35899155942`; scheduled drift evidence is therefore pinned to `expected_mode=enforce`.

## Pre-launch enforce gate

The product is still pre-launch. Therefore the normal "observe legitimate traffic, then choose a threshold" loop cannot produce a representative end-user sample yet. V1 keeps the already reviewed conservative bound of **30 requests per 60 seconds per IP**, which is far above the intended single-flight browser bootstrap path, and requires synthetic proof before launch instead of inventing traffic.

The `mode=enforce` workflow is fail-closed:

- it applies and reads back the exact governed Firewall rule;
- it waits for the exact workflow SHA to be READY in Vercel Production;
- it runs the synthetic canary using only the canonical Production host;
- if apply, deployment binding, or canary proof fails, it performs an automatic rollback to `observe` and fails the workflow;
- a successful enforce run is the authority for changing scheduled drift evidence from `observe` to `enforce`.

## Production enforce evidence

Authoritative activation and canary evidence:

```text
run                           = 35899155942
deployed main SHA             = 3d101dc323d8f417472de657b3ef1bea126a838b
exact Production deployment   = dpl_FQu9CchzYSSR8Uosgz597YztmetR
mode                          = enforce
active config id              = waf_HPi141YAu0mK
active config version         = 5
active rule id                = rule_myeongha_guest_bootstrap_rate_limit_v1_fAj5rl
rate-limit action             = rate_limit
allowed invalid requests      = 30
first rate-limited attempt    = 31
rate-limited status           = 429
invalid-probe Guest row delta = 0
fresh Guest subject delta     = 1
fresh Guest session delta     = 1
reused-bootstrap row delta    = 0
/api/me continuity            = pass
rollback required             = false
```

The enforce run verified the exact active Firewall readback before executing the governed synthetic canary. The first 30 invalid requests reached the application and failed before Guest persistence, attempt 31 was rejected at the edge with HTTP 429, and the invalid burst created no durable Guest rows. After the bucket cleared, one real bootstrap created exactly one Guest subject/session; `GET /api/me` and authenticated bootstrap reuse preserved that canonical identity without another durable-row allocation.

This run is the authority for the Production enforce baseline. The scheduled evidence workflow expects `enforce`; a later mismatch is treated as Production drift rather than a reason to silently mutate the Firewall.

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

The enforce workflow runs the canary automatically.

1. wait for Firewall propagation and align the probe burst inside one 60-second bucket;
2. send the governed first **30** invalid bootstrap requests with `{"probe":true}`; each request that reaches the application must return `400 INVALID_REQUEST`;
3. require an edge `429` within attempts 31-35;
4. compare aggregate `subjects(kind='guest')` and `guest_sessions` counts before/after the invalid burst and require **zero durable-row delta**;
5. wait 65 seconds for the bucket to clear;
6. perform exactly one real `{}` bootstrap and require exactly **+1 Guest subject / +1 Guest session**;
7. call `GET /api/me` with the returned bearer and require the same canonical Guest subject;
8. call `POST /api/session/bootstrap` again with that valid bearer and require the same Guest/session with `bearerToken=null` and **zero additional durable-row delta**.

The canary never logs bearer material. Failure at any enforce prerequisite or canary step triggers automatic rollback to `observe`.

## Closure boundary

Closing #646 proves a finite Production edge bound for this exact unauthenticated persistence ingress. It does not claim complete bot prevention, global exact request counting, or protection of unrelated routes.
