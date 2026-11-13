-- Candidate only. Install after commerce_approved_saju_issuance_v1.sql.
-- The separately provisioned issuance login receives only the narrow
-- facade role. No membership is assigned to a serving login here.
create role myeongha_approved_saju_issuer_executor nologin noinherit
  nosuperuser nocreatedb nocreaterole noreplication nobypassrls;

create function public.qry_approved_saju_issue_scope_v1(uuid,uuid,text)
returns jsonb
language sql stable security definer set search_path=pg_catalog
as $function$
  select case when $3 in ('career','business','wealth','relationship','year','month')
    then commerce_saju_private.approved_issue_scope_v1($1,$2,$3) end
$function$;

-- Resolve both immutable births only for a current, authorized comparison.
-- The caller repeats the check after its isolated source request.
create function public.qry_approved_saju_pair_issue_scope_v1(p_subject uuid,p_purchase uuid)
returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog
as $function$
declare v_scope jsonb;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject);
  v_scope := commerce_saju_private.approved_issue_scope_v1(p_subject,p_purchase,'compatibility');
  if v_scope is null or not commerce_saju_private.lock_approved_pair_issue_consent_v1(
    p_subject,p_purchase,(v_scope->>'targetBirthRevisionId')::uuid
  ) then return null; end if;
  return v_scope;
end
$function$;

-- Paired requests supply the immutable target revision. The private command
-- checks the exact paid pair and locks its current consent before any write.
create function public.prepare_approved_component_reading_v1(uuid,uuid,text,uuid,uuid,text,text,uuid default null)
returns table(reading_id uuid,session_id uuid)
language plpgsql volatile security definer set search_path=pg_catalog
as $function$
begin
  return query select * from commerce_saju_private.prepare_approved_component_reading_v1($1,$2,$3,$4,$5,$6,$7,$8);
  -- The existing invoker constraint triggers read protected tables.
  -- Run them while the controlled wrapper owns the write, before COMMIT.
  set constraints public.ct_reading_session_authority,public.ct_reading_request_authority,
    public.ct_reading_finalize_from_reading immediate;
  set constraints public.ct_reading_session_authority,public.ct_reading_request_authority,
    public.ct_reading_finalize_from_reading deferred;
end
$function$;

create function public.admit_approved_saju_issue_attempt_v1(uuid,uuid,text,uuid,uuid,uuid,uuid,text,uuid default null)
returns boolean
language sql volatile security definer set search_path=pg_catalog
as $function$
  select case when $6 is null then false
    else commerce_saju_private.admit_approved_issue_attempt_v1($1,$2,$3,$4,$5,$6,$7,$8,$9) end
$function$;

create function public.cmd_prepare_approved_saju_attempt_v1(
  p_subject uuid,p_purchase uuid,p_component text,p_reading uuid,p_session uuid,
  p_attempt uuid,p_birth uuid,p_request_hash text,p_transport text,p_engine text,p_engine_version text,
  p_target_birth uuid default null
)
returns table(execution_attempt_id uuid,execution_attempt_no integer,attempt_state text,replayed boolean)
language plpgsql volatile security definer set search_path=pg_catalog
as $function$
declare prepared record;
begin
  if not commerce_saju_private.admit_approved_issue_attempt_v1(
    p_subject,p_purchase,p_component,p_reading,p_session,null,p_birth,p_request_hash,p_target_birth
  ) then return; end if;
  select * into strict prepared from public.cmd_prepare_reading_transport_attempt_v1(
    p_subject,p_reading,p_attempt,p_transport,p_engine,p_engine_version
  );
  if prepared.replayed then return; end if;
  if not commerce_saju_private.admit_approved_issue_attempt_v1(
    p_subject,p_purchase,p_component,p_reading,p_session,p_attempt,p_birth,p_request_hash,p_target_birth
  ) then
    raise exception using errcode='P0001',constraint='approved_saju_issuer_current_scope_unavailable',
      message='Approved Saju issuance authority changed';
  end if;
  set constraints public.ct_reading_finalize_from_reading immediate;
  set constraints public.ct_reading_finalize_from_reading deferred;
  return query select prepared.execution_attempt_id,prepared.execution_attempt_no,
    prepared.attempt_state,prepared.replayed;
