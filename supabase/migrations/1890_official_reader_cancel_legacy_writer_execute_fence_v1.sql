-- Official Reader paid cancellation: enforce legacy-writer EXECUTE cutover
-- boundary for public/API/Commerce roles. The DB-owner-only private approval
-- bridge remains staged and unconnected. No role grant, live webhook hook,
-- refund, production data change, or entitlement effect is performed here.
--
-- SECURITY DEFINER 1780 can bypass table privileges; therefore denying its
-- EXECUTE is mandatory, in addition to denying 1080/1770/1830/1850/1880.
-- Direct DB owners retain authority for offline migration/test fixtures.
do $official_reader_cancel_writer_fence$
declare
  v_signature text;
  v_role text;
  v_function pg_catalog.regprocedure;
begin
  foreach v_signature in array array[
    'public.internal_apply_entitlement_effect_v1(text,uuid,uuid,text,bigint,text,text,timestamptz,text,timestamptz,timestamptz,text)',
    'public.internal_apply_official_reader_provider_revoke_locked_v1(uuid,uuid,bigint,text,text,timestamptz,text,timestamptz,timestamptz,text)',
    'public.internal_execute_official_reader_verified_provider_revoke_v1(uuid,uuid,bigint,text,timestamptz,timestamptz,timestamptz,text)',
    'public.internal_apply_official_reader_verified_cancel_scope_v2(uuid,uuid,bigint,text,timestamptz,timestamptz,timestamptz,text)',
    'public.internal_apply_official_reader_verified_cancel_batch_v1(uuid,uuid[],uuid[],bigint[],text[],timestamptz[],timestamptz[],timestamptz[],text[])',
    'public.internal_record_official_reader_portone_cancel_shadow_v1(text,text,text,text,text,text,timestamptz,timestamptz,bigint,bigint,text,text)',
    'public.internal_apply_reviewed_official_reader_full_cancel_private_v1(uuid,uuid,uuid,uuid,uuid)'
  ]
  loop
    v_function := pg_catalog.to_regprocedure(v_signature);
    if v_function is null then
      raise exception using errcode='42883',
        message='Official Reader cancellation writer fence: expected function missing',
        detail=v_signature;
    end if;

    -- REVOKE PUBLIC first: a role-specific revoke cannot override inherited
    -- default EXECUTE from PUBLIC, especially for SECURITY DEFINER functions.
    execute pg_catalog.format('revoke all on function %s from public',v_function);
    for v_role in select r.rolname from pg_catalog.pg_roles r
      where r.rolname in (
        'anon','authenticated','service_role','myeongha_api_executor',
        'myeongha_commerce_internal_executor','myeongha_seyeon_chat_runtime_owner'
      )
    loop
      execute pg_catalog.format(
        'revoke all on function %s from %I',v_function,v_role
      );
      if pg_catalog.has_function_privilege(v_role,v_function,'EXECUTE') then
        raise exception using errcode='42501',
          message='Official Reader cancellation writer is still reachable',
          detail=v_role||' -> '||v_signature;
      end if;
    end loop;
  end loop;
end
$official_reader_cancel_writer_fence$;
