-- Watchtower-Track: commerce-payment
-- Owner-only verified KCP SANDBOX receipt persistence. A second, independent
-- server attestation HMAC gates the privileged existing Commerce receipt RPC.
-- No Production checkout, no paid credit mint, no direct broad internal grant.
begin;

create schema if not exists commerce_private;
revoke all on schema commerce_private from public,anon,authenticated,service_role;
create table if not exists commerce_private.owner_sandbox_receipt_attestation_v1(
  key_version integer primary key check(key_version=1),
  secret_hex text not null check(secret_hex ~ '^[a-f0-9]{96}$'),
  created_at timestamptz not null default now()
);
revoke all on commerce_private.owner_sandbox_receipt_attestation_v1
  from public,anon,authenticated,service_role,myeongha_api_executor;
alter table commerce_private.owner_sandbox_receipt_attestation_v1 enable row level security;

create or replace function public.cmd_persist_owner_kcp_signed_sandbox_receipt_v1(
  p_subject_id uuid,
  p_payment_attempt_id uuid,
  p_attested_payload_text text,
  p_attestation_hex text
)
returns table(receipt_id uuid,provider_event_id uuid,replayed boolean)
language plpgsql
security definer
set search_path=pg_catalog,public
set row_security=off
as $function$
#variable_conflict use_column
declare
  v_secret text;
  v_mac text;
  v_payload jsonb;
  v_evidence jsonb;
  v_attempt public.commerce_payment_attempts%rowtype;
  v_intent public.purchase_intents%rowtype;
  v_offer public.product_offers%rowtype;
  v_product public.products%rowtype;
  v_purchase_intent_id uuid;
  v_out record;
