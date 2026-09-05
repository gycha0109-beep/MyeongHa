-- Commerce Payment Source Authority hardening.
--
-- This migration is additive and provider-neutral. It does NOT activate a PSP,
-- payment route, webhook, verified entitlement apply command, or Guest Purchase Intent v2.
-- It closes structural gaps identified by the Commerce deep review while preserving
-- historical v1 rows whose newer authority fields are NULL.

alter table public.purchase_intents
  add column expected_amount_minor bigint null,
  add column expected_currency text null,
  add column charge_terms_version text null;

alter table public.purchase_intents
  add constraint purchase_intents_expected_amount_check
    check (expected_amount_minor is null or expected_amount_minor >= 0),
  add constraint purchase_intents_charge_terms_pair_check
    check (
      (expected_amount_minor is null and expected_currency is null and charge_terms_version is null)
      or
      (expected_amount_minor is not null
       and expected_currency is not null
       and charge_terms_version is not null
       and expected_currency ~ '^[A-Z]{3}$'
       and btrim(charge_terms_version) <> '')
    );

alter table public.commerce_receipts
  add column environment text null,
  add column verifier_revision text null,
  add column verified_amount_minor bigint null,
  add column verified_currency text null;

alter table public.commerce_receipts
  add constraint commerce_receipts_environment_check
    check (environment is null or environment in ('sandbox', 'production')),
  add constraint commerce_receipts_verified_amount_check
    check (verified_amount_minor is null or verified_amount_minor >= 0),
  add constraint commerce_receipts_verified_money_pair_check
    check (
      (verified_amount_minor is null and verified_currency is null)
      or
      (verified_amount_minor is not null
       and verified_currency is not null
       and verified_currency ~ '^[A-Z]{3}$')
    ),
  add constraint commerce_receipts_verifier_revision_check
    check (verifier_revision is null or btrim(verifier_revision) <> '');

alter table public.commerce_provider_events
  add column environment text null,
  add column verifier_revision text null;

alter table public.commerce_provider_events
  add constraint commerce_provider_events_environment_check
    check (environment is null or environment in ('sandbox', 'production')),
  add constraint commerce_provider_events_verifier_revision_check
    check (verifier_revision is null or btrim(verifier_revision) <> '');

alter table public.entitlement_grants
  add column source_receipt_id uuid null;

alter table public.entitlement_grants
  add constraint entitlement_grants_source_receipt_subject_fk
    foreign key (source_receipt_id, subject_id)
    references public.commerce_receipts(id, subject_id),
  add constraint entitlement_grants_source_receipt_type_check
    check (source_receipt_id is null or grant_source_type = 'purchase');

alter table public.entitlement_events
  add column target_status text null,
  add column target_valid_from timestamptz null,
  add column target_valid_until timestamptz null,
  add column reason_code text null;

alter table public.entitlement_events
  add constraint entitlement_events_target_status_check
    check (target_status is null or target_status in ('active', 'expired', 'revoked')),
  add constraint entitlement_events_target_validity_check
    check (
      target_valid_from is null
      or target_valid_until is null
      or target_valid_until >= target_valid_from
    ),
  add constraint entitlement_events_reason_code_check
    check (reason_code is null or btrim(reason_code) <> ''),
  add constraint entitlement_events_v2_effect_shape_check
    check (
      event_schema_version <> 'ent-event-v2'
      or (
        target_status is not null
        and target_valid_from is not null
        and (
          (event_type in ('granted', 'renewed', 'restored') and target_status = 'active')
          or (event_type = 'expired' and target_status = 'expired')
          or (event_type = 'revoked' and target_status = 'revoked')
          or (event_type = 'adjusted' and reason_code is not null)
        )
      )
    );

