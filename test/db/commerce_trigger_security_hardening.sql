\set ON_ERROR_STOP on

do $$
declare
  v_function text;
  v_config text;
  v_indexdef text;
begin
  foreach v_function in array array[
    'tr_product_offer_mapping_immutable',
    'tr_commerce_account_link_identity_immutable',
    'ct_validate_purchase_intent_authority',
    'tr_purchase_intent_identity_immutable',
    'tr_commerce_receipt_identity_immutable',
    'ct_validate_commerce_receipt_authority',
    'ct_validate_provider_event_resolution',
    'tr_provider_event_identity_immutable',
    'tr_entitlement_grant_identity_immutable',
    'ct_validate_entitlement_event_source',
    'tr_entitlement_event_append_only',
    'tr_entitlement_identity_immutable'
  ]
  loop
    select coalesce(array_to_string(p.proconfig, ','), '')
      into v_config
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = v_function
      and pg_catalog.pg_get_function_identity_arguments(p.oid) = '';

    if not found then
      raise exception 'FAIL commerce trigger function missing: %', v_function;
    end if;

    if v_config not like '%search_path=pg_catalog, public%' then
      raise exception 'FAIL commerce trigger function % has unsafe proconfig: %', v_function, v_config;
    end if;
  end loop;

  select pg_catalog.pg_get_indexdef(c.oid)
    into v_indexdef
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'entitlement_grants_source_receipt_subject_idx'
    and c.relkind = 'i';

  if not found then
    raise exception 'FAIL source receipt FK covering index is missing';
  end if;

  if position('(source_receipt_id, subject_id)' in v_indexdef) = 0 then
    raise exception 'FAIL source receipt FK covering index has unexpected definition: %', v_indexdef;
  end if;

  raise notice 'PASS all Commerce trigger functions pin search_path=pg_catalog, public';
  raise notice 'PASS purchase Grant source Receipt FK has a covering index';
end;
$$;

select 'commerce trigger security hardening passed' as result;
