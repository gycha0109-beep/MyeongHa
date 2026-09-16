# MyeongHa Ingress Request-Body Completion Deadline Policy V1

> Repository: `gycha0109-beep/MyeongHa`  
> Decision date: 2026-09-16 KST  
> Status: **DECIDED / V1**  
> Scope: synchronous Production request-body consumers that explicitly opt into this policy  
> Current bindings: authenticated Guest promotion request-body validation; public Guest bootstrap request-body validation; Supabase Auth sign-in/sign-up/refresh request-body validation  
> Tracked by: #715, #684, #696

---

## 1. Decision

MyeongHa establishes the following repository-owned ingress request-body
completion deadline for explicitly opted-in synchronous API boundaries:

```text
request-body completion deadline = 3,000 ms
clock                            = absolute wall time
clock start                      = immediately before first application-owned body read/probe
reset after chunk                = forbidden
success completion signal        = actual EOF / parser terminal decision
Content-Length as completion      = forbidden
```

The initial V1 binding is `POST /api/auth/promote-guest` after Guest + Member
authentication has succeeded and immediately before the Guest promotion body
parser obtains/awaits the request stream.

As of #684, `POST /api/session/bootstrap` explicitly opts into the same V1
completion deadline immediately before its streaming request-body parser begins
reading. This second binding does not broaden the policy into a blanket route
default.

As of #696, the public Supabase Auth proxy explicitly opts `sign-in`, `sign-up`,
and `refresh` request-body validation into the same V1 completion deadline.
The deadline starts immediately before the first application-owned Auth body
read, preserves the existing 16,384-byte actual-body ceiling and JSON/object
validation semantics, and does not apply to `sign-out`, which does not consume
an Auth JSON request body.

The 3,000 ms value is a **new repository-owned Operations decision**. It is not
inherited from or numerically derived from:

```text
Supabase Auth upstream deadline
Saju upstream deadline
PostgreSQL connection acquisition timeout
PostgreSQL statement_timeout
Vercel Function maxDuration
platform-integrity/audit timeouts
```

Numeric equality or inequality with another subsystem never creates an
inheritance rule.

---

## 2. Why 3,000 ms

