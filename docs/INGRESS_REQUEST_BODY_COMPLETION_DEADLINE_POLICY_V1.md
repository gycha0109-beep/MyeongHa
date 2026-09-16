# MyeongHa Ingress Request-Body Completion Deadline Policy V1

> Repository: `gycha0109-beep/MyeongHa`  
> Decision date: 2026-09-16 KST  
> Status: **DECIDED / V1**  
> Scope: synchronous Production request-body consumers that explicitly opt into this policy  
> Current bindings: authenticated Guest promotion request-body validation; public Guest bootstrap request-body validation; Supabase Auth sign-in/sign-up/refresh request-body validation; Saju calculation body-presence probe; authenticated Chat open request-body JSON read  
> Tracked by: #715, #684, #696, #682, #875

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

As of #682, `POST /api/me/saju/calculation` explicitly opts its pre-auth
body-presence probe into the same V1 completion deadline. The route remains
bodyless: a first non-empty byte is still sufficient to prove forbidden body
presence without draining the remainder, while a stream that emits no
non-empty byte must reach EOF before the absolute deadline to be accepted as
bodyless.

As of #875, authenticated `POST /api/chat` explicitly opts its Chat-open JSON
request-body read into the same V1 completion deadline after identity
verification succeeds and before any PostgreSQL transaction starts. This
binding preserves authentication-before-body ordering, existing JSON/shape
validation, and the separate unresolved request byte/field authority in #699.
It does not create or imply a Chat-specific byte ceiling.

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
control requests and retain their independent 16,384-byte maximum. The Saju
calculation boundary covered by #682 is stricter still: the authoritative
request body is empty, so the probe only needs either the first non-empty byte
or EOF to reach a terminal presence decision. Authenticated Chat open covered
by #875 is also a synchronous control request whose body must complete before
its governed PostgreSQL command path begins; #875 reuses only the completion
budget and leaves request byte/field ceilings to #699.

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

For current-subject Saju calculation the ordering is:

```text
method validation
→ create one 3,000 ms body-presence deadline
→ read only until first non-empty byte, EOF, or deadline expiry
→ non-empty byte: canonical one-byte body witness
→ EOF without non-empty bytes: canonical bodyless request
→ only a terminal body-presence decision may proceed to identity verification
```

The Saju probe remains deliberately **pre-auth**. #682 does not move body
rejection after identity verification and does not drain the rest of a body
after non-emptiness has already been proven.

For authenticated Chat open the ordering is:

```text
route / method validation
→ identity verification
→ create one 3,000 ms body-completion deadline
→ read through actual EOF and parse JSON
→ validate the canonical Character-only request shape
→ only a valid completed body may enter the PostgreSQL subject transaction
```

A Chat authentication rejection therefore occurs before body ownership and
leaves the request body untouched. Receiving a valid JSON prefix does not end
the completion lease: actual EOF is still required before parsing may authorize
PostgreSQL work. The lease does not add or imply a request byte/field limit;
that remains an explicit #699 non-decision.

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

For Saju calculation specifically, #682 preserves:

```text
first non-empty byte                          → 400 INVALID_REQUEST / request.body_not_allowed
actual EOF without a non-empty byte           → existing bodyless identity path
no terminal presence decision by deadline     → 408 REQUEST_BODY_TIMEOUT
```

The timeout occurs before identity verification, PostgreSQL access, or Saju
outbound work. The public timeout response retains the Saju route's current API
contract metadata (`apiContractVersion` and generated `requestId`) while using
the V1 error code/message key above.

For authenticated Chat open specifically, #875 preserves:

```text
authentication rejection before body access   → existing 401 AUTH_REQUIRED
complete malformed / invalid Chat body         → existing 400 INVALID_REQUEST
valid complete Character-only body             → existing Chat-open command path
body not complete by the absolute deadline     → 408 REQUEST_BODY_TIMEOUT
```

The Chat timeout occurs before
`executePostgresSubjectTransactionV1`, so no PostgreSQL subject transaction or
Chat-open command starts for a non-completing body. The public timeout response
retains the Chat route's existing API contract metadata and the common V1
request-body timeout error contract.

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
contract for Guest promotion 401 authentication rejection or authenticated Chat
open authentication rejection.

---

## 6. Opt-in scope

V1 is shared infrastructure but **not a blanket route default**.

Current bindings:

```text
#715 / POST /api/auth/promote-guest                    = covered
#684 / POST /api/session/bootstrap                     = covered
#696 / Supabase Auth sign-in/sign-up/refresh body read = covered
#682 / POST /api/me/saju/calculation body-presence     = covered
#875 / POST /api/chat authenticated JSON body          = covered
```

No other endpoint inherits this duration merely because it also consumes a
request stream. Any additional binding requires an explicit reviewed change
that preserves that boundary's ordering, grammar, failure mapping, cleanup,
and deterministic regressions.

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