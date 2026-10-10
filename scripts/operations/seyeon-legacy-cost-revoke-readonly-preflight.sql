-- D3B2B-3D1: Production operator READ-ONLY data-plane preflight.
-- Only aggregate counts and ACL booleans are returned: no Subject, call,
-- credentials, customer fields, or individual event JSON.
-- This is NOT an activation switch or an authorization to REVOKE.
-- Watchtower-Track: character-memory
\set ON_ERROR_STOP on

begin read only;

select
  current_setting('server_version') as postgres_version,
  pg_catalog.to_regclass('public.seyeon_ai_call_cost_events') is not null
    as ledger_table_present,
  pg_catalog.to_regclass('public.seyeon_ai_governor_daily_budgets_v1') is not null
    as governor_budget_table_present,
  pg_catalog.to_regclass('public.seyeon_ai_governor_model_policies_v1') is not null
    as governor_policy_table_present,
  pg_catalog.to_regprocedure(
    'public.cmd_governed_start_seyeon_ai_call_v1(uuid,uuid,uuid,text,uuid,text,text,text,text,text,bigint,bigint,bigint)'
  ) is not null as governed_start_present,
  pg_catalog.to_regprocedure(
    'public.cmd_governed_settle_seyeon_ai_call_v1(uuid,uuid,uuid,text,jsonb)'
  ) is not null as governed_settle_present,
  exists (select 1 from pg_catalog.pg_roles
          where rolname='myeongha_seyeon_governed_login' and rolcanlogin)
    as actual_governed_login_exists,
  exists (select 1 from pg_catalog.pg_roles
          where rolname='myeongha_seyeon_governed_executor'
            and not rolcanlogin and not rolsuper and not rolbypassrls)
    as governed_execution_role_shape_ok;

select
  coalesce((select pg_catalog.has_function_privilege(
      r.oid,
      pg_catalog.to_regprocedure(
        'public.cmd_start_seyeon_ai_call_v1(uuid,uuid,uuid,text,uuid,text,text,text)'
      ), 'EXECUTE')
    from pg_catalog.pg_roles r where r.rolname='myeongha_api_executor'),false)
    as common_legacy_start_exposed,
  coalesce((select pg_catalog.has_function_privilege(
      r.oid,
      pg_catalog.to_regprocedure(
        'public.cmd_settle_seyeon_ai_call_v1(uuid,uuid,uuid,text,jsonb)'
      ),'EXECUTE')
    from pg_catalog.pg_roles r where r.rolname='myeongha_api_executor'),false)
    as common_legacy_settle_exposed,
  coalesce((select pg_catalog.has_function_privilege(
      r.oid,
      pg_catalog.to_regprocedure(
        'public.cmd_record_seyeon_ai_call_cost_v1(uuid,uuid,uuid,text,jsonb)'
      ),'EXECUTE')
    from pg_catalog.pg_roles r where r.rolname='myeongha_api_executor'),false)
    as common_legacy_record_exposed;

-- Skip relations entirely if Production has not applied the 1550+ migrations.
-- Do not silently reinterpret missing schema as an empty or drained ledger.
select (pg_catalog.to_regclass(
    'public.seyeon_ai_call_cost_events') is not null
  )::int as seyeon_cutover_ledger_exists \gset
\if :seyeon_cutover_ledger_exists
select
  count(*) filter(where lifecycle_state='started') as all_unsettled_calls,
  count(*) filter(where lifecycle_state='started'
    and governor_bucket_utc_date is null) as legacy_unsettled_calls,
  count(*) filter(where lifecycle_state='started'
    and governor_bucket_utc_date is not null) as governed_unsettled_calls,
  count(*) filter(where lifecycle_state='settled'
    and governor_bucket_utc_date is null) as historical_legacy_settled_calls,
  count(*) filter(where lifecycle_state='started'
    and created_at >= clock_timestamp()-interval '24 hours')
    as started_in_last_24h,
  count(*) filter(where lifecycle_state='settled'
    and cost_status in ('usage_unknown','price_unknown'))
    as settled_without_known_estimate
from public.seyeon_ai_call_cost_events;
\else
select
  null::bigint as all_unsettled_calls,
  null::bigint as legacy_unsettled_calls,
  null::bigint as governed_unsettled_calls,
  null::bigint as historical_legacy_settled_calls,
  null::bigint as started_in_last_24h,
  null::bigint as settled_without_known_estimate,
  'HOLD_LEDGER_SCHEMA_NOT_PRESENT'::text as evidence_status;
\endif

select (pg_catalog.to_regclass(
  'public.seyeon_ai_governor_daily_budgets_v1') is not null
)::int as seyeon_cutover_budget_exists \gset
\if :seyeon_cutover_budget_exists
select count(*) as configured_utc_budget_rows,
  count(*) filter(where bucket_utc_date=(clock_timestamp() at time zone 'UTC')::date)
    as current_utc_budget_rows
from public.seyeon_ai_governor_daily_budgets_v1;
\else
select null::bigint as configured_utc_budget_rows,
  null::bigint as current_utc_budget_rows,
  'HOLD_BUDGET_SCHEMA_NOT_PRESENT'::text as evidence_status;
\endif

-- A SELECT cannot prove all former server generations are drained, that
-- traffic is no longer OFF, or that an independently credentialed session
-- successfully logged in. The historical migration-lineage HOLD is separately
-- investigated under #1887 and must not be bypassed.
select 'HOLD_REQUIRES_OWNER_APPROVAL_RUNTIME_DRAIN_INDEPENDENT_LOGIN_AND_MIGRATION_RECONCILIATION'
  as operational_cutover_verdict;
rollback;
