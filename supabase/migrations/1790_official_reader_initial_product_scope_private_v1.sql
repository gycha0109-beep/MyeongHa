-- S2 initial Official Reading: product-level scope exists BEFORE Reading UUID.
-- Watchtower-Track: db-authority-core
--
-- PRIVATE, not wired to Commerce/Reader public routes; production HOLD.
-- A first Reading has no immutable reading_id when its verified purchase
-- receipt creates a Grant. Scope must therefore be Subject x server-owned
-- Product, never a caller-proposed future Reading UUID.
-- This lock is intentionally broader than the existing Reading x Reader lock.
-- Future approved all-path protocol MUST acquire product scope first and
-- existing Reading x Reader scope second, and only THEN any Commerce/Grant/
-- Birth row locks. Legacy writers and T2 DO NOT yet all participate.

create or replace function public.internal_acquire_official_reader_product_scope_lock_v1(
  p_subject_id uuid,
  p_product_id uuid
)
returns void
language plpgsql
volatile
security invoker
set search_path = pg_catalog, public
as $initial_product_lock$
begin
  if p_subject_id is null or p_product_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'official_reader_product_scope_required',
      message = 'Official Reader product scope identifiers are required';
  end if;
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
    raise exception using
      errcode = '25001',
      constraint = 'official_reader_product_scope_requires_read_committed',
      message = 'Official Reader product scope requires READ COMMITTED';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'myeongha:official-reader:product-scope:v1:' ||
      p_subject_id::text || ':' || p_product_id::text,
      1829::bigint
    )
  );
end
$initial_product_lock$;

-- Resolve Product solely from persisted Purchase/Offer/Reader selection and
-- active Saju Product policy. A candidate is NOT a Grant or access permit.
create or replace function public.internal_qry_official_reader_initial_product_candidate_v1(
  p_subject_id uuid,
  p_purchase_intent_id uuid
)
returns uuid
language plpgsql
volatile
security invoker
set search_path = pg_catalog, public
as $initial_product_candidate$
declare
  v_match_count bigint;
  v_product_id uuid;
begin
  if p_subject_id is null or p_purchase_intent_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'official_reader_initial_purchase_required',
      message = 'Initial Official Reader purchase identifiers are required';
  end if;
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
    raise exception using
      errcode = '25001',
      constraint = 'official_reader_product_scope_requires_read_committed',
      message = 'Official Reader product scope requires READ COMMITTED';
  end if;

  select count(*), (array_agg(po.product_id))[1]
    into v_match_count, v_product_id
  from public.purchase_intents pi
  join public.product_offers po on po.id = pi.product_offer_id
  join public.standard_reading_offer_roles role
    on role.product_offer_id = po.id
   and role.purchase_role = 'initial_reading'
   and role.retired_at is null
  join public.purchase_intent_reader_selections sel
    on sel.purchase_intent_id = pi.id
   and sel.product_id = po.product_id
   and sel.reader_character_id is not null
   and pg_catalog.btrim(sel.reader_character_id) <> ''
  join public.standard_reading_product_specs spec
    on spec.product_id = po.product_id
   and spec.retired_at is null
   and spec.reader_selection_mode = 'required'
  join public.standard_reading_delivery_policies policy
    on policy.product_id = po.product_id
   and policy.retired_at is null
   and policy.reading_identity_mode = 'official_subject_product_scope_birth_authority'
   and policy.reader_interpretation_mode = 'per_reader_purchase_grant'
  where pi.id = p_purchase_intent_id
    and pi.subject_id = p_subject_id
    and pi.status = 'verified'
    and pi.capability_set_id = spec.capability_set_id;

  if v_match_count <> 1 or v_product_id is null then
    raise exception using
      errcode = 'P0001',
      constraint = 'official_reader_initial_product_unique_candidate_required',
      message = 'One verified initial Official Reading Product scope is required';
  end if;
  return v_product_id;
end
$initial_product_candidate$;

