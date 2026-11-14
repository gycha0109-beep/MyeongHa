-- Candidate only. Load after commerce_approved_saju_issuer_facades_v1.sql.
-- A separate two-chart issuer transaction. No Production migration/activation.
-- The existing one-chart finalizer and compatibility exclusion remain unchanged.
create function public.cmd_finalize_approved_saju_pair_reading_v1(
  p_subject uuid,p_purchase uuid,p_reading uuid,p_attempt uuid,p_event uuid,
  p_request_hash text,p_external_request text,p_engine_version text,
  p_self_birth_hash text,p_target_birth_hash text,p_snapshot jsonb,
  p_stored_hash text,p_signed_pair jsonb
)
returns table(reading_id uuid,execution_attempt_id uuid,response_hash text,replayed boolean)
language plpgsql volatile security definer set search_path=pg_catalog
as $function$
declare
  v_scope jsonb;
  v_payload jsonb := p_signed_pair->'payload';
  v_body jsonb := p_signed_pair->'sourceBody';
  v_reading_session record;
  v_committed record;
  v_now timestamptz := clock_timestamp();
  v_lines integer;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject);
  if p_request_hash !~ '^[a-f0-9]{64}$'
     or p_stored_hash !~ '^sha256:v1:[a-f0-9]{64}$'
     or jsonb_typeof(p_signed_pair) is distinct from 'object'
     or p_signed_pair-array['payload','signature','sourceBody'] <> '{}'::jsonb
     or jsonb_typeof(v_payload) is distinct from 'object'
     or jsonb_typeof(v_body) is distinct from 'object'
     or coalesce(p_signed_pair->>'signature','') !~ '^[A-Za-z0-9_-]{86}$'
     or v_payload->>'version' is distinct from 'myeongha-t10-production-pair-issue-v1'
     or v_body->>'version' is distinct from 'saju-t10-official-pair-reading-v1'
     or v_body->>'state' is distinct from 'issued'
     or v_body->>'readingDomain' is distinct from 'compatibility'
     or v_body->>'policyId' is distinct from 'myeongha-t10-internal-relational-explanation-v1'
     or v_body->>'policyVersion' is distinct from '2026-11-13'
     or v_payload->>'executionAttemptId' is distinct from p_attempt::text
     or v_payload->>'purchaseIntentId' is distinct from p_purchase::text
     or v_payload->>'readingId' is distinct from p_reading::text
     or v_body->>'readingId' is distinct from p_reading::text
     or v_payload->>'sourceRequestHash' is distinct from p_request_hash
     or v_payload->>'engineVersion' is distinct from p_engine_version
     or v_payload->>'sourceBirthInputHash' is distinct from p_self_birth_hash
     or v_payload->>'targetBirthInputHash' is distinct from p_target_birth_hash
     or v_payload->>'materialHash' is distinct from v_body->>'materialHash'
     or coalesce(v_payload->>'responseBodyHash','') !~ '^[0-9a-f]{64}$'
     or jsonb_typeof(v_body->'charts') is distinct from 'array'
     or jsonb_array_length(v_body->'charts') <> 2
     or jsonb_typeof(v_body->'chartDisplays') is distinct from 'array'
     or jsonb_array_length(v_body->'chartDisplays') <> 2
     or v_body#>>'{charts,0,role}' is distinct from 'self'
     or v_body#>>'{charts,1,role}' is distinct from 'partner'
     or v_body#>>'{chartDisplays,0,role}' is distinct from 'self'
     or v_body#>>'{chartDisplays,1,role}' is distinct from 'partner'
     or jsonb_typeof(v_body->'units') is distinct from 'array'
     or jsonb_array_length(v_body->'units') not between 3 and 7
     or p_snapshot->>'responseVersion' is distinct from 'myeonghwa-product-reading-response-v2'
     or p_snapshot->>'state' is distinct from 'delivered'
     or p_snapshot->>'messageCode' is distinct from 'READING_DELIVERED'
     or p_snapshot->>'requiredAction' is distinct from 'none'
     or p_snapshot#>>'{reading,readingId}' is distinct from p_reading::text
     or jsonb_typeof(p_snapshot#>'{reading,sections}') is distinct from 'array'
     or jsonb_array_length(p_snapshot#>'{reading,sections}') <> 2
     or p_snapshot#>>'{reading,sections,1,sectionType}' is distinct from 'compatibility'
     or jsonb_typeof(p_snapshot#>'{reading,sections,1,blocks}') is distinct from 'array'
     or jsonb_array_length(p_snapshot#>'{reading,sections,1,blocks}')
        is distinct from jsonb_array_length(v_body->'units')
     or jsonb_typeof(v_payload->'issuedAtMs') is distinct from 'number'
     or coalesce(v_payload->>'issuedAtMs','') !~ '^[0-9]{13}$'
  then
    raise exception using errcode='P0001',constraint='approved_saju_pair_source_unverified',
      message='Approved Saju pair source did not match the verified issued Reading';
  end if;

  if to_timestamp((v_payload->>'issuedAtMs')::bigint/1000.0)
       not between v_now-interval '125 seconds' and v_now+interval '5 seconds' then
    raise exception using errcode='P0001',constraint='approved_saju_pair_source_expired',
      message='Approved Saju pair issue signature is outside the acceptance window';
  end if;
  -- Exact Korean copy must be stored unchanged, in the source-owned order.
  select count(*) into v_lines
  from jsonb_array_elements(p_snapshot#>'{reading,sections,1,blocks}') with ordinality as b(content,position)
  join jsonb_array_elements(v_body->'units') with ordinality as u(content,position)
    on b.position=u.position
  where b.content->>'type'='paragraph' and b.content->>'text'=u.content->>'paragraph';
  if v_lines is distinct from jsonb_array_length(v_body->'units') then
    raise exception using errcode='P0001',constraint='approved_saju_pair_text_modified',
      message='Approved Saju pair Reading text differs from the signed source';
  end if;

  v_scope := public.qry_approved_saju_pair_issue_scope_v1(p_subject,p_purchase);
  select session.id,session.source_birth_revision_id,session.target_birth_revision_id
    into v_reading_session
  from public.readings reading
  join public.reading_sessions session on session.id=reading.reading_session_id
    and session.subject_id=reading.subject_id
  where reading.id=p_reading and reading.subject_id=p_subject
    and session.target_birth_revision_id is not null;

  if v_scope is null or not found
    or v_payload->>'offerId' is distinct from v_scope->>'approvedOfferId'
    or v_payload->>'counterpartOrder' is distinct from v_scope->>'counterpartOrder'
    or v_payload->>'targetPersonId' is distinct from v_scope->>'targetPersonId'
    or v_payload->>'useApprovalRef' is distinct from v_scope->>'useApprovalRef'
    or v_payload->>'admissionHash' is distinct from v_scope->>'admissionHash'
    or v_payload->>'birthRevisionId' is distinct from v_scope->>'birthRevisionId'
    or v_payload->>'targetBirthRevisionId' is distinct from v_scope->>'targetBirthRevisionId'
    or v_body#>>'{charts,0,birthRevisionId}' is distinct from v_scope->>'birthRevisionId'
    or v_body#>>'{charts,1,birthRevisionId}' is distinct from v_scope->>'targetBirthRevisionId'
    or v_body#>>'{charts,0,birthInputHash}' is distinct from v_scope->>'sourceBirthInputHash'
    or v_body#>>'{charts,1,birthInputHash}' is distinct from v_scope->>'targetBirthInputHash'
    or v_payload->>'releaseRef' is distinct from v_scope->>'releaseRef'
    or v_scope->>'sourceBirthInputHash' is distinct from p_self_birth_hash
    or v_scope->>'targetBirthInputHash' is distinct from p_target_birth_hash
    or v_reading_session.source_birth_revision_id::text is distinct from v_scope->>'birthRevisionId'
    or v_reading_session.target_birth_revision_id::text is distinct from v_scope->>'targetBirthRevisionId'
    or not commerce_saju_private.admit_approved_issue_attempt_v1(
      p_subject,p_purchase,'compatibility',p_reading,v_reading_session.id,
      p_attempt,v_reading_session.source_birth_revision_id,p_request_hash,
      v_reading_session.target_birth_revision_id
    )
  then
    raise exception using errcode='P0001',constraint='approved_saju_pair_current_authority_unavailable',
      message='Approved Saju pair purchase or consent changed before commit';
  end if;

  select * into strict v_committed from public.cmd_finalize_reading_transport_success_v1(
    p_subject,p_reading,p_attempt,p_event,p_external_request,p_engine_version,
    p_reading::text,p_self_birth_hash,p_target_birth_hash,
    'myeonghwa-product-reading-response-v2','delivered',null,null,null,
    p_snapshot,p_stored_hash
  );
  perform commerce_saju_private.bind_approved_component_reading_v1(
    p_subject,p_purchase,'compatibility',p_reading,p_request_hash,p_stored_hash
  );

  -- The signed source and immutable customer Reading commit atomically.
  insert into commerce_saju_private.approved_source_issue_proofs_v1(
    reading_id,execution_attempt_id,subject_id,proof_envelope,accepted_at
  ) values(p_reading,p_attempt,p_subject,p_signed_pair,v_now)
  on conflict(reading_id) do nothing;

  if not exists (
    select 1 from commerce_saju_private.approved_source_issue_proofs_v1 proof
    where proof.reading_id=p_reading and proof.execution_attempt_id=p_attempt
      and proof.subject_id=p_subject and proof.proof_envelope=p_signed_pair
  ) then
    raise exception using errcode='23505',constraint='approved_saju_pair_immutable_proof_replay',
      message='Approved Saju pair Reading already has a different source proof';
  end if;
  set constraints public.ct_reading_finalize_from_reading,public.ct_reading_finalize_from_ref,
    public.ct_reading_finalize_from_execution immediate;
  set constraints public.ct_reading_finalize_from_reading,public.ct_reading_finalize_from_ref,
    public.ct_reading_finalize_from_execution deferred;
  return query select v_committed.reading_id,v_committed.execution_attempt_id,
    v_committed.response_hash,v_committed.replayed;
end
$function$;

revoke all on function public.cmd_finalize_approved_saju_pair_reading_v1(
  uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,jsonb,text,jsonb
) from public,anon,authenticated,service_role,myeongha_api_executor,
  myeongha_commerce_internal_executor;
grant execute on function public.cmd_finalize_approved_saju_pair_reading_v1(
  uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,jsonb,text,jsonb
) to myeongha_approved_saju_issuer_executor;
