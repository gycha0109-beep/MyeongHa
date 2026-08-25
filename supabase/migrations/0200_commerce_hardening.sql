-- Commerce cross-row authority and mutation guards.
-- No provider API calls or entitlement projection side effects are hidden in triggers.

create or replace function public.tr_product_offer_mapping_immutable()
returns trigger
language plpgsql
as $$
begin
  if row(old.product_id, old.platform, old.provider, old.external_product_id)
     is distinct from
     row(new.product_id, new.platform, new.provider, new.external_product_id) then
    raise exception using
      errcode = '23514',
      constraint = 'tr_product_offer_mapping_immutable',
      message = 'product offer provider/platform/product mapping is immutable';
  end if;
  return new;
end;
$$;

create trigger tr_product_offer_mapping_immutable
  before update on public.product_offers
  for each row execute function public.tr_product_offer_mapping_immutable();

create or replace function public.tr_commerce_account_link_identity_immutable()
returns trigger
language plpgsql
as $$
begin
  if row(old.subject_id, old.provider, old.external_account_fingerprint)
     is distinct from
     row(new.subject_id, new.provider, new.external_account_fingerprint) then
    raise exception using
      errcode = '23514',
      constraint = 'tr_commerce_account_link_identity_immutable',
      message = 'verified commerce account identity cannot be reparented or rewritten';
  end if;

  if old.status = 'revoked' and new.status <> 'revoked' then
    raise exception using
      errcode = '23514',
      constraint = 'tr_commerce_account_link_no_reactivate',
      message = 'revoked commerce account link cannot be reactivated in place';
  end if;
  return new;
end;
$$;

create trigger tr_commerce_account_link_identity_immutable
  before update on public.commerce_account_links
  for each row execute function public.tr_commerce_account_link_identity_immutable();

create or replace function public.ct_validate_purchase_intent_authority()
returns trigger
language plpgsql
as $$
declare
  owner_kind text;
  owner_status text;
  offer_provider text;
  link_provider text;
  link_status text;
begin
  select kind, status into owner_kind, owner_status
  from public.subjects where id = new.subject_id;

  if owner_kind is distinct from 'member' or owner_status is distinct from 'active' then
    raise exception using
      errcode = '23514',
      constraint = 'ct_purchase_intent_member_only',
      message = 'purchase intent requires an active member subject';
  end if;

  if new.provider_account_link_id is not null then
    select po.provider into offer_provider
    from public.product_offers po where po.id = new.product_offer_id;

    select cal.provider, cal.status into link_provider, link_status
    from public.commerce_account_links cal
    where cal.id = new.provider_account_link_id and cal.subject_id = new.subject_id;

    if link_provider is distinct from offer_provider or link_status is distinct from 'active' then
      raise exception using
        errcode = '23514',
        constraint = 'ct_purchase_intent_provider_link',
        message = 'purchase intent provider account link must be active and match offer provider';
    end if;
  end if;

  return new;
end;
$$;

create constraint trigger ct_purchase_intent_authority
  after insert or update of subject_id, product_offer_id, provider_account_link_id
  on public.purchase_intents
  deferrable initially immediate
  for each row execute function public.ct_validate_purchase_intent_authority();

create or replace function public.tr_purchase_intent_identity_immutable()
returns trigger
language plpgsql
as $$
begin
  if row(old.subject_id, old.product_offer_id, old.provider_account_link_id,
         old.idempotency_key, old.request_hash, old.offer_snapshot_jsonb, old.offer_snapshot_hash)
     is distinct from
     row(new.subject_id, new.product_offer_id, new.provider_account_link_id,
         new.idempotency_key, new.request_hash, new.offer_snapshot_jsonb, new.offer_snapshot_hash) then
    raise exception using
      errcode = '23514',
      constraint = 'tr_purchase_intent_identity_immutable',
      message = 'purchase intent request and pinned offer snapshot are immutable';
  end if;
  return new;
end;
$$;

create trigger tr_purchase_intent_identity_immutable
  before update on public.purchase_intents
  for each row execute function public.tr_purchase_intent_identity_immutable();

