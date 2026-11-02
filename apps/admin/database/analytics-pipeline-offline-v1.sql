-- OFFLINE CANDIDATE ONLY. No migration/Production authority.
-- Product-owner policy: product analytics only, 180 elapsed days from occurred_at.
-- Never applies to retained Commerce evidence or backups. Requires consent, deletion binding,
-- event registry versions and complete observation-source declarations first.
begin;
create schema if not exists myeongha_admin_analytics;
revoke all on schema myeongha_admin_analytics from public;
create table myeongha_admin_analytics.consents_v1 (
  visitor_ref text not null check(visitor_ref ~ '^av_[0-9a-f]{64}$'),
  version text not null check(version ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$'),
  policy_version text not null check(policy_version ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$'),
  subject_link_ref text null check(subject_link_ref is null or subject_link_ref ~ '^ah_[0-9a-f]{64}$'),
  granted_at timestamptz not null default clock_timestamp(),
  withdrawn_at timestamptz null,
  expires_at timestamptz not null,
  primary key(visitor_ref,version),
  check(expires_at>granted_at)
);
create index analytics_consent_subject_deletion_v1 on myeongha_admin_analytics.consents_v1(subject_link_ref) where subject_link_ref is not null;
create table myeongha_admin_analytics.events_v1 (
  event_id uuid primary key,
  event_name text not null check(event_name in (
    'LANDING_VIEWED','ENTERED_HALL','CHARACTER_SELECTED','BIRTH_RECORD_STARTED','BIRTH_RECORD_COMPLETED',
    'FIRST_READING_DELIVERED','MEMORY_PROPOSED','MEMORY_ACCEPTED','RELATIONSHIP_STAGE_CHANGED','READING_PURCHASED','RETURN_PUSH_OPENED',
    'VISIT_STARTED','PAGE_VIEWED','SIGNUP_STARTED','SIGNUP_COMPLETED','PRODUCT_VIEWED','CHECKOUT_STARTED','PAYMENT_FAILED',
    'READING_STARTED','READING_COMPLETED','READING_FAILED','RESULT_VIEWED','SATISFACTION_SUBMITTED','REFUND_COMPLETED','MAJOR_COMPLAINT_RECORDED')),
  event_schema_version text not null check(event_schema_version='admin-analytics-pipeline-v1'),
  visitor_ref text not null,
  session_ref text not null check(session_ref ~ '^as_[0-9a-f]{64}$'),
  client text not null check(client in ('web','ios','android','server')),
  authority text not null check(authority in ('client_intent','server_verified')),
  consent_version text not null,
  policy_version text not null,
  valid_visitor boolean not null,
  paid_purchase boolean null,
  occurred_at timestamptz not null,
  received_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  product_key text null check(product_key is null or product_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$'),
  page_key text null check(page_key is null or page_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$'),
  campaign_key text null check(campaign_key is null or campaign_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$'),
  channel_key text null check(channel_key is null or channel_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$'),
  purchase_ref text null check(purchase_ref is null or purchase_ref ~ '^ap_[0-9a-f]{64}$'),
  score integer null check(score between 1 and 5),
  event_fingerprint text not null check(event_fingerprint ~ '^[0-9a-f]{64}$'),
  foreign key(visitor_ref,consent_version) references myeongha_admin_analytics.consents_v1(visitor_ref,version) on delete cascade,
  check(expires_at>occurred_at),
  constraint analytics_events_retention_180d_v1 check(expires_at<=occurred_at+interval '15552000 seconds'),
  check(authority<>'server_verified' or client='server'),
  check(event_name not in ('READING_PURCHASED','REFUND_COMPLETED') or (authority='server_verified' and purchase_ref is not null)),
  check(event_name<>'SATISFACTION_SUBMITTED' or (score is not null and purchase_ref is not null))
);
create index analytics_events_period_v1 on myeongha_admin_analytics.events_v1(occurred_at,event_id);
create index analytics_events_expiry_v1 on myeongha_admin_analytics.events_v1(expires_at);
create index analytics_events_visitor_v1 on myeongha_admin_analytics.events_v1(visitor_ref,consent_version);
alter table myeongha_admin_analytics.consents_v1 enable row level security;
alter table myeongha_admin_analytics.consents_v1 force row level security;
alter table myeongha_admin_analytics.events_v1 enable row level security;
alter table myeongha_admin_analytics.events_v1 force row level security;
revoke all on all tables in schema myeongha_admin_analytics from public;
do $$ begin
  if not exists(select 1 from pg_roles where rolname='myeongha_analytics_writer') then
    create role myeongha_analytics_writer login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
  end if;
  if not exists(select 1 from pg_roles where rolname='myeongha_analytics_writer' and rolcanlogin and not rolinherit and not rolsuper and not rolbypassrls and not rolcreaterole and not rolcreatedb and not rolreplication
    and not exists(select 1 from pg_auth_members where member=pg_roles.oid)) then
    raise exception 'Analytics writer privilege drift';
  end if;
end $$;
grant usage on schema myeongha_admin_analytics to myeongha_analytics_writer,myeongha_admin_reader;
grant select,insert,delete on myeongha_admin_analytics.events_v1 to myeongha_analytics_writer;
grant select,insert,delete on myeongha_admin_analytics.consents_v1 to myeongha_analytics_writer;
grant update(withdrawn_at) on myeongha_admin_analytics.consents_v1 to myeongha_analytics_writer;
grant select(visitor_ref,version,withdrawn_at,expires_at) on myeongha_admin_analytics.consents_v1 to myeongha_admin_reader;
grant select(event_id,event_name,event_schema_version,visitor_ref,session_ref,client,authority,consent_version,policy_version,
  valid_visitor,paid_purchase,occurred_at,expires_at,product_key,page_key,campaign_key,channel_key,purchase_ref,score)
  on myeongha_admin_analytics.events_v1 to myeongha_admin_reader;
create policy analytics_writer_consent_v1 on myeongha_admin_analytics.consents_v1 for all to myeongha_analytics_writer using(true) with check(true);
create policy analytics_writer_event_v1 on myeongha_admin_analytics.events_v1 for all to myeongha_analytics_writer using(true) with check(true);
create policy analytics_reader_consent_v1 on myeongha_admin_analytics.consents_v1 for select to myeongha_admin_reader using(withdrawn_at is null and expires_at>CURRENT_TIMESTAMP);
create policy analytics_reader_event_v1 on myeongha_admin_analytics.events_v1 for select to myeongha_admin_reader using(expires_at>CURRENT_TIMESTAMP);
commit;
