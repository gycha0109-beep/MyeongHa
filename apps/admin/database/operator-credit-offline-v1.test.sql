\set ON_ERROR_STOP on
-- Synthetic disposable verification. No fixture persists after ROLLBACK.
begin;
do $$ begin if current_database()<>'myeongha_admin_disposable' then raise exception 'Disposable local database required';end if;end $$;
insert into auth.users(id) values('ad110000-0000-4000-8000-000000000001');
insert into public.subjects(id,kind,auth_user_id,status,created_at,updated_at) values(
 'ad110000-0000-4000-8000-000000000001','member','ad110000-0000-4000-8000-000000000001','active',clock_timestamp(),clock_timestamp());
insert into public.conversation_threads(id,subject_id,thread_type,status,created_at,updated_at) values(
 'ad120000-0000-4000-8000-000000000001','ad110000-0000-4000-8000-000000000001','single_character','active',clock_timestamp(),clock_timestamp());
-- The real source authority uses exact quantities/expiry equality. Reject a
-- disposable replay that silently substituted the older loose candidate.
do $$ declare bad record;stamp timestamptz:=clock_timestamp();begin
 for bad in select * from (values
  ('signup',51,interval '30 days'),('signup',50,interval '31 days'),
  ('portone_topup',301,null::interval),('portone_topup',300,interval '30 days'),
  ('reading_reward',151,interval '90 days'),('reading_reward',150,interval '91 days')) t(source,quantity,validity)
 loop
  begin
   insert into public.chat_credit_lots_v1(subject_id,source_kind,source_ref,credits_issued,credits_remaining,issued_at,expires_at)
   values('ad110000-0000-4000-8000-000000000001',bad.source,gen_random_uuid(),bad.quantity,bad.quantity,stamp,stamp+bad.validity);
   raise exception 'Original source quantity/expiry authority was weakened: %',bad.source;
  exception when check_violation then null;end;
 end loop;
end $$;
select public.internal_cmd_chat_signup_credit_v1('ad110000-0000-4000-8000-000000000001');
select * from public.internal_cmd_chat_credit_reserve_v1('ad110000-0000-4000-8000-000000000001','ad120000-0000-4000-8000-000000000001','ad130000-0000-4000-8000-000000000001');
set local role myeongha_admin_command_executor;
do $$ declare s uuid:='ad110000-0000-4000-8000-000000000001';a uuid:='ad140000-0000-4000-8000-000000000001';
 op uuid:='ad150000-0000-4000-8000-000000000001';v jsonb;b jsonb;version text;prior_version text;
begin
 select q.state,q.version into b,version from myeongha_admin_ops.qry_credit_adjustment_preview_v1(s) q;
 if b->>'availableCredits'<>'40' then raise exception 'Reserved credits were available for correction';end if;
 prior_version:=version;
 v:=myeongha_admin_ops.cmd_adjust_credit_v1(a,op,gen_random_uuid(),repeat('a',64),s,version,1000001,null,'Synthetic grant with explicit non-expiring selection');
 if v->>'status'<>'succeeded' or v->'state'->>'afterAvailableCredits'<>'1000041' then raise exception 'Grant above old artificial cap failed';end if;
 v:=myeongha_admin_ops.cmd_adjust_credit_v1(a,op,gen_random_uuid(),repeat('a',64),s,version,1000001,null,'Synthetic grant with explicit non-expiring selection');
 if v->>'status'<>'replayed' then raise exception 'Credit replay failed';end if;
 begin
  perform myeongha_admin_ops.cmd_adjust_credit_v1(a,op,gen_random_uuid(),repeat('b',64),s,version,1000001,null,'Conflict');
  raise exception 'Expected replay conflict';
 exception when unique_violation then null;end;
 begin
  perform myeongha_admin_ops.cmd_adjust_credit_v1(a,'ad150000-0000-4000-8000-000000000002',gen_random_uuid(),repeat('b',64),s,prior_version,1,null,'Stale');
  raise exception 'Expected stale confirmation rejection';
 exception when serialization_failure then null;end;
 select q.version into version from myeongha_admin_ops.qry_credit_adjustment_preview_v1(s) q;
 v:=myeongha_admin_ops.cmd_adjust_credit_v1(a,'ad150000-0000-4000-8000-000000000002',gen_random_uuid(),repeat('b',64),s,version,-25,null,'Synthetic recovery');
 if v->'state'->>'beforeAvailableCredits'<>'1000041' or v->'state'->>'afterAvailableCredits'<>'1000016' then raise exception 'Recovery balance mismatch';end if;
 select q.version into version from myeongha_admin_ops.qry_credit_adjustment_preview_v1(s) q;
 begin
  perform myeongha_admin_ops.cmd_adjust_credit_v1(a,'ad150000-0000-4000-8000-000000000003',gen_random_uuid(),repeat('c',64),s,version,-1000017,null,'Insufficient');
  raise exception 'Expected insufficient balance';
 exception when raise_exception then if SQLERRM<>'Insufficient spendable credits for recovery' then raise;end if;end;
 begin
  perform myeongha_admin_ops.cmd_adjust_credit_v1(a,'ad150000-0000-4000-8000-000000000003',gen_random_uuid(),repeat('c',64),s,version,1,clock_timestamp()-interval '1 day','Expired');
  raise exception 'Expected past expiry rejection';
 exception when raise_exception then if SQLERRM<>'Grant expiry must be in the future' then raise;end if;end;
 begin
  update public.chat_credit_lots_v1 set credits_remaining=0 where subject_id=s;
  raise exception 'Command Executor wrote ledger table';
 exception when insufficient_privilege then null;end;
 if (select count(*) from myeongha_admin_ops.qry_credit_adjustment_history_v1(s))<>2 then raise exception 'Adjustment history/replay mismatch';end if;
 if (select count(*) from myeongha_admin_ops.qry_credit_adjustment_receipt_v1('ad140000-0000-4000-8000-000000000002',op))<>0 then raise exception 'Different actor accessed receipt';end if;
