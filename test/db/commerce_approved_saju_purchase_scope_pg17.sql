\set ON_ERROR_STOP on
begin;
\ir ../../docs/operations/candidates/commerce_approved_saju_purchase_scope_v1.sql
\ir ../../docs/operations/candidates/commerce_approved_saju_purchase_writer_v1.sql
\ir ../../docs/operations/candidates/commerce_approved_saju_receipt_fulfillment_v1.sql
\ir ../../docs/operations/candidates/commerce_approved_saju_reading_access_v1.sql
\ir ../../docs/operations/candidates/commerce_approved_saju_legacy_archive_fence_v1.sql
\ir ../../docs/operations/candidates/commerce_approved_saju_issuance_v1.sql
\ir ../../docs/operations/candidates/commerce_approved_saju_issuer_facades_v1.sql
\ir ../../docs/operations/candidates/commerce_approved_saju_pair_issuer_v1.sql
\ir ../../docs/operations/candidates/commerce_approved_saju_full_cancellation_v1.sql
\ir ../../docs/operations/candidates/commerce_approved_saju_checkout_selection_v1.sql
\ir ../../docs/operations/candidates/commerce_approved_saju_payment_handoff_v1.sql
\ir ../../docs/operations/candidates/commerce_approved_saju_sandbox_api_v1.sql

insert into public.saju_domain_runtime(saju_domain,availability,capability_version,updated_at)
select domain,'available','isolated-approved-v1',now()
from unnest(array['general','career','business','wealth','compatibility']) domain
on conflict (saju_domain) do nothing;
insert into public.character_capabilities(id,content_bundle_id,character_id,saju_domain,role,can_initiate,capability_version)
select gen_random_uuid(),catalog.content_bundle_id,catalog.character_id,runtime.saju_domain,'primary',true,runtime.capability_version
from public.character_runtime_catalog catalog cross join public.saju_domain_runtime runtime
where catalog.character_id='test-standard-reader'
on conflict (content_bundle_id,character_id,saju_domain) do nothing;

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

create function pg_temp.approved_fixture_reading(
  actor uuid,intent_id uuid,field text,snapshot_reading_id uuid default null,
  snapshot_body jsonb default null,snapshot_hash text default null
)
returns uuid language plpgsql as $function$
#variable_conflict use_variable
declare
  authorized record;
  reading_id uuid := coalesce(snapshot_reading_id,gen_random_uuid());
  session_id uuid := gen_random_uuid();
  attempt_id uuid := gen_random_uuid();
  source_hash text := repeat('a',64);
  response_hash text := coalesce(snapshot_hash,'sha256:v1:' || repeat('b',64));
  issue_scope jsonb;
  pair_issue_scope jsonb;
  paid_pair_admission jsonb;
  v_pair_body jsonb;
  v_pair_payload jsonb;
  v_pair_snapshot jsonb;
  v_pair_receipt jsonb;
  v_pair_envelope jsonb;
  v_pair_constraint text;
  prepared record;
