# M1-22 — Historical live ledger vs disposable PG17 candidate, recovery and Owner evidence HOLD

> 2026-10-17 · Watchtower-Track: commerce · stacked Draft on M1-21 #2251. **Diagnostic-only**: no production schema/ledger edits, migration repair, backup access, private issue/bind execution, Provider charge/refund or paid Reader activation.

## Evidence provenance (not equivalence)

| Signal | 2026-10-17 historical live observation | Isolated PG17 repository-candidate test | Is the gap closed? |
|---|---|---|---|
| Recorded migration history | 173 rows (read-only snapshot from M1-19) | The CI candidate replays source files into a disposable fresh database; it does **not** rebuild the live `supabase_migrations` history | **No** |
| Repository SQL inventory | 217 source files; 45 not recorded live | Current source tree replayed, **skipping 0860** managed-principal owner case | **No** |
| Live-only SeYeon restore | One `20261008090417` statement, 104,021 bytes, MD5 `f70776d8c0f6369f6f13484ba9fa2271`; six 1460–1510 empty markers | Historical 104KB statement and marker effects **not replayed**, confidential contents not stored in PR/CI | **No** |
| D2 and minimal read | At observation: 1820 D2 issuer/binder and 1970 minimal-read RPC absent; M1-18 catalog gate HOLD | Actual checked-in SQL candidates create private issuer/binder and API-only minimal-read; fresh M1-18 catalog + rollbacked negative ACL probes verify **candidate** | **No; target differs** |
| Execution and role parity | Supabase managed owner / non-superuser conditions require production-specific proof | Stock `postgres:17.6` CI principal is a **superuser**; 0860 is a deliberate skip | **No** |
| Data/restore | Existing live data, historical recovery impact and privacy-sensitive state require Owner decisions | Empty bootstrap schema; no genuine backup/restore or source records | **No** |
| Failure/DR | Actual restore/reconciliation and partial-run recovery require dedicated approved drill | M1-21 proved four **in-transaction** fault rollbacks and idempotent catalog replay (1820,1890,1900,1970); **not** crash/partial autocommit/DR | **No** |

**Snapshot age:** these numbers and observations are explicitly dated **2026-10-17**, not a live query automatically refreshed by each CI run. Any new migration, changed source or restore fingerprint triggers HOLD until an approved **read-only** re-observation. The two timestamped migrations `20261007150457` and `20261008043000` are in the repository; the *only* unmatched remote version is `20261008090417`. Do not count the other two as remote-only.

## New executable controls

1. `scripts/operations/m1-22-nonproduction-evidence-gate.mjs` composes the previous 45 exact-source pinned M1-20 audit with the dated live snapshot, isolated PG17 catalog signals and a strictly **unverified Owner-claims** manifest. A changed 45-file source hash, unreviewed migration version, new remote version or altered historical bundle fingerprint wins priority and returns `HOLD_M1_22_LIVE_OR_SOURCE_DRIFT`.
2. `test/db/official_reader_m1_22_pg17_capture.sql` reads PG17 catalog state only: version, executor superuser status, history table presence, D2 issuer/binder and minimal read availability, trusted API-only minimal-read EXECUTE, private Writer EXECUTE closure and raw source SELECT denial. It records runner-scoped *explicit assumptions* (`historicalRestoreBundleReplayed=false`, `liveDataRestored=false`, `managed0860MigrationSkipped=true`), **not** a factual extraction of historical data from `pg_catalog`.
3. `test/db/run_ci_case.sh` routes new `official-reader-m1-22-pg17-live-isolate-owner-hold` case through the existing PG17 suite; forbids non-disposable connection values and production-secret settings. After normal repository replay and M1-18 positive + four rollbacked negative ACL tests, it captures the catalog, asserts exactly the expected HOLD state and runs eight Node native regression tests. No new CI workflow or privileged integration.
4. `scripts/operations/fixtures/m1-22-owner-release-evidence.HOLD.json` stores **15 unresolved** checkpoints: all nine M1-19 migration risk/Owner groups P1–P9, and six cross-cutting operational/DR requirements listed below. Each default row is `PENDING`, `evidenceRefs=[]`. No fake individual approval, date or signer. Submitted URLs are opaque *claims*, never verified within this module.
5. The Node tests deliberately forge 15 `CLAIMED_APPROVED_UNVERIFIED` statuses with links, remove a mandatory group, try `releaseAuthorization=true`, tamper the historical fingerprint, add a remote-only migration, and widen candidate ACLs. Every case must remain HOLD and all six deployment/payment/issuer authorization booleans remain `false`.

