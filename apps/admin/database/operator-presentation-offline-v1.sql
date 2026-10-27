-- OFFLINE installation candidate. Apply only to a disposable DB until private
-- hosting, the single Owner and dedicated credentials have been bound.
-- Requires operator-audit-local-v1.sql. No service-role/user table privileges.
begin;
create schema if not exists myeongha_admin_ops;
revoke all on schema myeongha_admin_ops from public;
do $$ begin
  if not exists(select 1 from pg_roles where rolname='myeongha_admin_presentation_owner') then
    create role myeongha_admin_presentation_owner nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
  end if;
  if not exists(select 1 from pg_roles where rolname='myeongha_admin_command_executor') then
    create role myeongha_admin_command_executor login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
  end if;
  if not exists(select 1 from pg_roles where rolname='myeongha_admin_command_executor' and rolcanlogin and not rolinherit and not rolsuper and not rolcreatedb and not rolcreaterole and not rolreplication and not rolbypassrls)
    or not exists(select 1 from pg_roles where rolname='myeongha_admin_presentation_owner' and not rolcanlogin and not rolinherit and not rolsuper and not rolcreatedb and not rolcreaterole and not rolreplication and not rolbypassrls)
    or exists(select 1 from pg_auth_members m join pg_roles r on r.oid=m.member where r.rolname in ('myeongha_admin_command_executor','myeongha_admin_presentation_owner')) then
    raise exception 'Administrator presentation principal drift';
  end if;
end $$;

create table myeongha_admin_ops.presentation_entries_v1 (
  id uuid primary key, kind text not null check(kind in ('notice','banner')),
  title text not null check(length(title) between 1 and 160),
  body_text text not null check(length(body_text) between 1 and 5000),
  link_path text null check(link_path is null or (length(link_path)<=200 and link_path ~ '^/[A-Za-z0-9/_.-]*(\?[A-Za-z0-9_.%=&-]*)?$' and link_path !~ '^//' and position('..' in link_path)=0)),
  status text not null check(status in ('draft','published')),
  starts_at timestamptz null, ends_at timestamptz null,
  revision integer not null check(revision>0), updated_at timestamptz not null,
  check(starts_at is null or ends_at is null or ends_at>starts_at),
  check(kind<>'banner' or length(body_text)<=1000)
);
create index presentation_entries_schedule_v1 on myeongha_admin_ops.presentation_entries_v1(status,starts_at,ends_at);
create table myeongha_admin_ops.command_receipts_v1 (
  operation_id uuid primary key, actor_auth_user_id uuid not null,
  operation text not null check(operation='presentation-save'), target_id uuid not null,
  payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'),
  reason text not null check(length(reason) between 1 and 500),
  request_id uuid not null, result_jsonb jsonb not null,
  occurred_at timestamptz not null default clock_timestamp()
);
create table myeongha_admin_ops.presentation_history_v1 (
  entry_id uuid not null references myeongha_admin_ops.presentation_entries_v1(id),
  revision integer not null, operation_id uuid not null unique references myeongha_admin_ops.command_receipts_v1(operation_id),
  actor_auth_user_id uuid not null, reason text not null,
  snapshot_jsonb jsonb not null, occurred_at timestamptz not null,
  primary key(entry_id,revision)
);
create index admin_command_receipts_actor_time_v1 on myeongha_admin_ops.command_receipts_v1(actor_auth_user_id,occurred_at desc);
alter table myeongha_admin_ops.presentation_entries_v1 enable row level security;
alter table myeongha_admin_ops.presentation_entries_v1 force row level security;
alter table myeongha_admin_ops.presentation_history_v1 enable row level security;
alter table myeongha_admin_ops.presentation_history_v1 force row level security;
alter table myeongha_admin_ops.command_receipts_v1 enable row level security;
alter table myeongha_admin_ops.command_receipts_v1 force row level security;
revoke all on myeongha_admin_ops.presentation_entries_v1,myeongha_admin_ops.presentation_history_v1,myeongha_admin_ops.command_receipts_v1 from public;
grant usage on schema myeongha_admin_ops to myeongha_admin_presentation_owner,myeongha_admin_command_executor;
grant select,insert,update on myeongha_admin_ops.presentation_entries_v1 to myeongha_admin_presentation_owner;
grant select,insert on myeongha_admin_ops.presentation_history_v1,myeongha_admin_ops.command_receipts_v1 to myeongha_admin_presentation_owner;
grant insert(request_id,actor_auth_user_id,target_ref,action,outcome,occurred_at) on myeongha_admin_ops.admin_audit_events_v1 to myeongha_admin_presentation_owner;
create policy admin_presentation_owner_entries_v1 on myeongha_admin_ops.presentation_entries_v1 for all to myeongha_admin_presentation_owner using(true) with check(true);
create policy admin_presentation_owner_history_read_v1 on myeongha_admin_ops.presentation_history_v1 for select to myeongha_admin_presentation_owner using(true);
create policy admin_presentation_owner_history_insert_v1 on myeongha_admin_ops.presentation_history_v1 for insert to myeongha_admin_presentation_owner with check(true);
create policy admin_presentation_owner_receipt_read_v1 on myeongha_admin_ops.command_receipts_v1 for select to myeongha_admin_presentation_owner using(true);
create policy admin_presentation_owner_receipt_insert_v1 on myeongha_admin_ops.command_receipts_v1 for insert to myeongha_admin_presentation_owner with check(true);
create policy admin_presentation_owner_audit_insert_v1 on myeongha_admin_ops.admin_audit_events_v1 for insert to myeongha_admin_presentation_owner with check(true);