-- Before the original 1090 Receipt -> Grant writer acquires any row locks,
-- compute the actual Product from the verified production Receipt/Intent.
create or replace function public.internal_apply_initial_official_reader_receipt_locked_v1(
  p_receipt_id uuid,
  p_capability_item_keys text[],
  p_effective_ats timestamptz[],
  p_target_valid_froms timestamptz[],
  p_target_valid_untils timestamptz[],
  p_reason_codes text[]
)
returns table (
  result_item_key text,
  result_grant_id uuid,
  result_entitlement_event_id uuid,
  result_projection_id uuid,
  result_grant_revision bigint,
  result_projection_revision bigint,
  result_projection_changed boolean,
  result_outbox_event_id uuid,
  result_replayed boolean
)
language plpgsql
volatile
security invoker
set search_path = pg_catalog, public
as $initial_receipt_locked$
declare
  v_subject_id uuid;
  v_purchase_intent_id uuid;
  v_product_id uuid;
  v_rechecked_product_id uuid;
begin
  if p_receipt_id is null then
    raise exception using errcode = '23514',
      constraint = 'official_reader_initial_receipt_required',
      message = 'Initial Official Reader Receipt identifier is required';
  end if;
  select cr.subject_id, cr.purchase_intent_id
    into v_subject_id, v_purchase_intent_id
  from public.commerce_receipts cr
  where cr.id = p_receipt_id
    and cr.environment = 'production'
    and cr.verification_status = 'verified';

  if v_subject_id is null or v_purchase_intent_id is null then
    raise exception using errcode = 'P0001',
      constraint = 'official_reader_initial_receipt_unavailable',
      message = 'Verified initial Official Reader Receipt is unavailable';
  end if;
  v_product_id := public.internal_qry_official_reader_initial_product_candidate_v1(
    v_subject_id, v_purchase_intent_id
  );
  perform public.internal_acquire_official_reader_product_scope_lock_v1(
    v_subject_id, v_product_id
  );
  v_rechecked_product_id :=
    public.internal_qry_official_reader_initial_product_candidate_v1(
      v_subject_id, v_purchase_intent_id
    );
  if v_rechecked_product_id is distinct from v_product_id then
    raise exception using errcode = '40001',
      constraint = 'official_reader_initial_receipt_product_drift',
      message = 'Initial Official Reader Receipt Product changed during lock acquisition';
  end if;

  return query select * from public.internal_apply_verified_receipt_capability_effects_v1(
    p_receipt_id, p_capability_item_keys, p_effective_ats,
    p_target_valid_froms, p_target_valid_untils, p_reason_codes
  );

  -- Statement atomicity: Product identity drift after the original effect
  -- cancels ALL resulting Receipt/Grant/Entitlement/outbox mutations.
  v_rechecked_product_id :=
    public.internal_qry_official_reader_initial_product_candidate_v1(
      v_subject_id, v_purchase_intent_id
    );
  if v_rechecked_product_id is distinct from v_product_id then
    raise exception using errcode = '40001',
      constraint = 'official_reader_initial_receipt_product_drift',
      message = 'Initial Official Reader Receipt Product changed during issuance';
  end if;
end
$initial_receipt_locked$;

-- Initial Official Reading creation has no prior Reading UUID for the S1 key.
-- Lock Subject x Product first, then delegate to the immutable v2 binder.
create or replace function public.internal_cmd_bind_initial_official_reader_locked_v1(
  p_subject_id uuid,
  p_purchase_intent_id uuid,
  p_proposed_reading_session_id uuid,
  p_proposed_reading_id uuid,
  p_request_hash text,
  p_request_contract_version text,
  p_request_snapshot_jsonb jsonb
)
returns table (
  purchase_intent_id uuid,
  entitlement_grant_id uuid,
  product_id uuid,
  reader_character_id text,
  reader_content_bundle_id uuid,
  reading_session_id uuid,
  reading_id uuid,
  source_birth_revision_id uuid,
  saju_domain text,
  domain_capability_version text,
  access_role text,
  official_reading_created boolean,
  interpretation_created boolean,
  replayed boolean
)
language plpgsql
volatile
security invoker
set search_path = pg_catalog, public
as $initial_bind_locked$
declare
  v_product_id uuid;
  v_rechecked_product_id uuid;
  v_result record;
