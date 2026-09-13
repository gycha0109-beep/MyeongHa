-- Subject-bound composition of provider-neutral Commerce payment verification context.
--
-- This query exposes only persisted authority already pinned by Purchase Intent v2 and
-- Payment Attempt. It performs no provider I/O and creates no Receipt, Provider Event,
-- Entitlement Grant/Event, or effective Entitlement.
--
-- Webhook/reconciliation callers intentionally remain out of scope: this function
-- requires the ordinary MyeongHa transaction subject context and MUST NOT be widened
-- into a subjectless worker surface without a separately governed execution identity.

create or replace function public.qry_commerce_payment_verification_context_v1(
  p_subject_id uuid,
  p_payment_attempt_id uuid
)
returns table (
  payment_attempt_id uuid,
  purchase_intent_id uuid,
  provider text,
  platform text,
  environment text,
  provider_request_id text,
  expected_provider_transaction_id text,
  expected_external_product_id text,
  expected_amount_minor bigint,
  expected_currency text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_payment_attempt_id uuid;
  v_purchase_intent_id uuid;
  v_attempt_offer_id uuid;
  v_intent_offer_id uuid;
  v_provider text;
  v_platform text;
  v_environment text;
  v_provider_request_id text;
  v_provider_transaction_id text;
  v_attempt_status text;
  v_offer_snapshot jsonb;
  v_snapshot_offer_id text;
  v_snapshot_product_id text;
  v_snapshot_provider text;
  v_snapshot_external_product_id text;
  v_expected_amount_minor bigint;
  v_expected_currency text;
  v_charge_terms_version text;
begin
  if p_subject_id is null or p_payment_attempt_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'qry_commerce_payment_verification_context_ids_required',
      message = 'subject and payment-attempt id are required';
  end if;

  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  select cpa.id,
         cpa.purchase_intent_id,
         cpa.product_offer_id,
         pi.product_offer_id,
         cpa.provider,
         cpa.environment,
         cpa.provider_request_id,
         cpa.provider_transaction_id,
         cpa.status,
         pi.offer_snapshot_jsonb,
         pi.expected_amount_minor,
         pi.expected_currency,
         pi.charge_terms_version
    into v_payment_attempt_id,
         v_purchase_intent_id,
         v_attempt_offer_id,
         v_intent_offer_id,
         v_provider,
         v_environment,
         v_provider_request_id,
         v_provider_transaction_id,
         v_attempt_status,
         v_offer_snapshot,
         v_expected_amount_minor,
         v_expected_currency,
         v_charge_terms_version
  from public.commerce_payment_attempts cpa
  join public.purchase_intents pi
    on pi.id = cpa.purchase_intent_id
   and pi.subject_id = cpa.subject_id
  where cpa.id = p_payment_attempt_id
    and cpa.subject_id = p_subject_id;

  if not found then
    raise exception using
      errcode = 'P0001',
      constraint = 'qry_commerce_payment_verification_context_unavailable',
      message = 'payment verification context is unavailable for the current subject';
  end if;

  if v_attempt_status not in ('handed_off', 'response_received') then
    raise exception using
      errcode = 'P0001',
      constraint = 'qry_commerce_payment_verification_context_state_ineligible',
      message = 'payment attempt has not reached a verification-eligible handoff state';
  end if;

  if v_attempt_offer_id is distinct from v_intent_offer_id then
    raise exception using
      errcode = '23514',
      constraint = 'qry_commerce_payment_verification_context_offer_mismatch',
      message = 'payment attempt and Purchase Intent offer authority diverged';
  end if;

  if v_provider is null or btrim(v_provider) = ''
     or v_environment not in ('sandbox', 'production')
     or v_provider_request_id is null or btrim(v_provider_request_id) = ''
     or (v_provider_transaction_id is not null and btrim(v_provider_transaction_id) = '') then
    raise exception using
      errcode = '23514',
      constraint = 'qry_commerce_payment_verification_context_attempt_invalid',
      message = 'payment attempt verification identity is malformed';
  end if;

  if v_expected_amount_minor is null
     or v_expected_amount_minor <= 0
     or v_expected_amount_minor > 9007199254740991
     or v_expected_currency is null
     or v_expected_currency !~ '^[A-Z]{3}$'
     or v_charge_terms_version is null
     or btrim(v_charge_terms_version) = '' then
    raise exception using
      errcode = '23514',
      constraint = 'qry_commerce_payment_verification_context_charge_authority_invalid',
      message = 'Purchase Intent pinned charge authority is missing or malformed';
  end if;

  if v_offer_snapshot is null
     or pg_catalog.jsonb_typeof(v_offer_snapshot) is distinct from 'object'
     or not (v_offer_snapshot ?& array[
       'productOfferId',
       'productId',
       'platform',
       'provider',
       'externalProductId'
     ]::text[])
     or (v_offer_snapshot - array[
       'productOfferId',
       'productId',
       'platform',
       'provider',
       'externalProductId'
     ]::text[]) <> '{}'::jsonb then
    raise exception using
      errcode = '23514',
      constraint = 'qry_commerce_payment_verification_context_snapshot_invalid',
      message = 'Purchase Intent offer snapshot is not the canonical v2 shape';
  end if;

  if pg_catalog.jsonb_typeof(v_offer_snapshot -> 'productOfferId') is distinct from 'string'
     or pg_catalog.jsonb_typeof(v_offer_snapshot -> 'productId') is distinct from 'string'
     or pg_catalog.jsonb_typeof(v_offer_snapshot -> 'platform') is distinct from 'string'
     or pg_catalog.jsonb_typeof(v_offer_snapshot -> 'provider') is distinct from 'string'
     or pg_catalog.jsonb_typeof(v_offer_snapshot -> 'externalProductId') is distinct from 'string' then
    raise exception using
      errcode = '23514',
      constraint = 'qry_commerce_payment_verification_context_snapshot_invalid',
      message = 'Purchase Intent offer snapshot fields must be canonical strings';
  end if;

  v_snapshot_offer_id := btrim(v_offer_snapshot ->> 'productOfferId');
  v_snapshot_product_id := btrim(v_offer_snapshot ->> 'productId');
  v_platform := btrim(v_offer_snapshot ->> 'platform');
  v_snapshot_provider := btrim(v_offer_snapshot ->> 'provider');
  v_snapshot_external_product_id := btrim(v_offer_snapshot ->> 'externalProductId');

  if v_snapshot_offer_id is distinct from v_attempt_offer_id::text
     or v_snapshot_product_id = ''
     or v_snapshot_provider is distinct from v_provider
     or v_platform not in ('web', 'ios', 'android')
     or v_snapshot_external_product_id = '' then
    raise exception using
      errcode = '23514',
      constraint = 'qry_commerce_payment_verification_context_snapshot_mismatch',
      message = 'Purchase Intent offer snapshot does not match persisted payment authority';
  end if;

  return query
  select v_payment_attempt_id,
         v_purchase_intent_id,
         v_provider,
         v_platform,
         v_environment,
         v_provider_request_id,
         v_provider_transaction_id,
         v_snapshot_external_product_id,
         v_expected_amount_minor,
         v_expected_currency;
end;
$$;

comment on function public.qry_commerce_payment_verification_context_v1(uuid, uuid) is
  'Subject-bound projection of persisted Payment Attempt + Purchase Intent v2 authority into provider-neutral verification context. Never payment success authority.';

revoke all on function public.qry_commerce_payment_verification_context_v1(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.qry_commerce_payment_verification_context_v1(uuid, uuid)
  to myeongha_api_executor;
