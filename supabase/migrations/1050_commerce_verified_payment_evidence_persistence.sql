-- Atomically persist already server-verified provider payment evidence.
-- No PSP transport authentication, provider API call, entitlement mutation, or
-- Production activation belongs to this migration.

create or replace function public.cmd_persist_verified_payment_evidence_v1(
  p_payment_attempt_id uuid,
  p_owner_purchase_intent_id uuid,
  p_provider text,
  p_platform text,
  p_environment text,
  p_external_transaction_id text,
  p_external_original_transaction_id text,
  p_external_event_id text,
  p_external_product_id text,
  p_current_state text,
  p_evidence_fingerprint text,
  p_verifier_revision text,
  p_verified_amount_minor bigint,
  p_verified_currency text,
  p_verified_at text,
  p_provider_occurred_at text,
  p_provider_ordering_key text,
  p_provider_valid_until text
)
returns table (
  receipt_id uuid,
  provider_event_id uuid,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
#variable_conflict use_column
declare
  v_attempt public.commerce_payment_attempts%rowtype;
  v_intent public.purchase_intents%rowtype;
  v_receipt public.commerce_receipts%rowtype;
  v_event public.commerce_provider_events%rowtype;
  v_snapshot jsonb;
  v_snapshot_key_count integer;
  v_verified_at timestamptz;
  v_provider_occurred_at timestamptz;
  v_event_identity text;
  v_payload jsonb;
  v_now timestamptz;
  v_conflict_id uuid;
begin
  if p_payment_attempt_id is null or p_owner_purchase_intent_id is null then
    raise exception using errcode = '23514',
      constraint = 'cmd_persist_verified_payment_evidence_v1_ids_required',
      message = 'payment-attempt and Purchase Intent identities are required';
  end if;
  if p_provider is null or btrim(p_provider) = '' then
    raise exception using errcode = '23514',
      constraint = 'cmd_persist_verified_payment_evidence_v1_provider_required',
      message = 'verified provider identity is required';
  end if;
  if p_platform not in ('web', 'ios', 'android') then
    raise exception using errcode = '23514',
      constraint = 'cmd_persist_verified_payment_evidence_v1_platform_invalid',
      message = 'verified platform is invalid';
  end if;
  if p_environment not in ('sandbox', 'production') then
    raise exception using errcode = '23514',
      constraint = 'cmd_persist_verified_payment_evidence_v1_environment_invalid',
      message = 'verified environment is invalid';
  end if;
  if p_external_transaction_id is null or btrim(p_external_transaction_id) = '' then
    raise exception using errcode = '23514',
      constraint = 'cmd_persist_verified_payment_evidence_v1_transaction_required',
      message = 'verified provider transaction identity is required';
  end if;
  if p_external_original_transaction_id is not null
     and btrim(p_external_original_transaction_id) = '' then
    raise exception using errcode = '23514',
      constraint = 'cmd_persist_verified_payment_evidence_v1_original_transaction_invalid',
      message = 'verified original transaction identity cannot be blank';
  end if;
  if p_external_event_id is not null and btrim(p_external_event_id) = '' then
    raise exception using errcode = '23514',
      constraint = 'cmd_persist_verified_payment_evidence_v1_event_identity_invalid',
      message = 'verified provider event identity cannot be blank';
  end if;
  if p_external_product_id is null or btrim(p_external_product_id) = '' then
    raise exception using errcode = '23514',
      constraint = 'cmd_persist_verified_payment_evidence_v1_product_required',
      message = 'verified external product identity is required';
  end if;
  if p_current_state is distinct from 'active' then
    raise exception using errcode = '23514',
      constraint = 'cmd_persist_verified_payment_evidence_v1_state_invalid',
      message = 'initial verified-payment persistence accepts active evidence only';
  end if;
  if p_evidence_fingerprint is null
     or p_evidence_fingerprint !~ '^hmac-sha256:k1:[0-9a-f]{64}$' then
    raise exception using errcode = '23514',
      constraint = 'cmd_persist_verified_payment_evidence_v1_fingerprint_invalid',
      message = 'verified evidence fingerprint is invalid';
  end if;
  if p_verifier_revision is null or btrim(p_verifier_revision) = '' then
    raise exception using errcode = '23514',
      constraint = 'cmd_persist_verified_payment_evidence_v1_verifier_required',
      message = 'verified evidence verifier revision is required';
  end if;
  if p_verified_amount_minor is null
     or p_verified_amount_minor <= 0
     or p_verified_amount_minor > 9007199254740991 then
    raise exception using errcode = '23514',
      constraint = 'cmd_persist_verified_payment_evidence_v1_amount_invalid',
      message = 'verified amount must be a positive JavaScript-safe integer';
  end if;
  if p_verified_currency is null or p_verified_currency !~ '^[A-Z]{3}$' then
    raise exception using errcode = '23514',
      constraint = 'cmd_persist_verified_payment_evidence_v1_currency_invalid',
      message = 'verified currency is invalid';
  end if;
  if p_provider_ordering_key is not null and btrim(p_provider_ordering_key) = '' then
    raise exception using errcode = '23514',
      constraint = 'cmd_persist_verified_payment_evidence_v1_ordering_invalid',
      message = 'provider ordering key cannot be blank';
  end if;
  if p_provider_valid_until is not null and btrim(p_provider_valid_until) = '' then
    raise exception using errcode = '23514',
      constraint = 'cmd_persist_verified_payment_evidence_v1_valid_until_invalid',
      message = 'provider valid-until token cannot be blank';
  end if;

  begin
    v_verified_at := p_verified_at::timestamptz;
  exception when others then
    raise exception using errcode = '23514',
      constraint = 'cmd_persist_verified_payment_evidence_v1_verified_at_invalid',
      message = 'verifiedAt must be a canonical UTC millisecond timestamp';
  end;
  if p_verified_at is null
     or pg_catalog.to_char(
       v_verified_at at time zone 'UTC',
       'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
     ) is distinct from p_verified_at then
    raise exception using errcode = '23514',
      constraint = 'cmd_persist_verified_payment_evidence_v1_verified_at_invalid',
      message = 'verifiedAt must be a canonical UTC millisecond timestamp';
  end if;

  if p_provider_occurred_at is not null then
    if btrim(p_provider_occurred_at) = '' then
      raise exception using errcode = '23514',
        constraint = 'cmd_persist_verified_payment_evidence_v1_provider_occurred_at_invalid',
        message = 'provider occurrence time cannot be blank';
    end if;
    begin
      v_provider_occurred_at := p_provider_occurred_at::timestamptz;
    exception when others then
      raise exception using errcode = '23514',
        constraint = 'cmd_persist_verified_payment_evidence_v1_provider_occurred_at_invalid',
        message = 'provider occurrence time cannot be represented by Commerce event authority';
    end;
  end if;

  v_event_identity := coalesce(
    p_external_event_id,
    'myeongha:verified-payment:v1:' || p_evidence_fingerprint
  );

  -- Canonical normalized verification facts only; never provider-native raw payload bytes.
  -- Both fingerprint columns intentionally bind the same VerifiedCommerceEvidenceV2 fact.
  v_payload := pg_catalog.jsonb_build_object(
    'schemaVersion', 'commerce-evidence-v2',
    'provider', p_provider,
    'platform', p_platform,
    'environment', p_environment,
    'externalTransactionId', p_external_transaction_id,
    'externalProductId', p_external_product_id,
    'currentState', p_current_state,
    'ownerBinding', pg_catalog.jsonb_build_object(
      'kind', 'purchase_intent',
      'purchaseIntentId', p_owner_purchase_intent_id::text
    ),
    'evidenceFingerprint', p_evidence_fingerprint,
    'verifierRevision', p_verifier_revision,
    'verifiedAmountMinor', p_verified_amount_minor,
    'verifiedCurrency', p_verified_currency,
    'verifiedAt', p_verified_at
  );
  if p_external_original_transaction_id is not null then
    v_payload := v_payload || pg_catalog.jsonb_build_object(
      'externalOriginalTransactionId', p_external_original_transaction_id
    );
  end if;
  if p_external_event_id is not null then
    v_payload := v_payload || pg_catalog.jsonb_build_object(
      'externalEventId', p_external_event_id
    );
  end if;
  if p_provider_occurred_at is not null then
    v_payload := v_payload || pg_catalog.jsonb_build_object(
      'providerOccurredAt', p_provider_occurred_at
    );
  end if;
  if p_provider_ordering_key is not null then
    v_payload := v_payload || pg_catalog.jsonb_build_object(
      'providerOrderingKey', p_provider_ordering_key
    );
  end if;
  if p_provider_valid_until is not null then
    v_payload := v_payload || pg_catalog.jsonb_build_object(
      'providerValidUntil', p_provider_valid_until
    );
  end if;

  -- No subject is accepted from the caller. Attempt -> Purchase Intent owns lineage.
  select cpa.* into v_attempt
  from public.commerce_payment_attempts cpa
  where cpa.id = p_payment_attempt_id
  for update;
  if not found then
    raise exception using errcode = 'P0001',
      constraint = 'cmd_persist_verified_payment_evidence_v1_attempt_unavailable',
      message = 'verified payment persistence authority is unavailable';
  end if;
  if v_attempt.status not in ('handed_off', 'response_received') then
    raise exception using errcode = 'P0001',
      constraint = 'cmd_persist_verified_payment_evidence_v1_attempt_state_ineligible',
      message = 'payment attempt is not verification-persistence eligible';
  end if;
  if v_attempt.provider is distinct from p_provider
     or v_attempt.environment is distinct from p_environment then
    raise exception using errcode = 'P0001',
      constraint = 'cmd_persist_verified_payment_evidence_v1_attempt_authority_mismatch',
      message = 'verified provider authority does not match the payment attempt';
  end if;
  if v_attempt.provider_transaction_id is not null
     and v_attempt.provider_transaction_id is distinct from p_external_transaction_id then
    raise exception using errcode = '23505',
      constraint = 'cmd_persist_verified_payment_evidence_v1_idempotency_conflict',
      message = 'provider transaction identity conflicts with immutable attempt provenance';
  end if;

  select pi.* into v_intent
  from public.purchase_intents pi
  where pi.id = v_attempt.purchase_intent_id
    and pi.subject_id = v_attempt.subject_id
  for update;
  if not found then
    raise exception using errcode = 'P0001',
      constraint = 'cmd_persist_verified_payment_evidence_v1_intent_unavailable',
      message = 'owner-matched Purchase Intent authority is unavailable';
  end if;
  if p_owner_purchase_intent_id is distinct from v_intent.id
     or v_intent.product_offer_id is distinct from v_attempt.product_offer_id then
    raise exception using errcode = 'P0001',
      constraint = 'cmd_persist_verified_payment_evidence_v1_intent_authority_mismatch',
      message = 'verified evidence Purchase Intent authority does not match the attempt';
  end if;
  if v_intent.status not in ('created', 'pending', 'verified') then
    raise exception using errcode = 'P0001',
      constraint = 'cmd_persist_verified_payment_evidence_v1_intent_state_ineligible',
      message = 'Purchase Intent is not eligible for verified-payment persistence';
  end if;
  if v_intent.expected_amount_minor is null
     or v_intent.expected_currency is null
     or v_intent.charge_terms_version is null
     or btrim(v_intent.charge_terms_version) = '' then
    raise exception using errcode = 'P0001',
      constraint = 'cmd_persist_verified_payment_evidence_v1_charge_authority_unavailable',
      message = 'pinned Purchase Intent charge authority is unavailable';
  end if;
  if v_intent.expected_amount_minor is distinct from p_verified_amount_minor
     or v_intent.expected_currency is distinct from p_verified_currency then
    raise exception using errcode = 'P0001',
      constraint = 'cmd_persist_verified_payment_evidence_v1_charge_authority_mismatch',
      message = 'verified money does not match pinned Purchase Intent charge authority';
  end if;

  v_snapshot := v_intent.offer_snapshot_jsonb;
  if pg_catalog.jsonb_typeof(v_snapshot) is distinct from 'object' then
    raise exception using errcode = 'P0001',
      constraint = 'cmd_persist_verified_payment_evidence_v1_snapshot_unavailable',
      message = 'canonical Purchase Intent offer snapshot is unavailable';
  end if;
  select count(*)::integer into v_snapshot_key_count
  from pg_catalog.jsonb_object_keys(v_snapshot);
  if v_snapshot_key_count <> 5
     or not (v_snapshot ? 'productOfferId')
     or not (v_snapshot ? 'productId')
     or not (v_snapshot ? 'platform')
     or not (v_snapshot ? 'provider')
     or not (v_snapshot ? 'externalProductId')
     or pg_catalog.jsonb_typeof(v_snapshot -> 'productOfferId') is distinct from 'string'
     or pg_catalog.jsonb_typeof(v_snapshot -> 'productId') is distinct from 'string'
     or pg_catalog.jsonb_typeof(v_snapshot -> 'platform') is distinct from 'string'
     or pg_catalog.jsonb_typeof(v_snapshot -> 'provider') is distinct from 'string'
     or pg_catalog.jsonb_typeof(v_snapshot -> 'externalProductId') is distinct from 'string' then
    raise exception using errcode = 'P0001',
      constraint = 'cmd_persist_verified_payment_evidence_v1_snapshot_unavailable',
      message = 'Purchase Intent offer snapshot is not the canonical v2 shape';
  end if;
  if (v_snapshot ->> 'productOfferId') is distinct from v_attempt.product_offer_id::text
     or nullif(btrim(v_snapshot ->> 'productId'), '') is null
     or (v_snapshot ->> 'platform') is distinct from p_platform
     or (v_snapshot ->> 'provider') is distinct from p_provider
     or (v_snapshot ->> 'externalProductId') is distinct from p_external_product_id then
    raise exception using errcode = 'P0001',
      constraint = 'cmd_persist_verified_payment_evidence_v1_product_authority_mismatch',
      message = 'verified product authority does not match the pinned Purchase Intent snapshot';
  end if;

  -- Same canonical fingerprint cannot be rebound to another provider transaction.
  select cr.id into v_conflict_id
  from public.commerce_receipts cr
  where cr.provider = p_provider
    and cr.receipt_fingerprint = p_evidence_fingerprint
    and cr.external_transaction_id is distinct from p_external_transaction_id
  limit 1
  for update;
  if found then
    raise exception using errcode = '23505',
      constraint = 'cmd_persist_verified_payment_evidence_v1_idempotency_conflict',
      message = 'verified evidence fingerprint is already bound to another transaction';
  end if;

  select cr.* into v_receipt
  from public.commerce_receipts cr
  where cr.provider = p_provider
    and cr.external_transaction_id = p_external_transaction_id
  for update;

  select cpe.* into v_event
  from public.commerce_provider_events cpe
  where cpe.provider = p_provider
    and cpe.external_event_id = v_event_identity
  for update;

  if v_receipt.id is not null or v_event.id is not null then
    if v_receipt.id is null or v_event.id is null
       or v_attempt.status is distinct from 'response_received'
       or v_attempt.provider_transaction_id is distinct from p_external_transaction_id
       or v_intent.status is distinct from 'verified'
       or v_receipt.subject_id is distinct from v_attempt.subject_id
       or v_receipt.purchase_intent_id is distinct from v_intent.id
       or v_receipt.provider_account_link_id is distinct from v_intent.provider_account_link_id
       or v_receipt.product_offer_id is distinct from v_attempt.product_offer_id
       or v_receipt.platform is distinct from p_platform
       or v_receipt.provider is distinct from p_provider
       or v_receipt.environment is distinct from p_environment
       or v_receipt.external_original_transaction_id is distinct from p_external_original_transaction_id
       or v_receipt.receipt_fingerprint is distinct from p_evidence_fingerprint
       or v_receipt.verification_status is distinct from 'verified'
       or v_receipt.verified_payload_jsonb is distinct from v_payload
       or v_receipt.verified_at is distinct from v_verified_at
       or v_receipt.verifier_revision is distinct from p_verifier_revision
       or v_receipt.verified_amount_minor is distinct from p_verified_amount_minor
       or v_receipt.verified_currency is distinct from p_verified_currency
       or v_event.event_type is distinct from 'verified_payment'
       or v_event.external_transaction_id is distinct from p_external_transaction_id
       or v_event.external_original_transaction_id is distinct from p_external_original_transaction_id
       or v_event.resolved_subject_id is distinct from v_attempt.subject_id
       or v_event.resolution_source_type is distinct from 'receipt'
       or v_event.resolved_account_link_id is not null
       or v_event.resolved_receipt_id is distinct from v_receipt.id
       or v_event.payload_fingerprint is distinct from p_evidence_fingerprint
       or v_event.provider_occurred_at is distinct from v_provider_occurred_at
       or v_event.provider_ordering_key is distinct from p_provider_ordering_key
       or v_event.verified_payload_jsonb is distinct from v_payload
       or v_event.status not in ('verified', 'processed')
       or v_event.environment is distinct from p_environment
       or v_event.verifier_revision is distinct from p_verifier_revision then
      raise exception using errcode = '23505',
        constraint = 'cmd_persist_verified_payment_evidence_v1_idempotency_conflict',
        message = 'existing Commerce evidence conflicts with verified payment replay';
    end if;
    return query select v_receipt.id, v_event.id, true;
    return;
  end if;

  -- response_received is replay-only here; this command may establish it only while
  -- creating both canonical evidence rows in the same transaction.
  if v_attempt.status = 'response_received' or v_intent.status = 'verified' then
    raise exception using errcode = '23505',
      constraint = 'cmd_persist_verified_payment_evidence_v1_idempotency_conflict',
      message = 'terminal payment provenance has no exact canonical evidence replay';
  end if;

  v_now := pg_catalog.clock_timestamp();

  update public.commerce_payment_attempts
  set provider_transaction_id = p_external_transaction_id,
      status = 'response_received',
      failure_code = null,
      updated_at = greatest(v_now, updated_at)
  where id = v_attempt.id;

  update public.purchase_intents
  set status = 'verified',
      updated_at = greatest(v_now, updated_at)
  where id = v_intent.id;

  insert into public.commerce_receipts(
    id, subject_id, purchase_intent_id, provider_account_link_id, product_offer_id,
    platform, provider, external_transaction_id, external_original_transaction_id,
    receipt_fingerprint, verification_status, verified_payload_jsonb, verified_at,
    created_at, environment, verifier_revision, verified_amount_minor, verified_currency
  ) values (
    pg_catalog.gen_random_uuid(), v_attempt.subject_id, v_intent.id,
    v_intent.provider_account_link_id, v_attempt.product_offer_id, p_platform, p_provider,
    p_external_transaction_id, p_external_original_transaction_id, p_evidence_fingerprint,
    'verified', v_payload, v_verified_at, v_now, p_environment, p_verifier_revision,
    p_verified_amount_minor, p_verified_currency
  ) returning * into v_receipt;

  insert into public.commerce_provider_events(
    id, provider, external_event_id, event_type, external_transaction_id,
    external_original_transaction_id, resolved_subject_id, resolution_source_type,
    resolved_account_link_id, resolved_receipt_id, payload_fingerprint,
    provider_occurred_at, provider_ordering_key, verified_payload_jsonb, status,
    received_at, processed_at, environment, verifier_revision
  ) values (
    pg_catalog.gen_random_uuid(), p_provider, v_event_identity, 'verified_payment',
    p_external_transaction_id, p_external_original_transaction_id, v_attempt.subject_id,
    'receipt', null, v_receipt.id, p_evidence_fingerprint, v_provider_occurred_at,
    p_provider_ordering_key, v_payload, 'verified', v_now, null, p_environment,
    p_verifier_revision
  ) returning * into v_event;

  return query select v_receipt.id, v_event.id, false;
end;
$$;

comment on function public.cmd_persist_verified_payment_evidence_v1(
  uuid, uuid, text, text, text, text, text, text, text, text, text, text,
  bigint, text, text, text, text, text
) is
  'Atomic VerifiedCommerceEvidenceV2 persistence: finalize Payment Attempt provenance and record verified Receipt + receipt-scoped Provider Event. No entitlement effect.';

revoke all on function public.cmd_persist_verified_payment_evidence_v1(
  uuid, uuid, text, text, text, text, text, text, text, text, text, text,
  bigint, text, text, text, text, text
) from public;

DO $$
DECLARE
  v_role text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon','authenticated','service_role','myeongha_api_executor']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = v_role) THEN
      EXECUTE pg_catalog.format(
        'revoke all on function public.cmd_persist_verified_payment_evidence_v1(uuid,uuid,text,text,text,text,text,text,text,text,text,text,bigint,text,text,text,text,text) from %I',
        v_role
      );
    END IF;
  END LOOP;
END
$$;

grant execute on function public.cmd_persist_verified_payment_evidence_v1(
  uuid, uuid, text, text, text, text, text, text, text, text, text, text,
  bigint, text, text, text, text, text
) to myeongha_commerce_internal_executor;
