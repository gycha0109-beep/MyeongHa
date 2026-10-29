# Production migration provenance comparison — 2026-10-29 (read-only)

> Track: `ops` · Authority issue: [#1887](https://github.com/gycha0109-beep/MyeongHa/issues/1887)
> Scope: production migration-history evidence and local SQL **mismatch identification**, not a `migration repair`, DDL deployment, or proof of restored Hosted services.

## Observed production history

Production project `cnsfpcdiyofqvhpcegfc` was queried through read-only `SELECT` over
`supabase_migrations.schema_migrations` on 2026-10-29.
The latest registered migration remains `20261028011357`.

| Remote version | Registered name | `length(statements[1])` | `md5(statements[1])` |
| --- | --- | ---: | --- |
| `20261008090417` | `seyeon_runtime_1460_1510_acl_before_owner_recovery` | 104021 | `f70776d8c0f6369f6f13484ba9fa2271` |
| `20261028011357` | `owner_sandbox_signed_receipt_persistence_v1_20261028` | 9260 | `205e865779731b90eefa39a50d893628` |

The current repository does **not** contain a migration file with version
`20261008090417`. Its six related numbered migration files are listed below;
the combined remote SQL is **not** a byte-for-byte concatenation of these
current files. A local file named
`20261028110500_owner_sandbox_signed_receipt_persistence_v1.sql` has a
different version identity from remote `20261028011357`. An earlier
read-only prefix comparison found the latter remote body equal to the
repository file up to its final local `\n\ncommit;\n` terminator, which
explains a ten-character length difference **without** making the migration
IDs equivalent.

## Remote-only `20261008090417` vs current repository sources

The following positions are **1-based character positions** in the stored
single remote SQL string. `first local mismatch` is relative to the
matched local file beginning at its first 170-character prefix; these
comparisons used read-only `strpos` and character-by-character `substring`
via `SELECT`, not reapplication of any SQL.

| Repository file prefix | Local chars | Remote prefix offset | First local mismatch | Directly observed divergence |
| --- | ---: | ---: | ---: | --- |
| `1460_seyeon_production_relationship_runtime_read_v1.sql` | 4986 | 639 | 3695 | Local role grant; remote goes to function comment |
| `1470_seyeon_relationship_sync_outbox_v1.sql` | 16192 | 5520 | 13642 | Local role grant; remote goes to function comment |
| `1480_seyeon_production_context_runtime_v1.sql` | 9584 | 21552 | 8213 | Local role grant; remote goes to function comment |
| `1490_seyeon_production_chat_execution_runtime_v1.sql` | 36434 | 31006 | 29923 | Local owner grant; remote contains a pre-owner ACL installation comment |
| `1500_seyeon_post_turn_analysis_runtime_v1.sql` | 31663 | 67421 | 26114 | Local owner grant; remote contains a pre-owner ACL installation comment |
| `1510_seyeon_production_runtime_composition_v1.sql` | 2153 | 98893 | Not observed in earlier full containment check | Full local file previously found within remote body; this does not establish full remote-bundle equivalence |

The remote statement's 170-character starting and ending fragments of
1460–1500 match, but each contains intervening differences. The actual
difference can change owner/ACL installation ordering, so do not replace
`20261008090417` with the current six files or silently repair remote
migration history. SQL source origin, actual deploy actor, change approval,
and complete DDL/ACL equivalence remain **unidentified/unproven**.

## Backup/restore provenance boundary

- [Governed encrypted backup #40780751650](https://github.com/gycha0109-beep/MyeongHa/actions/runs/40780751650)
  recorded migration frontier `20261028011357`; a separate Production
  read-only query on 2026-10-29 returned that same maximum version.
- Matching **version numbers** does not prove that the repository's
  differently numbered migration SQL is identical to the Production
  schema/catalog, or that an isolated restore has succeeded.
- Scoped one-shot PG17 restore is tracked in
  [PR #2695](https://github.com/gycha0109-beep/MyeongHa/pull/2695).
  Its result must be verified from the actual run/artifact, not inferred
  from PR CI or successful backup.
- `provider_managed_data_full_restore=false`,
  `future_safe_privacy_reconciliation=false`, and `dr_ready=false`
  remain mandatory regardless of this read-only comparison.

## Required authority resolution before any mutation

Preserve the original remote migration statement and metadata, compare full
`20261008090417` against its true deployment source (including the changed
ACL sections), and establish the actual origin of that bundled migration.
Only then may the project owner choose an explicitly governed **forward-only**
alignment or separately justified reconciliation. No `supabase migration repair`,
remote history rewrite, guessed migration replay, or service promotion is
authorized by this evidence record.
