-- Private read-only S7 Commerce/Legal evidence: do not turn an already
-- provider-revoked original Receipt into a fictitious currently verified
-- purchase when reviewing retained, historically legitimate delivery facts.
--
-- The 2240 v1 query first verifies the exact original Receipt, provider-backed
-- refund revocation and originating Grant while holding the S1 Reader scope
-- transaction lock. This wrapper extends its output ONLY with the real
-- current status from that same original Receipt. It does not create any
-- refund right, revive Reader access, read encrypted content or grant runtime
-- EXECUTE. The v1 return type remains unchanged for existing callers.
-- Watchtower-Track: db-authority-core

create or replace function public.internal_qry_official_reader_withdrawal_delivery_state_v2(
  p_subject_id uuid,
  p_purchase_intent_id uuid,
  p_originating_grant_id uuid,
  p_body_id uuid
)
returns table (
  purchase_intent_id uuid,
  unit_id uuid,
  product_spec_version text,
  s5_committed_at timestamptz,
  response_prepared_at timestamptz,
  client_acknowledged_at timestamptz,
  delivery_attempt_count bigint,
  acknowledged_attempt_count bigint,
  original_receipt_status text
)
language plpgsql
volatile security definer
set search_path=pg_catalog,public
as $reader_withdrawal_state_v2$
begin
  -- Calling 2240 first is essential: it has the S1 lock and the verified
  -- PortOne event + exact originating Grant revocation requirements. Never
  -- query the Receipt without that authorization gate.
  return query
  select
    evidence.purchase_intent_id,
    evidence.unit_id,
    evidence.product_spec_version,
    evidence.s5_committed_at,
    evidence.response_prepared_at,
    evidence.client_acknowledged_at,
    evidence.delivery_attempt_count,
    evidence.acknowledged_attempt_count,
    receipt.verification_status::text
  from public.internal_qry_official_reader_withdrawal_delivery_evidence_v1(
    p_subject_id,p_purchase_intent_id,p_originating_grant_id,p_body_id
  ) evidence
  join public.entitlement_grants original_grant
    on original_grant.id=evidence.unit_id
   and original_grant.id=p_originating_grant_id
   and original_grant.subject_id=p_subject_id
   and original_grant.grant_source_type='purchase'
  join public.commerce_receipts receipt
    on receipt.id=original_grant.source_receipt_id
   and receipt.subject_id=p_subject_id
   and receipt.purchase_intent_id=evidence.purchase_intent_id
   and receipt.purchase_intent_id=p_purchase_intent_id
   and receipt.environment='production'
  where receipt.verification_status in ('verified','revoked');
end
$reader_withdrawal_state_v2$;

revoke all on function public.internal_qry_official_reader_withdrawal_delivery_state_v2(
  uuid,uuid,uuid,uuid
) from public;

do $reader_withdrawal_state_v2_acl$
declare v_role text;
begin
  for v_role in select rolname from pg_catalog.pg_roles
    where rolname in (
      'anon','authenticated','service_role','myeongha_api_executor',
      'myeongha_commerce_internal_executor','myeongha_system_executor',
      'myeongha_seyeon_chat_runtime_owner'
    )
  loop
    execute pg_catalog.format(
      'revoke all on function public.internal_qry_official_reader_withdrawal_delivery_state_v2(uuid,uuid,uuid,uuid) from %I',
      v_role
    );
  end loop;
end
$reader_withdrawal_state_v2_acl$;

comment on function public.internal_qry_official_reader_withdrawal_delivery_state_v2(
  uuid,uuid,uuid,uuid
) is 'S7 private original receipt + purchased unit withdrawal evidence with current verified/revoked status. Requires 2240 shared Reader scope lock and verified provider cancellation for revoked receipts; no paid body, public/runtime EXECUTE, automatic refund or legal delivery decision.';