## Six cross-cutting recovery and operational Owner gates

| ID | Required owner | Evidence needed before separate release decision |
|---|---|---|
| `SEYEON_RESTORE_LINEAGE` | SeYeon Restore Owner / DB Security | Approved custody and full source/actor lineage of the **exact** 104KB SQL, six empty markers, incident logs and #1887 decision |
| `NONPRODUCTION_APPROVED_RESTORE` | DB Operations / Privacy | Approved nonproduction restore/sanitization and data-handling access boundaries, traceable restore source and target |
| `HISTORY_AND_CATALOG_PARITY` | DB Security / Commerce | On the **same** restored target: both migration ledger reconciliation and M1-18 catalog/ACL positivity, no substitution |
| `MANAGED_OWNER_ROLE_PARITY` | DB Security | Non-superuser PostgreSQL executor, managed OWNER/GRANT role memberships, SECURITY DEFINER, RLS and privilege parity, including 0860 |
| `INTERRUPTED_REPLAY_AND_DR` | DB Operations / Incident | Backup hash/source, documented RPO/RTO and abort criteria, destructive-change assessment and nontransactional failure/restore test |
| `OPERATIONAL_RELEASE_AUTHORITY` | Commerce / DB / Security / Privacy | Independent written change approval with exact SQL SHA, scope and rollback operator; separate payment/refund/Reader activation decisions |

The nine domain Owner groups inherit their **exact owner, risk, required prerequisites and version lists** from `scripts/operations/m1-19-live-migration-impact.mjs`. These are not collapsed into a Commerce-only approval: P1 account deletion, P2 Reading/Saju, P3 SeYeon AI cost, P4 SeYeon pin/Reader, P5 D2 issuance, P6 cancellations, P7 ACL closure, P8 cancel Workers and P9 API minimal-read all require their respective Owners.

An evidence manifest can mark `PENDING`, `EVIDENCE_SUBMITTED_UNVERIFIED` or `CLAIMED_APPROVED_UNVERIFIED`; malformed or incomplete rows fail closed. **Even all 15 "claimed approved" with links cannot authorize deployment.** A distinct independent authenticated release-signature workflow, target-specific evaluation and human Owner decision remains necessary outside this diagnostic tool.

## CI verdicts and non-goals

- Baseline expected: `HOLD_M1_22_LIVE_PARITY_RESTORE_AND_OWNERS`.
- Source/remote history mismatch: `HOLD_M1_22_LIVE_OR_SOURCE_DRIFT`.
- Disposable DB missing required RPC or ACL denial: `HOLD_M1_22_ISOLATED_PG17_CATALOG_INCOMPLETE`.
- Checklist invalid or attempted direct release: `HOLD_M1_22_OWNER_EVIDENCE_SCHEMA_OR_RELEASE_DRIFT`.
- Asserted approval labels without independent verification: `HOLD_M1_22_UNVERIFIED_APPROVAL_CLAIMS`.

All paths **deny** migration apply, history repair, private issuance, payment/refund, paid Reader and deployment. A **successful CI test means the HOLD is enforced correctly**, not that the production state is ready.

**Next legitimate evidence (separately authorized, not done here):** SeYeon #1887 restore Owner/DR reconciliation; privacy-safe approved nonproduction snapshot; exact source- and history-verified staged replay including 0860 managed principal; interrupted autocommit/recovery drill and target ACL/RLS role parity; dated authoritative catalog/ledger SELECT-only check; final per-domain Owner approvals and explicit release authorization. No operational SQL commands are supplied in this PR.
