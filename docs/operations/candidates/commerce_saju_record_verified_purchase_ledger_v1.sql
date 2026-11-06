-- STAGED CANDIDATE ONLY — DO NOT DEPLOY OR APPLY TO PRODUCTION.
-- Corrected 2026-11-05 Commerce policy: one original verified charge = one
-- credit, upgrades reference original Receipt identities, refunds stay separate.
-- All tables are private and add no Product/Offer, consumer route, API grant,
-- payment activation or entitlement writer. Requires full PG17/privacy review.
--
-- Records have their own stable identity distinct from mutable Birth profiles.
-- A new Birth input uses a different Saju Record; a settled purchase freezes
-- only that Record's source Birth revision, not the owner's Birth profile.

create table public.commerce_saju_records_v1 (
  id uuid primary key,
  subject_id uuid not null,
  birth_revision_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint commerce_saju_records_subject_unique unique (id, subject_id),
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

-- Keep the exact Birth revision stable while an Intent is bound to a
-- Saju Record. The Record lock serializes this association against concurrent
-- Birth revision edits; it does not authorize checkout or payment completion.
create or replace function public.tr_commerce_saju_origin_revision_lock_v1()
returns trigger language plpgsql security invoker
set search_path = pg_catalog, public as $saju_origin_lock$
declare
  v_record_birth_revision uuid;
begin
  select r.birth_revision_id into v_record_birth_revision
  from public.commerce_saju_records_v1 r
  where r.id=new.saju_record_id and r.subject_id=new.subject_id
  for update;
  if not found
    or v_record_birth_revision is distinct from new.birth_revision_id then
    raise exception 'SAJU_ORIGIN_RECORD_REVISION_MISMATCH';
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
  if new.subject_id is distinct from old.subject_id
    or new.id is distinct from old.id
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
 before update on public.commerce_saju_records_v1
 for each row execute function public.tr_commerce_saju_record_paid_revision_guard_v1();

-- Purchase association itself cannot be retargeted to a different Record.
create or replace function public.tr_commerce_saju_ledger_immutable_v1()
returns trigger language plpgsql security invoker
set search_path = pg_catalog, public as $$
begin
  raise exception 'SAJU_SOURCE_LEDGER_IMMUTABLE';
end;
$$;
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
  public.commerce_saju_verified_refund_effects_v1 from public;
revoke all on function public.tr_commerce_saju_origin_revision_lock_v1(),
  public.tr_commerce_saju_verified_receipt_revision_lock_v1(),
  public.tr_commerce_saju_refund_effect_verified_v1(),
  public.tr_commerce_saju_record_paid_revision_guard_v1(),
  public.tr_commerce_saju_upgrade_link_source_v1(),
  public.tr_commerce_saju_ledger_immutable_v1() from public;

-- Any eventual read-only snapshot must verify:
--  * linked Receipt/Intent/Product/record/revision/Subject/source integrity,
--  * all upgrade sources are earlier, same-record receipts, and acyclic,
--  * unsettled provider cancellation -> HOLD, not 0 refunded,
--  * receipt unique sum and real settled refund sum,
--  * live ownedFields from exact record-scoped effective Grant aggregate,
--  * unresolved Purchase Intents before charging under a single DB lock,
--  * account-deletion/restore graph includes these new Subject-private rows.
