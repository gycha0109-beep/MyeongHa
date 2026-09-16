# MyeongHa Ingress Request-Body Completion Deadline Policy V1

> Repository: `gycha0109-beep/MyeongHa`  
> Decision date: 2026-09-16 KST  
> Status: **DECIDED / V1**  
> Scope: synchronous Production request-body consumers that explicitly opt into this policy  
> Initial binding: authenticated Guest promotion request-body validation  
> Tracked by: #715

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
Nearby candidate consumers (#682, #684, #696) are likewise synchronous control
request boundaries rather than upload transports.

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

---

## 4. Guest promotion public failure semantics

If authenticated Guest promotion body validation has not reached EOF or another
terminal parser decision before the absolute deadline, V1 requires:

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

A body that becomes provably invalid before the deadline keeps the existing
`400 INVALID_REQUEST` semantics. A complete valid body before the deadline
keeps existing Guest promotion behavior.

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

Current binding:

```text
#715 / POST /api/auth/promote-guest = covered
```

Known candidate follow-ups remain independently open until their own code,
failure mapping, regressions, exact-head CI, merge, and Production verification
are completed:

```text
#682 Saju body-presence probe       = not yet bound
#684 Guest bootstrap parser         = not yet bound
#696 Supabase Auth request reader   = not yet bound
```

Those issues may adopt this V1 duration only through an explicit implementation
that preserves each boundary's existing ordering and public error contract.
This policy document alone does not close them.

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

---

## 8. Verification requirements

The #715 implementation MUST deterministically prove:

- non-closing `{}` expires at 3,000 ms;
- non-closing accepted whitespace expires at 3,000 ms;
- repeated zero-length chunks do not prevent expiry;
- chunks arriving before expiry do not reset the absolute deadline;
- valid EOF retains existing accepted semantics;
- JSON trailing whitespace remains accepted when EOF arrives in time;
- delayed trailing non-whitespace remains `INVALID_REQUEST` when it arrives
  before expiry;
- already-provably-invalid streams still reject without waiting for EOF;
- timeout cancellation is requested and reader lock cleanup is deterministic;
- rejecting or never-settling cancellation cannot replace/delay the timeout;
- Guest/Member auth rejection remains before body access and retains
  `request.bodyUsed === false`;
- Production runtime maps expiry to exactly `408 REQUEST_BODY_TIMEOUT` before
  PostgreSQL promotion work.

Production closure requires exact-head CI, fresh-main merge preflight,
expected-head squash merge, exact merged-SHA CI, and exact-SHA Vercel Production
verification.

---

## 9. Reopen triggers

Re-review V1 when any of the following occurs:

- legitimate Production clients materially approach or exceed the 3,000 ms
  body-completion budget;
- a covered body grammar/payload class materially expands;
- an upload or long-lived streaming request class is proposed;
- hosting/runtime request-stream semantics materially change;
- client-disconnect authority changes how pending body reads are terminated;
- evidence supports route-specific rather than shared completion budgets.
