-- Saju Record-scoped Capability authority and privacy-bound scope identity.
-- Additive only: no Product/Offer seed, public route, provider charge, refund POST or LIVE sale.
begin;

alter table public.product_capability_items
  drop constraint product_capability_items_scope_mode_check,
  drop constraint product_capability_items_scope_shape_check;
alter table public.product_capability_items
  add constraint product_capability_items_scope_mode_check
    check (scope_mode in ('global','fixed','saju_record')),
  add constraint product_capability_items_scope_shape_check
    check (
      (scope_mode='global' and fixed_scope_key is null)
      or (scope_mode='fixed' and fixed_scope_key is not null and btrim(fixed_scope_key)<>'')
      or (scope_mode='saju_record' and fixed_scope_key is null)
    );

-- Forward-only Saju Record Commerce authority. No Product/Offer seeds, public route,
-- provider execution, charge, refund POST or LIVE sale is enabled by this migration.
-- A Record's opaque scope identity is private and never accepted from a client.

create table public.commerce_saju_records_v1 (
  id uuid primary key,
  subject_id uuid not null,
  entitlement_scope_id uuid not null default gen_random_uuid(),
  birth_revision_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint commerce_saju_records_subject_unique unique (id, subject_id),
  constraint commerce_saju_records_entitlement_scope_unique unique (entitlement_scope_id),
  constraint commerce_saju_records_birth_subject_fk
    foreign key (birth_revision_id, subject_id)
    references public.birth_profile_revisions (id, subject_id),
  constraint commerce_saju_records_subject_fk
    foreign key (subject_id) references public.subjects (id)
);

create table public.commerce_saju_purchase_origins_v1 (
  purchase_intent_id uuid primary key,
  subject_id uuid not null,
  saju_record_id uuid not null,
  birth_revision_id uuid not null,
  purchase_kind text not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint commerce_saju_purchase_origins_intent_subject_fk
    foreign key (purchase_intent_id, subject_id)
    references public.purchase_intents (id, subject_id),
  constraint commerce_saju_purchase_origins_record_subject_fk
    foreign key (saju_record_id, subject_id)
    references public.commerce_saju_records_v1 (id, subject_id),
  constraint commerce_saju_purchase_origins_birth_subject_fk
    foreign key (birth_revision_id, subject_id)
    references public.birth_profile_revisions (id, subject_id),
  constraint commerce_saju_purchase_origins_kind_check
    check (purchase_kind in ('original', 'upgrade'))
);
create index commerce_saju_purchase_origins_record_idx
  on public.commerce_saju_purchase_origins_v1(subject_id, saju_record_id, birth_revision_id);


-- This short-lived collision inventory mirrors the already reviewed 13-product
-- Saju quote policy. It is NOT Product Capability/Entitlement authority. Only
-- pending Origin arbitration consults these field sets. Unknown keys HOLD.
-- Never deploy as a general-purpose authorization or public RPC.
create function public.internal_commerce_saju_candidate_overlap_fields_v1(
  p_product_key text
) returns text[]
language sql immutable strict security invoker
set search_path=pg_catalog,public
as $saju_overlap_fields$
  select case p_product_key
    when 'standard.career' then array['career']::text[]
    when 'standard.wealth' then array['wealth']::text[]
    when 'standard.love_relationship' then array['relationship']::text[]
    when 'standard.business' then array['business']::text[]
    when 'standard.family' then array['family']::text[]
    when 'standard.spouse' then array['spouse']::text[]
    when 'standard.year' then array['year']::text[]
    when 'standard.month' then array['month']::text[]
    when 'standard.compatibility' then array['compatibility']::text[]
    when 'standard.current_concern' then array['current_concern']::text[]
    when 'bundle.career_economy' then array['career','wealth','business']::text[]
    when 'bundle.love_relationship' then array['relationship','family','spouse']::text[]
    when 'bundle.full_saju' then array['career','wealth','business','relationship','family','spouse']::text[]
    else null::text[]
  end
$saju_overlap_fields$;
revoke all on function public.internal_commerce_saju_candidate_overlap_fields_v1(text)
 from public,anon,authenticated,service_role,myeongha_api_executor;

-- Keep the exact Birth revision stable while an Intent is bound to a
-- Saju Record. The Record row FOR UPDATE serializes both this association and
-- unresolved-Intent admission against concurrent inserts. The reviewed
-- Saju product field inventory blocks overlap among pending single/bundle
-- purchases. This is NOT entitlement authority or payment admission.
create or replace function public.tr_commerce_saju_origin_revision_lock_v1()
returns trigger language plpgsql security invoker
set search_path = pg_catalog, public as $saju_origin_lock$
declare
  v_record_birth_revision uuid;
  v_new_product_id uuid;
  v_new_product_key text;
  v_new_fields text[];
  v_new_intent_status text;
begin
  -- Always acquire the same Record lock BEFORE inspecting other pending
  -- intents. Competing inserts for this same Record must observe the first
  -- committed origin after the lock is released (READ COMMITTED only).
  select r.birth_revision_id into v_record_birth_revision
  from public.commerce_saju_records_v1 r
  where r.id=new.saju_record_id and r.subject_id=new.subject_id
  for update;
  if not found
    or v_record_birth_revision is distinct from new.birth_revision_id then
    raise exception 'SAJU_ORIGIN_RECORD_REVISION_MISMATCH';
  end if;

  select pi.status, po.product_id, product.product_key
    into v_new_intent_status, v_new_product_id, v_new_product_key
  from public.purchase_intents pi
  join public.product_offers po on po.id=pi.product_offer_id
  join public.products product on product.id=po.product_id
  where pi.id=new.purchase_intent_id
    and pi.subject_id=new.subject_id;
  if not found or v_new_product_id is null then
    raise exception 'SAJU_ORIGIN_INTENT_PRODUCT_UNAVAILABLE';
  end if;

  if v_new_intent_status in ('created','pending') then
    -- A stale repeatable-read snapshot cannot safely act as a lock-based
    -- admission check even if it successfully acquired a Record row lock.
    if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
      raise exception 'SAJU_PENDING_ORIGIN_REQUIRES_READ_COMMITTED';
    end if;
    if exists (
      select 1
      from public.commerce_saju_purchase_origins_v1 prior
      join public.purchase_intents prior_pi
        on prior_pi.id=prior.purchase_intent_id
       and prior_pi.subject_id=prior.subject_id
      join public.product_offers prior_offer
        on prior_offer.id=prior_pi.product_offer_id
      where prior.subject_id=new.subject_id
        and prior.saju_record_id=new.saju_record_id
        and prior.birth_revision_id=new.birth_revision_id
        and prior.purchase_intent_id<>new.purchase_intent_id
        and prior_pi.status in ('created','pending')
        and prior_offer.product_id=v_new_product_id
    ) then
      raise exception 'SAJU_DUPLICATE_PENDING_SAME_PRODUCT';
    end if;
    v_new_fields := public.internal_commerce_saju_candidate_overlap_fields_v1(
      v_new_product_key
    );
    if v_new_fields is null or cardinality(v_new_fields)=0 then
      raise exception 'SAJU_PENDING_PRODUCT_FIELDS_UNAVAILABLE';
    end if;
    -- The existing exact-Product conflict remains separately identifiable.
    -- This second lookup catches overlapping fields across different
    -- Products (for example career single vs career/economy bundle).
    if exists (
      select 1 from public.commerce_saju_purchase_origins_v1 prior
      join public.purchase_intents prior_pi
        on prior_pi.id=prior.purchase_intent_id
       and prior_pi.subject_id=prior.subject_id
      join public.product_offers prior_offer
        on prior_offer.id=prior_pi.product_offer_id
      join public.products prior_product
        on prior_product.id=prior_offer.product_id
      where prior.subject_id=new.subject_id
        and prior.saju_record_id=new.saju_record_id
        and prior.birth_revision_id=new.birth_revision_id
        and prior.purchase_intent_id<>new.purchase_intent_id
        and prior_pi.status in ('created','pending')
        and prior_offer.product_id<>v_new_product_id
        and coalesce(
          public.internal_commerce_saju_candidate_overlap_fields_v1(
            prior_product.product_key
          ) && v_new_fields, true
        )
    ) then
      raise exception 'SAJU_OVERLAPPING_PENDING_PRODUCT';
    end if;
  end if;
  return new;
