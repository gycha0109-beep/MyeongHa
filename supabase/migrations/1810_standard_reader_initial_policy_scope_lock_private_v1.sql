-- CAP-B2/S3 pre-binding stable initial Reading scope + exact Product policy
-- transaction locks. STAGED PRIVATE ONLY; NO paid Writer/public EXECUTE.
-- Watchtower-Track: applizing
--
-- Stable initial key never uses a proposed or client-provided Reading UUID.
-- It uses canonical Subject, current verified Product/spec/Birth source identity,
-- topic/domain/period/variant and current Saju domain capability revision.
-- All writers must use the same initial-scope protocol before actual cutover.
-- Product approval/withdrawal INSERT triggers take a coarser Product-wide
-- transaction lock before row mutation; the additional Reader binder takes
-- that lock before its original Receipt/Grant/Purchase row locks.
--
-- Do not treat an initial scope lock as a valid Receipt, Grant or Reading.
-- First-Reader mutation remains blocked pending all-Commerce-writer adoption.

create or replace function public.internal_acquire_standard_reader_product_policy_lock_v1(
  p_product_id uuid
)
returns void
language plpgsql volatile security invoker
set search_path = pg_catalog, public
as $b2_policy_lock$
begin
  if p_product_id is null then
    raise exception using errcode = '23514',
      constraint = 'standard_b2_policy_lock_product_required',
      message = 'Standard Reader policy lock requires an exact Product';
  end if;
  -- Same key for ALL revisions, domains, Standard/Premium kinds of Product.
  -- A coarse lock is safer than missing a new overlapping revision insert.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'myeongha:standard-reader:product-policy:v1:' || p_product_id::text,
      1828::bigint
    )
  );
end
$b2_policy_lock$;

revoke all on function public.internal_acquire_standard_reader_product_policy_lock_v1(uuid)
  from public;

create or replace function public.tr_standard_reader_product_policy_insert_lock_v1()
returns trigger
language plpgsql volatile security invoker
set search_path = pg_catalog, public
as $b2_product_trigger$
begin
  -- Apply to every private administrative INSERT, including direct SQL:
  -- writers cannot bypass the policy lock by skipping a wrapper.
  perform public.internal_acquire_standard_reader_product_policy_lock_v1(
    new.product_id
  );
  return new;
end
$b2_product_trigger$;

create trigger tr_standard_reader_rule_insert_scope_lock_v1
before insert on public.standard_reader_product_approved_rules_v1
for each row execute function public.tr_standard_reader_product_policy_insert_lock_v1();

create trigger tr_standard_reader_withdrawal_insert_scope_lock_v1
before insert on public.standard_reader_product_rule_withdrawals_v1
for each row execute function public.tr_standard_reader_product_policy_insert_lock_v1();

revoke all on function public.tr_standard_reader_product_policy_insert_lock_v1()
  from public;

-- Server-owned preflight. Candidate only: no Receipt, Grant or Release checked.
-- A new initial Purchase Intent MUST pin one Reader, but its Reader identity
-- is deliberately NOT part of the official Reading lock key.
create or replace function public.internal_qry_official_reader_initial_scope_candidate_v1(
  p_subject_id uuid,
  p_purchase_intent_id uuid
)
returns table(scope_identity text, product_id uuid, source_birth_revision_id uuid)
language plpgsql volatile security invoker
set search_path = pg_catalog, public
as $b2_initial_candidate$
declare
  v_count bigint;
  v_scope text;
  v_product uuid;
  v_birth uuid;
