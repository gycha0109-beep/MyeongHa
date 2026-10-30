-- Run after C09 review proposal against the disposable PG17 fixture.
insert into myeongha_internal.character_learning_original_reviews_v1
 (review_ref,owner_subject_id,original_message_id,original_content_hash,
  character_id,topic_key,awareness,visibility,state,reviewer_ref,review_policy_ref,
  learned_at,valid_at,reviewed_at)
values
 ('review:A','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '11111111-1111-4111-8111-111111111111','original-a',
  'seyeon','python.programming','basic','user_private','approved',
  'synthetic:independent-reviewer','synthetic:review-policy',
  now()-interval '2 days',now()-interval '1 day',now()-interval '6 hours'),
 ('review:B','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  '22222222-2222-4222-8222-222222222222','original-b',
  'seyeon','python.programming','basic','user_private','approved',
  'synthetic:independent-reviewer','synthetic:review-policy',
  now()-interval '2 days',now()-interval '1 day',now()-interval '6 hours');

do $$
begin
 if not has_table_privilege('myeongha_api_executor',
   'myeongha_internal.character_learning_original_reviews_v1','SELECT')
 or has_table_privilege('myeongha_api_executor',
   'myeongha_internal.character_learning_original_reviews_v1','INSERT')
 or has_table_privilege('myeongha_api_executor',
   'myeongha_internal.character_learning_original_reviews_v1','UPDATE')
 or has_table_privilege('anon',
   'myeongha_internal.character_learning_original_reviews_v1','SELECT')
 or has_table_privilege('authenticated',
   'myeongha_internal.character_learning_original_reviews_v1','SELECT') then
  raise exception 'C09_ORIGINAL_REVIEW_ACL_FAILED';
 end if;
 if not exists (
   select 1 from pg_class
   where oid='myeongha_internal.character_learning_original_reviews_v1'::regclass
   and relrowsecurity and relforcerowsecurity
 ) then
  raise exception 'C09_ORIGINAL_REVIEW_RLS_FAILED';
 end if;
end $$;

set role myeongha_api_executor;
do $$
declare a_count int; b_count int;
begin
 select count(*) into a_count
 from myeongha_internal.character_learning_original_reviews_v1
 where owner_subject_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid;
 select count(*) into b_count
 from myeongha_internal.character_learning_original_reviews_v1
 where owner_subject_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid;
 if a_count<>1 or b_count<>0 then
  raise exception 'C09_ORIGINAL_REVIEW_SUBJECT_ISOLATION_FAILED A=% B=%',a_count,b_count;
 end if;
end $$;
reset role;

-- A revoked original cannot remain readable under the approved Subject role.
update myeongha_internal.character_learning_original_reviews_v1
set state='revoked',revoked_at=clock_timestamp()
where review_ref='review:A';
set role myeongha_api_executor;
do $$
begin
 if (select count(*) from myeongha_internal.character_learning_original_reviews_v1
     where state='approved' and revoked_at is null)<>0 then
  raise exception 'C09_ORIGINAL_REVIEW_REVOKED_PROOF_FAILED';
 end if;
end $$;
reset role;
select 'C09_ORIGINAL_REVIEW_ISOLATED_PG17_PASS' as result;
