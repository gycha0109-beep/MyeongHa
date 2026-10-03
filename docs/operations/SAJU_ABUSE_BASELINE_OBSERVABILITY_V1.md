# Saju Abuse Baseline Observability V1

Status: **observe-only baseline authority**  
OWASP mapping: **A06:2025 Insecure Design**  
Tracking: #1526

## Current Production scope

Public Production Saju execution paths:

- `POST /api/me/saju/calculation` — direct public route file;
- `POST /api/me/saju/preview-reading` — public Vercel rewrite to `/api/me?__myeongha_saju_preview_reading=1`, then validated and dispatched by `api/me.ts`.

Preview Reading has no dedicated route file, but it is currently public through the governed rewrite/dispatcher path.

## Why observe-only first

The available Vercel runtime-log surface did not provide a usable recent request-volume baseline for the Saju routes.

That absence is not treated as proof of zero traffic.

No numeric request limit may be introduced until a measured baseline or an explicit product authority supports it.

Required sequence:

```text
observe
→ measure
→ approve policy
→ enforce
```

## Observation point

The baseline event is emitted only after the Production request credential has been verified as a supported Member or Guest identity and before PostgreSQL subject resolution / Birth Profile reads / external Saju execution.

This measures authenticated attempts capable of reaching expensive work without making observability itself request authority.

Rejected or malformed credentials are not assigned a Saju abuse client key.

## Privacy boundary

The event never stores the raw identity evidence.

Member:

```text
verified Supabase auth user id
→ domain-separated HMAC-SHA256
→ pseudonymous clientKey
```

Guest:

```text
already verified Guest bearer fingerprint
→ separate domain-separated HMAC-SHA256
→ pseudonymous clientKey
```

The server-owned `MYEONGHA_GUEST_FINGERPRINT_SECRET` is reused only with the dedicated domain separator:

```text
myeongha-saju-abuse-client-hmac-sha256-v1
```

Member and Guest key domains are separated explicitly.

The event must not contain:

- raw bearer credentials;
- raw Member auth UUIDs;
- raw Guest fingerprints;
- IP addresses;
- request URLs or request bodies;
- Birth data;
- Saju request/response payloads;
- database configuration;
- internal exception details.

## Event

Prefix:

```text
MYEONGHA_SAJU_ABUSE_OBSERVATION
```

Schema:

```text
myeongha-saju-abuse-observation-v1
```

Fields:

- `mode = observe_only`
- `routeId`
- `subjectKind`
- `clientKeyVersion`
- `clientKey`
- `requestId`
- `occurredAt`

No application database persistence is introduced. Retention is controlled by the configured runtime-log provider and must be recorded when the baseline is evaluated.

Logging failure and invalid observation clock values do not alter authentication or request execution.

## Baseline decision

A later evidence review must separately report, for each mounted route:

- observation window and its limitations;
- total authenticated attempts;
- unique pseudonymous client keys;
- Member vs Guest distribution;
- per-client request distribution;
- peak burst behavior over an explicitly chosen analysis window;
- retry/error patterns relevant to amplification.

Only after that evidence exists may a numeric admission policy be approved.

The enforcement design must then define:

- client identity key;
- limit/window;
- storage and retention;
- reset semantics;
- `Retry-After`;
- behavior when admission storage is unavailable;
- retry/idempotency implications;
- privacy-safe `RATE_LIMITED` observability.

## Preview rewrite authority

Preview Reading is already publicly reachable through the governed Vercel rewrite and `api/me.ts` dispatch boundary.

Its Production runtime uses the same observe-only identity boundary as direct Saju calculation. The public dispatcher is independently covered by the structured security-observability boundary under `api.me.dispatch`.

A future routing change must preserve both:
- the rewrite/dispatch evidence validation;
- the Saju abuse observation wrapper.

Observe-only telemetry must not be interpreted as rate-limit enforcement.

Watchtower-Track: security