end
$function$;

create function public.cmd_finalize_approved_saju_reading_v1(
  p_subject uuid,p_purchase uuid,p_component text,p_reading uuid,p_attempt uuid,p_event uuid,
  p_request_hash text,p_external_request text,p_engine_version text,p_native_reading text,
  p_birth_hash text,p_snapshot jsonb,p_stored_hash text
)
returns table(reading_id uuid,execution_attempt_id uuid,response_hash text,replayed boolean)
language plpgsql volatile security definer set search_path=pg_catalog
as $function$
declare
  session_row record;
  committed record;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject);
  select session.id,session.source_birth_revision_id into session_row
    from public.readings reading join public.reading_sessions session on session.id=reading.reading_session_id
      and session.subject_id=reading.subject_id
    where reading.id=p_reading and reading.subject_id=p_subject and session.target_birth_revision_id is null;
  if not found or (p_snapshot->'reading'->>'readingId') is distinct from p_reading::text
    or p_snapshot->>'state' is distinct from 'delivered'
    or p_snapshot->>'responseVersion' is distinct from 'myeonghwa-product-reading-response-v2'
    or not commerce_saju_private.admit_approved_issue_attempt_v1(
      p_subject,p_purchase,p_component,p_reading,session_row.id,p_attempt,session_row.source_birth_revision_id,p_request_hash
    ) then
    raise exception using errcode='P0001',constraint='approved_saju_issuer_current_scope_unavailable',
      message='Approved Saju issuance authority changed';
  end if;
  select * into strict committed from public.cmd_finalize_reading_transport_success_v1(
    p_subject,p_reading,p_attempt,p_event,p_external_request,p_engine_version,p_native_reading,
    p_birth_hash,null,'myeonghwa-product-reading-response-v2','delivered',null,null,null,p_snapshot,p_stored_hash
  );
  perform commerce_saju_private.bind_approved_component_reading_v1(
    p_subject,p_purchase,p_component,p_reading,p_request_hash,p_stored_hash
  );
  set constraints public.ct_reading_finalize_from_reading,public.ct_reading_finalize_from_ref,
    public.ct_reading_finalize_from_execution immediate;
  set constraints public.ct_reading_finalize_from_reading,public.ct_reading_finalize_from_ref,
    public.ct_reading_finalize_from_execution deferred;
  return query select committed.reading_id,committed.execution_attempt_id,committed.response_hash,committed.replayed;
end
$function$;

create function public.qry_approved_saju_stored_lineage_v1(uuid,uuid,uuid)
returns table(native_reading_id text,external_request_ref text,source_birth_input_hash text,
  saju_engine_version text,attempt_engine_version text,reading_contract_version text,
  product_response_state text,stored_snapshot jsonb,stored_response_hash text,target_birth_input_hash text)
language sql stable security definer set search_path=pg_catalog
as $function$
  select * from commerce_saju_private.approved_stored_lineage_v1($1,$2,$3)
$function$;

revoke all on function
  public.qry_approved_saju_issue_scope_v1(uuid,uuid,text),
  public.qry_approved_saju_pair_issue_scope_v1(uuid,uuid),
  public.prepare_approved_component_reading_v1(uuid,uuid,text,uuid,uuid,text,text,uuid),
  public.admit_approved_saju_issue_attempt_v1(uuid,uuid,text,uuid,uuid,uuid,uuid,text,uuid),
  public.cmd_prepare_approved_saju_attempt_v1(uuid,uuid,text,uuid,uuid,uuid,uuid,text,text,text,text,uuid),
  public.cmd_finalize_approved_saju_reading_v1(uuid,uuid,text,uuid,uuid,uuid,text,text,text,text,text,jsonb,text),
  public.qry_approved_saju_stored_lineage_v1(uuid,uuid,uuid)
  from public,anon,authenticated,service_role,myeongha_api_executor;

