# MyeongHa Production PostgreSQL Statement Deadline Policy V1

> Repository: `gycha0109-beep/MyeongHa`  
> Decision date: 2026-09-16 KST  
> Status: **DECIDED / V1**  
> Scope: ordinary Production user-data PostgreSQL pool  
> Implementation boundary: `createNodePostgresSubjectPoolV1(...)` / node-postgres client configuration  
> Tracked by: #681

---

## 1. Decision

Every PostgreSQL client created by the ordinary MyeongHa Production user-data
pool MUST use the following server-side per-statement deadline:

```text
statement_timeout = 5,000 ms
```

The node-postgres pool configuration MUST bind it explicitly as:

```ts
statement_timeout: 5_000
```

V1 authority is therefore:

```text
statement timeout                 = 5,000 ms
scope                             = each PostgreSQL statement independently
binding                           = ordinary user-data node-postgres client/pool config
whole-transaction wall deadline  = not introduced by V1
separate lock_timeout             = not introduced by V1
automatic SQL retry               = forbidden by V1
```

This is a repository-owned Operations decision. It is not inherited from the
pool connection-acquisition timeout, Saju timeout, Supabase Auth timeout,
Vercel Function lifetime, or platform-integrity audit scripts.

---

## 2. Why 5,000 ms

The synchronous Production API currently has a deliberately small PostgreSQL
pool of four connections per runtime. Before this decision, acquiring a
connection was bounded at 5,000 ms while a checked-out client could execute a
single SQL statement without any repository-owned execution deadline.

V1 chooses 5,000 ms as the initial ordinary-request statement budget because:

- ordinary subject-scoped API work is synchronous request/response work, not a
  batch or analytical workload;
- one slow or blocked statement must not occupy one of the small runtime pool
  slots for the much larger hosting-function lifetime;
- current repository authority does not define an ordinary Production API SQL
  class that intentionally requires more than five seconds of execution;
- a five-second statement budget leaves the application/runtime room to perform
  rollback, connection cleanup, failure mapping, and response handling after a
  database cancellation;
- measured legitimate Production latency may reopen this value; V1 does not
  claim a permanent latency SLO.

The numeric equality with the existing
`connectionTimeoutMillis = 5_000` is explicitly **not** an inheritance rule.
Connection acquisition and SQL execution are independent budgets with different
semantics.

---

## 3. Driver/server semantics

PostgreSQL `statement_timeout` aborts any statement that runs longer than the
configured duration. The timeout is per statement rather than a total
transaction wall-clock budget.

node-postgres exposes `statement_timeout` as a client configuration value in
milliseconds. MyeongHa binds that property explicitly when constructing the
ordinary user-data pool, so every client from that pool receives the same fixed
server-side statement policy before application queries run.

This is not caller- or request-derived state. A pooled client retaining the
same fixed V1 value across checkouts is intended; no user identity, request
value, route parameter, or transaction-specific authority is stored in it.

References:

- PostgreSQL 17 client connection defaults (`statement_timeout`, `lock_timeout`)
  - https://www.postgresql.org/docs/17/runtime-config-client.html
- node-postgres client configuration (`statement_timeout`, `query_timeout`,
  `lock_timeout`, `connectionTimeoutMillis`)
  - https://node-postgres.com/apis/client

---

## 4. Covered statements

The deadline applies to every SQL statement issued through the ordinary
user-data pool client, including:

```text
login-principal / execution-role preflight
BEGIN
SET LOCAL ROLE
canonical subject resolution
subject assertion
business read/write SQL
COMMIT / ROLLBACK
```

No ordinary statement gets an unbounded path merely because it occurs before or
after the caller's business callback.

The policy is scoped to the ordinary MyeongHa user-data pool. It does not
silently authorize or configure unrelated migration, admin, audit, backup,
restore, or future worker connection classes.

---

## 5. Lock-wait policy

V1 does **not** introduce a separate `lock_timeout`.

A statement waiting to acquire a lock remains bounded by the same five-second
`statement_timeout`. A shorter independent lock budget requires measured
contention evidence and a separate review.

Do not copy historical platform-integrity audit values such as
`statement_timeout='30s'` / `lock_timeout='5s'` into the ordinary runtime.
Those values belong to a different operational boundary.

---

## 6. Failure semantics

A PostgreSQL statement timeout is a database execution failure, not an
authentication failure, validation failure, or retry signal.

For a timeout during an active subject transaction, the existing transaction
adapter remains authoritative:

```text
PostgreSQL cancels the timed-out statement
→ current operation fails
→ transaction adapter attempts ROLLBACK
→ pooled connection is released exactly once
→ original failure propagates through the existing API failure boundary
```

If rollback itself fails, the existing connection-discard behavior remains
authoritative.

V1 adds **no automatic retry**. Retrying a write or transaction fragment without
a separately governed idempotency/retry policy is forbidden.

This policy creates no new public API error code and does not authorize raw
PostgreSQL messages, SQL text, bind values, credentials, or user data to be
reflected to clients. Existing route-level sanitization/failure behavior remains
unchanged.

---

## 7. Explicit non-decisions

V1 does not decide or modify:

```text
whole-transaction transaction_timeout
idle_in_transaction_session_timeout
separate lock_timeout
node-postgres query_timeout
client-disconnect cancellation
request-body EOF/deadline policy
incoming/outgoing JSON byte limits
pagination/page-size authority
connection pool max/idle/acquisition settings
SQL retry/backoff
RLS / execution-role / subject ownership semantics
DB schema or migrations
Supabase Production deployment authorization (#680)
Commerce / PortOne activation
P0-CM-03
```

---

## 8. Verification requirements

Deterministic regression MUST prove:

- V1 pool defaults declare `statementTimeoutMs = 5_000`;
- the concrete node-postgres pool config wires that value to
  `statement_timeout`;
- existing connection-acquisition and idle budgets remain independently bound;
- principal preflight and subject transaction behavior remain unchanged;
- no additional transaction SQL statement is inserted solely to configure the
  timeout;
- existing rollback/discard behavior remains authoritative.

Production closure still requires exact-head CI, fresh-main merge preflight,
expected-head squash merge, exact merged-SHA CI, and exact-SHA Vercel Production
verification. #680 remains an independent HOLD and is not bypassed by this
runtime-only configuration change.

---

## 9. Reopen triggers

Re-review this policy when any of the following becomes true:

- measured legitimate ordinary API SQL regularly approaches or exceeds 5,000 ms;
- a long-running batch/worker query class is introduced;
- lock-contention evidence supports a distinct shorter `lock_timeout`;
- a whole-transaction deadline becomes necessary;
- provider/node-postgres/PostgreSQL timeout semantics materially change;
- cancellation or retry policy expands in a way that changes transaction
  completion semantics.
