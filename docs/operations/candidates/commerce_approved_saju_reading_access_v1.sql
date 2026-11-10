-- Isolated candidate. Load after the approved checkout and receipt candidates.
-- These functions have no runtime grant. Reading payload and scope remain private.
create function commerce_saju_private.approved_component_entitlement_v1(
  p_subject_id uuid,p_purchase_intent_id uuid,p_component text
)
returns table (
  entitlement_grant_id uuid,product_id uuid,source_birth_revision_id uuid,admission_hash text,
  period_reference text,target_birth_revision_id uuid,release_ref text
)
language sql stable security invoker
set search_path=pg_catalog
as $function$
  select g.id,offer.product_id,origin.birth_revision_id,scope.admission_hash,
    case when p_component in ('year','month') then scope.admission->>'periodReferenceDateTime' end,
    case when p_component='compatibility' then (scope.admission->'counterpart'->>'targetBirthRevisionId')::uuid end,
    component.value->>'releaseRef'
  from public.commerce_saju_purchase_origins_v1 origin
  join commerce_saju_private.approved_purchase_scope_v1 scope
    on scope.purchase_intent_id=origin.purchase_intent_id and scope.admission_hash=origin.approved_admission_hash
  join public.purchase_intents intent on intent.id=origin.purchase_intent_id
    and intent.subject_id=origin.subject_id and intent.status='verified'
  join public.product_offers offer on offer.id=intent.product_offer_id
  join public.subjects owner on owner.id=origin.subject_id and owner.kind='member' and owner.status='active'
    and owner.auth_user_id is not null and owner.merged_into_subject_id is null
  join public.commerce_saju_records_v1 record on record.id=origin.saju_record_id
    and record.subject_id=origin.subject_id and record.birth_revision_id=origin.birth_revision_id
  join public.commerce_receipts receipt on receipt.purchase_intent_id=intent.id
    and receipt.subject_id=origin.subject_id and receipt.product_offer_id=intent.product_offer_id
    and receipt.verification_status='verified' and receipt.environment='production'
    and receipt.provider='portone_v2' and receipt.platform='web'
    and receipt.verified_amount_minor=intent.expected_amount_minor and receipt.verified_currency=intent.expected_currency
  join public.entitlement_grants g on g.subject_id=origin.subject_id and g.source_receipt_id=receipt.id
    and g.entitlement_key=public.internal_commerce_saju_entitlement_key_v1(p_component)
    and g.scope_key=scope.component_scope_keys->>p_component and g.grant_source_type='purchase'
    and g.status='active' and g.valid_from<=statement_timestamp()
    and (g.valid_until is null or g.valid_until>statement_timestamp())
  cross join jsonb_array_elements(scope.admission->'components') component
  where origin.purchase_intent_id=p_purchase_intent_id and origin.subject_id=p_subject_id
    and p_subject_id=public.current_myeongha_subject_id()
    and component.value->>'component'=p_component and component.value->>'authority'='official_fulfillment'
    and not exists (
      select 1 from public.commerce_provider_events event
      where event.resolved_receipt_id=receipt.id and event.resolved_subject_id=receipt.subject_id
        and event.provider=receipt.provider and event.environment=receipt.environment
        and event.event_type='Transaction.Cancelled'
        and event.status in ('received','verified','processed','unresolved')
    )
    and (p_component<>'compatibility' or exists (
      select 1 from commerce_saju_private.comparison_use_approval_v1 approval
      join public.target_person_profiles target on target.id=approval.target_person_id
        and target.subject_id=approval.subject_id and target.deleted_at is null
      join public.birth_profiles birth on birth.id=target.birth_profile_id and birth.subject_id=target.subject_id
        and birth.profile_kind='target' and birth.archived_at is null
        and birth.current_revision_id=approval.target_birth_revision_id
      where approval.subject_id=origin.subject_id and approval.birth_revision_id=origin.birth_revision_id
        and approval.approval_ref=scope.admission->'counterpart'->>'useApprovalRef'
        and approval.target_person_id::text=scope.admission->'counterpart'->>'targetPersonId'
        and approval.target_birth_revision_id::text=scope.admission->'counterpart'->>'targetBirthRevisionId'
        and approval.revoked_at is null and approval.valid_until>statement_timestamp()
    ))
$function$;
revoke all on function commerce_saju_private.approved_component_entitlement_v1(uuid,uuid,text)
  from public,anon,authenticated,service_role,myeongha_api_executor;

