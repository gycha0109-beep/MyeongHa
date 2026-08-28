-- MyeongHa current active-default content release authority read.
--
-- content_releases is the operational authority that binds an immutable content
-- bundle to a release/rollout state. The ERD requires at most one row where
-- status='active' and is_default=true, and the release activation command is
-- responsible for maintaining a valid active default.
--
-- This projection deliberately exposes only the recorded active-default binding.
-- It does NOT resolve a subject into a rollout cohort, inspect rollout_jsonb,
-- compare client capability, evaluate asset/cue compatibility, or reinterpret
-- Character/Episode enabled metadata. Subject-specific rollout resolution remains
-- outside this function until its source authority is defined.
--
-- P0-AUTH-01 remains unresolved. SECURITY INVOKER is retained and PUBLIC EXECUTE
-- is revoked until the API -> PostgreSQL execution identity is fixed.

create or replace function public.qry_active_default_content_release_v1()
returns table (
  release_id uuid,
  release_key text,
  content_bundle_id uuid,
  activated_at timestamptz
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    cr.id,
    cr.release_key,
    cr.content_bundle_id,
    cr.activated_at
  from public.content_releases cr
  where cr.status = 'active'
    and cr.is_default = true;
$$;

revoke execute on function public.qry_active_default_content_release_v1() from public;
