# M1-11 — Real TCP loss of PostgreSQL COMMIT acknowledgement on private D2 replay

> 2026-10-16 · Track `commerce` · disposable PG15 fixture only · no operational issuer credentials

## Distinct issue after M1-10

M1-09 proved that cancellation **before COMMIT** aborts an uncommitted D2 issue transaction. M1-10 classified an already committed Receipt based on a *fresh read-only query*, but did not demonstrate that a PostgreSQL client can lose its acknowledgement while the server has committed.

M1-11 introduces a purpose-built **loopback TCP proxy** on the actual PostgreSQL wire protocol. It is attached to exactly **one `psql` session** in the isolated 1050→D2 fixture and does not alter the running PostgreSQL server, network policy or database roles.

## Deterministic fault boundary

The script `test/db/official_reader_m1_11_commit_ack_drop_proxy.mjs`:

1. Rejects any execution outside CI/GitHub Actions on `PGHOST=localhost`, `PGUSER=postgres`, pinned disposable database and a valid port. Requires seven exact fixture UUIDs.
2. Reads the **original persisted** Granted Event effect time and validity time for the **same already-committed 1050 Receipt and D2 Grant**, and snapshots Grant/Event/Reader Access/Outbox/Grant revision/Official Reading binding.
3. Opens an ephemeral loopback TCP listener, with the actual PostgreSQL service as its sole upstream. Launches a new `psql` client with `PGSSLMODE=disable` and `PGGSSENCMODE=disable`, to make protocol framing inspectable; the original PG service remains untouched.
4. Through the proxy, executes one transaction: `BEGIN`, canonical subject, D2 issuer replay **with original persisted effect semantics**, D2 binder replay with original request hash, and `COMMIT`. Both D2 calls must confirm `replayed=true` and the same Grant and Reading.
5. Forwards actual client and server PostgreSQL frames. **Only once the backend emits the protocol `CommandComplete('COMMIT')` frame** (server-side transaction completed) does the proxy intercept that frame and destroy the test client connection before forwarding the acknowledgement. The client must exit with a real connection-loss error and no successful COMMIT result.
6. On a new **direct PostgreSQL connection**, compares the exact state snapshot: no additional Grant, Event, Reader binding or Outbox, no revision change. The existing M1-10 TypeScript-derived read-only SQL then runs again and must still classify **exactly one complete committed Grant/Event/Reading**.
7. Never changes any production roles, credentials, migrations, public API entrypoints or Source/Reader Release. TCP server is loopback-only and its use is entirely contained in an isolated CI fixture.

## What this proves—and does not

This is a **real transport-level COMMIT acknowledgement loss**, not a synthetic thrown exception or statement timeout. Because the proxy waits for the backend's successful `COMMIT` completion frame, the test deterministically exercises the **already-committed server, unacknowledged client** branch.

The test intentionally executes a **replay of an already committed D2 Receipt**, rather than using the proxy to create a first-purchase Grant. This avoids rewriting the older M1-03 first-issue/rollback/retry fixture and prevents the test from claiming new issuer admission. It proves preserved immutable authority under a real lost acknowledgement **for replay**, not the production first-time issuance transport E2E. The broader case of a disconnect *before* COMMIT is resolved still needs a future approved private issuer integration, since the client alone cannot know if PostgreSQL committed.

M1-10's `NO_COMMITTED_EFFECT_VISIBLE` must still **never** authorize automatic first issuance. M1-10's `COMMITTED_COMPLETE_REQUIRES_PRIVATE_REPLAY` is still **HOLD-only**, not a public entitlement response.

## CI acceptance and operational status

At exact Draft HEAD require **PG15 Content** logs for both M1-11 PASS markers, both M1-10 read-only committed checks, and M1-06 replay regression, plus `db-authority-core`, Commerce Work Track, Governance and Web PR. Unselected PG17/Payment/Entitlement/Runtime jobs are SKIPPED, not passed.

The dedicated private issuer credentials, transitive `SECURITY INVOKER` grants, first validity policy, reviewed Saleable Offer, Saju T8 interpretation claims and paid R2/T2 are **HOLD**. No live PortOne payment, refund, production privilege change, deployment or PR merge.
