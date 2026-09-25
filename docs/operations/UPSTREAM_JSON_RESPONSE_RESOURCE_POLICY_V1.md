# MyeongHa Upstream JSON Response Resource Policy V1

Status: **APPROVED IMPLEMENTATION AUTHORITY**

Issue: `#700`

## Objective

Give every affected trusted-upstream JSON response boundary a finite, repository-owned application resource contract before JSON materialization and semantic ingress.

Covered boundaries:

- Supabase Auth proxy success JSON — Production active
- Supabase Member identity verifier success JSON — Production active
- Saju production calculation success JSON — Production active

This policy governs response-resource shape only. It does not replace existing upstream deadlines, HTTP status mapping, authentication semantics, session normalization, Member identity semantics, Saju calculation authority, or Saju semantic ingress.

## Source gap and authority decision

The current product/source material and upstream contracts define response meaning but do not define application-owned maximum JSON response bytes for these three consumers.

Therefore these numbers are not presented as source-derived product facts and are not copied from Vercel, Supabase, Node, Fetch, or the #699 request-body ceiling. This document is the explicit repository-owned operations/resource authority.

V1 chooses:

```text
Supabase Auth success JSON maximum       = 128 KiB = 131,072 application-visible octets
Supabase Member success JSON maximum     =  64 KiB =  65,536 application-visible octets
Saju calculation success JSON maximum    = 256 KiB = 262,144 application-visible octets
```

Rationale:

1. Supabase Auth success payloads can legitimately include session/token and user metadata, so V1 leaves materially more room than the current canonical fields require while still making allocation finite.
2. Supabase Member verification consumes only a small identity document and ultimately requires a UUID user id, so 64 KiB is deliberately tighter.
3. The Saju calculation response carries a canonical snapshot, authority/provenance, pillar states, completeness arrays, and bounded calculation evidence; 256 KiB leaves substantially more headroom for that structured contract without authorizing open-ended upstream output.
4. These are independent response-side operations limits. They are not derived from the 16 KiB authenticated request-body authority in #699.
5. Any increase or decrease is a policy change and must update this versioned authority and regression tests before runtime implementation changes.

## Response-byte authority

The authoritative measurement unit is the number of octets exposed by the Fetch/application response body stream to MyeongHa.

For a streaming-capable response, MyeongHa must count bytes while consuming the body and stop as soon as the governed ceiling is crossed. It must not first call an unbounded `Response.json()`, `Response.text()`, or equivalent whole-body materializer and reject afterward.

`Content-Length` is only an early-rejection hint and never final acceptance authority. It may be absent, incorrect, or describe an encoded representation whose size differs from the application-visible stream. When `Content-Encoding` is present, V1 does not use `Content-Length` as an application-visible-size approval signal.

Actual application-visible stream bytes are final authority.

## Time and space are independent

Existing upstream deadlines remain independently authoritative.

```text
small response that stalls past the existing deadline
→ existing timeout/upstream-unavailable behavior

fast response that crosses the V1 byte ceiling
→ response-resource rejection

within-limit response that completes before the deadline
→ existing JSON and semantic processing
```

The resource reader must not release or weaken an existing deadline before the governed body has completed, failed, timed out, or been resource-rejected.

## Shared bounded-reader requirements

The implementation consuming this authority must:

- acquire and consume the response body as a stream where the runtime exposes one;
- count application-visible bytes incrementally;
- reject on the first observed byte beyond the boundary-specific ceiling;
- never retain the complete over-limit response;
- avoid unbounded `Response.json()` and `Response.text()` on governed success bodies;
- cancel unused/over-limit response bodies on a best-effort, non-blocking basis;
- release any reader lock deterministically;
- preserve existing deadline behavior while reading;
- parse JSON only after a within-limit body has completed;
- avoid reflecting upstream response contents, tokens, credentials, or body fragments in resource-error messages or evidence.

Cancellation failure or a cancellation promise that never settles must not replace or delay the already-established status/resource result.

## Boundary contracts

### Supabase Auth proxy — Production active

Affected successful JSON actions:

- sign-in
- sign-up
- refresh

