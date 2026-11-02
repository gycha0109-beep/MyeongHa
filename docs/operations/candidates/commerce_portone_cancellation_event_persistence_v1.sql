-- Commerce P4: operations-only VERIFIED cancellation observation persistence.
-- NON-DEPLOYABLE SQL CANDIDATE. Must NOT enter supabase/migrations until
-- disposable-Postgres17 authority / replay proof and policy-bound order are closed.
-- A verified external status is NOT a refund determination or Grant revocation.
-- No public HTTP, service_role, ordinary API, worker or customer permissions.

create function public.internal_persist_portone_cancellation_event_v1(
 p_provider_payment_id text,
 p_provider_event_id text,
 p_event_type text,
 p_original_transaction_id text,
 p_readback_kind text,
 p_signed_event_hmac text,
 p_readback_shape_hmac text,
 p_cancellation_id_hmac text,
 p_exact_succeeded_amount_minor bigint,
 p_observed_cumulative_cancelled_minor bigint
)
returns table(
 provider_event_id uuid,
 replayed boolean
)
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
#variable_conflict use_column
declare
 v_receipt public.commerce_receipts%rowtype;
 v_event public.commerce_provider_events%rowtype;
 v_payload jsonb;
 v_now timestamptz;
begin
 if p_provider_payment_id is null or (pg_catalog.char_length(p_provider_payment_id) not between 1 and 512 or p_provider_payment_id ~ '[[:cntrl:]]')
   or p_provider_payment_id <> btrim(p_provider_payment_id)
   or p_provider_event_id is null or (pg_catalog.char_length(p_provider_event_id) not between 1 and 512 or p_provider_event_id ~ '[[:cntrl:]]')
   or p_provider_event_id <> btrim(p_provider_event_id)
   or p_original_transaction_id is null or (pg_catalog.char_length(p_original_transaction_id) not between 1 and 512 or p_original_transaction_id ~ '[[:cntrl:]]')
   or p_original_transaction_id <> btrim(p_original_transaction_id) then
  raise exception using errcode='23514',
   constraint='cancellation_event_persist_identity_invalid',
   message='Cancellation evidence identifiers are invalid';
 end if;
 if not (
   (p_event_type='Transaction.Cancelled' and p_readback_kind='full_cancel_shape_observed')
   or (p_event_type='Transaction.PartialCancelled' and p_readback_kind in (
     'partial_cancel_shape_observed','full_cancel_shape_observed'))
 ) then
  raise exception using errcode='23514',
   constraint='cancellation_event_persist_semantics_invalid',
   message='Only a matched final cancellation status shape can be recorded';
 end if;
 if p_signed_event_hmac is null
    or p_signed_event_hmac !~ '^hmac-sha256:k1:[0-9a-f]{64}$'
    or p_readback_shape_hmac is null
    or p_readback_shape_hmac !~ '^hmac-sha256:k1:[0-9a-f]{64}$'
    or p_cancellation_id_hmac is null
    or p_cancellation_id_hmac !~ '^hmac-sha256:k1:[0-9a-f]{64}$' then
  raise exception using errcode='23514',
   constraint='cancellation_event_persist_fingerprint_invalid',
   message='Minimized signed and verified source fingerprints are required';
 end if;
 if p_exact_succeeded_amount_minor is null or p_exact_succeeded_amount_minor<=0
    or p_observed_cumulative_cancelled_minor is null
    or p_observed_cumulative_cancelled_minor<p_exact_succeeded_amount_minor then
  raise exception using errcode='23514',
   constraint='cancellation_event_persist_amount_invalid',
   message='Exact successful cancellation amount invalid';
 end if;

 -- Lock the original verified Reading Receipt, not a caller-supplied Subject.
 -- The exact Payment Attempt + pinned purchase must match verified money
 -- and Reader purchase unit. An unrelated Chat Receipt cannot be used.
 select cr.* into v_receipt
 from public.commerce_payment_attempts pa
 join public.purchase_intents pi
   on pi.id=pa.purchase_intent_id and pi.subject_id=pa.subject_id
   and pi.product_offer_id=pa.product_offer_id and pi.status='verified'
   and pi.expected_amount_minor>0
 join public.product_offers offer on offer.id=pi.product_offer_id
 join public.products product
   on product.id=offer.product_id and product.product_type='reading'
 join public.standard_reading_product_specs spec
   on spec.product_id=product.id
   and spec.purchase_unit_mode='topic_reader_reading'
 join public.purchase_intent_reader_selections selection
   on selection.purchase_intent_id=pi.id
   and selection.product_id=product.id
 join public.commerce_receipts cr
   on cr.purchase_intent_id=pi.id and cr.subject_id=pi.subject_id
   and cr.product_offer_id=pi.product_offer_id
   and cr.provider=pa.provider and cr.environment=pa.environment
   and cr.external_transaction_id=p_original_transaction_id
   and cr.verification_status in ('verified','revoked')
   and cr.verified_at is not null
   and cr.verified_amount_minor=pi.expected_amount_minor
   and cr.verified_currency=pi.expected_currency
 where pa.provider='portone_v2'
   and pa.environment='production'
   and pa.provider_request_id=p_provider_payment_id
   and pa.status='response_received'
   and pa.provider_transaction_id=p_original_transaction_id
 for update of cr;
 if not found then
  raise exception using errcode='P0001',
   constraint='cancellation_event_persist_receipt_unavailable',
   message='Exact production Reading Receipt evidence is unavailable';
 end if;

 -- Final payment state may advance after a prior partial cancellation.
 -- One cancelled item is NOT the total payment cancellation amount.
 if p_observed_cumulative_cancelled_minor>v_receipt.verified_amount_minor
    or (p_readback_kind='full_cancel_shape_observed'
        and p_observed_cumulative_cancelled_minor<>v_receipt.verified_amount_minor)
    or (p_readback_kind='partial_cancel_shape_observed'
        and p_observed_cumulative_cancelled_minor>=v_receipt.verified_amount_minor)
    or (p_event_type='Transaction.PartialCancelled'
        and p_exact_succeeded_amount_minor>=v_receipt.verified_amount_minor) then
  raise exception using errcode='23514',
   constraint='cancellation_event_persist_amount_receipt_conflict',
   message='Cancellation money facts conflict with original Reading Receipt';
 end if;

 v_payload:=pg_catalog.jsonb_build_object(
  'schemaVersion','commerce-portone-cancellation-source-v2',
  'eventType',p_event_type,
  'providerReadbackKindAtFirstObservation',p_readback_kind,
  'cancellationIdHmac',p_cancellation_id_hmac,
  'matchingCancellationStatus','SUCCEEDED',
  'exactSucceededCancellationAmountMinor',p_exact_succeeded_amount_minor,
  'observedCumulativeCancelledAmountMinor',p_observed_cumulative_cancelled_minor,
  'originalReceiptPaidAmountMinor',v_receipt.verified_amount_minor,
  'currency',v_receipt.verified_currency,
  'signedPayloadHmac',p_signed_event_hmac,
  'providerReadbackHmac',p_readback_shape_hmac,
  'orderingProven',false,
  'refundExecutionAuthorized',false,
  'entitlementRevocationAuthorized',false
 );

 -- The Receipt lock serializes legitimate redelivery for the same payment.
 -- No ON CONFLICT UPDATE: mismatched identity/provenance never reparents.
 select e.* into v_event
 from public.commerce_provider_events e
 where e.provider='portone_v2' and e.external_event_id=p_provider_event_id
 for update;

 if found then
  if v_event.event_type is distinct from p_event_type
     or v_event.external_transaction_id is distinct from p_original_transaction_id
     or v_event.external_original_transaction_id is distinct from p_original_transaction_id
     or v_event.resolved_subject_id is distinct from v_receipt.subject_id
     or v_event.resolution_source_type is distinct from 'receipt'
     or v_event.resolved_account_link_id is not null
     or v_event.resolved_receipt_id is distinct from v_receipt.id
     or v_event.payload_fingerprint is distinct from p_signed_event_hmac
     or v_event.provider_occurred_at is not null
     or v_event.provider_ordering_key is not null
     or v_event.verified_payload_jsonb->>'schemaVersion'
          is distinct from 'commerce-portone-cancellation-source-v2'
     or v_event.verified_payload_jsonb->>'eventType' is distinct from p_event_type
     or v_event.verified_payload_jsonb->>'signedPayloadHmac'
          is distinct from p_signed_event_hmac
     or v_event.verified_payload_jsonb->>'providerReadbackHmac'
          is distinct from p_readback_shape_hmac
     or v_event.verified_payload_jsonb->>'cancellationIdHmac'
          is distinct from p_cancellation_id_hmac
     or v_event.verified_payload_jsonb->>'matchingCancellationStatus'
          is distinct from 'SUCCEEDED'
     or v_event.verified_payload_jsonb->>'exactSucceededCancellationAmountMinor'
          is distinct from p_exact_succeeded_amount_minor::text
     or v_event.verified_payload_jsonb->>'originalReceiptPaidAmountMinor'
          is distinct from v_receipt.verified_amount_minor::text
     or v_event.verified_payload_jsonb->>'currency'
          is distinct from v_receipt.verified_currency
     or v_event.verified_payload_jsonb->>'orderingProven' is distinct from 'false'
     or v_event.verified_payload_jsonb->>'refundExecutionAuthorized' is distinct from 'false'
     or v_event.verified_payload_jsonb->>'entitlementRevocationAuthorized' is distinct from 'false'
     or v_event.status not in ('verified','processed')
     or v_event.environment is distinct from 'production'
     or v_event.verifier_revision is distinct from 'portone-cancel-readback-v2' then
   raise exception using errcode='23505',
    constraint='cancellation_event_persist_replay_conflict',
    message='Existing Provider Event does not match immutable cancellation evidence';
  end if;
  -- The immutable exact item stays the same after a later partial cancellation
  -- changes the GET aggregate state. Never mutate the first observation.
  if v_event.verified_payload_jsonb->>'observedCumulativeCancelledAmountMinor' is null
     or v_event.verified_payload_jsonb->>'providerReadbackKindAtFirstObservation' is null
     or (v_event.verified_payload_jsonb->>'observedCumulativeCancelledAmountMinor')
       !~ '^[0-9]+$'
     or (v_event.verified_payload_jsonb->>'observedCumulativeCancelledAmountMinor')::bigint
       > p_observed_cumulative_cancelled_minor
     or not (
       v_event.verified_payload_jsonb->>'providerReadbackKindAtFirstObservation'
         =p_readback_kind
       or (v_event.verified_payload_jsonb->>'providerReadbackKindAtFirstObservation'
         ='partial_cancel_shape_observed'
         and p_readback_kind='full_cancel_shape_observed')
     ) then
   raise exception using errcode='23505',
    constraint='cancellation_event_persist_replay_progress_conflict',
    message='Cancellation replay has inconsistent observed provider progress';
  end if;
  return query select v_event.id,true;
  return;
 end if;

 v_now:=pg_catalog.clock_timestamp();
 insert into public.commerce_provider_events(
  id,provider,external_event_id,event_type,external_transaction_id,
  external_original_transaction_id,resolved_subject_id,resolution_source_type,
  resolved_account_link_id,resolved_receipt_id,payload_fingerprint,
  provider_occurred_at,provider_ordering_key,verified_payload_jsonb,status,
  received_at,processed_at,environment,verifier_revision
 ) values (
  pg_catalog.gen_random_uuid(),'portone_v2',p_provider_event_id,p_event_type,
  p_original_transaction_id,p_original_transaction_id,v_receipt.subject_id,
  'receipt',null,v_receipt.id,p_signed_event_hmac,
  null,null,v_payload,'verified',v_now,null,'production',
  'portone-cancel-readback-v2'
 ) returning * into v_event;

 return query select v_event.id,false;
end;
$$;

comment on function public.internal_persist_portone_cancellation_event_v1(
 text,text,text,text,text,text,text,text,bigint,bigint
) is 'PRIVATE CANDIDATE: matched succeeded cancellation amount, stable replay after later cancellation, no provider ordering/refund/Grant effect.';

revoke all on function public.internal_persist_portone_cancellation_event_v1(
 text,text,text,text,text,text,text,text,bigint,bigint
) from public;
do $$
declare r text;
begin
 for r in
  select rolname from pg_catalog.pg_roles
  where rolname in ('anon','authenticated','service_role','myeongha_api_executor',
    'myeongha_worker_runtime','myeongha_commerce_internal_executor')
 loop
  execute pg_catalog.format(
   'revoke all on function public.internal_persist_portone_cancellation_event_v1(text,text,text,text,text,text,text,text,bigint,bigint) from %I',r
  );
 end loop;
end;
$$;
