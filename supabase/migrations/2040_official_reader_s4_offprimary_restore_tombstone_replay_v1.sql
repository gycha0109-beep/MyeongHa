-- S4 PRIVATE offline restore reconciliation. No public RPC, paid-read grant,
-- deployment, or S8 serviceability release. The already durable external
-- account tombstone is authoritative; the restored PostgreSQL backup is not.
-- Only the dedicated system executor may replay exact off-primary manifest
-- IDs while the restoring operator has placed the service in quarantine.
-- Watchtower-Track: db-authority-core

create or replace function public.internal_replay_offprimary_reader_account_deletion_v1(
  p_subject_id uuid,
  p_deletion_job_id uuid,
  p_external_fence_id text,
  p_original_body_ids uuid[]
)
returns table (
  erased_row_count bigint,
  remaining_subject_row_count bigint
)
language plpgsql
volatile
security definer
set search_path=pg_catalog,public
as $reader_offprimary_restore$
declare
  v_expected_count bigint;
  v_erased_count bigint;
  v_remaining_count bigint;
begin
  if p_subject_id is null or p_deletion_job_id is null
     or p_external_fence_id is null
     or pg_catalog.length(p_external_fence_id) not between 1 and 256
     or p_external_fence_id<>pg_catalog.btrim(p_external_fence_id)
     or p_original_body_ids is null
     or pg_catalog.array_length(p_original_body_ids,1) not between 1 and 50000
     or pg_catalog.array_ndims(p_original_body_ids) is distinct from 1
     or pg_catalog.array_position(p_original_body_ids,null) is not null
     or pg_catalog.current_setting('transaction_isolation')<>'read committed'
     or pg_catalog.current_setting('myeongha.reader_restore_quarantine',true)
        is distinct from 'on' then
    raise exception using errcode='23514',
      constraint='reader_offprimary_restore_not_authorized',
      message='Reader off-primary tombstone replay requires offline restore quarantine';
  end if;

  select pg_catalog.count(distinct id)::bigint into v_expected_count
  from pg_catalog.unnest(p_original_body_ids) as body(id);
  if v_expected_count<>pg_catalog.array_length(p_original_body_ids,1) then
    raise exception using errcode='23514',
      constraint='reader_offprimary_restore_duplicate_body',
      message='Reader restore manifest contains repeated body IDs';
  end if;

  -- Exact subject can be ACTIVE in the old restored backup. Its state is NOT
  -- trusted here; the independent tombstone captured after backup wins.
  -- Lock the restored Subject before selecting personal child rows.
  perform 1 from public.subjects s
  where s.id=p_subject_id for update;

  -- Fail closed if the backup contains new or unexpected Reader bodies
  -- absent from the durable external deletion manifest. No partial cleanup.
  if exists (
    select 1 from public.official_reader_paid_answer_bodies b
    where b.subject_id=p_subject_id
      and not (b.id=any(p_original_body_ids))
  ) then
    raise exception using errcode='23514',
      constraint='reader_offprimary_restore_unlisted_body',
      message='Reader restored personal data exceeds its external deletion manifest';
  end if;

  delete from public.official_reader_paid_answer_bodies b
  where b.subject_id=p_subject_id
    and b.id=any(p_original_body_ids);

  get diagnostics v_erased_count=row_count;

  select pg_catalog.count(*)::bigint into v_remaining_count
  from public.official_reader_paid_answer_bodies b
  where b.subject_id=p_subject_id;
  if v_remaining_count<>0 then
    raise exception using errcode='23514',
      constraint='reader_offprimary_restore_protected_row_remains',
      message='Reader restored deletion is incomplete';
  end if;

  -- Never reinterpret restored Receipt/Grant as newly purchased entitlement.
  -- Other account-level privacy replay from the established DR plan remains
  -- mandatory, independently of this child-level physical purge.
  return query select v_erased_count,v_remaining_count;
end
$reader_offprimary_restore$;

revoke all on function public.internal_replay_offprimary_reader_account_deletion_v1(
  uuid,uuid,text,uuid[]
) from public;

do $reader_offprimary_restore_acl$
declare v_role text;
begin
  for v_role in
    select rolname from pg_catalog.pg_roles
    where rolname in (
      'anon','authenticated','service_role','myeongha_api_executor',
      'myeongha_commerce_internal_executor',
      'myeongha_seyeon_chat_runtime_owner'
    )
  loop
    execute pg_catalog.format(
      'revoke all on function public.internal_replay_offprimary_reader_account_deletion_v1(uuid,uuid,text,uuid[]) from %I',
      v_role
    );
  end loop;
end
$reader_offprimary_restore_acl$;

grant execute on function public.internal_replay_offprimary_reader_account_deletion_v1(
  uuid,uuid,text,uuid[]
) to myeongha_system_executor;

comment on function public.internal_replay_offprimary_reader_account_deletion_v1(
  uuid,uuid,text,uuid[]
) is 'OFFLINE restoration only: the caller replays an independently sealed external account tombstone. Physically deletes exact restored protected Reader bodies, refuses unexpected rows, no paid-read activation or Commerce evidence removal.';
