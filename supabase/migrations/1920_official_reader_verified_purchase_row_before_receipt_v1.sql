-- S2 forward-only lock-order correction (1920, Draft).
-- Verified Commerce 1050 PAID replay uses Attempt -> Purchase -> Receipt,
-- so combined Reader issuance must never hold Receipt while waiting to
-- acquire its original verified Purchase row. No modification of Commerce
-- 1050, past migrations, public ACL, PSP, or Production activation.
-- Watchtower-Track: db-authority-core

create or replace function public.internal_apply_verified_reader_purchase_under_scope_v1(
  p_subject_id uuid,
  p_expected_official_reading_id uuid,
  p_reader_character_id text,
  p_receipt_id uuid,
  p_purchase_intent_id uuid,
  p_capability_item_keys text[],
  p_effective_ats timestamptz[],
  p_target_valid_froms timestamptz[],
  p_target_valid_untils timestamptz[],
  p_reason_codes text[],
  p_proposed_reading_session_id uuid,
  p_proposed_reading_id uuid,
  p_request_hash text,
  p_request_contract_version text,
  p_request_snapshot_jsonb jsonb
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path=pg_catalog, public
as $reader_purchase_s2$
declare
  v_receipt_subject uuid;
  v_verified_intent uuid;
  v_selected_reader text;
  v_effects jsonb;
  v_access jsonb;
  v_real_reading uuid;
begin
  -- A post-lock committed authority read MUST observe a fresh snapshot.
  if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
    raise exception using
      errcode='25001',
      constraint='official_reader_s2_read_committed_required',
      message='Official Reader shared-scope purchase requires READ COMMITTED';
  end if;
  if p_subject_id is null or p_expected_official_reading_id is null
     or p_receipt_id is null or p_purchase_intent_id is null
     or p_proposed_reading_session_id is null or p_proposed_reading_id is null
     or p_reader_character_id is null then
    raise exception using
      errcode='23514',
      constraint='official_reader_s2_required_identity',
      message='Official Reader purchase requires complete server-owned identities';
  end if;

  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  -- Pre-lock SELECT does not claim ownership or lock any purchase row. It
  -- fixes the candidate scope based on *stored* verified Receipt and Reader
  -- selection, not a request-provided Reader id alone. Both source writers
  -- independently re-check their own current authorities after acquisition.
  select cr.subject_id,cr.purchase_intent_id,prs.reader_character_id
    into v_receipt_subject,v_verified_intent,v_selected_reader
  from public.commerce_receipts cr
  join public.purchase_intents pi
    on pi.id=cr.purchase_intent_id
   and pi.subject_id=cr.subject_id
   and pi.product_offer_id=cr.product_offer_id
  join public.purchase_intent_reader_selections prs
    on prs.purchase_intent_id=cr.purchase_intent_id
  where cr.id=p_receipt_id
    and cr.subject_id=p_subject_id
    and cr.purchase_intent_id=p_purchase_intent_id
    and cr.verification_status='verified'
    and cr.environment='production'
    and pi.status='verified';

  if not found
     or v_receipt_subject is distinct from p_subject_id
     or v_verified_intent is distinct from p_purchase_intent_id
     or v_selected_reader is distinct from p_reader_character_id then
    raise exception using
      errcode='P0001',
      constraint='official_reader_s2_verified_lineage_unavailable',
      message='Verified Reader receipt, purchase and Reader selection unavailable';
  end if;

  -- Serialize verified issuance with a full cancellation BEFORE acquiring S1.
  -- No Purchase/Receipt/Grant row lock may precede this xact advisory lock.
  -- Direct 1220 remains governed by existing S1/Grant authority; a purchase
  -- with ANY already-issued Grant cannot use the no-Grant cancellation branch.
  perform public.internal_acquire_official_reader_purchase_lock_v1(
    p_purchase_intent_id
  );

  -- One reader+official reading scope for BOTH real writer operations. This
  -- lock is acquired BEFORE the existing Receipt/Grant/Purchase/Birth locks.
  perform public.internal_acquire_official_reader_scope_lock_v1(
    p_subject_id,p_expected_official_reading_id,v_selected_reader
  );

  -- Commerce 1050 verified-payment persistence (including exact PAID
  -- replay) locks Payment Attempt -> Purchase Intent -> Receipt. The
  -- pre-1920 combined writer instead locked Receipt in 1090 and then
  -- Purchase Intent in 1220: concurrent 1050 could hold Purchase while
  -- waiting for that Receipt, forming a two-way transaction deadlock.
  -- Acquire the same exact, stored verified Purchase row AFTER Reader S1
  -- and BEFORE 1090 can lock Receipt, preserving advisory -> S1 ordering.
  -- 1050 does not acquire S1; direct 1220 already orders S1 -> Purchase.
  perform 1
  from public.purchase_intents pi
  where pi.id=p_purchase_intent_id
    and pi.subject_id=p_subject_id
    and pi.status='verified'
  for update;
  if not found then
    raise exception using
      errcode='40001',
      constraint='official_reader_s2_purchase_changed_before_receipt',
      message='Verified Reader purchase changed while waiting for its row lock';
  end if;

  -- The original Reading can be generated only after Grant issuance. Keep
  -- its S1-locked candidate in transaction-local context for the legacy
  -- receipt/Grant writer, which checks the lock itself (never trusts GUC alone).
  perform pg_catalog.set_config(
    'myeongha.reader_pending_reading_id',
    p_expected_official_reading_id::text, true
  );

  select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(e) order by e.result_item_key)
    into v_effects
  from public.internal_apply_verified_receipt_capability_effects_v1(
    p_receipt_id,p_capability_item_keys,p_effective_ats,
    p_target_valid_froms,p_target_valid_untils,p_reason_codes
  ) e;

  if v_effects is null or pg_catalog.jsonb_array_length(v_effects)=0 then
    raise exception using
      errcode='P0001',
      constraint='official_reader_s2_grant_effects_missing',
      message='No committed verified capability effects available';
  end if;

  select pg_catalog.to_jsonb(a) into v_access
  from public.cmd_bind_standard_reading_access_v2(
    p_subject_id,p_purchase_intent_id,p_proposed_reading_session_id,
    p_proposed_reading_id,p_request_hash,p_request_contract_version,
    p_request_snapshot_jsonb
  ) a;

  if v_access is null then
    raise exception using
      errcode='P0001',
      constraint='official_reader_s2_bind_result_missing',
      message='Reader bind did not produce an authoritative result';
  end if;

  v_real_reading := (v_access->>'reading_id')::uuid;
  if v_real_reading is distinct from p_expected_official_reading_id
     or v_access->>'reader_character_id' is distinct from v_selected_reader
     or (v_access->>'purchase_intent_id')::uuid
        is distinct from p_purchase_intent_id then
    -- Any Grant mutation above rolls back atomically with this error. A
    -- guessed wrong Reader/Reading lock MUST NEVER commit another scope.
    raise exception using
      errcode='40001',
      constraint='official_reader_s2_scope_changed_during_bind',
      message='Reader bind authority does not match the locked official scope';
  end if;

  return pg_catalog.jsonb_build_object(
    'contractVersion','official-reader-s2-atomic-receipt-bind-v1',
    'capabilityEffects',v_effects,
    'readerAccess',v_access
  );
end
$reader_purchase_s2$;

comment on function public.internal_apply_verified_reader_purchase_under_scope_v1(
  uuid,uuid,text,uuid,uuid,text[],timestamptz[],timestamptz[],
  timestamptz[],text[],uuid,uuid,text,text,jsonb
) is
'Private S2 Reader issuance: purchase xact advisory -> S1 -> verified Purchase row FOR UPDATE -> 1090 Receipt/Grant -> 1220 bind. Harmonizes 1050 PAID replay Purchase->Receipt row lock ordering and prevents a deadlock without opening Reader entitlement or paid output.';
