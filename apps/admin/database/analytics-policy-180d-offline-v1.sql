-- OFFLINE / approval-required upgrade for an existing analytics candidate.
-- Scoped exclusively to product analytics; Commerce P5Y evidence is untouched.
begin;
update myeongha_admin_analytics.events_v1
 set expires_at=least(expires_at,occurred_at+interval '15552000 seconds')
 where expires_at>occurred_at+interval '15552000 seconds';
do $$ begin
 if not exists(select 1 from pg_constraint where conrelid='myeongha_admin_analytics.events_v1'::regclass and conname='analytics_events_retention_180d_v1') then
  alter table myeongha_admin_analytics.events_v1 add constraint analytics_events_retention_180d_v1 check(expires_at<=occurred_at+interval '15552000 seconds');
 end if;
end $$;
commit;
