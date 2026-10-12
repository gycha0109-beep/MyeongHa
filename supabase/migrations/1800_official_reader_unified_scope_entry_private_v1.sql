-- D1 PRIVATE scope entry: Product L0 FIRST, existing Reading×Reader L1 SECOND.
-- Watchtower-Track: db-authority-core
--
-- This is a source-bound lock entry primitive, NOT T2/Grant/reveal authority.
-- It intentionally does not modify legacy Commerce/Reader/Chat writers.
-- All direct old L1-only access paths remain unsafe for production until
-- D2/D3/D5 all participate and owners approve a single cutover.
-- Caller transaction must be READ COMMITTED; no externally granted EXECUTE.

create or replace function public.internal_acquire_official_reader_existing_scope_v2(
  p_subject_id uuid,
  p_reading_ref uuid,
  p_reader_character_id text
)
returns table (
  product_id uuid,
  reading_ref uuid,
  reader_character_id text
)
language plpgsql
volatile
security invoker
set search_path = pg_catalog, public
as $unified_existing_scope$
declare
  v_product_id uuid;
  v_after_product_id uuid;
  v_count bigint;
begin
  if p_subject_id is null or p_reading_ref is null
     or p_reader_character_id is null
     or pg_catalog.btrim(p_reader_character_id) = '' then
    raise exception using
      errcode = '23514',
      constraint = 'reader_unified_scope_input_required',
      message = 'Exact Official Reading and Reader scope is required';
  end if;
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
    raise exception using
      errcode = '25001',
      constraint = 'reader_unified_scope_read_committed_required',
      message = 'Official Reader unified scope requires READ COMMITTED';
  end if;

  -- Read-only PRE-L0 candidate: only immutable committed official
  -- binding may define a Product; never a caller or model supplied Product.
  select count(*), (array_agg(o.product_id))[1]
    into v_count, v_product_id
  from public.standard_reading_official_bindings o
  where o.reading_id = p_reading_ref
    and o.subject_id = p_subject_id
    and o.product_id is not null;

  if v_count <> 1 or v_product_id is null then
    raise exception using
      errcode = 'P0001',
      constraint = 'reader_unified_scope_official_binding_required',
      message = 'Exactly one subject-owned Official Reading Product is required';
  end if;

  -- L0 MUST precede L1 even if the original caller knows the Reading UUID.
  perform public.internal_acquire_official_reader_product_scope_lock_v1(
    p_subject_id, v_product_id
  );
  select count(*), (array_agg(o.product_id))[1]
    into v_count, v_after_product_id
  from public.standard_reading_official_bindings o
  where o.reading_id = p_reading_ref
    and o.subject_id = p_subject_id;
  if v_count <> 1 or v_after_product_id is distinct from v_product_id then
    raise exception using
      errcode = '40001',
      constraint = 'reader_unified_scope_product_drift',
      message = 'Official Reading Product changed during L0 lock';
  end if;

  -- This is a scope lock, NOT proof that this Reader has any valid Grant.
  perform public.internal_acquire_official_reader_scope_lock_v1(
    p_subject_id, p_reading_ref, p_reader_character_id
  );

  select count(*), (array_agg(o.product_id))[1]
    into v_count, v_after_product_id
  from public.standard_reading_official_bindings o
  where o.reading_id = p_reading_ref
    and o.subject_id = p_subject_id;
  if v_count <> 1 or v_after_product_id is distinct from v_product_id then
    raise exception using
      errcode = '40001',
      constraint = 'reader_unified_scope_product_drift',
      message = 'Official Reading Product changed during L1 lock';
  end if;

  return query select v_product_id, p_reading_ref, p_reader_character_id;
end
$unified_existing_scope$;

-- From VERIFIED authoritative Purchase Intent only. Initial Purchase has no
-- Reading UUID yet: acquire L0 alone. Additional Purchase resolves the one
-- existing official Reading and Reader using 1760 candidate: acquire L0→L1.
-- Does NOT apply a Receipt, issue a Grant, bind a Reader, or confer access.
create or replace function public.internal_acquire_official_reader_purchase_scope_v2(
  p_subject_id uuid,
  p_purchase_intent_id uuid
)
returns table (
  purchase_role text,
  product_id uuid,
  reading_ref uuid,
  reader_character_id text
)
language plpgsql
volatile
security invoker
set search_path = pg_catalog, public
as $unified_purchase_scope$
declare
  v_role text;
  v_product_id uuid;
  v_after_role text;
  v_after_product uuid;
  v_reading uuid;
  v_reader text;
  v_after_reading uuid;
  v_after_reader text;
  v_count bigint;
  v_existing record;
