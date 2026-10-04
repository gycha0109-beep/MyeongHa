# MyeongHa Member Auth Abuse Policy V1

Status: **REPOSITORY CONTRACT / PRODUCTION ACTIVATION HOLD / B1a BLOCKED BY CURRENT VERCEL PLAN**

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

The existing Guest bootstrap rule remains `production-active`. All three Member Auth rules remain `hold`. B1a adds only `draftAuthority=preview-capability-probe`; it does not grant live activation authority.

## B1a control-plane boundary

The manual workflow exposes exactly two governed modes:

- `verify-live`: read-only verification of the current HOLD state.
- `probe-preview-capability`: a reversible unpublished-draft capability probe.

B1a may use only `rules.insert` and `rules.remove` against the Vercel Firewall draft. The three probe rules are **disabled**, scoped to `environment=preview`, and are never published. B1a has **no publish** authority.

The probe requires a clean draft, rejects active custom `bypass` rules for manual review, verifies that the active configuration fingerprint does not change, inserts exactly the three governed Member Auth rules, validates the complete three-rule draft, and removes only the exact rule IDs created by that probe.

The Guest bootstrap mutation workflow and Member Auth workflow share the concurrency group `production-vercel-firewall-config` so both cannot mutate the same Firewall draft concurrently.

A failed cleanup is a hard failure with `DRAFT_RESIDUE_REQUIRES_MANUAL_REVIEW`. A rejected insert that creates zero target rules is classified separately: the probe re-reads the Firewall state and must prove the active configuration and draft are unchanged before reporting a clean capability blocker. B1a never invokes full-draft discard, whole-config PUT, `rules.update`, rule priority mutation, or draft activation.

No scheduled evidence workflow is admitted while the policy is still HOLD.

## B1a live capability evidence

The governed runtime probe on GitHub Actions run `36289593626` reached the exact MyeongHa Vercel project and attempted the first disabled Preview-scoped Auth rate-limit insert. Vercel rejected that request with HTTP `401`, code `unauthorized`, and the message `Rate limiting is not available for this plan`.

The corrected probe then re-read the Firewall configuration and emitted:

```text
preview_rule_set_supported=false
active_config_unchanged=true
draft_restored=true
production_publish_performed=false
member_auth_waf_capability_probe=blocked
capability_blocker=rate_limiting_not_available_for_plan
```

Therefore B1a established a **current-plan capability blocker**, not a draft-integrity failure. No Member Auth rate-limit rule was created, no draft residue remained, and no Firewall configuration was published.

B1b Preview activation is blocked until the governed Vercel project supports the additional rate-limit rules or SEC-02 adopts a separately reviewed alternative rate-limit architecture.

## B1a completion and later Phase B activation requirements

B1a does not hard-code an unverified Vercel plan quota. Capability is proven against the actual Firewall draft validation response. A successful B1a run must report `preview_rule_set_supported=true`, `active_config_unchanged=true`, `draft_restored=true`, and `production_publish_performed=false`.

If a future re-probe passes after the capability blocker is resolved, Preview activation and canary work remains a separate reviewed change.

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

The later canary can remain side-effect-free: sign-in/sign-up use an invalid email so the shared auth handler returns `400 INVALID_REQUEST` before breached-password or Supabase Auth calls, and refresh uses an empty token so it also returns locally. B1a itself sends no auth canary traffic.

## Closure boundary

Closing #1332 requires Production activation evidence, exact active-rule readback, independent-bucket canary evidence, and a documented rollback result. Merging or running B1a alone does not close SEC-02.
