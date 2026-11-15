-- Isolated candidate. Install after the approved issuer facades. This verifies
-- the paid source under the same Receipt -> Grant lock order as cancellation.
-- It does not grant storage, paid read, decryption, or public disclosure.
create function commerce_saju_private.lock_approved_paid_answer_scope_v1(
  p_subject uuid,p_reading uuid,p_reader text,p_bundle uuid
)
returns table(
  purchase_intent_id uuid,component text,entitlement_grant_id uuid,product_id uuid,
  stored_response_hash text,source_attempt_id uuid,native_source_response_hash text
)
language plpgsql volatile security invoker set search_path=pg_catalog
as $function$
declare
  v_binding commerce_saju_private.approved_component_reading_v1%rowtype;
  v_receipt_id uuid;
begin
  if current_setting('transaction_isolation')<>'read committed' then
    raise exception using errcode='25001',message='Approved Saju paid answer requires READ COMMITTED';
  end if;
  perform public.assert_myeongha_subject_context_v1(p_subject);
  if p_reading is null or p_reader is null or p_bundle is null then return; end if;

  select binding.* into v_binding
  from commerce_saju_private.approved_component_reading_v1 binding
  where binding.reading_id=p_reading and binding.subject_id=p_subject;
  if not found then return; end if;
  select g.source_receipt_id into v_receipt_id
  from public.entitlement_grants g
  where g.id=v_binding.entitlement_grant_id and g.subject_id=p_subject;
  if v_receipt_id is null then return; end if;

  -- The verified full-cancellation command locks the same receipt first.
  perform 1 from public.commerce_receipts receipt
  where receipt.id=v_receipt_id and receipt.subject_id=p_subject
    and receipt.purchase_intent_id=v_binding.purchase_intent_id
    and receipt.verification_status='verified'
    and receipt.provider='portone_v2' and receipt.platform='web' and receipt.environment='production'
  for update of receipt;
  if not found then return; end if;
  perform 1 from public.entitlement_grants g
  where g.id=v_binding.entitlement_grant_id and g.subject_id=p_subject and g.source_receipt_id=v_receipt_id
    and g.grant_source_type='purchase' and g.status='active'
  for update of g;
  if not found then return; end if;

  -- Re-evaluate current rights and exact stored lineage after both locks.
  return query
  select v_binding.purchase_intent_id,v_binding.component,v_binding.entitlement_grant_id,
    entitled.product_id,v_binding.stored_response_hash,proof.execution_attempt_id,
    'sha256:v1:' || (proof.proof_envelope->'payload'->>'responseBodyHash')
  from commerce_saju_private.approved_component_entitlement_v1(
    p_subject,v_binding.purchase_intent_id,v_binding.component
  ) entitled
  join public.entitlement_grants g on g.id=entitled.entitlement_grant_id
    and g.id=v_binding.entitlement_grant_id and g.subject_id=p_subject and g.source_receipt_id=v_receipt_id
    and g.valid_from<=clock_timestamp() and (g.valid_until is null or g.valid_until>clock_timestamp())
  join public.readings reading on reading.id=p_reading and reading.subject_id=p_subject
    and reading.requested_character_id=p_reader and reading.requested_character_content_bundle_id=p_bundle
    and reading.execution_status='succeeded'
  join commerce_saju_private.approved_source_issue_proofs_v1 proof on proof.reading_id=reading.id
    and proof.subject_id=p_subject and proof.execution_attempt_id=reading.committed_execution_attempt_id
  cross join lateral commerce_saju_private.approved_stored_lineage_v1(
    p_subject,p_reading,proof.execution_attempt_id
  ) lineage
  where lineage.product_response_state='delivered'
    and lineage.stored_response_hash=v_binding.stored_response_hash
    and proof.proof_envelope->'payload'->>'requestBodyHash'=v_binding.source_request_hash
    and proof.proof_envelope->'payload'->>'externalRequestRef'=lineage.external_request_ref
    and proof.proof_envelope->'payload'->>'nativeReadingId'=lineage.native_reading_id
    and proof.proof_envelope->'payload'->>'engineVersion'=lineage.saju_engine_version
    and proof.proof_envelope->'payload'->>'releaseRef'=entitled.release_ref
    and proof.proof_envelope->'payload'->>'responseBodyHash' ~ '^[a-f0-9]{64}$'
    and proof.proof_envelope->'payload'->>'readerSourceHash' ~ '^[a-f0-9]{64}$'
    and jsonb_typeof(proof.proof_envelope->'readerSource')='object'
    and commerce_saju_private.approved_issue_scope_v1(
      p_subject,v_binding.purchase_intent_id,v_binding.component
    ) is not null
    and not exists (
      select 1 from public.commerce_provider_events event
      where event.resolved_receipt_id=v_receipt_id and event.resolved_subject_id=p_subject
        and event.provider='portone_v2' and event.environment='production'
        and event.event_type in ('Transaction.Cancelled','Transaction.PartialCancelled')
        and event.status in ('received','verified','processed','unresolved')
    );
end
$function$;

revoke all on function commerce_saju_private.lock_approved_paid_answer_scope_v1(uuid,uuid,text,uuid)
  from public,anon,authenticated,service_role,myeongha_api_executor,myeongha_commerce_internal_executor;
