-- S4: finish only the originally purged body IDs from the durable
-- independent Privacy manifest. A LATER paid answer in the SAME exact
-- Reader scope must not stall the erasure of the previous refunded answer.
-- No public/Commerce grant. SQL is called only by private Worker after
-- external key owner irrevocably confirms these exact original DEKs.
-- Watchtower-Track: db-authority-core

drop function public.internal_finish_official_reader_paid_answer_purge_v1(
  uuid,text,text
);

create or replace function public.internal_finish_official_reader_paid_answer_purge_v1(
  p_job_id uuid,
  p_worker text,
  p_external_fence_id text,
  p_original_body_ids uuid[]
)
returns boolean
language plpgsql volatile security definer
set search_path=pg_catalog,public
as $reader_purge_finish_exact$
declare j public.official_reader_paid_answer_purge_jobs_v1%rowtype;
begin
  if p_job_id is null or p_worker is null
     or pg_catalog.length(p_worker) not between 1 and 256
     or p_external_fence_id is null
     or pg_catalog.length(p_external_fence_id) not between 1 and 256
     or p_original_body_ids is null
     or pg_catalog.array_ndims(p_original_body_ids) is distinct from 1
     or pg_catalog.array_length(p_original_body_ids,1) not between 1 and 50000
     or pg_catalog.array_position(p_original_body_ids,null) is not null
     or pg_catalog.current_setting('transaction_isolation')<>'read committed'
  then
    raise exception using errcode='23514',
      constraint='reader_exact_purge_finish_arguments_invalid',
      message='Protected Reader purge completion needs exact original IDs';
  end if;

  select * into j
  from public.official_reader_paid_answer_purge_jobs_v1
  where id=p_job_id and status='db_erased'
    and lock_owner=p_worker
    and lease_expires_at>pg_catalog.clock_timestamp()
  for update;
  if not found
     or j.external_fence_id is distinct from p_external_fence_id
     or j.body_count is distinct from pg_catalog.array_length(p_original_body_ids,1)
     or j.body_count is distinct from (
       select pg_catalog.count(distinct id)::integer
       from pg_catalog.unnest(p_original_body_ids) as x(id)
     ) then
    raise exception using errcode='23514',
      constraint='reader_exact_purge_finish_manifest_mismatch',
      message='Reader purge manifest or Worker claim changed';
  end if;

  if exists (
    select 1 from public.official_reader_paid_answer_bodies b
    where b.id=any(p_original_body_ids)
  ) then
    raise exception using errcode='23514',
      constraint='reader_exact_purge_finish_original_body_still_present',
      message='Reader purge original encrypted answer is still present';
  end if;

  update public.official_reader_paid_answer_purge_jobs_v1
  set status='completed',
      keys_erased_at=pg_catalog.clock_timestamp(),
      lock_owner=null, lease_expires_at=null,
      updated_at=pg_catalog.clock_timestamp()
  where id=p_job_id and status='db_erased'
    and lock_owner=p_worker
    and lease_expires_at>pg_catalog.clock_timestamp();
  if not found then
    raise exception using errcode='40001',
      constraint='reader_exact_purge_finish_concurrent_claim',
      message='Reader purge ownership changed before completion';
  end if;
  return true;
end
$reader_purge_finish_exact$;

revoke all on function public.internal_finish_official_reader_paid_answer_purge_v1(
  uuid,text,text,uuid[]
) from public;
grant execute on function public.internal_finish_official_reader_paid_answer_purge_v1(
  uuid,text,text,uuid[]
) to myeongha_system_executor;
