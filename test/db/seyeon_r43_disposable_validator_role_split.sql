-- Watchtower-Track: security
-- R43: independently scoped NOLOGIN validation role in the disposable PG
-- cluster. The ordinary API Executor may not issue/verify DB HMAC seals.
-- A separate validator connection/credential is mandatory in production;
-- this PostgreSQL CI fixture uses SET LOCAL ROLE under its isolated superuser.
-- This is NOT real Provider evidence, user consent, G2 or HTTP authority.
\set ON_ERROR_STOP on
begin;
do $pre$
begin
  if current_database()<>'myeongha_seyeon_positive_pin_candidate_test'
    or current_setting('server_version_num')::integer<150000
    or to_regclass('seyeon_positive_candidate.local_guard_seal_key_r42') is null
    or to_regprocedure('seyeon_positive_candidate.issue_local_guard_seal_r42(uuid,uuid,uuid,uuid)') is null
    or to_regprocedure('seyeon_positive_candidate.verify_local_guard_seal_r42(uuid,uuid)') is null
  then raise exception 'R43 needs the isolated R42 DB-keyed seal owner';
  end if;
end $pre$;

do $create$
begin
  if not exists (
    select 1 from pg_catalog.pg_roles
    where rolname='myeongha_seyeon_guard_evaluator_r43'
  ) then
    create role myeongha_seyeon_guard_evaluator_r43
      nologin noinherit;
  end if;
  if not exists(
    select 1 from pg_catalog.pg_roles
    where rolname='myeongha_seyeon_guard_evaluator_r43'
      and rolcanlogin=false and rolinherit=false
  ) then raise exception 'R43 validator role must remain NOLOGIN/NOINHERIT';
  end if;
end $create$;

-- Role separation is an ACL, not an assertion made by a model or client.
-- G2's SECURITY DEFINER owner still verifies the seal internally; the
-- ordinary API role cannot mint or query one even with a valid Attempt ID.
revoke all on function
  seyeon_positive_candidate.issue_local_guard_seal_r42(
    uuid,uuid,uuid,uuid
  ) from public,anon,authenticated,service_role,myeongha_api_executor;
revoke all on function
  seyeon_positive_candidate.verify_local_guard_seal_r42(uuid,uuid)
  from public,anon,authenticated,service_role,myeongha_api_executor;
grant usage on schema seyeon_positive_candidate
  to myeongha_seyeon_guard_evaluator_r43;
grant execute on function
  seyeon_positive_candidate.issue_local_guard_seal_r42(uuid,uuid,uuid,uuid)
  to myeongha_seyeon_guard_evaluator_r43;
grant execute on function
  seyeon_positive_candidate.verify_local_guard_seal_r42(uuid,uuid)
  to myeongha_seyeon_guard_evaluator_r43;
revoke all on seyeon_positive_candidate.local_guard_seal_key_r42,
  seyeon_positive_candidate.local_guard_seals_r42,
  seyeon_positive_candidate.local_guard_fixture_lineage_r41
  from myeongha_seyeon_guard_evaluator_r43;

do $acl$
begin
  if pg_has_role('myeongha_api_executor',
      'myeongha_seyeon_guard_evaluator_r43','MEMBER')
    or has_function_privilege('myeongha_api_executor',
      'seyeon_positive_candidate.issue_local_guard_seal_r42(uuid,uuid,uuid,uuid)','EXECUTE')
    or has_function_privilege('myeongha_api_executor',
      'seyeon_positive_candidate.verify_local_guard_seal_r42(uuid,uuid)','EXECUTE')
    or not has_function_privilege('myeongha_seyeon_guard_evaluator_r43',
      'seyeon_positive_candidate.issue_local_guard_seal_r42(uuid,uuid,uuid,uuid)','EXECUTE')
    or not has_function_privilege('myeongha_seyeon_guard_evaluator_r43',
      'seyeon_positive_candidate.verify_local_guard_seal_r42(uuid,uuid)','EXECUTE')
    or has_table_privilege('myeongha_seyeon_guard_evaluator_r43',
      'seyeon_positive_candidate.local_guard_seal_key_r42','SELECT')
    or has_table_privilege('myeongha_seyeon_guard_evaluator_r43',
      'seyeon_positive_candidate.local_guard_seals_r42','INSERT')
    or has_table_privilege('myeongha_seyeon_guard_evaluator_r43',
      'seyeon_positive_candidate.local_guard_seals_r42','SELECT')
  then raise exception 'R43 role split failed: ordinary executor can issue/verify or evaluator can read the MAC';
  end if;
end $acl$;
commit;
\echo 'PASS R43 evaluator-only HMAC issuance and verification ACL; normal API denied'
