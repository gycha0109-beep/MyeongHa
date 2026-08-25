-- MyeongHa DDL draft: notification identity/lifecycle guards.
-- Token rotation and delivery state updates remain allowed; ownership identities cannot be reparented.

create or replace function public.tr_validate_device_installation_identity()
returns trigger
language plpgsql
as $$
begin
  if new.id is distinct from old.id
     or new.subject_id is distinct from old.subject_id
     or new.platform is distinct from old.platform
     or new.installation_key is distinct from old.installation_key
     or new.created_at is distinct from old.created_at then
    raise exception using
      errcode = '23514',
      constraint = 'tr_device_installation_identity_immutable',
      message = 'device installation owner/platform/installation identity is immutable; revoke then create a new binding';
  end if;
  return new;
end;
$$;

create trigger tr_device_installation_identity_immutable
  before update on public.device_installations
  for each row execute function public.tr_validate_device_installation_identity();

create or replace function public.tr_validate_notification_delivery_identity()
returns trigger
language plpgsql
as $$
begin
  if new.id is distinct from old.id
     or new.subject_id is distinct from old.subject_id
     or new.notification_id is distinct from old.notification_id
     or new.installation_id is distinct from old.installation_id
     or new.created_at is distinct from old.created_at then
    raise exception using
      errcode = '23514',
      constraint = 'tr_notification_delivery_identity_immutable',
      message = 'notification delivery ownership/target identity is immutable';
  end if;
  return new;
end;
$$;

create trigger tr_notification_delivery_identity_immutable
  before update on public.notification_deliveries
  for each row execute function public.tr_validate_notification_delivery_identity();

create or replace function public.tr_validate_notification_delivery_attempt_update()
returns trigger
language plpgsql
as $$
begin
  if old.status in ('sent', 'failed') then
    raise exception using
      errcode = '55000',
      constraint = 'tr_notification_delivery_attempt_terminal_immutable',
      message = 'terminal notification delivery attempt is immutable';
  end if;

  if new.id is distinct from old.id
     or new.delivery_id is distinct from old.delivery_id
     or new.subject_id is distinct from old.subject_id
     or new.attempt_no is distinct from old.attempt_no
     or new.provider is distinct from old.provider
     or new.started_at is distinct from old.started_at then
    raise exception using
      errcode = '23514',
      constraint = 'tr_notification_delivery_attempt_identity_immutable',
      message = 'notification delivery attempt identity/provider provenance is immutable';
  end if;

  if new.status not in ('running', 'sent', 'failed') then
    raise exception using
      errcode = '23514',
      constraint = 'tr_notification_delivery_attempt_state_transition',
      message = 'invalid notification delivery attempt state';
  end if;

  return new;
end;
$$;

create trigger tr_notification_delivery_attempt_update
  before update on public.notification_delivery_attempts
  for each row execute function public.tr_validate_notification_delivery_attempt_update();

create or replace function public.tr_validate_data_deletion_job_identity()
returns trigger
language plpgsql
as $$
begin
  if new.id is distinct from old.id
     or new.subject_id is distinct from old.subject_id
     or new.scope is distinct from old.scope
     or new.target_resource_type is distinct from old.target_resource_type
     or new.target_resource_id is distinct from old.target_resource_id
     or new.request_dedupe_key is distinct from old.request_dedupe_key
     or new.requested_at is distinct from old.requested_at then
    raise exception using
      errcode = '23514',
      constraint = 'tr_data_deletion_job_request_immutable',
      message = 'deletion request owner/scope/target/dedupe identity is immutable';
  end if;
  return new;
end;
$$;

create trigger tr_data_deletion_job_request_immutable
  before update on public.data_deletion_jobs
  for each row execute function public.tr_validate_data_deletion_job_identity();
