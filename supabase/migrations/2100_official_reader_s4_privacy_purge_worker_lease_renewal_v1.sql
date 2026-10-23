-- S4 private Worker lease renewal for long-running key destruction.
-- Only the EXACT current instance owner may extend its live lease, never
-- a former process with the same configured service label. No grant or
-- public content mutation and no scheduler is activated.
-- Watchtower-Track: db-authority-core

create or replace function public.internal_renew_official_reader_paid_answer_purge_lease_v1(
  p_job_id uuid,
  p_worker_owner text
)
returns boolean
language plpgsql volatile security definer
set search_path=pg_catalog,public
as $reader_purge_lease_renew$
begin
  if p_job_id is null or p_worker_owner is null
     or pg_catalog.length(p_worker_owner) not between 1 and 256
     or p_worker_owner<>pg_catalog.btrim(p_worker_owner)
     or pg_catalog.current_setting('transaction_isolation')<>'read committed' then
    raise exception using errcode='23514',
      constraint='reader_paid_purge_lease_renew_invalid',
      message='Reader private purge lease renewal requires the exact live Worker';
  end if;

  update public.official_reader_paid_answer_purge_jobs_v1 j
  set lease_expires_at=pg_catalog.clock_timestamp()+interval '15 minutes',
      updated_at=pg_catalog.clock_timestamp()
  where j.id=p_job_id
    and j.lock_owner=p_worker_owner
    and j.lease_expires_at>pg_catalog.clock_timestamp()
    and j.status in ('claimed','db_erased');
  return found;
end
$reader_purge_lease_renew$;

revoke all on function public.internal_renew_official_reader_paid_answer_purge_lease_v1(
  uuid,text
) from public;

grant execute on function public.internal_renew_official_reader_paid_answer_purge_lease_v1(
  uuid,text
) to myeongha_system_executor;
