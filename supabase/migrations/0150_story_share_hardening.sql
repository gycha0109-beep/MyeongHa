-- MyeongHa DDL draft: Slice B immutability and lifecycle guards.
-- Multi-row episode advancement remains a server-command transaction with row locking.

create or replace function public.tr_reject_immutable_projection_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception using
    errcode = '55000',
    constraint = tg_argv[0],
    message = format('%s is an immutable runtime/ledger projection', tg_table_name);
end;
$$;

create trigger tr_episode_runtime_catalog_immutable
  before update or delete on public.episode_runtime_catalog
  for each row execute function public.tr_reject_immutable_projection_mutation('tr_episode_runtime_catalog_immutable');

create trigger tr_episode_participants_immutable
  before update or delete on public.episode_participants
  for each row execute function public.tr_reject_immutable_projection_mutation('tr_episode_participants_immutable');

create trigger tr_episode_progress_events_append_only
  before update or delete on public.episode_progress_events
  for each row execute function public.tr_reject_immutable_projection_mutation('tr_episode_progress_events_append_only');

create or replace function public.tr_validate_character_unlock_identity()
returns trigger
language plpgsql
as $$
begin
  if new.id is distinct from old.id
     or new.subject_id is distinct from old.subject_id
     or new.character_id is distinct from old.character_id
     or new.created_at is distinct from old.created_at then
    raise exception using
      errcode = '23514',
      constraint = 'tr_character_unlock_identity_immutable',
      message = 'character unlock owner/character identity is immutable';
  end if;
  return new;
end;
$$;

create trigger tr_character_unlock_identity_immutable
  before update on public.character_unlocks
  for each row execute function public.tr_validate_character_unlock_identity();

create or replace function public.tr_validate_episode_progress_identity()
returns trigger
language plpgsql
as $$
begin
  if new.id is distinct from old.id
     or new.subject_id is distinct from old.subject_id
     or new.episode_id is distinct from old.episode_id
     or new.content_bundle_id is distinct from old.content_bundle_id then
    raise exception using
      errcode = '23514',
      constraint = 'tr_episode_progress_identity_immutable',
      message = 'episode progress owner/version identity is immutable';
  end if;
  return new;
end;
$$;

create trigger tr_episode_progress_identity_immutable
  before update on public.user_episode_progress
  for each row execute function public.tr_validate_episode_progress_identity();

create or replace function public.tr_validate_share_artifact_update()
returns trigger
language plpgsql
as $$
begin
  if new.id is distinct from old.id
     or new.subject_id is distinct from old.subject_id
     or new.reading_id is distinct from old.reading_id
     or new.public_token_hash is distinct from old.public_token_hash
     or new.artifact_version is distinct from old.artifact_version
     or new.snapshot_jsonb is distinct from old.snapshot_jsonb
     or new.snapshot_hash is distinct from old.snapshot_hash
     or new.created_at is distinct from old.created_at then
    raise exception using
      errcode = '23514',
      constraint = 'tr_share_artifact_snapshot_immutable',
      message = 'share artifact reading/token/snapshot identity is immutable';
  end if;

  if old.status in ('revoked', 'expired') and new.status is distinct from old.status then
    raise exception using
      errcode = '23514',
      constraint = 'tr_share_artifact_terminal_status',
      message = 'revoked or expired share artifact cannot be reactivated or changed to another terminal state';
  end if;

  return new;
end;
$$;

create trigger tr_share_artifact_snapshot_immutable
  before update on public.share_artifacts
  for each row execute function public.tr_validate_share_artifact_update();
