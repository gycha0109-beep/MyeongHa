-- Private, inoperative checkout notice evidence for future authorized Standard Reading.
-- No approved notice row or public/API executor grant is created by this migration.
-- A browser checkbox is an untrusted action signal: only a server-issued challenge
-- confirmed against the same subject, intent, Reader, unit and revision can be recorded.
begin;

create table public.digital_reading_checkout_notice_revisions_v1 (
  revision_key text primary key,
  product_id uuid not null references public.products(id),
  product_spec_version text not null,
  notice_revision text not null,
  notice_sha256 text not null,
  preview_or_information_revision text not null,
  preview_or_information_sha256 text not null,
  authority_state text not null default 'draft',
  approved_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  constraint digital_notice_revisions_state_chk check (
    (authority_state = 'draft' and approved_at is null)
    or (authority_state = 'approved' and approved_at is not null)
  ),
  constraint digital_notice_revisions_digest_chk check (
    notice_sha256 ~ '^[a-f0-9]{64}$'
    and preview_or_information_sha256 ~ '^[a-f0-9]{64}$'
  ),
  constraint digital_notice_revisions_identity_chk check (
    length(btrim(revision_key)) between 1 and 160
    and length(btrim(product_spec_version)) between 1 and 128
    and length(btrim(notice_revision)) between 1 and 160
    and length(btrim(preview_or_information_revision)) between 1 and 160
  ),
  constraint digital_notice_revisions_exact_unique unique (
    product_id, product_spec_version, notice_revision, preview_or_information_revision
  )
);

create table public.digital_reading_checkout_notice_presentations_v1 (
  purchase_intent_id uuid primary key references public.purchase_intents(id),
  subject_id uuid not null references public.subjects(id),
  unit_id uuid not null,
  product_id uuid not null references public.products(id),
  reader_character_id text not null,
  reader_content_bundle_id uuid not null,
  product_spec_version text not null,
  revision_key text not null references public.digital_reading_checkout_notice_revisions_v1(revision_key),
  notice_revision text not null,
  preview_or_information_revision text not null,
  notice_sha256 text not null,
  preview_or_information_sha256 text not null,
  challenge_sha256 text not null,
  presentation_snapshot_sha256 text not null,
  server_presented_at timestamptz not null default clock_timestamp(),
  constraint digital_checkout_presentations_unit_unique unique (purchase_intent_id,unit_id),
  constraint digital_checkout_presentations_hashes_chk check (
    challenge_sha256 ~ '^[a-f0-9]{64}$'
    and presentation_snapshot_sha256 ~ '^[a-f0-9]{64}$'
    and notice_sha256 ~ '^[a-f0-9]{64}$'
    and preview_or_information_sha256 ~ '^[a-f0-9]{64}$'
  )
);

create table public.digital_reading_checkout_notice_acknowledgments_v1 (
  purchase_intent_id uuid primary key,
  unit_id uuid not null,
  subject_id uuid not null references public.subjects(id),
  submitted_challenge_sha256 text not null,
  acknowledged boolean not null default true check (acknowledged = true),
  server_acknowledged_at timestamptz not null default clock_timestamp(),
  constraint digital_checkout_ack_presentation_fk foreign key (purchase_intent_id,unit_id)
    references public.digital_reading_checkout_notice_presentations_v1(purchase_intent_id,unit_id),
  constraint digital_checkout_ack_hash_chk check (submitted_challenge_sha256 ~ '^[a-f0-9]{64}$')
);

create function public.ct_validate_digital_checkout_notice_presentation_v1()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_purchase_subject uuid;
  v_purchase_product uuid;
  v_purchase_state text;
  v_offer_enabled boolean;
  v_product_enabled boolean;
  v_offer_retired_at timestamptz;
  v_product_retired_at timestamptz;
  v_reader record;
  v_revision record;
begin
  -- Trusted connection may supply the challenge digest, but not the timestamp.
  new.server_presented_at := clock_timestamp();
  select pi.subject_id, po.product_id, pi.status,
         po.enabled, product.enabled, po.retired_at, product.retired_at
    into v_purchase_subject,v_purchase_product,v_purchase_state,
         v_offer_enabled,v_product_enabled,v_offer_retired_at,v_product_retired_at
  from public.purchase_intents pi
  join public.product_offers po on po.id = pi.product_offer_id
  join public.products product on product.id=po.product_id
  where pi.id = new.purchase_intent_id
  for update of pi;
  if not found or v_purchase_subject is distinct from new.subject_id
      or v_purchase_product is distinct from new.product_id
      or v_purchase_state is distinct from 'created'
      or v_offer_enabled is distinct from true
      or v_product_enabled is distinct from true
      or v_offer_retired_at is not null
      or v_product_retired_at is not null
      or exists(select 1 from public.commerce_receipts cr where cr.purchase_intent_id=new.purchase_intent_id) then
    raise exception using errcode='23514', constraint='digital_checkout_pre_payment_scope_invalid',
      message='Checkout notice must be issued for an exact unpaid created Purchase Intent';
  end if;

  select pirs.reader_character_id,pirs.reader_content_bundle_id,srps.spec_version,
         srps.purchase_unit_mode,srps.retired_at
    into v_reader
  from public.purchase_intent_reader_selections pirs
  join public.standard_reading_product_specs srps on srps.product_id=pirs.product_id
  where pirs.purchase_intent_id=new.purchase_intent_id and pirs.product_id=new.product_id;
  if not found or v_reader.reader_character_id is distinct from new.reader_character_id
      or v_reader.reader_content_bundle_id is distinct from new.reader_content_bundle_id
      or v_reader.spec_version is distinct from new.product_spec_version
      or v_reader.purchase_unit_mode is distinct from 'topic_reader_reading'
      or v_reader.retired_at is not null then
    raise exception using errcode='23514', constraint='digital_checkout_reader_scope_invalid',
      message='Checkout notice must match the immutable server Reader selection';
  end if;
  select *
    into v_revision
  from public.digital_reading_checkout_notice_revisions_v1 revision
  where revision.revision_key=new.revision_key
    and revision.product_id=new.product_id
    and revision.product_spec_version=new.product_spec_version
    and revision.authority_state='approved'
    and revision.approved_at <= new.server_presented_at;
  if not found
     or v_revision.notice_revision is distinct from new.notice_revision
     or v_revision.preview_or_information_revision is distinct from new.preview_or_information_revision
     or v_revision.notice_sha256 is distinct from new.notice_sha256
     or v_revision.preview_or_information_sha256 is distinct from new.preview_or_information_sha256 then
    raise exception using errcode='23514', constraint='digital_checkout_revision_unapproved',
      message='An exact approved server-owned notice and preview revision is required';
  end if;
  return new;
