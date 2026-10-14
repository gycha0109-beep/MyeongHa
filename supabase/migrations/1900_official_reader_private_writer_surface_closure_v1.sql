-- Close additional dormant Official Reader writer entrypoints omitted by 1890.
-- In particular, 1830 defined a second SECURITY DEFINER cancellation wrapper.
-- This is an ACL fence only: no runtime grant, row mutation or payment work.
-- Do not revoke cmd_bind_standard_reading_access_v2 or the generic restore
-- runtime command here: their production compatibility needs caller cutover.
do $official_reader_private_writer_closure$
declare
  v_name text;
  v_proc pg_catalog.regprocedure;
  v_count bigint;
  v_actor text;
begin
  foreach v_name in array array[
    'internal_execute_official_reader_verified_cancel_v2',
    'internal_apply_verified_receipt_capability_effects_v1',
    'internal_apply_official_reader_unified_receipt_v1',
    'internal_cmd_bind_official_reader_unified_v1',
    'internal_cmd_bind_official_reader_additional_locked_v1',
    'internal_apply_additional_official_reader_receipt_locked_v1',
    'internal_apply_initial_official_reader_receipt_locked_v1',
    'internal_cmd_bind_initial_official_reader_locked_v1'
  ] loop
    select count(*), (array_agg(p.oid::pg_catalog.regprocedure))[1]
      into v_count,v_proc
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname=v_name;

    -- An accidental overload must not silently retain executable rights.
    if v_count<>1 or v_proc is null then
      raise exception using errcode='42883',
        message='Private Official Reader writer must have one exact signature',
        detail=v_name;
    end if;
    execute pg_catalog.format('revoke all on function %s from public',v_proc);
    for v_actor in
      select r.rolname from pg_catalog.pg_roles r
      where r.rolname in (
        'anon','authenticated','service_role',
        'myeongha_api_executor','myeongha_commerce_internal_executor',
        'myeongha_seyeon_chat_runtime_owner'
      )
    loop
      execute pg_catalog.format(
        'revoke all on function %s from %I',v_proc,v_actor
      );
      if pg_catalog.has_function_privilege(v_actor,v_proc,'EXECUTE') then
        raise exception using errcode='42501',
          message='Dormant Official Reader writer is reachable from runtime',
          detail=v_actor||' -> '||v_proc::text;
      end if;
    end loop;
  end loop;
end
$official_reader_private_writer_closure$;
