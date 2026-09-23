#!/usr/bin/env bash
set -euo pipefail

psql_base=(psql -X -v ON_ERROR_STOP=1)

fail() { echo "FAIL $*" >&2; exit 1; }
pass() { echo "PASS $*"; }

rls_shape="$("${psql_base[@]}" -At -F '|' -c "
select string_agg(
  c.relname || ':' || c.relrowsecurity::text || ':' || c.relforcerowsecurity::text,
  ',' order by c.relname
)
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'data_deletion_jobs',
    'device_installations',
    'notifications',
    'outbox_events',
    'share_artifacts'
  );
")"

expected_rls_shape='data_deletion_jobs:true:false,device_installations:true:false,notifications:true:false,outbox_events:true:false,share_artifacts:true:false'
[[ "$rls_shape" == "$expected_rls_shape" ]] || fail "account-deletion RLS table shape drifted: $rls_shape"
pass "all five account-deletion tables enforce non-FORCE RLS"

owner_shape="$("${psql_base[@]}" -At -F '|' -c "
select
  rolcanlogin::text,
  rolsuper::text,
  rolinherit::text,
  rolbypassrls::text
from pg_catalog.pg_roles
where rolname = 'myeongha_account_deletion_start_owner';
")"
[[ "$owner_shape" == 'false|false|false|false' ]] || fail "account-deletion owner role shape drifted: $owner_shape"
pass "account-deletion owner remains NOLOGIN/NOSUPERUSER/NOINHERIT/NOBYPASSRLS"

policy_count="$("${psql_base[@]}" -At -c "
select count(*)
from pg_catalog.pg_policy p
join pg_catalog.pg_class c on c.oid = p.polrelid
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and (
    (c.relname = 'data_deletion_jobs' and p.polname in (
      'data_deletion_jobs_account_deletion_start_owner_select_v1',
      'data_deletion_jobs_account_deletion_start_owner_insert_v1'
    ))
    or
    (c.relname = 'device_installations' and p.polname in (
      'device_installations_account_deletion_start_owner_select_v1',
      'device_installations_account_deletion_start_owner_update_v1'
    ))
    or
    (c.relname = 'notifications' and p.polname in (
      'notifications_account_deletion_start_owner_select_v1',
      'notifications_account_deletion_start_owner_update_v1'
    ))
    or
    (c.relname = 'outbox_events' and p.polname =
      'outbox_events_account_deletion_start_owner_insert_v1')
    or
    (c.relname = 'share_artifacts' and p.polname in (
      'share_artifacts_account_deletion_start_owner_select_v1',
      'share_artifacts_account_deletion_start_owner_update_v1'
    ))
  );
")"
[[ "$policy_count" == '9' ]] || fail "account-deletion RLS policy set drifted: $policy_count"
pass "all nine account-deletion owner policies are present"

for role in anon authenticated myeongha_api_executor; do
  direct_dml="$("${psql_base[@]}" -At -c "
  select (
    has_table_privilege('$role','public.data_deletion_jobs','SELECT,INSERT,UPDATE,DELETE')
    or has_table_privilege('$role','public.device_installations','SELECT,INSERT,UPDATE,DELETE')
    or has_table_privilege('$role','public.notifications','SELECT,INSERT,UPDATE,DELETE')
    or has_table_privilege('$role','public.outbox_events','SELECT,INSERT,UPDATE,DELETE')
    or has_table_privilege('$role','public.share_artifacts','SELECT,INSERT,UPDATE,DELETE')
  )::int;
  ")"
  [[ "$direct_dml" == '0' ]] || fail "$role unexpectedly has direct table-level DML on account-deletion RLS tables"
  pass "$role has no direct table-level DML on account-deletion RLS tables"
done

echo "Account deletion RLS catalog guard passed"