revoke all on function public.qry_approved_saju_pair_issue_scope_v1(uuid,uuid),
  public.prepare_approved_component_reading_v1(uuid,uuid,text,uuid,uuid,text,text,uuid),
  public.admit_approved_saju_issue_attempt_v1(uuid,uuid,text,uuid,uuid,uuid,uuid,text,uuid),
  public.cmd_prepare_approved_saju_attempt_v1(uuid,uuid,text,uuid,uuid,uuid,uuid,text,text,text,text,uuid)
  from myeongha_commerce_internal_executor;

grant execute on function
  public.begin_member_subject_context_v1(uuid),
  public.current_myeongha_subject_id(),
  public.assert_myeongha_subject_context_v1(uuid),
  public.qry_approved_saju_issue_scope_v1(uuid,uuid,text),
  public.qry_approved_saju_pair_issue_scope_v1(uuid,uuid),
  public.prepare_approved_component_reading_v1(uuid,uuid,text,uuid,uuid,text,text,uuid),
  public.admit_approved_saju_issue_attempt_v1(uuid,uuid,text,uuid,uuid,uuid,uuid,text,uuid),
  public.cmd_prepare_approved_saju_attempt_v1(uuid,uuid,text,uuid,uuid,uuid,uuid,text,text,text,text,uuid),
  public.cmd_finalize_approved_saju_reading_v1(uuid,uuid,text,uuid,uuid,uuid,text,text,text,text,text,jsonb,text),
  public.qry_approved_saju_stored_lineage_v1(uuid,uuid,uuid)
  to myeongha_approved_saju_issuer_executor;

-- Preserve the Saju signature in the same transaction as its Reading. The
-- archived signature is evidence of issuance. Paid answer authority is separate.
create table commerce_saju_private.approved_source_issue_proofs_v1 (
  reading_id uuid primary key references commerce_saju_private.approved_component_reading_v1(reading_id)
    on delete cascade,
  execution_attempt_id uuid not null unique,
  subject_id uuid not null,
  proof_envelope jsonb not null,
  accepted_at timestamptz not null,
  foreign key(execution_attempt_id,reading_id,subject_id)
    references public.reading_execution_attempts(id,reading_id,subject_id) on delete cascade
);
revoke all on table commerce_saju_private.approved_source_issue_proofs_v1
  from public,anon,authenticated,service_role,myeongha_api_executor,myeongha_commerce_internal_executor,
    myeongha_approved_saju_issuer_executor;

create function public.cmd_bind_approved_saju_source_issue_proof_v1(
  p_subject uuid,p_purchase uuid,p_component text,p_reading uuid,p_attempt uuid,p_proof jsonb
)
returns boolean
language plpgsql volatile security definer set search_path=pg_catalog
as $function$
declare
  v_payload jsonb := p_proof->'payload';
  v_scope jsonb;
  v_lineage record;
  v_attempt_request_hash text;
  v_now timestamptz := clock_timestamp();
