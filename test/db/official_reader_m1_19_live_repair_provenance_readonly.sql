-- M1-19: live Supabase SQL provenance inspection; SELECT ONLY.
-- This is NOT a SQL migration, GRANT, HISTORY REPAIR, or deployment command.
-- Run manually using read-only SQL against the connected project.
with live_overlay as (
  select version,name,array_to_string(statements,E'\n') body
  from supabase_migrations.schema_migrations
  where version='20261008090417'
), referenced_functions as (
  select distinct lower(m[1]) name
  from live_overlay o
  cross join lateral regexp_matches(o.body,
    'create[[:space:]]+or[[:space:]]+replace[[:space:]]+function[[:space:]]+public[.]([a-z_][a-z0-9_]*)','gi') m
), referenced_policies as (
  select distinct lower(m[1]) name
  from live_overlay o
  cross join lateral regexp_matches(o.body,
    'create[[:space:]]+policy[[:space:]]+([a-z_][a-z0-9_]*)','gi') m
), counted as (
 select
  (select count(*) from live_overlay) overlay_rows,
  (select length(body) from live_overlay) sql_length,
  (select md5(body) from live_overlay) sql_md5,
  (select count(*) from referenced_functions) source_function_count,
  (select count(*) from referenced_policies) source_policy_count,
  (select count(distinct f.name)
    from referenced_functions f
    join pg_catalog.pg_proc p on p.proname=f.name
      and p.pronamespace='public'::regnamespace) installed_function_names,
  (select count(distinct p.name)
    from referenced_policies p
    join pg_catalog.pg_policies policy on policy.policyname=p.name
      and policy.schemaname='public') installed_policy_names,
  (select count(*) from supabase_migrations.schema_migrations
    where version in ('1460','1470','1480','1490','1500','1510')) original_history_versions,
  (select count(*) from supabase_migrations.schema_migrations) live_history_versions
)
select
 case when overlay_rows <> 1 or sql_length is distinct from 104021
           or sql_md5 is distinct from 'f70776d8c0f6369f6f13484ba9fa2271'
           or source_function_count <> 19 or source_policy_count <> 19
      then 'HOLD_UNMATCHED_LIVE_REPAIR_SQL'
      when installed_function_names<>19 or installed_policy_names<>19
        or original_history_versions<>6
      then 'HOLD_REPAIR_CATALOG_OR_HISTORY_DRIFT'
      else 'HOLD_REPAIR_PROVENANCE_NOT_EQUIVALENCE_CERTIFIED'
 end as live_repair_inspection_gate,
 overlay_rows,sql_length,sql_md5,source_function_count,source_policy_count,
 installed_function_names,installed_policy_names,original_history_versions,
 live_history_versions
from counted;
