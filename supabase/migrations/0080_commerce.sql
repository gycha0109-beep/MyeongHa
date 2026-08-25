-- MyeongHa DDL draft: M08 commerce / entitlement authority.
-- Provider rail/platform policy remains OPEN-P0. These tables preserve verified
-- provenance and effective access authority without treating client success UI as truth.

create table public.products (
  id uuid primary key,
  product_key text not null,
  product_type text not null,
  enabled boolean not null,
  metadata_jsonb jsonb null,
  created_at timestamptz not null,
  retired_at timestamptz null,
  constraint products_product_key_unique unique (product_key),
  constraint products_type_check
    check (product_type in ('reading', 'episode', 'subscription', 'bundle'))
);

create table public.product_offers (
  id uuid primary key,
  product_id uuid not null,
  platform text not null,
  provider text not null,
  external_product_id text not null,
  currency text null,
  display_price_minor bigint null,
  enabled boolean not null,
  created_at timestamptz not null,
  retired_at timestamptz null,
  price_cache_updated_at timestamptz null,
  constraint product_offers_provider_external_unique
    unique (provider, external_product_id),
  constraint product_offers_snapshot_target_unique
    unique (id, provider, external_product_id, product_id),
  constraint product_offers_product_fk
    foreign key (product_id) references public.products(id),
  constraint product_offers_platform_check
    check (platform in ('web', 'ios', 'android')),
  constraint product_offers_display_price_check
    check (display_price_minor is null or display_price_minor >= 0)
);

create table public.commerce_account_links (
  id uuid primary key,
  subject_id uuid not null,
  provider text not null,
  external_account_fingerprint text not null,
  status text not null,
  verified_at timestamptz not null,
  revoked_at timestamptz null,
  created_at timestamptz not null,
  constraint commerce_account_links_id_subject_unique
    unique (id, subject_id),
  constraint commerce_account_links_id_subject_provider_unique
    unique (id, subject_id, provider),
  constraint commerce_account_links_subject_fk
    foreign key (subject_id) references public.subjects(id),
  constraint commerce_account_links_status_check
    check (status in ('active', 'revoked')),
  constraint commerce_account_links_revoked_timestamp_check
    check (status <> 'revoked' or revoked_at is not null)
);

create unique index commerce_account_links_active_external_idx
  on public.commerce_account_links(provider, external_account_fingerprint)
  where status = 'active';

create table public.purchase_intents (
  id uuid primary key,
  subject_id uuid not null,
  product_offer_id uuid not null,
  provider_account_link_id uuid null,
  idempotency_key text not null,
  request_hash text not null,
  offer_snapshot_jsonb jsonb not null,
  offer_snapshot_hash text not null,
  status text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  constraint purchase_intents_subject_idempotency_unique
    unique (subject_id, idempotency_key),
  constraint purchase_intents_id_subject_unique
    unique (id, subject_id),
  constraint purchase_intents_subject_fk
    foreign key (subject_id) references public.subjects(id),
  constraint purchase_intents_product_offer_fk
    foreign key (product_offer_id) references public.product_offers(id),
  constraint purchase_intents_account_subject_fk
    foreign key (provider_account_link_id, subject_id)
    references public.commerce_account_links(id, subject_id),
  constraint purchase_intents_status_check
    check (status in ('created', 'pending', 'verified', 'failed', 'cancelled'))
);

create table public.commerce_receipts (
  id uuid primary key,
  subject_id uuid not null,
  purchase_intent_id uuid null,
  provider_account_link_id uuid null,
  product_offer_id uuid null,
  platform text not null,
  provider text not null,
  external_transaction_id text not null,
  external_original_transaction_id text null,
  receipt_fingerprint text not null,
  verification_status text not null,
  verified_payload_jsonb jsonb null,
  verified_at timestamptz null,
  created_at timestamptz not null,
  constraint commerce_receipts_provider_transaction_unique
    unique (provider, external_transaction_id),
  constraint commerce_receipts_id_subject_unique
    unique (id, subject_id),
  constraint commerce_receipts_subject_fk
    foreign key (subject_id) references public.subjects(id),
  constraint commerce_receipts_purchase_subject_fk
    foreign key (purchase_intent_id, subject_id)
    references public.purchase_intents(id, subject_id),
  constraint commerce_receipts_account_subject_provider_fk
    foreign key (provider_account_link_id, subject_id, provider)
    references public.commerce_account_links(id, subject_id, provider),
  constraint commerce_receipts_product_offer_fk
    foreign key (product_offer_id) references public.product_offers(id),
  constraint commerce_receipts_platform_check
    check (platform in ('web', 'ios', 'android')),
  constraint commerce_receipts_verification_status_check
    check (verification_status in ('pending', 'verified', 'rejected', 'revoked')),
  constraint commerce_receipts_verified_timestamp_check
    check (verification_status <> 'verified' or verified_at is not null)
);

