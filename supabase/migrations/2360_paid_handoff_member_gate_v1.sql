-- P0-CM-05: a Guest must not resume a paid provider handoff.
-- The handoff context query is a provider-checkout boundary, not a free read.
-- Preserve the old projection privately for historical reference; expose only
-- a Member-gated wrapper to the API executor.

alter function public.qry_commerce_payment_attempt_handoff_context_v1(uuid,uuid)
  rename to internal_qry_payment_attempt_handoff_context_pre_member_gate_v1;

create function public.qry_commerce_payment_attempt_handoff_context_v1(
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
begin
  if p_subject_id is null or p_payment_attempt_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'qry_commerce_payment_attempt_handoff_context_ids_required',
      message = 'subject and payment-attempt id are required';
  end if;

  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  perform public.ct_assert_active_member_paid_checkout_v1(p_subject_id);

  return query
    select * from public.internal_qry_payment_attempt_handoff_context_pre_member_gate_v1(
      p_subject_id,p_payment_attempt_id
    );
end;
$$;

revoke all on function public.internal_qry_payment_attempt_handoff_context_pre_member_gate_v1(uuid,uuid)
  from public, anon, authenticated, service_role, myeongha_api_executor, myeongha_commerce_internal_executor;

revoke all on function public.qry_commerce_payment_attempt_handoff_context_v1(uuid,uuid)
  from public, anon, authenticated, service_role, myeongha_commerce_internal_executor;
grant execute on function public.qry_commerce_payment_attempt_handoff_context_v1(uuid,uuid)
  to myeongha_api_executor;

comment on function public.qry_commerce_payment_attempt_handoff_context_v1(uuid,uuid) is
  'P0-CM-05: Member-only pre-browser provider handoff context; rejects Guest before reading provider handoff authority.';
