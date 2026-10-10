#!/usr/bin/env bash
set -euo pipefail

# Reproduce Se-yeon relationship migration order inversion ONLY in isolated CI PostgreSQL.
# Baseline 0010..1390 -> late 1460..1510 -> retroactive 1400..1450.
# No Production DB or remote Supabase credentials.
# Watchtower-Track: ops
if [[ "${CI:-}" != 'true' || "${PGHOST:-}" != 'localhost' ||
      "${PGUSER:-}" != 'postgres' || "${PGDATABASE:-}" != 'myeongha_test' ]]; then
  echo 'HOLD: This destructive synthetic scenario requires GitHub CI local PostgreSQL.' >&2
  exit 1
fi

source_db="$PGDATABASE"
shadow_db="myeongha_seyeon_history_gap_shadow_ci"
cleanup() {
  PGDATABASE="$source_db" dropdb --if-exists "$shadow_db" >/dev/null 2>&1 || true
}
trap cleanup EXIT
cleanup
PGDATABASE="$source_db" createdb "$shadow_db"
export PGDATABASE="$shadow_db"

apply() {
  local file="$1"
  [[ -f "$file" ]] || { echo "Missing migration: $file" >&2; return 1; }
  echo "SHADOW_APPLY ${file##*/}"
  psql -X -q -v ON_ERROR_STOP=1 -f "$file" >/dev/null
}

apply test/db/bootstrap_supabase_auth_stub.sql

