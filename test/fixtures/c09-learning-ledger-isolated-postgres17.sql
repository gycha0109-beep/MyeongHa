-- Only for disposable local PostgreSQL 17.
-- This is not production RLS policy or a deployed migration.
create role c09_isolated_reader nologin;
grant usage on schema myeongha_internal to c09_isolated_reader;
grant select on myeongha_internal.character_knowledge_topics_v1 to c09_isolated_reader;
grant select on myeongha_internal.character_learning_evidence_v1 to c09_isolated_reader;

insert into myeongha_internal.character_knowledge_topics_v1
  (character_id,topic_key,policy_version,authority_source_ref,domain_policy,baseline,published_at)
values
  ('seyeon','python.programming','synthetic-v1','fixture:canon','bounded','explicit_unaware',now());

insert into myeongha_internal.character_learning_evidence_v1
  (id,character_id,topic_key,source_kind,authority_ref,awareness,visibility,subject_id,
   approved_for_character_sharing,privacy_reviewed_at,privacy_review_ref,
   approval_ref,verified_at,learned_at,valid_at)
values
  ('11111111-1111-4111-8111-111111111111','seyeon','python.programming','public_verified',
   'fixture:shared:1','heard_of','character_shared',null,true,now(),'fixture:review:1',
   'fixture:approval:1',now(),now()-interval '1 day',now()-interval '1 day'),
  ('22222222-2222-4222-8222-222222222222','seyeon','python.programming','user_taught_verified',
   'fixture:private:A','basic','user_private','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   false,null,null,'fixture:approval:A',now(),now()-interval '1 day',now()-interval '1 day'),
  ('33333333-3333-4333-8333-333333333333','seyeon','python.programming','user_taught_verified',
   'fixture:private:B','basic','user_private','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
   false,null,null,'fixture:approval:B',now(),now()-interval '1 day',now()-interval '1 day');

-- Bare SELECT grants + FORCE RLS without policy must expose ZERO records.
set role c09_isolated_reader;
do $$
begin
  if (select count(*) from myeongha_internal.character_knowledge_topics_v1) <> 0 or
     (select count(*) from myeongha_internal.character_learning_evidence_v1) <> 0 then
    raise exception 'C09_RLS_DENY_DEFAULT_FAILED';
  end if;
end $$;
reset role;

-- This subject filter is a TEST-ONLY synthetic policy, never a model for
-- production authentication; custom GUCs are user-editable.
create policy c09_isolated_read_topic on myeongha_internal.character_knowledge_topics_v1
  for select to c09_isolated_reader using (true);
create policy c09_isolated_read_evidence on myeongha_internal.character_learning_evidence_v1
  for select to c09_isolated_reader
  using (visibility='character_shared' or
         (visibility='user_private' and subject_id::text = current_setting('app.c09_test_subject',true)));

set role c09_isolated_reader;
set app.c09_test_subject = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
do $$
begin
  if (select count(*) from myeongha_internal.character_learning_evidence_v1) <> 2 then
    raise exception 'C09_A_SCOPE_COUNT_FAILED';
  end if;
  if exists (select 1 from myeongha_internal.character_learning_evidence_v1
              where authority_ref = 'fixture:private:B') then
    raise exception 'C09_A_SEES_B_PRIVATE_EVIDENCE';
  end if;
end $$;
set app.c09_test_subject = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
do $$
begin
  if (select count(*) from myeongha_internal.character_learning_evidence_v1) <> 2 then
    raise exception 'C09_B_SCOPE_COUNT_FAILED';
  end if;
  if exists (select 1 from myeongha_internal.character_learning_evidence_v1
              where authority_ref = 'fixture:private:A') then
    raise exception 'C09_B_SEES_A_PRIVATE_EVIDENCE';
  end if;
end $$;
reset role;

update myeongha_internal.character_learning_evidence_v1
set revoked_at = now()
where authority_ref = 'fixture:shared:1';

set role c09_isolated_reader;
set app.c09_test_subject = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
do $$
begin
  if (select count(*) from myeongha_internal.character_learning_evidence_v1
       where revoked_at is null) <> 1 then
    raise exception 'C09_REVOKED_RECORD_ADMITTED';
  end if;
end $$;
reset role;

-- Assert constraints reject missing shared privacy review.
do $$
begin
  begin
    insert into myeongha_internal.character_learning_evidence_v1
      (id,character_id,topic_key,source_kind,authority_ref,awareness,visibility,subject_id,
       approved_for_character_sharing,approval_ref,verified_at,learned_at,valid_at)
    values
      ('44444444-4444-4444-8444-444444444444','seyeon','python.programming','user_taught_verified',
       'fixture:bad:shared','heard_of','character_shared',null,true,
       'fixture:approval:bad',now(),now(),now());
    raise exception 'C09_MISSING_REVIEW_ACCEPTED';
  exception
    when check_violation then null;
  end;
end $$;

-- No PUBLIC exposure and no direct anon/authenticated SELECT.
do $$
begin
  if has_schema_privilege('anon','myeongha_internal','USAGE') or
     has_table_privilege('anon','myeongha_internal.character_learning_evidence_v1','SELECT') or
     has_table_privilege('authenticated','myeongha_internal.character_learning_evidence_v1','SELECT') then
    raise exception 'C09_PUBLIC_ACCESS_OPEN';
  end if;
end $$;

select 'C09_ISOLATED_POSTGRES17_PROPOSAL_PASS' as result;