create table public.commerce_provider_events (
  id uuid primary key,
  provider text not null,
  external_event_id text not null,
  event_type text not null,
  external_transaction_id text null,
  external_original_transaction_id text null,
  resolved_subject_id uuid null,
  resolution_source_type text null,
  resolved_account_link_id uuid null,
  resolved_receipt_id uuid null,
  payload_fingerprint text not null,
  provider_occurred_at timestamptz null,
  provider_ordering_key text null,
  verified_payload_jsonb jsonb null,
  status text not null,
  received_at timestamptz not null,
  processed_at timestamptz null,
  constraint commerce_provider_events_provider_external_unique
    unique (provider, external_event_id),
  constraint commerce_provider_events_id_subject_unique
    unique (id, resolved_subject_id),
  constraint commerce_provider_events_account_subject_provider_fk
    foreign key (resolved_account_link_id, resolved_subject_id, provider)
    references public.commerce_account_links(id, subject_id, provider),
  constraint commerce_provider_events_receipt_subject_fk
    foreign key (resolved_receipt_id, resolved_subject_id)
    references public.commerce_receipts(id, subject_id),
  constraint commerce_provider_events_status_check
    check (status in ('received', 'verified', 'unresolved', 'processed', 'rejected', 'failed')),
  constraint commerce_provider_events_resolution_source_check
    check (resolution_source_type is null or resolution_source_type in ('account_link', 'receipt', 'manual')),
  constraint commerce_provider_events_unresolved_owner_shape_check
    check (
      resolved_subject_id is not null
      or (resolution_source_type is null and resolved_account_link_id is null and resolved_receipt_id is null)
    ),
  constraint commerce_provider_events_account_resolution_shape_check
    check (
      resolution_source_type <> 'account_link'
      or (resolved_subject_id is not null and resolved_account_link_id is not null and resolved_receipt_id is null)
    ),
  constraint commerce_provider_events_receipt_resolution_shape_check
    check (
      resolution_source_type <> 'receipt'
      or (resolved_subject_id is not null and resolved_receipt_id is not null)
    ),
  constraint commerce_provider_events_manual_resolution_shape_check
    check (resolution_source_type <> 'manual' or resolved_subject_id is not null),
  constraint commerce_provider_events_verified_subject_check
    check (status not in ('verified', 'processed') or resolved_subject_id is not null)
);

create table public.entitlement_grants (
  id uuid primary key,
  subject_id uuid not null,
  entitlement_key text not null,
  scope_key text null,
  scope_key_norm text generated always as (coalesce(scope_key, '__GLOBAL__')) stored,
  grant_key text not null,
  grant_source_type text not null,
  status text not null,
  valid_from timestamptz not null,
  valid_until timestamptz null,
  revision bigint not null default 0,
  last_effective_at timestamptz null,
  last_provider_ordering_key text null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  constraint entitlement_grants_logical_source_unique
    unique (subject_id, entitlement_key, scope_key_norm, grant_key),
  constraint entitlement_grants_event_target_unique
    unique (id, subject_id, entitlement_key, scope_key_norm),
  constraint entitlement_grants_subject_fk
    foreign key (subject_id) references public.subjects(id),
  constraint entitlement_grants_scope_key_check
    check (scope_key is null or (scope_key <> '' and scope_key <> '__GLOBAL__')),
  constraint entitlement_grants_source_type_check
    check (grant_source_type in ('purchase', 'subscription', 'promo', 'system', 'admin')),
  constraint entitlement_grants_status_check
    check (status in ('active', 'expired', 'revoked')),
  constraint entitlement_grants_validity_check
    check (valid_until is null or valid_until >= valid_from),
  constraint entitlement_grants_revision_check
    check (revision >= 0)
);

