\set ON_ERROR_STOP on
begin;
\ir ../../docs/operations/candidates/commerce_approved_saju_purchase_scope_v1.sql
\ir ../../docs/operations/candidates/commerce_approved_saju_purchase_writer_v1.sql

create function pg_temp.approved_fixture_purchase(
  actor uuid, intent_id uuid, record_id uuid, birth_revision uuid, offer_id uuid,
  intent_key text, offer_snapshot jsonb, capability_snapshot jsonb, payload jsonb
) returns record language plpgsql as $function$
declare
  admission_hash text := 'sha256:v1:' || encode(sha256(convert_to(payload::text,'UTF8')),'hex');
  request_hash text;
  result record;
begin
  request_hash := 'sha256:v1:' || encode(sha256(convert_to(format(
    '{"approvedAdmissionHash":"%s","birthRevisionId":"%s","productOfferId":"%s","purchaseKind":"original","sajuRecordId":"%s","sourceReceiptIds":[]}',
    admission_hash,birth_revision,offer_id,record_id),'UTF8')),'hex');
  select * into strict result from commerce_saju_private.create_approved_purchase_intent_v1(
    actor,intent_id,record_id,birth_revision,offer_id,intent_key,request_hash,
    offer_snapshot,'fixture-offer',capability_snapshot,'fixture-capability',payload::text,admission_hash
  );
  return (result.purchase_intent_id,result.replayed,result.approved_admission_hash);
end
$function$;

-- Real PG17 tables and constraints, synthetic actor and Offer mappings. The
-- fixture inserts intents/origins directly to exercise the persistence boundary.
do $fixture$
declare
  actor uuid := gen_random_uuid();
  auth_id uuid := gen_random_uuid();
  self_profile uuid := gen_random_uuid();
  self_revision uuid := gen_random_uuid();
  product uuid := gen_random_uuid();
  record_id uuid;
  intent_id uuid;
  offer_id uuid;
  capability_id uuid;
  target_id uuid := gen_random_uuid();
  target_profile uuid := gen_random_uuid();
  target_revision uuid := gen_random_uuid();
  wrong_revision uuid := gen_random_uuid();
  cutoff timestamptz := '2026-11-30T15:00:00Z';
  offer_key text;
  fields text[];
  amount bigint;
  counterpart_order text;
  payload jsonb;
  admission_hash text;
  request_hash text;
  keys jsonb;
  earlier_month text;
  changed_payload text;
  scope_prefix text;
  failure text;
  offer_snapshot jsonb;
  capability_snapshot jsonb;
  result record;
  sql_constraint text;
  first_intent uuid;
  first_record uuid;
  first_offer uuid;
  first_receipt uuid := gen_random_uuid();
  extra_target uuid := gen_random_uuid();
  extra_profile uuid := gen_random_uuid();
  extra_revision uuid := gen_random_uuid();
  target_for_offer uuid;