begin
  if p_subject_id is null or p_purchase_intent_id is null then
    raise exception using errcode = '23514',
      constraint = 'standard_b2_initial_purchase_identity_required',
      message = 'Initial Reader scope requires subject and Purchase Intent';
  end if;
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
    raise exception using errcode = '25001',
      constraint = 'standard_b2_initial_read_committed_required',
      message = 'Initial Reader scope requires READ COMMITTED';
  end if;
  with candidate as materialized (
    select po.product_id, bp.current_revision_id,
      pg_catalog.jsonb_build_array(
        'myeongha:official-reading:initial-lock:v1',
        p_subject_id, po.product_id, bp.current_revision_id,
        spec.topic_key, spec.saju_domain, spec.reading_period,
        spec.reading_variant, spec.spec_version, domain.capability_version
      )::text as derived_key
    from public.purchase_intents pi
    join public.product_offers po
      on po.id = pi.product_offer_id
     and po.enabled = true
    join public.purchase_intent_reader_selections selected
      on selected.purchase_intent_id = pi.id
     and selected.product_id = po.product_id
     and selected.reader_character_id is not null
     and btrim(selected.reader_character_id) <> ''
     and selected.reader_content_bundle_id is not null
    join public.standard_reading_offer_roles role
      on role.product_offer_id = po.id
     and role.purchase_role = 'initial_reading'
     and role.retired_at is null
    join public.standard_reading_product_specs spec
      on spec.product_id = po.product_id
     and spec.retired_at is null
     and spec.reader_selection_mode = 'required'
     and spec.purchase_unit_mode = 'topic_reader_reading'
     and spec.capability_set_id = pi.capability_set_id
    join public.standard_reading_delivery_policies policy
      on policy.product_id = spec.product_id
     and policy.retired_at is null
     and policy.reading_identity_mode = 'official_subject_product_scope_birth_authority'
     and policy.reader_interpretation_mode = 'per_reader_purchase_grant'
    join public.birth_profiles bp
      on bp.subject_id = pi.subject_id
     and bp.profile_kind = 'self'
     and bp.archived_at is null
     and bp.current_revision_id is not null
    join public.saju_domain_runtime domain
      on domain.saju_domain = spec.saju_domain
     and domain.availability <> 'unavailable'
     and domain.capability_version is not null
     and btrim(domain.capability_version) <> ''
    where pi.id = p_purchase_intent_id
      and pi.subject_id = p_subject_id
      and pi.status = 'verified'
  )
  select count(*), (array_agg(c.derived_key))[1],
         (array_agg(c.product_id))[1],
         (array_agg(c.current_revision_id))[1]
    into v_count, v_scope, v_product, v_birth
  from candidate c;
  if v_count <> 1 or v_scope is null
     or v_product is null or v_birth is null then
    raise exception using errcode = 'P0001',
      constraint = 'standard_b2_initial_unique_scope_required',
      message = 'One DB-derived verified initial Reading Product/Birth scope is required';
  end if;
  return query select v_scope, v_product, v_birth;
end
$b2_initial_candidate$;

revoke all on function public.internal_qry_official_reader_initial_scope_candidate_v1(uuid,uuid)
  from public;

-- A complete, single trusted transaction is mandatory. Re-read after waiting
-- to reject spec/Birth/role drift; do not lock a proposed Reading ID.
create or replace function public.internal_acquire_official_reader_initial_purchase_lock_v1(
  p_subject_id uuid,
  p_purchase_intent_id uuid
)
returns table(scope_identity text, product_id uuid, source_birth_revision_id uuid)
language plpgsql volatile security invoker
set search_path = pg_catalog, public
as $b2_initial_lock$
declare
  v_before record;
  v_after record;
begin
  select * into strict v_before
  from public.internal_qry_official_reader_initial_scope_candidate_v1(
    p_subject_id,p_purchase_intent_id
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_before.scope_identity, 1830::bigint)
  );
  select * into strict v_after
  from public.internal_qry_official_reader_initial_scope_candidate_v1(
    p_subject_id,p_purchase_intent_id
  );
  if v_after.scope_identity is distinct from v_before.scope_identity
     or v_after.product_id is distinct from v_before.product_id
     or v_after.source_birth_revision_id is distinct from
          v_before.source_birth_revision_id then
    raise exception using errcode = '40001',
      constraint = 'standard_b2_initial_scope_drift',
      message = 'Initial Reader scope identity changed while obtaining transaction lock';
  end if;
  return query
    select v_after.scope_identity, v_after.product_id,
           v_after.source_birth_revision_id;
end
$b2_initial_lock$;

revoke all on function public.internal_acquire_official_reader_initial_purchase_lock_v1(uuid,uuid)
  from public;

do $b2_s3_acl$
declare v_role text;
begin
  for v_role in
    select rolname from pg_catalog.pg_roles
    where rolname in (
      'anon','authenticated','service_role','myeongha_api_executor',
      'myeongha_commerce_internal_executor','myeongha_seyeon_chat_runtime_owner'
    )
  loop
    execute pg_catalog.format(
      'revoke all on function public.internal_acquire_standard_reader_product_policy_lock_v1(uuid) from %I',v_role
    );
    execute pg_catalog.format(
      'revoke all on function public.internal_qry_official_reader_initial_scope_candidate_v1(uuid,uuid) from %I',v_role
    );
    execute pg_catalog.format(
      'revoke all on function public.internal_acquire_official_reader_initial_purchase_lock_v1(uuid,uuid) from %I',v_role
    );
  end loop;
end
$b2_s3_acl$;

comment on function public.internal_acquire_official_reader_initial_purchase_lock_v1(uuid,uuid)
  is 'S3 private stable first-Reading transaction lock contract only; NO Grant/Reader access/T2 or live initial Writer. Subject Product Birth source and official Reading semantics, no client proposed Reading UUID.';