create function myeongha_admin_ops.cmd_save_presentation_v1(
 p_actor uuid,p_operation uuid,p_request uuid,p_hash text,p_entry uuid,p_expected integer,
 p_kind text,p_title text,p_body text,p_link text,p_status text,p_starts timestamptz,p_ends timestamptz,p_reason text
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,myeongha_admin_ops as $$
declare v_existing myeongha_admin_ops.command_receipts_v1%rowtype;
 v_entry myeongha_admin_ops.presentation_entries_v1%rowtype;
 v_revision integer; v_result jsonb; v_now timestamptz:=clock_timestamp();
begin
 if p_actor is null or p_operation is null or p_request is null or p_entry is null or p_expected is null or p_expected<0
  or p_hash is null or p_hash !~ '^[a-f0-9]{64}$' or p_kind is null or p_kind not in ('notice','banner')
  or p_title is null or length(btrim(p_title)) not between 1 and 160
  or p_body is null or length(btrim(p_body)) not between 1 and 5000
  or (p_kind='banner' and length(p_body)>1000)
  or p_status is null or p_status not in ('draft','published')
  or (p_link is not null and (length(p_link)>200 or p_link !~ '^/[A-Za-z0-9/_.-]*(\?[A-Za-z0-9_.%=&-]*)?$' or p_link ~ '^//' or position('..' in p_link)>0))
  or (p_starts is not null and p_ends is not null and p_ends<=p_starts)
  or p_reason is null or length(btrim(p_reason)) not between 1 and 500 then
  raise exception using errcode='22023',message='Invalid presentation command';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_operation::text,0));
 select * into v_existing from myeongha_admin_ops.command_receipts_v1 where operation_id=p_operation;
 if found then
  if v_existing.actor_auth_user_id<>p_actor or v_existing.payload_hash<>p_hash or v_existing.target_id<>p_entry then
    raise exception using errcode='23505',message='Admin operation idempotency conflict';
  end if;
  return v_existing.result_jsonb || jsonb_build_object('status','replayed');
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_entry::text,1));
 select * into v_entry from myeongha_admin_ops.presentation_entries_v1 where id=p_entry for update;
 if coalesce(v_entry.revision,0)<>p_expected then
  raise exception using errcode='40001',message='Presentation revision conflict';
 end if;
 v_revision:=p_expected+1;
 insert into myeongha_admin_ops.presentation_entries_v1(id,kind,title,body_text,link_path,status,starts_at,ends_at,revision,updated_at)
 values(p_entry,p_kind,p_title,p_body,p_link,p_status,p_starts,p_ends,v_revision,v_now)
 on conflict(id) do update set kind=excluded.kind,title=excluded.title,body_text=excluded.body_text,link_path=excluded.link_path,
 status=excluded.status,starts_at=excluded.starts_at,ends_at=excluded.ends_at,revision=excluded.revision,updated_at=excluded.updated_at;
 v_result:=jsonb_build_object('operationId',p_operation,'targetRef',p_entry,'status','succeeded','state',jsonb_build_object(
   'entryId',p_entry,'revision',v_revision,'previousRevision',p_expected,'kind',p_kind,'title',p_title,'body',p_body,'linkPath',p_link,
   'publicationStatus',p_status,'startsAt',p_starts,'endsAt',p_ends,'updatedAt',v_now));
 insert into myeongha_admin_ops.command_receipts_v1(operation_id,actor_auth_user_id,operation,target_id,payload_hash,reason,request_id,result_jsonb,occurred_at)
 values(p_operation,p_actor,'presentation-save',p_entry,p_hash,p_reason,p_request,v_result,v_now);
 insert into myeongha_admin_ops.presentation_history_v1(entry_id,revision,operation_id,actor_auth_user_id,reason,snapshot_jsonb,occurred_at)
 values(p_entry,v_revision,p_operation,p_actor,p_reason,v_result->'state',v_now);
 -- Operation UUID is a stable atomic audit identity; request UUID remains in
 -- the command receipt and the independent HTTP request audit.
 insert into myeongha_admin_ops.admin_audit_events_v1(request_id,actor_auth_user_id,target_ref,action,outcome,occurred_at)
 values(p_operation,p_actor,p_entry,'command:presentation-save','allowed',v_now);
 return v_result;
