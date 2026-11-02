-- Disposable-only nonempty fixture. Every change is rolled back.
begin;
insert into myeongha_admin_ops.admin_audit_events_v1(request_id,actor_auth_user_id,target_ref,action,outcome,occurred_at) values
 ('123e4567-e89b-42d3-a456-426614174100',null,null,'test:audit','allowed',clock_timestamp()-interval '366 days'),
 ('123e4567-e89b-42d3-a456-426614174101',null,null,'test:audit','denied',clock_timestamp()-interval '364 days'),
 ('123e4567-e89b-42d3-a456-426614174102',null,null,'test:audit','failed',clock_timestamp()-interval '366 days'),
 ('123e4567-e89b-42d3-a456-426614174103',null,null,'test:audit','allowed',clock_timestamp()-interval '366 days'),
 ('123e4567-e89b-42d3-a456-426614174104',null,null,'test:audit','allowed',clock_timestamp()-interval '366 days');
insert into myeongha_admin_ops.admin_audit_retention_holds_v1(request_id,hold_until,authority_key) values
 ('123e4567-e89b-42d3-a456-426614174102',null,'test-indefinite-legal-hold'),
 ('123e4567-e89b-42d3-a456-426614174103',clock_timestamp()+interval '1 day','test-longer-authority'),
 ('123e4567-e89b-42d3-a456-426614174104',clock_timestamp()-interval '1 day','test-released-hold');
set local role myeongha_admin_audit_writer;
do $$ begin
 begin
  delete from myeongha_admin_ops.admin_audit_events_v1 where false;
  raise exception 'Audit writer acquired DELETE';
 exception when insufficient_privilege then null;end;
 begin
  perform * from myeongha_admin_ops.cmd_purge_expired_admin_audit_v1(100);
  raise exception 'Audit writer acquired maintenance RPC';
 exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role myeongha_admin_retention_executor;
do $$ declare n integer;begin
 begin
  perform * from myeongha_admin_ops.cmd_purge_expired_admin_audit_v1(1001);
  raise exception 'Unbounded retention batch accepted';
 exception when raise_exception then if sqlerrm<>'Invalid audit purge bound' then raise;end if;end;
 select deleted into n from myeongha_admin_ops.cmd_purge_expired_admin_audit_v1(1000);
 if n<>2 then raise exception 'Wrong expiration deletion count: %',n;end if;
 begin
  delete from myeongha_admin_ops.admin_audit_events_v1 where false;
  raise exception 'Maintenance executor acquired table DELETE';
 exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$ begin
 if exists(select 1 from myeongha_admin_ops.admin_audit_events_v1 where request_id in ('123e4567-e89b-42d3-a456-426614174100','123e4567-e89b-42d3-a456-426614174104')) then raise exception 'Expired unheld record retained';end if;
 if (select count(*) from myeongha_admin_ops.admin_audit_events_v1 where request_id in ('123e4567-e89b-42d3-a456-426614174101','123e4567-e89b-42d3-a456-426614174102','123e4567-e89b-42d3-a456-426614174103'))<>3 then raise exception 'Unexpired or held record deleted';end if;
 if not exists(select 1 from myeongha_admin_ops.admin_audit_events_v1 where action='maintenance:audit-purge' and expires_at>=occurred_at+interval '31536000 seconds') then raise exception 'Cleanup not atomically audited';end if;
end $$;
-- A cleanup that cannot append its own audit must not remove an expired event.
insert into myeongha_admin_ops.admin_audit_events_v1(request_id,action,outcome,occurred_at) values
 ('123e4567-e89b-42d3-a456-426614174105','test:audit','allowed',clock_timestamp()-interval '366 days');
revoke insert(request_id,actor_auth_user_id,target_ref,action,outcome,occurred_at) on myeongha_admin_ops.admin_audit_events_v1 from myeongha_admin_retention_owner;
set local role myeongha_admin_retention_executor;
do $$ begin
 begin
  perform * from myeongha_admin_ops.cmd_purge_expired_admin_audit_v1(1000);
  raise exception 'Unlogged cleanup succeeded';
 exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$ begin
 if not exists(select 1 from myeongha_admin_ops.admin_audit_events_v1 where request_id='123e4567-e89b-42d3-a456-426614174105') then raise exception 'Audit failure did not roll back cleanup';end if;
end $$;
rollback;
select 'PASS audit 365-day minimum, legal holds, bounded cleanup, role separation and atomic cleanup audit' as result;
