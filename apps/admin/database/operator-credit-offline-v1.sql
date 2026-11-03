-- OFFLINE ONLY: requires the existing credit ledger and operator-presentation
-- candidates. Installation/EXECUTE in Production requires separate approval.
-- No automatic credit issuance or customer/provider execution is performed.
begin;
do $$ begin
 if not exists(select 1 from pg_roles where rolname='myeongha_admin_credit_owner') then
  create role myeongha_admin_credit_owner nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
 end if;
 if not exists(select 1 from pg_roles r where rolname='myeongha_admin_credit_owner' and not rolcanlogin and not rolinherit
  and not rolsuper and not rolbypassrls and not rolcreaterole and not rolcreatedb and not rolreplication
  and not exists(select 1 from pg_auth_members m where m.member=r.oid)) then raise exception 'Credit owner privilege drift';end if;
 if not exists(select 1 from pg_attribute where attrelid='public.chat_credit_lots_v1'::regclass and attname='credits_issued' and atttypid='integer'::regtype)
  or not exists(select 1 from pg_attribute where attrelid='public.chat_credit_lots_v1'::regclass and attname='credits_remaining' and atttypid='integer'::regtype)
 then raise exception 'Existing integer credit ledger required';end if;
end $$;
-- An administrator adjustment is never falsely labelled signup, purchase or
-- Reading reward. Original source invariants are preserved. Its expiry is
-- explicitly selected by the Owner for each grant, with no implicit default.
do $$ declare v_existing_expression text;v_source_expression text;begin
 select pg_get_expr(conbin,conrelid) into v_source_expression from pg_constraint
 where conrelid='public.chat_credit_lots_v1'::regclass and conname='chat_credit_lots_v1_source_kind_check' and contype='c' and convalidated;
 select pg_get_expr(conbin,conrelid) into v_existing_expression from pg_constraint
 where conrelid='public.chat_credit_lots_v1'::regclass and conname='chat_credit_lots_validity_v1' and contype='c' and convalidated;
 if v_existing_expression is null or v_source_expression is null or position('admin_adjustment' in v_existing_expression)>0 or position('admin_adjustment' in v_source_expression)>0 then
  raise exception 'An unmodified validated source validity constraint is required';end if;
 -- Preserve the exact current approved conditions, including source-specific
 -- quantities and exact expiry equality. Older disposable candidates had weaker
 -- rules and must never rewrite the Production source authority.
 alter table public.chat_credit_lots_v1 drop constraint chat_credit_lots_v1_source_kind_check;
 execute format('alter table public.chat_credit_lots_v1 add constraint chat_credit_lots_v1_source_kind_check check ((%s) OR source_kind=''admin_adjustment'')',v_source_expression);
 alter table public.chat_credit_lots_v1 drop constraint chat_credit_lots_validity_v1;
 execute format('alter table public.chat_credit_lots_v1 add constraint chat_credit_lots_validity_v1 check ((%s) OR (source_kind=''admin_adjustment'' AND (expires_at IS NULL OR expires_at>issued_at)))',v_existing_expression);
end $$;
alter table myeongha_admin_ops.command_receipts_v1 drop constraint command_receipts_v1_operation_check;
alter table myeongha_admin_ops.command_receipts_v1 add constraint command_receipts_v1_operation_check check(operation in ('presentation-save','credit-adjust'));
create table myeongha_admin_ops.credit_adjustment_allocations_v1(
 operation_id uuid not null references myeongha_admin_ops.command_receipts_v1(operation_id),
 -- Deliberately no FK to a Subject or Lot: a retained operational receipt must
 -- not prevent existing privacy deletion of the service ledger.
 lot_id uuid not null,credits_delta integer not null check(credits_delta<>0),
 primary key(operation_id,lot_id));