-- Charge terms become immutable once a versioned tuple has been pinned. Historical v1
-- intents remain NULL and may be replayed unchanged; future Purchase Intent v2 must pin
-- the complete tuple before provider handoff.
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

  if old.charge_terms_version is not null
     and row(old.expected_amount_minor, old.expected_currency, old.charge_terms_version)
         is distinct from
         row(new.expected_amount_minor, new.expected_currency, new.charge_terms_version) then
    raise exception using
      errcode = '23514',
      constraint = 'tr_purchase_intent_charge_terms_immutable',
      message = 'pinned purchase charge terms are immutable';
  end if;

  return new;
end;
$$;

-- Verified receipt facts may be filled exactly once, then remain immutable. A receipt
-- may move from verified to revoked, but verified evidence bytes/provenance are not
-- rewritten to represent the later lifecycle fact.
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

  if old.environment is not null and new.environment is distinct from old.environment then
    raise exception using
      errcode = '23514',
      constraint = 'tr_commerce_receipt_environment_immutable',
      message = 'verified receipt environment is immutable';
  end if;

  if old.verifier_revision is not null and new.verifier_revision is distinct from old.verifier_revision then
    raise exception using
      errcode = '23514',
      constraint = 'tr_commerce_receipt_verifier_immutable',
      message = 'verified receipt verifier revision is immutable';
  end if;

  if old.verified_amount_minor is not null
     and row(old.verified_amount_minor, old.verified_currency)
         is distinct from row(new.verified_amount_minor, new.verified_currency) then
    raise exception using
      errcode = '23514',
      constraint = 'tr_commerce_receipt_money_immutable',
      message = 'verified receipt monetary facts are immutable';
  end if;

  if old.verified_payload_jsonb is not null
     and new.verified_payload_jsonb is distinct from old.verified_payload_jsonb then
    raise exception using
      errcode = '23514',
      constraint = 'tr_commerce_receipt_payload_immutable',
      message = 'verified receipt payload snapshot is immutable once recorded';
  end if;

  if old.verification_status = 'verified'
     and new.verification_status not in ('verified', 'revoked') then
    raise exception using
      errcode = '23514',
      constraint = 'tr_commerce_receipt_verified_transition',
      message = 'verified receipt may only remain verified or become revoked';
  end if;

  if old.verification_status in ('rejected', 'revoked')
     and new.verification_status is distinct from old.verification_status then
    raise exception using
      errcode = '23514',
      constraint = 'tr_commerce_receipt_terminal_transition',
      message = 'rejected or revoked receipt state is terminal in place';
  end if;

  return new;
end;
$$;

create or replace function public.ct_validate_commerce_receipt_authority()
returns trigger
language plpgsql
as $$
declare
  offer_provider text;
  offer_platform text;
  intent_offer_id uuid;
  intent_expected_amount bigint;
  intent_expected_currency text;
  intent_charge_terms_version text;
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
    select product_offer_id, expected_amount_minor, expected_currency, charge_terms_version
      into intent_offer_id, intent_expected_amount, intent_expected_currency, intent_charge_terms_version
    from public.purchase_intents
    where id = new.purchase_intent_id and subject_id = new.subject_id;

    if new.product_offer_id is not null and intent_offer_id is distinct from new.product_offer_id then
      raise exception using
        errcode = '23514',
        constraint = 'ct_commerce_receipt_intent_mapping',
        message = 'receipt resolved offer must equal the purchase intent offer';
    end if;

    if intent_charge_terms_version is not null then
      if new.verified_amount_minor is null
         or new.verified_currency is null
         or new.verified_amount_minor is distinct from intent_expected_amount
         or new.verified_currency is distinct from intent_expected_currency then
        raise exception using
          errcode = '23514',
          constraint = 'ct_commerce_receipt_charge_terms_mismatch',
          message = 'verified receipt amount/currency must exactly match pinned purchase charge terms';
      end if;
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

