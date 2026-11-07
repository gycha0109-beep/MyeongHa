-- Exact original Reader refund confirmation from authenticated PortOne V2
-- full-cancel evidence. A revoked Receipt and a matching event ID alone are
-- insufficient to report "refund_confirmed" to its customer.
-- Forward-only replacement of the private 2310 confirmer; no public grant,
-- automatic legal decision, PortOne POST or production DB application.
-- Watchtower-Track: commerce

create or replace function public.internal_confirm_reader_full_refund_dispatch_v1(
  p_id uuid,p_cancellation_id text
) returns boolean
language plpgsql volatile security definer
set search_path=pg_catalog,public
as $reader_refund_confirm_exact_provider$
declare
  v public.commerce_reader_full_refund_dispatches_v1%rowtype;
  v_matching_source_count bigint;
begin
  select * into strict v
  from public.commerce_reader_full_refund_dispatches_v1
  where id=p_id for update;
  if v.status not in ('submitted','confirmed')
     or v.provider_cancellation_id is distinct from p_cancellation_id
     or p_cancellation_id is null or length(p_cancellation_id) not between 1 and 512
     or p_cancellation_id<>pg_catalog.btrim(p_cancellation_id)
  then
    raise exception 'Refund receipt still unconfirmed by verified cancellation'
      using errcode='23514';
  end if;

  -- This is the original 1890 PortOne GET-verified FULL cancellation payload,
  -- not a similarly named source-v2 partial event, webhook notification,
  -- another payment attempt, or an unrelated Receipt's revocation.
  -- Count exactly one original payment attempt to reject ambiguous matches
  -- that may have arisen AFTER the separate refund reservation transaction.
  select count(*) into v_matching_source_count
  from public.commerce_receipts cr
  join public.commerce_provider_events pe
    on pe.resolved_receipt_id=cr.id
   and pe.resolved_subject_id=cr.subject_id
   and pe.resolution_source_type='receipt'
   and pe.provider='portone_v2' and pe.environment='production'
   and pe.event_type='Transaction.Cancelled'
   and pe.status in ('verified','processed')
   and pe.external_event_id=(
     'myeongha:portone-v2:full-cancel:v1:'||p_cancellation_id
   )
   and pe.external_transaction_id=cr.external_transaction_id
   and pe.provider_occurred_at is not null
   and pe.provider_occurred_at<=pg_catalog.clock_timestamp()
   and pe.payload_fingerprint ~ '^hmac-sha256:k1:[0-9a-f]{64}$'
   and pe.verified_payload_jsonb->>'schemaVersion'=
       'portone-full-cancel-verified-v1'
   and pe.verified_payload_jsonb->>'transactionId'=cr.external_transaction_id
   and pe.verified_payload_jsonb->>'cancellationId'=p_cancellation_id
   and pe.verified_payload_jsonb->>'environment'='production'
   and pe.verified_payload_jsonb->>'verifiedAmountMinor'=
       cr.verified_amount_minor::text
   and pe.verified_payload_jsonb->>'verifiedCurrency'=cr.verified_currency
   and pe.verified_payload_jsonb->>'evidenceFingerprint'=
       pe.payload_fingerprint
   and pe.verified_payload_jsonb->>'verifierRevision'=pe.verifier_revision
  where cr.id=v.receipt_id
    and cr.provider='portone_v2' and cr.environment='production'
    and cr.verification_status='revoked'
    and cr.verified_amount_minor>0
    and cr.verified_currency ~ '^[A-Z]{3}$'
    and (
      select count(*)
      from public.commerce_payment_attempts attempt
      where attempt.purchase_intent_id=cr.purchase_intent_id
        and attempt.subject_id=cr.subject_id
        and attempt.product_offer_id=cr.product_offer_id
        and attempt.provider=cr.provider
        and attempt.environment=cr.environment
        and attempt.provider_transaction_id=cr.external_transaction_id
        and attempt.provider_request_id=
            pe.verified_payload_jsonb->>'paymentId'
    )=1;
  if v_matching_source_count<>1 then
    raise exception 'Refund receipt still unconfirmed by verified cancellation'
      using errcode='23514';
  end if;

  update public.commerce_reader_full_refund_dispatches_v1
     set status='confirmed',
         confirmed_at=coalesce(confirmed_at,pg_catalog.clock_timestamp()),
         retained_until=greatest(
           retained_until,pg_catalog.clock_timestamp()+interval '5 years'
         )
  where id=p_id;
  return true;
end;
$reader_refund_confirm_exact_provider$;

-- Preserve the private 2310 dispatch-only command boundary when replacing
-- its function body. No direct customer or ordinary worker EXECUTE.
revoke all on function public.internal_confirm_reader_full_refund_dispatch_v1(
  uuid,text
) from public;
do $reader_refund_confirm_acl$
declare v_role text;
begin
  for v_role in select rolname from pg_catalog.pg_roles
    where rolname in (
      'anon','authenticated','service_role','myeongha_api_executor',
      'myeongha_worker_runtime','myeongha_system_executor',
      'myeongha_seyeon_chat_runtime_owner'
    )
  loop
    execute pg_catalog.format(
      'revoke all on function public.internal_confirm_reader_full_refund_dispatch_v1(uuid,text) from %I',
      v_role
    );
  end loop;
end;
$reader_refund_confirm_acl$;
grant execute on function public.internal_confirm_reader_full_refund_dispatch_v1(
  uuid,text
) to myeongha_commerce_internal_executor;

comment on function public.internal_confirm_reader_full_refund_dispatch_v1(uuid,text)
is 'Only a single exact original PortOne V2 GET-verified full cancellation with matched original payment attempt, Receipt, amount, currency, verifier revision, fingerprint and cancellation ID may confirm an owner-approved private Reader refund. No public caller grant or automatic refund execution.';
