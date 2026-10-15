#!/usr/bin/env bash
set -euo pipefail
# D3e18 real PostgreSQL privilege-denial check on a disposable CI clone ONLY.
# Synthetic login roles are NOT deployed accounts or an approved DB owner.
[[ "${CI:-}" == true && "${PGHOST:-}" == localhost &&
  "${PGDATABASE:-}" == myeongha_cancel_d3e18_real_roles_ci ]] || {
  echo 'D3e18 requires the exact disposable localhost CI database' >&2; exit 2;
}
db() { psql -X -qAt -v ON_ERROR_STOP=1 --set=VERBOSITY=verbose "$@"; }
die() { echo "FAIL D3e18 isolated PostgreSQL: $*" >&2; exit 1; }
tmp="$(mktemp -d)"
verifier=myeongha_cancel_d3e18_verifier_ci
executor=myeongha_cancel_d3e18_executor_ci
owner=myeongha_cancel_d3e18_owner_ci
cleanup() {
  for name in "$verifier" "$executor" "$owner"; do
    db -c "drop role if exists $name" >/dev/null 2>&1 || true
  done
  rm -rf "$tmp"
}
trap cleanup EXIT
[[ "$(db -c "select count(*) from pg_roles where rolname in
 ('$verifier','$executor','$owner')")" == 0 ]] || die 'synthetic roles already exist'
db <<SQL >/dev/null
create role $verifier login noinherit nosuperuser nocreatedb nocreaterole nobypassrls;
create role $executor login noinherit nosuperuser nocreatedb nocreaterole nobypassrls;
create role $owner login noinherit nosuperuser nocreatedb nocreaterole nobypassrls;
SQL

# PostgreSQL itself supplies the OID and effective privilege, including PUBLIC.
db <<'SQL' >/dev/null
do $$
declare
  routine text;
  actor text;
  oid_found oid;
  count_found int;
begin
  foreach routine in array array[
    'internal_private_cancel_review_v1',
    'internal_private_cancel_commit_review_approval_v1',
    'internal_apply_reviewed_official_reader_full_cancel_private_v1',
    'internal_apply_entitlement_effect_v1',
    'internal_apply_official_reader_verified_cancel_batch_v1',
    'internal_execute_official_reader_verified_cancel_v2'
  ] loop
    select count(*),min(p.oid) into count_found,oid_found
    from pg_catalog.pg_proc p join pg_catalog.pg_namespace n
      on n.oid=p.pronamespace
    where n.nspname='public' and p.proname=routine;
    if count_found<>1 or oid_found is null then
      raise exception 'missing/overloaded private cancellation routine %',routine;
    end if;
    for actor in select unnest(array[
      'myeongha_cancel_d3e18_verifier_ci','myeongha_cancel_d3e18_executor_ci',
      'anon','authenticated','service_role','myeongha_api_executor',
      'myeongha_commerce_internal_executor','myeongha_seyeon_chat_runtime_owner'
    ]) loop
      if not exists(select 1 from pg_catalog.pg_roles where rolname=actor) then
        raise exception 'role absent: %',actor;
      end if;
      if pg_catalog.has_function_privilege(actor,oid_found,'EXECUTE') then
        raise exception 'direct cancel SQL reachable by % for %',actor,routine;
      end if;
      if pg_catalog.pg_has_role(
        (select oid from pg_roles where rolname=actor),
        (select oid from pg_roles
          where rolname='myeongha_cancel_d3e18_owner_ci'),'MEMBER'
      ) then
        raise exception 'owner impersonation by %',actor;
      end if;
    end loop;
  end loop;
  if exists(
    select 1 from pg_roles
    where rolname in ('myeongha_cancel_d3e18_verifier_ci',
                      'myeongha_cancel_d3e18_executor_ci',
                      'myeongha_cancel_d3e18_owner_ci')
    and (not rolcanlogin or rolcaninherit or rolsuper or rolbypassrls
         or rolcreaterole or rolcreatedb)
  ) then raise exception 'synthetic service roles are privileged'; end if;
end $$;
SQL
echo 'PASS D3e18: PostgreSQL catalog denies six private routines to eight non-owner identities'

# Actual SQL engine must reject direct invocation BEFORE argument validation.
cases=(
  "public.internal_private_cancel_review_v1(null::uuid,null::text,null::text)"
  "public.internal_private_cancel_commit_review_approval_v1(null::uuid,null::text,null::text,null::uuid,null::timestamptz,null::timestamptz,null::text,null::text,null::text,null::text,null::text)"
  "public.internal_apply_reviewed_official_reader_full_cancel_private_v1(null::uuid,null::uuid,null::uuid,null::uuid,null::uuid)"
  "public.internal_apply_entitlement_effect_v1(null::text,null::uuid,null::uuid,null::text,null::bigint,null::text,null::text,null::timestamptz,null::text,null::timestamptz,null::timestamptz,null::text)"
  "public.internal_apply_official_reader_verified_cancel_batch_v1(null::uuid,null::uuid[],null::uuid[],null::bigint[],null::text[],null::timestamptz[],null::timestamptz[],null::timestamptz[],null::text[])"
  "public.internal_execute_official_reader_verified_cancel_v2(null::uuid,null::uuid,null::bigint,null::text,null::timestamptz,null::timestamptz,null::timestamptz,null::text)"
)
actors=("$verifier" "$executor" anon authenticated service_role
  myeongha_api_executor myeongha_commerce_internal_executor
  myeongha_seyeon_chat_runtime_owner)
for actor in "${actors[@]}"; do
  for index in "${!cases[@]}"; do
    if db >"$tmp/denied.log" 2>&1 <<SQL
set session authorization "$actor";
select * from ${cases[$index]};
SQL
    then die "unauthorized direct execution: $actor case $index"; fi
    grep -Fq '42501' "$tmp/denied.log" &&
    grep -Fq 'permission denied for function' "$tmp/denied.log" || {
      cat "$tmp/denied.log" >&2
      die "not an EXECUTE denial: $actor case $index"
    }
  done
done

# Non-owner identities cannot SET ROLE to the synthetic owner.
for actor in "${actors[@]}"; do
  if db >"$tmp/owner.log" 2>&1 <<SQL
set session authorization "$actor";
set role "$owner";
SQL
  then die "$actor can impersonate the synthetic owner"; fi
  grep -Fq '42501' "$tmp/owner.log" || {
    cat "$tmp/owner.log" >&2; die 'missing owner-denial SQLSTATE'
  }
done
[[ "$(db -c "select count(*) from public.entitlement_events")" == 0 ]] ||
  die 'forbidden test mutated paid entitlement events'
echo 'PASS D3e18: 48 real direct-call denials + eight owner impersonation denials, no entitlement effects'
