-- OFFLINE CANDIDATE. Requires operator-audit-local-v1.sql and operator roles.
-- Separate explicit Production DDL authorization is required before installation.
-- Applies only to the administrator audit stream, never Commerce P5Y evidence.
begin;
alter table myeongha_admin_ops.admin_audit_events_v1 add column if not exists expires_at timestamptz;
update myeongha_admin_ops.admin_audit_events_v1
 set expires_at=occurred_at+interval '31536000 seconds' where expires_at is null;
alter table myeongha_admin_ops.admin_audit_events_v1 alter column expires_at set not null;
alter table myeongha_admin_ops.admin_audit_events_v1 add constraint admin_audit_minimum_365_days_v1
 check(expires_at>=occurred_at+interval '31536000 seconds');
create index admin_audit_expiry_v1 on myeongha_admin_ops.admin_audit_events_v1(expires_at,request_id);
create function myeongha_admin_ops.set_admin_audit_expiry_v1() returns trigger
language plpgsql set search_path=pg_catalog as $$
begin
 new.expires_at:=greatest(new.occurred_at+interval '31536000 seconds',new.expires_at);
 return new;
end $$;
revoke all on function myeongha_admin_ops.set_admin_audit_expiry_v1() from public;
create trigger admin_audit_expiry_v1 before insert on myeongha_admin_ops.admin_audit_events_v1
 for each row execute function myeongha_admin_ops.set_admin_audit_expiry_v1();

-- Legal holds and longer authority retention are controlled by installation /
-- privileged operations, never the console's insert-only audit writer.
create table myeongha_admin_ops.admin_audit_retention_holds_v1(
 request_id uuid primary key references myeongha_admin_ops.admin_audit_events_v1(request_id),
 hold_until timestamptz null,
 authority_key text not null check(authority_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$')
);
revoke all on myeongha_admin_ops.admin_audit_retention_holds_v1 from public;
alter table myeongha_admin_ops.admin_audit_retention_holds_v1 enable row level security;
alter table myeongha_admin_ops.admin_audit_retention_holds_v1 force row level security;
do $$ begin
 if not exists(select 1 from pg_roles where rolname='myeongha_admin_retention_owner') then
  create role myeongha_admin_retention_owner nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
 end if;
 if not exists(select 1 from pg_roles where rolname='myeongha_admin_retention_executor') then
  create role myeongha_admin_retention_executor login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
 end if;
 if exists(select 1 from pg_roles r where r.rolname in ('myeongha_admin_retention_owner','myeongha_admin_retention_executor')
   and (r.rolsuper or r.rolinherit or r.rolbypassrls or r.rolcreaterole or r.rolcreatedb or r.rolreplication
     or r.rolcanlogin<>(r.rolname='myeongha_admin_retention_executor')
     or exists(select 1 from pg_auth_members m where m.member=r.oid))) then
  raise exception 'Admin retention principal drift';
 end if;
end $$;
grant usage on schema myeongha_admin_ops to myeongha_admin_retention_owner,myeongha_admin_retention_executor;
grant select,delete on myeongha_admin_ops.admin_audit_events_v1 to myeongha_admin_retention_owner;
grant insert(request_id,actor_auth_user_id,target_ref,action,outcome,occurred_at) on myeongha_admin_ops.admin_audit_events_v1 to myeongha_admin_retention_owner;
grant select,delete on myeongha_admin_ops.admin_audit_retention_holds_v1 to myeongha_admin_retention_owner;
create policy admin_retention_owner_read_v1 on myeongha_admin_ops.admin_audit_events_v1 for select to myeongha_admin_retention_owner using(true);
create policy admin_retention_owner_delete_v1 on myeongha_admin_ops.admin_audit_events_v1 for delete to myeongha_admin_retention_owner
 using(expires_at<=clock_timestamp() and occurred_at<=clock_timestamp()-interval '31536000 seconds');
create policy admin_retention_owner_audit_v1 on myeongha_admin_ops.admin_audit_events_v1 for insert to myeongha_admin_retention_owner with check(true);
create policy admin_retention_owner_holds_v1 on myeongha_admin_ops.admin_audit_retention_holds_v1 for all to myeongha_admin_retention_owner using(true) with check(true);
create function myeongha_admin_ops.cmd_purge_expired_admin_audit_v1(p_limit integer)
returns table(deleted integer) language plpgsql security definer
set search_path=pg_catalog,myeongha_admin_ops as $$
declare v_ids uuid[];v_now timestamptz:=clock_timestamp();
begin
 if p_limit is null or p_limit<1 or p_limit>1000 then raise exception 'Invalid audit purge bound';end if;
 -- Serialize bounded cleanup with insert/hold changes so a legal hold cannot
 -- race the eligibility snapshot. DELETE permits these locks; no UPDATE grant.
 lock table myeongha_admin_ops.admin_audit_events_v1,myeongha_admin_ops.admin_audit_retention_holds_v1 in share row exclusive mode;
 select array_agg(request_id) into v_ids from(
  select a.request_id from myeongha_admin_ops.admin_audit_events_v1 a
  where a.expires_at<=v_now and a.occurred_at<=v_now-interval '31536000 seconds'
  and not exists(select 1 from myeongha_admin_ops.admin_audit_retention_holds_v1 h where h.request_id=a.request_id and (h.hold_until is null or h.hold_until>v_now))
  order by a.expires_at,a.request_id limit p_limit
 ) bounded;
 delete from myeongha_admin_ops.admin_audit_retention_holds_v1 where request_id=any(v_ids);
 delete from myeongha_admin_ops.admin_audit_events_v1 where request_id=any(v_ids);
 get diagnostics deleted=row_count;
 -- Cleanup is also audited atomically; audit failure rolls back deletions.
 insert into myeongha_admin_ops.admin_audit_events_v1(request_id,actor_auth_user_id,target_ref,action,outcome,occurred_at)
 values(gen_random_uuid(),null,null,'maintenance:audit-purge','allowed',v_now);
 return next;
end $$;
grant create on schema myeongha_admin_ops to myeongha_admin_retention_owner;
alter function myeongha_admin_ops.cmd_purge_expired_admin_audit_v1(integer) owner to myeongha_admin_retention_owner;
revoke create on schema myeongha_admin_ops from myeongha_admin_retention_owner;
revoke all on function myeongha_admin_ops.cmd_purge_expired_admin_audit_v1(integer) from public;
grant execute on function myeongha_admin_ops.cmd_purge_expired_admin_audit_v1(integer) to myeongha_admin_retention_executor;
commit;