alter table myeongha_admin_ops.credit_adjustment_allocations_v1 enable row level security;
alter table myeongha_admin_ops.credit_adjustment_allocations_v1 force row level security;
revoke all on myeongha_admin_ops.credit_adjustment_allocations_v1 from public;
grant usage on schema public,myeongha_admin_ops to myeongha_admin_credit_owner;
grant select(id,kind,status),update(id) on public.subjects to myeongha_admin_credit_owner;
grant select(id,subject_id,source_kind,source_ref,credits_issued,credits_remaining,issued_at,expires_at),
 insert(id,subject_id,source_kind,source_ref,credits_issued,credits_remaining,issued_at,expires_at),update(credits_remaining)
 on public.chat_credit_lots_v1 to myeongha_admin_credit_owner;
grant select,insert on myeongha_admin_ops.command_receipts_v1,myeongha_admin_ops.credit_adjustment_allocations_v1 to myeongha_admin_credit_owner;
grant insert(request_id,actor_auth_user_id,target_ref,action,outcome,occurred_at) on myeongha_admin_ops.admin_audit_events_v1 to myeongha_admin_credit_owner;
create policy admin_credit_subject_read_v1 on public.subjects for select to myeongha_admin_credit_owner using(true);
create policy admin_credit_subject_lock_v1 on public.subjects for update to myeongha_admin_credit_owner using(true) with check(true);
create policy admin_credit_lot_read_v1 on public.chat_credit_lots_v1 for select to myeongha_admin_credit_owner using(true);
create policy admin_credit_lot_insert_v1 on public.chat_credit_lots_v1 for insert to myeongha_admin_credit_owner with check(source_kind='admin_adjustment');
create policy admin_credit_lot_update_v1 on public.chat_credit_lots_v1 for update to myeongha_admin_credit_owner using(true) with check(true);
create policy admin_credit_receipt_read_v1 on myeongha_admin_ops.command_receipts_v1 for select to myeongha_admin_credit_owner using(operation='credit-adjust');
create policy admin_credit_receipt_insert_v1 on myeongha_admin_ops.command_receipts_v1 for insert to myeongha_admin_credit_owner with check(operation='credit-adjust');
create policy admin_credit_allocation_read_v1 on myeongha_admin_ops.credit_adjustment_allocations_v1 for select to myeongha_admin_credit_owner using(true);
create policy admin_credit_allocation_insert_v1 on myeongha_admin_ops.credit_adjustment_allocations_v1 for insert to myeongha_admin_credit_owner with check(true);
create policy admin_credit_audit_insert_v1 on myeongha_admin_ops.admin_audit_events_v1 for insert to myeongha_admin_credit_owner with check(action='command:credit-adjust');

create function myeongha_admin_ops.qry_credit_adjustment_preview_v1(p_subject uuid)
returns table(state jsonb,version text) language plpgsql stable security definer
set search_path=pg_catalog,public,myeongha_admin_ops as $$
declare v_now timestamptz:=clock_timestamp();v_kind text;v_status text;v_available bigint;v_total bigint;v_count bigint;v_version text;
begin
 select kind::text,status::text into v_kind,v_status from public.subjects where id=p_subject;
 if v_kind is distinct from 'member' or v_status is distinct from 'active' then raise exception 'Active Member credit target required';end if;
 select coalesce(sum(credits_remaining) filter(where expires_at is null or expires_at>v_now),0),coalesce(sum(credits_remaining),0),count(*),
 md5(coalesce(jsonb_agg(jsonb_build_array(id,credits_remaining,credits_issued,expires_at,(expires_at is null or expires_at>v_now)) order by id)::text,'[]'))
 into v_available,v_total,v_count,v_version from public.chat_credit_lots_v1 where subject_id=p_subject;
 return query select jsonb_build_object('targetRef',p_subject,'subjectKind',v_kind,'subjectStatus',v_status,
 'availableCredits',v_available::text,'totalCredits',v_total::text,'lotCount',v_count::text),v_version;
end $$;

