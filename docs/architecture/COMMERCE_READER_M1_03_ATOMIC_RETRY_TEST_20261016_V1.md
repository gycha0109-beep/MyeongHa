# M1-03 — 1050 verified Receipt + D2 transaction failure/retry proof

> 2026-10-16 KST · Watchtower-Track: commerce · Private PG15 fixture only
> Parent M1-02: #2172 (stacked over security Draft #2153)

## Why this is new

M1-02 proved that a real `1050`-persisted provider-verified Receipt could separately issue a D2 Grant and bind Reader access in the isolated PG fixture. Separate successful transactions are **not** proof that issuance and binding are atomic. A binding error after a committed issuance would leave an active purchase Grant without the intended Reader binding.

## Executable change

Extend `test/db/official_reader_m1_verified_receipt_d2_private.sh`, run from the existing `official-standard-reading-reader-interpretation` PG15 content case:

1. Persist a new source-linked Verified Receipt via the real `1050` function under `myeongha_commerce_internal_executor`. Verify zero Grants.
2. As fixture DB owner in **one transaction**, execute `1820` D2 issue followed by D2 bind with deliberately invalid `p_request_hash`. Expect the original binder to fail. Verify the pre-existing verified Receipt remains and there are **zero** Grants and Reader access bindings for that Purchase Intent.
3. Retry the same persisted Receipt, calling both D2 issuance and binding in **one READ COMMITTED transaction**; verify exact Purchase Intent, Grant, Reader identity and reused Official Reading. Verify no duplicate after replaying verified evidence.
4. Keep both D2 functions non-executable by the Commerce internal runtime executor.

A failed **bind** must not leave an orphaned **issued Grant**. This regression tests DB transaction composition only; it does not introduce a production caller. The existing D2 three-session/rollback and D3 cancellation races are not reimplemented.

## Admission / limitations

- Expected proof: PG15 `DB dependency · content / content` selected at exact candidate SHA, with explicit `PASS M1-02` log lines for failed-bind rollback and atomic retry. The script itself is renamed neither as an approved app API nor as a new SQL writer.
- Production-equivalent authorized caller identity, role delegation, 1080/1090/1220 alternate entrypoints, new-Grant vs cancel vs positive paid T2 three-session interleavings, PG17 selected testing, Provider Sandbox, and full paid disclosure remain **HOLD / unproven**.
- A passing isolated private fixture is not permission to enable paid checkout, grant EXECUTE, deploy migrations, change protected tables, or merge Drafts.
