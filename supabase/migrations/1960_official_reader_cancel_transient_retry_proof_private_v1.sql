-- D3e11 PRIVATE: narrow D3e6 operator recovery to explicitly known
-- transient errors. LEASE_EXHAUSTED only proves an expired lease, not
-- a recoverable provider failure: it may hide unknown ordering/security.
-- No LIVE executor, new GRANT, refund, entitlement effect, schedule, or purge.
-- No data backfill and no retroactive promotion of existing dead letters.
--
-- The D3e5 sweep intentionally preserves LEASE_EXHAUSTED as an unknown
-- terminal reason; never infer a previous transient failure from it.
do $d3e11_preflight$
declare
  v_oid oid;
  v_function text;
begin
  v_oid := pg_catalog.to_regprocedure(
    'public.internal_private_cancel_review_v1(uuid,text,text)')::oid;
  if v_oid is null then
    raise exception using errcode='55000',
      message='D3e11 requires the exact existing D3e6 review function';
  end if;
  select pg_catalog.pg_get_functiondef(v_oid) into v_function;
  if not exists (
    select 1 from pg_catalog.pg_proc p
    where p.oid=v_oid and not p.prosecdef and p.provolatile='v'
  ) or pg_catalog.strpos(v_function,'LEASE_EXHAUSTED')=0 then
    raise exception using errcode='55000',
      message='D3e11 legacy review classification changed unexpectedly';
  end if;
end
$d3e11_preflight$;

create or replace function public.internal_private_cancel_review_v1(
  p_inbox_id uuid,
  p_action text,
  p_ticket_reference text
)
returns table (
  review_state text,
  effect_authorized boolean
)
language plpgsql volatile security invoker
set search_path=pg_catalog,public
as $d3e6_review$
declare
  v_row public.official_reader_portone_cancel_ingress_inbox_v1%rowtype;
  v_state text;
begin
  if pg_catalog.current_setting('transaction_isolation')<>'read committed' then
    raise exception using errcode='25001',
      message='Private cancellation operator review requires READ COMMITTED';
  end if;
  if p_inbox_id is null or p_action is null
      or p_action not in ('acknowledge','retry_transient')
      or p_ticket_reference is null
      or p_ticket_reference !~ '^OPS-[0-9]{4,12}$' then
    raise exception using errcode='23514',
      constraint='d3e6_invalid_review_shape',
      message='Private cancellation review requires a valid reference and typed action';
  end if;

  select * into v_row
  from public.official_reader_portone_cancel_ingress_inbox_v1
  where id=p_inbox_id for update;
  if not found or v_row.inbox_state not in ('held','dead_letter') then
    raise exception using errcode='55000',
      constraint='d3e6_not_reviewable_state',
      message='Private cancellation item is not eligible for operator review';
  end if;

  if p_action='retry_transient' and
     (v_row.inbox_state<>'dead_letter'
       or v_row.shadow_observation_id is not null
       or v_row.last_failure_code is null
       or v_row.last_failure_code not in (
         'LOOKUP_FAILED','LOOKUP_TIMEOUT','INTERNAL_FAILURE'
       )
       or exists (
         select 1 from public.official_reader_portone_cancel_ops_review_v1 a
         where a.inbox_id=p_inbox_id and a.action='retry_transient'
       )
     ) then
    raise exception using errcode='55000',
      constraint='d3e6_retry_not_authorized',
      message='Private cancellation replay requires one transient dead letter';
  end if;

  -- The role itself is captured, NOT an untrusted caller-provided human name.
  -- Before production, external identity/ticket approval must be bound to DB role.
  insert into public.official_reader_portone_cancel_ops_review_v1 (
    inbox_id,action,ticket_reference,operator_db_principal,
    previous_state,previous_failure_code
  ) values (
    v_row.id,p_action,p_ticket_reference,session_user,
    v_row.inbox_state,v_row.last_failure_code
  );

  if p_action='retry_transient' then
    update public.official_reader_portone_cancel_ingress_inbox_v1
    set inbox_state='queued',attempt_count=0,
      next_attempt_at=pg_catalog.clock_timestamp(),
      last_failure_code=null
    where id=v_row.id;
    v_state:='queued';
  else
    v_state:=v_row.inbox_state;
  end if;

  return query select v_state,false;
end
$d3e6_review$;

-- CREATE OR REPLACE preserves the existing executable ACL. Assert that it
-- remains owner-only and no inherited/public role can invoke it.
do $d3e11_acl$
declare v_role text;
begin
  if exists (
    select 1 from pg_catalog.pg_proc p
    cross join lateral pg_catalog.aclexplode(
      coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))
    ) a
    where p.oid='public.internal_private_cancel_review_v1(uuid,text,text)'::pg_catalog.regprocedure
      and a.grantee=0 and a.privilege_type='EXECUTE'
  ) then
    raise exception using errcode='42501',
      message='D3e11 cannot expose operator review to PUBLIC';
  end if;
  for v_role in
    select rolname from pg_catalog.pg_roles where rolname in (
      'anon','authenticated','service_role','myeongha_api_executor',
      'myeongha_commerce_internal_executor','myeongha_seyeon_chat_runtime_owner'
    )
  loop
    if pg_catalog.has_function_privilege(v_role,
      'public.internal_private_cancel_review_v1(uuid,text,text)','EXECUTE') then
      raise exception using errcode='42501',
        message='D3e11 cannot expose operator review to a runtime role';
    end if;
  end loop;
end
$d3e11_acl$;

comment on function public.internal_private_cancel_review_v1(uuid,text,text)
is 'D3e11 private review: acknowledge HOLD/dead letter; at most one requeue ONLY for explicit lookup/internal transient dead letter. LEASE_EXHAUSTED is unknown and cannot retry. No runtime grants or financial effects.';
