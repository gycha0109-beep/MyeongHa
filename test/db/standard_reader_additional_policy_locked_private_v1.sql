-- CAP-B2 private additional Standard Writer structural + privilege negative test.
-- Disposable DB only. Does not create verified receipts, real sale, Grant,
-- official Reading or introduce runtime EXECUTE.
\set ON_ERROR_STOP on

do $cap_b2_private$
declare
  v_signature pg_catalog.regprocedure :=
    'public.internal_cmd_bind_standard_reader_additional_policy_locked_v1(uuid,uuid,uuid,uuid,text,text,jsonb)'::pg_catalog.regprocedure;
  v_def text;
  v_role text;
begin
  if v_signature is null then
    raise exception 'CAP-B2 private additional binder migration is missing';
  end if;
  v_def := pg_catalog.pg_get_functiondef(v_signature);
  if v_def not like '%internal_acquire_official_reader_scope_lock_v1%'
     or v_def not like '%internal_qry_official_reader_additional_scope_candidate_v1%'
     or v_def not like '%qry_standard_reader_approved_rule_v1%'
     or v_def not like '%qry_standard_reading_reader_catalog_v4%'
     or v_def not like '%qry_standard_reading_reader_unlock_v4%'
     or v_def not like '%standard_b2_current_exact_grant_required%'
     or v_def not like '%historical_replay_current_rights_unproven%'
  then
    raise exception 'CAP-B2 private binder lost its necessary gate chain';
  end if;
  if v_def like '%from public.character_capabilities%'
     or v_def like '%into public.standard_reader_product_approved_rules_v1%' then
    raise exception 'CAP-B2 must never use specialist Capability or create Product policy';
  end if;

  if pg_catalog.has_function_privilege('public',v_signature,'EXECUTE') then
    raise exception 'CAP-B2 private binder erroneously publicly executable';
  end if;
  for v_role in
    select rolname from pg_catalog.pg_roles where rolname in (
      'anon','authenticated','service_role','myeongha_api_executor',
      'myeongha_commerce_internal_executor','myeongha_seyeon_chat_runtime_owner'
    )
  loop
    if pg_catalog.has_function_privilege(v_role,v_signature,'EXECUTE') then
      raise exception 'CAP-B2 runtime role % has EXECUTE',v_role;
    end if;
  end loop;
  raise notice 'PASS CAP-B2 private Writer lock/policy/current-rights source and ACL';
end
$cap_b2_private$;

-- Missing authority must fail, with no mutation and without returning a
-- synthesized paid access; this is not the positive purchase/bind proof.
do $cap_b2_denial$
begin
  begin
    perform *
    from public.internal_cmd_bind_standard_reader_additional_policy_locked_v1(
      null::uuid,
      '12102300-0000-0000-0000-000000000001'::uuid,
      '12103000-0000-0000-0000-000000000099'::uuid,
      '12103100-0000-0000-0000-000000000099'::uuid,
      'sha256:v1:2222222222222222222222222222222222222222222222222222222222222222',
      'standard-reading-access-bind-v2',
      '{}'::jsonb
    );
    raise exception 'CAP-B2 accepted missing canonical Subject';
  exception when check_violation then
    if sqlerrm not like '%binding requires subject%' then raise; end if;
  end;
  raise notice 'PASS CAP-B2 missing Subject fails closed';
end
$cap_b2_denial$;
