#!/usr/bin/env bash
set -euo pipefail
# R2-H 1700: CI-owned disposable PostgreSQL 17 only.
# Watchtower-Track: ops
hold() { echo "HOLD_R2_H_1700_$1" >&2; exit 1; }
pass() { echo "PASS_R2_H_1700_$1"; }
[[ "$GITHUB_ACTIONS" == true && "$DB_SUITE" == postgres17 ]] || hold NOT_CI
[[ "$PGHOST" == localhost && "$PGPORT" == 5432 && "$PGUSER" == postgres ]] || hold NOT_LOCAL_PG17
[[ "$PGDATABASE" =~ ^myeongha_ci_case_[0-9]+$ ]] || hold NOT_DISPOSABLE
[[ "$(psql -X -Atqc 'show server_version_num')" =~ ^17[0-9]{4}$ ]] || hold WRONG_PG_VERSION
[[ "$(psql -X -Atqc 'select current_database()')" == "$PGDATABASE" ]] || hold DB_MISMATCH
[[ "$(psql -X -Atqc 'select current_user')" == postgres ]] || hold MIGRATION_ACTOR
[[ "$(git hash-object supabase/migrations/1550_seyeon_ai_cost_ledger_v1.sql)" == e3c1d8a3f26866b8cc6b6e0f0c58f9eb90525677 ]] || hold SOURCE_1550_DRIFT
[[ "$(git hash-object supabase/migrations/1580_seyeon_ai_governor_atomic_admission_v1.sql)" == fb278c9e38646997ea75e8419c97dcff9ddf17ad ]] || hold SOURCE_1580_DRIFT
[[ "$(git hash-object supabase/migrations/1700_seyeon_governed_reservation_receipt_pin_v1.sql)" == fb8803f8cdb3b6cfb76dd8e1faa2cc8dcdcf043f ]] || hold SOURCE_1700_DRIFT
[[ "$(psql -X -Atqc "select to_regclass('public.seyeon_ai_governor_model_policies_v1') is not null")" == t ]] || hold RATE_CARD_MISSING
[[ "$(psql -X -Atqc "select to_regprocedure('public.pin_seyeon_governed_reservation_receipt_v1()') is null")" == t ]] || hold NOT_FRESH
existing_catalog() {
 psql -X -Atqc "select md5(string_agg(c.oid::text||':'||c.relowner::text||':'||coalesce(c.relacl::text,'NULL')||':'||c.relrowsecurity::text||':'||c.relforcerowsecurity::text,'|' order by c.oid)) from pg_class c where c.oid in ('public.seyeon_ai_call_cost_events'::regclass,'public.seyeon_ai_governor_model_policies_v1'::regclass)"
}
before="$(existing_catalog)"
[[ -n "$before" ]] || hold CATALOG_EMPTY

# 1700 has NO internal BEGIN/COMMIT. Prove the exact original is rollback-safe.
psql -X -q -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
begin;
\i supabase/migrations/1700_seyeon_governed_reservation_receipt_pin_v1.sql
rollback;
SQL
[[ "$(psql -X -Atqc "select to_regprocedure('public.pin_seyeon_governed_reservation_receipt_v1()') is null")" == t ]] || hold ROLLBACK_FUNCTION_REMAINS
[[ "$(psql -X -Atqc "select count(*) from pg_attribute where attrelid='public.seyeon_ai_call_cost_events'::regclass and attname='governor_receipt_pinned_at' and not attisdropped")" == 0 ]] || hold ROLLBACK_COLUMN_REMAINS
[[ "$(existing_catalog)" == "$before" ]] || hold ROLLBACK_CATALOG_DRIFT
pass ORIGINAL_ROLLBACK

# Then commit the unchanged migration atomically inside disposable DB.
psql -X -q -1 -v ON_ERROR_STOP=1 -f supabase/migrations/1700_seyeon_governed_reservation_receipt_pin_v1.sql >/dev/null || hold SOURCE_FORWARD
[[ "$(existing_catalog)" == "$before" ]] || hold HISTORICAL_OWNER_ACL_RLS_DRIFT
psql -X -q -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
do $check$
declare f oid := to_regprocedure('public.pin_seyeon_governed_reservation_receipt_v1()');
begin
 if f is null then raise exception 'HOLD_1700_FUNCTION_MISSING'; end if;
 if exists (select 1 from pg_proc where oid=f and prosecdef)
    or not exists (select 1 from pg_proc where oid=f
      and replace(array_to_string(proconfig,','),' ','') like '%search_path=pg_catalog,public%')
 then raise exception 'HOLD_1700_INVOKER_SEARCH_PATH'; end if;
 if has_function_privilege('PUBLIC',f,'EXECUTE')
   or has_function_privilege('anon',f,'EXECUTE')
   or has_function_privilege('authenticated',f,'EXECUTE')
 then raise exception 'HOLD_1700_PUBLIC_EXECUTE'; end if;
 if (select count(*) from pg_trigger where tgrelid='public.seyeon_ai_call_cost_events'::regclass
   and tgname='pin_seyeon_governed_reservation_receipt_v1'
   and not tgisinternal and tgenabled='O' and tgfoid=f) <> 1
 then raise exception 'HOLD_1700_TRIGGER_ATTACHMENT'; end if;
 if (select count(*) from pg_attribute where attrelid='public.seyeon_ai_call_cost_events'::regclass
   and attname in ('governor_receipt_pinned_at','governor_input_rate_micro_usd_per_million',
    'governor_cached_input_rate_micro_usd_per_million','governor_output_rate_micro_usd_per_million')
   and not attisdropped) <> 4 then raise exception 'HOLD_1700_RECEIPT_COLUMNS'; end if;
 if (select count(*) from pg_constraint where conrelid='public.seyeon_ai_call_cost_events'::regclass
   and conname='seyeon_ai_governor_receipt_pin_shape_v1' and contype='c') <> 1
 then raise exception 'HOLD_1700_CHECK_CONSTRAINT'; end if;
end $check$;
SQL
pass FORWARD_CATALOG_INVOKER_ACL
psql -X -q -v ON_ERROR_STOP=1 -f test/db/seyeon_r2_h_1700_synthetic.sql
[[ "$(existing_catalog)" == "$before" ]] || hold SYNTHETIC_OWNER_ACL_DRIFT
pass DISPOSABLE_SOURCE_VERIFIED
echo "HOLD_R2_H_1700_OWNER_APPROVAL_REQUIRED sqlNullShapeGap=true fundedAdmissionE2E=false productionWrites=0 drReady=false"