end;
$$;

create trigger ct_digital_checkout_notice_presentation_v1
before insert on public.digital_reading_checkout_notice_presentations_v1
for each row execute function public.ct_validate_digital_checkout_notice_presentation_v1();

create function public.ct_validate_digital_checkout_notice_acknowledgment_v1()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_source record;
  v_purchase_subject uuid;
  v_purchase_status text;
begin
  new.server_acknowledged_at := clock_timestamp();
  select presentation.subject_id,presentation.challenge_sha256,presentation.server_presented_at
    into v_source
  from public.digital_reading_checkout_notice_presentations_v1 presentation
  where presentation.purchase_intent_id=new.purchase_intent_id
    and presentation.unit_id=new.unit_id;
  select pi.subject_id,pi.status
    into v_purchase_subject,v_purchase_status
  from public.purchase_intents pi
  where pi.id=new.purchase_intent_id
  for update;
  if not found or v_source.subject_id is distinct from new.subject_id
    or v_purchase_subject is distinct from new.subject_id
    or v_purchase_status is distinct from 'created'
    or v_source.challenge_sha256 is distinct from new.submitted_challenge_sha256
    or v_source.server_presented_at >= new.server_acknowledged_at
    or exists(select 1 from public.commerce_receipts cr where cr.purchase_intent_id=new.purchase_intent_id) then
    raise exception using errcode='23514', constraint='digital_checkout_ack_scope_invalid',
      message='A matching pre-payment server-issued notice challenge is required';
  end if;
  return new;
end;
$$;

create trigger ct_digital_checkout_notice_acknowledgment_v1
before insert on public.digital_reading_checkout_notice_acknowledgments_v1
for each row execute function public.ct_validate_digital_checkout_notice_acknowledgment_v1();

create function public.tr_digital_checkout_notice_immutable_v1()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  raise exception using errcode='23514', constraint='digital_checkout_notice_immutable_v1',
    message='Checkout notice revision, presentation and acknowledgment are immutable';
end;
$$;

create trigger tr_digital_checkout_notice_revision_immutable_v1
before update or delete on public.digital_reading_checkout_notice_revisions_v1
for each row execute function public.tr_digital_checkout_notice_immutable_v1();
create trigger tr_digital_checkout_notice_presentation_immutable_v1
before update or delete on public.digital_reading_checkout_notice_presentations_v1
for each row execute function public.tr_digital_checkout_notice_immutable_v1();
create trigger tr_digital_checkout_notice_ack_immutable_v1
before update or delete on public.digital_reading_checkout_notice_acknowledgments_v1
for each row execute function public.tr_digital_checkout_notice_immutable_v1();

alter table public.digital_reading_checkout_notice_revisions_v1 enable row level security;
alter table public.digital_reading_checkout_notice_presentations_v1 enable row level security;
alter table public.digital_reading_checkout_notice_acknowledgments_v1 enable row level security;

revoke all on table public.digital_reading_checkout_notice_revisions_v1 from public;
revoke all on table public.digital_reading_checkout_notice_presentations_v1 from public;
revoke all on table public.digital_reading_checkout_notice_acknowledgments_v1 from public;

do $$
declare v_role text;
begin
  for v_role in
    select rolname from pg_catalog.pg_roles where rolname in
      ('anon','authenticated','service_role','myeongha_api_executor','myeongha_worker_runtime')
  loop
    execute pg_catalog.format('revoke all on table public.digital_reading_checkout_notice_revisions_v1 from %I',v_role);
    execute pg_catalog.format('revoke all on table public.digital_reading_checkout_notice_presentations_v1 from %I',v_role);
    execute pg_catalog.format('revoke all on table public.digital_reading_checkout_notice_acknowledgments_v1 from %I',v_role);
  end loop;
end;
$$;

revoke all on function public.ct_validate_digital_checkout_notice_presentation_v1() from public;
revoke all on function public.ct_validate_digital_checkout_notice_acknowledgment_v1() from public;
revoke all on function public.tr_digital_checkout_notice_immutable_v1() from public;

-- No seeded revision, grants, approval, public route, payment effect or refund decision.
commit;