-- Provider-event inbound identity remains immutable as before. Environment/verifier and
-- minimized verified payload are additionally one-way facts, and canonical resolution
-- may be established once but never reparented in place afterward.
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

  if old.environment is not null and new.environment is distinct from old.environment then
    raise exception using
      errcode = '23514',
      constraint = 'tr_provider_event_environment_immutable',
      message = 'provider event environment is immutable once resolved';
  end if;

  if old.verifier_revision is not null and new.verifier_revision is distinct from old.verifier_revision then
    raise exception using
      errcode = '23514',
      constraint = 'tr_provider_event_verifier_immutable',
      message = 'provider event verifier revision is immutable once resolved';
  end if;

  if old.verified_payload_jsonb is not null
     and new.verified_payload_jsonb is distinct from old.verified_payload_jsonb then
    raise exception using
      errcode = '23514',
      constraint = 'tr_provider_event_payload_immutable',
      message = 'verified provider-event payload snapshot is immutable once recorded';
  end if;

  if old.resolved_subject_id is not null
     or old.resolution_source_type is not null
     or old.resolved_account_link_id is not null
     or old.resolved_receipt_id is not null then
    if row(old.resolved_subject_id, old.resolution_source_type,
           old.resolved_account_link_id, old.resolved_receipt_id)
       is distinct from
       row(new.resolved_subject_id, new.resolution_source_type,
           new.resolved_account_link_id, new.resolved_receipt_id) then
      raise exception using
        errcode = '23514',
        constraint = 'tr_provider_event_resolution_immutable',
        message = 'provider event canonical resolution cannot be rewritten in place';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.ct_validate_provider_event_resolution()
returns trigger
language plpgsql
as $$
declare
  link_status text;
  receipt_provider text;
  receipt_status text;
  receipt_transaction_id text;
  receipt_original_transaction_id text;
  receipt_environment text;
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
    select provider, verification_status, external_transaction_id,
           external_original_transaction_id, environment
      into receipt_provider, receipt_status, receipt_transaction_id,
           receipt_original_transaction_id, receipt_environment
    from public.commerce_receipts
    where id = new.resolved_receipt_id and subject_id = new.resolved_subject_id;

    if receipt_provider is distinct from new.provider
       or receipt_status not in ('verified', 'revoked') then
      raise exception using
        errcode = '23514',
        constraint = 'ct_provider_event_verified_resolution',
        message = 'provider event receipt resolution requires same-provider verified transaction lineage';
    end if;

    if not (
      new.external_transaction_id is not distinct from receipt_transaction_id
      or (new.external_original_transaction_id is not null
          and new.external_original_transaction_id = receipt_transaction_id)
      or (receipt_original_transaction_id is not null
          and new.external_transaction_id = receipt_original_transaction_id)
      or (new.external_original_transaction_id is not null
          and receipt_original_transaction_id is not null
          and new.external_original_transaction_id = receipt_original_transaction_id)
    ) then
      raise exception using
        errcode = '23514',
        constraint = 'ct_provider_event_transaction_lineage',
        message = 'provider event transaction identity does not match the resolved receipt lineage';
    end if;

    if (new.environment is not null or receipt_environment is not null)
       and new.environment is distinct from receipt_environment then
      raise exception using
        errcode = '23514',
        constraint = 'ct_provider_event_environment_lineage',
        message = 'provider event environment must match the resolved receipt environment';
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

-- Purchase grants may additionally pin the exact source receipt. Existing historical
-- grants remain NULL; future verified apply must use this field before Production activation.
create or replace function public.tr_entitlement_grant_identity_immutable()
returns trigger
language plpgsql
as $$
begin
  if row(old.subject_id, old.entitlement_key, old.scope_key, old.grant_key,
         old.grant_source_type, old.valid_from, old.source_receipt_id)
     is distinct from
     row(new.subject_id, new.entitlement_key, new.scope_key, new.grant_key,
         new.grant_source_type, new.valid_from, new.source_receipt_id) then
    raise exception using
      errcode = '23514',
      constraint = 'tr_entitlement_grant_identity_immutable',
      message = 'entitlement grant source identity and logical scope are immutable';
  end if;
  return new;
end;
$$;
