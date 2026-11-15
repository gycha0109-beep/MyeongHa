-- Watchtower-Track: character-memory
-- Manual shared memory is DELETE-class personal data. Account deletion leaves
-- public.subjects as an anonymized tombstone, so the 2360 Subject FK CASCADE
-- alone does not erase its content. This forward-only trigger runs only for the
-- already-authorized DB finalizer's deletion_pending -> deleted transition.
-- No new account deletion RPC, role grant, retention policy or Production gate.
create function public.tr_erase_shared_memory_on_account_finalization_v1()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $shared_memory_erasure$
begin
  if old.status is distinct from 'deletion_pending'
     or current_user is distinct from (
       select pg_catalog.pg_get_userbyid(p.proowner)
       from pg_catalog.pg_proc p
       where p.oid = pg_catalog.to_regprocedure(
         'public.internal_finalize_account_deletion_db_v1(uuid,uuid,text)'
       )
     )
     or coalesce(
       pg_catalog.current_setting(
         'myeongha.account_deletion_finalizer_subject_id', true
       ), ''
     ) is distinct from new.id::text
     or not exists (
       select 1 from public.data_deletion_jobs dj
       where dj.subject_id = new.id
         and dj.scope = 'account'
         and dj.status = 'running'
         and dj.finalization_policy_version = 'account-deletion-finalization-v1'
         and dj.db_finalized_at is not null
     )
  then
    raise exception using
      errcode = '23514',
      constraint = 'shared_memory_erasure_requires_exact_account_finalizer',
      message = 'shared-memory erasure requires the exact account finalization state';
  end if;

  -- DELETE is physical in the primary DB. If permissions, RLS or another
  -- constraint prevent it, the entire account finalizer transaction aborts.
  delete from public.subject_shared_memory_items_v1
  where subject_id = new.id;
  return new;
end;
$shared_memory_erasure$;

revoke all on function public.tr_erase_shared_memory_on_account_finalization_v1()
  from public;
do $shared_memory_trigger_revoke$
declare v_role text;
begin
  for v_role in select rolname from pg_catalog.pg_roles
    where rolname in ('anon', 'authenticated', 'service_role', 'myeongha_api_executor')
  loop
    execute pg_catalog.format(
      'revoke all on function public.tr_erase_shared_memory_on_account_finalization_v1() from %I',
      v_role
    );
  end loop;
end;
$shared_memory_trigger_revoke$;

create trigger erase_shared_memory_on_account_finalization_v1
after update of status on public.subjects
for each row
when (
  old.status is distinct from new.status
  and new.status = 'deleted'
)
execute function public.tr_erase_shared_memory_on_account_finalization_v1();
