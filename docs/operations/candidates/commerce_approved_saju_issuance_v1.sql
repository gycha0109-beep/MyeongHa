-- Isolated owner-only candidate. Load after approved Reading access.
-- No source issuer, public route or runtime grant is provisioned here.
create function commerce_saju_private.approved_issue_scope_v1(
  p_subject_id uuid,p_purchase_intent_id uuid,p_component text
)
returns jsonb
language sql stable security invoker
set search_path=pg_catalog
as $function$
  select jsonb_build_object(
    'admissionHash',entitled.admission_hash,'releaseRef',entitled.release_ref,
    'periodReferenceDateTime',entitled.period_reference,
    'birthRevisionId',birth.id,
    'birth',jsonb_build_object('calendarType',birth.calendar_type,'birthDate',to_char(birth.birth_date,'YYYY-MM-DD'),
      'birthTime',to_char(birth.birth_time,'HH24:MI'),'timeKnown',birth.time_known,
      'isLeapMonth',coalesce(birth.is_leap_month,false),'sex',birth.sex)
  )
  from commerce_saju_private.approved_component_entitlement_v1(p_subject_id,p_purchase_intent_id,p_component) entitled
  join public.purchase_intents intent on intent.id=p_purchase_intent_id and intent.subject_id=p_subject_id
  join commerce_saju_private.approved_fulfillment_release_v1 release on release.product_offer_id=intent.product_offer_id
    and release.capability_set_id=intent.capability_set_id and release.revoked_at is null
    and release.components @> jsonb_build_array(jsonb_build_object(
      'component',p_component,'authority','official_fulfillment','releaseRef',entitled.release_ref))
  join public.birth_profile_revisions birth on birth.id=entitled.source_birth_revision_id and birth.subject_id=p_subject_id
  join public.birth_profiles profile on profile.id=birth.birth_profile_id
    and profile.subject_id=p_subject_id and profile.profile_kind='self' and profile.archived_at is null
  -- The existing Production issuer envelope accepts one Birth only.
  where p_component in ('career','business','wealth','relationship','year','month')
    and entitled.target_birth_revision_id is null
$function$;
revoke all on function commerce_saju_private.approved_issue_scope_v1(uuid,uuid,text)
  from public,anon,authenticated,service_role,myeongha_api_executor;