# The real Production has 1460..1510 but not 1400..1450.
# Install the exact repository predecessor files, never timestamped incident repairs.
baseline_count=0
for file in supabase/migrations/*.sql; do
  version="${file##*/}"
  version="${version%%_*}"
  if (( 10#$version < 1400 )); then
    apply "$file"
    baseline_count=$((baseline_count + 1))
  fi
done
[[ "$baseline_count" -ge 150 ]] || { echo 'Expected predecessor frontier not found.' >&2; exit 1; }

late_count=0
for version in 1460 1470 1480 1490 1500 1510; do
  file=(supabase/migrations/"$version"_*.sql)
  [[ "${#file[@]}" -eq 1 && -f "${file[0]}" ]] || exit 1
  apply "${file[0]}"
  late_count=$((late_count + 1))
done
[[ "$late_count" -eq 6 ]]

early_names=(
  relationship_event_json_v1
  cmd_lock_relationship_apply_context_v1
  cmd_apply_relationship_event_runtime_v1
  cmd_lock_relationship_history_context_v1
  relationship_assert_adjustment_slot_v1
  cmd_append_relationship_retraction_runtime_v1
  cmd_append_relationship_correction_runtime_v1
  cmd_commit_relationship_replay_projection_v1
  cmd_rebuild_relationship_projection_runtime_v1
  cmd_write_relationship_snapshot_runtime_v1
  qry_latest_valid_relationship_snapshot_v1
)

fn_count() {
  local wanted
  wanted="$(printf "'%s'," "${early_names[@]}")"
  wanted="${wanted%,}"
  psql -X -qAt -v ON_ERROR_STOP=1 -c "
    select count(*)
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ($wanted);"
}
[[ "$(fn_count)" -eq 0 ]] || { echo 'Synthetic gap did not reproduce missing functions.' >&2; exit 1; }

# The 1460-1510 catalog must already exist before retroactive backfill.
late_catalog_count() {
  psql -X -qAt -v ON_ERROR_STOP=1 -c "
    select count(*)
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and (p.proname like 'cmd_%seyeon%runtime_v1'
           or p.proname in ('qry_production_relationship_runtime_v1',
             'qry_production_relationship_history_runtime_v1',
             'cmd_commit_seyeon_chat_turn_runtime_v2',
             'qry_content_bundle_manifest_v1'));" 
}
[[ "$(late_catalog_count)" -gt 2 ]] || { echo 'Later Se-yeon runtime not installed.' >&2; exit 1; }

# Fingerprint the actual server-only RPCs including bodies, owners and ACLs.
fingerprint() {
  psql -X -qAt -v ON_ERROR_STOP=1 -c "
    select md5(string_agg(
      p.oid::regprocedure::text || ':' || pg_get_functiondef(p.oid) || ':' ||
      pg_get_userbyid(p.proowner) || ':' || coalesce(p.proacl::text,'') || ':' ||
      p.prosecdef::text,
      E'\\n' order by p.oid::regprocedure::text
    ))
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in (
        'qry_production_relationship_runtime_v1',
        'cmd_enqueue_seyeon_relationship_sync_v1',
        'cmd_claim_seyeon_relationship_sync_v1',
        'cmd_complete_seyeon_relationship_sync_v1',
        'qry_production_relationship_history_runtime_v1',
        'cmd_receive_seyeon_chat_turn_runtime_v1',
        'cmd_allocate_seyeon_chat_attempt_runtime_v1',
        'cmd_mark_seyeon_chat_context_ready_runtime_v1',
        'cmd_fail_seyeon_chat_attempt_runtime_v1',
        'cmd_persist_seyeon_chat_generated_runtime_v1',
        'cmd_persist_seyeon_chat_validated_runtime_v1',
        'cmd_commit_seyeon_chat_turn_runtime_v1',
        'cmd_commit_seyeon_chat_turn_runtime_v2',
        'qry_seyeon_post_turn_analysis_job_v1',
        'cmd_claim_seyeon_post_turn_analysis_v1',
        'cmd_checkpoint_seyeon_post_turn_analysis_v1',
        'cmd_complete_seyeon_post_turn_analysis_v1',
        'qry_content_bundle_manifest_v1'
      );"
}

before_fingerprint="$(fingerprint)"
[[ -n "$before_fingerprint" ]] || exit 1
before_acl="$(psql -X -qAt -v ON_ERROR_STOP=1 -f scripts/operations/seyeon-production-acl-recovery-readonly.sql | tail -n1)"
[[ "$before_acl" == *'ACL_PARITY_PASS_RECONCILIATION_STILL_HOLD' ]] || {
  echo "Synthetic after-late ACL not equivalent: $before_acl" >&2; exit 1;
}

# Maintain only synthetic history markers; no real Production migration ledger.
psql -X -q -v ON_ERROR_STOP=1 <<'SQL'
create schema supabase_migrations;
create table supabase_migrations.schema_migrations (
  version text primary key,
  name text,
  statements text[]
);
insert into supabase_migrations.schema_migrations(version,name)
values ('1460','synthetic'),('1470','synthetic'),('1480','synthetic'),
       ('1490','synthetic'),('1500','synthetic'),('1510','synthetic');
SQL
gap_state="$(psql -X -qAt -v ON_ERROR_STOP=1 -f scripts/operations/seyeon-production-history-admission-readonly.sql)"
[[ "$gap_state" == 'HOLD_OUT_OF_ORDER_RELATIONSHIP_HISTORY' ]] || {
  echo "Expected gap admission HOLD, got: $gap_state" >&2; exit 1;
}

# Single PostgreSQL transaction: any failed retroactive migration rolls back
# all six files in this disposable DB.
early_files=()
for version in 1400 1410 1420 1430 1440 1450; do
  file=(supabase/migrations/"$version"_*.sql)
  [[ "${#file[@]}" -eq 1 && -f "${file[0]}" ]] || exit 1
  early_files+=(-f "${file[0]}")
done
echo 'SHADOW_RETROACTIVE_BACKFILL_START (single transaction)'
psql -X -q -1 -v ON_ERROR_STOP=1 "${early_files[@]}" >/dev/null

[[ "$(fn_count)" -eq 11 ]] || {
  echo "Retroactive backfill did not install 11/11 functions: $(fn_count)" >&2; exit 1;
}
after_fingerprint="$(fingerprint)"
[[ "$before_fingerprint" == "$after_fingerprint" ]] || {
  echo 'Late-runtime function definition/owner/ACL changed after backfill.' >&2; exit 1;
}
after_acl="$(psql -X -qAt -v ON_ERROR_STOP=1 -f scripts/operations/seyeon-production-acl-recovery-readonly.sql | tail -n1)"
[[ "$after_acl" == *'ACL_PARITY_PASS_RECONCILIATION_STILL_HOLD' ]] || {
  echo "After-backfill ACL regression: $after_acl" >&2; exit 1;
}

psql -X -q -v ON_ERROR_STOP=1 <<'SQL'
insert into supabase_migrations.schema_migrations(version,name)
values ('1400','synthetic'),('1410','synthetic'),('1420','synthetic'),
       ('1430','synthetic'),('1440','synthetic'),('1450','synthetic');
SQL
after_history="$(psql -X -qAt -v ON_ERROR_STOP=1 -f scripts/operations/seyeon-production-history-admission-readonly.sql)"
[[ "$after_history" == 'ALLOW_PRELIMINARY_HISTORY_CHECK' ]] || {
  echo "Unexpected isolated history result: $after_history" >&2; exit 1;
}

# No user records are seeded by the shadow-only backfill.
rows="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "select (select count(*) from public.relationship_event_records) + (select count(*) from public.relationship_state_snapshots)")"
[[ "$rows" -eq 0 ]] || { echo 'Synthetic backfill populated user relationship records.' >&2; exit 1; }

echo "PASS SHADOW_RETROACTIVE_1400_1450: early functions 11/11, later ACL/fingerprint preserved, zero relationship records"
echo 'NOTE: synthetic PG snapshot only; not Production 104KB recovery bundle, no Production deploy clearance'
