\set ON_ERROR_STOP on
-- Disposable integration verification; all fixtures and temporary ACL changes roll back.
begin;
do $$ begin
 if current_database() not in ('admin_presentation_disposable','myeongha_admin_disposable') then
  raise exception 'Only an explicitly disposable local admin DB may run these tests';
 end if;
end $$;
set local role myeongha_admin_command_executor;
do $$
declare v jsonb; n integer;
begin
 v:=myeongha_admin_ops.cmd_save_presentation_v1(
 '123e4567-e89b-42d3-a456-426614174000','123e4567-e89b-42d3-a456-426614174001','123e4567-e89b-42d3-a456-426614174002',repeat('a',64),
 '123e4567-e89b-42d3-a456-426614174003',0,'notice','테스트 공지','표현 정보','/hall.html','draft',null,null,'격리 테스트');
 if v->>'status'<>'succeeded' or (v->'state'->>'revision')::integer<>1 then raise exception 'First save failed';end if;
 v:=myeongha_admin_ops.cmd_save_presentation_v1(
 '123e4567-e89b-42d3-a456-426614174000','123e4567-e89b-42d3-a456-426614174001','123e4567-e89b-42d3-a456-426614174002',repeat('a',64),
 '123e4567-e89b-42d3-a456-426614174003',0,'notice','테스트 공지','표현 정보','/hall.html','draft',null,null,'격리 테스트');
 if v->>'status'<>'replayed' then raise exception 'Same operation did not replay';end if;
 select count(*) into n from myeongha_admin_ops.qry_presentation_history_v1('123e4567-e89b-42d3-a456-426614174003');
 if n<>1 then raise exception 'Replay duplicated history';end if;
 begin
  perform myeongha_admin_ops.cmd_save_presentation_v1(
   '123e4567-e89b-42d3-a456-426614174000','123e4567-e89b-42d3-a456-426614174001','123e4567-e89b-42d3-a456-426614174002',repeat('b',64),
   '123e4567-e89b-42d3-a456-426614174003',0,'notice','변경 요청','표현 정보','/hall.html','draft',null,null,'격리 테스트');
  raise exception 'Idempotency conflict unexpectedly succeeded';
 exception when unique_violation then null;end;
 begin
  perform myeongha_admin_ops.cmd_save_presentation_v1(
   '123e4567-e89b-42d3-a456-426614174000','123e4567-e89b-42d3-a456-426614174004','123e4567-e89b-42d3-a456-426614174005',repeat('c',64),
   '123e4567-e89b-42d3-a456-426614174003',0,'notice','오래된 버전','표현 정보','/hall.html','draft',null,null,'격리 테스트');
  raise exception 'Stale version unexpectedly succeeded';
 exception when serialization_failure then null;end;
 begin
  update myeongha_admin_ops.presentation_entries_v1 set status='published';
  raise exception 'Direct table update unexpectedly succeeded';
 exception when insufficient_privilege then null;end;
 perform myeongha_admin_ops.cmd_save_presentation_v1(
 '123e4567-e89b-42d3-a456-426614174000','123e4567-e89b-42d3-a456-426614174006','123e4567-e89b-42d3-a456-426614174007',repeat('d',64),
 '123e4567-e89b-42d3-a456-426614174003',1,'notice','예약 공지','표현 정보','/hall.html','published',now()+interval '1 day',now()+interval '2 days','예약 테스트');
end $$;
reset role;
do $$ begin
 if exists(select 1 from myeongha_admin_ops.qry_visible_presentations_v1()) then raise exception 'Future publication leaked';end if;
end $$;
set local role myeongha_admin_command_executor;
select myeongha_admin_ops.cmd_save_presentation_v1(
 '123e4567-e89b-42d3-a456-426614174000','123e4567-e89b-42d3-a456-426614174008','123e4567-e89b-42d3-a456-426614174009',repeat('e',64),
 '123e4567-e89b-42d3-a456-426614174003',2,'banner','게시 배너','표현 정보','/hall.html','published',now()-interval '1 day',now()+interval '1 day','게시 테스트');
reset role;
set local role myeongha_api_executor;
do $$ declare v jsonb;begin
 select entry into v from myeongha_admin_ops.qry_visible_presentations_v1() where entry->>'entryId'='123e4567-e89b-42d3-a456-426614174003';
 if v->>'title'<>'게시 배너' or v ? 'reason' or v ? 'actorAuthUserId' then raise exception 'Published projection invalid';end if;
 begin
  perform * from myeongha_admin_ops.qry_presentation_history_v1('123e4567-e89b-42d3-a456-426614174003');
  raise exception 'Public execution role accessed private history';
 exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$ begin
 if (select count(*) from myeongha_admin_ops.admin_audit_events_v1 where action='command:presentation-save' and target_ref='123e4567-e89b-42d3-a456-426614174003')<>3 then raise exception 'Atomic audit count invalid';end if;
end $$;
-- A failed atomic audit insert must roll back the publication and its receipt.
revoke insert on myeongha_admin_ops.admin_audit_events_v1 from myeongha_admin_presentation_owner;
-- Column grants must also be revoked for the negative test.
revoke insert(request_id,actor_auth_user_id,target_ref,action,outcome,occurred_at) on myeongha_admin_ops.admin_audit_events_v1 from myeongha_admin_presentation_owner;
set local role myeongha_admin_command_executor;
do $$ begin
 begin
  perform myeongha_admin_ops.cmd_save_presentation_v1(
   '123e4567-e89b-42d3-a456-426614174000','123e4567-e89b-42d3-a456-426614174010','123e4567-e89b-42d3-a456-426614174011',repeat('f',64),
   '123e4567-e89b-42d3-a456-426614174003',3,'banner','실패해야 하는 변경','표현 정보','/hall.html','draft',null,null,'감사 실패 테스트');
  raise exception 'Audit failure did not roll back';
 exception when insufficient_privilege then null;end;
 if exists(select 1 from myeongha_admin_ops.qry_admin_command_receipt_v1('123e4567-e89b-42d3-a456-426614174000','123e4567-e89b-42d3-a456-426614174010')) then raise exception 'Failed command receipt persisted';end if;
end $$;
reset role;
do $$ begin
 if (select revision from myeongha_admin_ops.presentation_entries_v1 where id='123e4567-e89b-42d3-a456-426614174003')<>3 then raise exception 'Failed command changed current content';end if;
end $$;
rollback;
select 'PASS presentation atomic save/replay/conflict/schedule/history/audit failure/ACL' as result;
