-- Synthetic fixture only; run after the candidate plus 180-day upgrade. Rolls back.
begin;
set local role myeongha_analytics_writer;
insert into myeongha_admin_analytics.consents_v1(visitor_ref,version,policy_version,subject_link_ref,expires_at)
values('av_'||repeat('e',64),'retention-fixture-v1','product-analytics-180d-v1','ah_'||repeat('e',64),current_timestamp+interval '15552000 seconds');
insert into myeongha_admin_analytics.events_v1(event_id,event_name,event_schema_version,visitor_ref,session_ref,client,authority,consent_version,policy_version,valid_visitor,occurred_at,expires_at,event_fingerprint)
values('123e4567-e89b-42d3-a456-426614174901','PRODUCT_VIEWED','admin-analytics-pipeline-v1','av_'||repeat('e',64),'as_'||repeat('e',64),'web','client_intent','retention-fixture-v1','product-analytics-180d-v1',true,current_timestamp-interval '15552000 seconds',current_timestamp,repeat('e',64)),
('123e4567-e89b-42d3-a456-426614174902','PRODUCT_VIEWED','admin-analytics-pipeline-v1','av_'||repeat('e',64),'as_'||repeat('e',64),'web','client_intent','retention-fixture-v1','product-analytics-180d-v1',true,current_timestamp,current_timestamp+interval '15552000 seconds',repeat('f',64));
do $$ begin
 begin
  insert into myeongha_admin_analytics.events_v1(event_id,event_name,event_schema_version,visitor_ref,session_ref,client,authority,consent_version,policy_version,valid_visitor,occurred_at,expires_at,event_fingerprint)
  values('123e4567-e89b-42d3-a456-426614174903','PRODUCT_VIEWED','admin-analytics-pipeline-v1','av_'||repeat('e',64),'as_'||repeat('e',64),'web','client_intent','retention-fixture-v1','product-analytics-180d-v1',true,current_timestamp,current_timestamp+interval '15552001 seconds',repeat('d',64));
  raise exception 'Retention longer than 180 days accepted';
 exception when check_violation then null;end;
end $$;
set local role myeongha_admin_reader;
do $$ begin
 if (select count(*) from myeongha_admin_analytics.events_v1 where visitor_ref='av_'||repeat('e',64))<>1 then raise exception 'Expired event visible through RLS';end if;
 begin
  delete from myeongha_admin_analytics.events_v1 where visitor_ref='av_'||repeat('e',64);
  raise exception 'Reader deleted analytics';
 exception when insufficient_privilege then null;end;
end $$;
set local role myeongha_analytics_writer;
do $$ declare v_deleted int; begin
 with gone as(delete from myeongha_admin_analytics.events_v1 where visitor_ref='av_'||repeat('e',64) and expires_at<=current_timestamp returning event_id) select count(*) into v_deleted from gone;
 if v_deleted<>1 then raise exception 'TTL boundary cleanup failed';end if;
 delete from myeongha_admin_analytics.consents_v1 where subject_link_ref='ah_'||repeat('e',64);
 if exists(select 1 from myeongha_admin_analytics.events_v1 where visitor_ref='av_'||repeat('e',64)) then raise exception 'Subject erasure did not cascade';end if;
end $$;
rollback;
select 'PASS analytics exact 180d cap, expiry RLS, cleanup, Subject cascade and Reader write denial' as result;
