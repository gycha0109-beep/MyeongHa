# M1-20 — Source-pinned 45-file dependency preflight and PostgreSQL 17 cutover rehearsal

> 2026-10-17 · Watchtower-Track: commerce · Draft only · No production DDL, GRANT, ledger repair, purchases, refunds, entitlement Writers or paid Reader.

## Observed live baseline (read only)

Supabase MyengHa PostgreSQL 17.6 returned **173** recorded migrations. The remote-only `20261008090417` is the known SeYeon `seyeon_runtime_1460_1510_acl_before_owner_recovery` restoration: one SQL statement, 104021 bytes, MD5 `f70776d8c0f6369f6f13484ba9fa2271`. Six 1460–1510 marker rows exist with empty statements. None of 1520–1640 was installed. The official Reader D2 issuer/binder and M1-17 minimal read function are absent; API raw source SELECT remains denied.

This is a point-in-time observation, NOT proof of the privileged operator, verified restore signature, approval, data-state parity or recoverability. M1-19 #2240 identified and classified all **45 missing** repository migrations. All nine Owner/risk groups and their security meaning are preserved; this PR does not reclassify them as deployable.

## New executable preflight

1. `scripts/operations/m1-20-safe-staging-preflight.mjs` **pins exact Git blob SHA-1 for each of the 45 source SQL files reviewed by M1-19** and recomputes each from the current file bytes. Changed, removed or substituted SQL returns HOLD, even if filename and version are unchanged. Git blob SHA-1 is an integrity drift tripwire against the pinned source tree, not a cryptographic approval signature. The M1-19 per-file SHA-256 audit continues separately.
2. The preflight emits a reviewed **necessary-predecessor dependency graph** for official Reader D2, cancellation fences and the minimal read function; it preserves nine Owner classifications and computes a conservative 1970 predecessor closure. A closure is a **review candidate**, never an automatically executable migration subset. Source SQL may contain additional dynamic dependencies or data requirements.
3. `scripts/operations/m1-20-safe-staging-preflight.test.mjs` checks pinned 45 versions, D2/1890/1900/1970 ordering requirements, scope exclusions, altered SQL bytes, extra live-only history, tampered recovery fingerprint and non-authorizing HOLD flags.
4. `test/db/run_ci_case.sh` + `scripts/ci/db-suites.json`: fresh disposable PostgreSQL 17 database, current repository migration replay (with the same explicit **0860 managed-principal skip** as other PostgreSQL 17 cases), existing M1-18 positive catalog gate plus **four rollbacked ACL escalation probes**, and M1-19/M1-20 Node tests. The case is now routed into normal PostgreSQL 17 CI. No fixture is an exact clone of the operational database or remote-only 104KB bundle.

## What this test does NOT prove

- No exact `20261008090417` historical SQL is executed: the remote-only 104KB incident bundle is not stored in this branch or printed in CI.
- No production data, live migration metadata or live role privileges are written.
- PostgreSQL 17 source-tree replay is not a production data-backed migration cutover rehearsal, full cross-track dependency graph, authoritative privilege owner check or isolation of every mid-migration failure.
- `1820` private issuer functions may exist in isolated fixtures, but they are not authorized for runtime execution.
- `1970` minimal status RPC has approved code scope only; live installation is still blocked by provenance, preflight and Owner/DR release obligations.

## Independent HOLD gates, required before any future operational application

- SeYeon restore Owner decision and full non-public incident / DR audit trail (#1887, merged discovery #1892), together with impact of historical bundled 1460–1510 on actual function definitions and GRANT/RLS.
- Privacy/Identity approval for 1520 and data effects, Reader/Saju for 1530–1540, SeYeon runtime/AI-cost for 1550–1710, Commerce refund/Writer for 1740–1960, DB/Security for 1890/1900 and minimal-read EXECUTE.
- Approved nonproduction Supabase restore or production-equivalent snapshot **without exposing customer data**. Replay precisely agreed migrations with data/role drift, interrupted-apply, rollback, destructive-change and restore tests. First establish independent baseline and approved backup/restore mechanism.
- Re-run M1-18 read-only catalog gate **and** migration history parity against the exact target state. Both must pass; `SKIPPED` is not a pass, and success of either alone is not deployment authorization.
- Distinct explicit operational release approval for live SQL changes; separate product, payment/refund, private Writer and paid Reader activation decisions.

**Current decision:** `HOLD_M1_20_OWNER_STAGING_AND_RESTORE_EVIDENCE_REQUIRED` if reviewed sources are unchanged, or `HOLD_M1_20_UNRECONCILED_SOURCE_OR_DEPENDENCY` if any required evidence drifts. All deployment, migration repair, issuer activation, charge/refund and Reader-publication booleans are `false`.