begin
  if p_subject_id is null or p_purchase_intent_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'reader_unified_purchase_input_required',
      message = 'Verified Official Reader Purchase Intent is required';
  end if;
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
    raise exception using
      errcode = '25001',
      constraint = 'reader_unified_scope_read_committed_required',
      message = 'Official Reader unified scope requires READ COMMITTED';
  end if;

  select count(*), (array_agg(roles.purchase_role))[1],
         (array_agg(offers.product_id))[1]
    into v_count, v_role, v_product_id
  from public.purchase_intents pi
  join public.product_offers offers on offers.id = pi.product_offer_id
  join public.standard_reading_offer_roles roles
    on roles.product_offer_id = offers.id
   and roles.retired_at is null
   and roles.purchase_role in ('initial_reading', 'additional_reader_interpretation')
  where pi.id = p_purchase_intent_id
    and pi.subject_id = p_subject_id
    and pi.status = 'verified';

  if v_count <> 1 or v_product_id is null then
    raise exception using
      errcode = 'P0001',
      constraint = 'reader_unified_purchase_unique_role_required',
      message = 'One verified Standard Reading Purchase role is required';
  end if;

  if v_role = 'initial_reading' then
    v_after_product := public.internal_qry_official_reader_initial_product_candidate_v1(
      p_subject_id, p_purchase_intent_id
    );
    if v_after_product is distinct from v_product_id then
      raise exception using
        errcode = '40001',
        constraint = 'reader_unified_purchase_product_mismatch',
        message = 'Initial verified Purchase Product scope mismatch';
    end if;
  else
    select candidate.reading_ref, candidate.reader_character_id
      into strict v_reading, v_reader
    from public.internal_qry_official_reader_additional_scope_candidate_v1(
      p_subject_id, p_purchase_intent_id
    ) candidate;
    select o.product_id into strict v_after_product
    from public.standard_reading_official_bindings o
    where o.reading_id = v_reading and o.subject_id = p_subject_id;
    if v_after_product is distinct from v_product_id then
      raise exception using
        errcode = '40001',
        constraint = 'reader_unified_purchase_product_mismatch',
        message = 'Additional Reader Purchase and Official Reading Product mismatch';
    end if;
  end if;

  -- All purchase paths first acquire L0, before L1 and all original writers.
  perform public.internal_acquire_official_reader_product_scope_lock_v1(
    p_subject_id, v_product_id
  );

  select count(*), (array_agg(roles.purchase_role))[1],
         (array_agg(offers.product_id))[1]
    into v_count, v_after_role, v_after_product
  from public.purchase_intents pi
  join public.product_offers offers on offers.id = pi.product_offer_id
  join public.standard_reading_offer_roles roles
    on roles.product_offer_id = offers.id
   and roles.retired_at is null
   and roles.purchase_role in ('initial_reading', 'additional_reader_interpretation')
  where pi.id = p_purchase_intent_id
    and pi.subject_id = p_subject_id and pi.status = 'verified';

  if v_count <> 1 or v_after_role is distinct from v_role
     or v_after_product is distinct from v_product_id then
    raise exception using
      errcode = '40001',
      constraint = 'reader_unified_purchase_scope_drift',
      message = 'Verified Purchase role/Product changed during L0 lock';
  end if;

  if v_role = 'initial_reading' then
    v_after_product := public.internal_qry_official_reader_initial_product_candidate_v1(
      p_subject_id, p_purchase_intent_id
    );
    if v_after_product is distinct from v_product_id then
      raise exception using
        errcode = '40001',
        constraint = 'reader_unified_purchase_scope_drift',
        message = 'Initial Reader selection/policy changed during L0 lock';
    end if;
    return query select v_role, v_product_id, null::uuid, null::text;
    return;
  end if;

  -- Already owns L0; this existing-Reading resolver re-acquires the same
  -- transaction lock, then acquires L1. Never take a new L0 after holding L1.
  select candidate.reading_ref, candidate.reader_character_id
    into strict v_after_reading, v_after_reader
  from public.internal_qry_official_reader_additional_scope_candidate_v1(
    p_subject_id, p_purchase_intent_id
  ) candidate;
  if v_after_reading is distinct from v_reading
     or v_after_reader is distinct from v_reader then
    raise exception using
      errcode = '40001',
      constraint = 'reader_unified_purchase_scope_drift',
      message = 'Additional Reader official source changed during L0 lock';
  end if;

  select * into strict v_existing
  from public.internal_acquire_official_reader_existing_scope_v2(
    p_subject_id, v_reading, v_reader
  );
  if v_existing.product_id is distinct from v_product_id then
    raise exception using
      errcode = '40001',
      constraint = 'reader_unified_purchase_scope_drift',
      message = 'Additional Reader bound Product differs after L1 lock';
  end if;

  select candidate.reading_ref, candidate.reader_character_id
    into strict v_after_reading, v_after_reader
  from public.internal_qry_official_reader_additional_scope_candidate_v1(
    p_subject_id, p_purchase_intent_id
  ) candidate;
  if v_after_reading is distinct from v_reading
     or v_after_reader is distinct from v_reader then
    raise exception using
      errcode = '40001',
      constraint = 'reader_unified_purchase_scope_drift',
      message = 'Additional Reader source changed during L1 lock';
  end if;

  return query select v_role, v_product_id, v_reading, v_reader;
end
$unified_purchase_scope$;

revoke all on function public.internal_acquire_official_reader_existing_scope_v2(
  uuid,uuid,text
) from public;
revoke all on function public.internal_acquire_official_reader_purchase_scope_v2(
  uuid,uuid
) from public;

do $unified_scope_acl$
declare
  v_role text;
begin
  for v_role in
    select rolname from pg_catalog.pg_roles
    where rolname in ('anon','authenticated','service_role',
                      'myeongha_api_executor','myeongha_commerce_internal_executor',
                      'myeongha_seyeon_chat_runtime_owner')
  loop
    execute pg_catalog.format(
      'revoke all on function public.internal_acquire_official_reader_existing_scope_v2(uuid,uuid,text) from %I',
      v_role
    );
    execute pg_catalog.format(
      'revoke all on function public.internal_acquire_official_reader_purchase_scope_v2(uuid,uuid) from %I',
      v_role
    );
  end loop;
end
$unified_scope_acl$;

comment on function public.internal_acquire_official_reader_existing_scope_v2(uuid,uuid,text)
  is 'D1 PRIVATE verified subject-owned Official Reading Product L0 followed by Reader L1 transaction locks. Not access, Product policy, Commerce, T2, or reveal authority.';
comment on function public.internal_acquire_official_reader_purchase_scope_v2(uuid,uuid)
  is 'D1 PRIVATE verified purchase role resolver: initial L0 only, additional L0 then L1, no mutations or public execution. All existing Writer cutovers still on HOLD.';
