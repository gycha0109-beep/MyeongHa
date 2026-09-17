-- Subject-owned Payment Attempt context for a future browser PSP handoff.
--
-- This query exposes only canonical authority already persisted by Payment Attempt and
-- Purchase Intent v2. It performs no provider I/O, starts no checkout, mutates no
-- Commerce state, and creates no Receipt, Provider Event, Entitlement Grant/Event, or
-- effective Entitlement.
--
-- `provider_request_id` is the merchant/server-owned provider handoff identity. For the
-- current PortOne V2 adapter this exact value is the PortOne `paymentId`. The distinct
-- provider-issued `provider_transaction_id` is intentionally not returned here.

create or replace function public.qry_commerce_payment_attempt_handoff_context_v1(
  p_subject_id uuid,
  p_payment_attempt_id uuid
)
returns table (
  payment_attempt_id uuid,
  provider text,
  environment text,
  provider_request_id text,
  expected_amount_minor bigint,
  expected_currency text,
  status text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_payment_attempt_id uuid;
  v_provider text;
  v_environment text;
  v_provider_request_id text;
  v_attempt_status text;
  v_intent_status text;
  v_expected_amount_minor bigint;
  v_expected_currency text;
  v_charge_terms_version text;
begin
  if p_subject_id is null or p_payment_attempt_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'qry_commerce_payment_attempt_handoff_context_ids_required',
      message = 'subject and payment-attempt id are required';
  end if;

  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  select cpa.id,
         cpa.provider,
         cpa.environment,
         cpa.provider_request_id,
         cpa.status,
         pi.status,
         pi.expected_amount_minor,
         pi.expected_currency,
         pi.charge_terms_version
    into v_payment_attempt_id,
         v_provider,
         v_environment,
         v_provider_request_id,
         v_attempt_status,
         v_intent_status,
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
      constraint = 'qry_commerce_payment_attempt_handoff_context_unavailable',
      message = 'payment-attempt handoff context is unavailable for the current subject';
  end if;

  if v_attempt_status is distinct from 'created'
     or v_intent_status not in ('created', 'pending') then
    raise exception using
      errcode = 'P0001',
      constraint = 'qry_commerce_payment_attempt_handoff_context_state_ineligible',
      message = 'payment-attempt handoff context is unavailable for the current subject';
  end if;

  if v_provider is null or btrim(v_provider) = ''
     or v_environment not in ('sandbox', 'production')
     or v_provider_request_id is null or btrim(v_provider_request_id) = '' then
    raise exception using
      errcode = '23514',
      constraint = 'qry_commerce_payment_attempt_handoff_context_attempt_invalid',
      message = 'payment-attempt handoff authority is malformed';
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
      constraint = 'qry_commerce_payment_attempt_handoff_context_charge_authority_invalid',
      message = 'Purchase Intent pinned charge authority is missing or malformed';
  end if;

  return query
  select v_payment_attempt_id,
         v_provider,
         v_environment,
         v_provider_request_id,
         v_expected_amount_minor,
         v_expected_currency,
         v_attempt_status;
end;
$$;

comment on function public.qry_commerce_payment_attempt_handoff_context_v1(uuid, uuid) is
  'Subject-bound pre-browser handoff projection of persisted Payment Attempt + Purchase Intent v2 authority. provider_request_id is the PSP request identity and PortOne V2 paymentId source; provider_transaction_id is deliberately excluded.';

revoke all on function public.qry_commerce_payment_attempt_handoff_context_v1(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.qry_commerce_payment_attempt_handoff_context_v1(uuid, uuid)
  to myeongha_api_executor;
