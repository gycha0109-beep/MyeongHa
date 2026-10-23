-- S2 forward-only correction: lock the exact official Reading for this
-- purchase, not every historical Reading with the same Subject and Product.
-- An earlier Birth revision may retain an immutable official Reading while a
-- new initial purchase is for the current revision's different Reading.
-- No protected paid body, runtime grant or Production activation.
-- Watchtower-Track: db-authority-core

create or replace function public.internal_assert_reader_receipt_scope_prelocked_v1(
  p_receipt_id uuid
)
returns void
language plpgsql volatile security invoker
set search_path=pg_catalog,public
as $reader_receipt_exact_scope_guard$
declare
  v_subject uuid;
  v_intent uuid;
  v_reader text;
  v_bound_reader text;
  v_product uuid;
  v_purchase_role text;
  v_reading uuid;
  v_reading_count bigint;
  v_pending text;
  v_lock_identity text;
  v_lock_key bigint;
begin
  if p_receipt_id is null then return; end if;

  -- Authoritative stored purchase / selection, never caller-supplied Reader.
  -- Non-Reader Commerce receipts retain their original writer behavior.
  select cr.subject_id,cr.purchase_intent_id,prs.reader_character_id,
         po.product_id,sror.purchase_role
    into v_subject,v_intent,v_reader,v_product,v_purchase_role
  from public.commerce_receipts cr
  join public.purchase_intents pi
    on pi.id=cr.purchase_intent_id and pi.subject_id=cr.subject_id
   and pi.product_offer_id=cr.product_offer_id
  join public.product_offers po on po.id=pi.product_offer_id
  join public.purchase_intent_reader_selections prs
    on prs.purchase_intent_id=pi.id and prs.product_id=po.product_id
  join public.standard_reading_delivery_policies dp
    on dp.product_id=prs.product_id and dp.retired_at is null
   and dp.reading_identity_mode='official_subject_product_scope_birth_authority'
   and dp.reader_interpretation_mode='per_reader_purchase_grant'
  left join public.standard_reading_offer_roles sror
    on sror.product_offer_id=po.id and sror.retired_at is null
  where cr.id=p_receipt_id;

  if not found then return; end if;

  -- A Reader purchase missing its original offer-role authority must be
  -- rejected, not silently treated as unrelated Commerce by an inner join.
  if v_purchase_role not in ('initial_reading','additional_reader_interpretation')
     or v_purchase_role is null then
    raise exception using errcode='P0001',
      constraint='official_reader_s2_receipt_purchase_role_missing',
      message='Stored Reader purchase role is unavailable';
  end if;

  if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
    raise exception using errcode='25001',
      constraint='official_reader_s2_receipt_guard_read_committed_required',
      message='Reader Receipt writer requires READ COMMITTED';
  end if;
  perform public.assert_myeongha_subject_context_v1(v_subject);

  -- Existing purchase replay must lock the immutable bound Reading, even if
  -- the member has subsequently changed their current Birth revision.
  select a.official_reading_id,a.reader_character_id
    into v_reading,v_bound_reader
  from public.standard_reading_reader_access_grants a
  where a.purchase_intent_id=v_intent and a.subject_id=v_subject;

  if found then
    if v_reading is null
       or v_bound_reader is distinct from v_reader
       or not exists (
         select 1 from public.standard_reading_official_bindings o
         where o.reading_id=v_reading and o.subject_id=v_subject
           and o.product_id=v_product
       ) then
      raise exception using errcode='40001',
        constraint='official_reader_s2_receipt_existing_scope_changed',
        message='Bound Reader purchase no longer matches stored official scope';
    end if;
  else
    -- Resolve exactly the official identity selected by the current Birth
    -- revision, Product spec and domain capability (same keys as 1810 bind).
    -- Historical Readings for other revisions are NOT competing lock scopes.
    select count(distinct o.reading_id),min(o.reading_id::text)::uuid
      into v_reading_count,v_reading
    from public.standard_reading_product_specs sp
    join public.birth_profiles bp
      on bp.subject_id=v_subject and bp.profile_kind='self'
     and bp.archived_at is null
    join public.saju_domain_runtime domain
      on domain.saju_domain=sp.saju_domain
    join public.standard_reading_official_bindings o
      on o.subject_id=v_subject and o.product_id=v_product
     and o.source_birth_revision_id=bp.current_revision_id
     and o.topic_key=sp.topic_key and o.saju_domain=sp.saju_domain
     and o.reading_period=sp.reading_period
     and o.reading_variant=sp.reading_variant
     and o.product_spec_version=sp.spec_version
     and o.domain_capability_version=domain.capability_version
    where sp.product_id=v_product and sp.retired_at is null;

    if v_reading_count>1 then
      raise exception using errcode='40001',
        constraint='official_reader_s2_receipt_scope_ambiguous',
        message='Multiple current official Readings require one exact scope';
    end if;

    if v_reading_count=0 then
      -- Receipt/Capability fulfillment may precede the official bind for
      -- BOTH purchase roles (existing 1090 fixture and 1760 orchestration).
      -- Actual 1220 access binding separately enforces an existing committed
      -- official Reading for additional Reader access. Never grant access
      -- merely because this receipt-side pending lock is present.
      v_pending:=pg_catalog.current_setting(
        'myeongha.reader_pending_reading_id',true
      );
      if v_pending is null
         or v_pending !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception using errcode='P0001',
          constraint='official_reader_s2_initial_receipt_scope_required',
          message='Initial Reader receipt requires prelocked proposed official Reading';
      end if;
      v_reading:=v_pending::uuid;
    end if;
  end if;

  -- Same S1 key as 1740, verified as actually held BEFORE receipt row locks.
  v_lock_identity:='myeongha:official-reader:scope-lock:v1:'
    ||v_subject::text||':'||v_reading::text||':'
    ||pg_catalog.octet_length(v_reader)::text||':'||v_reader;
  v_lock_key:=pg_catalog.hashtextextended(v_lock_identity,1827::bigint);

  if not exists (
    select 1 from pg_catalog.pg_locks l
    where l.pid=pg_catalog.pg_backend_pid()
      and l.locktype='advisory' and l.mode='ExclusiveLock'
      and l.granted and l.objsubid=1
      and l.classid=((v_lock_key >> 32) & 4294967295::bigint)::oid
      and l.objid=(v_lock_key & 4294967295::bigint)::oid
  ) then
    raise exception using errcode='P0001',
      constraint='official_reader_s2_legacy_receipt_scope_lock_required',
      message='Legacy Reader receipt writer cannot bypass the S1 scope lock';
  end if;
end
$reader_receipt_exact_scope_guard$;

revoke all on function public.internal_assert_reader_receipt_scope_prelocked_v1(uuid)
  from public;
do $reader_exact_scope_acl$
declare v_role text;
begin
  for v_role in select rolname from pg_catalog.pg_roles
    where rolname in ('anon','authenticated','service_role',
      'myeongha_api_executor','myeongha_commerce_internal_executor',
      'myeongha_seyeon_chat_runtime_owner')
  loop
    execute pg_catalog.format(
      'revoke all on function public.internal_assert_reader_receipt_scope_prelocked_v1(uuid) from %I',
      v_role);
  end loop;
end
$reader_exact_scope_acl$;

comment on function public.internal_assert_reader_receipt_scope_prelocked_v1(uuid) is
'S2 receipt prelock uses exact bound or current Birth/Spec/Domain official Reading; other historical Subject-Product Readings are not valid scopes. Initial unbound only via prelocked pending ID, replay uses stored Reading, no protected paid persistence/public authority.';
