-- S4 isolated restore: reapply externally committed Reader refund tombstones.
-- This is distinct from account deletion and keeps retained Commerce P5Y
-- evidence unchanged. Requires independent scope fence + database-erased
-- acknowledgment, never trusts a restored PostgreSQL queue row to prove
-- deletion. No public entitlement/access bypass.
-- Watchtower-Track: db-authority-core

create or replace function public.internal_replay_offprimary_reader_refund_purge_v1(
  p_job_id uuid,
  p_subject_id uuid,
  p_official_reading_id uuid,
  p_reader_character_id text,
  p_external_fence_id uuid,
  p_original_body_ids uuid[]
)
returns table (erased_row_count bigint,remaining_tombstoned_row_count bigint)
language plpgsql volatile security definer
set search_path=pg_catalog,public
as $reader_refund_restore$
declare
  v_erased bigint;
  v_left bigint;
begin
  if p_job_id is null or p_subject_id is null or p_official_reading_id is null
     or p_external_fence_id is null or p_reader_character_id is null
     or pg_catalog.length(p_reader_character_id) not between 1 and 128
     or p_original_body_ids is null
     or pg_catalog.array_ndims(p_original_body_ids) is distinct from 1
     or pg_catalog.array_length(p_original_body_ids,1) not between 1 and 50000
     or pg_catalog.array_position(p_original_body_ids,null) is not null
     or pg_catalog.current_setting('transaction_isolation')<>'read committed'
     or pg_catalog.current_setting('myeongha.reader_restore_quarantine',true)
       is distinct from 'on' then
    raise exception using errcode='23514',
      constraint='reader_refund_restore_scope_invalid',
      message='Official Reader refund restore requires exact isolated tombstone authority';
  end if;

  if pg_catalog.array_length(p_original_body_ids,1) is distinct from
    (select pg_catalog.count(distinct body_id)::integer
     from pg_catalog.unnest(p_original_body_ids) as v(body_id)) then
    raise exception using errcode='23514',
      constraint='reader_refund_restore_duplicate_body',
      message='Official Reader refund restore has duplicate tombstoned body IDs';
  end if;

  -- No current Entitlement is trusted from an old backup. A duly erased
  -- body MUST stay erased, even if the restored purchase looks active.
  perform 1 from public.subjects s where s.id=p_subject_id for update;

  -- A later independent purchase can have new content in the SAME scope.
  -- Replay only the exact historical erased body IDs, not every body
  -- currently belonging to that scope. Reject an ID remapped to a different
  -- Subject/Reading/Reader: the external manifest is immutable.
  if exists (
    select 1 from public.official_reader_paid_answer_bodies b
    where b.id=any(p_original_body_ids)
      and (b.subject_id is distinct from p_subject_id
        or b.official_reading_id is distinct from p_official_reading_id
        or b.reader_character_id is distinct from p_reader_character_id)
  ) then
    raise exception using errcode='23514',
      constraint='reader_refund_restore_wrong_scope_body',
      message='Reader refund tombstone must not erase another scope';
  end if;

  delete from public.official_reader_paid_answer_bodies b
  where b.subject_id=p_subject_id
    and b.official_reading_id=p_official_reading_id
    and b.reader_character_id=p_reader_character_id
    and b.id=any(p_original_body_ids);
  get diagnostics v_erased=row_count;

  select pg_catalog.count(*) into v_left
  from public.official_reader_paid_answer_bodies b
  where b.id=any(p_original_body_ids);
  if v_left<>0 then
    raise exception using errcode='23514',
      constraint='reader_refund_restore_scope_leftover',
      message='Reader refund restore left tombstoned protected ciphertext';
  end if;
  return query select v_erased,v_left;
end
$reader_refund_restore$;

revoke all on function public.internal_replay_offprimary_reader_refund_purge_v1(
  uuid,uuid,uuid,text,uuid,uuid[]
) from public;

do $reader_refund_restore_acl$
declare v_role text;
begin
  for v_role in select rolname from pg_catalog.pg_roles
    where rolname in (
      'anon','authenticated','service_role','myeongha_api_executor',
      'myeongha_commerce_internal_executor',
      'myeongha_seyeon_chat_runtime_owner'
    )
  loop
    execute pg_catalog.format(
      'revoke all on function public.internal_replay_offprimary_reader_refund_purge_v1(uuid,uuid,uuid,text,uuid,uuid[]) from %I',v_role
    );
  end loop;
end
$reader_refund_restore_acl$;

grant execute on function public.internal_replay_offprimary_reader_refund_purge_v1(
  uuid,uuid,uuid,text,uuid,uuid[]
) to myeongha_system_executor;
