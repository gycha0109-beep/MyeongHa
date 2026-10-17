# M1-28 — Guest resolver and independent restricted API TCP session boundary

> 2026-10-18 · Watchtower-Track: commerce · stacked Draft after M1-27 #2278. All writes/role changes only in disposable PostgreSQL 17 CI. No production data, payment/refund, D2 private issuance, Reader activation, or deploy authorization.

## Remaining gap after M1-27

M1-27 proved the actual 1970 minimal-read enum matrix and synthetic receipt RLS policy, but its harness directly bound `myeongha.subject_id` with `set_config()` as the stock CI service identity. That is useful to isolate the PostgreSQL RLS predicate; **it does not prove a server-resolved guest session or any authenticated API route**.

M1-28 exercises the checked-in `0790_subject_execution_context.sql` **`begin_guest_subject_context_v1(text)`** as called by an independently authenticated `NOSUPERUSER NOBYPASSRLS` TCP LOGIN, with a SET-only, noninheriting membership in `myeongha_api_executor`. The resolver validates the synthetic `guest_sessions` record and binds the subject into the transaction before invoking the **unchanged 1970** read-only function.

## Explicit positive and negative SQL checks

| Boundary | Expected PostgreSQL behavior |
|---|---|
| Independent login before `SET LOCAL ROLE` | Reader minimal RPC denied **42501** (no privilege inheritance) |
| API role without resolved transaction Subject | Reader minimal RPC denied **28000** |
| Valid synthetic guest hash mapped to existing receipt Subject | Actual Reader RPC returns `INCOMPLETE_OR_CONFLICTING_AUTHORITY` (existing fixture state), no raw IDs |
| Valid synthetic guest hash for another Subject | Original Subject's Receipt cannot be enumerated: `SOURCE_UNAVAILABLE` |
| Another Guest resolver followed by original Subject parameter | Denied **42501** due to mismatch |
| Unknown, expired or consumed synthetic guest hash | Resolver denied **28000**, before Reader query |
| Successful Guest resolver, followed by COMMIT on same TCP connection | `myeongha.subject_id` returns empty (transaction-scoped, not session leaked) |
| Direct SQL GUC write by an actor already allowed to assume API role | **Demonstrated gap/HOLD:** the 1970 RPC can accept a syntactically matching GUC without running the credential resolver; it is **not authentication** |

The fixture is the previously reviewed `official_standard_reading_reader_interpretation.sql` synthetic Reader/Commerce data. Only CI records are inserted: two guest-session hashes with synthetic guest subjects, a single new guest Subject, and ephemeral roles. The two token hashes are **not real customer credentials or cryptographic attestations**. `BEGIN READ COMMITTED READ ONLY` wraps all Reader calls and no private Writer/Provider APIs run.

Like M1-26/M1-27, the 1970 `SECURITY DEFINER` is temporarily owned by a fresh `NOLOGIN NOSUPERUSER NOBYPASSRLS` CI-only role with SELECT on the eleven source tables. A fixture-only `commerce_receipts` RLS policy limits that Owner by the resolver-bound Subject. **Ordinary API identity receives no raw Receipt/Entitlement/Reader SELECT**, and the M1-18 catalog and four rollbacked negative ACL probes must pass.

## Important security conclusion, NOT a release permit

The server-resolved Guest function is callable only under a trusted API execution identity. It expects the API backend to have **verified the guest credential before passing its fingerprint**. SQL alone cannot prove the backend validated any credential, because a PostgreSQL custom GUC is writable by an identity with SQL execution. M1-28 therefore deliberately **documents and detects the direct-GUC bypass possibility** under an already trusted API role. This is the architectural reason why browser-supplied `subject_id` or user-writable GUC **must not be treated as authentication**, even when the SQL subject-context assertion succeeds.

A passing CI run validates the PostgreSQL transaction/SQL fence only. It does **not** prove production API authentication enforcement, HTTP adapter identity binding, real Supabase Owner/grantor/RLS and `0860` parity, SeYeon historical restore, ledger repair, disaster recovery, production-equivalent nonproduction data, or the 15 independent Owner/recovery approvals. Live migration/payment/refund, D2 Writer and paid Reader remain **HOLD**. The PR stays **Draft/unmerged**.