end;
$saju_origin_lock$;
create trigger tr_commerce_saju_origin_revision_lock_v1
 before insert on public.commerce_saju_purchase_origins_v1
 for each row execute function public.tr_commerce_saju_origin_revision_lock_v1();

-- A previously attached, still-pending Intent must not be verified later
-- against a different Birth revision. This also covers a verified Receipt
-- inserted before its Saju origin is attached (checked by the origin trigger).
-- Ordinary non-Saju/Reader Receipts have no Saju origin and are untouched.
create or replace function public.tr_commerce_saju_verified_receipt_revision_lock_v1()
returns trigger language plpgsql security invoker
set search_path = pg_catalog, public as $saju_receipt_lock$
declare
  v_origin public.commerce_saju_purchase_origins_v1%rowtype;
  v_record_birth_revision uuid;
begin
  -- Sandbox verification is a test fact, never a settled paid purchase.
  -- Only an exact production verified charge may enforce the paid freeze.
  if new.verification_status not in ('verified','revoked')
    or new.environment is distinct from 'production'
    or new.verified_at is null then
    return new;
  end if;
  select * into v_origin
  from public.commerce_saju_purchase_origins_v1 o
  where o.purchase_intent_id=new.purchase_intent_id
    and o.subject_id=new.subject_id;
  if not found then
    return new;
  end if;
  select r.birth_revision_id into v_record_birth_revision
  from public.commerce_saju_records_v1 r
  where r.id=v_origin.saju_record_id and r.subject_id=v_origin.subject_id
  for update;
  if not found
    or v_record_birth_revision is distinct from v_origin.birth_revision_id then
    raise exception 'SAJU_PAID_RECEIPT_RECORD_REVISION_MISMATCH';
  end if;
  return new;
end;
$saju_receipt_lock$;
create trigger tr_commerce_saju_verified_receipt_revision_lock_v1
 before insert or update of verification_status on public.commerce_receipts
 for each row execute function public.tr_commerce_saju_verified_receipt_revision_lock_v1();

-- The child refers to previous REAL receipts, never a package's nominal total.
-- No signed amount can be copied into this link table.
create table public.commerce_saju_upgrade_receipt_links_v1 (
  child_purchase_intent_id uuid not null,
  source_receipt_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint commerce_saju_upgrade_receipt_links_pk
    primary key (child_purchase_intent_id, source_receipt_id),
  constraint commerce_saju_upgrade_receipt_links_child_fk
    foreign key (child_purchase_intent_id)
    references public.commerce_saju_purchase_origins_v1(purchase_intent_id),
  constraint commerce_saju_upgrade_receipt_links_source_fk
    foreign key (source_receipt_id)
    references public.commerce_receipts(id)
);

-- Validate upgrade credit sources at the database boundary as well. Links
-- must resolve a previous verified purchase on the exact same Saju record
-- and source Birth revision. This does not execute any checkout.
create or replace function public.tr_commerce_saju_upgrade_link_source_v1()
returns trigger language plpgsql security invoker
set search_path = pg_catalog, public as $$
declare
  v_child public.commerce_saju_purchase_origins_v1%rowtype;
  v_parent public.commerce_saju_purchase_origins_v1%rowtype;
  v_parent_receipt public.commerce_receipts%rowtype;
  v_child_created_at timestamptz;
begin
  select * into v_child from public.commerce_saju_purchase_origins_v1
  where purchase_intent_id=new.child_purchase_intent_id for update;
  select pi.created_at into v_child_created_at
  from public.purchase_intents pi where pi.id=new.child_purchase_intent_id;
  select * into v_parent_receipt from public.commerce_receipts
  where id=new.source_receipt_id for share;
  select * into v_parent from public.commerce_saju_purchase_origins_v1
  where purchase_intent_id=v_parent_receipt.purchase_intent_id;
  if v_child.purchase_intent_id is null or v_child.purchase_kind<>'upgrade'
    or v_parent.purchase_intent_id is null
    or v_parent.subject_id is distinct from v_child.subject_id
    or v_parent.saju_record_id is distinct from v_child.saju_record_id
    or v_parent.birth_revision_id is distinct from v_child.birth_revision_id
    or v_parent_receipt.subject_id is distinct from v_child.subject_id
    or v_parent_receipt.verification_status <> 'verified'
    or v_parent_receipt.environment <> 'production'
    or v_parent_receipt.verified_at is null
    or v_parent_receipt.verified_at >= v_child_created_at
    or v_parent.purchase_intent_id = v_child.purchase_intent_id
  then
    raise exception 'SAJU_UPGRADE_CREDIT_SOURCE_MISMATCH';
  end if;
  return new;
end;
$$;
create trigger tr_commerce_saju_upgrade_link_source_v1
 before insert on public.commerce_saju_upgrade_receipt_links_v1
 for each row execute function public.tr_commerce_saju_upgrade_link_source_v1();

-- One verified provider cancellation event = one exact settlement row.
-- No percentage, list-price or package allocation is used for upgrade credit.
create table public.commerce_saju_verified_refund_effects_v1 (
  provider_event_id uuid primary key,
  receipt_id uuid not null,
  subject_id uuid not null,
  refunded_minor bigint not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint commerce_saju_verified_refund_effect_receipt_fk
    foreign key (receipt_id, subject_id)
    references public.commerce_receipts(id, subject_id),
  constraint commerce_saju_verified_refund_effect_event_fk
    foreign key (provider_event_id, subject_id)
    references public.commerce_provider_events(id, resolved_subject_id),
  constraint commerce_saju_verified_refund_effect_amount
    check (refunded_minor > 0)
);

-- Untrusted or incomplete refund provenance must never manufacture a net price.
create or replace function public.tr_commerce_saju_refund_effect_verified_v1()
returns trigger language plpgsql security invoker
set search_path = pg_catalog, public as $$
declare
  v_event public.commerce_provider_events%rowtype;
  v_receipt public.commerce_receipts%rowtype;
  v_existing_refunds bigint;
begin
  select * into v_event from public.commerce_provider_events
    where id=new.provider_event_id for update;
  select * into v_receipt from public.commerce_receipts
    where id=new.receipt_id for update;
  if v_event.id is null or v_receipt.id is null
    or v_event.resolved_subject_id is distinct from new.subject_id
    or v_event.resolved_receipt_id is distinct from new.receipt_id
    or v_event.provider is distinct from v_receipt.provider
    or v_event.environment is distinct from 'production'
    or v_event.status not in ('verified', 'processed')
    or v_event.event_type not in
      ('Transaction.Cancelled', 'Transaction.PartialCancelled')
    or v_receipt.environment is distinct from 'production'
    or v_receipt.verified_amount_minor is null
    or v_event.verified_payload_jsonb->>'schemaVersion'
         is distinct from 'commerce-portone-cancellation-source-v2'
    or v_event.verified_payload_jsonb->>'matchingCancellationStatus'
         is distinct from 'SUCCEEDED'
    or v_event.verified_payload_jsonb->>'exactSucceededCancellationAmountMinor'
         is distinct from new.refunded_minor::text
    or v_event.verified_payload_jsonb->>'originalReceiptPaidAmountMinor'
         is distinct from v_receipt.verified_amount_minor::text
    or v_event.verified_payload_jsonb->>'currency'
         is distinct from v_receipt.verified_currency
    or v_event.verified_payload_jsonb->>'cancellationIdHmac'
         !~ '^hmac-sha256:k1:[0-9a-f]{64}$' then
    raise exception 'SAJU_REFUND_SOURCE_NOT_VERIFIED';
  end if;
  select coalesce(sum(r.refunded_minor),0) into v_existing_refunds
  from public.commerce_saju_verified_refund_effects_v1 r
  where r.receipt_id=new.receipt_id;
  if v_existing_refunds+new.refunded_minor > v_receipt.verified_amount_minor then
    raise exception 'SAJU_REFUND_EXCEEDS_VERIFIED_CHARGE';
  end if;
  return new;
