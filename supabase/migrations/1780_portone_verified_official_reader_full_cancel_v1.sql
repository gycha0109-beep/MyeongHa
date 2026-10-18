-- Official Reader S2: authenticated Commerce verifier -> saved provider event
-- -> all matched Reader purchase rights revoked in one real database transaction.
-- This is a DRAFT code path, not a production activation or provider refund API.
-- Only the existing internal Commerce execution role receives EXECUTE. The
-- ordinary API role, Supabase service_role and paid Reader remain excluded.

create or replace function public.cmd_apply_verified_portone_reader_full_cancellation_v1(
  p_payment_id text,
  p_transaction_id text,
  p_cancellation_id text,
  p_cancelled_at timestamptz,
  p_verified_amount_minor bigint,
  p_verified_currency text,
  p_environment text,
  p_evidence_fingerprint text,
  p_verifier_revision text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=pg_catalog,public
as $portone_reader_cancel_s2$
declare
  v_receipt public.commerce_receipts%rowtype;
  v_event public.commerce_provider_events%rowtype;
  v_scope record;
  v_scope_count integer:=0;
  v_event_key text;
  v_effects jsonb;
  v_now timestamptz:=clock_timestamp();
  v_payload jsonb;
begin
  if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
    raise exception using errcode='25001',
      constraint='official_reader_portone_cancel_read_committed_required',
      message='PortOne cancellation requires READ COMMITTED transaction';
  end if;
  -- Current 1770 is deliberately production-receipt-only. No sandbox-to-
  -- production conversion, no caller-controlled scope, no partial cancellation.
  if p_environment is distinct from 'production'
     or p_payment_id is null or p_payment_id='' or length(p_payment_id)>512
     or p_transaction_id is null or p_transaction_id='' or length(p_transaction_id)>512
     or p_cancellation_id is null or p_cancellation_id='' or length(p_cancellation_id)>512
     or p_cancelled_at is null or p_cancelled_at>v_now
     or p_verified_amount_minor is null or p_verified_amount_minor<=0
     or p_verified_currency is null or p_verified_currency !~ '^[A-Z]{3}$'
     or p_evidence_fingerprint is null
     or p_evidence_fingerprint !~ '^hmac-sha256:k1:[0-9a-f]{64}$'
     or p_verifier_revision is null or btrim(p_verifier_revision)=''
     or length(p_verifier_revision)>256 then
    raise exception using errcode='23514',
      constraint='official_reader_portone_cancel_verified_input_invalid',
      message='PortOne verified full-cancellation evidence is invalid';
  end if;

  -- The live verifier checks the PortOne GET response independently of the
  -- authenticated webhook; this command additionally pins the canonical
  -- receipt, amount, currency, original order and provider transaction.
  -- This preliminary read MUST NOT acquire a Receipt/Grant row lock.
  select cr.* into v_receipt
  from public.commerce_receipts cr
  where cr.provider='portone_v2'
    and cr.environment=p_environment
    and cr.external_transaction_id=p_transaction_id
    and cr.verified_amount_minor=p_verified_amount_minor
    and cr.verified_currency=p_verified_currency
    and cr.verification_status in ('verified','revoked')
    and exists (
      select 1 from public.commerce_payment_attempts a
      where a.purchase_intent_id=cr.purchase_intent_id
        and a.subject_id=cr.subject_id
        and a.provider=cr.provider
        and a.environment=cr.environment
        and a.provider_request_id=p_payment_id
        and a.product_offer_id=cr.product_offer_id
    );
  if not found then
    raise exception using errcode='P0001',
      constraint='official_reader_portone_cancel_receipt_unavailable',
      message='PortOne cancellation is not linked to an original verified Receipt';
  end if;

  -- Do not rely on caller Subject or Reader identifiers; all scopes derive
  -- solely from stored Reader access bindings and the original Receipt.
  perform pg_catalog.set_config('myeongha.subject_id',v_receipt.subject_id::text,true);
  for v_scope in
    select distinct a.subject_id,a.official_reading_id,a.reader_character_id
    from public.entitlement_grants eg
    join public.standard_reading_reader_access_grants a
      on a.entitlement_grant_id=eg.id and a.subject_id=eg.subject_id
    where eg.source_receipt_id=v_receipt.id
      and eg.subject_id=v_receipt.subject_id
      and eg.grant_source_type='purchase'
      and a.official_reading_id is not null
      and a.reader_character_id is not null
    order by a.subject_id,a.official_reading_id,a.reader_character_id
  loop
    perform public.internal_acquire_official_reader_scope_lock_v1(
      v_scope.subject_id,v_scope.official_reading_id,v_scope.reader_character_id
    );
    v_scope_count:=v_scope_count+1;
  end loop;
  if v_scope_count=0 then
    raise exception using errcode='P0001',
      constraint='official_reader_portone_cancel_access_not_yet_bound',
      message='Cannot claim completed Reader cancellation before access binding exists';
  end if;

  -- Re-validate source AFTER locking. 1780 never mutates another Product.
  select cr.* into strict v_receipt
  from public.commerce_receipts cr
  where cr.id=v_receipt.id
    and cr.provider='portone_v2'
    and cr.environment='production'
    and cr.external_transaction_id=p_transaction_id
    and cr.verified_amount_minor=p_verified_amount_minor
    and cr.verified_currency=p_verified_currency
    and cr.verification_status in ('verified','revoked');

  v_event_key:='myeongha:portone-v2:full-cancel:v1:'||p_cancellation_id;
  v_payload:=pg_catalog.jsonb_build_object(
    'schemaVersion','portone-full-cancel-verified-v1',
    'paymentId',p_payment_id,
    'transactionId',p_transaction_id,
    'cancellationId',p_cancellation_id,
    'environment',p_environment,
    'verifiedAmountMinor',p_verified_amount_minor,
    'verifiedCurrency',p_verified_currency,
    'evidenceFingerprint',p_evidence_fingerprint,
    'verifierRevision',p_verifier_revision
  );

  select pe.* into v_event
  from public.commerce_provider_events pe
  where pe.provider='portone_v2' and pe.external_event_id=v_event_key;
  if found then
    if v_event.resolved_receipt_id is distinct from v_receipt.id
       or v_event.resolved_subject_id is distinct from v_receipt.subject_id
       or v_event.external_transaction_id is distinct from p_transaction_id
       or v_event.provider_occurred_at is distinct from p_cancelled_at
       or v_event.payload_fingerprint is distinct from p_evidence_fingerprint
       or v_event.event_type is distinct from 'Transaction.Cancelled'
       or v_event.status not in ('verified','processed') then
      raise exception using errcode='23505',
        constraint='official_reader_portone_cancel_replay_conflict',
        message='PortOne full cancellation replay conflicts with persisted evidence';
    end if;
  else
    insert into public.commerce_provider_events(
      id,provider,external_event_id,event_type,external_transaction_id,
      resolved_subject_id,resolution_source_type,resolved_receipt_id,
      payload_fingerprint,provider_occurred_at,provider_ordering_key,
      verified_payload_jsonb,status,received_at,environment,verifier_revision
    ) values(
      pg_catalog.gen_random_uuid(),'portone_v2',v_event_key,'Transaction.Cancelled',
      p_transaction_id,v_receipt.subject_id,'receipt',v_receipt.id,
      p_evidence_fingerprint,p_cancelled_at,
      'portone-v2-fullcancel:'||pg_catalog.to_char(p_cancelled_at at time zone 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      v_payload,'verified',v_now,'production',p_verifier_revision
    ) returning * into v_event;
  end if;

  -- Existing private 1770 owns the exact Grant/Event/projection/outbox change.
  -- Any error rolls back the new provider event and all entitlement mutations.
  v_effects:=public.internal_dispatch_verified_official_reader_revoke_event_v1(v_event.id);
  update public.commerce_receipts cr
  set verification_status='revoked'
  where cr.id=v_receipt.id and cr.verification_status='verified';

  return pg_catalog.jsonb_build_object(
    'contractVersion','portone-reader-full-cancellation-v1',
    'receiptId',v_receipt.id,
    'providerEventId',v_event.id,
    'revoke',v_effects
  );
end
$portone_reader_cancel_s2$;

revoke all on function public.cmd_apply_verified_portone_reader_full_cancellation_v1(
  text,text,text,timestamptz,bigint,text,text,text,text
) from public;

do $portone_cancel_acl$
declare v_role text;
begin
  for v_role in
    select rolname from pg_catalog.pg_roles
    where rolname in ('anon','authenticated','service_role',
      'myeongha_api_executor','myeongha_seyeon_chat_runtime_owner',
      'myeongha_commerce_internal_executor')
  loop
    execute pg_catalog.format(
      'revoke all on function public.cmd_apply_verified_portone_reader_full_cancellation_v1(text,text,text,timestamptz,bigint,text,text,text,text) from %I',
      v_role
    );
  end loop;
end
$portone_cancel_acl$;

-- Existing trusted Commerce internal API transaction role ONLY. SECURITY DEFINER
-- executes all private 1770/1080 writers without exposing them to that role.
grant execute on function public.cmd_apply_verified_portone_reader_full_cancellation_v1(
  text,text,text,timestamptz,bigint,text,text,text,text
) to myeongha_commerce_internal_executor;

comment on function public.cmd_apply_verified_portone_reader_full_cancellation_v1(
  text,text,text,timestamptz,bigint,text,text,text,text
) is
'Restricted verified PortOne full cancellation -> Receipt revoke + all Reader Grant effects under ordered S1 scope locks. Must be called only after server-side GET payment status/cancellation verification. No refund API or public Reader capability.';
