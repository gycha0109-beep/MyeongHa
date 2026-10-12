-- D1 PRIVATE, multiple canonical Product L0 keys BEFORE every Reading×Reader L1.
-- Watchtower-Track: db-authority-core
--
-- PRODUCT LOCKSET IS A LOCK-ONLY PRIMITIVE. A Product UUID from a caller is
-- never a Reader Grant, ownership assertion, checkout permission, or paid T2.
-- For Reading-bound calls products MUST be resolved from immutable official
-- bindings in this DB, not caller-proposed Product IDs.
-- No runtime role EXECUTE; no existing 1080/1090/1220/0220 Writer cutover.

create or replace function public.internal_acquire_official_reader_product_lockset_v1(
  p_subject_id uuid,
  p_product_ids uuid[]
)
returns integer
language plpgsql
volatile
security invoker
set search_path = pg_catalog, public
as $ordered_product_lockset$
declare
  v_count integer;
  v_unique_count integer;
  v_spec_count integer;
  v_product uuid;
begin
  if p_subject_id is null or p_product_ids is null
     or pg_catalog.array_ndims(p_product_ids) is distinct from 1
     or pg_catalog.cardinality(p_product_ids) not between 1 and 64 then
    raise exception using errcode='23514',
      constraint='reader_multi_product_lockset_invalid',
      message='Official Reader Product lockset requires one to 64 Products';
  end if;
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
    raise exception using errcode='25001',
      constraint='reader_multi_scope_read_committed_required',
      message='Official Reader lockset requires READ COMMITTED';
  end if;
  if exists (select 1 from pg_catalog.unnest(p_product_ids) as p(id) where p.id is null) then
    raise exception using errcode='23514',
      constraint='reader_multi_product_lockset_invalid',
      message='Official Reader Product lockset includes NULL';
  end if;

  select count(distinct ids.id)::integer,
         count(distinct spec.product_id)::integer
  into v_unique_count, v_spec_count
  from pg_catalog.unnest(p_product_ids) as ids(id)
  left join public.standard_reading_product_specs spec
    on spec.product_id=ids.id;

  if v_unique_count < 1 or v_unique_count <> v_spec_count then
    raise exception using errcode='P0001',
      constraint='reader_multi_product_scope_unknown',
      message='Official Reader Product lockset contains a non-Standard Product';
  end if;

  -- Must never lock in caller-provided array order.
  for v_product in
    select distinct ids.id
    from pg_catalog.unnest(p_product_ids) as ids(id)
    order by ids.id
  loop
    perform public.internal_acquire_official_reader_product_scope_lock_v1(
      p_subject_id,v_product
    );
    v_count:=coalesce(v_count,0)+1;
  end loop;

  -- Even lock-only calls fail closed if a Product ceased to be a Standard
  -- Product during an advisory wait. No saleability assertion is implied.
  select count(distinct spec.product_id)::integer into v_spec_count
  from pg_catalog.unnest(p_product_ids) as ids(id)
  join public.standard_reading_product_specs spec on spec.product_id=ids.id;
  if v_spec_count <> v_unique_count then
    raise exception using errcode='40001',
      constraint='reader_multi_product_scope_drift',
      message='Official Reader Product lockset changed during lock acquisition';
  end if;
  return v_count;
end
$ordered_product_lockset$;

