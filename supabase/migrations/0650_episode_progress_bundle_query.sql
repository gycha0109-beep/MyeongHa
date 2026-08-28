-- MyeongHa explicit bundle-pinned Episode Progress owner projection.
--
-- user_episode_progress is version-pinned by
-- (subject_id, episode_id, content_bundle_id). A stable episode may therefore
-- have more than one historical progress row across immutable bundles.
--
-- SRC-11 remains open for the bundle-hidden GET /api/episodes/:id/progress
-- contract. This function does not choose a "current" bundle. The caller must
-- provide the exact content_bundle_id whose stored projection is requested.
-- Absence is returned as an empty set and is not fabricated as not_started.
--
-- Runtime episode enable/release state, content rollout/default resolution,
-- progress event ledger details, and client compatibility remain separate
-- authorities. Stored progress for a retired/disabled historical bundle remains
-- readable when explicitly pinned.
--
-- P0-AUTH-01 remains unresolved. SECURITY INVOKER is retained and PUBLIC EXECUTE
-- is revoked until the API -> PostgreSQL execution identity is fixed.

create or replace function public.qry_episode_progress_bundle_v1(
  p_subject_id uuid,
  p_episode_id text,
  p_content_bundle_id uuid
)
returns table (
  episode_id text,
  content_bundle_id uuid,
  state text,
  current_node_key text,
  revision bigint,
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
begin
  if p_subject_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'qry_episode_progress_bundle_subject_required',
      message = 'episode progress subject is required';
  end if;

  if not exists (
    select 1
    from public.subjects s
    where s.id = p_subject_id
      and s.status = 'active'
      and s.merged_into_subject_id is null
  ) then
    raise exception using
      errcode = 'P0001',
      constraint = 'qry_episode_progress_bundle_subject_ineligible',
      message = 'episode progress read requires an active canonical subject';
  end if;

  if p_episode_id is null or btrim(p_episode_id) = '' then
    raise exception using
      errcode = '23514',
      constraint = 'qry_episode_progress_bundle_episode_required',
      message = 'episode id is required';
  end if;

  if p_content_bundle_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'qry_episode_progress_bundle_content_bundle_required',
      message = 'content bundle is required';
  end if;

  return query
  select
    uep.episode_id,
    uep.content_bundle_id,
    uep.state,
    uep.current_node_key,
    uep.revision,
    uep.started_at,
    uep.completed_at,
    uep.updated_at
  from public.user_episode_progress uep
  where uep.subject_id = p_subject_id
    and uep.episode_id = p_episode_id
    and uep.content_bundle_id = p_content_bundle_id;
end;
$$;

revoke execute on function public.qry_episode_progress_bundle_v1(uuid, text, uuid) from public;