-- The ordinary Reading create command always chooses the profile's current
-- revision. A paid component must retain the immutable revision from checkout.
create function commerce_saju_private.prepare_approved_component_reading_v1(
  p_subject_id uuid,p_purchase_intent_id uuid,p_component text,p_reading_id uuid,
  p_session_id uuid,p_reader_character_id text,p_source_request_hash text
)
returns table (reading_id uuid,session_id uuid)
language plpgsql security invoker
set search_path=pg_catalog
as $function$
declare
  v_scope jsonb;
  v_snapshot jsonb;
  v_key text := 'approved-saju:' || p_purchase_intent_id::text || ':' || p_component;
  v_domain text := case when p_component in ('year','month') then 'general' else p_component end;
  v_reader_bundle uuid;
  v_domain_version text;
  v_existing record;
  v_now timestamptz := clock_timestamp();
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  if coalesce(p_source_request_hash,'') !~ '^[a-f0-9]{64}$' then return; end if;

  -- The exact Grant serializes allocation of this component and its revocation.
  perform 1 from commerce_saju_private.approved_component_entitlement_v1(p_subject_id,p_purchase_intent_id,p_component) entitled
    join public.entitlement_grants grant_row on grant_row.id=entitled.entitlement_grant_id
    for update of grant_row;
  if not found then return; end if;
  v_scope := commerce_saju_private.approved_issue_scope_v1(p_subject_id,p_purchase_intent_id,p_component);
  if v_scope is null then return; end if;
  v_snapshot := jsonb_build_object('approvedPurchase',jsonb_build_object(
    'purchaseIntentId',p_purchase_intent_id,'component',p_component,'admissionHash',v_scope->>'admissionHash',
    'periodReferenceDateTime',v_scope->>'periodReferenceDateTime','targetBirthRevisionId',null,
    'releaseRef',v_scope->>'releaseRef','sourceRequestHash',p_source_request_hash));

  select reading.id,reading.reading_session_id,reading.request_snapshot_jsonb,reading.requested_character_id,
    reading.request_contract_version,session.source_birth_revision_id
    into v_existing
  from public.readings reading
  join public.reading_sessions session on session.id=reading.reading_session_id and session.subject_id=reading.subject_id
  where reading.subject_id=p_subject_id and reading.request_idempotency_key=v_key;
  if found then
    if v_existing.request_contract_version='approved-saju-reading-component-v1'
      and v_existing.request_snapshot_jsonb=v_snapshot
      and v_existing.requested_character_id=p_reader_character_id
      and v_existing.source_birth_revision_id=(v_scope->>'birthRevisionId')::uuid then
      return query select v_existing.id,v_existing.reading_session_id;
    end if;
    return;
  end if;

  select runtime.capability_version into v_domain_version
  from public.saju_domain_runtime runtime
  where runtime.saju_domain=v_domain and runtime.availability<>'unavailable';
  if v_domain_version is null then return; end if;
  select catalog.content_bundle_id into v_reader_bundle
  from public.character_runtime_catalog catalog
  join public.character_capabilities capability using (character_id,content_bundle_id)
  where catalog.character_id=p_reader_character_id and catalog.enabled and catalog.availability='available'
    and catalog.published_at<=v_now
    and (catalog.release_at is null or catalog.release_at<=v_now)
    and (catalog.retire_at is null or catalog.retire_at>v_now)
    and capability.saju_domain=v_domain and capability.can_initiate
  order by catalog.published_at desc,catalog.content_bundle_id
  limit 1;
  if v_reader_bundle is null then return; end if;

  insert into public.reading_sessions(id,subject_id,saju_domain,domain_capability_version,source_birth_revision_id,
    state,next_attempt_no,created_at,updated_at)
  values(p_session_id,p_subject_id,v_domain,v_domain_version,(v_scope->>'birthRevisionId')::uuid,'active',1,v_now,v_now);
  insert into public.readings(id,reading_session_id,subject_id,saju_domain,attempt_no,requested_character_id,
    requested_character_content_bundle_id,execution_status,request_idempotency_key,request_hash,
    request_contract_version,request_snapshot_jsonb,next_execution_attempt_no,created_at)
  values(p_reading_id,p_session_id,p_subject_id,v_domain,1,p_reader_character_id,v_reader_bundle,'pending',v_key,
    'sha256:v1:' || encode(sha256(convert_to(v_snapshot::text,'UTF8')),'hex'),
    'approved-saju-reading-component-v1',v_snapshot,1,v_now);
  update public.reading_sessions session set current_reading_id=p_reading_id,next_attempt_no=2
    where session.id=p_session_id and session.subject_id=p_subject_id;
  return query select p_reading_id,p_session_id;
end
$function$;
revoke all on function commerce_saju_private.prepare_approved_component_reading_v1(uuid,uuid,text,uuid,uuid,text,text)
  from public,anon,authenticated,service_role,myeongha_api_executor;

