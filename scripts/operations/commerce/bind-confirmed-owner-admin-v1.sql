-- Watchtower-Track: commerce-payment
-- Execute only against the selected, audited production Supabase project,
-- AFTER the reviewed owner-admin schema migration has been installed.
-- No checkout, balances, payment receipts, grants, or provider costs change.
do $bootstrap$
declare
  v_auth uuid;
  v_subject uuid;
  v_count integer;
begin
  select count(*) into v_count
    from auth.users u join public.subjects s on s.auth_user_id=u.id
    where lower(u.email)='gycha0109@gmail.com'
      and u.email_confirmed_at is not null
      and s.kind='member' and s.status='active';
  if v_count<>1 then
    raise exception 'Owner binding requires exactly one confirmed active Member';
  end if;
  select u.id,s.id into strict v_auth,v_subject
    from auth.users u join public.subjects s on s.auth_user_id=u.id
    where lower(u.email)='gycha0109@gmail.com'
      and u.email_confirmed_at is not null
      and s.kind='member' and s.status='active';

  insert into public.myeongha_owner_administrators_v1
    (auth_user_id,role,credit_exempt,sandbox_checkout_allowed)
    values (v_auth,'superadmin',true,true)
  on conflict(auth_user_id) do nothing;

  if not exists(
    select 1 from public.myeongha_owner_administrators_v1 a
    where a.auth_user_id=v_auth and a.role='superadmin'
      and a.credit_exempt and a.sandbox_checkout_allowed
  ) then
    raise exception 'Owner binding reconciliation failed';
  end if;
end
$bootstrap$;
