# M1-27 — Synthetic Receipt authority-state matrix and restricted-definer RLS boundary

> 2026-10-18 · Watchtower-Track: commerce · stacked Draft on M1-26 #2273. **Disposable PG17 only**: no live DB writes, Provider payment/refund, private D2 issuer/binder or paid Reader activation.

## Motivation and contract

M1-26 proved a restricted `SECURITY DEFINER` can actually read a synthetic verified Receipt, returning `INCOMPLETE_OR_CONFLICTING_AUTHORITY` when its source-table SELECT is granted only to the definer; API raw SELECT remains denied. It did **not** individually exercise the positive-complete, zero-visible-effect, independent conflict and PostgreSQL row-level security boundaries.

M1-27 exercises the **unchanged** SQL of `supabase/migrations/1970_official_reader_unknown_commit_minimal_read_v1.sql`. It is still the same narrowly scoped **read-only enumeration**, never an issuance permission or compensation directive.

## Verified matrix in synthetic source-tree PG17

| Fixture state | Expected exact result |
|---|---|
| Verified purchase intent/Receipt with capability snapshot, *zero* committed grants/events/Reader accesses | `NO_COMMITTED_EFFECT_VISIBLE` |
| B2 verified Receipt, single active purchased Grant + granted Event, correct Reader selection/binding and consistent validity metadata | `COMMITTED_COMPLETE_REQUIRES_PRIVATE_REPLAY` — classification only; **no private Writer** |
| Previously completed B2 with projection explicitly marked revoked while the immutable receipt-granted Event remains | `INCOMPLETE_OR_CONFLICTING_AUTHORITY` |
| Existing revoked/partial fixture Reader purchase | `INCOMPLETE_OR_CONFLICTING_AUTHORITY` |
| Unknown UUID with no Receipt | `SOURCE_UNAVAILABLE` |
| Trusted subject context absent | SQLSTATE `28000` |
| Subject UUID mismatches the harness-bound current subject | SQLSTATE `42501` |
| READ ONLY but repeatable-read isolation rather than required READ COMMITTED | `STALE_SNAPSHOT_UNSUPPORTED` |

The fixture comes from the existing `official_standard_reading_reader_interpretation.sql`. M1-27 adds just one additional unique verified synthetic Intent/Receipt with **no downstream effects**, and adjusts only the already-fixtured B2 entitlement **projection status** to express consistent and conflicting states. It does not fabricate Provider network evidence, execute any private D2 writer, or alter migration SQL. The complete scenario is fail-closed: a non-complete status is a test failure, never accepted as equivalent.

## RLS identity and privilege boundary

A dedicated CI-only `NOLOGIN NOSUPERUSER NOBYPASSRLS` owner is assigned to the 1970 function in the disposable database. Only this Owner receives SELECT on 11 source tables and the narrow subject-helper EXECUTEs. API, anon, authenticated, service and public **never** receive raw source SELECT or D2 issuer EXECUTE.

M1-27 adds an **artificial, clearly marked CI-only SELECT policy** on `commerce_receipts`:

`TO myeongha_m127_definer_ci USING (subject_id = public.current_myeongha_subject_id())`

and enables RLS on the disposable table. The same non-bypass restricted Owner must see **one** synthetic Receipt row with its own subject GUC and **zero** rows under a different subject GUC. The API's actual `SECURITY DEFINER` read path still must return its approved scalar enum rather than raw rows. Existing M1-18 catalog positive check and four rollbacked ACL-negative probes run again.

**This is not a production policy migration.** The selected subject GUC is set by a trusted *test fixture*. It is not evidence that untrusted clients may provide UUIDs/GUC values in real APIs. The test-only RLS policy is not a replacement for genuine data-backed Supabase Owner/RLS/grantor review.

## Migration and release blockers

M1-20 reviewed-source SHA preflight still checks all 45 repository versions absent in the **2026-10-17 historical** live migration snapshot. The source-only PG17 replay intentionally skips the separate `0860` managed-principal migration and excludes the remote-only confidential SeYeon restore, production data and migration ledger. Operational parity, approved restore/DR, 15 cross-domain Owner/recovery evidence checkpoints and final cutover signatures are **still absent**.

A passing test establishes only **this synthetic matrix**. `NO_COMMITTED_EFFECT_VISIBLE` is not evidence that a concurrent issuer has finished, and `COMMITTED_COMPLETE_REQUIRES_PRIVATE_REPLAY` never authorizes issuing anything. Even all-green CI does not authorize live 45-file migration replay, remote-only 104KB restore, permission broadenings, payment/refund, paid Reader activation or merge. **HOLD remains in force.**
