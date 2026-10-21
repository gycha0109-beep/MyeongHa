-- S2: private Commerce -> verified Reader receipt issuance bridge.
-- No public API/role permission, paid body storage, or production activation.
-- Uses the existing 1920 atomic Writer and its purchase -> S1 -> Purchase row
-- -> Receipt/Grant -> Reader bind order, without inventing a second writer.
-- Watchtower-Track: db-authority-core

create or replace function public.cmd_apply_verified_reader_receipt_bind_internal_v1(
  p_receipt_id uuid,
  p_expected_official_reading_id uuid,
  p_capability_item_keys text[],
  p_effective_ats timestamptz[],
  p_target_valid_froms timestamptz[],
  p_target_valid_untils timestamptz[],
  p_reason_codes text[],
  p_proposed_reading_session_id uuid,
  p_proposed_reading_id uuid,
  p_request_hash text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=pg_catalog,public
as $reader_receipt_bridge$
declare
  v_subject_id uuid;
  v_purchase_intent_id uuid;
  v_reader_character_id text;
  v_result jsonb;
begin
  if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
    raise exception using errcode='25001',
      constraint='official_reader_s2_bridge_read_committed_required',
      message='Verified Reader receipt bind requires READ COMMITTED';
  end if;

  if p_receipt_id is null or p_expected_official_reading_id is null
     or p_proposed_reading_session_id is null or p_proposed_reading_id is null
     or p_request_hash is null or p_request_hash !~ '^sha256:v1:[0-9a-f]{64}$'
     or p_capability_item_keys is null
     or pg_catalog.cardinality(p_capability_item_keys)=0
     or p_effective_ats is null or p_target_valid_froms is null
     or p_target_valid_untils is null or p_reason_codes is null
     or pg_catalog.cardinality(p_capability_item_keys) is distinct from
        pg_catalog.cardinality(p_effective_ats)
     or pg_catalog.cardinality(p_capability_item_keys) is distinct from
        pg_catalog.cardinality(p_target_valid_froms)
     or pg_catalog.cardinality(p_capability_item_keys) is distinct from
        pg_catalog.cardinality(p_target_valid_untils)
     or pg_catalog.cardinality(p_capability_item_keys) is distinct from
        pg_catalog.cardinality(p_reason_codes) then
    raise exception using errcode='23514',
      constraint='official_reader_s2_bridge_input_invalid',
      message='Verified Reader receipt bind request is invalid';
  end if;

  -- The trusted Commerce caller supplies only the Receipt and proposed
  -- Reading identities. Resolve Subject, Purchase, Reader selection, and
  -- current verified payment from persisted Commerce authority, never from
  -- an untrusted browser or a claimed Reader identifier.
  select cr.subject_id,cr.purchase_intent_id,prs.reader_character_id
    into v_subject_id,v_purchase_intent_id,v_reader_character_id
  from public.commerce_receipts cr
  join public.purchase_intents pi
    on pi.id=cr.purchase_intent_id
   and pi.subject_id=cr.subject_id
   and pi.product_offer_id=cr.product_offer_id
  join public.purchase_intent_reader_selections prs
    on prs.purchase_intent_id=cr.purchase_intent_id
  where cr.id=p_receipt_id
    and cr.verification_status='verified'
    and cr.environment='production'
    and pi.status='verified';

  if not found or v_subject_id is null or v_purchase_intent_id is null
     or v_reader_character_id is null then
    raise exception using errcode='P0001',
      constraint='official_reader_s2_bridge_verified_receipt_unavailable',
      message='Verified Reader purchase authority is unavailable';
  end if;

  -- Transaction-local; never written to the pool connection's session.
  -- The 1920 Writer re-reads the Receipt after acquiring its locks and
  -- aborts the entire transaction if a cancellation won the race.
  perform pg_catalog.set_config('myeongha.subject_id',v_subject_id::text,true);

  v_result:=public.internal_apply_verified_reader_purchase_under_scope_v1(
    v_subject_id,p_expected_official_reading_id,v_reader_character_id,
    p_receipt_id,v_purchase_intent_id,p_capability_item_keys,p_effective_ats,
    p_target_valid_froms,p_target_valid_untils,p_reason_codes,
    p_proposed_reading_session_id,p_proposed_reading_id,p_request_hash,
    'standard-reading-access-bind-v2',
    pg_catalog.jsonb_build_object(
      'schemaVersion','standard-reading-access-bind-v2',
      'purchaseIntentId',v_purchase_intent_id::text
    )
  );

  if v_result->>'contractVersion' is distinct from
     'official-reader-s2-atomic-receipt-bind-v1'
     or (v_result->'readerAccess'->>'purchase_intent_id')::uuid
        is distinct from v_purchase_intent_id
     or (v_result->'readerAccess'->>'reader_character_id')
        is distinct from v_reader_character_id
     or (v_result->'readerAccess'->>'reading_id')::uuid
        is distinct from p_expected_official_reading_id then
    raise exception using errcode='40001',
      constraint='official_reader_s2_bridge_result_mismatch',
      message='Atomic Reader receipt bind returned a different purchase scope';
  end if;

  return v_result;
end
$reader_receipt_bridge$;

revoke all on function public.cmd_apply_verified_reader_receipt_bind_internal_v1(
  uuid,uuid,text[],timestamptz[],timestamptz[],timestamptz[],text[],
  uuid,uuid,text
) from public;

do $reader_receipt_bridge_acl$
declare v_role text;
begin
  for v_role in
    select rolname from pg_catalog.pg_roles
    where rolname in (
      'anon','authenticated','service_role','myeongha_api_executor',
      'myeongha_commerce_internal_executor',
      'myeongha_seyeon_chat_runtime_owner'
    )
  loop
    execute pg_catalog.format(
      'revoke all on function public.cmd_apply_verified_reader_receipt_bind_internal_v1(uuid,uuid,text[],timestamptz[],timestamptz[],timestamptz[],text[],uuid,uuid,text) from %I',
      v_role
    );
  end loop;
end
$reader_receipt_bridge_acl$;

grant execute on function public.cmd_apply_verified_reader_receipt_bind_internal_v1(
  uuid,uuid,text[],timestamptz[],timestamptz[],timestamptz[],text[],
  uuid,uuid,text
) to myeongha_commerce_internal_executor;

comment on function public.cmd_apply_verified_reader_receipt_bind_internal_v1(
  uuid,uuid,text[],timestamptz[],timestamptz[],timestamptz[],text[],
  uuid,uuid,text
) is
'Private verified Commerce Receipt -> atomic capability issuance and Reader bind. Only the internal Commerce executor may invoke. Not a public purchase, payment verification, or paid-response endpoint.';
