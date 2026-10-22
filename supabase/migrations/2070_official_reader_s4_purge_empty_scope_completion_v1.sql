-- S4 private disposal of stale purge queue entries with NO remaining paid
-- body. This cannot delete content or mark any live key as erased.
-- A sibling right is excluded by the same shared Reader scope lock.
-- Watchtower-Track: db-authority-core
create or replace function public.internal_finish_empty_official_reader_paid_answer_purge_v1(
  p_job_id uuid,p_worker text
)
returns boolean
language plpgsql volatile security definer
set search_path=pg_catalog,public
as $reader_empty_purge_finish$
declare
  j public.official_reader_paid_answer_purge_jobs_v1%rowtype;
  v_state text;
begin
  if pg_catalog.current_setting('transaction_isolation')<>'read committed' then
    raise exception using errcode='25001',
      constraint='reader_empty_purge_read_committed_required',
      message='Reader purge completion requires READ COMMITTED';
  end if;
  -- Read scope first, without a row lock. The provider lifecycle trigger
  -- already takes Reader S1 BEFORE updating this queue row.
  select * into j
  from public.official_reader_paid_answer_purge_jobs_v1
  where id=p_job_id and status='claimed' and lock_owner=p_worker
    and lease_expires_at>pg_catalog.clock_timestamp();
  if not found then
    raise exception using errcode='P0001',
      constraint='reader_empty_purge_claim_missing',
      message='Reader purge requires a claimed job';
  end if;

  perform pg_catalog.set_config('myeongha.subject_id',j.subject_id::text,true);
  select q.scope_state into v_state
  from public.internal_qry_official_reader_locked_bundle_scope_v1(
    j.subject_id,j.official_reading_id,j.reader_character_id
  ) q;
  perform 1 from public.official_reader_paid_answer_purge_jobs_v1 live
  where live.id=p_job_id and live.subject_id=j.subject_id
    and live.official_reading_id=j.official_reading_id
    and live.reader_character_id=j.reader_character_id
    and live.lock_owner=p_worker and live.status='claimed'
    and live.lease_expires_at>pg_catalog.clock_timestamp()
  for update;
  if not found then
    raise exception using errcode='40001',
      constraint='reader_empty_purge_claim_changed_after_s1',
      message='Reader cleanup claim changed under S1';
  end if;
  if v_state is distinct from 'no_active_grant'
     or exists (
       select 1 from public.official_reader_paid_answer_bodies b
       where b.subject_id=j.subject_id
         and b.official_reading_id=j.official_reading_id
         and b.reader_character_id=j.reader_character_id
     ) then
    raise exception using errcode='P0001',
      constraint='reader_empty_purge_scope_not_empty',
      message='Reader cleanup cannot close an occupied or entitled scope';
  end if;

  update public.official_reader_paid_answer_purge_jobs_v1
  set status='completed',lock_owner=null,lease_expires_at=null,
      updated_at=pg_catalog.clock_timestamp()
  where id=p_job_id;
  return true;
end
$reader_empty_purge_finish$;

revoke all on function public.internal_finish_empty_official_reader_paid_answer_purge_v1(uuid,text)
from public;
grant execute on function public.internal_finish_empty_official_reader_paid_answer_purge_v1(uuid,text)
to myeongha_system_executor;
