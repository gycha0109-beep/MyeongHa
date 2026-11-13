-- P0-CM-05: Guest is free-only; all paid checkout writes require an active authenticated Member.
-- Historical Guest-owned Commerce rows are retained and are not rewritten.
-- This is forward-only; historical migrations 0960 and 1070 remain immutable.

create or replace function public.ct_require_member_paid_checkout_v1()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_subject_kind text;
  v_subject_status text;
  v_auth_user_id uuid;
  v_merged_into uuid;
begin
  select s.kind, s.status, s.auth_user_id, s.merged_into_subject_id
    into v_subject_kind, v_subject_status, v_auth_user_id, v_merged_into
  from public.subjects s
  where s.id = new.subject_id
  for share;

  if not found
     or v_subject_kind is distinct from 'member'
     or v_subject_status is distinct from 'active'
     or v_auth_user_id is null
     or v_merged_into is not null then
    raise exception using
      errcode = '23514',
      constraint = 'ct_paid_checkout_member_required_v1',
      message = 'paid checkout requires an active authenticated Member; login required';
  end if;

  return new;
end;
$$;

create trigger tr_purchase_intent_member_required_v1
  before insert on public.purchase_intents
  for each row execute function public.ct_require_member_paid_checkout_v1();

create trigger tr_commerce_payment_attempt_member_required_v1
  before insert on public.commerce_payment_attempts
  for each row execute function public.ct_require_member_paid_checkout_v1();

comment on function public.ct_require_member_paid_checkout_v1() is
  'P0-CM-05: current paid Purchase Intent and Payment Attempt inserts require an active authenticated Member. Guest free experiences do not use paid checkout.'