-- A package needs one binding per component. Reuse the existing immutable
-- Reading, session, attempt and response without changing legacy single-unit bindings.
create table commerce_saju_private.approved_component_reading_v1 (
  purchase_intent_id uuid not null references commerce_saju_private.approved_purchase_scope_v1(purchase_intent_id)
    on delete cascade,
  component text not null,
  reading_id uuid not null unique,
  subject_id uuid not null,
  entitlement_grant_id uuid not null,
  source_request_hash text not null check (source_request_hash ~ '^[a-f0-9]{64}$'),
  stored_response_hash text not null check (stored_response_hash ~ '^sha256:v1:[a-f0-9]{64}$'),
  primary key (purchase_intent_id,component),
  foreign key (reading_id,subject_id) references public.readings(id,subject_id) on delete cascade
);
alter table commerce_saju_private.approved_component_reading_v1 enable row level security;
revoke all on commerce_saju_private.approved_component_reading_v1 from public,anon,authenticated,service_role;
create trigger approved_component_reading_immutable_v1
before update on commerce_saju_private.approved_component_reading_v1
for each row execute function commerce_saju_private.reject_scope_update_v1();

-- Called only by the issuer after its independent Production signature and
-- exact source-request verification, in the immutable Reading commit transaction.
create function commerce_saju_private.bind_approved_component_reading_v1(
  p_subject_id uuid,p_purchase_intent_id uuid,p_component text,p_reading_id uuid,
  p_source_request_hash text,p_stored_response_hash text
)
returns void
language plpgsql security invoker
set search_path=pg_catalog
as $function$
declare
  v_authority record;
  v_existing commerce_saju_private.approved_component_reading_v1%rowtype;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  -- Serialize binding with a refund or revocation of the exact Grant and
  -- with attempts to bind the same approved component concurrently.
  select grant_row.id into strict v_authority
  from commerce_saju_private.approved_component_entitlement_v1(p_subject_id,p_purchase_intent_id,p_component) entitled
  join public.entitlement_grants grant_row on grant_row.id=entitled.entitlement_grant_id
  for update of grant_row;
  select * into strict v_authority
  from commerce_saju_private.approved_component_entitlement_v1(p_subject_id,p_purchase_intent_id,p_component);
  if not exists (
    select 1 from public.readings reading
    join public.reading_sessions session on session.id=reading.reading_session_id and session.subject_id=reading.subject_id
    join public.reading_refs ref on ref.reading_id=reading.id and ref.subject_id=reading.subject_id
      and ref.execution_attempt_id=reading.committed_execution_attempt_id
    join public.reading_execution_attempts attempt on attempt.id=ref.execution_attempt_id
      and attempt.reading_id=reading.id and attempt.subject_id=reading.subject_id
    join public.birth_profile_revisions source_birth on source_birth.id=session.source_birth_revision_id
      and source_birth.subject_id=reading.subject_id
    left join public.birth_profile_revisions target_birth on target_birth.id=session.target_birth_revision_id
      and target_birth.subject_id=reading.subject_id
    where reading.id=p_reading_id and reading.subject_id=p_subject_id and reading.execution_status='succeeded'
      and reading.completed_at is not null and attempt.state='succeeded'
      and reading.requested_character_id is not null and reading.requested_character_content_bundle_id is not null
      and attempt.resolved_engine_version=ref.saju_engine_version
      and reading.request_contract_version='approved-saju-reading-component-v1'
      and reading.request_snapshot_jsonb->'approvedPurchase' = jsonb_build_object(
        'purchaseIntentId',p_purchase_intent_id,'component',p_component,'admissionHash',v_authority.admission_hash,
        'periodReferenceDateTime',v_authority.period_reference,'targetBirthRevisionId',v_authority.target_birth_revision_id,
        'releaseRef',v_authority.release_ref,'sourceRequestHash',p_source_request_hash
      )
      and session.source_birth_revision_id=v_authority.source_birth_revision_id
      and session.target_birth_revision_id is not distinct from v_authority.target_birth_revision_id
      and ref.source_birth_input_hash=source_birth.input_hash
      and ref.target_birth_input_hash is not distinct from target_birth.input_hash
      and session.saju_domain=case when p_component in ('year','month') then 'general' else p_component end
      and ref.reading_contract_version='myeonghwa-product-reading-response-v2'
      and ref.product_response_state in ('delivered','delivered_with_fallback')
      and ref.response_hash=p_stored_response_hash
      and ref.response_snapshot_jsonb->'reading'->>'readingId'=reading.id::text
      and not exists (select 1 from public.standard_reading_official_bindings legacy where legacy.reading_id=reading.id)
  ) then
    raise exception using errcode='P0001',message='Approved Saju Reading does not match the exact issued scope';
  end if;
  insert into commerce_saju_private.approved_component_reading_v1
    (purchase_intent_id,component,reading_id,subject_id,entitlement_grant_id,source_request_hash,stored_response_hash)
  values(p_purchase_intent_id,p_component,p_reading_id,p_subject_id,v_authority.entitlement_grant_id,
    p_source_request_hash,p_stored_response_hash)
  on conflict (purchase_intent_id,component) do nothing;
  select * into strict v_existing from commerce_saju_private.approved_component_reading_v1
    where purchase_intent_id=p_purchase_intent_id and component=p_component;
  if v_existing.reading_id is distinct from p_reading_id or v_existing.entitlement_grant_id is distinct from v_authority.entitlement_grant_id
    or v_existing.source_request_hash is distinct from p_source_request_hash
    or v_existing.stored_response_hash is distinct from p_stored_response_hash then
    raise exception using errcode='23505',message='Approved Saju Reading binding conflicts with the existing source';
  end if;
