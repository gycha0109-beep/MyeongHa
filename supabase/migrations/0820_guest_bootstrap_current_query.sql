-- Current Guest bootstrap identity read boundary for the production API executor.
--
-- Guest bootstrap reuse needs the current session id/expiry after a bearer has
-- already been verified and resolved to a canonical Guest subject. The executor
-- deliberately receives no raw SELECT privilege on guest_sessions. Instead this
-- narrow SECURITY DEFINER query requires the transaction-local canonical subject
-- context established by begin_guest_subject_context_v1 and returns no token hash.

create or replace function public.qry_guest_bootstrap_current_v1(
  p_subject_id uuid
)
returns table (
  subject_id uuid,
  guest_session_id uuid,
  expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_subject_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'guest_bootstrap_current_subject_required',
      message = 'current guest subject id is required';
  end if;

  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  return query
  select
    gs.subject_id,
    gs.id,
    gs.expires_at
  from public.guest_sessions gs
  join public.subjects s on s.id = gs.subject_id
  where gs.subject_id = p_subject_id
    and gs.expires_at > clock_timestamp()
    and gs.consumed_at is null
    and gs.claimed_by_subject_id is null
    and s.kind = 'guest'
    and s.status = 'active'
    and s.merged_into_subject_id is null;

  if not found then
    raise exception using
      errcode = '28000',
      constraint = 'guest_bootstrap_current_unresolved',
      message = 'current canonical guest bootstrap identity is unavailable';
  end if;
end;
$$;

revoke all on function public.qry_guest_bootstrap_current_v1(uuid) from public;
grant execute on function public.qry_guest_bootstrap_current_v1(uuid) to myeongha_api_executor;
