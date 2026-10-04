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

A second request-outcome observation is emitted after the governed HTTP handler returns.

Outcome schema:

```text
myeongha-saju-abuse-outcome-v1
```

Outcome fields:

- `mode = observe_only`
- `routeId`
- `requestId`
- `httpStatus`
- `completedAt`

The outcome event deliberately does not duplicate `clientKey` or `subjectKind`. Baseline analysis joins an outcome to an authenticated admission event by `requestId`. Unmatched outcomes are not counted as authenticated Saju abuse attempts.

The runtime does not read or clone the response body to create this event. HTTP status is the only response-derived field, so observability does not duplicate Reading or calculation payloads.

No application database persistence is introduced. Retention is controlled by the configured runtime-log provider and must be recorded when the baseline is evaluated.

Logging failure and invalid observation clock values do not alter authentication or request execution.

## Baseline analyzer

Repository-owned evidence analysis is provided by:

```text
scripts/analyze-saju-abuse-baseline.mjs
```

The analyzer accepts exported/provider log text or structured event JSON, correlates admission and outcome events by `requestId`, and produces the evidence-only schema:

```text
myeongha-saju-abuse-baseline-report-v1
```

Synthetic Production canaries are excluded through the explicit authority file:

```text
docs/operations/SAJU_ABUSE_SYNTHETIC_EXCLUSIONS_V1.json
```

Synthetic exclusion entries require the privacy-safe `requestId`, a reason, and an evidence reference. Merely configuring an exclusion does not count it as excluded unless that request id is actually present in the analyzed observation window.

The analyzer reports:

- authenticated attempt count;
- unique pseudonymous client count;
- Member/Guest distribution;
- mounted-route distribution;
- the same authenticated-attempt, outcome-correlation, and burst evidence separately for each mounted route;
- per-client request-count histogram without emitting client keys;
- admission/outcome correlation coverage;
- matched HTTP status distribution;
- failure followed by a later authenticated attempt as an observed sequence, without claiming that the later attempt was necessarily a retry;
- burst evidence only when an operator supplies an explicit positive `--burst-window-seconds` value;
- input-quality evidence including exact duplicates, unmatched admissions, orphan outcomes, and synthetic exclusions.

No default burst window exists. No numeric admission threshold is inferred.

Example:

```bash
node scripts/analyze-saju-abuse-baseline.mjs ./saju-runtime-log-export.txt \
  --synthetic-file docs/operations/SAJU_ABUSE_SYNTHETIC_EXCLUSIONS_V1.json \
  --burst-window-seconds <explicitly-approved-analysis-window> \
  --retention-note "<provider retention/window limitation>"
```

The generated report always records:

```text
policyDecision.produced = false
policyDecision.numericLimit = null
policyDecision.enforcementAuthorized = false
```

The analyzer is evidence tooling only. Product/security authority must separately approve any limit/window/storage/failure semantics before enforcement.

## Latest recorded snapshot

The first repository-recorded Production observation snapshot is:

```text
docs/operations/SAJU_ABUSE_BASELINE_SNAPSHOT_2026-10-03.json
```

That snapshot covers an explicit 24-hour Vercel Production runtime-log query window. The query returned only governed synthetic canary traffic. After applying the canonical synthetic exclusion authority, the organic authenticated attempt count is zero.

This does **not** prove the absence of real-world demand outside the queried/log-retained surface. It means only that the captured evidence window contains no usable organic sample. Therefore:

```text
organic baseline = INSUFFICIENT
numeric policy = HOLD
enforcement = HOLD
issue closure = NOT ALLOWED
```

Future snapshots should preserve the same analyzer/report schema so growth in organic evidence can be compared without changing the measurement contract.

A follow-up snapshot after the governed Production Preview Reading smoke is:

```text
docs/operations/SAJU_ABUSE_BASELINE_SNAPSHOT_2026-10-03_0633Z.json
```

Its explicit two-hour Vercel Production query window contained exactly the three governed smoke invocations from GitHub Actions run `37101519866`:

- calculation first;
- calculation repeat;
- Preview Reading.

All three admission events had matching outcomes with HTTP 200, including direct Production coverage of `api.me.saju.preview-reading`. These requests are synthetic and are excluded from organic baseline metrics. After exclusion, the usable organic authenticated-attempt count in that query window is still zero.

This remains evidence of **INSUFFICIENT baseline**, not evidence that legitimate Production traffic is globally zero.

A second follow-up snapshot after the governed Member + Guest Production Saju smoke is:

```text
docs/operations/SAJU_ABUSE_BASELINE_SNAPSHOT_2026-10-03_0817Z.json
```

Its explicit two-hour Production query window contained exactly five governed smoke invocations from GitHub Actions run `37106609427`:

- Member calculation first;
- Member calculation repeat;
- Member Preview Reading;
- Guest calculation;
- Guest Preview Reading.

The Guest admission events were emitted with `subjectKind=guest`, used the Guest-specific pseudonymous client key domain, and each had a matching HTTP 200 outcome. The Member and Guest pseudonymous keys were distinct. This proves normal Production execution for both supported identity kinds without persisting raw identity material.

All five requests are synthetic and are excluded from organic baseline metrics. After exclusion, the usable organic authenticated-attempt count in that query window is still zero.

Therefore:

```text
normal Member Production flow = PROVEN
normal Guest Production flow  = PROVEN
organic baseline               = INSUFFICIENT
numeric policy                 = HOLD
enforcement                    = HOLD
```

A third follow-up snapshot after the bounded ProductReadingResponse rollout is:

```text
docs/operations/SAJU_ABUSE_BASELINE_SNAPSHOT_2026-10-04_0126Z.json
```

Its explicit two-hour Production query window contained exactly five governed smoke invocations from GitHub Actions run `37166344665`:

- Member calculation first;
- Member calculation repeat;
- Member Preview Reading;
- Guest calculation;
- Guest Preview Reading.

Member Preview Reading was served by exact #1579 deployment `dpl_AcvLyvadX8XTLWanQMyMm35Gn6Rb` at SHA `5728a4a00872feb73d293e2b0c00247eb40e26bf`. Guest Preview Reading was served by the immediate #1580 trigger deployment, which includes the same bounded Reading implementation. Both returned HTTP 200 and `delivered`.

All five requests are synthetic and are excluded from organic baseline metrics. After exclusion, the usable organic authenticated-attempt count in that query window is still zero.

Therefore the bounded Reading Production path is **PROVEN**, while A06 remains **INSUFFICIENT / HOLD** for numeric admission policy and enforcement.

## Baseline decision

A later evidence review must separately report, for each mounted route:

- observation window and its limitations;
- total authenticated attempts;
- unique pseudonymous client keys;
- Member vs Guest distribution;
- per-client request distribution;
- peak burst behavior over an explicitly chosen analysis window;
- retry/error patterns relevant to amplification, correlated by admission/outcome `requestId`.

Synthetic Production smoke events prove telemetry activation but do not by themselves constitute an organic traffic baseline.

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
