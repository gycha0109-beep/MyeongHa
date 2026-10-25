-- Legal L2 A1: single-use OAuth correlation for EXISTING verified Members.
-- PROPOSAL ONLY, NOT deployed to Production; separate Privacy/DB approval.
-- Stores no subject/user ID, state plaintext, refresh token or identity details.
begin;
create table public.legal_existing_member_social_states_v1 (
  state_digest text primary key check (state_digest ~ '^[a-f0-9]{64}$'),
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  consumed_at timestamptz null,
  constraint legal_existing_member_social_state_clock_v1
    check (expires_at > issued_at and (consumed_at is null or consumed_at >= issued_at))
);
create index legal_existing_member_social_state_expiry_v1
  on public.legal_existing_member_social_states_v1(expires_at);
alter table public.legal_existing_member_social_states_v1 enable row level security;
revoke all on public.legal_existing_member_social_states_v1
 from public,anon,authenticated,service_role,myeongha_api_executor;

create function public.cmd_issue_existing_member_social_state_v1(p_digest text)
returns boolean language plpgsql security definer
set search_path=pg_catalog,public,pg_temp
as $issue$
declare v_now timestamptz := clock_timestamp(); v_rows integer;
begin
  if p_digest is null or p_digest !~ '^[a-f0-9]{64}$' then return false; end if;
  insert into public.legal_existing_member_social_states_v1
    (state_digest,issued_at,expires_at)
  values (p_digest,v_now,v_now+interval '10 minutes')
  on conflict (state_digest) do nothing;
  get diagnostics v_rows = row_count;
  return v_rows=1;
end $issue$;

create function public.cmd_consume_existing_member_social_state_v1(p_digest text)
returns boolean language plpgsql security definer
set search_path=pg_catalog,public,pg_temp
as $consume$
begin
  if p_digest is null or p_digest !~ '^[a-f0-9]{64}$' then return false; end if;
  update public.legal_existing_member_social_states_v1
     set consumed_at=clock_timestamp()
   where state_digest=p_digest and consumed_at is null
     and expires_at>clock_timestamp();
  return found;
end $consume$;

create function public.internal_purge_existing_member_social_states_v1(p_limit integer)
returns integer language plpgsql security definer
set search_path=pg_catalog,public,pg_temp
as $purge$
declare v_removed integer;
begin
  if p_limit is null or p_limit<1 or p_limit>250 then
    raise exception using errcode='23514',
      constraint='legal_existing_member_social_state_purge_limit';
  end if;
  with expired as (
    select state_digest from public.legal_existing_member_social_states_v1
    where expires_at<=clock_timestamp()
    order by expires_at,state_digest limit p_limit for update skip locked
  )
  delete from public.legal_existing_member_social_states_v1 a
  using expired e where a.state_digest=e.state_digest;
  get diagnostics v_removed = row_count;
  return v_removed;
end $purge$;

revoke all on function public.cmd_issue_existing_member_social_state_v1(text)
 from public,anon,authenticated,service_role;
revoke all on function public.cmd_consume_existing_member_social_state_v1(text)
 from public,anon,authenticated,service_role;
revoke all on function public.internal_purge_existing_member_social_states_v1(integer)
 from public,anon,authenticated,service_role,myeongha_api_executor;
grant execute on function public.cmd_issue_existing_member_social_state_v1(text)
 to myeongha_api_executor;
grant execute on function public.cmd_consume_existing_member_social_state_v1(text)
 to myeongha_api_executor;
grant execute on function public.internal_purge_existing_member_social_states_v1(integer)
 to myeongha_system_executor;
commit;