end
$function$;
revoke all on function commerce_saju_private.bind_approved_component_reading_v1(uuid,uuid,text,uuid,text,text)
  from public,anon,authenticated,service_role,myeongha_api_executor;

create function public.qry_approved_saju_component_record_v1(
  p_subject_id uuid,p_reading_id uuid,p_reader_character_id text,p_include_payload boolean
)
returns table (
  reading_id uuid,reading_session_id uuid,product_id uuid,saju_domain text,component text,
  source_birth_revision_id uuid,reader_character_id text,reader_content_bundle_id uuid,
  domain_capability_version text,saju_engine_version text,reading_contract_version text,
  product_response_state text,response_snapshot_jsonb jsonb,response_hash text,completed_at timestamptz,
  issued_revision_no integer,current_revision_no integer
)
language plpgsql stable security definer
set search_path=pg_catalog
as $function$
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  return query
  select reading.id,reading.reading_session_id,entitled.product_id,session.saju_domain,binding.component,
    session.source_birth_revision_id,reading.requested_character_id,reading.requested_character_content_bundle_id,
    session.domain_capability_version,ref.saju_engine_version,ref.reading_contract_version,
    ref.product_response_state,case when p_include_payload then ref.response_snapshot_jsonb end,
    ref.response_hash,reading.completed_at,issued.revision_no,current_birth.revision_no
  from commerce_saju_private.approved_component_reading_v1 binding
  cross join lateral commerce_saju_private.approved_component_entitlement_v1(
    binding.subject_id,binding.purchase_intent_id,binding.component
  ) entitled
  join public.readings reading on reading.id=binding.reading_id and reading.subject_id=binding.subject_id
  join public.reading_sessions session on session.id=reading.reading_session_id and session.subject_id=reading.subject_id
  join public.reading_refs ref on ref.reading_id=reading.id and ref.subject_id=reading.subject_id
    and ref.execution_attempt_id=reading.committed_execution_attempt_id
    and ref.response_hash=binding.stored_response_hash
  join public.birth_profile_revisions issued on issued.id=session.source_birth_revision_id
    and issued.subject_id=reading.subject_id
  left join public.birth_profiles current_profile on current_profile.id=issued.birth_profile_id
    and current_profile.subject_id=issued.subject_id and current_profile.archived_at is null
  left join public.birth_profile_revisions current_birth on current_birth.id=current_profile.current_revision_id
    and current_birth.subject_id=current_profile.subject_id
  where binding.subject_id=p_subject_id and binding.reading_id=p_reading_id
    and entitled.entitlement_grant_id=binding.entitlement_grant_id
    and reading.execution_status='succeeded' and reading.completed_at is not null
    and (p_reader_character_id is null or reading.requested_character_id=p_reader_character_id);
end
$function$;
revoke all on function public.qry_approved_saju_component_record_v1(uuid,uuid,text,boolean)
  from public,anon,authenticated,service_role,myeongha_api_executor;
