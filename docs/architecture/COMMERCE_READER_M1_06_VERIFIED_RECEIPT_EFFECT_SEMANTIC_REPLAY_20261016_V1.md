# M1-06 — Verified Receipt → private D2 effect-semantic replay

> 2026-10-16 · Track `commerce` · isolated PostgreSQL regression · no runtime cutover

## Gap in the existing real-Receipt integration

M1-02/03 persist a canonical verified Receipt using actual `1050` as `myeongha_commerce_internal_executor`, then use a fixture-owner-only D2 `1820` issue+bind transaction. M1-04 denies actual API/Commerce role access to D2 and the old 1090 issuer. M1-05 shows a new role with **only D2 top-level EXECUTE** still cannot issue, because the wrapper is `SECURITY INVOKER`.

M1-03 previously replayed **1050 evidence** but did **not** repeat D2 issuance and binding against that same already-fulfilled Receipt. That leaves a semantic retry trap:

- Original `1080 internal_apply_entitlement_effect_v1` derives an `event_dedupe_key` from the exact receipt, event type, `effective_at`, target state, target validity interval and reason.
- When an existing Receipt Grant/Event is found, `1080` compares the event semantics. A second call using a **new `transaction_timestamp()`** is **not** a valid replay. It must fail with an entitlement effect source semantic conflict.
- A successful replay must reuse the **persisted original event semantics**, not a new timestamp, client-provided amount/role or guessed current date.

## New executable check

`test/db/official_reader_m1_06_verified_receipt_semantic_replay.sh`, called at the end of the existing `official_reader_m1_verified_receipt_d2_private.sh` fixture:

1. Resolve a **single existing** `entitlement_events` receipt/grant `granted` event, including its exact persisted UTC `effective_at`, `target_valid_from`, `target_valid_until` and reason. In the current isolated fixture, the latter two are NULL.
2. Snapshot purchased Grant count, `granted` event count, purchase-linked Reader access, source Official Reading binding, matching entitlement outbox count and Grant revision.
3. Invoke the *actual* private D2 1820 issuer for the same 1050 Receipt, changing only effective time by one second. Require the original 1080 semantic-conflict rejection; snapshot must not change.
4. Under one isolated-owner `BEGIN`/transaction, repeat D2 issuance with the **original** event times, then D2 Reader binder with the **identical original** request identity/snapshot. Both must return replay; exact purchased Grant and Official Reading must match.
5. Snapshot must remain exactly unchanged: no duplicate entitlement events, outbox, Reader binding, extra Grant, Official Reading or revision increment.

All tests run only with `CI=true`, `PGHOST=localhost`, `PGUSER=postgres` and the pinned disposable DB names. No production role grant, key, migration, PortOne request or public response.

## Next actual issuer contract

The private production-equivalent issuer must resolve both the **canonical Receipt lineage** and the **original idempotent effect semantics from authoritative DB rows** when replaying. It cannot use current time in an unchanged Receipt replay. Issuance and Reader bind must be one transaction under a specifically reviewed private execution identity, D1 L0→L1 lock order and current Product/Reader selection. A new Writer role or privileged gateway is **not authorized** by this test.

This supplies a real replay-contract proof for the future issuer but does not implement the issuer's permitted identity. Saju production content, Offer/Charge Terms, paid T2 and saleability all remain HOLD.

## CI acceptance

Check exact PR HEAD and **both** PG15 Content dependency and db-authority-core; the parent lineage also has Commerce Work Track/Governance/Web PR checks. Skipped PG17, Payment and Entitlement suites are not PASS.