begin
  if p_proposed_reading_session_id is null
     or p_proposed_reading_id is null then
    raise exception using errcode = '23514',
      constraint = 'official_reader_initial_bind_ids_required',
      message = 'Initial Official Reader proposed session and Reading IDs are required';
  end if;

  v_product_id := public.internal_qry_official_reader_initial_product_candidate_v1(
    p_subject_id, p_purchase_intent_id
  );
  perform public.internal_acquire_official_reader_product_scope_lock_v1(
    p_subject_id, v_product_id
  );
  v_rechecked_product_id :=
    public.internal_qry_official_reader_initial_product_candidate_v1(
      p_subject_id, p_purchase_intent_id
    );
  if v_rechecked_product_id is distinct from v_product_id then
    raise exception using errcode = '40001',
      constraint = 'official_reader_initial_bind_product_drift',
      message = 'Initial Official Reader Product changed before binding';
  end if;

  select * into strict v_result
  from public.cmd_bind_standard_reading_access_v2(
    p_subject_id, p_purchase_intent_id, p_proposed_reading_session_id,
    p_proposed_reading_id, p_request_hash,
    p_request_contract_version, p_request_snapshot_jsonb
  );

  -- Replayed initial binding is permitted only if the original v2 proof is
  -- returned unchanged. A *new* initial bind must really create the official
  -- Reading; any additional Reader role is categorically rejected.
  if v_result.product_id is distinct from v_product_id
     or v_result.access_role is distinct from 'initial_reader'
     or v_result.reading_id is null
     or not (
       (v_result.replayed is false and v_result.official_reading_created is true)
       or (v_result.replayed is true and v_result.official_reading_created is false)
     ) then
    raise exception using errcode = '40001',
      constraint = 'official_reader_initial_bind_authority_mismatch',
      message = 'Initial Official Reader binding authority did not match product lock';
  end if;

  return query select
    v_result.purchase_intent_id, v_result.entitlement_grant_id,
    v_result.product_id, v_result.reader_character_id,
    v_result.reader_content_bundle_id, v_result.reading_session_id,
    v_result.reading_id, v_result.source_birth_revision_id,
    v_result.saju_domain, v_result.domain_capability_version,
    v_result.access_role, v_result.official_reading_created,
    v_result.interpretation_created, v_result.replayed;
end
$initial_bind_locked$;

revoke all on function public.internal_acquire_official_reader_product_scope_lock_v1(uuid,uuid) from public;
revoke all on function public.internal_qry_official_reader_initial_product_candidate_v1(uuid,uuid) from public;
revoke all on function public.internal_apply_initial_official_reader_receipt_locked_v1(uuid,text[],timestamptz[],timestamptz[],timestamptz[],text[]) from public;
revoke all on function public.internal_cmd_bind_initial_official_reader_locked_v1(uuid,uuid,uuid,uuid,text,text,jsonb) from public;

do $initial_scope_acl$
declare
  v_role text;
begin
  for v_role in select rolname from pg_catalog.pg_roles where rolname in (
    'anon', 'authenticated', 'service_role', 'myeongha_api_executor',
    'myeongha_commerce_internal_executor', 'myeongha_seyeon_chat_runtime_owner'
  ) loop
    execute pg_catalog.format(
      'revoke all on function public.internal_acquire_official_reader_product_scope_lock_v1(uuid,uuid) from %I',v_role
    );
    execute pg_catalog.format(
      'revoke all on function public.internal_qry_official_reader_initial_product_candidate_v1(uuid,uuid) from %I',v_role
    );
    execute pg_catalog.format(
      'revoke all on function public.internal_apply_initial_official_reader_receipt_locked_v1(uuid,text[],timestamptz[],timestamptz[],timestamptz[],text[]) from %I',v_role
    );
    execute pg_catalog.format(
      'revoke all on function public.internal_cmd_bind_initial_official_reader_locked_v1(uuid,uuid,uuid,uuid,text,text,jsonb) from %I',v_role
    );
  end loop;
end
$initial_scope_acl$;

comment on function public.internal_acquire_official_reader_product_scope_lock_v1(uuid,uuid)
is 'PRIVATE S2 product lock for initial Reading before Reading UUID exists; outer lock of future all-path protocol. Never grants entitlement.';
comment on function public.internal_cmd_bind_initial_official_reader_locked_v1(uuid,uuid,uuid,uuid,text,text,jsonb)
is 'PRIVATE first-Reading v2 binder candidate locked on verified Subject x Product; replay preserves v2 provenance. No runtime/Commerce role EXECUTE.';
