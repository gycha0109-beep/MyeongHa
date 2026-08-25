-- MyeongHa DDL draft: notification and push delivery authority.
-- Raw push tokens remain encrypted; analytics must use no bearer token material.

create table public.device_installations (
  id uuid primary key,
  subject_id uuid not null,
  platform text not null,
  installation_key text not null,
  push_token_encrypted text null,
  push_token_key_id text null,
  token_fingerprint text null,
  app_version text null,
  client_capability text not null,
  last_seen_at timestamptz not null,
  revoked_at timestamptz null,
  created_at timestamptz not null,
  constraint device_installations_id_subject_unique unique (id, subject_id),
  constraint device_installations_subject_fk
    foreign key (subject_id) references public.subjects(id),
  constraint device_installations_platform_check
    check (platform in ('ios', 'android', 'web')),
  constraint device_installations_token_key_shape_check
    check ((push_token_encrypted is null) = (push_token_key_id is null)),
  constraint device_installations_token_fingerprint_shape_check
    check ((push_token_encrypted is null) = (token_fingerprint is null))
);

create unique index device_installations_active_identity_idx
  on public.device_installations(platform, installation_key)
  where revoked_at is null;

create unique index device_installations_active_token_idx
  on public.device_installations(token_fingerprint)
  where token_fingerprint is not null and revoked_at is null;

create table public.notification_settings (
  subject_id uuid primary key,
  timezone_override text null,
  quiet_start time null,
  quiet_end time null,
  preview_mode text not null,
  global_enabled boolean not null,
  updated_at timestamptz not null,
  constraint notification_settings_subject_fk
    foreign key (subject_id) references public.subjects(id),
  constraint notification_settings_preview_mode_check
    check (preview_mode in ('discreet', 'character_only', 'full')),
  constraint notification_settings_quiet_pair_check
    check ((quiet_start is null) = (quiet_end is null))
);

create table public.notification_preferences (
  subject_id uuid not null,
  category text not null,
  enabled boolean not null,
  updated_at timestamptz not null,
  constraint notification_preferences_pk primary key (subject_id, category),
  constraint notification_preferences_subject_fk
    foreign key (subject_id) references public.subjects(id),
  constraint notification_preferences_category_check
    check (category in ('character_return', 'new_monthly_reading', 'episode_unlock', 'new_character', 'service_notice'))
);

create table public.notifications (
  id uuid primary key,
  subject_id uuid not null,
  category text not null,
  character_id text null,
  content_bundle_id uuid null,
  source_world_event_id uuid null,
  template_key text not null,
  payload_jsonb jsonb not null,
  dedupe_key text not null,
  status text not null,
  scheduled_at timestamptz not null,
  read_at timestamptz null,
  created_at timestamptz not null,
  constraint notifications_subject_dedupe_unique unique (subject_id, dedupe_key),
  constraint notifications_id_subject_unique unique (id, subject_id),
  constraint notifications_subject_fk
    foreign key (subject_id) references public.subjects(id),
  constraint notifications_character_bundle_fk
    foreign key (character_id, content_bundle_id)
    references public.character_runtime_catalog(character_id, content_bundle_id),
  constraint notifications_content_bundle_fk
    foreign key (content_bundle_id) references public.content_bundles(id),
  constraint notifications_source_world_subject_fk
    foreign key (source_world_event_id, subject_id)
    references public.world_events(id, subject_id),
  constraint notifications_status_check
    check (status in ('queued', 'ready', 'read', 'cancelled', 'expired')),
  constraint notifications_read_timestamp_check
    check (status <> 'read' or read_at is not null),
  constraint notifications_character_bundle_shape_check
    check (character_id is null or content_bundle_id is not null)
);

create table public.notification_deliveries (
  id uuid primary key,
  subject_id uuid not null,
  notification_id uuid not null,
  installation_id uuid not null,
  status text not null,
  next_attempt_no integer not null default 1,
  last_provider_message_ref text null,
  last_error_code text null,
  sent_at timestamptz null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  constraint notification_deliveries_notification_installation_unique
    unique (notification_id, installation_id),
  constraint notification_deliveries_id_subject_unique unique (id, subject_id),
  constraint notification_deliveries_notification_subject_fk
    foreign key (notification_id, subject_id)
    references public.notifications(id, subject_id),
  constraint notification_deliveries_installation_subject_fk
    foreign key (installation_id, subject_id)
    references public.device_installations(id, subject_id),
  constraint notification_deliveries_status_check
    check (status in ('pending', 'sending', 'sent', 'failed', 'cancelled')),
  constraint notification_deliveries_next_attempt_check
    check (next_attempt_no >= 1),
  constraint notification_deliveries_sent_timestamp_check
    check (status <> 'sent' or sent_at is not null)
);

create table public.notification_delivery_attempts (
  id uuid primary key,
  delivery_id uuid not null,
  subject_id uuid not null,
  attempt_no integer not null,
  provider text not null,
  status text not null,
  provider_message_ref text null,
  error_code text null,
  started_at timestamptz not null,
  finished_at timestamptz null,
  constraint notification_delivery_attempts_delivery_no_unique
    unique (delivery_id, attempt_no),
  constraint notification_delivery_attempts_delivery_subject_fk
    foreign key (delivery_id, subject_id)
    references public.notification_deliveries(id, subject_id),
  constraint notification_delivery_attempts_attempt_no_check
    check (attempt_no > 0),
  constraint notification_delivery_attempts_status_check
    check (status in ('running', 'sent', 'failed')),
  constraint notification_delivery_attempts_terminal_timestamp_check
    check (status = 'running' or finished_at is not null)
);

create index device_installations_subject_revoked_idx
  on public.device_installations(subject_id, revoked_at);
create index notifications_subject_status_scheduled_idx
  on public.notifications(subject_id, status, scheduled_at);
create index notification_deliveries_subject_status_updated_idx
  on public.notification_deliveries(subject_id, status, updated_at);
create index notification_delivery_attempts_delivery_no_idx
  on public.notification_delivery_attempts(delivery_id, attempt_no desc);