end;
$$;
create trigger tr_commerce_saju_refund_effect_verified_v1
 before insert on public.commerce_saju_verified_refund_effects_v1
 for each row execute function public.tr_commerce_saju_refund_effect_verified_v1();

-- Record editing remains permitted before payment. Pending/failed Intent rows
-- are NOT sufficient to freeze this source revision permanently. Checkout-time
-- locking and a later verified-Receipt binding gate remain required.
create or replace function public.tr_commerce_saju_record_paid_revision_guard_v1()
returns trigger language plpgsql security invoker
set search_path = pg_catalog, public as $$
begin
  if tg_op='DELETE' then
    if current_user = (
      select pg_catalog.pg_get_userbyid(proc.proowner)
      from pg_catalog.pg_proc proc
      where proc.oid=pg_catalog.to_regprocedure(
        'public.internal_finalize_account_deletion_db_v1(uuid,uuid,text)'
      )
    ) and pg_catalog.current_setting(
      'myeongha.account_deletion_finalizer_subject_id',true
    )=old.subject_id::text then
      return old;
    end if;
    raise exception 'SAJU_RECORD_DELETE_REQUIRES_ACCOUNT_FINALIZER';
  end if;
  if new.subject_id is distinct from old.subject_id
    or new.id is distinct from old.id
    or new.entitlement_scope_id is distinct from old.entitlement_scope_id
    or new.created_at is distinct from old.created_at then
    raise exception 'SAJU_RECORD_IDENTITY_IMMUTABLE';
  end if;
  if new.birth_revision_id is distinct from old.birth_revision_id
    and exists (
      select 1
      from public.commerce_saju_purchase_origins_v1 origin
      join public.commerce_receipts receipt
        on receipt.purchase_intent_id=origin.purchase_intent_id
        and receipt.subject_id=origin.subject_id
      where origin.saju_record_id=old.id
        and origin.subject_id=old.subject_id
        and receipt.verification_status in ('verified','revoked')
        and receipt.environment = 'production'
        and receipt.verified_at is not null
    ) then
    raise exception 'SAJU_PAID_RECORD_BIRTH_REVISION_FROZEN';
  end if;
  return new;
end;
$$;
create trigger tr_commerce_saju_record_paid_revision_guard_v1
 before update or delete on public.commerce_saju_records_v1
 for each row execute function public.tr_commerce_saju_record_paid_revision_guard_v1();

-- Purchase association itself cannot be retargeted to a different Record.
create or replace function public.tr_commerce_saju_ledger_immutable_v1()
returns trigger language plpgsql security invoker
set search_path = pg_catalog, public as $
declare
  v_subject_id uuid;
  v_finalizer_owner text;
begin
  if tg_op='DELETE' and tg_table_name='commerce_saju_purchase_origins_v1' then
    v_subject_id:=old.subject_id;
  elsif tg_op='DELETE' and tg_table_name='commerce_saju_upgrade_receipt_links_v1' then
    select origin.subject_id into v_subject_id
    from public.commerce_saju_purchase_origins_v1 origin
    where origin.purchase_intent_id=old.child_purchase_intent_id;
  end if;
  select pg_catalog.pg_get_userbyid(proc.proowner) into v_finalizer_owner
  from pg_catalog.pg_proc proc
  where proc.oid=pg_catalog.to_regprocedure(
    'public.internal_finalize_account_deletion_db_v1(uuid,uuid,text)'
  );
  if tg_op='DELETE'
     and v_subject_id is not null
     and current_user=v_finalizer_owner
     and pg_catalog.current_setting(
       'myeongha.account_deletion_finalizer_subject_id',true
     )=v_subject_id::text then
    return old;
  end if;
  raise exception 'SAJU_SOURCE_LEDGER_IMMUTABLE';
end;
$;
create trigger tr_commerce_saju_origin_immutable_v1
 before update or delete on public.commerce_saju_purchase_origins_v1
 for each row execute function public.tr_commerce_saju_ledger_immutable_v1();
create trigger tr_commerce_saju_upgrade_link_immutable_v1
 before update or delete on public.commerce_saju_upgrade_receipt_links_v1
 for each row execute function public.tr_commerce_saju_ledger_immutable_v1();
create trigger tr_commerce_saju_refund_immutable_v1
 before update or delete on public.commerce_saju_verified_refund_effects_v1
 for each row execute function public.tr_commerce_saju_ledger_immutable_v1();

-- No new service principal / public table read or mutation privileges.
revoke all on public.commerce_saju_records_v1,
  public.commerce_saju_purchase_origins_v1,
  public.commerce_saju_upgrade_receipt_links_v1,
  public.commerce_saju_verified_refund_effects_v1 from public,anon,authenticated,service_role,myeongha_api_executor;
grant select on public.commerce_saju_records_v1,
  public.commerce_saju_purchase_origins_v1,
  public.commerce_saju_verified_refund_effects_v1 to myeongha_api_executor;
revoke all on function public.tr_commerce_saju_origin_revision_lock_v1(),
  public.tr_commerce_saju_verified_receipt_revision_lock_v1(),
  public.tr_commerce_saju_refund_effect_verified_v1(),
  public.tr_commerce_saju_record_paid_revision_guard_v1(),
  public.tr_commerce_saju_upgrade_link_source_v1(),
  public.tr_commerce_saju_ledger_immutable_v1() from public;

-- Private read-only snapshot and admission must verify:
--  * linked Receipt/Intent/Product/record/revision/Subject/source integrity,
--  * all upgrade sources are earlier, same-record receipts, and acyclic,
--  * unsettled provider cancellation -> HOLD, not 0 refunded,
--  * receipt unique sum and real settled refund sum,
--  * live ownedFields from exact record-scoped effective Grant aggregate,
--  * unresolved Purchase Intents before charging under a single DB lock,
--  * account-deletion/restore graph includes these new Subject-private rows.


comment on column public.commerce_saju_records_v1.entitlement_scope_id is
  'Server-generated opaque per-Record scope identity. Never client-supplied or returned in public DTOs; deleted with personal Record mapping.';

