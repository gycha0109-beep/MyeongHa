# M1-18 — Production Supabase migration parity and minimal-read cutover HOLD

> 2026-10-17 · Repo `gycha0109-beep/MyeongHa` · target: connected Supabase project `MyengHa` (PostgreSQL 17). This is a read-only inspection record, **not** production DDL or release approval.

## Decision

**`HOLD_MISSING_PRIVATE_D2_BASELINE` + `HOLD_MIGRATION_HISTORY_DRIFT`.**

The owner's approval for the M1-17 minimal recovery observation function remains valid. The corresponding `1970` SQL has been implemented and validated on isolated PostgreSQL 15/17. However the live database does **not** have the separate D2 private issuer/binder function from `1820` or the minimal read projection from `1970`. M1-17 approval does not authorize applying dozens of unrelated Saju/SeYeon/Commerce private Writer migrations in bulk just to reach `1970`.

Production status (live SQL on 2026-10-17):
- 11 required Receipt×Intent×Capability×Grant×Event×Reader×Outbox tables **exist**; inspected fourteen key columns also exist. This alone does not guarantee schema function parity.
- `public.assert_myeongha_subject_context_v1(uuid)` **exists**.
- `internal_apply_official_reader_unified_receipt_v1`, `internal_cmd_bind_official_reader_unified_v1`, and `qry_official_reader_unknown_commit_minimal_v1` are **absent**.
- Ordinary API execution role direct `SELECT` remains **denied** on protected Receipt, Entitlement, Reader, and Capability source tables.
- `test/db/official_reader_m1_18_live_cutover_readonly_gate.sql` executed on the **connected live DB with a SELECT-only query** and returned `HOLD_MISSING_PRIVATE_D2_BASELINE`; `private_d2_installed=false`, `trusted_read_definer=false`, `api_minimal_execute=false`, `direct_source_select_closed=true`, `subject_context_available=true`.

## Exact migration-history reconciliation (read-only)

Compared `supabase/migrations/*.sql` on the M1-17 GitHub HEAD against the live Supabase migration ledger:

| Dimension | Observed |
|---|---:|
| Source SQL migrations | 217 |
| Installed live migration versions | 173 |
| Source versions not installed live | 45 |
| Live versions without a matching source SQL file | 1 |

The 45 unapplied source migrations (precise files, sorted as present in repository):

- `1520_account_deletion_finalizer_relationship_runtime_sync.sql`
- `1530_character_reading_artifact_durable_commit_v1.sql`
- `1540_saju_source_proof_nonce_claim_authority_v1.sql`
- `1550_seyeon_ai_cost_ledger_v1.sql`
- `1560_seyeon_ai_call_lifecycle_v1.sql`
- `1570_seyeon_ai_cost_model_observability_v1.sql`
- `1580_seyeon_ai_governor_atomic_admission_v1.sql`
- `1590_seyeon_ai_governor_atomic_settlement_v1.sql`
- `1600_seyeon_ai_governor_rate_card_integrity_v1.sql`
- `1610_seyeon_ai_governor_legacy_settlement_guard_v1.sql`
- `1620_seyeon_ai_governor_internal_start_v1.sql`
- `1630_seyeon_governed_execution_role_v1.sql`
- `1640_seyeon_zero_personal_source_pre_model_pin_v1.sql`
- `1650_seyeon_governed_active_subject_lock_v1.sql`
- `1660_member_reader_existing_thread_locator_v1.sql`
- `1670_seyeon_governed_guest_context_lock_v1.sql`
- `1680_seyeon_governed_guest_expiry_admission_guard_v1.sql`
- `1690_seyeon_detached_cost_settlement_worker_v1.sql`
- `1700_seyeon_governed_reservation_receipt_pin_v1.sql`
- `1710_seyeon_provider_receipt_queue_v1.sql`
- `1720_standard_reader_product_scope_read_v1.sql`
- `1740_official_reader_scope_lock_private_v1.sql`
- `1750_official_reader_scope_current_bundle_private_v1.sql`
- `1760_official_reader_additional_bind_locked_private_v1.sql`
- `1770_official_reader_provider_revoke_scope_lock_private_v1.sql`
- `1780_official_reader_verified_provider_revoke_bridge_private_v1.sql`
- `1790_official_reader_initial_product_scope_private_v1.sql`
- `1800_official_reader_unified_scope_entry_private_v1.sql`
- `1810_official_reader_ordered_multi_scope_lockset_private_v1.sql`
- `1820_official_reader_unified_issue_bind_private_v1.sql`
- `1830_official_reader_verified_cancel_unified_scope_private_v1.sql`
- `1840_official_reader_verified_cancel_impact_lockset_private_v1.sql`
- `1850_official_reader_verified_cancel_atomic_batch_private_v1.sql`
- `1860_official_reader_portone_cancel_observation_shadow_private_v1.sql`
- `1870_official_reader_cancel_purchase_match_private_v1.sql`
- `1880_official_reader_cancel_reviewed_atomic_bridge_private_v1.sql`
- `1890_official_reader_cancel_legacy_writer_execute_fence_v1.sql`
- `1900_official_reader_private_writer_surface_closure_v1.sql`
- `1910_official_reader_portone_cancel_ingress_inbox_private_v1.sql`
- `1920_official_reader_cancel_durable_worker_lifecycle_private_v1.sql`
- `1930_official_reader_cancel_private_ops_review_v1.sql`
- `1940_official_reader_cancel_private_alert_outbox_v1.sql`
- `1950_official_reader_cancel_dual_approval_preflight_private_v1.sql`
- `1960_official_reader_cancel_transient_retry_proof_private_v1.sql`
- `1970_official_reader_unknown_commit_minimal_read_v1.sql`

