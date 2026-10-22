-- S4 private last-right Reader purge Worker SQL. Current-Grant decisions and
-- physical deletion always hold S1 Reading x Reader transaction lock. The
-- off-primary ledger is written by Worker BETWEEN DB transactions.
-- No runtime/public EXECUTE and no Production apply.
-- Watchtower-Track: db-authority-core

-- Queue metadata is disposable on account deletion; protected rows are
-- separately purged under the account finalizer's external ledger fence.
alter table public.official_reader_paid_answer_purge_jobs_v1
  drop constraint reader_paid_answer_purge_job_subject_fk,
  drop constraint reader_paid_answer_purge_job_reading_fk;

alter table public.official_reader_paid_answer_purge_jobs_v1
  add constraint reader_paid_answer_purge_job_subject_fk
    foreign key(subject_id) references public.subjects(id) on delete cascade,
  add constraint reader_paid_answer_purge_job_reading_fk
    foreign key(official_reading_id,subject_id)
    references public.standard_reading_official_bindings(reading_id,subject_id)
    on delete cascade;

create or replace function public.internal_list_official_reader_paid_answer_purge_jobs_v1(
  p_limit integer
)
returns table(job_id uuid)
language plpgsql volatile security definer
set search_path=pg_catalog,public
as $reader_purge_discovery$
begin
  if p_limit is null or p_limit not between 1 and 50 then
    raise exception using errcode='23514',
      constraint='reader_paid_purge_batch_limit_invalid',
      message='Protected Reader cleanup batch limit is invalid';
  end if;
  return query select j.id
  from public.official_reader_paid_answer_purge_jobs_v1 j
  where j.status in ('pending','claimed','db_erased')
    and j.available_at<=pg_catalog.clock_timestamp()
    and (j.lock_owner is null
      or j.lease_expires_at<pg_catalog.clock_timestamp())
  order by j.available_at,j.id limit p_limit;
end
$reader_purge_discovery$;

create or replace function public.internal_claim_official_reader_paid_answer_purge_v1(
  p_job_id uuid,p_worker text
)
returns table(
  subject_id uuid, official_reading_id uuid, reader_character_id text,
  job_status text
)
language plpgsql volatile security definer
set search_path=pg_catalog,public
as $reader_purge_claim$
begin
  if p_job_id is null or p_worker is null
     or pg_catalog.length(p_worker) not between 1 and 256
     or p_worker<>pg_catalog.btrim(p_worker) then
    raise exception using errcode='23514',
      constraint='reader_paid_purge_claim_invalid',
      message='Protected Reader cleanup Worker claim is invalid';
  end if;

  return query
  update public.official_reader_paid_answer_purge_jobs_v1 j
     set lock_owner=p_worker,
         lease_expires_at=pg_catalog.clock_timestamp()+interval '15 minutes',
         status=case when j.status='pending' then 'claimed' else j.status end,
         updated_at=pg_catalog.clock_timestamp()
  where j.id=p_job_id
    and j.status in ('pending','claimed','db_erased')
    and j.available_at<=pg_catalog.clock_timestamp()
    and (j.lock_owner is null
      or j.lease_expires_at<pg_catalog.clock_timestamp())
  returning j.subject_id,j.official_reading_id,j.reader_character_id,j.status;
end
$reader_purge_claim$;

-- Returns one decision and the full exact protected manifest. Only selected
-- ciphertext/key REFERENCES (not plaintext) can leave the private DB Worker.
create or replace function public.internal_qry_official_reader_paid_answer_purge_manifest_v1(
  p_job_id uuid,p_worker text
)
returns jsonb
language plpgsql volatile security definer
set search_path=pg_catalog,public
as $reader_purge_manifest$
declare
  j public.official_reader_paid_answer_purge_jobs_v1%rowtype;
  v_state text;
  v_count bigint;
  v_manifest jsonb;