create or replace function public.tr_commerce_receipt_identity_immutable()
returns trigger
language plpgsql
as $$
begin
  if row(old.subject_id, old.purchase_intent_id, old.provider_account_link_id,
         old.platform, old.provider, old.external_transaction_id,
         old.external_original_transaction_id, old.receipt_fingerprint)
     is distinct from
     row(new.subject_id, new.purchase_intent_id, new.provider_account_link_id,
         new.platform, new.provider, new.external_transaction_id,
         new.external_original_transaction_id, new.receipt_fingerprint) then
    raise exception using
      errcode = '23514',
      constraint = 'tr_commerce_receipt_identity_immutable',
      message = 'commerce receipt ownership and provider transaction identity are immutable';
  end if;

  if old.product_offer_id is not null and new.product_offer_id is distinct from old.product_offer_id then
    raise exception using
      errcode = '23514',
      constraint = 'tr_commerce_receipt_offer_no_rewrite',
      message = 'resolved receipt product offer cannot be rewritten';
  end if;
  return new;
end;
$$;

create trigger tr_commerce_receipt_identity_immutable
  before update on public.commerce_receipts
  for each row execute function public.tr_commerce_receipt_identity_immutable();

create or replace function public.ct_validate_commerce_receipt_authority()
returns trigger
language plpgsql
as $$
declare
  offer_provider text;
  offer_platform text;
  intent_offer_id uuid;
  link_status text;
begin
  if new.product_offer_id is not null then
    select provider, platform into offer_provider, offer_platform
    from public.product_offers where id = new.product_offer_id;

    if offer_provider is distinct from new.provider or offer_platform is distinct from new.platform then
      raise exception using
        errcode = '23514',
        constraint = 'ct_commerce_receipt_offer_mapping',
        message = 'receipt provider/platform must match resolved product offer';
    end if;
  end if;

  if new.purchase_intent_id is not null then
    select product_offer_id into intent_offer_id
    from public.purchase_intents
    where id = new.purchase_intent_id and subject_id = new.subject_id;

    if new.product_offer_id is not null and intent_offer_id is distinct from new.product_offer_id then
      raise exception using
        errcode = '23514',
        constraint = 'ct_commerce_receipt_intent_mapping',
        message = 'receipt resolved offer must equal the purchase intent offer';
    end if;
  end if;

  if new.provider_account_link_id is not null and new.verification_status = 'verified' then
    select status into link_status
    from public.commerce_account_links
    where id = new.provider_account_link_id
      and subject_id = new.subject_id
      and provider = new.provider;

    if link_status is distinct from 'active' then
      raise exception using
        errcode = '23514',
        constraint = 'ct_commerce_receipt_active_account_link',
        message = 'verified receipt requires an active provider account link when one is pinned';
    end if;
  end if;

  if new.verification_status = 'verified' and new.product_offer_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'ct_commerce_receipt_verified_offer',
      message = 'verified receipt requires a resolved product offer';
  end if;

  return new;
end;
$$;

create constraint trigger ct_commerce_receipt_authority
  after insert or update of subject_id, purchase_intent_id, provider_account_link_id,
    product_offer_id, platform, provider, verification_status
  on public.commerce_receipts
  deferrable initially immediate
  for each row execute function public.ct_validate_commerce_receipt_authority();

create or replace function public.ct_validate_provider_event_resolution()
returns trigger
language plpgsql
as $$
declare
  link_status text;
  receipt_provider text;
  receipt_status text;
begin
  if new.resolution_source_type = 'manual' then
    raise exception using
      errcode = '23514',
      constraint = 'ct_provider_event_manual_resolution_disabled',
      message = 'manual provider-event resolution is disabled pending SRC-07 audited proof authority';
  end if;

  if new.resolution_source_type = 'account_link' then
    select status into link_status
    from public.commerce_account_links
    where id = new.resolved_account_link_id
      and subject_id = new.resolved_subject_id
      and provider = new.provider;

    if link_status is distinct from 'active' then
      raise exception using
        errcode = '23514',
        constraint = 'ct_provider_event_verified_resolution',
        message = 'provider event account-link resolution requires an active verified link';
    end if;
  elsif new.resolution_source_type = 'receipt' then
    select provider, verification_status into receipt_provider, receipt_status
    from public.commerce_receipts
    where id = new.resolved_receipt_id and subject_id = new.resolved_subject_id;

    if receipt_provider is distinct from new.provider
       or receipt_status not in ('verified', 'revoked') then
      raise exception using
        errcode = '23514',
        constraint = 'ct_provider_event_verified_resolution',
        message = 'provider event receipt resolution requires same-provider verified transaction lineage';
    end if;
  end if;

  if new.status in ('verified', 'processed')
     and new.resolution_source_type not in ('account_link', 'receipt') then
    raise exception using
      errcode = '23514',
      constraint = 'ct_provider_event_verified_resolution',
      message = 'verified/processed provider event requires auditable account-link or receipt resolution';
  end if;

  return new;
