-- S7 post-lock Receipt status snapshot fence (PRIVATE / DRAFT).
-- The 2250 wrapper used one RETURN QUERY whose Receipt join could share a
-- statement snapshot created BEFORE the 2240 function waited for the S1 lock.
-- A concurrently verified S2 full cancellation could therefore commit during
-- that wait, while the outer query still projected the old 'verified' status.
--
-- Execute the canonical 2240 evidence/lineage gate to completion FIRST. It
-- acquires and holds the shared S1 xact lock. Read the original Receipt in a
-- NEW PL/pgSQL statement, using a fresh READ COMMITTED snapshot only AFTER
-- the gate has returned. This neither relaxes 2240, extends evidence retention,
-- reactivates access, nor authorizes legal/refund decisions or a public API.
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
declare
  v_evidence record;
begin
  -- One authoritative body (PK) and original purchase Grant are required;
  -- no fallback query is allowed when 2240 denies or cannot prove lineage.
  -- The gate also rejects stale isolation and acquires the exact S1 lock.
  select * into v_evidence
  from public.internal_qry_official_reader_withdrawal_delivery_evidence_v1(
    p_subject_id,p_purchase_intent_id,p_originating_grant_id,p_body_id
  );
  if not found then
    return;
  end if;

  -- CRITICAL: separate SPI statement/snapshot AFTER the S1 lock was taken.
  -- The original Receipt, not the currently active sibling, supplies status.
  return query
  select
    v_evidence.purchase_intent_id,
    v_evidence.unit_id,
    v_evidence.product_spec_version,
    v_evidence.s5_committed_at,
    v_evidence.response_prepared_at,
    v_evidence.client_acknowledged_at,
    v_evidence.delivery_attempt_count,
    v_evidence.acknowledged_attempt_count,
    receipt.verification_status::text
  from public.entitlement_grants original_grant
  join public.commerce_receipts receipt
    on receipt.id=original_grant.source_receipt_id
   and receipt.subject_id=p_subject_id
   and receipt.purchase_intent_id=v_evidence.purchase_intent_id
   and receipt.purchase_intent_id=p_purchase_intent_id
   and receipt.environment='production'
  where original_grant.id=v_evidence.unit_id
    and original_grant.id=p_originating_grant_id
    and original_grant.subject_id=p_subject_id
    and original_grant.grant_source_type='purchase'
    and receipt.verification_status in ('verified','revoked');
end
$reader_withdrawal_state_v2$;

-- CREATE OR REPLACE preserves the existing private grants. Reassert the
-- restricted function ACL rather than exposing this as a runtime route.
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
) is 'S7 original verified/revoked Receipt state read with a NEW READ COMMITTED snapshot after successful exact 2240 provenance gate and S1 scope lock, never with a pre-wait join snapshot. Private historical evidence only; no consumer delivery proof or refund/public execution authority.';