```text
success JSON ceiling = 131,072 application-visible bytes
resource violation   = existing public AUTH_UPSTREAM_MALFORMED mapping
public HTTP status   = 502
```

Within-limit malformed JSON retains the existing malformed-upstream behavior. Within-limit valid JSON continues through existing session/user normalization.

Sign-out is status-only for the MyeongHa public contract. Its successful upstream response body is not semantically required and must not be materialized merely to satisfy a JSON response path; it should be cancelled/ignored after the status decision.

Existing non-success status mappings remain authoritative and their unused bodies remain non-blockingly cancelled rather than consumed.

### Supabase Member identity verifier — Production active

```text
success JSON ceiling = 65,536 application-visible bytes
resource violation   = SUPABASE_MEMBER_VERIFIER_RESPONSE_INVALID
```

Only successful responses requiring the upstream identity document are bounded/read. Existing 401/403 identity rejection and other non-success handling remain status-first and must not consume an unused response body.

The existing Supabase Auth upstream deadline remains active through body consumption.

### Saju production calculation — Production active

```text
success JSON ceiling = 262,144 application-visible bytes
internal resource failure = RESPONSE_TOO_LARGE
public API collapse       = existing SAJU_TEMPORARILY_UNAVAILABLE
```

The order remains:

```text
HTTP status
→ JSON content-type requirement
→ existing deadline + governed response byte ceiling
→ JSON parse
→ existing ingestAuthorizedSajuProductionCalculationV1 semantic ingress
```

The resource policy does not weaken or reinterpret Saju schema, authority, birth-revision binding, calculation-only semantics, or provenance checks.

## Failure precedence

V1 uses the first established failure at the governed boundary.

- rejected/non-success HTTP status remains status-authoritative without consuming an unused body;
- invalid required content type remains authoritative without consuming the body;
- while consuming an accepted success body, deadline expiry remains the existing timeout class;
- crossing the byte ceiling before successful completion is a resource violation;
- a completed within-limit body that is malformed JSON retains the existing invalid/malformed JSON class;
- a completed within-limit valid JSON body that fails semantic validation retains the existing semantic/ingress rejection.

## Production verification

Closure of #700 requires exact-head Production evidence after implementation merge.

Deterministic CI/regression tests are the authority for synthetic over-limit and chunk-crossing behavior; Production must not attempt to coerce Supabase or the Saju service into emitting abnormal oversized payloads.

Production verification instead proves that the exact deployed revision can still traverse the governed real boundaries with normal responses:

- fresh Supabase Auth Member session acquisition;
- Supabase Member identity verification through an authenticated Member surface;
- Saju current-subject calculation through the Production calculation adapter.

Existing safe Production smoke workflows may be reused when they cover the exact merged/deployed SHA and the governed paths. Credentials, access tokens, refresh tokens, and response bodies must not be logged as evidence.

## Non-goals

This policy does not define:

- incoming request-body limits; #699 owns those separately;
- upstream request-body limits;
- request-frequency rate limits;
- upstream response semantic schemas;
- Vercel or provider platform response limits;
- PostgreSQL query/result bounds;
- collection pagination;
- a streaming JSON parser for already-bounded accepted bodies.

## Acceptance gate

V1 implementation is complete only when tests prove:

- exact-limit success bodies remain resource-valid;
- limit + 1 byte is rejected;
- a multi-chunk response is rejected at the first chunk that crosses the ceiling;
- no later chunk is consumed after resource rejection;
- a false/small or absent `Content-Length` cannot bypass actual stream counting;
- encoded-response metadata cannot turn `Content-Length` into final acceptance authority;
- over-limit bodies are rejected before JSON parsing;
- cancellation is best-effort/non-blocking and reader locks are released;
- existing body deadlines remain active through bounded consumption;
- Auth sign-out and rejected upstream statuses do not materialize unused bodies;
- Auth, Member, and Saju retain their existing public error/semantic behavior except for the approved finite response-resource narrowing;
- exact-head CI passes;
- exact-SHA Production verification passes across the active Auth, Member, and Saju boundaries.

Watchtower-Track: ops
