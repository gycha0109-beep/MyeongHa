# MyeongHa Authenticated JSON Request Resource Policy V1

Status: **APPROVED IMPLEMENTATION AUTHORITY**

Issue: `#699`

## Objective

Give every affected authenticated structured-JSON write boundary a finite, repository-owned application resource contract before semantic validation and database command execution.

Covered boundaries:

- `POST /api/birth-profiles` — Production active
- `POST /api/chat` — Production active Chat-open boundary
- `POST /api/readings` — dormant create boundary; governed before any future Production activation

This policy governs request-resource shape only. It does not change ownership authority, authentication semantics, Birth meaning, Chat character availability, Reading capability availability, or persistence semantics except for the explicit finite resource limits below.

## Source gap and authority decision

The product/use-case/ERD material defines the request shapes but does not provide a numeric authenticated JSON body ceiling or the string-resource ceilings needed by #699.

Therefore these numbers are not presented as source-derived product facts and are not copied from Vercel. This document is the explicit repository-owned operations/resource authority.

V1 chooses:

```text
maximum authenticated structured JSON body = 16 KiB = 16,384 UTF-8 octets
Birth Profile label maximum                 = 512 UTF-8 octets
Reading idempotencyKey maximum              = 128 UTF-8 octets
Reading sourceBirthProfileId maximum        = 128 UTF-8 octets
```

Rationale:

1. the currently accepted Birth, Chat-open, and direct Reading-create envelopes are compact structured commands whose normal payloads are far below 16 KiB;
2. 16 KiB leaves substantial forward-compatible room for ordinary contract growth while establishing a meaningful finite application-memory boundary;
3. a uniform body ceiling avoids route-specific guessed body limits;
4. the independent string ceilings close the currently unbounded accepted-string cases without reinterpreting identifiers or changing the existing finite Chat character allowlist;
5. any increase or decrease is a policy change and must update this versioned authority and regression tests before runtime implementation changes.

## Body-byte authority

The authoritative measurement unit is the number of UTF-8 octets in the request body.

```text
accepted body size = 0..16,384 bytes
over limit         = 16,385 bytes or more
```

For streaming-capable runtimes, the application must count bytes while consuming the stream and stop as soon as the governed ceiling is crossed. It must not first materialize the complete over-limit body and reject afterward.

`Content-Length` may be used only as an early-rejection hint. It is not final authority because the header may be absent or inconsistent. Actual consumed bytes are the final application-owned authority.

## Authentication ordering

The existing authenticated boundary ordering is mandatory:

```text
verify request identity
→ enforce request resource bounds while consuming body
→ decode / JSON parse
→ semantic request validation
→ persistence command
```

An unauthenticated request must not be made more expensive by traversing, serializing, or consuming its structured body merely to enforce this policy.

## Failure contract

A body that crosses the V1 byte ceiling fails with:

```text
HTTP status = 413
error.code  = REQUEST_TOO_LARGE
```

This is distinct from malformed or semantically invalid JSON:

```text
body within resource bound + malformed JSON = existing INVALID_REQUEST behavior
body within resource bound + semantic invalidity = existing route-specific governed behavior
```

A resource-bound failure must occur before the database command is invoked.

Field-resource violations are semantic request violations and retain `INVALID_REQUEST`; the field ceilings do not introduce a second transport-size status.

## Route contracts

### Birth Profile create — Production active

```text
route             = POST /api/birth-profiles
body ceiling      = 16,384 UTF-8 bytes
label             = null or string, maximum 512 UTF-8 bytes
auth ordering     = identity before MyeongHa body consumption
database on 413   = forbidden
```

The 512-byte label ceiling is a resource constraint only. Existing null/string semantics remain unchanged.

The Vercel Node adapter may receive an already-parsed `request.body`. MyeongHa cannot truthfully claim to prevent hosting-platform parsing that occurred before application code runs. Its V1 guarantee at that adapter layer is narrower and explicit:

