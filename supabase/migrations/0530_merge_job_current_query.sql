-- MyeongHa existing-member guest merge job current-status read authority.
--
-- API_CONTRACT §7 exposes GET /api/auth/merge-jobs/:id after existing-member guest merge
-- detection. The execution/resolution command remains deferred; this query only exposes the
-- stored member-owned progress/conflict/result projection already represented by the ERD.
--
-- The canonical member target is the only generic current reader. The guest source identity,
-- guest-session verifier linkage, and internal idempotency key remain private provenance.
-- Active and deletion_pending members remain authenticated current identities; this read does
-- not authorize starting/resuming a merge while deletion_pending.
--
-- P0-AUTH-01 remains unresolved. SECURITY INVOKER is retained and PUBLIC EXECUTE is revoked
-- until the API -> PostgreSQL execution identity is fixed.

create or replace function public.qry_subject_merge_job_v1(
  p_subject_id uuid,
  p_merge_job_id uuid
)
returns table (
  merge_job_id uuid,
  policy_version text,
  status text,
  conflicts_jsonb jsonb,
  resolution_jsonb jsonb,
  created_at timestamptz,
  completed_at timestamptz
)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
begin
  if p_subject_id is null or p_merge_job_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'qry_subject_merge_job_ids_required',
      message = 'merge job subject and job id are required';
  end if;

  if not exists (
    select 1
    from public.subjects s
    where s.id = p_subject_id
      and s.kind = 'member'
      and s.status in ('active', 'deletion_pending')
      and s.merged_into_subject_id is null
      and s.auth_user_id is not null
  ) then
    raise exception using
      errcode = 'P0001',
      constraint = 'qry_subject_merge_job_subject_ineligible',
      message = 'merge job read requires a current canonical member subject';
  end if;

  return query
  select
    mj.id,
    mj.policy_version,
    mj.status,
    mj.conflicts_jsonb,
    mj.resolution_jsonb,
    mj.created_at,
    mj.completed_at
  from public.subject_merge_jobs mj
  where mj.member_subject_id = p_subject_id
    and mj.id = p_merge_job_id;
end;
$$;

revoke execute on function public.qry_subject_merge_job_v1(uuid, uuid) from public;