create or replace function public.internal_apply_entitlement_effect_v1(
  p_source_type text,
  p_source_id uuid,
  p_grant_id uuid,
  p_capability_item_key text,
  p_expected_revision bigint,
  p_expected_last_provider_ordering_key text,
  p_event_type text,
  p_effective_at timestamptz,
  p_target_status text,
  p_target_valid_from timestamptz,
  p_target_valid_until timestamptz,
  p_reason_code text
)
returns table (
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
security invoker
set search_path = pg_catalog, public
as $$
#variable_conflict use_column
declare
  v_as_of timestamptz := transaction_timestamp();
  v_receipt public.commerce_receipts%rowtype;
  v_provider_event public.commerce_provider_events%rowtype;
  v_grant public.entitlement_grants%rowtype;
  v_existing_event public.entitlement_events%rowtype;
  v_product_id uuid;
  v_entitlement_key text;
  v_scope_key text;
  v_scope_mode text;
  v_scope_key_norm text;
  v_grant_key text;
  v_next_ordering_key text;
  v_capability_set_id uuid;
  v_capability_snapshot jsonb;
  v_capability_snapshot_hash text;
  v_capability_definition_version text;
  v_capability_definition_hash text;
  v_capability_product_id uuid;
  v_offer_product_id uuid;
  v_item_match_count integer;
  v_source_event_count integer;
  v_event_id uuid;
  v_event_dedupe_key text;
  v_effect_payload jsonb;
  v_material_grant_change boolean;
  v_grant_inserted boolean := false;
  v_projection_id uuid;
  v_projection_status text;
  v_projection_active_grant_count integer;
  v_projection_effective_valid_until timestamptz;
  v_projection_revision bigint;
  v_projection_changed boolean := false;
  v_outbox_event_id uuid;
begin
  if p_source_type not in ('receipt', 'provider_event') then
    raise exception using errcode = '23514',
      constraint = 'internal_entitlement_effect_source_type_invalid',
      message = 'entitlement effect source type must be receipt or provider_event';
  end if;
  if p_source_id is null then
    raise exception using errcode = '23514',
      constraint = 'internal_entitlement_effect_source_required',
      message = 'entitlement effect source identity is required';
  end if;
  if p_event_type not in ('granted', 'renewed', 'expired', 'revoked', 'restored') then
    raise exception using errcode = '23514',
      constraint = 'internal_entitlement_effect_event_type_invalid',
      message = 'commerce entitlement effect event type is invalid';
  end if;
  if p_effective_at is null or p_target_status is null or p_target_valid_from is null then
    raise exception using errcode = '23514',
      constraint = 'internal_entitlement_effect_target_required',
      message = 'entitlement effect time and target state are required';
  end if;
  if p_target_valid_until is not null and p_target_valid_until < p_target_valid_from then
    raise exception using errcode = '23514',
      constraint = 'internal_entitlement_effect_validity_invalid',
      message = 'entitlement effect target validity interval is invalid';
  end if;
  if p_reason_code is not null and btrim(p_reason_code) = '' then
    raise exception using errcode = '23514',
      constraint = 'internal_entitlement_effect_reason_invalid',
      message = 'entitlement effect reason code cannot be blank';
  end if;
  if (p_event_type in ('granted', 'renewed', 'restored') and p_target_status is distinct from 'active')
     or (p_event_type = 'expired' and p_target_status is distinct from 'expired')
     or (p_event_type = 'revoked' and p_target_status is distinct from 'revoked') then
    raise exception using errcode = '23514',
      constraint = 'internal_entitlement_effect_transition_invalid',
      message = 'entitlement effect event type and target status are inconsistent';
  end if;
  if p_target_status = 'active' and p_target_valid_from > v_as_of then
    raise exception using errcode = '23514',
      constraint = 'internal_entitlement_effect_future_active_denied',
      message = 'future-active entitlement grants are not allowed by MVP authority';
  end if;
  if p_expected_revision is not null and p_expected_revision < 0 then
    raise exception using errcode = '23514',
      constraint = 'internal_entitlement_effect_expected_revision_invalid',
      message = 'expected Grant revision must be non-negative';
  end if;

  if p_source_type = 'receipt' then
    if p_event_type is distinct from 'granted'
       or p_grant_id is not null
       or p_capability_item_key is null or btrim(p_capability_item_key) = ''
       or p_expected_revision is not null
       or p_expected_last_provider_ordering_key is not null then
      raise exception using errcode = '23514',
        constraint = 'internal_entitlement_effect_receipt_shape_invalid',
        message = 'receipt source is only valid for initial pinned-Capability granted effects';
    end if;

    select cr.* into v_receipt
    from public.commerce_receipts cr
    where cr.id = p_source_id
    for update;

    if not found
       or v_receipt.verification_status is distinct from 'verified'
       or v_receipt.environment is distinct from 'production'
       or v_receipt.purchase_intent_id is null
       or v_receipt.product_offer_id is null then
      raise exception using errcode = 'P0001',
        constraint = 'internal_entitlement_effect_receipt_unavailable',
        message = 'production verified receipt authority is unavailable';
    end if;

    select pi.capability_set_id, pi.capability_snapshot_jsonb, pi.capability_snapshot_hash,
           po.product_id, pcs.product_id, pcs.definition_version, pcs.definition_hash,
           pci.entitlement_key,
           pci.scope_mode,
           case
             when pci.scope_mode='global' then null
             when pci.scope_mode='fixed' then pci.fixed_scope_key
             when pci.scope_mode='saju_record' then (
               select 'saju-record:'||record.entitlement_scope_id::text
               from public.commerce_saju_purchase_origins_v1 origin
               join public.commerce_saju_records_v1 record
                 on record.id=origin.saju_record_id
                and record.subject_id=origin.subject_id
                and record.birth_revision_id=origin.birth_revision_id
               where origin.purchase_intent_id=pi.id
                 and origin.subject_id=pi.subject_id
                 and product.product_key in (
                   'standard.career','standard.wealth','standard.love_relationship',
                   'standard.business','standard.family','standard.spouse',
                   'standard.year','standard.month','standard.compatibility',
                   'standard.current_concern','bundle.career_economy',
                   'bundle.love_relationship','bundle.full_saju'
                 )
             )
             else null
           end
      into v_capability_set_id, v_capability_snapshot, v_capability_snapshot_hash,
           v_offer_product_id, v_capability_product_id,
           v_capability_definition_version, v_capability_definition_hash,
           v_entitlement_key, v_scope_mode, v_scope_key
    from public.purchase_intents pi
    join public.product_offers po on po.id = pi.product_offer_id
    join public.products product on product.id=po.product_id
    join public.product_capability_sets pcs
      on pcs.id = pi.capability_set_id and pcs.product_id = po.product_id
    join public.product_capability_items pci
      on pci.capability_set_id = pi.capability_set_id
     and pci.item_key = p_capability_item_key
    where pi.id = v_receipt.purchase_intent_id
      and pi.subject_id = v_receipt.subject_id
      and pi.product_offer_id = v_receipt.product_offer_id
      and pi.status = 'verified';

    if not found
       or v_capability_set_id is null
       or v_capability_snapshot_hash is null or btrim(v_capability_snapshot_hash) = ''
       or v_capability_product_id is distinct from v_offer_product_id
       or v_capability_snapshot is distinct from pg_catalog.jsonb_build_object(
         'capabilitySetId', v_capability_set_id::text,
         'definitionVersion', v_capability_definition_version,
         'definitionHash', v_capability_definition_hash
       )
       or (v_scope_mode='saju_record' and v_scope_key is null) then
      raise exception using errcode = 'P0001',
        constraint = 'internal_entitlement_effect_capability_authority_unavailable',
        message = 'pinned Product Capability authority is unavailable or inconsistent';
    end if;

    v_product_id := v_offer_product_id;
    v_scope_key_norm := coalesce(v_scope_key, '__GLOBAL__');
    v_grant_key := 'receipt:' || v_receipt.id::text;
    v_next_ordering_key := null;

    select count(*)::integer into v_item_match_count
    from public.product_capability_items pci
    where pci.capability_set_id = v_capability_set_id
      and pci.entitlement_key = v_entitlement_key
      and (
        (v_scope_mode='global' and pci.scope_mode='global')
        or (v_scope_mode='fixed' and pci.scope_mode='fixed' and pci.fixed_scope_key=v_scope_key)
        or (v_scope_mode='saju_record' and pci.scope_mode='saju_record' and v_scope_key is not null)
      );

    if v_item_match_count <> 1 then
      raise exception using errcode = 'P0001',
        constraint = 'internal_entitlement_effect_capability_target_ambiguous',
        message = 'pinned Capability Items do not resolve to one representable logical Grant target';
    end if;

    select eg.* into v_grant
    from public.entitlement_grants eg
    where eg.subject_id = v_receipt.subject_id
      and eg.entitlement_key = v_entitlement_key
      and eg.scope_key_norm = v_scope_key_norm
      and eg.grant_key = v_grant_key
    for update;

    if not found then
      insert into public.entitlement_grants (
        id, subject_id, entitlement_key, scope_key, grant_key, grant_source_type,
        status, valid_from, valid_until, revision, last_effective_at,
        last_provider_ordering_key, created_at, updated_at, source_receipt_id
      ) values (
        gen_random_uuid(), v_receipt.subject_id, v_entitlement_key, v_scope_key,
        v_grant_key, 'purchase', p_target_status, p_target_valid_from,
        p_target_valid_until, 0, p_effective_at, null, v_as_of, v_as_of, v_receipt.id
      )
      on conflict on constraint entitlement_grants_logical_source_unique do nothing
      returning * into v_grant;
      if found then
        v_grant_inserted := true;
      else
        select eg.* into v_grant
        from public.entitlement_grants eg
        where eg.subject_id = v_receipt.subject_id
          and eg.entitlement_key = v_entitlement_key
          and eg.scope_key_norm = v_scope_key_norm
          and eg.grant_key = v_grant_key
        for update;
      end if;
    end if;

    if v_grant.id is null
       or v_grant.grant_source_type is distinct from 'purchase'
       or v_grant.source_receipt_id is distinct from v_receipt.id
       or v_grant.subject_id is distinct from v_receipt.subject_id
       or v_grant.entitlement_key is distinct from v_entitlement_key
       or v_grant.scope_key_norm is distinct from v_scope_key_norm then
      raise exception using errcode = '23505',
        constraint = 'internal_entitlement_effect_grant_identity_conflict',
        message = 'receipt source is already bound to conflicting Grant authority';
    end if;
  else
    if p_grant_id is null or p_capability_item_key is not null
       or p_expected_revision is null or p_event_type = 'granted' then
      raise exception using errcode = '23514',
        constraint = 'internal_entitlement_effect_provider_event_shape_invalid',
        message = 'provider event source requires an existing Grant and expected CAS provenance';
    end if;

    select cpe.* into v_provider_event
    from public.commerce_provider_events cpe
    where cpe.id = p_source_id
    for update;

    if not found
       or v_provider_event.status not in ('verified', 'processed')
       or v_provider_event.environment is distinct from 'production'
       or v_provider_event.resolution_source_type is distinct from 'receipt'
       or v_provider_event.resolved_subject_id is null
       or v_provider_event.resolved_receipt_id is null then
      raise exception using errcode = 'P0001',
        constraint = 'internal_entitlement_effect_provider_event_unavailable',
        message = 'production verified receipt-lineage provider event authority is unavailable';
    end if;

    select cr.* into v_receipt
    from public.commerce_receipts cr
    where cr.id = v_provider_event.resolved_receipt_id
      and cr.subject_id = v_provider_event.resolved_subject_id;

    if not found
       or v_receipt.provider is distinct from v_provider_event.provider
       or v_receipt.environment is distinct from 'production'
       or v_receipt.verification_status not in ('verified', 'revoked')
       or v_receipt.product_offer_id is null
       or (v_provider_event.external_transaction_id is not null
           and v_provider_event.external_transaction_id is distinct from v_receipt.external_transaction_id) then
      raise exception using errcode = 'P0001',
        constraint = 'internal_entitlement_effect_provider_event_lineage_mismatch',
        message = 'provider event does not resolve to authoritative production Receipt lineage';
    end if;

    select eg.* into v_grant
    from public.entitlement_grants eg
    where eg.id = p_grant_id
    for update;

    if not found
       or v_grant.subject_id is distinct from v_provider_event.resolved_subject_id
       or v_grant.grant_source_type is distinct from 'purchase'
       or v_grant.source_receipt_id is distinct from v_receipt.id then
      raise exception using errcode = 'P0001',
        constraint = 'internal_entitlement_effect_provider_grant_lineage_mismatch',
        message = 'provider event does not resolve to the target purchase Grant lineage';
    end if;

    select po.product_id into v_product_id
    from public.product_offers po
    where po.id = v_receipt.product_offer_id;
    if not found then
      raise exception using errcode = 'P0001',
        constraint = 'internal_entitlement_effect_provider_product_unavailable',
        message = 'provider event Receipt Product authority is unavailable';
    end if;

    v_entitlement_key := v_grant.entitlement_key;
    v_scope_key := v_grant.scope_key;
    v_scope_key_norm := v_grant.scope_key_norm;
    v_grant_key := v_grant.grant_key;
    v_next_ordering_key := v_provider_event.provider_ordering_key;

    if p_target_valid_from is distinct from v_grant.valid_from then
      raise exception using errcode = '23514',
        constraint = 'internal_entitlement_effect_valid_from_immutable',
        message = 'existing Grant valid_from must be preserved by lifecycle effects';
    end if;
    if p_event_type in ('expired', 'revoked')
       and p_target_valid_until is distinct from v_grant.valid_until then
      raise exception using errcode = '23514',
        constraint = 'internal_entitlement_effect_historical_interval_immutable',
        message = 'expired/revoked effects must preserve the historical Grant interval';
    end if;
  end if;

  v_event_dedupe_key := pg_catalog.jsonb_build_array(
    'entitlement-effect-v1',
    case when p_source_type = 'receipt' then 'receipt:' || v_receipt.id::text
         else 'provider_event:' || v_provider_event.id::text end,
    p_event_type,
    (pg_catalog.date_part('epoch', p_effective_at) * 1000000)::bigint,
    p_target_status,
    (pg_catalog.date_part('epoch', p_target_valid_from) * 1000000)::bigint,
    case when p_target_valid_until is null then null
         else (pg_catalog.date_part('epoch', p_target_valid_until) * 1000000)::bigint end,
    p_reason_code
  )::text;

  v_effect_payload := pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'schemaVersion', 'entitlement-effect-v1',
    'eventType', p_event_type,
    'effectiveAt', pg_catalog.to_char(p_effective_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'targetStatus', p_target_status,
    'targetValidFrom', pg_catalog.to_char(p_target_valid_from at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'targetValidUntil', case when p_target_valid_until is null then null
      else pg_catalog.to_char(p_target_valid_until at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') end,
    'reasonCode', p_reason_code
  ));

  if p_source_type = 'receipt' then
    select count(*)::integer into v_source_event_count
    from public.entitlement_events ee
    where ee.grant_id = v_grant.id and ee.source_type = 'receipt'
      and ee.source_receipt_id = v_receipt.id and ee.event_type = 'granted';
  else
    select count(*)::integer into v_source_event_count
    from public.entitlement_events ee
    where ee.grant_id = v_grant.id and ee.source_type = 'provider_event'
      and ee.source_provider_event_id = v_provider_event.id;
  end if;

  if v_source_event_count > 1 then
    raise exception using errcode = '23505',
      constraint = 'internal_entitlement_effect_source_event_ambiguous',
      message = 'authoritative source is already bound to multiple Entitlement Events for this Grant';
  end if;

  if v_source_event_count = 1 then
    if p_source_type = 'receipt' then
      select ee.* into v_existing_event from public.entitlement_events ee
      where ee.grant_id = v_grant.id and ee.source_type = 'receipt'
        and ee.source_receipt_id = v_receipt.id and ee.event_type = 'granted' limit 1;
    else
      select ee.* into v_existing_event from public.entitlement_events ee
      where ee.grant_id = v_grant.id and ee.source_type = 'provider_event'
        and ee.source_provider_event_id = v_provider_event.id limit 1;
    end if;

    if v_existing_event.event_schema_version is distinct from 'ent-event-v2'
       or v_existing_event.product_id is distinct from v_product_id
       or v_existing_event.entitlement_key is distinct from v_entitlement_key
       or v_existing_event.scope_key_norm is distinct from v_scope_key_norm
       or v_existing_event.event_type is distinct from p_event_type
       or v_existing_event.event_dedupe_key is distinct from v_event_dedupe_key
       or v_existing_event.effective_at is distinct from p_effective_at
       or v_existing_event.target_status is distinct from p_target_status
       or v_existing_event.target_valid_from is distinct from p_target_valid_from
       or v_existing_event.target_valid_until is distinct from p_target_valid_until
       or v_existing_event.reason_code is distinct from p_reason_code
       or v_existing_event.provider_ordering_key is distinct from v_next_ordering_key then
      raise exception using errcode = '23505',
        constraint = 'internal_entitlement_effect_source_semantic_conflict',
        message = 'authoritative source is already bound to conflicting Entitlement Effect semantics';
    end if;

    select e.id, e.revision into v_projection_id, v_projection_revision
    from public.entitlements e
    where e.subject_id = v_grant.subject_id
      and e.entitlement_key = v_grant.entitlement_key
      and e.scope_key_norm = v_grant.scope_key_norm;
    if not found then
      raise exception using errcode = 'P0001',
        constraint = 'internal_entitlement_effect_replay_projection_missing',
        message = 'replayed Entitlement Effect is missing its committed Effective Entitlement projection';
    end if;

    select oe.id into v_outbox_event_id from public.outbox_events oe
    where oe.aggregate_type = 'entitlement' and oe.aggregate_id = v_projection_id::text
      and oe.event_type = 'ENTITLEMENT_EFFECTIVE_RIGHT_CHANGED'
      and oe.dedupe_key = v_event_dedupe_key limit 1;

    return query select v_grant.id, v_existing_event.id, v_projection_id,
      v_grant.revision, v_projection_revision, false, v_outbox_event_id, true;
    return;
  end if;

  if p_source_type = 'receipt' and not v_grant_inserted then
    raise exception using errcode = '23505',
      constraint = 'internal_entitlement_effect_receipt_grant_without_event',
      message = 'existing receipt Grant lacks authoritative granted-event provenance required for replay';
  end if;

  if p_source_type = 'provider_event' then
    if v_grant.revision is distinct from p_expected_revision
       or v_grant.last_provider_ordering_key is distinct from p_expected_last_provider_ordering_key then
      raise exception using errcode = '40001',
        constraint = 'internal_entitlement_effect_cas_mismatch',
        message = 'Grant revision/order provenance changed; caller must re-read and re-compare provider ordering';
    end if;

    v_material_grant_change := row(v_grant.status, v_grant.valid_from, v_grant.valid_until)
      is distinct from row(p_target_status, p_target_valid_from, p_target_valid_until);

    if not v_material_grant_change then
      if v_next_ordering_key is not null
         and v_grant.last_provider_ordering_key is distinct from v_next_ordering_key then
        update public.entitlement_grants eg
        set last_provider_ordering_key = v_next_ordering_key, updated_at = v_as_of
        where eg.id = v_grant.id returning * into v_grant;
      end if;
      select e.id, e.revision into v_projection_id, v_projection_revision
      from public.entitlements e
      where e.subject_id = v_grant.subject_id
        and e.entitlement_key = v_grant.entitlement_key
        and e.scope_key_norm = v_grant.scope_key_norm;
      return query select v_grant.id, null::uuid, v_projection_id, v_grant.revision,
        v_projection_revision, false, null::uuid, false;
      return;
    end if;

    update public.entitlement_grants eg
    set status = p_target_status,
        valid_until = p_target_valid_until,
        revision = eg.revision + 1,
        last_effective_at = p_effective_at,
        last_provider_ordering_key = coalesce(v_next_ordering_key, eg.last_provider_ordering_key),
        updated_at = v_as_of
    where eg.id = v_grant.id and eg.revision = p_expected_revision
      and eg.last_provider_ordering_key is not distinct from p_expected_last_provider_ordering_key
    returning * into v_grant;
    if not found then
      raise exception using errcode = '40001',
        constraint = 'internal_entitlement_effect_cas_mismatch',
        message = 'Grant revision/order provenance changed during Entitlement Effect apply';
    end if;
  end if;

  v_event_id := gen_random_uuid();
  insert into public.entitlement_events (
    id, grant_id, subject_id, entitlement_key, scope_key_norm, product_id,
    source_type, source_receipt_id, source_provider_event_id, source_actor_ref,
    event_type, event_schema_version, event_dedupe_key, effective_at,
    provider_ordering_key, payload_jsonb, created_at,
    target_status, target_valid_from, target_valid_until, reason_code
  ) values (
    v_event_id, v_grant.id, v_grant.subject_id, v_grant.entitlement_key,
    v_grant.scope_key_norm, v_product_id, p_source_type,
    case when p_source_type = 'receipt' then v_receipt.id else null end,
    case when p_source_type = 'provider_event' then v_provider_event.id else null end,
    null, p_event_type, 'ent-event-v2', v_event_dedupe_key, p_effective_at,
    v_next_ordering_key, v_effect_payload, v_as_of,
    p_target_status, p_target_valid_from, p_target_valid_until, p_reason_code
  );

  select r.projection_id, r.projection_status, r.projection_active_grant_count,
         r.projection_effective_valid_until, r.projection_revision, r.projection_changed
    into v_projection_id, v_projection_status, v_projection_active_grant_count,
         v_projection_effective_valid_until, v_projection_revision, v_projection_changed
  from public.internal_recompute_entitlement_projection_v1(
    v_grant.subject_id, v_grant.entitlement_key, v_grant.scope_key
  ) r;

  if v_projection_id is null then
    raise exception using errcode = 'P0001',
      constraint = 'internal_entitlement_effect_projection_unavailable',
      message = 'Effective Entitlement projection recompute did not return authoritative state';
  end if;

  if v_projection_changed then
    insert into public.outbox_events (
      id, aggregate_type, aggregate_id, event_type, event_schema_version, dedupe_key,
      payload_jsonb, status, locked_at, lock_owner, lease_expires_at, attempt_count,
      available_at, processed_at, last_error_code, dead_lettered_at, created_at
    ) values (
      gen_random_uuid(), 'entitlement', v_projection_id::text,
      'ENTITLEMENT_EFFECTIVE_RIGHT_CHANGED', 'entitlement-right-change-v1',
      v_event_dedupe_key,
      pg_catalog.jsonb_build_object(
        'schemaVersion', 'entitlement-right-change-v1',
        'entitlementId', v_projection_id::text,
        'subjectId', v_grant.subject_id::text,
        'entitlementKey', v_grant.entitlement_key,
        'scopeKey', v_grant.scope_key,
        'status', v_projection_status,
        'activeGrantCount', v_projection_active_grant_count,
        'effectiveValidUntil', case when v_projection_effective_valid_until is null then null
          else pg_catalog.to_char(v_projection_effective_valid_until at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') end,
        'revision', v_projection_revision
      ),
      'pending', null, null, null, 0, v_as_of, null, null, null, v_as_of
    )
    on conflict (aggregate_type, aggregate_id, event_type, dedupe_key) do nothing
    returning id into v_outbox_event_id;

    if v_outbox_event_id is null then
      select oe.id into v_outbox_event_id from public.outbox_events oe
      where oe.aggregate_type = 'entitlement' and oe.aggregate_id = v_projection_id::text
        and oe.event_type = 'ENTITLEMENT_EFFECTIVE_RIGHT_CHANGED'
        and oe.dedupe_key = v_event_dedupe_key limit 1;
    end if;
    if v_outbox_event_id is null then
      raise exception using errcode = 'P0001',
        constraint = 'internal_entitlement_effect_outbox_unavailable',
        message = 'material Effective Entitlement change requires one deduped outbox event';
    end if;
  end if;

  return query select v_grant.id, v_event_id, v_projection_id, v_grant.revision,
    v_projection_revision, v_projection_changed, v_outbox_event_id, false;
end;
$$;

comment on function public.internal_apply_entitlement_effect_v1(
  text,uuid,uuid,text,bigint,text,text,timestamptz,text,timestamptz,timestamptz,text
) is
  'Atomic EntitlementEffectV1. Saju Record scope is resolved only from verified Receipt -> immutable Purchase Origin -> same-Subject same-Birth-revision Saju Record; no request scope input is accepted.';

revoke all on function public.internal_apply_entitlement_effect_v1(
  text,uuid,uuid,text,bigint,text,text,timestamptz,text,timestamptz,timestamptz,text
) from public,anon,authenticated,service_role,myeongha_api_executor;

create or replace function public.internal_finalize_account_deletion_db_v1(
  p_subject_id uuid,
  p_deletion_job_id uuid,
  p_lock_owner text
)
returns table (
  finalized boolean,
  replayed boolean,
  auth_mapping_present boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $account_finalizer$
declare
  v_kind text;
  v_status text;
  v_auth_user_id uuid;
  v_job_scope text;
  v_job_status text;
  v_policy_version text;
  v_db_finalized_at timestamptz;
  v_ready boolean;
  v_reader_protected_count bigint;
  v_reader_external_fence_id text;
  v_now timestamptz := clock_timestamp();
begin
  if p_subject_id is null or p_deletion_job_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'account_deletion_finalizer_ids_required',
      message = 'subject and deletion job ids are required';
  end if;

  if p_lock_owner is null or btrim(p_lock_owner) = '' then
    raise exception using
      errcode = '23514',
      constraint = 'account_deletion_finalizer_lock_owner_required',
      message = 'exact outbox lock owner is required';
  end if;

  select s.kind, s.status, s.auth_user_id
    into v_kind, v_status, v_auth_user_id
  from public.subjects s
  where s.id = p_subject_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      constraint = 'account_deletion_finalizer_subject_not_found',
      message = 'account deletion Subject was not found';
  end if;

  select dj.scope, dj.status, dj.finalization_policy_version, dj.db_finalized_at
    into v_job_scope, v_job_status, v_policy_version, v_db_finalized_at
  from public.data_deletion_jobs dj
  where dj.id = p_deletion_job_id
    and dj.subject_id = p_subject_id
  for update;

  if not found or v_job_scope is distinct from 'account' then
    raise exception using
      errcode = '23514',
      constraint = 'account_deletion_finalizer_job_mismatch',
      message = 'account deletion finalizer requires the exact account deletion job';
  end if;

  -- Restored personal claim after account deletion is a privacy replay failure.
  if v_status='deleted' and (
    exists(select 1 from public.digital_reading_withdrawal_claims_private_v1 c where c.subject_id=p_subject_id)
    or exists(select 1 from public.commerce_saju_records_v1 r where r.subject_id=p_subject_id)
    or exists(select 1 from public.commerce_saju_purchase_origins_v1 o where o.subject_id=p_subject_id)
  ) then
    raise exception 'Withdrawal claim resurrected after account deletion'
      using errcode='23514';
  end if;

  if v_status = 'deleted' then
    if v_job_status is distinct from 'running'
       or v_policy_version is distinct from 'account-deletion-finalization-v1'
       or v_db_finalized_at is null then
      raise exception using
        errcode = '23514',
        constraint = 'account_deletion_finalizer_deleted_state_unproven',
        message = 'deleted Subject is missing exact DB-finalization provenance';
    end if;

    perform 1
    from public.outbox_events oe
    where oe.aggregate_type = 'data_deletion_job'
      and oe.aggregate_id = p_deletion_job_id::text
      and oe.event_type = 'ACCOUNT_DELETION_STARTED'
      and oe.status = 'processing'
      and oe.lock_owner = btrim(p_lock_owner)
      and oe.lease_expires_at > clock_timestamp()
    for update;

    if not found then
      raise exception using
        errcode = '23514',
        constraint = 'account_deletion_finalizer_replay_lease_mismatch',
        message = 'DB-finalizer replay requires the current ACCOUNT_DELETION_STARTED lease owner';
    end if;

    return query
    select true, true, (v_auth_user_id is not null);
    return;
  end if;

  if v_kind is distinct from 'member'
     or v_status is distinct from 'deletion_pending'
     or v_job_status is distinct from 'running'
     or v_policy_version is not null
     or v_db_finalized_at is not null then
    raise exception using
      errcode = '23514',
      constraint = 'account_deletion_finalizer_state_mismatch',
      message = 'account deletion DB finalizer requires an unfinalized deletion_pending Member';
  end if;

  -- Serialize the exact worker lease row across the destructive DB transaction.
  perform 1
  from public.outbox_events oe
  where oe.aggregate_type = 'data_deletion_job'
    and oe.aggregate_id = p_deletion_job_id::text
    and oe.event_type = 'ACCOUNT_DELETION_STARTED'
  for update;

  select pf.db_preconditions_met
    into v_ready
  from public.internal_account_deletion_finalization_preflight_v1(
    p_subject_id,
    p_deletion_job_id,
    p_lock_owner
  ) pf;

  if v_ready is distinct from true then
    raise exception using
      errcode = '23514',
      constraint = 'account_deletion_finalizer_preflight_failed',
      message = 'account deletion DB finalizer preflight failed closed';
  end if;

  -- Transaction-local trigger context. It is reset before returning and rolls back on any
  -- error. Ordinary trigger behavior remains unchanged outside this function.
  perform pg_catalog.set_config(
    'myeongha.account_deletion_finalizer_subject_id',
    p_subject_id::text,
    true
  );

  set constraints all deferred;

  -- Break FK cycles while the target Subject is still locked and the finalizer context is active.
  update public.birth_profiles
  set current_revision_id = null,
      updated_at = v_now
  where subject_id = p_subject_id
    and current_revision_id is not null;

  update public.reading_sessions
  set current_reading_id = null,
      state = case when state = 'active' then 'cancelled' else state end,
      updated_at = v_now
  where subject_id = p_subject_id;

  update public.readings
  set parent_reading_id = null,
      committed_execution_attempt_id = null,
      execution_status = 'failed',
      completed_at = coalesce(completed_at, v_now)
  where subject_id = p_subject_id;

  update public.chat_turn_attempts
  set state = 'failed_final',
      generation_ai_execution_log_id = null,
      validation_ai_execution_log_id = null,
      generated_thread_character_id = null,
      generated_character_content_bundle_id = null,
      committed_message_id = null,
      finished_at = coalesce(finished_at, v_now),
      error_code = coalesce(error_code, 'account_deleted')
  where subject_id = p_subject_id;

  update public.chat_turns
  set state = 'failed_final',
      committed_attempt_id = null,
      error_code = coalesce(error_code, 'account_deleted'),
      updated_at = v_now
  where subject_id = p_subject_id;

  update public.life_facts
  set supersedes_fact_id = null
  where subject_id = p_subject_id
    and supersedes_fact_id is not null;

  -- S4 (new protected child): physically erase encrypted paid Reader bodies
  -- before deleting any source purchase access, assistant marker, attempt,
  -- Thread or official Reading parent. A cascading FK is NOT a substitute:
  -- keep this graph edge explicit and inside the existing claimed lease TX.
  -- This does not claim backup/KMS key purge or external Privacy Ledger ACK.
  select pg_catalog.count(*) into v_reader_protected_count
  from public.official_reader_paid_answer_bodies b
  where b.subject_id=p_subject_id;

  if v_reader_protected_count>0 then
    v_reader_external_fence_id :=
      pg_catalog.current_setting('myeongha.reader_privacy_fence_receipt_id',true);
    if v_reader_external_fence_id is null
       or pg_catalog.length(v_reader_external_fence_id) not between 1 and 256 then
      raise exception using errcode='23514',
        constraint='account_deletion_reader_durable_receipt_required',
        message='Protected Reader deletion requires an external ledger receipt';
    end if;
  end if;

  if v_reader_protected_count>0 and (
    pg_catalog.current_setting('myeongha.reader_privacy_fence_subject_id', true)
      is distinct from p_subject_id::text
    or pg_catalog.current_setting('myeongha.reader_privacy_fence_deletion_job_id', true)
      is distinct from p_deletion_job_id::text
  ) then
    raise exception using errcode='23514',
      constraint='account_deletion_reader_external_privacy_fence_required',
      message='Protected Reader deletion requires a durable off-primary tombstone before physical deletion';
  end if;

  if v_reader_protected_count>0 then
    insert into public.official_reader_account_deletion_privacy_status_v1(
      deletion_job_id,subject_id,external_fence_id,protected_row_count
    ) values (
      p_deletion_job_id,p_subject_id,v_reader_external_fence_id,
      v_reader_protected_count
    )
    on conflict (deletion_job_id) do nothing;

    if not exists (
      select 1
      from public.official_reader_account_deletion_privacy_status_v1 p
      where p.deletion_job_id=p_deletion_job_id
        and p.subject_id=p_subject_id
        and p.external_fence_id=v_reader_external_fence_id
        and p.protected_row_count=v_reader_protected_count
        and p.keys_erased_at is null
    ) then
      raise exception using errcode='23514',
        constraint='account_deletion_reader_durable_fence_conflict',
        message='Protected Reader deletion manifest changed during account finalization';
    end if;
  end if;

  delete from public.official_reader_paid_answer_bodies b
  where b.subject_id = p_subject_id;

  if exists (
    select 1 from public.official_reader_paid_answer_bodies b
    where b.subject_id = p_subject_id
  ) then
    raise exception using errcode = '23514',
      constraint = 'account_deletion_finalizer_protected_reader_child_remaining',
      message = 'Protected Reader content must be physically removed before parent deletion';
  end if;

  -- Delete approved DELETE-class rows in FK-safe child-before-parent order.
  -- Standard Reading access/interpretation rows reference retained Purchase/Entitlement
  -- evidence plus personal Birth/Reading rows, so remove every Reader-access child before
  -- official Reading provenance and the underlying Reading/Birth rows.
  -- P0-PR-01 DELETE of service claim before official Reading cleanup.
  delete from public.digital_reading_withdrawal_claims_private_v1
    where subject_id=p_subject_id;

  delete from public.standard_reading_reader_access_grants where subject_id = p_subject_id;
  delete from public.standard_reading_reader_interpretations where subject_id = p_subject_id;
  delete from public.standard_reading_official_bindings where subject_id = p_subject_id;
  delete from public.standard_reading_unit_bindings where subject_id = p_subject_id;
  delete from public.episode_progress_events where subject_id = p_subject_id;
  delete from public.user_episode_progress where subject_id = p_subject_id;

  -- Production relationship history is append-only for ordinary callers, but its immutable
  -- trigger explicitly admits this SECURITY DEFINER finalizer for the exact transaction-local
  -- Subject. Delete children before their event/history parents, then remove the state rows.
  delete from public.relationship_event_adjustments where subject_id = p_subject_id;
  delete from public.relationship_event_links where subject_id = p_subject_id;
  delete from public.relationship_event_provenance_refs where subject_id = p_subject_id;
  delete from public.relationship_event_records where subject_id = p_subject_id;
  delete from public.relationship_state_snapshots where subject_id = p_subject_id;
  delete from public.relationship_history_entries where subject_id = p_subject_id;
  delete from public.relationship_events where subject_id = p_subject_id;
  delete from public.user_character_states where subject_id = p_subject_id;

  delete from public.notification_delivery_attempts where subject_id = p_subject_id;
  delete from public.notification_deliveries where subject_id = p_subject_id;
  delete from public.notification_settings where subject_id = p_subject_id;
  delete from public.notification_preferences where subject_id = p_subject_id;
  delete from public.device_installations where subject_id = p_subject_id;
  delete from public.notifications where subject_id = p_subject_id;
  delete from public.character_unlocks where subject_id = p_subject_id;
  delete from public.world_events where subject_id = p_subject_id;

  delete from public.share_artifacts where subject_id = p_subject_id;
  delete from public.ai_execution_groundings where subject_id = p_subject_id;
  delete from public.reading_groundings where subject_id = p_subject_id;
  delete from public.reading_refs where subject_id = p_subject_id;
  delete from public.reading_execution_attempts where subject_id = p_subject_id;
  delete from public.readings where subject_id = p_subject_id;
  delete from public.reading_sessions where subject_id = p_subject_id;

  delete from public.record_access_grants where subject_id = p_subject_id;
  delete from public.memory_proposals where subject_id = p_subject_id;
  delete from public.memory_items where subject_id = p_subject_id;
  delete from public.life_facts where subject_id = p_subject_id;

  delete from public.ai_execution_logs where subject_id = p_subject_id;
  delete from public.conversation_messages where subject_id = p_subject_id;
  delete from public.chat_turn_attempts where subject_id = p_subject_id;
  delete from public.chat_turns where subject_id = p_subject_id;
  delete from public.conversation_thread_content_transitions where subject_id = p_subject_id;
  delete from public.conversation_thread_characters ctc
  using public.conversation_threads ct
  where ctc.thread_id = ct.id
    and ct.subject_id = p_subject_id;
  delete from public.conversation_threads where subject_id = p_subject_id;

  delete from public.target_person_profiles where subject_id = p_subject_id;
  -- Remove the personal Record-to-opaque-scope mapping, but retain Receipt,
  -- Provider Event, Grant and verified refund financial evidence. Links are deleted
  -- before Origins so their immutable triggers can verify the exact Subject.
  delete from public.commerce_saju_upgrade_receipt_links_v1 link
  where exists (
    select 1 from public.commerce_saju_purchase_origins_v1 origin
    where origin.purchase_intent_id=link.child_purchase_intent_id
      and origin.subject_id=p_subject_id
  );
  delete from public.commerce_saju_purchase_origins_v1
  where subject_id=p_subject_id;
  delete from public.commerce_saju_records_v1
  where subject_id=p_subject_id;

  if exists(select 1 from public.commerce_saju_records_v1 where subject_id=p_subject_id)
     or exists(select 1 from public.commerce_saju_purchase_origins_v1 where subject_id=p_subject_id) then
    raise exception 'SAJU_PERSONAL_SCOPE_MAPPING_REMAINS_AFTER_DELETION'
      using errcode='23514';
  end if;

  delete from public.birth_profile_revisions where subject_id = p_subject_id;
  delete from public.birth_profiles where subject_id = p_subject_id;
  delete from public.profiles where subject_id = p_subject_id;

  -- RETAIN Commerce evidence but revoke live provider-account authority. This preserves
  -- the approved P5Y evidence row while preventing a deleted Subject from remaining
  -- attached to an active provider account.
  update public.commerce_account_links
  set status = 'revoked',
      revoked_at = coalesce(revoked_at, v_now)
  where subject_id = p_subject_id
    and status = 'active';

  -- ANONYMIZE merge provenance before deleting any guest session reachable through either
  -- Subject FK. Keep categorical audit semantics while removing resource identifiers,
  -- conflict payloads, and dedupe material.
  update public.subject_merge_actions sma
  set action_dedupe_key = 'anonymized:' || sma.id::text,
      source_resource_id = 'anonymized',
      target_resource_id = case
        when sma.target_resource_id is null then null
        else 'anonymized'
      end
  where sma.merge_job_id in (
    select smj.id
    from public.subject_merge_jobs smj
    where smj.guest_subject_id = p_subject_id
       or smj.member_subject_id = p_subject_id
       or smj.guest_session_id in (
         select gs.id
         from public.guest_sessions gs
         where gs.subject_id = p_subject_id
            or gs.claimed_by_subject_id = p_subject_id
       )
  );

  update public.subject_merge_jobs smj
  set guest_session_id = null,
      conflicts_jsonb = '{}'::jsonb,
      resolution_jsonb = null,
      idempotency_key = 'anonymized:' || smj.id::text
  where smj.guest_subject_id = p_subject_id
     or smj.member_subject_id = p_subject_id
     or smj.guest_session_id in (
       select gs.id
       from public.guest_sessions gs
       where gs.subject_id = p_subject_id
          or gs.claimed_by_subject_id = p_subject_id
     );

  delete from public.guest_sessions
  where subject_id = p_subject_id
     or claimed_by_subject_id = p_subject_id;

  -- ANONYMIZE every deletion-job tombstone for this Subject without changing lifecycle
  -- status. The active account job remains running until hosted Auth cleanup is acknowledged.
  update public.data_deletion_jobs dj
  set target_resource_type = case when dj.scope = 'account' then null else 'anonymized' end,
      target_resource_id = case when dj.scope = 'account' then null else 'anonymized:' || dj.id::text end,
      request_dedupe_key = 'anonymized:' || dj.id::text,
      retention_exceptions_jsonb = null,
      error_code = null
  where dj.subject_id = p_subject_id;

  update public.data_deletion_jobs
  set finalization_policy_version = 'account-deletion-finalization-v1',
      db_finalized_at = v_now
  where id = p_deletion_job_id
    and subject_id = p_subject_id;

  if exists(
    select 1 from public.digital_reading_withdrawal_claims_private_v1 c
    where c.subject_id=p_subject_id
  ) then
    raise exception 'Withdrawal claim remains after account finalization'
      using errcode='23514';
  end if;

  -- Subject is the retained anonymized tombstone required by retained Commerce FKs.
  -- auth_user_id intentionally remains until hosted Auth deletion succeeds.
  update public.subjects
  set status = 'deleted',
      merged_into_subject_id = null,
      updated_at = v_now
  where id = p_subject_id;

  -- Validate all deferred FK/constraint triggers before the function returns and restore
  -- the caller-visible constraint mode to IMMEDIATE.
  set constraints all immediate;

  perform pg_catalog.set_config(
    'myeongha.account_deletion_finalizer_subject_id',
    '',
    true
  );

  return query
  select true, false, (v_auth_user_id is not null);
end;
$account_finalizer$;

revoke all on function public.internal_finalize_account_deletion_db_v1(uuid,uuid,text) from public;

commit;
