-- S7 -> Commerce/Legal PRIVATE READ-ONLY withdrawal evidence bridge.
-- An exact original Receipt->Grant->paid body is ONE purchased content unit.
-- A verified current Receipt is independently re-read under the SAME S1
-- scope lock before using the historical answer and any delivery attempts.
--
-- S5 commit, HTTP response preparation and authenticated CLIENT ACK are
-- three different events. None on its own proves legal consumer delivery.
-- A returned row is NOT a statutory decision, refund, entitlement mutation,
-- paid content response or authorization to disclose user private material.
-- No runtime role EXECUTE, no HTTP route, no production deployment.
-- Privacy retention and checkout notice proofs remain Owner-controlled.
-- Watchtower-Track: db-authority-core

create or replace function public.internal_qry_official_reader_withdrawal_delivery_evidence_v1(
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
  acknowledged_attempt_count bigint
)
language plpgsql
volatile security definer
set search_path=pg_catalog,public
as $reader_withdrawal_evidence$
declare
  v_reading_id uuid;
  v_reader_character_id text;
  v_scope_state text;
begin
  if p_subject_id is null or p_purchase_intent_id is null
     or p_originating_grant_id is null or p_body_id is null
     or pg_catalog.current_setting('transaction_isolation')<>'read committed'
  then
    raise exception using errcode='23514',
      constraint='official_reader_withdrawal_evidence_selector_invalid',
      message='Private Reader withdrawal evidence is unavailable';
  end if;
  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  -- The pre-lock lookup identifies only the canonical advisory-lock key.
  -- It returns neither ciphertext nor any delivery/receipt evidence.
  select b.official_reading_id,b.reader_character_id
    into v_reading_id,v_reader_character_id
  from public.official_reader_paid_answer_bodies b
  where b.id=p_body_id and b.subject_id=p_subject_id
    and b.originating_entitlement_grant_id=p_originating_grant_id;
  if not found then return; end if;

  -- Serialize against purchase bind and provider cancellation before
  -- reading the exact source Receipt and its associated delivery history.
  select q.scope_state into v_scope_state
  from public.internal_qry_official_reader_locked_bundle_scope_v1(
    p_subject_id,v_reading_id,v_reader_character_id
  ) q;
  if not found or v_scope_state not in (
    'no_active_grant','one_current_bundle','ambiguous_bundles'
  ) then
    raise exception using errcode='P0001',
      constraint='official_reader_withdrawal_evidence_scope_unavailable',
      message='Private Reader withdrawal evidence is unavailable';
  end if;

  return query
  select
    receipt.purchase_intent_id,
    grant_row.id,
    b.product_spec_version,
    b.committed_at,
    delivery.response_prepared_at,
    delivery.client_acknowledged_at,
    delivery.attempt_count,
    delivery.acknowledged_count
  from public.official_reader_paid_answer_bodies b
  join public.standard_reading_reader_access_grants access
    on access.entitlement_grant_id=b.originating_entitlement_grant_id
   and access.subject_id=b.subject_id
   and access.official_reading_id=b.official_reading_id
   and access.reader_character_id=b.reader_character_id
   and access.reader_content_bundle_id=b.reader_content_bundle_id
  join public.entitlement_grants grant_row
    on grant_row.id=access.entitlement_grant_id
   and grant_row.subject_id=b.subject_id
   and grant_row.grant_source_type='purchase'
  join public.commerce_receipts receipt
    on receipt.id=grant_row.source_receipt_id
   and receipt.subject_id=grant_row.subject_id
   and receipt.purchase_intent_id=p_purchase_intent_id
   and receipt.verification_status='verified'
   and receipt.environment='production'
  cross join lateral (
    select
      min(d.response_prepared_at) as response_prepared_at,
      min(d.client_acknowledged_at) as client_acknowledged_at,
      count(*)::bigint as attempt_count,
      count(d.client_acknowledged_at)::bigint as acknowledged_count
    from public.official_reader_paid_delivery_attempts_v1 d
    where d.subject_id=b.subject_id
      and d.body_id=b.id
      and d.thread_id=b.thread_id
      and d.safe_message_id=b.safe_message_id
      and d.retention_until>pg_catalog.clock_timestamp()
  ) delivery
  where b.id=p_body_id
    and b.subject_id=p_subject_id
    and b.originating_entitlement_grant_id=p_originating_grant_id
    and b.official_reading_id=v_reading_id
    and b.reader_character_id=v_reader_character_id;
end
$reader_withdrawal_evidence$;

revoke all on function public.internal_qry_official_reader_withdrawal_delivery_evidence_v1(
  uuid,uuid,uuid,uuid
) from public;

do $reader_withdrawal_evidence_acl$
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
      'revoke all on function public.internal_qry_official_reader_withdrawal_delivery_evidence_v1(uuid,uuid,uuid,uuid) from %I',
      v_role
    );
  end loop;
end
$reader_withdrawal_evidence_acl$;

comment on function public.internal_qry_official_reader_withdrawal_delivery_evidence_v1(
  uuid,uuid,uuid,uuid
) is 'Private single-unit verified Production Receipt+originating Grant+S5 body and S7 retained receipt timeline, rechecked under shared S1 lock. No consumer delivery proof, refund authorization or runtime EXECUTE. Holds Saju/Privacy/Legal/Commerce release.';