create function myeongha_admin_ops.cmd_adjust_credit_v1(p_actor uuid,p_operation uuid,p_request uuid,p_hash text,p_subject uuid,
 p_expected text,p_delta integer,p_expires timestamptz,p_reason text)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public,myeongha_admin_ops as $$
declare v_prior myeongha_admin_ops.command_receipts_v1%rowtype;v_before jsonb;v_after jsonb;v_version text;
 v_now timestamptz;v_lot record;v_remaining bigint;v_take integer;v_new_lot uuid;v_result jsonb;v_allocations jsonb:='[]';
begin
 if p_actor is null or p_operation is null or p_request is null or p_subject is null or p_hash is null or p_hash !~ '^[a-f0-9]{64}$'
  or p_expected is null or p_expected !~ '^[a-f0-9]{32}$' or p_delta is null or p_delta=0
  or p_reason is null or length(btrim(p_reason)) not between 1 and 500 or (p_delta<0 and p_expires is not null)
 then raise exception using errcode='22023',message='Invalid confirmed credit adjustment';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_operation::text,0));
 select * into v_prior from myeongha_admin_ops.command_receipts_v1 where operation_id=p_operation;
 if found then
  if v_prior.operation<>'credit-adjust' or v_prior.actor_auth_user_id<>p_actor or v_prior.payload_hash<>p_hash or v_prior.target_id<>p_subject
  then raise exception using errcode='23505',message='Credit adjustment idempotency conflict';end if;
  return v_prior.result_jsonb||jsonb_build_object('status','replayed');
 end if;
 -- Same Subject lock as reserve/signup/topup/reward/finalize; no external calls
 -- occur inside this transaction. Reserved quantities are already excluded
 -- from remaining credits and are never reclaimed or invalidated here.
 perform 1 from public.subjects where id=p_subject and kind='member' and status='active' for update;
 if not found then raise exception 'Active Member credit target required';end if;
 v_now:=clock_timestamp();
 select q.state,q.version into v_before,v_version from myeongha_admin_ops.qry_credit_adjustment_preview_v1(p_subject) q;
 if v_version<>p_expected then raise exception using errcode='40001',message='Credit balance changed; confirm again';end if;
 if p_delta>0 and p_expires is not null and p_expires<=v_now then raise exception 'Grant expiry must be in the future';end if;
 if p_delta<0 and (v_before->>'availableCredits')::bigint<-(p_delta::bigint) then raise exception 'Insufficient spendable credits for recovery';end if;
 if p_delta>0 then
  v_new_lot:=gen_random_uuid();
  insert into public.chat_credit_lots_v1(id,subject_id,source_kind,source_ref,credits_issued,credits_remaining,issued_at,expires_at)
  values(v_new_lot,p_subject,'admin_adjustment',p_operation,p_delta,p_delta,v_now,p_expires);
  v_allocations:=jsonb_build_array(jsonb_build_object('lotId',v_new_lot,'delta',p_delta));
 else
  v_remaining:=-(p_delta::bigint);
  for v_lot in select id,credits_remaining from public.chat_credit_lots_v1 where subject_id=p_subject and credits_remaining>0
   and (expires_at is null or expires_at>v_now) order by expires_at nulls last,issued_at,id for update
  loop
   v_take:=least(v_remaining,v_lot.credits_remaining)::integer;
   update public.chat_credit_lots_v1 set credits_remaining=credits_remaining-v_take where id=v_lot.id;
   v_allocations:=v_allocations||jsonb_build_array(jsonb_build_object('lotId',v_lot.id,'delta',-v_take));
   v_remaining:=v_remaining-v_take;exit when v_remaining=0;
  end loop;
  if v_remaining<>0 then raise exception 'Credit recovery allocation changed';end if;
 end if;
 select q.state into v_after from myeongha_admin_ops.qry_credit_adjustment_preview_v1(p_subject) q;
 v_result:=jsonb_build_object('operationId',p_operation,'targetRef',p_subject,'status','succeeded','state',jsonb_build_object(
  'targetRef',p_subject,'delta',p_delta,'direction',case when p_delta>0 then 'grant' else 'recover' end,
  'beforeAvailableCredits',v_before->>'availableCredits','beforeTotalCredits',v_before->>'totalCredits',
  'afterAvailableCredits',v_after->>'availableCredits','afterTotalCredits',v_after->>'totalCredits',
  'grantLotId',v_new_lot,'grantExpiresAt',p_expires,'affectedLotCount',jsonb_array_length(v_allocations),'recordedAt',v_now));
 insert into myeongha_admin_ops.command_receipts_v1(operation_id,actor_auth_user_id,operation,target_id,payload_hash,reason,request_id,result_jsonb,occurred_at)
 values(p_operation,p_actor,'credit-adjust',p_subject,p_hash,p_reason,p_request,v_result,v_now);
 insert into myeongha_admin_ops.credit_adjustment_allocations_v1(operation_id,lot_id,credits_delta)
 select p_operation,(a->>'lotId')::uuid,(a->>'delta')::integer from jsonb_array_elements(v_allocations) a;
 insert into myeongha_admin_ops.admin_audit_events_v1(request_id,actor_auth_user_id,target_ref,action,outcome,occurred_at)
 values(p_operation,p_actor,p_subject,'command:credit-adjust','allowed',v_now);
 return v_result;