create table public.entitlement_events (
  id uuid primary key,
  grant_id uuid not null,
  subject_id uuid not null,
  entitlement_key text not null,
  scope_key_norm text not null,
  product_id uuid null,
  source_type text not null,
  source_receipt_id uuid null,
  source_provider_event_id uuid null,
  source_actor_ref text null,
  event_type text not null,
  event_schema_version text not null,
  event_dedupe_key text not null,
  effective_at timestamptz not null,
  provider_ordering_key text null,
  payload_jsonb jsonb null,
  created_at timestamptz not null,
  constraint entitlement_events_grant_dedupe_unique
    unique (grant_id, event_dedupe_key),
  constraint entitlement_events_id_grant_subject_unique
    unique (id, grant_id, subject_id),
  constraint entitlement_events_grant_scope_fk
    foreign key (grant_id, subject_id, entitlement_key, scope_key_norm)
    references public.entitlement_grants(id, subject_id, entitlement_key, scope_key_norm),
  constraint entitlement_events_product_fk
    foreign key (product_id) references public.products(id),
  constraint entitlement_events_receipt_subject_fk
    foreign key (source_receipt_id, subject_id)
    references public.commerce_receipts(id, subject_id),
  constraint entitlement_events_provider_event_subject_fk
    foreign key (source_provider_event_id, subject_id)
    references public.commerce_provider_events(id, resolved_subject_id),
  constraint entitlement_events_source_type_check
    check (source_type in ('receipt', 'provider_event', 'system', 'admin')),
  constraint entitlement_events_type_check
    check (event_type in ('granted', 'renewed', 'expired', 'revoked', 'restored', 'adjusted')),
  constraint entitlement_events_receipt_source_shape_check
    check (
      source_type <> 'receipt'
      or (source_receipt_id is not null and source_provider_event_id is null)
    ),
  constraint entitlement_events_provider_source_shape_check
    check (source_type <> 'provider_event' or source_provider_event_id is not null),
  constraint entitlement_events_actor_source_shape_check
    check (source_type not in ('system', 'admin') or source_actor_ref is not null)
);

create table public.entitlements (
  id uuid primary key,
  subject_id uuid not null,
  entitlement_key text not null,
  scope_key text null,
  scope_key_norm text generated always as (coalesce(scope_key, '__GLOBAL__')) stored,
  status text not null,
  active_grant_count integer not null default 0,
  effective_valid_until timestamptz null,
  revision bigint not null default 0,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  constraint entitlements_logical_unique
    unique (subject_id, entitlement_key, scope_key_norm),
  constraint entitlements_subject_fk
    foreign key (subject_id) references public.subjects(id),
  constraint entitlements_scope_key_check
    check (scope_key is null or (scope_key <> '' and scope_key <> '__GLOBAL__')),
  constraint entitlements_status_check
    check (status in ('active', 'inactive')),
  constraint entitlements_active_grant_count_check
    check (active_grant_count >= 0),
  constraint entitlements_active_shape_check
    check (status <> 'active' or active_grant_count > 0),
  constraint entitlements_inactive_shape_check
    check (status <> 'inactive' or active_grant_count = 0),
  constraint entitlements_revision_check
    check (revision >= 0)
);

create index purchase_intents_subject_created_idx
  on public.purchase_intents(subject_id, created_at desc);
create index commerce_receipts_subject_created_idx
  on public.commerce_receipts(subject_id, created_at desc);
create index commerce_provider_events_status_received_idx
  on public.commerce_provider_events(status, received_at);
create index entitlement_grants_logical_idx
  on public.entitlement_grants(subject_id, entitlement_key, scope_key_norm, status);
create index entitlement_events_grant_effective_idx
  on public.entitlement_events(grant_id, effective_at desc);
create index entitlements_subject_lookup_idx
  on public.entitlements(subject_id, entitlement_key, scope_key_norm);