begin
  insert into auth.users(id) values (auth_id);
  insert into public.subjects(id,kind,auth_user_id,status,created_at,updated_at)
  values (actor,'member',auth_id,'active',now(),now());
  perform set_config('myeongha.subject_id',actor::text,true);
  insert into public.birth_profiles(id,subject_id,profile_kind,created_at,updated_at)
  values (self_profile,actor,'self',now(),now()), (target_profile,actor,'target',now(),now());
  insert into public.birth_profile_revisions(
    id,birth_profile_id,subject_id,revision_no,calendar_type,birth_date,time_known,input_hash,created_at
  ) values (self_revision,self_profile,actor,1,'solar','1992-07-14',false,'fixture-self',now()),
    (target_revision,target_profile,actor,1,'solar','1990-11-12',false,'fixture-target',now()),
    (wrong_revision,target_profile,actor,2,'solar','1990-11-12',false,'fixture-other-revision',now());
  update public.birth_profiles set current_revision_id = self_revision where id = self_profile;
  update public.birth_profiles set current_revision_id = target_revision where id = target_profile;
  insert into public.target_person_profiles(id,subject_id,birth_profile_id,created_at)
  values (target_id,actor,target_profile,now());

  -- Known legacy key is only a fixture for the existing pending-Origin trigger.
  -- Distinct synthetic Offers exercise the enabled-state check in this rollback.
  insert into public.products(id,product_key,product_type,enabled,created_at)
  values (product,'standard.month','reading',true,now());

  foreach offer_key in array array[
    'career','business','wealth','relationship','year','month',
    'first-counterpart','additional-counterpart','relationship-plus-first',
    'career-economy','basic','basic-year','basic-month','basic-year-month'
  ] loop
    select approved.amount_minor, approved.fields, approved.counterpart_order
      into strict amount, fields, counterpart_order
    from commerce_saju_private.approved_offer_v1(offer_key) approved;
    record_id := gen_random_uuid();
    intent_id := gen_random_uuid();
    offer_id := gen_random_uuid();
    capability_id := gen_random_uuid();
    insert into public.commerce_saju_records_v1(id,subject_id,birth_revision_id)
      values (record_id,actor,self_revision)
      returning 'saju-record:' || entitlement_scope_id::text into scope_prefix;
    insert into public.product_capability_sets(id,product_id,definition_version,definition_hash,created_at)
      values (capability_id,product,offer_key,'fixture-' || offer_key,now());
    insert into public.product_capability_items(capability_set_id,item_key,entitlement_key,scope_mode,validity_mode)
      select capability_id, field, 'saju.' || field, 'saju_record', 'unbounded' from unnest(fields) field;
    insert into public.product_offers(
      id,product_id,platform,provider,external_product_id,currency,display_price_minor,enabled,created_at,capability_set_id
    ) values (offer_id,product,'web','portone_v2','fixture-' || offer_key,'KRW',amount,true,now(),capability_id);
    insert into public.product_offer_charge_terms(id,product_offer_id,terms_version,amount_minor,currency)
      values (gen_random_uuid(),offer_id,'fixture',amount,'KRW');

    payload := jsonb_build_object(
      'policy','approved-saju-2026-11-06','approvedOfferId',offer_key,'subjectId',actor,
      'sajuRecordId',record_id,'birthRevisionId',self_revision,'productOfferId',offer_id,
      'capabilitySetId',capability_id,'currency','KRW','amountMinor',amount,'components',(
        select jsonb_agg(jsonb_build_object('component',field,'authority','official_fulfillment',
          'releaseRef','synthetic-' || field) order by field) from unnest(fields) field
      )
    );
    if fields && array['year','month'] then
      payload := payload || jsonb_build_object('periodReferenceDateTime', case offer_key
        when 'basic-month' then '2026-11-30T14:59:59.999Z' else '2026-11-30T15:00:00.000Z' end);
    elsif counterpart_order is not null then
      payload := payload || jsonb_build_object('counterpart', jsonb_build_object(
        'targetPersonId',target_id,'targetBirthRevisionId',target_revision,'order',counterpart_order,
        'useApprovalRef','synthetic-approval'
      ));
    end if;
    admission_hash := 'sha256:v1:' || encode(sha256(convert_to(payload::text,'UTF8')),'hex');
    request_hash := 'sha256:v1:' || encode(sha256(convert_to(format(
      '{"approvedAdmissionHash":"%s","birthRevisionId":"%s","productOfferId":"%s","purchaseKind":"original","sajuRecordId":"%s","sourceReceiptIds":[]}',
      admission_hash,self_revision,offer_id,record_id),'UTF8')),'hex');
    insert into public.purchase_intents(
      id,subject_id,product_offer_id,idempotency_key,request_hash,offer_snapshot_jsonb,offer_snapshot_hash,
      status,created_at,updated_at,expected_amount_minor,expected_currency,charge_terms_version,
      capability_set_id,capability_snapshot_jsonb,capability_snapshot_hash
    ) values (
      intent_id,actor,offer_id,'fixture-' || offer_key,request_hash,
      jsonb_build_object('productOfferId',offer_id,'productId',product,'platform','web','provider','portone_v2',
        'externalProductId','fixture-' || offer_key),'fixture-offer','created',
      case offer_key when 'basic-month' then cutoff - interval '1 millisecond' else cutoff end,
      cutoff,amount,'KRW','fixture',capability_id,jsonb_build_object('capabilitySetId',capability_id,
        'definitionVersion',offer_key,'definitionHash','fixture-' || offer_key),'fixture-capability'
    );
    insert into public.commerce_saju_purchase_origins_v1(purchase_intent_id,subject_id,saju_record_id,birth_revision_id,purchase_kind)
      values (intent_id,actor,record_id,self_revision,'original');

    if offer_key = 'relationship-plus-first' then
      update public.birth_profiles set current_revision_id = wrong_revision where id = target_profile;
      begin
        perform commerce_saju_private.bind_approved_purchase_scope_v1(actor,intent_id,payload::text,admission_hash);
        raise exception 'Stale target revision admitted';
      exception when check_violation then
        get stacked diagnostics failure = message_text;
        if failure <> 'Approved Saju counterpart scope unavailable' then raise; end if;
      end;
      update public.birth_profiles set current_revision_id = target_revision where id = target_profile;
    end if;
    keys := commerce_saju_private.bind_approved_purchase_scope_v1(actor,intent_id,payload::text,admission_hash);
    if keys is distinct from commerce_saju_private.bind_approved_purchase_scope_v1(actor,intent_id,payload::text,admission_hash)
      or (select count(*) from jsonb_object_keys(keys)) <> cardinality(fields) then
      raise exception 'Approved Saju scope did not replay exactly';
    end if;
    if offer_key = 'basic-month' then
      earlier_month := keys->>'month';
      if earlier_month is distinct from scope_prefix || ':monthly:2026-11'
         or keys->>'relationship' is distinct from scope_prefix then
        raise exception 'Monthly package lost period or natal scope';
      end if;
    elsif offer_key = 'month' then
      if keys->>'month' is distinct from scope_prefix || ':monthly:2026-12' then
        raise exception 'Seoul month rollover was not honored';
      end if;
    elsif counterpart_order is not null and keys->>'compatibility' is distinct from
        scope_prefix || ':counterpart:' || encode(sha256(convert_to(
          scope_prefix || ':' || target_id::text || ':' || target_revision::text,'UTF8')),'hex') then
      raise exception 'Relationship grant scope is not opaque or counterpart-bound';
    end if;
    if 'year' = any(fields) and keys->>'year' is distinct from scope_prefix || ':annual:2026' then
      raise exception 'Yearly scope was not pinned';
    end if;
    begin
      perform commerce_saju_private.bind_approved_purchase_scope_v1(actor,intent_id,payload::text,'sha256:v1:' || repeat('0',64));
      raise exception 'Changed admission hash admitted';
    exception when check_violation then
      get stacked diagnostics failure = message_text;
      if failure <> 'Approved Saju admission hash mismatch' then raise; end if;
    end;
    changed_payload := (payload || jsonb_build_object('amountMinor',amount + 1))::text;
    begin
      perform commerce_saju_private.bind_approved_purchase_scope_v1(actor,intent_id,changed_payload,
        'sha256:v1:' || encode(sha256(convert_to(changed_payload,'UTF8')),'hex'));
      raise exception 'A correctly hashed but altered replay was admitted';
    exception when unique_violation then
      get stacked diagnostics failure = message_text;
      if failure <> 'Approved Saju admission replay changed scope' then raise; end if;
    end;
  end loop;
  begin
    update commerce_saju_private.approved_purchase_scope_v1 set component_scope_keys = '{}'::jsonb
      where purchase_intent_id = intent_id;
    raise exception 'Scope update was not rejected';
  exception when check_violation then
    get stacked diagnostics failure = message_text;
    if failure <> 'Approved Saju purchase scope is immutable' then raise; end if;
  end;
  perform set_config('myeongha.subject_id',gen_random_uuid()::text,true);
  begin
    perform commerce_saju_private.bind_approved_purchase_scope_v1(actor,intent_id,payload::text,admission_hash);
    raise exception 'Cross-subject admission was not rejected';
  exception when insufficient_privilege then
    get stacked diagnostics failure = message_text;
    if failure <> 'subject execution context mismatch' then raise; end if;
  end;
  if has_schema_privilege('anon','commerce_saju_private','USAGE')
     or has_schema_privilege('authenticated','commerce_saju_private','USAGE')
     or has_schema_privilege('service_role','commerce_saju_private','USAGE')
     or has_function_privilege('myeongha_api_executor',
       'commerce_saju_private.bind_approved_purchase_scope_v1(uuid,uuid,text,text)','EXECUTE') then
    raise exception 'Private binding exposed before activation';
  end if;
  perform set_config('myeongha.account_deletion_finalizer_subject_id',actor::text,true);
  delete from public.commerce_saju_purchase_origins_v1 where purchase_intent_id = intent_id;
  if exists (select 1 from commerce_saju_private.approved_purchase_scope_v1 where purchase_intent_id = intent_id) then
    raise exception 'Deleting the private parent Origin retained its approved purchase scope';
  end if;

  -- Run the actual owner-only command on distinct synthetic Product/Offer
  -- mappings. The new Product key is deliberately unknown to legacy checkout.
  perform set_config('myeongha.subject_id',actor::text,true);
  product := gen_random_uuid();
  insert into public.products(id,product_key,product_type,enabled,created_at)
  values (product,'fixture.approved.saju','reading',true,now());
  insert into commerce_saju_private.comparison_use_approval_v1(
    approval_ref,subject_id,target_person_id,birth_revision_id,target_birth_revision_id,valid_until
  ) values ('isolated-proof',actor,target_id,self_revision,target_revision,clock_timestamp()+interval '1 hour');
  insert into public.birth_profiles(id,subject_id,profile_kind,created_at,updated_at)
    values (extra_profile,actor,'target',now(),now());
  insert into public.birth_profile_revisions(
    id,birth_profile_id,subject_id,revision_no,calendar_type,birth_date,time_known,input_hash,created_at
  ) values (extra_revision,extra_profile,actor,1,'solar','1991-04-12',false,'fixture-extra-target',now());
  update public.birth_profiles set current_revision_id = extra_revision where id = extra_profile;
  insert into public.target_person_profiles(id,subject_id,birth_profile_id,created_at)
    values (extra_target,actor,extra_profile,now());
  insert into commerce_saju_private.comparison_use_approval_v1(
    approval_ref,subject_id,target_person_id,birth_revision_id,target_birth_revision_id,valid_until
  ) values ('isolated-extra-proof',actor,extra_target,self_revision,extra_revision,clock_timestamp()+interval '1 hour');
  foreach offer_key in array array[
    'career','business','wealth','relationship','year','month',
    'first-counterpart','additional-counterpart','relationship-plus-first',
    'career-economy','basic','basic-year','basic-month','basic-year-month'
  ] loop
    select approved.amount_minor, approved.fields, approved.counterpart_order into strict amount, fields, counterpart_order
    from commerce_saju_private.approved_offer_v1(offer_key) approved;
    record_id := case when offer_key = 'additional-counterpart' then first_record else gen_random_uuid() end;
    intent_id := gen_random_uuid();
    offer_id := gen_random_uuid();
    capability_id := gen_random_uuid();
    if offer_key <> 'additional-counterpart' then
      insert into public.commerce_saju_records_v1(id,subject_id,birth_revision_id)
        values (record_id,actor,self_revision);
    end if;
    target_for_offer := case when offer_key = 'additional-counterpart' then extra_target
      when counterpart_order is not null then target_id end;
    insert into public.product_capability_sets(id,product_id,definition_version,definition_hash,created_at)
      values (capability_id,product,offer_key,'atomic-' || offer_key,now());
    insert into public.product_capability_items(capability_set_id,item_key,entitlement_key,scope_mode,validity_mode)
      select capability_id, field, 'saju.' || field, 'saju_record', 'unbounded' from unnest(fields) field;
    insert into public.product_offers(
      id,product_id,platform,provider,external_product_id,currency,display_price_minor,enabled,created_at,capability_set_id
    ) values (offer_id,product,'web','portone_v2','atomic-' || offer_key,'KRW',amount,true,now(),capability_id);
    insert into public.product_offer_charge_terms(id,product_offer_id,terms_version,amount_minor,currency)
      values (gen_random_uuid(),offer_id,'fixture',amount,'KRW');
    if commerce_saju_private.resolve_approved_purchase_admission_v1(actor,record_id,self_revision,offer_id,
      capability_id,offer_key,'atomic-' || offer_key,target_for_offer) is not null then
      raise exception 'Approved Saju admission resolved without its fulfillment release';
    end if;
    insert into commerce_saju_private.approved_fulfillment_release_v1(
      product_offer_id,approved_offer_id,capability_set_id,components
    ) select offer_id,offer_key,capability_id,jsonb_agg(jsonb_build_object(
      'component',field,'authority','official_fulfillment','releaseRef','isolated-' || field) order by field)
    from unnest(fields) field;
    payload := commerce_saju_private.resolve_approved_purchase_admission_v1(actor,record_id,self_revision,offer_id,
      capability_id,offer_key,'atomic-' || offer_key,target_for_offer);
    if payload is null then raise exception 'Missing isolated admission for %',offer_key; end if;
    offer_snapshot := jsonb_build_object('productOfferId',offer_id,'productId',product,'platform','web',
      'provider','portone_v2','externalProductId','atomic-' || offer_key);
    capability_snapshot := jsonb_build_object('capabilitySetId',capability_id,'definitionVersion',offer_key,
      'definitionHash','atomic-' || offer_key);

    if offer_key = 'basic-month' then
      begin
        perform 1 from public.cmd_create_purchase_intent_v3(actor,intent_id,offer_id,null,'generic-bypass','fixture',
          offer_snapshot,'fixture-offer',capability_snapshot,'fixture-capability');
        raise exception 'Generic checkout bypassed the approved Saju writer';
      exception when check_violation then
        get stacked diagnostics sql_constraint = constraint_name;
        if sql_constraint <> 'cmd_purchase_intent_v3_saju_record_context_required' then raise; end if;
      end;
      begin
        perform 1 from pg_temp.approved_fixture_purchase(actor,intent_id,record_id,self_revision,offer_id,
          'atomic-invalid-period',offer_snapshot,capability_snapshot,
          jsonb_set(payload,'{periodReferenceDateTime}','"2000-01-01T00:00:00.000Z"'))
          as x(purchase_intent_id uuid,replayed boolean,admission_hash text);
        raise exception 'Mismatched purchase period was admitted';
      exception when check_violation then
        get stacked diagnostics failure = message_text;
        if failure <> 'Approved Saju period changed before intent creation' then raise; end if;
      end;
      if exists (select 1 from public.purchase_intents where id = intent_id)
         or exists (select 1 from public.commerce_saju_purchase_origins_v1 where purchase_intent_id = intent_id)
         or exists (select 1 from public.commerce_saju_purchase_admission_context_v1) then
        raise exception 'Rejected period left checkout rows';
      end if;
    end if;
    if offer_key = 'additional-counterpart' then
      begin
        perform 1 from pg_temp.approved_fixture_purchase(actor,intent_id,record_id,self_revision,offer_id,
          'atomic-' || offer_key,offer_snapshot,capability_snapshot,payload)
          as x(purchase_intent_id uuid,replayed boolean,admission_hash text);
        raise exception 'Additional price was admitted without a verified first comparison';
      exception when sqlstate 'P0001' then
        get stacked diagnostics sql_constraint = constraint_name;
        if sql_constraint <> 'approved_saju_counterpart_order_unavailable' then raise; end if;
      end;
      if exists (select 1 from public.purchase_intents where id = intent_id) then
        raise exception 'Rejected comparison order left a Purchase Intent';
      end if;
      -- Isolated proof fixture only. Actual receipt-to-Grant wiring is a
      -- separate boundary. A merely pending first comparison did not qualify.
      insert into public.commerce_receipts(id,subject_id,purchase_intent_id,product_offer_id,platform,provider,
        external_transaction_id,receipt_fingerprint,verification_status,verified_payload_jsonb,verified_at,created_at,
        environment,verifier_revision,verified_amount_minor,verified_currency)
      values(first_receipt,actor,first_intent,first_offer,'web','portone_v2','atomic-first-fixture',
        'atomic-first-fingerprint','verified','{}',now(),now(),'production','isolated',12900,'KRW');
      update public.purchase_intents set status = 'verified' where id = first_intent;
      insert into public.entitlement_grants(id,subject_id,entitlement_key,scope_key,grant_key,grant_source_type,
        status,valid_from,created_at,updated_at,source_receipt_id)
      select gen_random_uuid(),actor,'saju.compatibility',scope.component_scope_keys->>'compatibility',
        'isolated-first-grant','purchase','active',now(),now(),now(),first_receipt
      from commerce_saju_private.approved_purchase_scope_v1 scope where scope.purchase_intent_id = first_intent;
      begin
        insert into public.commerce_provider_events(id,provider,external_event_id,event_type,external_transaction_id,
          resolved_subject_id,resolution_source_type,resolved_receipt_id,payload_fingerprint,status,received_at,environment)
        values(gen_random_uuid(),'portone_v2','atomic-first-unsettled','Transaction.Cancelled','atomic-first-fixture',
          actor,'receipt',first_receipt,'atomic-first-unsettled-fingerprint','received',now(),'production');
        perform 1 from pg_temp.approved_fixture_purchase(actor,intent_id,record_id,self_revision,offer_id,
          'atomic-' || offer_key,offer_snapshot,capability_snapshot,payload)
          as x(purchase_intent_id uuid,replayed boolean,admission_hash text);
        raise exception 'Unsettled refund was counted as a prior comparison purchase';
      exception when sqlstate 'P0001' then
        get stacked diagnostics sql_constraint = constraint_name;
        if sql_constraint <> 'approved_saju_cancellation_pending' then raise; end if;
      end;
    end if;
    if offer_key = 'first-counterpart' then
      first_intent := intent_id;
      first_record := record_id;
      first_offer := offer_id;
      update commerce_saju_private.comparison_use_approval_v1 set revoked_at = now() where approval_ref = 'isolated-proof';
      begin
        perform 1 from pg_temp.approved_fixture_purchase(actor,intent_id,record_id,self_revision,offer_id,
          'atomic-' || offer_key,offer_snapshot,capability_snapshot,payload)
          as x(purchase_intent_id uuid,replayed boolean,admission_hash text);
        raise exception 'Revoked comparison use was accepted by the writer';
      exception when sqlstate 'P0001' then
        get stacked diagnostics sql_constraint = constraint_name;
        if sql_constraint <> 'approved_saju_target_use_unavailable' then raise; end if;
      end;
      update commerce_saju_private.comparison_use_approval_v1 set revoked_at = null where approval_ref = 'isolated-proof';
    end if;
    select * into strict result from pg_temp.approved_fixture_purchase(actor,intent_id,record_id,self_revision,offer_id,
      'atomic-' || offer_key,offer_snapshot,capability_snapshot,payload)
      as x(purchase_intent_id uuid,replayed boolean,admission_hash text);
    if result.purchase_intent_id <> intent_id or result.replayed or not exists (
      select 1 from commerce_saju_private.approved_purchase_scope_v1 scope
      where scope.purchase_intent_id = intent_id and scope.admission_hash = result.admission_hash
    ) then raise exception 'Approved Saju writer did not commit matching scope'; end if;
    if offer_key in ('basic-month','first-counterpart') then
      begin
        perform 1 from pg_temp.approved_fixture_purchase(actor,gen_random_uuid(),record_id,self_revision,offer_id,
          'different-key-' || offer_key,offer_snapshot,capability_snapshot,payload)
          as x(purchase_intent_id uuid,replayed boolean,admission_hash text);
        raise exception 'Duplicate pending scope was admitted with a different idempotency key';
      exception when unique_violation then
        get stacked diagnostics sql_constraint = constraint_name;
        if sql_constraint <> 'approved_saju_scope_conflict' then raise; end if;
      end;
    end if;
    if commerce_saju_private.resolve_approved_purchase_admission_v1(actor,record_id,self_revision,offer_id,
      capability_id,offer_key,'atomic-' || offer_key,target_for_offer)
      is distinct from payload then raise exception 'Approved Saju resolver did not preserve replay scope'; end if;
    select * into strict result from pg_temp.approved_fixture_purchase(actor,gen_random_uuid(),record_id,self_revision,
      offer_id,'atomic-' || offer_key,offer_snapshot,capability_snapshot,payload)
      as x(purchase_intent_id uuid,replayed boolean,admission_hash text);
    if result.purchase_intent_id <> intent_id or not result.replayed then
      raise exception 'Approved Saju command did not replay one exact intent';
    end if;
  end loop;
  if exists (select 1 from public.commerce_saju_purchase_admission_context_v1) then
    raise exception 'Approved Saju purchase left live transaction context';
  end if;
end
$fixture$;
rollback;
select 'PASS_APPROVED_SAJU_PURCHASE_SCOPE_PG17';
