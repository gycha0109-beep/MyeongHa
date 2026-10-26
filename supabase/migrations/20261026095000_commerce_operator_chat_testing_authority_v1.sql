-- Watchtower-Track: commerce-payment
-- Named, verified single-account operator capability. No Postgres SUPERUSER,
-- BYPASSRLS, payment-approval authority or cross-Subject data access.
-- A checkout simulation is permitted only in a separately configured sandbox.
create table commerce_credit_private.operator_chat_test_grants_v1 (
  subject_id uuid primary key references public.subjects(id) on delete cascade,
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  owner_email text not null check (owner_email = 'gycha0109@gmail.com'),
  free_chat_enabled boolean not null default true,
  sandbox_checkout_enabled boolean not null default true,
  created_at timestamptz not null default pg_catalog.clock_timestamp()
);
revoke all on commerce_credit_private.operator_chat_test_grants_v1 from public,anon,authenticated,service_role,myeongha_api_executor;
alter table commerce_credit_private.operator_chat_test_grants_v1 enable row level security;
alter table commerce_credit_private.operator_chat_test_grants_v1 force row level security;

-- Fail rather than silently assigning an ambiguous/unverified identity.
do $grant$
declare v_subject uuid; v_user uuid; v_count bigint;
begin
  select count(*),(array_agg(s.id))[1],(array_agg(a.id))[1] into v_count,v_subject,v_user
  from auth.users a join public.subjects s on s.auth_user_id=a.id
  where lower(a.email)='gycha0109@gmail.com'
    and a.email_confirmed_at is not null
    and s.kind='member' and s.status='active';
  if v_count<>1 then
    raise exception 'Verified operator account must resolve to exactly one active Member Subject';
  end if;
  insert into commerce_credit_private.operator_chat_test_grants_v1
    (subject_id,auth_user_id,owner_email)
  values(v_subject,v_user,'gycha0109@gmail.com');
end
$grant$;

-- Scope by transaction-local canonical Subject and confirmed auth identity.
-- Caller cannot select a different Subject, role, email, or checkout mode.
create function public.qry_operator_chat_test_capability_v1(p_subject_id uuid)
returns table(free_chat_enabled boolean,sandbox_checkout_enabled boolean)
language plpgsql stable security definer
set search_path=pg_catalog,public
set row_security=off
as $fn$
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  return query select
    coalesce(bool_or(g.free_chat_enabled),false),
    coalesce(bool_or(g.sandbox_checkout_enabled),false)
  from public.subjects s
  join auth.users a on a.id=s.auth_user_id
  left join commerce_credit_private.operator_chat_test_grants_v1 g
    on g.subject_id=s.id and g.auth_user_id=a.id
      and g.owner_email='gycha0109@gmail.com'
  where s.id=p_subject_id and s.kind='member' and s.status='active'
    and a.email_confirmed_at is not null
    and lower(a.email)='gycha0109@gmail.com';
end
$fn$;
revoke all on function public.qry_operator_chat_test_capability_v1(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.qry_operator_chat_test_capability_v1(uuid)
  to myeongha_api_executor;
-- No mutation or transfer privilege is granted by this migration.