Live-only/unreconciled versions: `20261008090417`.

Importantly, the live-only entry must be traced back to its actual change SQL, reviewers and deployment evidence before treating the source tree as a complete live DB replay plan. No history was repaired, inserted or deleted in the production ledger.

## Mechanically enforced gates

1. `scripts/commerce/m1-18-migration-parity-gate.mjs` compares an explicitly exported set of live migration versions with current checked-in migration names. A missing version, unknown extra version, duplicate or malformed ledger means **HOLD**. It also pins core Commerce milestones `1050/1070/1130/1220/1720/1740/1820/1890/1900/1970`. This comparison **never** returns `deployAuthorized:true`; history equality only qualifies for subsequent deployment review.
2. `test/db/official_reader_m1_18_live_cutover_readonly_gate.sql` is a portable SELECT-only catalog check. It requires the 1820 D2 private issuer and binder to exist, 1900 D2 Writer closure against the actual app/public roles, 1970 minimal function to be `SECURITY DEFINER` with trusted fixed `search_path`, only the app role to have EXECUTE, five protected source tables not directly SELECTable by the app role, and current trusted subject contract. Its positive result `CATALOG_READY_MIGRATION_HISTORY_STILL_REQUIRED` is **not a deploy permit**.
3. `test/db/official_reader_m1_18_live_cutover_readonly_gate.sh` on isolated PG15 proves positive gate and negative scenarios for leaked PUBLIC read EXECUTE, leaked source SELECT, leaked D2 Writer EXECUTE or removed authorized API read EXECUTE. All negative changes occur inside explicit `BEGIN/ROLLBACK`; the script re-asserts the same clean state afterwards.
4. Unchanged M1-17 positive exact role/function-only tests and M1-16 negative raw-ledger ACL tests run alongside.

## Actual operational next actions

**Do not apply 1970 directly to live on the current baseline.** Confirm and record the source provenance and contents of live-only `20261008090417`; classify the 45 missing migrations by security/DDL/operational runtime impact; stage their dependencies in disposable PG17 and a nonproduction Supabase target; run full grants/function catalog and data-independent rollback checks. Re-evaluate BOTH history and catalog gates against that staged target. Only after that, plan a reviewed ordered migration promotion with backup/rollback, no live payments and no paid Reader launch; verify that the true app role can execute only the minimal observation function.

**All actual DB modifications at this checkpoint:** zero on the live project. The code in Draft #2228 remains the reviewed implementation of the owner-approved minimal read interface. M1-18 is a required promotion fence, not an authorization to run any private D2 Writer.

## Hard boundaries

No emergency `GRANT SELECT` on source ledgers, no premature live DDL, no migration-history repair without source reconciliation, no elevated roles or new credentials, no private issuer/Reader purchase success, no provider payment/refund, no paid T2/Saju T8 promotion, no deployment or Draft merge.