begin
  if p_subject_id is null or p_payment_attempt_id is null or
     p_attested_payload_text is null or
     pg_catalog.octet_length(p_attested_payload_text)>4096 or
     pg_catalog.octet_length(p_attested_payload_text)<100 or
     p_attestation_hex is null or p_attestation_hex !~ '^[a-f0-9]{64}$' then
    raise exception using errcode='23514',
      constraint='owner_sandbox_receipt_attestation_shape',
      message='Owner sandbox receipt attestation unavailable';
  end if;
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  if not exists(
    select 1 from public.qry_myeongha_owner_admin_access_v1(p_subject_id) a
      where a.is_owner_admin and a.sandbox_checkout_allowed
  ) then
    raise exception using errcode='42501',
      constraint='owner_sandbox_receipt_owner_only',
      message='Owner sandbox receipt authority unavailable';
  end if;

  select secret_hex into v_secret
    from commerce_private.owner_sandbox_receipt_attestation_v1
    where key_version=1;
  if not found or v_secret is null then
    raise exception using errcode='42501',
      constraint='owner_sandbox_receipt_key_not_provisioned',
      message='Owner sandbox attestation key unavailable';
  end if;
  v_mac:=pg_catalog.encode(
    extensions.hmac(p_attested_payload_text,v_secret,'sha256'),'hex'
  );
  if v_mac is distinct from p_attestation_hex then
    raise exception using errcode='42501',
      constraint='owner_sandbox_receipt_mac_mismatch',
      message='Owner sandbox receipt attestation invalid';
  end if;

  begin v_payload:=p_attested_payload_text::jsonb;
  exception when others then
    raise exception using errcode='23514',
      constraint='owner_sandbox_receipt_payload_invalid',
      message='Owner sandbox receipt payload unavailable';
  end;
  if pg_catalog.jsonb_typeof(v_payload) <> 'object' or
     v_payload->>'subjectId' is distinct from p_subject_id::text or
     v_payload->>'paymentAttemptId' is distinct from p_payment_attempt_id::text or
     v_payload->>'schemaVersion' is distinct from 'owner-kcp-sandbox-signed-receipt-v1'
     then
    raise exception using errcode='23514',
      constraint='owner_sandbox_receipt_binding_invalid',
      message='Owner sandbox receipt binding unavailable';
  end if;
  v_evidence:=v_payload->'evidence';
  if pg_catalog.jsonb_typeof(v_evidence) <> 'object' or
     v_evidence->>'schemaVersion' is distinct from 'commerce-evidence-v2' or
     v_evidence->>'provider' is distinct from 'portone_v2' or
     v_evidence->>'platform' is distinct from 'web' or
     v_evidence->>'environment' is distinct from 'sandbox' or
     v_evidence->>'externalProductId' is distinct from 'myeongha-chat-credits-300-v1' or
     v_evidence->>'currentState' is distinct from 'active' or
     v_evidence->>'verifiedCurrency' is distinct from 'KRW' or
     v_evidence->>'verifiedAmountMinor' is distinct from '1900' or
     v_evidence->>'evidenceFingerprint' !~ '^hmac-sha256:k1:[a-f0-9]{64}$' or
     pg_catalog.jsonb_typeof(v_evidence->'ownerBinding') <> 'object' or
     v_evidence->'ownerBinding'->>'kind' is distinct from 'purchase_intent' or
     v_evidence->>'externalTransactionId' is null or
     v_evidence->>'verifierRevision' is null or
     v_evidence->>'verifiedAt' is null then
    raise exception using errcode='23514',
      constraint='owner_sandbox_receipt_psp_evidence_invalid',
      message='Owner sandbox receipt paid evidence unavailable';
  end if;
  if (v_evidence->'ownerBinding'->>'purchaseIntentId')
      !~* '^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$' then
    raise exception using errcode='23514',
      constraint='owner_sandbox_receipt_purchase_intent_invalid',
      message='Owner sandbox receipt Purchase Intent unavailable';
  end if;
  v_purchase_intent_id:=(v_evidence->'ownerBinding'->>'purchaseIntentId')::uuid;

  select * into v_attempt from public.commerce_payment_attempts
    where id=p_payment_attempt_id and subject_id=p_subject_id for update;
  if not found or v_attempt.status not in ('handed_off','response_received') or
     v_attempt.environment<>'sandbox' or v_attempt.provider<>'portone_v2' or
     v_attempt.provider_request_id !~ '^mha_pa_[a-f0-9]{32}$' or
     v_attempt.purchase_intent_id is distinct from v_purchase_intent_id or
     v_attempt.provider_request_id is distinct from v_payload->>'providerRequestId'
     then
    raise exception using errcode='42501',
      constraint='owner_sandbox_receipt_attempt_invalid',
      message='Owner sandbox receipt Attempt unavailable';
  end if;
  select * into v_intent from public.purchase_intents
    where id=v_attempt.purchase_intent_id and subject_id=p_subject_id
      and idempotency_key ~ '^kcp_sbx_[a-f0-9]{32}$'
      and request_hash like 'owner-kcp-sandbox-v1:%'
      and expected_amount_minor=1900 and expected_currency='KRW'
    for update;
  if not found or v_intent.product_offer_id is distinct from v_attempt.product_offer_id then
    raise exception using errcode='42501',
      constraint='owner_sandbox_receipt_intent_invalid',
      message='Owner sandbox receipt Intent unavailable';
  end if;
  select * into v_offer from public.product_offers
    where id=v_intent.product_offer_id and provider='portone_v2'
      and platform='web' and external_product_id='myeongha-chat-credits-300-v1'
      and currency='KRW' and display_price_minor=1900
      and enabled=false and retired_at is null;
  if not found then
    raise exception using errcode='42501',
      constraint='owner_sandbox_receipt_offer_invalid',
      message='Owner sandbox receipt Offer unavailable';
  end if;
  select * into v_product from public.products
    where id=v_offer.product_id and product_key='chat_credits_300_v1'
      and product_type='credit' and enabled=false and retired_at is null;
  if not found then
    raise exception using errcode='42501',
      constraint='owner_sandbox_receipt_disabled_product_required',
      message='Owner sandbox receipt Product unavailable';
  end if;
  if v_intent.offer_snapshot_jsonb is distinct from pg_catalog.jsonb_build_object(
       'productOfferId',v_offer.id::text,
       'productId',v_product.id::text,
       'platform','web','provider','portone_v2',
       'externalProductId','myeongha-chat-credits-300-v1'
     ) then
    raise exception using errcode='42501',
      constraint='owner_sandbox_receipt_offer_snapshot_invalid',
      message='Owner sandbox snapshot mismatch';
  end if;

  select * into v_out from public.cmd_persist_verified_payment_evidence_v1(
    p_payment_attempt_id,v_purchase_intent_id,
    'portone_v2','web','sandbox',
    v_evidence->>'externalTransactionId',
    v_evidence->>'externalOriginalTransactionId',
    v_evidence->>'externalEventId',
    'myeongha-chat-credits-300-v1','active',
    v_evidence->>'evidenceFingerprint',
    v_evidence->>'verifierRevision',
    1900,'KRW',v_evidence->>'verifiedAt',
    v_evidence->>'providerOccurredAt',
    v_evidence->>'providerOrderingKey',
    v_evidence->>'providerValidUntil'
  );
  if not found or v_out.receipt_id is null or
     v_out.provider_event_id is null or
     v_out.replayed is null then
    raise exception using errcode='P0001',
      constraint='owner_sandbox_receipt_persistence_failed',
      message='Owner sandbox verified Receipt was not persisted';
  end if;
  return query select v_out.receipt_id,v_out.provider_event_id,v_out.replayed;
end;
$function$;

revoke all on function public.cmd_persist_owner_kcp_signed_sandbox_receipt_v1(uuid,uuid,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.cmd_persist_owner_kcp_signed_sandbox_receipt_v1(uuid,uuid,text,text)
  to myeongha_api_executor;

commit;
