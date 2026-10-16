# M1-12 — First D2 issue+bind with real PostgreSQL COMMIT acknowledgement loss

> 2026-10-16 · Commerce Track · disposable PG15 fixture **only** · real production private issuer remains **HOLD**

## Gap in M1-11

M1-11 intercepted a genuine PostgreSQL `CommandComplete('COMMIT')` backend frame while replaying an **already committed** 1050 Receipt→D2 Grant/Reader binding, then showed that a new connection read unchanged authority. It did **not** cover the harder case where the first purchase-backed Grant and its Reader Access are being committed for the **first time**.

M1-12 now replaces the previously successful owner-only M1-03 first issue+bind transaction with a real **first D2 issue+bind over a fault-injected loopback TCP connection**. This is an integration test, not a production Worker, and it does not change private DB function privileges.

## Concrete execution

`test/db/official_reader_m1_12_first_issuance_commit_ack_drop_proxy.mjs`, invoked from the existing `test/db/official_reader_m1_verified_receipt_d2_private.sh`:

1. Accept only CI/GitHub Actions `PGHOST=localhost`, `PGUSER=postgres`, a pinned disposable DB name, validated port and six exact fixture UUIDs.
2. Verify the existing `1050` canonical production-marked **synthetic verified Receipt** and matching verified Purchase Intent. Snapshot purchased Grant, Granted Event, Reader Access, source Event outbox, Provider Effect, and original Official Reading binding: must be `0/0/0/0/0/1`.
3. Use the existing one-shot loopback TCP proxy from M1-11 to relay a PostgreSQL session with `BEGIN`, canonical Subject context, **actual first** D2 private `1820` issuance using a transaction-owned time anchor, D2 Reader bind to the existing Official Reading with original Reader request hash, and `COMMIT`.
4. Require the issuer's result to be a fresh `result_replayed=false` Grant, and the binder's result to be the same new Grant/Official Reading with `access_role=additional_reader`, `official_reading_created=false`.
5. Intercept **only** the actual PostgreSQL backend `CommandComplete('COMMIT')` frame; destroy the client TCP connection before forwarding that frame. A nonzero `psql` exit with an actual broken-connection error is mandatory. Waiting until a successful backend COMMIT response eliminates the ambiguity about server-side durable commit *for this one deterministic CI test*, while the **client has no acknowledgement**.
6. Reconnect **directly** to PostgreSQL and verify exactly one purchased Grant, one immutable Granted Event, one Reader Access, zero later Provider Effect, 0–1 original entitlement Outbox row and unchanged original Official Reading binding. Re-read exact new Grant ID, original Event and Reader access to prove all three are committed under the same canonical Receipt/Subject/Intent/Reading.
7. Produce `ISSUE|<original Grant>|f` and `BIND|<original Reading>|<original Grant>|additional_reader|f` from that **new authoritative DB read**, retaining the M1-03 fixture acceptance checks. Do not accept a cached client success or the lost COMMIT acknowledgement as authority.
8. Continue unchanged M1-03 `1050` evidence replay, M1-06 original-effect semantic replay, M1-07 source query, M1-10 read-only unknown-COMMIT classification, M1-11 already-committed replay TCP fault, and final M1-10 query again.

## What is and is not established

This test is **first issuance in a disposable fixture under the fixture's DB owner**, not a first issuance through an approved private Worker credential. It tests one deterministic branch: the backend has *committed*, and the transport drops the successful acknowledgement. It does **not** prove that every disconnect was after COMMIT; in the real unknown-ack case, the client must *first read canonical DB state* and **cannot assume either rollback or success**.

M1-10 remains read-only, and always returns `status='held'`, `automaticRetryAuthorized=false`, `publicDisclosureAuthorized=false`—even if a complete Grant/Reader is observed. The existing `apps/api` private Writer inventory remains a hard DENY and is not modified.

## Exit checks and missing owner approvals

At the exact PR HEAD, require **both** M1-12 PASS log lines plus M1-03 same-Receipt recovery, M1-06 replay, M1-10 reconciliation and M1-11 replay COMMIT fault in PostgreSQL 15 Content, along with Commerce Work Track, Governance, Web PR and `db-authority-core`. Skipped PG17, Commerce Payment/Entitlement and Runtime suites do not count as successes.

The separate approved execution identity/credential custody, transitive `SECURITY INVOKER` grants, first validity anchor policy, saleable Offer/Charge Terms, refund/restore and Saju production T8 Source pack remain **HOLD**. No migration, production DB access, role GRANT/REVOKE, live PortOne payment/refund, runtime D2 Writer, paid T2, deployment or PR merge.
