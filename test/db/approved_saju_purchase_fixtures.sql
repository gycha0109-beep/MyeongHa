-- Synthetic purchase, settlement and cancellation helpers for disposable PostgreSQL.
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