end;
$$;

create constraint trigger ct_provider_event_resolution
  after insert or update of provider, resolved_subject_id, resolution_source_type,
    resolved_account_link_id, resolved_receipt_id, status
  on public.commerce_provider_events
  deferrable initially immediate
  for each row execute function public.ct_validate_provider_event_resolution();

create or replace function public.tr_provider_event_identity_immutable()
returns trigger
language plpgsql
as $$
begin
  if row(old.provider, old.external_event_id, old.event_type,
         old.external_transaction_id, old.external_original_transaction_id,
         old.payload_fingerprint, old.provider_occurred_at, old.provider_ordering_key)
     is distinct from
     row(new.provider, new.external_event_id, new.event_type,
         new.external_transaction_id, new.external_original_transaction_id,
         new.payload_fingerprint, new.provider_occurred_at, new.provider_ordering_key) then
    raise exception using
      errcode = '23514',
      constraint = 'tr_provider_event_identity_immutable',
      message = 'provider event inbound identity/order provenance is immutable';
  end if;
  return new;
end;
$$;

create trigger tr_provider_event_identity_immutable
  before update on public.commerce_provider_events
  for each row execute function public.tr_provider_event_identity_immutable();

create or replace function public.tr_entitlement_grant_identity_immutable()
returns trigger
language plpgsql
as $$
begin
  if row(old.subject_id, old.entitlement_key, old.scope_key, old.grant_key, old.grant_source_type, old.valid_from)
     is distinct from
     row(new.subject_id, new.entitlement_key, new.scope_key, new.grant_key, new.grant_source_type, new.valid_from) then
    raise exception using
      errcode = '23514',
      constraint = 'tr_entitlement_grant_identity_immutable',
      message = 'entitlement grant source identity and logical scope are immutable';
  end if;
  return new;
end;
$$;

create trigger tr_entitlement_grant_identity_immutable
  before update on public.entitlement_grants
  for each row execute function public.tr_entitlement_grant_identity_immutable();

create or replace function public.ct_validate_entitlement_event_source()
returns trigger
language plpgsql
as $$
declare
  receipt_status text;
  provider_event_status text;
begin
  if new.source_type = 'receipt' then
    select verification_status into receipt_status
    from public.commerce_receipts
    where id = new.source_receipt_id and subject_id = new.subject_id;

    if receipt_status not in ('verified', 'revoked') then
      raise exception using
        errcode = '23514',
        constraint = 'ct_entitlement_event_verified_source',
        message = 'receipt-sourced entitlement event requires verified transaction provenance';
    end if;

    if new.event_type in ('granted', 'renewed', 'restored') and receipt_status is distinct from 'verified' then
      raise exception using
        errcode = '23514',
        constraint = 'ct_entitlement_event_verified_source',
        message = 'granting entitlement event cannot originate from a revoked receipt';
    end if;
  elsif new.source_type = 'provider_event' then
    select status into provider_event_status
    from public.commerce_provider_events
    where id = new.source_provider_event_id and resolved_subject_id = new.subject_id;

    if provider_event_status not in ('verified', 'processed') then
      raise exception using
        errcode = '23514',
        constraint = 'ct_entitlement_event_verified_source',
        message = 'provider-event entitlement effect requires verified subject resolution';
    end if;
  end if;

  return new;
end;
$$;

create constraint trigger ct_entitlement_event_verified_source
  after insert on public.entitlement_events
  deferrable initially immediate
  for each row execute function public.ct_validate_entitlement_event_source();

create or replace function public.tr_entitlement_event_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception using
    errcode = '23514',
    constraint = 'tr_entitlement_event_append_only',
    message = 'entitlement events are append-only lifecycle provenance';
end;
$$;

create trigger tr_entitlement_event_append_only
  before update or delete on public.entitlement_events
  for each row execute function public.tr_entitlement_event_append_only();

create or replace function public.tr_entitlement_identity_immutable()
returns trigger
language plpgsql
as $$
begin
  if row(old.subject_id, old.entitlement_key, old.scope_key)
     is distinct from
     row(new.subject_id, new.entitlement_key, new.scope_key) then
    raise exception using
      errcode = '23514',
      constraint = 'tr_entitlement_identity_immutable',
      message = 'logical entitlement owner/key/scope identity is immutable';
  end if;
  return new;
end;
$$;

create trigger tr_entitlement_identity_immutable
  before update on public.entitlements
  for each row execute function public.tr_entitlement_identity_immutable();