create or replace function public.internal_acquire_official_reader_reading_lockset_v1(
  p_subject_id uuid,
  p_reading_refs uuid[],
  p_reader_character_ids text[]
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
as $ordered_reading_lockset$
declare
  v_before jsonb;
  v_after jsonb;
  v_scope_count integer;
  v_matched_count integer;
  v_products uuid[];
  v_scope record;
begin
  if p_subject_id is null or p_reading_refs is null
     or p_reader_character_ids is null
     or pg_catalog.array_ndims(p_reading_refs) is distinct from 1
     or pg_catalog.array_ndims(p_reader_character_ids) is distinct from 1
     or pg_catalog.cardinality(p_reading_refs) not between 1 and 64
     or pg_catalog.cardinality(p_reading_refs) <>
        pg_catalog.cardinality(p_reader_character_ids) then
    raise exception using errcode='23514',
      constraint='reader_multi_reading_lockset_invalid',
      message='Official Reader Reading and Reader locksets require matching arrays';
  end if;
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
    raise exception using errcode='25001',
      constraint='reader_multi_scope_read_committed_required',
      message='Official Reader lockset requires READ COMMITTED';
  end if;

  if exists (
    select 1 from ROWS FROM (
      pg_catalog.unnest(p_reading_refs),
      pg_catalog.unnest(p_reader_character_ids)
    ) as input(reading_ref, reader_id)
    where reading_ref is null or reader_id is null
       or reader_id <> pg_catalog.btrim(reader_id)
       or pg_catalog.btrim(reader_id) = ''
       or pg_catalog.length(reader_id) > 256
       or reader_id ~ '[[:cntrl:]]'
  ) then
    raise exception using errcode='23514',
      constraint='reader_multi_reading_lockset_invalid',
      message='Official Reader lockset includes an invalid Reader or Reading';
  end if;

  -- The only source of Product identity is each official Reading binding.
  -- Caller-selected Readers are LOCK TARGETS only; no permission is granted.
  with requested as (
    select distinct input.reading_ref, input.reader_id
    from ROWS FROM (
      pg_catalog.unnest(p_reading_refs),
      pg_catalog.unnest(p_reader_character_ids)
    ) as input(reading_ref, reader_id)
  )
  select count(*)::integer,
         count(o.product_id)::integer,
         pg_catalog.jsonb_agg(
           pg_catalog.jsonb_build_array(
             requested.reading_ref::text,requested.reader_id,o.product_id::text
           ) order by requested.reading_ref, requested.reader_id
         ),
         pg_catalog.array_agg(distinct o.product_id order by o.product_id)
  into v_scope_count,v_matched_count,v_before,v_products
  from requested
  left join public.standard_reading_official_bindings o
    on o.reading_id=requested.reading_ref
   and o.subject_id=p_subject_id;

  if v_scope_count < 1 or v_matched_count <> v_scope_count then
    raise exception using errcode='P0001',
      constraint='reader_multi_official_binding_required',
      message='Each Reading lock target must have one canonical Official binding';
  end if;

  -- Acquire ALL Products first, including multiple Products, in UUID order.
  perform public.internal_acquire_official_reader_product_lockset_v1(
    p_subject_id,v_products
  );

  with requested as (
    select distinct input.reading_ref,input.reader_id
    from ROWS FROM (
      pg_catalog.unnest(p_reading_refs),
      pg_catalog.unnest(p_reader_character_ids)
    ) as input(reading_ref, reader_id)
  )
  select pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_array(
      requested.reading_ref::text,requested.reader_id,o.product_id::text
    ) order by requested.reading_ref,requested.reader_id
  ) into v_after
  from requested
  left join public.standard_reading_official_bindings o
    on o.reading_id=requested.reading_ref and o.subject_id=p_subject_id;

  if v_after is distinct from v_before then
    raise exception using errcode='40001',
      constraint='reader_multi_official_scope_drift',
      message='Official Reader lockset changed during Product lock acquisition';
  end if;

  -- L1 is globally sorted; NEVER acquire a new Product lock after this point.
  for v_scope in
    select distinct input.reading_ref,input.reader_id
    from ROWS FROM (
      pg_catalog.unnest(p_reading_refs),
      pg_catalog.unnest(p_reader_character_ids)
    ) as input(reading_ref, reader_id)
    order by input.reading_ref,input.reader_id
  loop
    perform public.internal_acquire_official_reader_scope_lock_v1(
      p_subject_id,v_scope.reading_ref,v_scope.reader_id
    );
  end loop;

  with requested as (
    select distinct input.reading_ref,input.reader_id
    from ROWS FROM (
      pg_catalog.unnest(p_reading_refs),
      pg_catalog.unnest(p_reader_character_ids)
    ) as input(reading_ref, reader_id)
  )
  select pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_array(
      requested.reading_ref::text,requested.reader_id,o.product_id::text
    ) order by requested.reading_ref,requested.reader_id
  ) into v_after
  from requested
  left join public.standard_reading_official_bindings o
    on o.reading_id=requested.reading_ref and o.subject_id=p_subject_id;

  if v_after is distinct from v_before then
    raise exception using errcode='40001',
      constraint='reader_multi_official_scope_drift',
      message='Official Reader lockset changed during Reader lock acquisition';
  end if;

  return query
  select distinct o.product_id,req.reading_ref,req.reader_id
  from ROWS FROM (
      pg_catalog.unnest(p_reading_refs),
      pg_catalog.unnest(p_reader_character_ids)
    ) as req(reading_ref, reader_id)
  join public.standard_reading_official_bindings o
    on o.reading_id=req.reading_ref and o.subject_id=p_subject_id
  order by req.reading_ref,req.reader_id;
end
$ordered_reading_lockset$;

revoke all on function public.internal_acquire_official_reader_product_lockset_v1(
  uuid,uuid[]
) from public;
revoke all on function public.internal_acquire_official_reader_reading_lockset_v1(
  uuid,uuid[],text[]
) from public;

do $reader_multi_lockset_acl$
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
      'revoke all on function public.internal_acquire_official_reader_product_lockset_v1(uuid,uuid[]) from %I',
      v_role
    );
    execute pg_catalog.format(
      'revoke all on function public.internal_acquire_official_reader_reading_lockset_v1(uuid,uuid[],text[]) from %I',
      v_role
    );
  end loop;
end
$reader_multi_lockset_acl$;

comment on function public.internal_acquire_official_reader_product_lockset_v1(uuid,uuid[])
  is 'D1 PRIVATE product-only multi-lock: sorted distinct Subject×Standard Product L0 advisory locks. Product input is not Grant ownership, policy, sale or T2 authorization.';
comment on function public.internal_acquire_official_reader_reading_lockset_v1(uuid,uuid[],text[])
  is 'D1 PRIVATE source-resolved Reading lockset: all canonical Product L0 first and all Reading×Reader L1 next, sorted. Scope only; zero entitlement or reveal authority.';