begin
  perform public.assert_myeongha_subject_context_v1(p_subject);
  -- The current signed source contract binds one Birth only.
  if p_component is null or p_component='compatibility'
    or jsonb_typeof(p_proof) is distinct from 'object' or jsonb_typeof(v_payload) is distinct from 'object'
    or p_proof-array['payload','signature','readerSource']<>'{}'::jsonb
    or coalesce(p_proof->>'signature','') !~ '^[a-zA-Z0-9_-]{86}$'
    or octet_length((p_proof-'readerSource')::text)>4096
    or v_payload->>'version' is distinct from 'myeonghwa-production-reading-issue-proof-v1'
    or v_payload->>'executionAttemptId' is distinct from p_attempt::text
    or coalesce(v_payload->>'authorityHash','') !~ '^[0-9a-f]{64}$'
    or coalesce(v_payload->>'responseBodyHash','') !~ '^[0-9a-f]{64}$'
    or (p_proof ? 'readerSource') is distinct from (v_payload ? 'readerSourceHash')
    or ((p_proof ? 'readerSource') and (
      jsonb_typeof(p_proof->'readerSource') is distinct from 'object'
      or octet_length((p_proof->'readerSource')::text)>163840
      or coalesce(v_payload->>'readerSourceHash','') !~ '^[0-9a-f]{64}$'
      or p_proof#>>'{readerSource,grounding,readingRef}' is distinct from v_payload->>'nativeReadingId'
      or p_proof#>>'{readerSource,grounding,engineVersion}' is distinct from v_payload->>'engineVersion'
      or coalesce(p_proof#>>'{readerSource,grounding,sourceSemanticHash}','') !~ '^[0-9a-f]{64}$'
      or p_proof#>>'{readerSource,grounding,sourceSemanticHash}'
        is distinct from p_proof#>>'{readerSource,semanticSource,semanticHash}'
    )) then return false; end if;

  select binding.source_request_hash into v_attempt_request_hash
  from commerce_saju_private.approved_component_reading_v1 binding
  where binding.purchase_intent_id=p_purchase and binding.component=p_component
    and binding.subject_id=p_subject and binding.reading_id=p_reading;
  if not found or v_payload->>'requestBodyHash' is distinct from v_attempt_request_hash then return false; end if;
  v_scope := commerce_saju_private.approved_issue_scope_v1(p_subject,p_purchase,p_component);
  if v_scope is null or v_payload->>'releaseRef' is distinct from v_scope->>'releaseRef' then return false; end if;
  if (p_proof ? 'readerSource') then
    if p_component in ('year','month') then
      if p_proof#>>'{readerSource,temporal,calendar,referenceDateTime}'
          is distinct from v_scope->>'periodReferenceDateTime'
        or p_proof#>>'{readerSource,temporal,calendar,scope}'
          is distinct from (case p_component when 'year' then 'annual' else 'monthly' end)
        or p_proof#>>'{readerSource,temporal,calendar,responseBodyHash}' is distinct from v_payload->>'responseBodyHash'
      then return false; end if;
    elsif p_proof#>'{readerSource,temporal}' is not null then
      return false;
    end if;
  end if;
  select * into v_lineage from commerce_saju_private.approved_stored_lineage_v1(p_subject,p_reading,p_attempt);
  if not found or v_payload->>'externalRequestRef' is distinct from v_lineage.external_request_ref
    or v_payload->>'engineVersion' is distinct from v_lineage.saju_engine_version
    or v_payload->>'nativeReadingId' is distinct from v_lineage.native_reading_id then return false; end if;

  -- An existing immutable receipt can be read back on an exact replay.
  if exists (select 1 from commerce_saju_private.approved_source_issue_proofs_v1 proof where proof.reading_id=p_reading) then
    return exists (select 1 from commerce_saju_private.approved_source_issue_proofs_v1 proof
      where proof.reading_id=p_reading and proof.execution_attempt_id=p_attempt
        and proof.subject_id=p_subject and proof.proof_envelope=p_proof);
  end if;
  if jsonb_typeof(v_payload->'issuedAtMs') is distinct from 'number'
    or coalesce(v_payload->>'issuedAtMs','') !~ '^[0-9]{13}$' then return false; end if;
  if to_timestamp((v_payload->>'issuedAtMs')::bigint/1000.0)
    not between v_now-interval '125 seconds' and v_now+interval '5 seconds' then return false; end if;
  insert into commerce_saju_private.approved_source_issue_proofs_v1(
    reading_id,execution_attempt_id,subject_id,proof_envelope,accepted_at
  ) values(p_reading,p_attempt,p_subject,p_proof,v_now)
  on conflict (reading_id) do nothing;
  return exists (select 1 from commerce_saju_private.approved_source_issue_proofs_v1 proof
    where proof.reading_id=p_reading and proof.execution_attempt_id=p_attempt
      and proof.subject_id=p_subject and proof.proof_envelope=p_proof);
end
$function$;

revoke all on function public.cmd_bind_approved_saju_source_issue_proof_v1(uuid,uuid,text,uuid,uuid,jsonb)
  from public,anon,authenticated,service_role,myeongha_api_executor,myeongha_commerce_internal_executor;
grant execute on function public.cmd_bind_approved_saju_source_issue_proof_v1(uuid,uuid,text,uuid,uuid,jsonb)
  to myeongha_approved_saju_issuer_executor;

create function public.qry_approved_saju_source_issue_proof_v1(p_subject uuid,p_reading uuid)
returns jsonb
language sql stable security definer set search_path=pg_catalog
as $function$
  select jsonb_build_object(
    'proof',proof.proof_envelope,'acceptedAt',proof.accepted_at,
    'executionAttemptId',proof.execution_attempt_id,'sourceRequestHash',binding.source_request_hash,
    'originatingGrantId',binding.entitlement_grant_id,
    'component',binding.component,'periodReferenceDateTime',entitled.period_reference,
    'storedResponseHash',binding.stored_response_hash,'releaseRef',entitled.release_ref,
    'nativeReadingId',lineage.native_reading_id,'externalRequestRef',lineage.external_request_ref,
    'engineVersion',lineage.saju_engine_version
  )
  from commerce_saju_private.approved_source_issue_proofs_v1 proof
  join commerce_saju_private.approved_component_reading_v1 binding
    on binding.reading_id=proof.reading_id and binding.subject_id=proof.subject_id
  cross join lateral commerce_saju_private.approved_component_entitlement_v1(
    binding.subject_id,binding.purchase_intent_id,binding.component
  ) entitled
  cross join lateral commerce_saju_private.approved_stored_lineage_v1(
    proof.subject_id,proof.reading_id,proof.execution_attempt_id
  ) lineage
  where proof.reading_id=p_reading and proof.subject_id=p_subject
    and proof.subject_id=public.current_myeongha_subject_id()
$function$;

revoke all on function public.qry_approved_saju_source_issue_proof_v1(uuid,uuid)
  from public,anon,authenticated,service_role,myeongha_api_executor,myeongha_commerce_internal_executor;
grant execute on function public.qry_approved_saju_source_issue_proof_v1(uuid,uuid)
  to myeongha_approved_saju_issuer_executor;

-- Only the dedicated issuer may claim these exact jobs. A fresh lease ID
-- prevents an expired worker from completing a claim that was taken over.
create function public.cmd_claim_approved_saju_issue_job_v1(p_lease uuid,p_releases jsonb)
returns table(job_id uuid,subject_id uuid,auth_user_id uuid,purchase_intent_id uuid,
  component text,release_ref text,already_issued boolean)
language plpgsql volatile security definer set search_path=pg_catalog
as $function$
declare
  candidate record;
  v_now timestamptz := clock_timestamp();
begin
  if p_lease is null or jsonb_typeof(p_releases) is distinct from 'object' then return; end if;
  select event.id,owner.id as owner_id,owner.auth_user_id as owner_auth_id,
    origin.purchase_intent_id as purchase_id,event.dedupe_key as field,
    event.payload_jsonb->>'releaseRef' as release,
    binding.reading_id is not null as issued
  into candidate
  from public.outbox_events event
  join public.commerce_saju_purchase_origins_v1 origin on origin.purchase_intent_id=case
    when event.aggregate_type='purchase_intent'
      and event.aggregate_id ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'
    then event.aggregate_id::uuid end
  join public.subjects owner on owner.id=origin.subject_id and owner.kind='member'
    and owner.status='active' and owner.merged_into_subject_id is null and owner.auth_user_id is not null
  join public.purchase_intents intent on intent.id=origin.purchase_intent_id
    and intent.subject_id=origin.subject_id and intent.status='verified'
  join commerce_saju_private.approved_purchase_scope_v1 scope
    on scope.purchase_intent_id=origin.purchase_intent_id and scope.admission_hash=origin.approved_admission_hash
  join commerce_saju_private.approved_fulfillment_release_v1 live_release
    on live_release.product_offer_id=intent.product_offer_id and live_release.revoked_at is null
    and live_release.approved_offer_id=scope.admission->>'approvedOfferId'
    and live_release.capability_set_id=intent.capability_set_id
    and live_release.components @> (scope.admission->'components')
    and live_release.components <@ (scope.admission->'components')
    and live_release.components @> jsonb_build_array(jsonb_build_object(
      'component',event.dedupe_key,'authority','official_fulfillment',
      'releaseRef',event.payload_jsonb->>'releaseRef'))
  left join commerce_saju_private.approved_component_reading_v1 binding
    on binding.purchase_intent_id=origin.purchase_intent_id and binding.component=event.dedupe_key
  where event.event_type='approved_saju.reading_requested'
    and event.event_schema_version='approved-saju-reading-request-v1'
    and event.dedupe_key in ('career','business','wealth','relationship','year','month')
    and event.dedupe_key=event.payload_jsonb->>'component'
    and event.payload_jsonb->>'releaseRef'=p_releases->>event.dedupe_key
    and (event.status='pending' and event.available_at<=v_now
      or event.status='processing' and event.lease_expires_at<=v_now)
    and exists (
      select 1 from public.commerce_receipts receipt
      join public.entitlement_grants g on g.subject_id=owner.id and g.source_receipt_id=receipt.id
        and g.entitlement_key=public.internal_commerce_saju_entitlement_key_v1(event.dedupe_key)
        and g.scope_key=scope.component_scope_keys->>event.dedupe_key
      where receipt.purchase_intent_id=intent.id and receipt.subject_id=owner.id
        and receipt.product_offer_id=intent.product_offer_id and receipt.verification_status='verified'
        and receipt.environment='production' and receipt.provider='portone_v2' and receipt.platform='web'
        and receipt.verified_at is not null and receipt.verified_amount_minor=intent.expected_amount_minor
        and receipt.verified_currency=intent.expected_currency
        and g.grant_source_type='purchase' and g.status='active' and g.valid_from<=v_now
        and (g.valid_until is null or g.valid_until>v_now)
        and not exists (
          select 1 from public.commerce_provider_events cancellation
          where cancellation.resolved_receipt_id=receipt.id and cancellation.resolved_subject_id=owner.id
            and cancellation.provider=receipt.provider and cancellation.environment=receipt.environment
            and cancellation.event_type in ('Transaction.Cancelled','Transaction.PartialCancelled')
            and cancellation.status in ('received','verified','processed','unresolved')
        )
    )
    and not exists (
      select 1 from public.readings reading
      join public.reading_execution_attempts attempt on attempt.reading_id=reading.id
        and attempt.subject_id=owner.id and attempt.execution_attempt_no=reading.next_execution_attempt_no-1
      where reading.subject_id=owner.id and reading.request_idempotency_key=
        'approved-saju:' || intent.id::text || ':' || event.dedupe_key
        and attempt.state in ('running','failed_final')
    )
  order by event.available_at,event.id
  limit 1
  for update of event skip locked;
  if not found then return; end if;

  perform public.cmd_claim_outbox_event_v1(candidate.id,p_lease::text,v_now+interval '2 minutes');
  return query select candidate.id,candidate.owner_id,candidate.owner_auth_id,candidate.purchase_id,
    candidate.field,candidate.release,candidate.issued;
end
$function$;

create function public.cmd_complete_approved_saju_issue_job_v1(p_job uuid,p_lease uuid)
returns boolean
language plpgsql volatile security definer set search_path=pg_catalog
as $function$
begin
  if p_job is null or p_lease is null or not exists (
    select 1 from public.outbox_events event
    join commerce_saju_private.approved_component_reading_v1 binding
      on binding.purchase_intent_id::text=event.aggregate_id and binding.component=event.dedupe_key
    where event.id=p_job and event.aggregate_type='purchase_intent'
      and event.event_type='approved_saju.reading_requested'
      and event.event_schema_version='approved-saju-reading-request-v1'
      and event.lock_owner=p_lease::text and event.status='processing'
      and event.lease_expires_at>clock_timestamp()
    for update of event
  ) then return false; end if;
  perform public.cmd_complete_outbox_event_v1(p_job,p_lease::text);
  return true;
end
$function$;

revoke all on function public.cmd_claim_approved_saju_issue_job_v1(uuid,jsonb),
  public.cmd_complete_approved_saju_issue_job_v1(uuid,uuid)
  from public,anon,authenticated,service_role,myeongha_api_executor,myeongha_commerce_internal_executor;
grant execute on function public.cmd_claim_approved_saju_issue_job_v1(uuid,jsonb),
  public.cmd_complete_approved_saju_issue_job_v1(uuid,uuid)
  to myeongha_approved_saju_issuer_executor;