begin
  select * into strict authorized
    from commerce_saju_private.approved_component_entitlement_v1(actor,intent_id,field);
  issue_scope := commerce_saju_private.approved_issue_scope_v1(actor,intent_id,field);
  if field='compatibility' then
    pair_issue_scope := public.qry_approved_saju_pair_issue_scope_v1(actor,intent_id);
    select scope.admission into paid_pair_admission
      from commerce_saju_private.approved_purchase_scope_v1 scope
      where scope.purchase_intent_id=intent_id;
    if issue_scope->>'targetBirthRevisionId' is distinct from authorized.target_birth_revision_id::text
      or issue_scope->>'targetBirthInputHash' is distinct from (
        select input_hash from public.birth_profile_revisions where id=authorized.target_birth_revision_id
      )
      or pair_issue_scope is null
      or pair_issue_scope - array['approvedOfferId','counterpartOrder','targetPersonId','useApprovalRef']
        is distinct from issue_scope
      or pair_issue_scope->>'approvedOfferId' is distinct from paid_pair_admission->>'approvedOfferId'
      or pair_issue_scope->>'counterpartOrder'
        is distinct from paid_pair_admission->'counterpart'->>'order'
      or pair_issue_scope->>'targetPersonId'
        is distinct from paid_pair_admission->'counterpart'->>'targetPersonId'
      or pair_issue_scope->>'useApprovalRef'
        is distinct from paid_pair_admission->'counterpart'->>'useApprovalRef'
      or public.qry_approved_saju_issue_scope_v1(actor,intent_id,field) is not null
      or issue_scope->'targetBirth'->>'birthDate' is distinct from (
        select birth_date::text from public.birth_profile_revisions where id=authorized.target_birth_revision_id
      ) or exists (
      select 1 from public.prepare_approved_component_reading_v1(actor,intent_id,field,reading_id,
        session_id,'test-standard-reader',source_hash)
    ) or exists (
      select 1 from public.prepare_approved_component_reading_v1(actor,intent_id,field,reading_id,
        session_id,'test-standard-reader',source_hash,authorized.source_birth_revision_id)
    ) then raise exception 'Pair issuer did not enforce the exact two Birth revisions'; end if;
  end if;
  select * into strict prepared
  from public.prepare_approved_component_reading_v1(actor,intent_id,field,reading_id,
    session_id,'test-standard-reader',source_hash,authorized.target_birth_revision_id);
  if prepared.reading_id<>reading_id or prepared.session_id<>session_id
    or issue_scope->>'birthRevisionId' is distinct from authorized.source_birth_revision_id::text
    or issue_scope->>'periodReferenceDateTime' is distinct from authorized.period_reference
    or not commerce_saju_private.admit_approved_issue_attempt_v1(actor,intent_id,field,reading_id,
      session_id,null,authorized.source_birth_revision_id,source_hash,authorized.target_birth_revision_id)
    or exists (
      select 1 from public.prepare_approved_component_reading_v1(actor,intent_id,field,gen_random_uuid(),
        gen_random_uuid(),'test-standard-reader',repeat('c',64),authorized.target_birth_revision_id)
    ) then raise exception 'Approved logical Reading did not enforce the exact paid request'; end if;
  select * into strict prepared
  from public.prepare_approved_component_reading_v1(actor,intent_id,field,gen_random_uuid(),
    gen_random_uuid(),'test-standard-reader',source_hash,authorized.target_birth_revision_id);
  if prepared.reading_id<>reading_id or prepared.session_id<>session_id then
    raise exception 'Approved logical Reading replay allocated a new identity';
  end if;
  if field='compatibility' and exists (
    select 1 from public.cmd_prepare_approved_saju_attempt_v1(actor,intent_id,field,reading_id,
      session_id,attempt_id,authorized.source_birth_revision_id,source_hash,'isolated-fixture','saju',null,
      authorized.source_birth_revision_id)
  ) then raise exception 'Pair issuer prepared an attempt with a substituted target'; end if;
  select * into strict prepared from public.cmd_prepare_approved_saju_attempt_v1(actor,intent_id,field,reading_id,
    session_id,attempt_id,authorized.source_birth_revision_id,source_hash,'isolated-fixture','saju',null,
    authorized.target_birth_revision_id);
  if prepared.execution_attempt_id<>attempt_id or prepared.attempt_state<>'running' or prepared.replayed
    or not public.admit_approved_saju_issue_attempt_v1(actor,intent_id,field,reading_id,
      session_id,attempt_id,authorized.source_birth_revision_id,source_hash,authorized.target_birth_revision_id)
    or commerce_saju_private.admit_approved_issue_attempt_v1(actor,intent_id,field,reading_id,
      session_id,null,authorized.source_birth_revision_id,source_hash,authorized.target_birth_revision_id)
    or public.admit_approved_saju_issue_attempt_v1(actor,intent_id,field,reading_id,
      session_id,attempt_id,authorized.source_birth_revision_id,repeat('c',64),authorized.target_birth_revision_id) then
    raise exception 'Approved source attempt did not enforce the exact paid request';
  end if;
  if field='compatibility' then
    begin
      update commerce_saju_private.comparison_use_approval_v1 approval set revoked_at=clock_timestamp()
        where approval.subject_id=actor and approval.birth_revision_id=authorized.source_birth_revision_id
          and approval.target_birth_revision_id=authorized.target_birth_revision_id;
      if public.qry_approved_saju_pair_issue_scope_v1(actor,intent_id) is not null then
        raise exception 'Pair review returned a target after consent withdrawal';
      end if;
      if public.admit_approved_saju_issue_attempt_v1(actor,intent_id,field,reading_id,
        session_id,attempt_id,authorized.source_birth_revision_id,source_hash,authorized.target_birth_revision_id) then
        raise exception 'Pair issuer admitted a running attempt after consent withdrawal';
      end if;
      raise sqlstate 'ZX001' using message='Restore synthetic pair consent';
    exception when sqlstate 'ZX001' then null;
    end;
    begin
      perform 1 from public.cmd_finalize_approved_saju_reading_v1(actor,intent_id,field,reading_id,attempt_id,
        gen_random_uuid(),source_hash,'isolated-ref','isolated-approved-v1','isolated-native',
        'fixture-birth-hash',jsonb_build_object('state','delivered','responseVersion','myeonghwa-product-reading-response-v2',
          'reading',jsonb_build_object('readingId',reading_id)),response_hash);
      raise exception 'Single-Birth finalizer accepted a pair Reading';
    exception when sqlstate 'P0001' then
      if sqlerrm <> 'Approved Saju issuance authority changed' then raise; end if;
    end;
    begin
      perform 1 from public.cmd_finalize_approved_saju_pair_reading_v1(actor,intent_id,reading_id,attempt_id,
        gen_random_uuid(),source_hash,'isolated-ref','isolated-approved-v1',
        (select input_hash from public.birth_profile_revisions where id=authorized.source_birth_revision_id),
        (select input_hash from public.birth_profile_revisions where id=authorized.target_birth_revision_id),
        jsonb_build_object('state','delivered','responseVersion','myeonghwa-product-reading-response-v2',
          'reading',jsonb_build_object('readingId',reading_id)),
        response_hash,'{}'::jsonb);
      raise exception 'Dedicated T10 finalizer accepted missing Ed25519 Source proof';
    exception when sqlstate 'P0001' then
      if sqlerrm <> 'Approved Saju pair source did not match the verified issued Reading' then raise; end if;
    end;
  end if;
  if field='compatibility' then
    v_pair_body := jsonb_build_object(
      'version','saju-t10-official-pair-reading-v1','state','issued','readingId',reading_id,
      'readingDomain','compatibility','policyId','myeongha-t10-internal-relational-explanation-v1',
      'policyVersion','2026-11-13','materialHash',repeat('e',64),
      'charts',jsonb_build_array(
        jsonb_build_object('role','self','birthRevisionId',authorized.source_birth_revision_id,
          'birthInputHash',(select input_hash from public.birth_profile_revisions
            where id=authorized.source_birth_revision_id)),
        jsonb_build_object('role','partner','birthRevisionId',authorized.target_birth_revision_id,
          'birthInputHash',(select input_hash from public.birth_profile_revisions
            where id=authorized.target_birth_revision_id))),
      'chartDisplays',jsonb_build_array(jsonb_build_object('role','self'),
        jsonb_build_object('role','partner')),
      'units',jsonb_build_array(
        jsonb_build_object('paragraph','두 명식의 접점을 설명합니다.'),
        jsonb_build_object('paragraph','두 명식의 조율 지점을 설명합니다.'),
        jsonb_build_object('paragraph','미지원 결과는 단정하지 않습니다.'))
    );
    v_pair_payload := jsonb_build_object(
      'version','myeongha-t10-production-pair-issue-v1',
      'executionAttemptId',attempt_id,'purchaseIntentId',intent_id,'readingId',reading_id,
      'offerId',pair_issue_scope->>'approvedOfferId',
      'counterpartOrder',pair_issue_scope->>'counterpartOrder',
      'targetPersonId',pair_issue_scope->>'targetPersonId',
      'useApprovalRef',pair_issue_scope->>'useApprovalRef',
      'admissionHash',pair_issue_scope->>'admissionHash',
      'birthRevisionId',authorized.source_birth_revision_id,
      'targetBirthRevisionId',authorized.target_birth_revision_id,
      'sourceRequestHash',source_hash,'engineVersion','isolated-approved-v1',
      'sourceBirthInputHash',(select input_hash from public.birth_profile_revisions
        where id=authorized.source_birth_revision_id),
      'targetBirthInputHash',(select input_hash from public.birth_profile_revisions
        where id=authorized.target_birth_revision_id),
      'releaseRef',pair_issue_scope->>'releaseRef',
      'materialHash',repeat('e',64),'responseBodyHash',repeat('d',64),
      'issuedAtMs',floor(extract(epoch from clock_timestamp())*1000)::bigint);
    v_pair_snapshot := jsonb_build_object(
      'responseVersion','myeonghwa-product-reading-response-v2',
      'state','delivered','messageCode','READING_DELIVERED','requiredAction','none',
      'reading',jsonb_build_object('readingId',reading_id,
        'sections',jsonb_build_array(
          jsonb_build_object('sectionType','structure',
            'blocks',jsonb_build_array(jsonb_build_object('type','fact_table',
              'rows',jsonb_build_array()))),
          jsonb_build_object('sectionType','compatibility','blocks',jsonb_build_array(
            jsonb_build_object('type','paragraph','text','두 명식의 접점을 설명합니다.'),
            jsonb_build_object('type','paragraph','text','두 명식의 조율 지점을 설명합니다.'),
            jsonb_build_object('type','paragraph','text','미지원 결과는 단정하지 않습니다.'))))));
    v_pair_envelope := jsonb_build_object(
      'payload',v_pair_payload,'sourceBody',v_pair_body,'signature',repeat('A',86));

    -- A valid-shaped Source must not let altered Korean copy commit a Reading.
    -- PL/pgSQL exception blocks rollback their own DB writes in PG17.
    begin
      perform 1 from public.cmd_finalize_approved_saju_pair_reading_v1(
        actor,intent_id,reading_id,attempt_id,gen_random_uuid(),source_hash,
        'isolated-ref','isolated-approved-v1',
        (select input_hash from public.birth_profile_revisions
          where id=authorized.source_birth_revision_id),
        (select input_hash from public.birth_profile_revisions
          where id=authorized.target_birth_revision_id),
        jsonb_set(v_pair_snapshot,'{reading,sections,1,blocks,0,text}',to_jsonb('바뀐 문단'::text)),
        response_hash,v_pair_envelope);
      raise exception 'Changed pair Korean text was committed before Source verification';
    exception when sqlstate 'P0001' then
      get stacked diagnostics v_pair_constraint = constraint_name;
      if v_pair_constraint <> 'approved_saju_pair_text_modified' then raise; end if;
    end;
    if exists (
      select 1 from commerce_saju_private.approved_source_issue_proofs_v1 proof
      where proof.reading_id=reading_id
    ) then raise exception 'Rejected Korean text left a persisted signed pair proof'; end if;

    perform 1 from public.cmd_finalize_approved_saju_pair_reading_v1(
      actor,intent_id,reading_id,attempt_id,gen_random_uuid(),source_hash,
      'isolated-ref','isolated-approved-v1',
      (select input_hash from public.birth_profile_revisions
        where id=authorized.source_birth_revision_id),
      (select input_hash from public.birth_profile_revisions
        where id=authorized.target_birth_revision_id),
      v_pair_snapshot,response_hash,v_pair_envelope);
    v_pair_receipt := public.qry_approved_saju_source_issue_proof_v1(actor,reading_id);
    if v_pair_receipt#>>'{proof,payload,readingId}' is distinct from reading_id::text
      or v_pair_receipt#>>'{proof,payload,targetBirthRevisionId}'
        is distinct from authorized.target_birth_revision_id::text
      or v_pair_receipt#>>'{proof,payload,offerId}'
        is distinct from pair_issue_scope->>'approvedOfferId'
      or v_pair_receipt#>>'{proof,payload,useApprovalRef}'
        is distinct from pair_issue_scope->>'useApprovalRef'
      or v_pair_receipt->'proof' is distinct from v_pair_envelope
      or v_pair_receipt->>'storedResponseHash' is distinct from response_hash
      or v_pair_receipt->>'sourceRequestHash' is distinct from source_hash
      or v_pair_receipt->>'releaseRef' is distinct from pair_issue_scope->>'releaseRef'
      or v_pair_receipt->>'executionAttemptId' is distinct from attempt_id::text
      or v_pair_receipt->>'originatingGrantId' is distinct from authorized.entitlement_grant_id::text
      or nullif(v_pair_receipt->>'acceptedAt','') is null
      or not exists (
        select 1 from public.qry_approved_saju_component_record_v1(actor,reading_id,'test-standard-reader',true) r
        where r.component='compatibility' and r.response_hash=response_hash
          and r.response_snapshot_jsonb#>'{reading,sections,1,blocks}'
            is not distinct from v_pair_snapshot#>'{reading,sections,1,blocks}'
      ) then
      raise exception 'Pair Reading/Reader archive lost its exact signed two-person material';
    end if;

    -- Same Reading/attempt cannot substitute another signed source. A failed
    -- replay must not alter the previously archived proof or delivered response.
    begin
      perform 1 from public.cmd_finalize_approved_saju_pair_reading_v1(
        actor,intent_id,reading_id,attempt_id,gen_random_uuid(),source_hash,
        'isolated-ref','isolated-approved-v1',
        (select input_hash from public.birth_profile_revisions
          where id=authorized.source_birth_revision_id),
        (select input_hash from public.birth_profile_revisions
          where id=authorized.target_birth_revision_id),
        v_pair_snapshot,response_hash,
        jsonb_set(v_pair_envelope,'{signature}',to_jsonb(repeat('B',86))));
      raise exception 'Pair issuer accepted another signed Source for the same Reading';
    exception when unique_violation then
      get stacked diagnostics v_pair_constraint = constraint_name;
      if v_pair_constraint <> 'approved_saju_pair_immutable_proof_replay' then raise; end if;
    end;
    if public.qry_approved_saju_source_issue_proof_v1(actor,reading_id)->'proof'
      is distinct from v_pair_envelope
      or not exists (
        select 1 from public.qry_approved_saju_component_record_v1(actor,reading_id,'test-standard-reader',true) r
        where r.response_hash=response_hash and r.response_snapshot_jsonb=v_pair_snapshot
      ) then
      raise exception 'Rejected pair proof replay mutated the archived customer Reading';
    end if;
  else
    perform 1 from public.cmd_finalize_reading_transport_success_v1(actor,reading_id,attempt_id,gen_random_uuid(),
      'isolated-ref','isolated-approved-v1','isolated-native',
    (select input_hash from public.birth_profile_revisions where id=authorized.source_birth_revision_id),
    (select input_hash from public.birth_profile_revisions where id=authorized.target_birth_revision_id),
    'myeonghwa-product-reading-response-v2','delivered',null,null,null,
    coalesce(snapshot_body,jsonb_build_object('responseVersion','myeonghwa-product-reading-response-v2','state','delivered',
      'reading',jsonb_build_object('readingId',reading_id))),response_hash);
  end if;
  set constraints ct_reading_session_authority,ct_reading_request_authority,ct_reading_finalize_from_reading,
    ct_reading_finalize_from_ref,ct_reading_finalize_from_execution immediate;
  set constraints ct_reading_session_authority,ct_reading_request_authority,ct_reading_finalize_from_reading,
    ct_reading_finalize_from_ref,ct_reading_finalize_from_execution deferred;
  begin
    perform commerce_saju_private.bind_approved_component_reading_v1(actor,intent_id,field,reading_id,
      repeat('c',64),response_hash);
    raise exception 'Different source request was bound to the paid component';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'Approved Saju Reading does not match the exact issued scope' then raise; end if;
  end;
  perform commerce_saju_private.bind_approved_component_reading_v1(actor,intent_id,field,reading_id,source_hash,response_hash);
  perform commerce_saju_private.bind_approved_component_reading_v1(actor,intent_id,field,reading_id,source_hash,response_hash);
  if not exists (
    select 1 from commerce_saju_private.approved_stored_lineage_v1(actor,reading_id,attempt_id) source
    where source.stored_response_hash=response_hash and source.external_request_ref='isolated-ref'
      and source.target_birth_input_hash is not distinct from (
        select input_hash from public.birth_profile_revisions where id=authorized.target_birth_revision_id
      )
  ) then raise exception 'Approved source commit lineage was not readable'; end if;
  if not exists (
    select 1 from public.qry_approved_saju_component_record_v1(actor,reading_id,null,true) record
    where record.response_hash=response_hash and record.response_snapshot_jsonb->'reading'->>'readingId'=reading_id::text
  ) or not exists (
    select 1 from public.qry_approved_saju_component_record_v1(actor,reading_id,'test-standard-reader',false) metadata
    where metadata.response_hash=response_hash and metadata.response_snapshot_jsonb is null
  ) or exists (
    select 1 from public.qry_approved_saju_component_record_v1(actor,reading_id,'other-reader',true)
  ) or exists (
    select 1 from public.qry_official_reading_record_runtime_v1(actor,reading_id)
  ) then raise exception 'Archive and Reader did not resolve one exact authorized source'; end if;
  begin
    perform set_config('myeongha.subject_id',gen_random_uuid()::text,true);
    perform 1 from public.qry_approved_saju_component_record_v1(actor,reading_id,null,true);
    raise exception 'Cross-subject archive was not rejected';
  exception when insufficient_privilege then
    if sqlerrm <> 'subject execution context mismatch' then raise; end if;
  end;
  return reading_id;
