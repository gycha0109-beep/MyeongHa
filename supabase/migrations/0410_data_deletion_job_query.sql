-- MyeongHa data deletion job current-status read authority.
--
-- API_CONTRACT §17 exposes GET /api/data-deletion-jobs/:id. This query returns only
-- the owner-visible deletion-job projection needed to report current progress. Internal
-- request dedupe material and retention exception policy are deliberately not exposed.
-- P0-PR-01 therefore remains open and no destructive deletion/retention policy is inferred.
--
-- Account deletion immediately moves a member to deletion_pending while preserving the
-- authentication mapping, so polling must remain available to canonical deletion_pending
-- subjects. Generic merged/deleted history access is not opened by this query.
--
-- P0-AUTH-01 remains unresolved. SECURITY INVOKER is retained and PUBLIC EXECUTE is
-- revoked until the API -> PostgreSQL execution identity is fixed.

create or replace function public.qry_data_deletion_job_v1(
  p_subject_id uuid,
  p_deletion_job_id uuid
)
returns table (
  deletion_job_id uuid,
  scope text,
  target_resource_type text,
  target_resource_id text,
  status text,
  requested_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  error_code text
)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
begin
  if p_subject_id is null or p_deletion_job_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'qry_data_deletion_job_ids_required',
      message = 'deletion job subject and job id are required';
  end if;

  if not exists (
    select 1
    from public.subjects s
    where s.id = p_subject_id
      and s.status in ('active', 'deletion_pending')
      and s.merged_into_subject_id is null
  ) then
    raise exception using
      errcode = 'P0001',
      constraint = 'qry_data_deletion_job_subject_ineligible',
      message = 'deletion job read requires an active or deletion-pending canonical subject';
  end if;

  return query
  select
    dj.id,
    dj.scope,
    dj.target_resource_type,
    dj.target_resource_id,
    dj.status,
    dj.requested_at,
    dj.started_at,
    dj.completed_at,
    dj.error_code
  from public.data_deletion_jobs dj
  where dj.subject_id = p_subject_id
    and dj.id = p_deletion_job_id;
end;
$$;

revoke execute on function public.qry_data_deletion_job_v1(uuid, uuid) from public;