end $$;
reset role;
do $$ declare s uuid:='ad110000-0000-4000-8000-000000000001';res uuid;b bigint;
begin
 if (select sum(credits_delta) from myeongha_admin_ops.credit_adjustment_allocations_v1 where operation_id='ad150000-0000-4000-8000-000000000001')<>1000001 then raise exception 'Grant Lot allocation missing';end if;
 if (select sum(credits_delta) from myeongha_admin_ops.credit_adjustment_allocations_v1 where operation_id='ad150000-0000-4000-8000-000000000002')<>-25 then raise exception 'Recovery Lot allocation mismatch';end if;
 select id into res from public.chat_credit_turn_reservations_v1 where subject_id=s;
 perform public.internal_cmd_chat_credit_finalize_v1(s,res,false,null);
 select available_credits into b from public.internal_qry_chat_credit_balance_v1(s);
 if b<>1000026 then raise exception 'Reservation release corrupted adjusted ledger';end if;
 if exists(select 1 from public.chat_credit_lots_v1 where subject_id=s and (credits_remaining<0 or credits_remaining>credits_issued)) then raise exception 'Ledger invariant broken';end if;
end $$;
-- Failing the atomic audit insert rolls back Lot, allocation and receipt.
revoke insert on myeongha_admin_ops.admin_audit_events_v1 from myeongha_admin_credit_owner;
revoke insert(request_id,actor_auth_user_id,target_ref,action,outcome,occurred_at) on myeongha_admin_ops.admin_audit_events_v1 from myeongha_admin_credit_owner;
set local role myeongha_admin_command_executor;
do $$ declare version text;begin
 select q.version into version from myeongha_admin_ops.qry_credit_adjustment_preview_v1('ad110000-0000-4000-8000-000000000001') q;
 begin
  perform myeongha_admin_ops.cmd_adjust_credit_v1('ad140000-0000-4000-8000-000000000001','ad150000-0000-4000-8000-000000000003',gen_random_uuid(),repeat('c',64),'ad110000-0000-4000-8000-000000000001',version,3,clock_timestamp()+interval '3 days','Must roll back');
  raise exception 'Audit failure incorrectly succeeded';
 exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$ begin
 if exists(select 1 from myeongha_admin_ops.command_receipts_v1 where operation_id='ad150000-0000-4000-8000-000000000003')
  or exists(select 1 from public.chat_credit_lots_v1 where source_ref='ad150000-0000-4000-8000-000000000003') then raise exception 'Audit failure partially applied credit';end if;
 if (select count(*) from myeongha_admin_ops.admin_audit_events_v1 where action='command:credit-adjust' and target_ref='ad110000-0000-4000-8000-000000000001')<>2 then raise exception 'Atomic audit duplicated or missing';end if;
end $$;
set local role myeongha_admin_reader;
do $$ begin
 begin
  perform * from myeongha_admin_ops.qry_credit_adjustment_preview_v1('ad110000-0000-4000-8000-000000000001');
  raise exception 'Reader executed command-only RPC';
 exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
select 'PASS credit grant/recovery/no artificial cap/replay/conflict/stale/shortage/expiry/reservation release/atomic audit/ACL' as result;