V1 governs body acquisition for synchronous API control requests, not file
uploads or long-lived streaming products. The initial Guest promotion grammar
is intentionally tiny: omitted/empty/whitespace-only or one JSON empty object.
The Guest bootstrap grammar covered by #684 is likewise a synchronous control
request boundary with the same tiny accepted body shapes. Supabase Auth
sign-in/sign-up/refresh bodies covered by #696 are also bounded synchronous
control requests and retain their independent 16,384-byte maximum. The nearby
Saju body-presence candidate (#682) remains independently unbound.

V1 selects 3,000 ms because:

- accepted control-request bodies should complete promptly enough that request
  transport cannot occupy a function indefinitely before application work;
- the completion budget must leave meaningful runtime headroom for identity,
  database/upstream cleanup, governed downstream work, and final response
  handling within the hosting-function lifetime;
- a single absolute budget contains slowloris-style clients that continue to
  send small or zero-length chunks solely to keep an idle-reset timer alive;
- the initial value is operational containment, not a permanent latency SLO;
  measured legitimate-client evidence may reopen it.

A future upload, large-payload, or intentionally streaming endpoint MUST NOT opt
into this policy by analogy. It requires its own reviewed transport authority.

---

## 3. Absolute-deadline semantics

The deadline is created once when the covered body consumer begins. Every
pending `reader.read()` races the same deadline promise. Receiving bytes does
not create a new timer and does not extend the expiry time.

For Guest promotion the ordering is:

```text
method validation
→ Guest header validation
→ Member identity verification
→ Guest identity verification
→ create one 3,000 ms body-completion deadline
→ incrementally validate request body
→ EOF / terminal invalidity / deadline expiry
→ only a valid completed body may proceed to PostgreSQL promotion work
```

This preserves #664/#665 and #708. A 401 authentication rejection occurs before
body access, leaves the body untouched, and therefore does not create this
body-completion timer.

For Guest bootstrap the ordering is:

```text
method validation
→ trusted request metadata validation
→ create one 3,000 ms body-completion deadline
→ incrementally validate request body
→ EOF / terminal invalidity / deadline expiry
→ only a valid completed body may proceed to bootstrap identity/credential/DB work
```

Guest bootstrap remains intentionally public and unauthenticated at this
boundary. The deadline changes only how long the application may wait for a
terminal body decision; it does not add authentication or alter bootstrap
identity authority.

For Supabase Auth `sign-in`, `sign-up`, and `refresh` the ordering is:

```text
method validation
→ governed Production Auth configuration validation
→ create one 3,000 ms body-completion deadline
→ incrementally consume at most 16,384 actual body bytes
→ EOF / terminal invalidity / deadline expiry
→ validate JSON object and action-specific fields
→ only a valid completed body may start Supabase Auth upstream work
```

The deadline does not replace the existing byte ceiling and does not start the
separately governed Supabase Auth upstream deadline early. `sign-out` retains
its bearer-header path and does not opt into request-body completion timing.

---

## 4. Covered public failure semantics

If a covered request-body validation has not reached EOF or another terminal
parser decision before the absolute deadline, V1 requires:

```text
HTTP status   = 408 Request Timeout
error code    = REQUEST_BODY_TIMEOUT
messageKey    = auth.request_body_timeout
retryable     = false
Cache-Control = no-store
DB work       = MUST NOT start
```

This is a transport-completion failure. It is not `INVALID_REQUEST`, an auth
failure, a database failure, or proof that retry is safe. V1 therefore does not
add automatic retry behavior.

A body that becomes provably invalid before the deadline keeps the endpoint's
existing `400 INVALID_REQUEST` semantics. A complete valid body before the
deadline keeps the endpoint's existing success behavior.

For Guest bootstrap specifically, #684 preserves the existing accepted grammar:

```text
omitted / empty body
JS-trim whitespace-only body
{}
{} with JSON trailing whitespace
```

Malformed JSON, non-empty objects, arrays, primitives, invalid leading/trailing
characters, and incomplete objects remain `400 INVALID_REQUEST` when terminal
invalidity is known before expiry.

For Supabase Auth specifically, #696 preserves:

```text
actual body bytes > 16,384                    → 400 INVALID_REQUEST
malformed / non-object JSON                   → 400 INVALID_REQUEST
valid complete action body                    → existing Auth behavior
body not complete by the absolute deadline    → 408 REQUEST_BODY_TIMEOUT
```

A body-completion timeout occurs before any Supabase Auth upstream request is
started and is not mapped to `AUTH_UPSTREAM_UNAVAILABLE`.

---

## 5. Reader cleanup

Every terminal path after a covered reader is acquired MUST:

```text
release the deadline timer
→ request reader cancellation best-effort when a reader remains owned
→ never await cancellation settlement as a prerequisite to return/throw an already-decided result
→ absorb cancellation rejection/failure
→ release the reader lock deterministically
```

Deadline expiry must therefore terminate application waiting even if the
underlying stream's cancellation Promise rejects or never settles.

This cleanup rule does not alter the separately governed untouched-body
contract for Guest promotion 401 authentication rejection.

---

## 6. Opt-in scope

V1 is shared infrastructure but **not a blanket route default**.

Current bindings:

```text
#715 / POST /api/auth/promote-guest                    = covered
#684 / POST /api/session/bootstrap                     = covered
#696 / Supabase Auth sign-in/sign-up/refresh body read = covered
```

Known candidate follow-up remains independently open until its own code,
failure mapping, regressions, exact-head CI, merge, and Production verification
are completed:

```text
#682 Saju body-presence probe = not yet bound
```

That issue may adopt this V1 duration only through an explicit implementation
that preserves its existing ordering and public error contract. This policy
document alone does not close it.

---

## 7. Explicit non-decisions

V1 does not decide or modify:

```text
request-body byte/field limits (#699)
upstream response byte limits (#700)
client-disconnect cancellation semantics (#701)
Guest promotion 401 body ownership (#708)
Guest bootstrap rate/abuse policy (#646)
Content-Length trust as completion framing
upload/streaming-product transport policy
retry/backoff counts
PostgreSQL query/transaction deadlines
RLS / subject ownership / identity semantics
Supabase Production deployment authorization (#680)
Commerce / PortOne activation
P0-CM-03
```