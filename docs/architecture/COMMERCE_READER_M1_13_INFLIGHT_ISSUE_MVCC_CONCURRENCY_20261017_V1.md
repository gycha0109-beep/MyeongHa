# M1-13 — In-flight first D2 issuance: MVCC invisibility and competing-issuer lock

> 2026-10-17 · Track `commerce` · only isolated PostgreSQL 15 CI fixture owner · no approved operational issuer

## Gap following M1-12

M1-12 demonstrated the first successful purchase-backed Grant+Reader binding when PostgreSQL had committed and a proxy discarded the real `CommandComplete('COMMIT')` frame. M1-10 classifies a source Receipt with no **currently committed** effects as `NO_COMMITTED_EFFECT_VISIBLE`, always `automaticRetryAuthorized=false`. However, the actual concurrency case remained untested: **another transaction may already be issuing the Grant and holding the original D1/D2 locks while a read-only recovery session observes no committed effects**.

A missing visible Grant does **not** establish that another first issuance was never started or that a pending COMMIT will not succeed.

## Executable 3-session race in one isolated 1050 fixture

`test/db/official_reader_m1_13_inflight_first_issue_mvcc_probe.mjs` runs after M1-09 timeout rollback and **before** the M1-03 downstream-bind rollback and M1-12 actual first COMMIT-ACK loss fixture.

1. Require CI/GitHub Actions with pinned disposable database name, `PGHOST=localhost`, `PGUSER=postgres`, validated six fixture UUIDs. Assert canonical verified `1050` Receipt exists with **zero committed** purchased Grant, original Entitlement Event, Reader Access or corresponding Outbox entries, and existing original Official Reading binding.
2. **Session A (transaction writer):** a real `psql` client performs `BEGIN`, canonical subject, private 1820 D2 first issue (`result_replayed=false`) and bind to the original selected Official Reading in **one open transaction**. Read its own newly minted Grant/Event/Reader Access and backend PID; require one of each and `pg_stat_activity.state='idle in transaction'`. Importantly, **do not send COMMIT**.
3. **Session B (read-only observer):** while A is still open, run `test/db/official_reader_m1_10_unknown_commit_source.sh`, which extracts the **literal TypeScript reconciliation SELECT** and evaluates it in a fresh `REPEATABLE READ READ ONLY` PostgreSQL session. It must see the verified Receipt but **zero committed Grant/Event/Reader/Outbox**, reporting an observation that keeps automatic retry HOLD. Verify A remains open and its effects invisible to direct fresh reads.
4. **Session C (competing issuer):** independently attempt another initial private D2 issuance against the **same Receipt**, with `lock_timeout=350ms`. This is deliberately a fixture-owner authorization for a concurrency test, **not a production worker**. The original D1/D2 transaction locks must block it and PostgreSQL must reject with **SQLSTATE `55P03`**, not complete an accidental duplicate issuance. Verify the committed snapshot still unchanged.
5. **Session A rollback:** explicitly `ROLLBACK` the uncommitted first issuance, require clean exit, and prove the previously verified Receipt still has no committed Grant/Event/Access/Outbox side effects. The original M1-03 bad-bind atomic rollback and M1-12 first successful issuance with real lost TCP COMMIT ACK then run normally, followed by M1-06/M1-10/M1-11 regressions.

Both **absent visible effects during an in-flight issue** and **no visible effects after a confirmed rollback** are non-authorizing observations. The M1-10 runtime contract must never reissue merely because a read-only SELECT returned zero.

## Expected proof and remaining restrictions

Require exact PR HEAD PostgreSQL 15 Content log:
- `PASS M1-13: real first D2 issue/bind exists in open writer transaction, but M1-10 separate snapshot sees no committed rights and keeps auto-retry HOLD`
- `PASS M1-13: competing same-Receipt issuer fails with SQLSTATE 55P03 while the original first-issue transaction is uncommitted`
- `PASS M1-13: rollback removes writer-only first-issue effects; verified Receipt remains ready for separate M1-12 test`
- Existing M1-12 real first-issue TCP COMMIT loss, M1-06 exact Event semantics and M1-10 read-only post-COMMIT classification also PASS.

Require `db-authority-core` private Reader Writer inventory, Commerce Work Track, Governance, Web PR and overall CI Verify, not just the PG15 fixture. Skipped PG17, Commerce Payment/Entitlement and Runtime suites do not count as successes.

## Authority limits

This test creates **no SQL migration, permanent role, credential, RLS policy, production ACL, API private Writer import, public Reader route or paid result**. The DB owner only issues inside the disposable fixture. Production first-validity/expiry policy, dedicated private issuer role and transitive SECURITY INVOKER permissions, saleable Offer and charge terms, Saju relationship interpretation T8 claims and R2/T2 public authorization all remain HOLD. No production payments/refunds, deploy or Draft merge.
