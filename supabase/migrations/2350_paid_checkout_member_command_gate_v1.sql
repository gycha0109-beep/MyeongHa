-- P0-CM-05: Member-only paid purchase command authority.
-- Migration 2340 protects INSERTs. These wrappers also reject Guest before the
-- Purchase Intent / Payment Attempt idempotent replay branches, so historical
-- Guest-owned rows cannot be used to start or resume a new paid checkout.
-- Historical Commerce rows and their immutable provenance are not rewritten.

create or replace function public.ct_assert_active_member_paid_checkout_v1(
  p_subject_id uuid
) returns void
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_kind text;
  v_status text;
  v_auth_user_id uuid;
  v_merged_into uuid;
begin
  select s.kind::text, s.status::text, s.auth_user_id, s.merged_into_subject_id
    into v_kind, v_status, v_auth_user_id, v_merged_into
  from public.subjects s
  where s.id = p_subject_id
  for share;

  if not found
     or v_kind is distinct from 'member'
     or v_status is distinct from 'active'
     or v_auth_user_id is null
     or v_merged_into is not null then
    raise exception using
      errcode = '23514',
      constraint = 'ct_paid_checkout_member_required_v1',
      message = 'paid checkout requires an active authenticated Member; login required';
  end if;
end;
$$;

revoke all on function public.ct_assert_active_member_paid_checkout_v1(uuid)
  from public, anon, authenticated, service_role, myeongha_api_executor, myeongha_commerce_internal_executor;

-- Preserve the full historical implementations behind private names. The public
-- command names become Member-only wrappers with the same return contracts.
alter function public.cmd_create_purchase_intent_v2(uuid,uuid,uuid,uuid,text,text,jsonb,text)
  rename to internal_cmd_create_purchase_intent_v2_pre_member_gate_v1;
alter function public.cmd_create_purchase_intent_v3(uuid,uuid,uuid,uuid,text,text,jsonb,text,jsonb,text)
  rename to internal_cmd_create_purchase_intent_v3_pre_member_gate_v1;
alter function public.cmd_create_payment_attempt_v1(uuid,uuid,uuid,text,text,text)
  rename to internal_cmd_create_payment_attempt_v1_pre_member_gate_v1;