create function commerce_saju_private.admit_approved_issue_attempt_v1(
  p_subject_id uuid,p_purchase_intent_id uuid,p_component text,p_reading_id uuid,
  p_session_id uuid,p_attempt_id uuid,p_birth_revision_id uuid,p_source_request_hash text
)
returns boolean
language plpgsql security invoker
set search_path=pg_catalog
as $function$
declare
  v_scope jsonb;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  if coalesce(p_source_request_hash,'') !~ '^[a-f0-9]{64}$' then return false; end if;
  perform 1 from commerce_saju_private.approved_component_entitlement_v1(p_subject_id,p_purchase_intent_id,p_component) entitled
    join public.entitlement_grants grant_row on grant_row.id=entitled.entitlement_grant_id
    for update of grant_row;
  if not found then return false; end if;
  v_scope := commerce_saju_private.approved_issue_scope_v1(p_subject_id,p_purchase_intent_id,p_component);
  if v_scope is null or v_scope->>'birthRevisionId' is distinct from p_birth_revision_id::text then return false; end if;
  return exists (
    select 1 from public.readings reading
    join public.reading_sessions session on session.id=reading.reading_session_id and session.subject_id=reading.subject_id
    where reading.id=p_reading_id and reading.subject_id=p_subject_id and reading.reading_session_id=p_session_id
      and reading.execution_status in ('pending','running')
      and case when p_attempt_id is null then not exists (
        select 1 from public.reading_execution_attempts attempt
        where attempt.reading_id=reading.id and attempt.subject_id=reading.subject_id and attempt.state='running'
      ) else reading.execution_status='running' and exists (
        select 1 from public.reading_execution_attempts attempt
        where attempt.reading_id=reading.id and attempt.subject_id=reading.subject_id
          and attempt.id=p_attempt_id and attempt.state='running'
      ) end
      and reading.request_contract_version='approved-saju-reading-component-v1'
      and session.source_birth_revision_id=p_birth_revision_id and session.target_birth_revision_id is null
      and session.saju_domain=case when p_component in ('year','month') then 'general' else p_component end
      and reading.request_snapshot_jsonb->'approvedPurchase'=jsonb_build_object(
        'purchaseIntentId',p_purchase_intent_id,'component',p_component,'admissionHash',v_scope->>'admissionHash',
        'periodReferenceDateTime',v_scope->>'periodReferenceDateTime','targetBirthRevisionId',null,
        'releaseRef',v_scope->>'releaseRef','sourceRequestHash',p_source_request_hash)
  );
end
$function$;
revoke all on function commerce_saju_private.admit_approved_issue_attempt_v1(uuid,uuid,text,uuid,uuid,uuid,uuid,text)
  from public,anon,authenticated,service_role,myeongha_api_executor;

-- Used by the existing immutable commit adapter, after the paid-component
-- binding is written in the same transaction as the transport finalize.
create function commerce_saju_private.approved_stored_lineage_v1(
  p_subject_id uuid,p_reading_id uuid,p_attempt_id uuid
)
returns table (
  native_reading_id text,external_request_ref text,source_birth_input_hash text,
  saju_engine_version text,attempt_engine_version text,reading_contract_version text,
  product_response_state text,stored_snapshot jsonb,stored_response_hash text
)
language sql stable security invoker
set search_path=pg_catalog
as $function$
  select ref.external_reading_ref,attempt.external_request_ref,ref.source_birth_input_hash,
    ref.saju_engine_version,attempt.resolved_engine_version,ref.reading_contract_version,
    ref.product_response_state,ref.response_snapshot_jsonb,ref.response_hash
  from commerce_saju_private.approved_component_reading_v1 binding
  cross join lateral commerce_saju_private.approved_component_entitlement_v1(
    binding.subject_id,binding.purchase_intent_id,binding.component) entitled
  join public.readings reading on reading.id=binding.reading_id and reading.subject_id=binding.subject_id
  join public.reading_refs ref on ref.reading_id=reading.id and ref.subject_id=reading.subject_id
    and ref.execution_attempt_id=reading.committed_execution_attempt_id
  join public.reading_execution_attempts attempt on attempt.id=ref.execution_attempt_id
    and attempt.reading_id=reading.id and attempt.subject_id=reading.subject_id
  where binding.subject_id=p_subject_id and binding.reading_id=p_reading_id and ref.execution_attempt_id=p_attempt_id
    and binding.entitlement_grant_id=entitled.entitlement_grant_id
    and binding.stored_response_hash=ref.response_hash
    and reading.execution_status='succeeded' and attempt.state='succeeded'
$function$;
revoke all on function commerce_saju_private.approved_stored_lineage_v1(uuid,uuid,uuid)
  from public,anon,authenticated,service_role,myeongha_api_executor;
