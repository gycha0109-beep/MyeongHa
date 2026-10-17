# M1-14 — Reject stale MVCC snapshots during unknown-COMMIT reconciliation

> 2026-10-17 · Track `commerce` · Draft-only, isolated PG15 fixture and fail-closed runtime read port · no production private issuer

## Gap after M1-13

M1-13 established that an observer sees **zero** purchased rights while a separate first D2 issuer has not committed and holds its locks. M1-12 established that **a first issue+bind may be fully committed on the server while the issuer client loses the TCP COMMIT acknowledgement**. The remaining gap is **snapshot age**: if a recovery reader started a `REPEATABLE READ` transaction **before** the issuer committed, subsequent reads in that transaction may *continue* to see no Grant/Event/Reader, even after the issuer's successful durable COMMIT.

Thus a structurally sound, pinned 1050 Receipt and a single coherent SQL statement do not guarantee current source state when the statement executes in a reused `REPEATABLE READ` or `SERIALIZABLE` transaction.

## Source guard: never promote a reused snapshot

Change `apps/api/src/official-reader-unknown-commit-reconciliation-v1.ts`:
- The **same** read-only source-derived SQL now selects `pg_catalog.current_setting('transaction_isolation') as "snapshotIsolation"`.
- Classification permits only **`READ COMMITTED`** PostgreSQL statement-level views. Any other isolation mode returns `{status:'held', reason:'STALE_SNAPSHOT_UNSUPPORTED', automaticRetryAuthorized:false, publicDisclosureAuthorized:false}`.
- Existing outcomes remain **HOLD-only** even at `READ COMMITTED`. This guard **cannot prove that another uncommitted transaction is absent**, nor can it grant issuance authority. It is necessary but not sufficient to resolve an actual unknown COMMIT; a future independently approved worker would need to use the original D1 locks and original Event semantics.
- Unit tests include `REPEATABLE READ` for both missing and complete source rows, plus `SERIALIZABLE`. There is no exception for a syntactically valid missing Grant in a stale snapshot.
- The M1-10 PG15 test helper now uses a **fresh `READ COMMITTED READ ONLY`** transaction and asserts the literal isolation value. It extracts the exact updated SQL from TypeScript and validates the 31st returned column; the remaining 30 lineage fields are unchanged.

The injected TypeScript transaction port remains **unimplemented for production private owner**. Merely using `READ COMMITTED` on a pooled or reused transaction does not establish production freshness; the future actual implementation must own a **fresh transaction lifecycle**, not reuse a long-running snapshot. This PR grants no operational execution authority.

## Three views of one real first COMMIT

New `test/db/official_reader_m1_14_stale_snapshot_first_issue.mjs` replaces the direct call to M1-12 in the existing isolated 1050/D2 fixture:

1. **Reader B, initial snapshot:** a persistent `psql` connection begins `REPEATABLE READ READ ONLY`, prepares and executes the **literal M1-10 TypeScript SQL**. It sees the verified 1050 Receipt with zero committed Grant/Event/Reader/Outbox and a `repeatable read` isolation flag, records its backend PID, and stays `idle in transaction`.
2. **Issuer A, actual first COMMIT:** invokes the unchanged M1-12 loopback TCP first-issuance experiment against the same Receipt. The D2 issuer and binder commit **for the first time**; the proxy suppresses the real backend `CommandComplete('COMMIT')`, and the psql issuer observes a broken connection. The M1-12 private fixture's **fresh direct DB read** confirms one new original Grant/Event/Reader.
3. **Reader C, fresh DB:** after issuer A committed, a completely separate `READ COMMITTED READ ONLY` session executes the same literal M1-10 SQL and must see **exactly one** canonical Grant, Event and original Reading with active entitlement.
4. **Reader B, still stale:** the original reader B is still `idle in transaction`. Executing the same prepared SQL a second time **must still see zero Grant/Event/Reader** and the `repeatable read` isolation mode. This is a genuine stale MVCC view after a successful first COMMIT, not an artificially fabricated result.
5. **Reader B refresh:** B commits its old read-only transaction, begins a new `READ COMMITTED READ ONLY` transaction and executes the same prepared SQL. It must now see the exact same Grant/Reading as reader C. No mutations, new issuer, or extra D2 call from readers.
6. Continue unchanged M1-03/06/10/11 checks and record all rows using the source-only M1-10 query. Existing M1-13 uncommitted-writer MVCC/lock conflict and rollback run **before** this experiment, ensuring both causal directions are tested.

## Expected evidence

Require exact HEAD PG15 Content logs showing:
- M1-14: issuer first COMMIT succeeds with old reader still seeing no effects;
- M1-14: fresh reader sees one committed Grant/Event/Reader but old same-session reader still sees none;
- M1-14: closing the old transaction and opening a fresh `READ COMMITTED` view converges on original Grant/Reading;
- existing M1-13 `55P03` competing issuer block and M1-12 first TCP COMMIT-ACK loss, M1-06 original-event replay, M1-10 HOLD-only classification, M1-11 replay ACK-loss checks.

Also require Commerce TypeScript/affected Vitest, `db-authority-core` Reader Writer inventory, Governance, Web PR Domain Gates, exact HEAD CI Verify. PG17/Commerce Payment/Entitlement/Runtime suites SKIPPED by scope are not counted as passed.

## Hard authorization fence

No `apps/api` D2 private Writer reference, new SQL migrations, production GRANT/REVOKE, login/secret, live provider charge/refund, saleable Offer activation, Saju production T8 interpretation, public paid R2/T2, deployment or Draft merge. Only disposable fixture-owner transactions exercise private D2. The observation of no visible committed Grant **never** permits automatic first issuance.