begin
  select * into j from public.official_reader_paid_answer_purge_jobs_v1
  where id=p_job_id and lock_owner=p_worker
    and lease_expires_at>pg_catalog.clock_timestamp()
    and status in ('claimed','db_erased')
  for update;
  if not found then
    raise exception using errcode='P0001',
      constraint='reader_paid_purge_claim_missing',
      message='Protected Reader cleanup claim is missing';
  end if;
  if j.status='db_erased' then
    return pg_catalog.jsonb_build_object(
      'state','db_erased','subjectId',j.subject_id::text,
      'readingId',j.official_reading_id::text,
      'readerCharacterId',j.reader_character_id,
      'externalFenceId',j.external_fence_id
    );
  end if;

  perform pg_catalog.set_config('myeongha.subject_id',j.subject_id::text,true);
  select q.scope_state into v_state
  from public.internal_qry_official_reader_locked_bundle_scope_v1(
    j.subject_id,j.official_reading_id,j.reader_character_id
  ) q;
  if v_state is distinct from 'no_active_grant' then
    return pg_catalog.jsonb_build_object(
      'state','sibling_right_present','subjectId',j.subject_id::text,
      'readingId',j.official_reading_id::text,
      'readerCharacterId',j.reader_character_id
    );
  end if;

  select pg_catalog.count(*),coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'bodyId',b.id::text,'encryptionKeyRef',b.encryption_key_ref
    ) order by b.id
  ),'[]'::jsonb)
  into v_count,v_manifest
  from public.official_reader_paid_answer_bodies b
  where b.subject_id=j.subject_id
    and b.official_reading_id=j.official_reading_id
    and b.reader_character_id=j.reader_character_id;

  if v_count>50000 then
    raise exception using errcode='54000',
      constraint='reader_paid_purge_manifest_too_large',
      message='Protected Reader cleanup manifest exceeds the allowed bound';
  end if;

  return pg_catalog.jsonb_build_object(
    'state',case when v_count=0 then 'no_content' else 'eligible' end,
    'subjectId',j.subject_id::text,
    'readingId',j.official_reading_id::text,
    'readerCharacterId',j.reader_character_id,
    'entries',v_manifest
  );
end
$reader_purge_manifest$;

create or replace function public.internal_commit_official_reader_paid_answer_purge_v1(
  p_job_id uuid,p_worker text,p_external_fence_id text,p_body_ids uuid[]
)
returns bigint
language plpgsql volatile security definer
set search_path=pg_catalog,public
as $reader_purge_commit$
declare
  j public.official_reader_paid_answer_purge_jobs_v1%rowtype;
  v_state text;
  v_deleted bigint;
  v_found bigint;
begin
  if pg_catalog.current_setting('transaction_isolation')<>'read committed'
     or p_external_fence_id is null
     or pg_catalog.length(p_external_fence_id) not between 1 and 256
     or p_external_fence_id<>pg_catalog.btrim(p_external_fence_id)
     or p_body_ids is null
     or pg_catalog.array_ndims(p_body_ids) is distinct from 1
     or pg_catalog.array_length(p_body_ids,1) not between 1 and 50000
     or pg_catalog.array_position(p_body_ids,null) is not null then
    raise exception using errcode='23514',
      constraint='reader_paid_purge_commit_invalid',
      message='Protected Reader cleanup commit is invalid';
  end if;
  select * into j from public.official_reader_paid_answer_purge_jobs_v1
  where id=p_job_id and lock_owner=p_worker
    and lease_expires_at>pg_catalog.clock_timestamp() and status='claimed'
  for update;
  if not found then
    raise exception using errcode='P0001',
      constraint='reader_paid_purge_commit_claim_missing',
      message='Protected Reader cleanup lease is no longer held';
  end if;

  perform pg_catalog.set_config('myeongha.subject_id',j.subject_id::text,true);
  select q.scope_state into v_state
  from public.internal_qry_official_reader_locked_bundle_scope_v1(
    j.subject_id,j.official_reading_id,j.reader_character_id
  ) q;
  if v_state is distinct from 'no_active_grant' then
    raise exception using errcode='P0001',
      constraint='reader_paid_purge_sibling_right_survives',
      message='Protected Reader cleanup cannot erase a surviving purchased scope';
  end if;

  select pg_catalog.count(*) into v_found
  from public.official_reader_paid_answer_bodies b
  where b.subject_id=j.subject_id
    and b.official_reading_id=j.official_reading_id
    and b.reader_character_id=j.reader_character_id;

  if v_found<>pg_catalog.array_length(p_body_ids,1)
     or v_found<>(select pg_catalog.count(distinct id)
                  from pg_catalog.unnest(p_body_ids) as v(id))
     or exists (
       select 1 from public.official_reader_paid_answer_bodies b
       where b.subject_id=j.subject_id
         and b.official_reading_id=j.official_reading_id
         and b.reader_character_id=j.reader_character_id
         and not (b.id=any(p_body_ids))
     ) then
    raise exception using errcode='40001',
      constraint='reader_paid_purge_manifest_changed',
      message='Protected Reader cleanup external manifest differs from current rows';
  end if;

  delete from public.official_reader_paid_answer_bodies b
  where b.subject_id=j.subject_id
    and b.official_reading_id=j.official_reading_id
    and b.reader_character_id=j.reader_character_id
    and b.id=any(p_body_ids);
  get diagnostics v_deleted=row_count;
  if v_deleted<>v_found then
    raise exception using errcode='40001',
      constraint='reader_paid_purge_not_all_deleted',
      message='Protected Reader cleanup was not atomic';
  end if;

  update public.official_reader_paid_answer_purge_jobs_v1
  set status='db_erased', external_fence_id=p_external_fence_id,
      body_count=v_deleted::integer,updated_at=pg_catalog.clock_timestamp()
  where id=p_job_id and lock_owner=p_worker
    and lease_expires_at>pg_catalog.clock_timestamp();
  return v_deleted;
