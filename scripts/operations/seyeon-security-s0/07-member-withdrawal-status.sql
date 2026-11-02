-- Watchtower-Track: security
-- Owner-scoped, read-only S0 withdrawal lifecycle. RLS hides pending Grant
-- from the ordinary source reader; only this tiny state escapes the definer.
begin;
create function public.qry_seyeon_memory_grant_lifecycle_v1(
  p_subject_id uuid,p_memory_item_id uuid
)
returns table(grant_state text,granted_at timestamptz)
language plpgsql stable security definer
set search_path=pg_catalog,public
set row_security=off
as $status$
declare v_count integer;v_pending integer;v_granted_at timestamptz;
begin
  if p_subject_id is null or p_memory_item_id is null then
    raise exception using errcode='23514',
      constraint='seyeon_grant_lifecycle_input_required',
      message='Canonical Subject and original Memory identifiers are required';
  end if;
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  perform 1 from public.subjects s
    where s.id=p_subject_id and s.kind='member'
      and s.status='active' and s.merged_into_subject_id is null;
  if not found then
    raise exception using errcode='42501',
      constraint='seyeon_grant_lifecycle_member_required',
      message='Canonical active Member required';
  end if;
  perform 1 from public.memory_items mi
    where mi.id=p_memory_item_id and mi.subject_id=p_subject_id
      and mi.revoked_at is null;
  if not found then
    raise exception using errcode='P0001',
      constraint='seyeon_grant_lifecycle_memory_unavailable',
      message='Owned current Memory unavailable';
  end if;
  select count(*)::int,
    count(*) filter(where g.seyeon_revoke_requested_at is not null)::int,
    min(g.granted_at)
  into v_count,v_pending,v_granted_at
  from public.record_access_grants g
  where g.subject_id=p_subject_id and g.memory_item_id=p_memory_item_id
    and g.grantee_character_id='seyeon' and g.revoked_at is null;
  if v_count>1 then
    raise exception using errcode='23514',
      constraint='seyeon_grant_lifecycle_ambiguous',
      message='More than one current original Se-yeon Grant';
  end if;
  return query select
    case when v_count=0 then 'not_granted'::text
         when v_pending=1 then 'withdrawal_pending'::text
         else 'active'::text end,
    case when v_count=1 and v_pending=0 then v_granted_at
         else null::timestamptz end;
end
$status$;
revoke all on function public.qry_seyeon_memory_grant_lifecycle_v1(uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.qry_seyeon_memory_grant_lifecycle_v1(uuid,uuid)
  to myeongha_api_executor;
commit;