end
$function$;

create function pg_temp.approved_fixture_receipt(
  actor uuid, intent_id uuid, receipt_id uuid, amount_delta bigint default 0
) returns void language plpgsql as $function$
begin
  insert into public.commerce_receipts(
    id,subject_id,purchase_intent_id,product_offer_id,platform,provider,external_transaction_id,
    receipt_fingerprint,verification_status,verified_payload_jsonb,verified_at,created_at,
    environment,verifier_revision,verified_amount_minor,verified_currency
  ) select receipt_id,actor,intent_id,intent.product_offer_id,'web','portone_v2',receipt_id::text,
    'isolated-' || receipt_id::text,'verified','{}',now(),now(),'production','isolated',
    intent.expected_amount_minor + amount_delta,intent.expected_currency
  from public.purchase_intents intent where intent.id=intent_id and intent.subject_id=actor;
  insert into public.commerce_payment_attempts(
    id,purchase_intent_id,subject_id,product_offer_id,attempt_no,provider,environment,idempotency_key,
    provider_request_id,provider_transaction_id,status,created_at,updated_at
  ) select gen_random_uuid(),intent_id,actor,intent.product_offer_id,
    (select count(*)::integer+1 from public.commerce_payment_attempts attempt where attempt.purchase_intent_id=intent_id),
    'portone_v2','production',receipt_id::text,'payment-' || receipt_id::text,receipt_id::text,
    'response_received',now(),now()
  from public.purchase_intents intent where intent.id=intent_id and intent.subject_id=actor;
  update public.purchase_intents set status='verified' where id=intent_id and subject_id=actor;