create function public.cmd_create_purchase_intent_v2(
  p_subject_id uuid,
  p_purchase_intent_id uuid,
  p_product_offer_id uuid,
  p_provider_account_link_id uuid,
  p_idempotency_key text,
  p_request_hash text,
  p_offer_snapshot_jsonb jsonb,
  p_offer_snapshot_hash text
) returns table (
  purchase_intent_id uuid,
  product_offer_id uuid,
  provider_account_link_id uuid,
  status text,
  offer_snapshot_jsonb jsonb,
  offer_snapshot_hash text,
  expected_amount_minor bigint,
  expected_currency text,
  charge_terms_version text,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_subject_id is null or p_purchase_intent_id is null or p_product_offer_id is null then
    raise exception using errcode = '23514',
      constraint = 'cmd_purchase_intent_v2_ids_required',
      message = 'subject, purchase intent id, and product offer id are required';
  end if;
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  perform public.ct_assert_active_member_paid_checkout_v1(p_subject_id);
  return query
    select * from public.internal_cmd_create_purchase_intent_v2_pre_member_gate_v1(
      p_subject_id,p_purchase_intent_id,p_product_offer_id,p_provider_account_link_id,
      p_idempotency_key,p_request_hash,p_offer_snapshot_jsonb,p_offer_snapshot_hash
    );
end;
$$;

create function public.cmd_create_purchase_intent_v3(
  p_subject_id uuid,
  p_purchase_intent_id uuid,
  p_product_offer_id uuid,
  p_provider_account_link_id uuid,
  p_idempotency_key text,
  p_request_hash text,
  p_offer_snapshot_jsonb jsonb,
  p_offer_snapshot_hash text,
  p_capability_snapshot_jsonb jsonb,
  p_capability_snapshot_hash text
) returns table (
  purchase_intent_id uuid,
  product_offer_id uuid,
  provider_account_link_id uuid,
  status text,
  offer_snapshot_jsonb jsonb,
  offer_snapshot_hash text,
  expected_amount_minor bigint,
  expected_currency text,
  charge_terms_version text,
  capability_set_id uuid,
  capability_snapshot_jsonb jsonb,
  capability_snapshot_hash text,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_subject_id is null or p_purchase_intent_id is null or p_product_offer_id is null then
    raise exception using errcode = '23514',
      constraint = 'cmd_purchase_intent_v3_ids_required',
      message = 'subject, purchase intent id, and product offer id are required';
  end if;
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  perform public.ct_assert_active_member_paid_checkout_v1(p_subject_id);
  return query
    select * from public.internal_cmd_create_purchase_intent_v3_pre_member_gate_v1(
      p_subject_id,p_purchase_intent_id,p_product_offer_id,p_provider_account_link_id,
      p_idempotency_key,p_request_hash,p_offer_snapshot_jsonb,p_offer_snapshot_hash,
      p_capability_snapshot_jsonb,p_capability_snapshot_hash
    );
end;
$$;

create function public.cmd_create_payment_attempt_v1(
  p_subject_id uuid,
  p_payment_attempt_id uuid,
  p_purchase_intent_id uuid,
  p_environment text,
  p_idempotency_key text,
  p_provider_request_id text
) returns table (
  payment_attempt_id uuid,
  purchase_intent_id uuid,
  product_offer_id uuid,
  attempt_no integer,
  provider text,
  environment text,
  provider_request_id text,
  provider_transaction_id text,
  status text,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_subject_id is null or p_payment_attempt_id is null or p_purchase_intent_id is null then
    raise exception using errcode = '23514',
      constraint = 'cmd_payment_attempt_v1_ids_required',
      message = 'subject, payment-attempt id, and Purchase Intent id are required';
  end if;
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  perform public.ct_assert_active_member_paid_checkout_v1(p_subject_id);
  return query
    select * from public.internal_cmd_create_payment_attempt_v1_pre_member_gate_v1(
      p_subject_id,p_payment_attempt_id,p_purchase_intent_id,p_environment,
      p_idempotency_key,p_provider_request_id
    );
end;
$$;

-- Private implementations must not remain an alternate API-executor entry point.
revoke all on function public.internal_cmd_create_purchase_intent_v2_pre_member_gate_v1(uuid,uuid,uuid,uuid,text,text,jsonb,text)
  from public, anon, authenticated, service_role, myeongha_api_executor, myeongha_commerce_internal_executor;
revoke all on function public.internal_cmd_create_purchase_intent_v3_pre_member_gate_v1(uuid,uuid,uuid,uuid,text,text,jsonb,text,jsonb,text)
  from public, anon, authenticated, service_role, myeongha_api_executor, myeongha_commerce_internal_executor;
revoke all on function public.internal_cmd_create_payment_attempt_v1_pre_member_gate_v1(uuid,uuid,uuid,text,text,text)
  from public, anon, authenticated, service_role, myeongha_api_executor, myeongha_commerce_internal_executor;

revoke all on function public.cmd_create_purchase_intent_v2(uuid,uuid,uuid,uuid,text,text,jsonb,text)
  from public, anon, authenticated, service_role, myeongha_commerce_internal_executor;
revoke all on function public.cmd_create_purchase_intent_v3(uuid,uuid,uuid,uuid,text,text,jsonb,text,jsonb,text)
  from public, anon, authenticated, service_role, myeongha_commerce_internal_executor;
revoke all on function public.cmd_create_payment_attempt_v1(uuid,uuid,uuid,text,text,text)
  from public, anon, authenticated, service_role, myeongha_commerce_internal_executor;

grant execute on function public.cmd_create_purchase_intent_v2(uuid,uuid,uuid,uuid,text,text,jsonb,text)
  to myeongha_api_executor;
grant execute on function public.cmd_create_purchase_intent_v3(uuid,uuid,uuid,uuid,text,text,jsonb,text,jsonb,text)
  to myeongha_api_executor;
grant execute on function public.cmd_create_payment_attempt_v1(uuid,uuid,uuid,text,text,text)
  to myeongha_api_executor;

comment on function public.cmd_create_purchase_intent_v2(uuid,uuid,uuid,uuid,text,text,jsonb,text) is
  'P0-CM-05: active authenticated Member-only paid Purchase Intent v2; rejects Guest before idempotent replay.';
comment on function public.cmd_create_purchase_intent_v3(uuid,uuid,uuid,uuid,text,text,jsonb,text,jsonb,text) is
  'P0-CM-05: active authenticated Member-only paid Purchase Intent v3; rejects Guest before idempotent replay.';
comment on function public.cmd_create_payment_attempt_v1(uuid,uuid,uuid,text,text,text) is
  'P0-CM-05: active authenticated Member-only Payment Attempt; rejects Guest before idempotent replay.';