end $$;

create function myeongha_admin_ops.qry_presentation_entries_v1(p_id uuid,p_limit integer)
returns table(entry jsonb) language sql stable security definer
set search_path=pg_catalog,myeongha_admin_ops as $$
 select jsonb_build_object('entryId',id,'revision',revision,'kind',kind,'title',title,'body',body_text,'linkPath',link_path,
 'publicationStatus',status,'startsAt',starts_at,'endsAt',ends_at,'updatedAt',updated_at,
 'visibleNow',status='published' and (starts_at is null or starts_at<=current_timestamp) and (ends_at is null or ends_at>current_timestamp))
 from myeongha_admin_ops.presentation_entries_v1 where (p_id is null or id=p_id)
 order by updated_at desc,id desc limit least(greatest(coalesce(p_limit,20),1),50)
$$;
create function myeongha_admin_ops.qry_presentation_history_v1(p_entry uuid)
returns table(entry jsonb) language sql stable security definer
set search_path=pg_catalog,myeongha_admin_ops as $$
 select snapshot_jsonb || jsonb_build_object('operationId',operation_id,'reason',reason,'changedAt',occurred_at)
 from myeongha_admin_ops.presentation_history_v1 where entry_id=p_entry order by revision desc limit 50
$$;
create function myeongha_admin_ops.qry_admin_command_receipt_v1(p_actor uuid,p_operation uuid)
returns table(result jsonb) language sql stable security definer
set search_path=pg_catalog,myeongha_admin_ops as $$
 select result_jsonb from myeongha_admin_ops.command_receipts_v1 where operation_id=p_operation and actor_auth_user_id=p_actor
$$;
-- Published presentation-only feed. No drafts, history, reasons or actor IDs.
create function myeongha_admin_ops.qry_visible_presentations_v1()
returns table(entry jsonb) language sql stable security definer
set search_path=pg_catalog,myeongha_admin_ops as $$
 select jsonb_build_object('entryId',id,'revision',revision,'kind',kind,'title',title,'body',body_text,'linkPath',link_path)
 from myeongha_admin_ops.presentation_entries_v1
 where status='published' and (starts_at is null or starts_at<=current_timestamp) and (ends_at is null or ends_at>current_timestamp)
 order by updated_at desc,id desc limit 20
$$;
alter function myeongha_admin_ops.cmd_save_presentation_v1(uuid,uuid,uuid,text,uuid,integer,text,text,text,text,text,timestamptz,timestamptz,text) owner to myeongha_admin_presentation_owner;
alter function myeongha_admin_ops.qry_presentation_entries_v1(uuid,integer) owner to myeongha_admin_presentation_owner;
alter function myeongha_admin_ops.qry_presentation_history_v1(uuid) owner to myeongha_admin_presentation_owner;
alter function myeongha_admin_ops.qry_admin_command_receipt_v1(uuid,uuid) owner to myeongha_admin_presentation_owner;
alter function myeongha_admin_ops.qry_visible_presentations_v1() owner to myeongha_admin_presentation_owner;
revoke all on function myeongha_admin_ops.cmd_save_presentation_v1(uuid,uuid,uuid,text,uuid,integer,text,text,text,text,text,timestamptz,timestamptz,text),
 myeongha_admin_ops.qry_presentation_entries_v1(uuid,integer),myeongha_admin_ops.qry_presentation_history_v1(uuid),
 myeongha_admin_ops.qry_admin_command_receipt_v1(uuid,uuid),myeongha_admin_ops.qry_visible_presentations_v1() from public;
grant execute on function myeongha_admin_ops.cmd_save_presentation_v1(uuid,uuid,uuid,text,uuid,integer,text,text,text,text,text,timestamptz,timestamptz,text),
 myeongha_admin_ops.qry_presentation_entries_v1(uuid,integer),myeongha_admin_ops.qry_presentation_history_v1(uuid),
 myeongha_admin_ops.qry_admin_command_receipt_v1(uuid,uuid) to myeongha_admin_command_executor;
do $$ begin
 if exists(select 1 from pg_roles where rolname='myeongha_api_executor') then
  grant usage on schema myeongha_admin_ops to myeongha_api_executor;
  grant execute on function myeongha_admin_ops.qry_visible_presentations_v1() to myeongha_api_executor;
 end if;
end $$;
commit;