- unauthenticated execution does not traverse or serialize the parsed body;
- after authentication, MyeongHa must not create an unbounded secondary serialized copy;
- bounded serialization/counting must stop when the 16 KiB authority is crossed;
- an over-limit adapter body must not reach the Birth persistence command.

The hosting platform's own payload ceiling is defense in depth, not MyeongHa authority.

### Chat open — Production active

```text
route             = POST /api/chat
body ceiling      = 16,384 UTF-8 bytes
characterId       = existing finite launch allowlist authority
auth ordering     = identity before body consumption
database on 413   = forbidden
```

The existing body-completion deadline remains independently authoritative. V1 adds a space/resource bound; it does not replace or weaken the time bound.

The runtime must distinguish:

- slow/incomplete body → existing timeout behavior;
- body crossing 16 KiB → `413 REQUEST_TOO_LARGE`;
- within-limit malformed JSON → existing `INVALID_REQUEST`;
- within-limit valid JSON → existing semantic/character authority.

No independent characterId byte number is introduced because accepted values are already finite by allowlist.

### Reading create — dormant

```text
route                  = POST /api/readings
Production exposure    = dormant / not currently a create route
body ceiling           = 16,384 UTF-8 bytes
idempotencyKey         = maximum 128 UTF-8 bytes
sourceBirthProfileId   = maximum 128 UTF-8 bytes
```

These resource limits must be present in the implementation contract before Reading create is exposed in Production. They do not claim that Reading create is currently deployed.

The 128-byte identifier/string ceilings do not change those fields into UUID-only semantics. Any future semantic identifier tightening is a separate contract decision.

## Streaming implementation requirements

The implementation consuming this authority must:

- count raw body bytes incrementally;
- reject at the first observed byte beyond 16,384;
- avoid joining or decoding the complete over-limit payload first;
- cancel the reader and release its lock deterministically on early rejection;
- preserve existing body-completion deadlines where already present;
- preserve auth-before-body ordering;
- prevent database command execution after resource rejection.

A shared bounded reader is preferred where it can preserve route-specific timeout and error semantics.

## Pre-parsed adapter requirements

A hosting adapter that receives an already-materialized JavaScript value cannot retroactively bound the platform's earlier parsing allocation. Tests and documentation must not claim otherwise.

The repository guarantee is instead that application-owned post-authentication traversal/serialization is bounded and that unauthenticated requests do not trigger that work.

## Production verification

Closure of #699 requires exact-head Production evidence for the currently exposed Birth Profile create and Chat-open boundaries after implementation merge.

Production verification must:

- run only against the exact deployed Production Git revision;
- prove authenticated over-limit requests are rejected by the governed resource contract;
- prove no Birth/Chat mutation is accepted from those probes;
- avoid logging request body contents or credentials;
- emit only bounded safe evidence.

Reading create receives repository/governance evidence only while dormant and must receive deployment evidence if and when a create route is activated.

## Non-goals

This policy does not define:

- request-frequency rate limits;
- Vercel platform payload limits;
- upstream response bounds;
- PostgreSQL query deadlines;
- collection read pagination;
- total per-user storage quotas;
- arbitrary new semantic validation for Birth, Chat, or Reading identifiers.

Upstream JSON response bounds are tracked separately by #700.

## Acceptance gate

V1 implementation is complete only when tests prove:

- the 16 KiB streaming boundary rejects during consumption rather than after full over-limit materialization;
- exact-limit bodies remain resource-valid;
- `Content-Length` is only an optimization and actual stream bytes remain authoritative;
- unauthenticated requests do not consume/traverse the governed body;
- early stream rejection cancels/releases the reader deterministically;
- Birth label >512 UTF-8 bytes fails semantic validation;
- dormant Reading idempotencyKey/sourceBirthProfileId >128 UTF-8 bytes fail semantic validation;
- Chat's existing allowlist and body deadline remain intact;
- the pre-parsed Birth adapter does not perform unbounded secondary serialization;
- exact-head CI passes;
- exact-SHA Production verification passes for active Birth and Chat boundaries.

Watchtower-Track: ops
