#!/usr/bin/env bash
set -euo pipefail

psql_base=(psql -X -v ON_ERROR_STOP=1)

fail() { echo "FAIL $*" >&2; exit 1; }
pass() { echo "PASS $*"; }

missing_search_path="$("${psql_base[@]}" -At -c "
select coalesce(string_agg(p.oid::regprocedure::text, ',' order by p.oid::regprocedure::text), '')
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prorettype = 'pg_catalog.trigger'::pg_catalog.regtype
  and not exists (
    select 1
    from pg_catalog.unnest(coalesce(p.proconfig, array[]::text[])) cfg
    where cfg like 'search_path=%'
  );
")"

[[ -z "$missing_search_path" ]] || fail "public trigger functions lack explicit search_path: $missing_search_path"
pass "every public trigger function carries an explicit search_path"

# Exact S4/S3 protected Reader triggers must inspect and enforce privacy
# tombstones across role-scoped rows and may need elevated trigger execution.
# Explicit nine-name exception only: NOT a blanket SECURITY DEFINER bypass.
# Each exception must be a zero-arg PL/pgSQL trigger, pin the trusted
# pg_catalog-first search_path, and revoke non-owner runtime EXECUTE.
# Any other SECURITY DEFINER trigger, extra argument, non-pinned path or
# direct PUBLIC/anon/authenticated/API EXECUTE fails closed.
security_definer="$("${psql_base[@]}" -At -c "
with protected_reader_triggers(name) as (
  values
    ('internal_assert_official_reader_s3_source_receipt_v1'),
    ('internal_enqueue_official_reader_paid_answer_purge_v1'),
    ('internal_guard_official_reader_account_privacy_completion_v1'),
    ('internal_guard_official_reader_prior_ordinary_derivation_v1'),
    ('internal_guard_official_reader_safe_chat_marker_v1'),
    ('internal_immutable_official_reader_s3_source_proof_v1'),
    ('internal_purge_orphaned_reader_s3_source_proof_v1'),
    ('internal_reject_official_reader_chat_outbox_v1'),
    ('internal_reject_official_reader_derivation_source_v1')
)
select coalesce(string_agg(p.oid::regprocedure::text, ',' order by p.oid::regprocedure::text), '')
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prorettype = 'pg_catalog.trigger'::pg_catalog.regtype
  and p.prosecdef
  and not exists (select 1 from protected_reader_triggers a where a.name = p.proname);
")"
[[ -z "$security_definer" ]] || fail "unreviewed SECURITY DEFINER trigger functions: $security_definer"

unsafe_reader_definer="$("${psql_base[@]}" -At -c "
with protected_reader_triggers(name) as (
  values
    ('internal_assert_official_reader_s3_source_receipt_v1'),
    ('internal_enqueue_official_reader_paid_answer_purge_v1'),
    ('internal_guard_official_reader_account_privacy_completion_v1'),
    ('internal_guard_official_reader_prior_ordinary_derivation_v1'),
    ('internal_guard_official_reader_safe_chat_marker_v1'),
    ('internal_immutable_official_reader_s3_source_proof_v1'),
    ('internal_purge_orphaned_reader_s3_source_proof_v1'),
    ('internal_reject_official_reader_chat_outbox_v1'),
    ('internal_reject_official_reader_derivation_source_v1')
)
select coalesce(string_agg(p.oid::regprocedure::text, ',' order by p.oid::regprocedure::text), '')
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid=p.pronamespace
join protected_reader_triggers a on a.name=p.proname
where n.nspname='public'
  and (
    not p.prosecdef or p.pronargs<>0
    or p.prolang <> (select l.oid from pg_catalog.pg_language l where l.lanname='plpgsql')
    or not exists (
      select 1 from pg_catalog.unnest(coalesce(p.proconfig, array[]::text[])) cfg
      where pg_catalog.replace(cfg,' ','')='search_path=pg_catalog,public'
    )
    or exists (
      select 1 from pg_catalog.aclexplode(
        coalesce(p.proacl, pg_catalog.acldefault('f',p.proowner))
      ) acl
      left join pg_catalog.pg_roles gr on gr.oid=acl.grantee
      where acl.privilege_type='EXECUTE'
        and (acl.grantee=0 or gr.rolname in (
          'anon','authenticated','myeongha_api_executor',
          'myeongha_commerce_internal_executor','service_role'
        ))
    )
  );
")"
[[ -z "$unsafe_reader_definer" ]] || fail "unsafe protected Reader SECURITY DEFINER trigger contracts: $unsafe_reader_definer"
pass "only the nine exact protected Reader trigger DEFINER scopes are retained; all others remain SECURITY INVOKER"

echo "Public trigger function security catalog guard passed"

echo "Public trigger function security catalog guard passed"
