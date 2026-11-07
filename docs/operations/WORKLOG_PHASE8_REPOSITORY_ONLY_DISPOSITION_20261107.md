# Production Operations Worklog — repository-only migration version disposition

Date: 2026-11-07 KST | Track: `ops` | Exact comparison main: `dba6f436e90e9a83c27137fa218ab5115d048cf4`

## Work unit completed

Created the version-by-version file
[POSTGRES_REPOSITORY_ONLY_VERSION_DISPOSITION_20261107.json](POSTGRES_REPOSITORY_ONLY_VERSION_DISPOSITION_20261107.json)
for **all 76** repository-only migration versions in the preserved
[Phase 8 metadata observation](POSTGRES_MIGRATION_METADATA_OBSERVATION_20261107.json)
(on pending DR PR #3095).

Cross-checked the source snapshot `2f04f8f2a0d912e42bf348781e17d20ff7094675` with
the exact current main using a GitHub commit comparison. No
`supabase/migrations/` files changed across that range, so this is an
unchanged-file catalog transfer, **not a new Production ledger observation**.

The 76 rows are grouped by filename only: **60 official-reader**, **6
official Saju**, **2 commerce-related**, **8 commerce-payment version shifts**.
The eight version-shifted remote/local pairs have earlier bounded SQL source
evidence: four byte-exact and four matched except the repository's final
`\n\ncommit;\n` 10-byte suffix; all eight still have different version IDs.
The other 68 have no matching name/version pair in the prior Production catalog.

All entries deliberately retain `PENDING_AUTHORITATIVE_SOURCE_AND_LIVE_OBJECT_RECONCILIATION`
and `READ_ONLY_KEEP_CURRENT_STATE`. Their original deployment actor/time,
current object/DDL/ACL reconciliation and provider ledger restore remain
**NOT_PROVEN**. Missing a remote version does **not** mean its source
was never applied, and is not permission to deploy or repair it.

## Next approved work and blockers

- Continue the current Phase 8-A source/role/grant and isolated-catalog
  comparison using the latest exact backup. Do not silently treat missing
  version IDs as missing live objects.
- Current-frontier Hosted Auth/Storage full provider-equivalent restore
  requires a separate approved isolated target if new paid resources are
  necessary. Current privacy canary still requires exact owner authorization
  `RUN_SYNTHETIC_PRODUCTION_PRIVACY_CANARY`.
- Current disaster-recovery decision: Issue #1887 **OPEN**;
  `dr_ready=false`; `serviceResumptionAllowed=false`.
- PR #3095 contains the isolated one-shot restore and the source catalog;
  required full CI Integration must pass before merging and dispatching its
  exact controlled main one-shot. No CI or merge success may be inferred
  from ordinary CI-only green.

No Production SQL write/DDL/migration repair, real-user read, deployment,
traffic, secret/IAM mutation, canary, paid Hosted target, or external outreach.

Watchtower-Track: ops
