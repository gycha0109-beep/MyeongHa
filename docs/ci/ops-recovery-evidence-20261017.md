# CI / Operations — backup, restore, artifact and Production gate evidence (2026-10-17)

> Owner: ops. Scope: read-only verification of GitHub Actions run/job/artifact metadata and reviewed workflow sources. No Production database access, restoration, migration, secrets, environment approvals or external API activity. Snapshot claims expire when newer runs occur.

## Evidence matrix

| Requirement | Observed record (UTC) | What is proven | Still unproven / action |
| --- | --- | --- | --- |
| Encrypted logical backup | [Workflow 38966874424](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38966874424) — created 2026-10-16 21:05, result success, `encrypted-logical-backup` job success | Governed backup job and encrypted artifact upload completed | Restore of *this exact* backup has not been observed; production data integrity and completeness require a matching drill |
| Backup artifact retention | Artifact `myeongha-postgres-20261016T210546Z`, `expired=false` at inspection, expires 2026-11-15 21:07:57 UTC | Metadata proves the artifact was not expired at inspection | Artifact expiry is a time limit, not proof of present/future download or decryptability; re-check before drill |
| Isolated restore drill | [Workflow 38090483306](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38090483306) — created 2026-10-10 22:11, `isolated-supabase-postgres-17-restore` success | Older governed backup `38088591661` was restored in an isolated environment, as recorded in the completed run | Not the 2026-10-16 backup; authoritative Production privacy ledger replay not exercised in the drill. No basis for current-backup RPO/RTO claim |
| Restore artifact retention | `postgres-isolated-restore-drill-38090483306`, `expired=false` at inspection, expires 2026-11-09 22:12:31 UTC | Prior drill evidence artifact exists and is unexpired | Does not extend to latest backup |
| Privacy recovery | [Ledger workflow 39027649713](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39027649713) success, artifact `myeongha-privacy-ledger-20261017T111019Z`, expires 2026-11-16 11:10:19 UTC | A separately governed encrypted ledger artifact was produced | It was not replayed during prior drill 38090483306; cannot assert integrated privacy recovery |
| Production deployment decision | [Supabase Production 39034522823](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39034522823) — change gate success; `deploy-migrations` and `governed-seyeon-relationship-backfill-1400-1450` both **skipped** | Change relevance decision ran successfully | **No deployment or backfill execution is proven** by workflow success |
| Later Production gate | [Supabase Production 39036400925](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39036400925) on 35ab8ae3… — success, same two execution jobs **skipped** | Another successful *gate*, not actual database mutation | No new migration proof |

Source-of-truth for trigger and retention contracts:
- [Production PostgreSQL Logical Backup](../../.github/workflows/production-postgres-backup.yml): protected `production` environment, encrypted export, `retention-days: 30`.
- [PostgreSQL Isolated Restore Drill](../../.github/workflows/postgres-isolated-restore-drill.yml): environment `production`, exact backup-run input / guarded one-shot, isolated PostgreSQL restore; do not dispatch without owner approval.
- [Supabase Production](../../.github/workflows/supabase-production.yml): `change-gate` controls conditional `deploy-migrations`; status of the workflow itself is insufficient to claim deployment.

## Read-only acceptance matrix

- **Backup success** — supported for run 38966874424, not an RTO/RPO guarantee.
- **Restore of that latest backup** — **NOT VERIFIED**. A matching successful drill or approved fresh drill and provenance check is needed.
- **Restore drill freshness** — older 2026-10-10 sample verified; relative recency by policy is **not established** by one sample.
- **Artifacts** — retention/expiration values observed; re-query at point of use, do not assume permanent availability.
- **Production approval** — protected environment declared in workflows; **actual environment reviewer approval history not established** by success metadata alone.
- **Production SQL executed** — **NOT VERIFIED** for cited successful but skipped deployment workflows.
- **Privacy ledger replay into restored DB** — **NOT VERIFIED** by the cited older restore.

## Next approvals (do not execute here)

1. Ops/DR owner to approve a bounded isolated restore drill of the *same* unexpired latest backup, specifying run ID, expected ledger provenance, duration, evidence retention and cost, without touching Production DB writes.
2. Security/privacy owner to decide whether authoritative Production privacy ledger replay is necessary and authorize its exact snapshot boundary.
3. Production deployment/approvers to verify protected-environment reviewer policy and independently review any migration execution. Do not equate CI and deploy gates.

No policy, secrets, deployment code, schedules, backup retention settings or protected-environment rules were modified in preparing this evidence.