end $$;

create function myeongha_admin_ops.qry_credit_adjustment_receipt_v1(p_actor uuid,p_operation uuid)
returns table(result jsonb) language sql stable security definer set search_path=pg_catalog,myeongha_admin_ops as $$
 select result_jsonb from myeongha_admin_ops.command_receipts_v1 where operation='credit-adjust' and operation_id=p_operation and actor_auth_user_id=p_actor
$$;
create function myeongha_admin_ops.qry_credit_adjustment_history_v1(p_subject uuid)
returns table(entry jsonb) language sql stable security definer set search_path=pg_catalog,myeongha_admin_ops as $$
 select (result_jsonb->'state')||jsonb_build_object('operationId',operation_id,'reason',reason,'changedAt',occurred_at)
 from myeongha_admin_ops.command_receipts_v1 where operation='credit-adjust' and target_id=p_subject order by occurred_at desc,operation_id desc limit 50
$$;
grant create on schema myeongha_admin_ops to myeongha_admin_credit_owner;
alter function myeongha_admin_ops.qry_credit_adjustment_preview_v1(uuid) owner to myeongha_admin_credit_owner;
alter function myeongha_admin_ops.cmd_adjust_credit_v1(uuid,uuid,uuid,text,uuid,text,integer,timestamptz,text) owner to myeongha_admin_credit_owner;
alter function myeongha_admin_ops.qry_credit_adjustment_receipt_v1(uuid,uuid) owner to myeongha_admin_credit_owner;
alter function myeongha_admin_ops.qry_credit_adjustment_history_v1(uuid) owner to myeongha_admin_credit_owner;
revoke create on schema myeongha_admin_ops from myeongha_admin_credit_owner;
revoke all on function myeongha_admin_ops.qry_credit_adjustment_preview_v1(uuid),
 myeongha_admin_ops.cmd_adjust_credit_v1(uuid,uuid,uuid,text,uuid,text,integer,timestamptz,text),
 myeongha_admin_ops.qry_credit_adjustment_receipt_v1(uuid,uuid),myeongha_admin_ops.qry_credit_adjustment_history_v1(uuid) from public;
grant execute on function myeongha_admin_ops.qry_credit_adjustment_preview_v1(uuid),
 myeongha_admin_ops.cmd_adjust_credit_v1(uuid,uuid,uuid,text,uuid,text,integer,timestamptz,text),
 myeongha_admin_ops.qry_credit_adjustment_receipt_v1(uuid,uuid),myeongha_admin_ops.qry_credit_adjustment_history_v1(uuid) to myeongha_admin_command_executor;
commit;