end
$function$;

create function pg_temp.approved_fixture_full_cancellation(receipt_id uuid,cancelled_at timestamptz,payment_id text default null)
returns jsonb language sql as $function$
  select public.internal_apply_approved_saju_full_cancellation_v1(
    coalesce(payment_id,'payment-' || receipt.id::text),receipt.external_transaction_id,'cancel-' || receipt.id::text,
    cancelled_at,receipt.verified_amount_minor,receipt.verified_currency,receipt.environment,
    'hmac-sha256:k1:' || repeat('a',64),'isolated-cancel')
  from public.commerce_receipts receipt where receipt.id=receipt_id
$function$;

create function pg_temp.approved_fixture_grants(
  intent_id uuid, receipt_id uuid, fields text[]
) returns void language plpgsql as $function$
declare
  total integer;
  matching integer;
  outcome text;
begin
  select applied.grant_count,applied.outcome into strict total,outcome
  from public.internal_fulfill_verified_approved_saju_receipt_v1(receipt_id) applied;
  select count(*) into matching
  from commerce_saju_private.approved_purchase_scope_v1 scope
  cross join jsonb_each_text(scope.component_scope_keys) item(field, scope_key)
  join public.entitlement_grants grant_row
    on grant_row.entitlement_key=public.internal_commerce_saju_entitlement_key_v1(item.field)
    and grant_row.scope_key=item.scope_key and grant_row.source_receipt_id=receipt_id
  where scope.purchase_intent_id=intent_id;
  if outcome<>'granted' or total <> cardinality(fields) or total <> matching then
    raise exception 'Verified receipt grants did not match all pinned component scopes';
  end if;
  select applied.grant_count,applied.outcome into strict total,outcome
  from public.internal_fulfill_verified_approved_saju_receipt_v1(receipt_id) applied;
  if outcome<>'replayed' or total <> cardinality(fields) then raise exception 'Verified receipt grant replay was not exact'; end if;
  if (select array_agg(event.dedupe_key order by event.dedupe_key)
    from public.outbox_events event where event.aggregate_type='purchase_intent'
      and event.aggregate_id=intent_id::text and event.event_type='approved_saju.reading_requested'
      and event.event_schema_version='approved-saju-reading-request-v1'
      and event.status='pending' and event.payload_jsonb->>'component'=event.dedupe_key)
    is distinct from (select array_agg(field order by field) from unnest(fields) field) then
    raise exception 'Verified receipt did not enqueue each approved Reading exactly once';
  end if;
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
  first_receipt uuid := gen_random_uuid();
  extra_target uuid := gen_random_uuid();
  extra_profile uuid := gen_random_uuid();
  extra_revision uuid := gen_random_uuid();
  target_for_offer uuid;
  receipt_for_offer uuid;
  first_grant public.entitlement_grants%rowtype;
  first_reading uuid;
  additional_reading uuid;
  bundle_pair_reading uuid;
  bundle_self_reading uuid;
  edited_self uuid := gen_random_uuid();
  cancelled_at timestamptz;
  cancel_result jsonb;
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
    insert into public.commerce_saju_purchase_origins_v1(
      purchase_intent_id,subject_id,saju_record_id,birth_revision_id,purchase_kind,approved_admission_hash
    ) values (intent_id,actor,record_id,self_revision,'original',admission_hash);

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
       'commerce_saju_private.bind_approved_purchase_scope_v1(uuid,uuid,text,text)','EXECUTE')
     or has_function_privilege('myeongha_commerce_internal_executor',
       'public.internal_fulfill_verified_approved_saju_receipt_v1(uuid)','EXECUTE')
     or has_function_privilege('myeongha_api_executor',
       'commerce_saju_private.create_approved_saju_sandbox_attempt_v1(uuid,uuid,uuid,text,text,text)','EXECUTE')
     or has_function_privilege('myeongha_api_executor',
       'commerce_saju_private.read_approved_saju_sandbox_handoff_v1(uuid,uuid,text)','EXECUTE') then
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
      -- A synthetic verified Receipt goes through the actual grant batch.
      perform pg_temp.approved_fixture_receipt(actor,first_intent,first_receipt);
      begin
        update commerce_saju_private.comparison_use_approval_v1 set revoked_at=now() where approval_ref='isolated-proof';
        perform pg_temp.approved_fixture_grants(first_intent,first_receipt,array['compatibility']);
        raise exception 'Revoked target use was allowed to mint a comparison grant';
      exception when sqlstate 'P0001' then
        get stacked diagnostics sql_constraint = constraint_name;
        if sql_constraint <> 'approved_saju_receipt_target_use_unavailable' then raise; end if;
      end;
      perform pg_temp.approved_fixture_grants(first_intent,first_receipt,array['compatibility']);
      first_reading := pg_temp.approved_fixture_reading(actor,first_intent,'compatibility');
      begin
        update commerce_saju_private.comparison_use_approval_v1 set revoked_at=now() where approval_ref='isolated-proof';
        if exists(select 1 from public.qry_approved_saju_component_record_v1(actor,first_reading,null,true)) then
          raise exception 'Archived comparison reopened after target use was revoked';
        end if;
        raise exception using errcode='P0002',message='restore synthetic approval';
      exception when no_data_found then
        if sqlerrm <> 'restore synthetic approval' then raise; end if;
      end;
      begin
        insert into public.commerce_provider_events(id,provider,external_event_id,event_type,external_transaction_id,
          resolved_subject_id,resolution_source_type,resolved_receipt_id,payload_fingerprint,status,received_at,environment)
        values(gen_random_uuid(),'portone_v2','atomic-first-unsettled','Transaction.Cancelled',first_receipt::text,
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
    select * into strict result from commerce_saju_private.create_approved_saju_sandbox_attempt_v1(
      actor,gen_random_uuid(),intent_id,'sandbox','attempt-' || offer_key,'sandbox-' || offer_key
    );
    perform 1 from commerce_saju_private.read_approved_saju_sandbox_handoff_v1(
      actor,result.payment_attempt_id,offer_key
    ) handoff where handoff.expected_amount_minor=amount and handoff.expected_currency='KRW';
    if not found then raise exception 'Sandbox handoff did not match catalog price for %',offer_key; end if;
    if offer_key='first-counterpart' then
      begin
        update commerce_saju_private.comparison_use_approval_v1 set revoked_at=now()
          where approval_ref='isolated-proof';
        perform 1 from commerce_saju_private.read_approved_saju_sandbox_handoff_v1(
          actor,result.payment_attempt_id,offer_key
        );
        raise exception 'Sandbox handoff ignored revoked target use';
      exception when sqlstate 'P0001' then
        get stacked diagnostics sql_constraint=constraint_name;
        if sql_constraint<>'approved_saju_payment_unavailable' then raise; end if;
      end;
    end if;
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
    if offer_key <> 'first-counterpart' then
      receipt_for_offer := gen_random_uuid();
      if offer_key = 'basic-month' then
        begin
          perform pg_temp.approved_fixture_receipt(actor,intent_id,receipt_for_offer,1);
          perform pg_temp.approved_fixture_grants(intent_id,receipt_for_offer,fields);
          raise exception 'Incorrect verified receipt amount was allowed to mint grants';
        exception when check_violation then
          get stacked diagnostics sql_constraint = constraint_name;
          if sql_constraint <> 'ct_commerce_receipt_charge_terms_mismatch' then raise; end if;
        end;
      end if;
      perform pg_temp.approved_fixture_receipt(actor,intent_id,receipt_for_offer);
      if offer_key = 'basic-month' then
        begin
          cancelled_at := clock_timestamp();
          cancel_result := pg_temp.approved_fixture_full_cancellation(receipt_for_offer,cancelled_at);
          if cancel_result->>'disposition'<>'cancelled_before_grant'
            or (select verification_status from public.commerce_receipts where id=receipt_for_offer)<>'revoked'
            or exists (select 1 from public.entitlement_grants where source_receipt_id=receipt_for_offer) then
            raise exception 'Verified full cancellation before issuance did not revoke only the receipt';
          end if;
          raise sqlstate 'ZX002' using message='Roll back isolated pre-issuance cancellation';
        exception when sqlstate 'ZX002' then null;
        end;
        begin
          delete from commerce_saju_private.approved_purchase_scope_v1 where purchase_intent_id=intent_id;
          perform pg_temp.approved_fixture_grants(intent_id,receipt_for_offer,fields);
          raise exception 'Approved receipt without its scope fell back to an entitlement';
        exception when sqlstate 'P0001' then
          get stacked diagnostics sql_constraint = constraint_name;
          if sql_constraint <> 'approved_saju_receipt_scope_missing' then raise; end if;
        end;
      end if;
      perform pg_temp.approved_fixture_grants(intent_id,receipt_for_offer,fields);
      if (select count(*) from public.qry_approved_saju_purchase_readings_v1(actor,intent_id)
          where reading_id is null and reading_session_id is null and saju_domain is null
            and reader_character_id is null and completed_at is null)<>cardinality(fields) then
        raise exception 'Paid order archive did not list its pending components';
      end if;
      if offer_key in ('career','business','wealth','relationship','year','month') then
        perform pg_temp.approved_fixture_reading(actor,intent_id,offer_key);
      end if;
      if offer_key='relationship-plus-first' then
        bundle_pair_reading := pg_temp.approved_fixture_reading(actor,intent_id,'compatibility');
        bundle_self_reading := pg_temp.approved_fixture_reading(actor,intent_id,'relationship');
        if (select count(*) from public.qry_approved_saju_purchase_readings_v1(actor,intent_id)
          where reading_id is not null and reading_session_id is not null and saju_domain=component)<>2
          or bundle_pair_reading=bundle_self_reading
          or public.qry_approved_saju_source_issue_proof_v1(actor,bundle_pair_reading) is null
          or public.qry_approved_saju_source_issue_proof_v1(actor,bundle_self_reading) is not null then
          raise exception 'Combined order did not preserve independent pair and self Reading proofs';
        end if;
        cancelled_at := clock_timestamp();
        cancel_result := pg_temp.approved_fixture_full_cancellation(receipt_for_offer,cancelled_at);
        if cancel_result->>'disposition'<>'revoked'
          or (cancel_result->>'grantCount')::integer<>cardinality(fields)
          or exists(select 1 from public.qry_approved_saju_purchase_readings_v1(actor,intent_id))
          or exists(select 1 from public.qry_approved_saju_component_record_v1(actor,bundle_pair_reading,null,true))
          or exists(select 1 from public.qry_approved_saju_component_record_v1(actor,bundle_self_reading,null,true))
          or public.qry_approved_saju_source_issue_proof_v1(actor,bundle_pair_reading) is not null then
          raise exception 'Cancelled combined T8/T10 purchase retained its Reader or pair proof access';
        end if;
      end if;
      if offer_key='basic-month' then
        begin
          insert into public.birth_profile_revisions(
            id,birth_profile_id,subject_id,revision_no,calendar_type,birth_date,time_known,input_hash,created_at
          ) values (edited_self,self_profile,actor,2,'solar','1993-07-14',false,'fixture-edited-self',now());
          update public.birth_profiles set current_revision_id=edited_self where id=self_profile;
          perform pg_temp.approved_fixture_reading(actor,intent_id,'month');
          raise sqlstate 'ZX001' using message='Roll back isolated self edit after successful paid Reading';
        exception when sqlstate 'ZX001' then null;
        end;
        perform pg_temp.approved_fixture_reading(actor,intent_id,'month');
        perform pg_temp.approved_fixture_reading(actor,intent_id,'relationship');
        if (select array_agg(component order by component) from public.qry_approved_saju_purchase_readings_v1(actor,intent_id)
            where reading_id is not null and reader_character_id is not null and completed_at is not null)
            is distinct from array['month','relationship']::text[] then
          raise exception 'Package archive did not bind its completed components';
        end if;
        begin
          declare other_subject uuid := gen_random_uuid();
          begin
            perform set_config('myeongha.subject_id',other_subject::text,true);
            if exists(select 1 from public.qry_approved_saju_purchase_readings_v1(other_subject,intent_id)) then
              raise exception 'Package archive was visible to a different subject';
            end if;
            raise sqlstate 'ZX001' using message='Restore fixture subject';
          end;
        exception when sqlstate 'ZX001' then null;
        end;
        cancelled_at := clock_timestamp();
        cancel_result := pg_temp.approved_fixture_full_cancellation(receipt_for_offer,cancelled_at);
        if cancel_result->>'disposition'<>'revoked'
          or (cancel_result->>'grantCount')::integer<>cardinality(fields)
          or exists (
            select 1 from public.entitlement_grants where source_receipt_id=receipt_for_offer and status<>'revoked'
          ) or exists (
            select 1 from public.qry_approved_saju_purchase_readings_v1(actor,intent_id)
          ) then raise exception 'Verified package cancellation did not revoke every purchased component'; end if;
      end if;
      if offer_key = 'additional-counterpart' then
        additional_reading := pg_temp.approved_fixture_reading(actor,intent_id,'compatibility');
        select * into strict first_grant from public.entitlement_grants where source_receipt_id=first_receipt;
        cancelled_at := clock_timestamp();
        begin
          perform pg_temp.approved_fixture_full_cancellation(first_receipt,cancelled_at,'payment-' || receipt_for_offer::text);
          raise exception 'Different charge authorized an approved Saju full cancellation';
        exception when check_violation then
          if sqlerrm <> 'Approved Saju cancellation does not match the original charge' then raise; end if;
        end;
        cancel_result := pg_temp.approved_fixture_full_cancellation(first_receipt,cancelled_at);
        if cancel_result->>'disposition'<>'revoked' or cancel_result->>'grantCount'<>'1'
          or pg_temp.approved_fixture_full_cancellation(first_receipt,cancelled_at) is distinct from cancel_result
          or (select verification_status from public.commerce_receipts where id=first_receipt)<>'revoked' then
          raise exception 'Verified full cancellation did not revoke and replay the exact receipt';
        end if;
        if (select status from public.entitlement_grants where id=first_grant.id)<>'revoked'
           or not exists(select 1 from public.entitlement_grants where source_receipt_id=receipt_for_offer
             and status='active' and scope_key is distinct from first_grant.scope_key)
           or exists(select 1 from public.qry_approved_saju_component_record_v1(actor,first_reading,null,true))
           or exists(select 1 from public.qry_official_reading_record_runtime_v1(actor,first_reading))
           or not exists(select 1 from public.qry_approved_saju_component_record_v1(actor,additional_reading,null,true))
           or public.qry_approved_saju_source_issue_proof_v1(actor,first_reading) is not null
           or public.qry_approved_saju_source_issue_proof_v1(actor,additional_reading) is null
           or not exists(
             select 1 from commerce_saju_private.approved_source_issue_proofs_v1 proof
             where proof.reading_id=first_reading and proof.subject_id=actor
           ) then
          raise exception 'Refund incorrectly exposed or deleted a historical pair receipt';
        end if;
        payload := commerce_saju_private.resolve_approved_purchase_admission_v1(actor,record_id,self_revision,
          offer_id,capability_id,offer_key,'after-settled-refund',target_id);
        perform 1 from pg_temp.approved_fixture_purchase(actor,gen_random_uuid(),record_id,self_revision,
          offer_id,'after-settled-refund',offer_snapshot,capability_snapshot,payload)
          as x(purchase_intent_id uuid,replayed boolean,admission_hash text);
      end if;
    end if;
  end loop;
  if exists (select 1 from public.commerce_saju_purchase_admission_context_v1) then
    raise exception 'Approved Saju purchase left live transaction context';
  end if;
end
$fixture$;

do $disabled$
begin
  if has_function_privilege('myeongha_api_executor',
    'public.select_approved_saju_checkout_v1(uuid,text,text,uuid)','EXECUTE')
    or has_function_privilege('myeongha_api_executor',
      'public.qry_approved_saju_purchase_readings_v1(uuid,uuid)','EXECUTE')
    or has_function_privilege('myeongha_api_executor',
      'public.qry_approved_saju_reading_history_v1(uuid,timestamptz,timestamptz,uuid,integer)','EXECUTE') then
    raise exception 'Sandbox API was granted before the opt-in';
  end if;
end
$disabled$;
\ir ../../docs/operations/candidates/commerce_approved_saju_sandbox_api_grant_v1.sql
do $granted_acl$
declare
  entry oid;
  intended_count integer := 0;
begin
  for entry in select proc.oid from pg_catalog.pg_proc proc
    join pg_catalog.pg_namespace ns on ns.oid=proc.pronamespace
    where ns.nspname='public' and proc.proname in (
      'select_approved_saju_checkout_v1','resolve_approved_purchase_admission_v1',
      'create_approved_purchase_intent_v1','create_approved_saju_sandbox_attempt_v1',
      'read_approved_saju_sandbox_handoff_v1','qry_approved_saju_sandbox_verification_context_v1',
      'qry_approved_saju_component_record_v1',
      'qry_approved_saju_purchase_readings_v1','qry_approved_saju_reading_history_v1'
    )
  loop
    intended_count := intended_count+1;
    if not has_function_privilege('myeongha_api_executor',entry,'EXECUTE')
      or has_function_privilege('anon',entry,'EXECUTE')
      or has_function_privilege('authenticated',entry,'EXECUTE')
      or has_function_privilege('service_role',entry,'EXECUTE') then
      raise exception 'Sandbox API opt-in exposed a function to the wrong role';
    end if;
  end loop;
  if intended_count<>9 or has_schema_privilege('myeongha_api_executor','commerce_saju_private','USAGE')
    or has_function_privilege('myeongha_commerce_internal_executor',
      'public.internal_fulfill_verified_approved_saju_receipt_v1(uuid)','EXECUTE') then
    raise exception 'Sandbox API opt-in changed the private or fulfillment perimeter';
  end if;
end
$granted_acl$;

do $checkout_selection$
declare
  actor uuid := gen_random_uuid();
  actor_auth uuid := gen_random_uuid();
  profile uuid := gen_random_uuid();
  first_revision uuid := gen_random_uuid();
  next_revision uuid := gen_random_uuid();
  pinned_record uuid;
  purchase uuid := gen_random_uuid();
  attempt_id uuid := gen_random_uuid();
  handoff record;
  entry record;
  selection record;
  offer record;
  selected_admission jsonb;
  admission_hash text;
  request_hash text;
  sandbox_receipt uuid := gen_random_uuid();
  archived_reading uuid := gen_random_uuid();
  issued_session uuid := gen_random_uuid();
  issued_attempt uuid := gen_random_uuid();
  issue_hash text := repeat('a',64);
  issued_hash text := 'sha256:v1:' || repeat('b',64);
  issued_snapshot jsonb;
  expected_constraint text;
begin
  insert into auth.users(id) values(actor_auth);
  insert into public.subjects(id,kind,auth_user_id,status,created_at,updated_at)
  values(actor,'member',actor_auth,'active',now(),now());
  perform set_config('myeongha.subject_id',actor::text,true);
  insert into public.birth_profiles(id,subject_id,profile_kind,created_at,updated_at)
  values(profile,actor,'self',now(),now());
  insert into public.birth_profile_revisions(
    id,birth_profile_id,subject_id,revision_no,calendar_type,birth_date,time_known,input_hash,created_at
  ) values(first_revision,profile,actor,1,'solar','1992-01-15',false,'fixture-checkout-self',now()),
    (next_revision,profile,actor,2,'solar','1992-01-16',false,'fixture-checkout-new-self',now());
  update public.birth_profiles set current_revision_id=first_revision where id=profile;

  for entry in
    select release.*, approved.counterpart_order
    from commerce_saju_private.approved_fulfillment_release_v1 release
    cross join lateral commerce_saju_private.approved_offer_v1(release.approved_offer_id) approved
  loop
    select * into strict selection from commerce_saju_private.select_approved_saju_checkout_v1(
      actor,entry.approved_offer_id,'checkout-' || entry.approved_offer_id,
      case when entry.counterpart_order is null then null else gen_random_uuid() end
    );
    pinned_record := coalesce(pinned_record,selection.saju_record_id);
    if selection.product_offer_id<>entry.product_offer_id or selection.birth_revision_id<>first_revision
      or selection.saju_record_id<>pinned_record then raise exception 'Catalog selection did not bind the same self Record'; end if;
  end loop;
  if (select count(*) from public.commerce_saju_records_v1 where subject_id=actor)<>1 then
    raise exception 'Catalog selection created duplicate Records';
  end if;

  select release.*, physical.product_id, physical.external_product_id,
    capability.definition_version, capability.definition_hash
    into strict offer
  from commerce_saju_private.approved_fulfillment_release_v1 release
  join public.product_offers physical on physical.id=release.product_offer_id
  join public.product_capability_sets capability on capability.id=release.capability_set_id
  where release.approved_offer_id='career';
  set local role myeongha_api_executor;
  perform 1 from public.begin_member_subject_context_v1(actor_auth);
  select * into strict selection from public.select_approved_saju_checkout_v1(actor,'career','checkout-career',null);
  if selection.saju_record_id<>pinned_record or selection.birth_revision_id<>first_revision then
    raise exception 'API executor selected the wrong checkout scope';
  end if;
  selected_admission := public.resolve_approved_purchase_admission_v1(
    actor,pinned_record,first_revision,offer.product_offer_id,offer.capability_set_id,'career','checkout-career',null
  );
  admission_hash := 'sha256:v1:' || encode(sha256(convert_to(selected_admission::text,'UTF8')),'hex');
  request_hash := 'sha256:v1:' || encode(sha256(convert_to(format(
    '{"approvedAdmissionHash":"%s","birthRevisionId":"%s","productOfferId":"%s","purchaseKind":"original","sajuRecordId":"%s","sourceReceiptIds":[]}',
    admission_hash,first_revision,offer.product_offer_id,pinned_record),'UTF8')),'hex');
  perform 1 from public.create_approved_purchase_intent_v1(actor,purchase,pinned_record,first_revision,
    offer.product_offer_id,'checkout-career',request_hash,
    jsonb_build_object('productOfferId',offer.product_offer_id,'productId',offer.product_id,
      'platform','web','provider','portone_v2','externalProductId',offer.external_product_id),'fixture-offer',
    jsonb_build_object('capabilitySetId',offer.capability_set_id,'definitionVersion',offer.definition_version,
      'definitionHash',offer.definition_hash),'fixture-capability',selected_admission::text,admission_hash);

  select * into strict handoff from public.create_approved_saju_sandbox_attempt_v1(
    actor,attempt_id,purchase,'sandbox','checkout-attempt','checkout-sandbox-request'
  );
  if handoff.payment_attempt_id<>attempt_id or handoff.status<>'created' or handoff.replayed then
    raise exception 'Approved order failed to create its sandbox attempt';
  end if;
  select * into strict handoff from public.read_approved_saju_sandbox_handoff_v1(actor,attempt_id,'career');
  if handoff.expected_amount_minor<>9900 or handoff.expected_currency<>'KRW'
    or handoff.environment<>'sandbox' or handoff.provider_request_id<>'checkout-sandbox-request'
    or handoff.external_product_id is distinct from offer.external_product_id
    or handoff.status<>'handed_off' then
    raise exception 'Sandbox handoff changed the approved payment identity or amount';
  end if;
  if not exists (select 1 from public.qry_approved_saju_sandbox_verification_context_v1(actor,attempt_id)
    where expected_amount_minor=9900 and provider_request_id='checkout-sandbox-request'
      and expected_external_product_id=handoff.external_product_id) then
    raise exception 'Committed sandbox handoff was unavailable to server verification';
  end if;
  if not exists (select 1 from public.read_approved_saju_sandbox_handoff_v1(actor,attempt_id,'career')
    where status='handed_off' and provider_request_id='checkout-sandbox-request'
      and external_product_id=offer.external_product_id) then
    raise exception 'Sandbox handoff replay changed its committed identity';
  end if;
  begin
    perform 1 from public.read_approved_saju_sandbox_handoff_v1(actor,attempt_id,'wealth');
    raise exception 'Sandbox handoff accepted a different same-price offer';
  exception when sqlstate 'P0001' then
    get stacked diagnostics expected_constraint=constraint_name;
    if expected_constraint<>'approved_saju_payment_unavailable' then raise; end if;
  end;
  select * into strict handoff from public.create_approved_saju_sandbox_attempt_v1(
    actor,gen_random_uuid(),purchase,'sandbox','checkout-attempt','checkout-sandbox-request'
  );
  if handoff.payment_attempt_id<>attempt_id or not handoff.replayed then
    raise exception 'Sandbox attempt replay created a different attempt';
  end if;
  begin
    perform 1 from public.create_approved_saju_sandbox_attempt_v1(
      actor,gen_random_uuid(),purchase,'sandbox','checkout-other-attempt','checkout-other-request'
    );
    raise exception 'Sandbox checkout allowed two active attempts';
  exception when unique_violation then
    get stacked diagnostics expected_constraint=constraint_name;
    if expected_constraint<>'cmd_payment_attempt_v1_idempotency_conflict' then raise; end if;
  end;
  begin
    perform 1 from public.create_approved_saju_sandbox_attempt_v1(
      actor,gen_random_uuid(),purchase,'production','checkout-production','checkout-production-request'
    );
    raise exception 'Sandbox checkout allowed a production attempt';
  exception when sqlstate 'P0001' then
    get stacked diagnostics expected_constraint=constraint_name;
    if expected_constraint<>'approved_saju_payment_unavailable' then raise; end if;
  end;
  if exists(select 1 from public.qry_approved_saju_purchase_readings_v1(actor,purchase)) then
    raise exception 'Sandbox checkout opened the paid archive';
  end if;
  begin
    perform 1 from public.read_approved_saju_sandbox_handoff_v1(gen_random_uuid(),attempt_id,'career');
    raise exception 'Runtime handoff accepted a subject outside its bound context';
  exception when insufficient_privilege then
    if sqlerrm <> 'subject execution context mismatch' then raise; end if;
  end;
  reset role;
  begin
    update commerce_saju_private.approved_fulfillment_release_v1 set revoked_at=clock_timestamp()
      where approved_offer_id='career';
    perform 1 from commerce_saju_private.read_approved_saju_sandbox_handoff_v1(actor,attempt_id,'career');
    raise exception 'Revoked approved release still returned a sandbox handoff';
  exception when sqlstate 'P0001' then
    get stacked diagnostics expected_constraint=constraint_name;
    if expected_constraint<>'approved_saju_payment_unavailable' then raise; end if;
  end;

  update public.birth_profiles set current_revision_id=next_revision where id=profile;
  select * into strict selection from commerce_saju_private.select_approved_saju_checkout_v1(
    actor,'career','checkout-career',null
  );
  if selection.saju_record_id<>pinned_record or selection.birth_revision_id<>first_revision then
    raise exception 'Checkout replay changed the purchase Birth revision';
  end if;
  begin
    perform 1 from commerce_saju_private.select_approved_saju_checkout_v1(actor,'month','checkout-career',null);
    raise exception 'Checkout replay allowed a different catalog item';
  exception when unique_violation then
    get stacked diagnostics expected_constraint=constraint_name;
    if expected_constraint<>'approved_saju_replay_conflict' then raise; end if;
  end;
  select * into strict selection from commerce_saju_private.select_approved_saju_checkout_v1(
    actor,'month','checkout-new-month',null
  );
  if selection.saju_record_id=pinned_record or selection.birth_revision_id<>next_revision then
    raise exception 'New checkout did not select the edited self revision';
  end if;

  -- A separate synthetic verified production receipt proves archive ACLs
  -- without allowing a sandbox charge to mint product entitlements.
  perform pg_temp.approved_fixture_receipt(actor,purchase,sandbox_receipt);
  perform pg_temp.approved_fixture_grants(purchase,sandbox_receipt,array['career']);
  if has_function_privilege('myeongha_api_executor',
      'public.qry_approved_saju_issue_scope_v1(uuid,uuid,text)','EXECUTE')
    or has_function_privilege('myeongha_api_executor',
      'public.qry_approved_saju_pair_issue_scope_v1(uuid,uuid)','EXECUTE')
    or has_function_privilege('myeongha_commerce_internal_executor',
      'public.qry_approved_saju_pair_issue_scope_v1(uuid,uuid)','EXECUTE')
    or not has_function_privilege('myeongha_approved_saju_issuer_executor',
      'public.qry_approved_saju_pair_issue_scope_v1(uuid,uuid)','EXECUTE')
    or has_function_privilege('myeongha_approved_saju_issuer_executor',
      'public.cmd_prepare_reading_transport_attempt_v1(uuid,uuid,uuid,text,text,text)','EXECUTE')
    or has_schema_privilege('myeongha_approved_saju_issuer_executor','commerce_saju_private','USAGE') then
    raise exception 'Approved issuance candidate exposed broader functions';
  end if;
  set local role myeongha_approved_saju_issuer_executor;
  perform 1 from public.begin_member_subject_context_v1(actor_auth);
  perform public.assert_myeongha_subject_context_v1(actor);
  if public.qry_approved_saju_issue_scope_v1(actor,purchase,'career')->>'birthRevisionId'
      is distinct from first_revision::text
    or public.qry_approved_saju_issue_scope_v1(gen_random_uuid(),purchase,'career') is not null then
    raise exception 'Dedicated issuer could not resolve the exact paid Birth';
  end if;
  perform 1 from public.prepare_approved_component_reading_v1(actor,purchase,'career',archived_reading,
    issued_session,'test-standard-reader',issue_hash);
  if not exists (select 1 from public.cmd_prepare_approved_saju_attempt_v1(actor,purchase,'career',
      archived_reading,issued_session,issued_attempt,first_revision,issue_hash,'isolated-fixture','saju',null)
    where execution_attempt_id=issued_attempt and attempt_state='running' and not replayed) then
    raise exception 'Dedicated issuer could not prepare the exact source attempt';
  end if;
  if exists (select 1 from public.cmd_prepare_approved_saju_attempt_v1(actor,purchase,'career',
    archived_reading,issued_session,gen_random_uuid(),first_revision,issue_hash,'isolated-fixture','saju',null)) then
    raise exception 'Dedicated issuer prepared a duplicate source attempt';
  end if;
  issued_snapshot := jsonb_build_object('responseVersion','myeonghwa-product-reading-response-v2',
    'state','delivered','reading',jsonb_build_object('readingId',archived_reading));
  begin
    perform 1 from public.cmd_finalize_approved_saju_reading_v1(actor,purchase,'career',archived_reading,issued_attempt,
      gen_random_uuid(),repeat('c',64),'isolated-ref','isolated-approved-v1','isolated-native',
      'fixture-checkout-self',issued_snapshot,issued_hash);
    raise exception 'Dedicated issuer accepted a different source request';
  exception when sqlstate 'P0001' then
    get stacked diagnostics expected_constraint=constraint_name;
    if expected_constraint<>'approved_saju_issuer_current_scope_unavailable' then raise; end if;
  end;
  perform 1 from public.cmd_finalize_approved_saju_reading_v1(actor,purchase,'career',archived_reading,issued_attempt,
    gen_random_uuid(),issue_hash,'isolated-ref','isolated-approved-v1','isolated-native',
    'fixture-checkout-self',issued_snapshot,issued_hash);
  if not exists (select 1 from public.qry_approved_saju_stored_lineage_v1(actor,archived_reading,issued_attempt)
    where stored_response_hash=issued_hash and stored_snapshot=issued_snapshot) then
    raise exception 'Dedicated issuer could not verify committed lineage';
  end if;
  reset role;
  set constraints ct_reading_session_authority,ct_reading_request_authority,ct_reading_finalize_from_reading,
    ct_reading_finalize_from_ref,ct_reading_finalize_from_execution immediate;
  set constraints ct_reading_session_authority,ct_reading_request_authority,ct_reading_finalize_from_reading,
    ct_reading_finalize_from_ref,ct_reading_finalize_from_execution deferred;
  set local role myeongha_api_executor;
  if not exists (select 1 from public.qry_approved_saju_purchase_readings_v1(actor,purchase)
      where reading_id=archived_reading and component='career')
    or not exists (select 1 from public.qry_approved_saju_component_record_v1(actor,archived_reading,null,true)
      where response_snapshot_jsonb is not null)
    or not exists (select 1 from public.qry_approved_saju_reading_history_v1(actor,null,null,null,20)
      where reading_id=archived_reading and approved_component='career'
        and reader_character_ids=array['test-standard-reader'])
    or exists (select 1 from public.qry_reading_history_v3(actor,null,null,null,20)
      where reading_id=archived_reading) then
    raise exception 'Runtime could not reopen the exact archive Reading';
  end if;
  reset role;
  perform pg_temp.approved_fixture_full_cancellation(sandbox_receipt,clock_timestamp());
  set local role myeongha_api_executor;
  if exists(select 1 from public.qry_approved_saju_reading_history_v1(actor,null,null,null,20)
    where reading_id=archived_reading) then
    raise exception 'Cancelled approved Reading remained visible in the archive history';
  end if;
  reset role;
end
$checkout_selection$;

\ir ../../docs/operations/candidates/commerce_approved_saju_sandbox_api_revoke_v1.sql
do $revoked$
begin
  if has_schema_privilege('myeongha_api_executor','commerce_saju_private','USAGE')
    or has_function_privilege('myeongha_api_executor',
      'public.read_approved_saju_sandbox_handoff_v1(uuid,uuid,text)','EXECUTE')
    or has_function_privilege('myeongha_api_executor',
      'public.qry_approved_saju_component_record_v1(uuid,uuid,text,boolean)','EXECUTE')
    or has_function_privilege('myeongha_api_executor',
      'public.qry_approved_saju_sandbox_verification_context_v1(uuid,uuid)','EXECUTE')
    or has_function_privilege('myeongha_api_executor',
      'public.qry_approved_saju_reading_history_v1(uuid,timestamptz,timestamptz,uuid,integer)','EXECUTE') then
    raise exception 'Sandbox API rollback left runtime privileges';
  end if;
  set local role myeongha_api_executor;
  begin
    perform 1 from public.select_approved_saju_checkout_v1(gen_random_uuid(),'career','rolled-back',null);
    raise exception 'Sandbox API could still execute after the rollback';
  exception when insufficient_privilege then
    if sqlerrm <> 'permission denied for function select_approved_saju_checkout_v1' then raise; end if;
  end;
  reset role;
end
$revoked$;
rollback;
select 'PASS_APPROVED_SAJU_PURCHASE_SCOPE_PG17';
