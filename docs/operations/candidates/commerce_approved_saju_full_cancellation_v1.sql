-- Owner-only candidate. The provider GET and authenticated webhook must verify
-- the full cancellation before calling this command. It never requests a refund.
create function public.internal_apply_approved_saju_full_cancellation_v1(
  p_payment_id text,p_transaction_id text,p_cancellation_id text,p_cancelled_at timestamptz,
  p_verified_amount_minor bigint,p_verified_currency text,p_environment text,
  p_evidence_fingerprint text,p_verifier_revision text
)
returns jsonb
language plpgsql security definer
set search_path=pg_catalog
as $function$
declare
  v_receipt public.commerce_receipts%rowtype;
  v_event public.commerce_provider_events%rowtype;
  v_grant public.entitlement_grants%rowtype;
  v_effect record;
  v_scope_keys jsonb;
  v_event_key text := 'myeongha:portone-v2:full-cancel:v1:' || p_cancellation_id;
  v_now timestamptz := clock_timestamp();
  v_count integer := 0;
  v_all_attributed boolean := true;
begin
  if current_setting('transaction_isolation')<>'read committed'
    or p_environment is distinct from 'production'
    or coalesce(length(p_payment_id),0) not between 1 and 512
    or coalesce(length(p_transaction_id),0) not between 1 and 512
    or coalesce(length(p_cancellation_id),0) not between 1 and 512
    or p_cancelled_at is null or p_cancelled_at>v_now
    or coalesce(p_verified_amount_minor,0)<=0
    or coalesce(p_verified_currency,'') !~ '^[A-Z]{3}$'
    or coalesce(p_evidence_fingerprint,'') !~ '^hmac-sha256:k1:[0-9a-f]{64}$'
    or coalesce(length(btrim(p_verifier_revision)),0) not between 1 and 256 then
    raise exception using errcode='23514', message='Approved Saju full cancellation evidence is invalid';
  end if;

  -- Fulfillment takes this same Receipt lock before issuing any Grant.
  select receipt.* into v_receipt
  from public.commerce_receipts receipt
  join public.commerce_saju_purchase_origins_v1 origin
    on origin.purchase_intent_id=receipt.purchase_intent_id and origin.subject_id=receipt.subject_id
    and origin.approved_admission_hash is not null
  where receipt.provider='portone_v2' and receipt.platform='web' and receipt.environment=p_environment
    and receipt.external_transaction_id=p_transaction_id
    and receipt.verification_status in ('verified','revoked')
  for update of receipt;
  if not found then return jsonb_build_object('disposition','unrelated_commerce'); end if;
  if v_receipt.verified_amount_minor is distinct from p_verified_amount_minor
    or v_receipt.verified_currency is distinct from p_verified_currency
    or not exists (
      select 1 from public.commerce_payment_attempts attempt
      where attempt.purchase_intent_id=v_receipt.purchase_intent_id and attempt.subject_id=v_receipt.subject_id
        and attempt.provider='portone_v2' and attempt.environment=p_environment
        and attempt.product_offer_id=v_receipt.product_offer_id
        and attempt.provider_request_id=p_payment_id and attempt.provider_transaction_id=p_transaction_id
    ) then raise exception using errcode='23514', message='Approved Saju cancellation does not match the original charge'; end if;

  select scope.component_scope_keys into strict v_scope_keys
  from commerce_saju_private.approved_purchase_scope_v1 scope
  join public.commerce_saju_purchase_origins_v1 origin using (purchase_intent_id)
  where scope.purchase_intent_id=v_receipt.purchase_intent_id and scope.admission_hash=origin.approved_admission_hash;

  select * into v_event from public.commerce_provider_events event
  where event.provider='portone_v2' and event.external_event_id=v_event_key;
  if found then
    if v_event.resolved_receipt_id is distinct from v_receipt.id
      or v_event.resolved_subject_id is distinct from v_receipt.subject_id
      or v_event.external_transaction_id is distinct from p_transaction_id
      or v_event.provider_occurred_at is distinct from p_cancelled_at
      or v_event.payload_fingerprint is distinct from p_evidence_fingerprint
      or v_event.event_type is distinct from 'Transaction.Cancelled'
      or v_event.environment is distinct from p_environment
      or v_event.status not in ('verified','processed') then
      raise exception using errcode='23505', message='Approved Saju cancellation replay conflicts with verified evidence';
    end if;
  else
    insert into public.commerce_provider_events(
      id,provider,external_event_id,event_type,external_transaction_id,resolved_subject_id,resolution_source_type,
      resolved_receipt_id,payload_fingerprint,provider_occurred_at,provider_ordering_key,verified_payload_jsonb,
      status,received_at,environment,verifier_revision
    ) values (
      gen_random_uuid(),'portone_v2',v_event_key,'Transaction.Cancelled',p_transaction_id,v_receipt.subject_id,'receipt',
      v_receipt.id,p_evidence_fingerprint,p_cancelled_at,
      'portone-v2-fullcancel:' || to_char(p_cancelled_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      jsonb_build_object('schemaVersion','portone-full-cancel-verified-v1','paymentId',p_payment_id,
        'transactionId',p_transaction_id,'cancellationId',p_cancellation_id,'environment',p_environment,
        'verifiedAmountMinor',p_verified_amount_minor,'verifiedCurrency',p_verified_currency,
        'evidenceFingerprint',p_evidence_fingerprint,'verifierRevision',p_verifier_revision),
      'verified',v_now,p_environment,p_verifier_revision
    ) returning * into v_event;
  end if;

  for v_grant in
    select grant_row.* from public.entitlement_grants grant_row
    where grant_row.source_receipt_id=v_receipt.id and grant_row.subject_id=v_receipt.subject_id
      and grant_row.grant_source_type='purchase'
    order by grant_row.id for update
  loop
    if not exists (
      select 1 from jsonb_each_text(v_scope_keys) component
      where v_grant.entitlement_key=public.internal_commerce_saju_entitlement_key_v1(component.key)
        and v_grant.scope_key=component.value
    ) then raise exception using errcode='23514', message='Approved Saju Receipt Grant is outside its purchase scope'; end if;
    select * into strict v_effect from public.internal_apply_entitlement_effect_v1(
      'provider_event',v_event.id,v_grant.id,null,v_grant.revision,v_grant.last_provider_ordering_key,
      'revoked',p_cancelled_at,'revoked',v_grant.valid_from,v_grant.valid_until,'verified_provider_full_cancellation'
    );
    if v_effect.result_grant_id is distinct from v_grant.id or not exists (
      select 1 from public.entitlement_grants grant_row where grant_row.id=v_grant.id and grant_row.status='revoked'
    ) then raise exception using errcode='23514', message='Approved Saju cancellation did not revoke the exact Grant'; end if;
    v_all_attributed := v_all_attributed and v_effect.result_entitlement_event_id is not null;
    v_count := v_count+1;
  end loop;
  if v_count>0 and v_count<>(select count(*) from jsonb_object_keys(v_scope_keys)) then
    raise exception using errcode='23514', message='Approved Saju cancellation found an incomplete Grant batch';
  end if;
  update public.commerce_receipts set verification_status='revoked'
    where id=v_receipt.id and verification_status='verified';
  update public.commerce_provider_events set status='processed'
    where id=v_event.id and status='verified';
  return jsonb_build_object(
    'disposition',case when v_count=0 then 'cancelled_before_grant'
      when v_all_attributed then 'revoked' else 'cancellation_recorded_unattributed_grants' end,
    'receiptId',v_receipt.id,'providerEventId',v_event.id,'grantCount',v_count
  );
end
$function$;
revoke all on function public.internal_apply_approved_saju_full_cancellation_v1(
  text,text,text,timestamptz,bigint,text,text,text,text
) from public,anon,authenticated,service_role,myeongha_api_executor,myeongha_commerce_internal_executor;