end
$reader_purge_commit$;

create or replace function public.internal_finish_official_reader_paid_answer_purge_v1(
  p_job_id uuid,p_worker text,p_external_fence_id text
)
returns boolean
language plpgsql volatile security definer
set search_path=pg_catalog,public
as $reader_purge_finish$
declare
  j public.official_reader_paid_answer_purge_jobs_v1%rowtype;
begin
  select * into j from public.official_reader_paid_answer_purge_jobs_v1
  where id=p_job_id and status='db_erased'
    and lock_owner=p_worker and lease_expires_at>pg_catalog.clock_timestamp()
  for update;
  if not found or j.external_fence_id is distinct from p_external_fence_id
     or exists(
       select 1 from public.official_reader_paid_answer_bodies b
       where b.subject_id=j.subject_id
         and b.official_reading_id=j.official_reading_id
         and b.reader_character_id=j.reader_character_id
     ) then
    raise exception using errcode='23514',
      constraint='reader_paid_purge_finish_without_erasure',
      message='Protected Reader cleanup is not ready for completion';
  end if;

  update public.official_reader_paid_answer_purge_jobs_v1
  set status='completed',keys_erased_at=pg_catalog.clock_timestamp(),
      lock_owner=null,lease_expires_at=null,
      updated_at=pg_catalog.clock_timestamp()
  where id=p_job_id;
  return true;
end
$reader_purge_finish$;

create or replace function public.internal_release_official_reader_paid_answer_purge_v1(
  p_job_id uuid,p_worker text
)
returns boolean
language plpgsql volatile security definer
set search_path=pg_catalog,public
as $reader_purge_release$
begin
  update public.official_reader_paid_answer_purge_jobs_v1
    set status='pending',lock_owner=null,lease_expires_at=null,
        available_at=pg_catalog.clock_timestamp()+interval '1 hour',
        updated_at=pg_catalog.clock_timestamp()
  where id=p_job_id and lock_owner=p_worker and status='claimed'
    and lease_expires_at>pg_catalog.clock_timestamp();
  return found;
end
$reader_purge_release$;

revoke all on function public.internal_list_official_reader_paid_answer_purge_jobs_v1(integer) from public;
revoke all on function public.internal_claim_official_reader_paid_answer_purge_v1(uuid,text) from public;
revoke all on function public.internal_qry_official_reader_paid_answer_purge_manifest_v1(uuid,text) from public;
revoke all on function public.internal_commit_official_reader_paid_answer_purge_v1(uuid,text,text,uuid[]) from public;
revoke all on function public.internal_finish_official_reader_paid_answer_purge_v1(uuid,text,text) from public;
revoke all on function public.internal_release_official_reader_paid_answer_purge_v1(uuid,text) from public;

grant execute on function public.internal_list_official_reader_paid_answer_purge_jobs_v1(integer) to myeongha_system_executor;
grant execute on function public.internal_claim_official_reader_paid_answer_purge_v1(uuid,text) to myeongha_system_executor;
grant execute on function public.internal_qry_official_reader_paid_answer_purge_manifest_v1(uuid,text) to myeongha_system_executor;
grant execute on function public.internal_commit_official_reader_paid_answer_purge_v1(uuid,text,text,uuid[]) to myeongha_system_executor;
grant execute on function public.internal_finish_official_reader_paid_answer_purge_v1(uuid,text,text) to myeongha_system_executor;
grant execute on function public.internal_release_official_reader_paid_answer_purge_v1(uuid,text) to myeongha_system_executor;
