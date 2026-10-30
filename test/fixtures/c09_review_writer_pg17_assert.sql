-- Disposable PG17 writer authorization + replay + negatives.
do $$
begin
 if not exists (select 1 from pg_roles where rolname='c09_original_review_writer'
   and not rolcanlogin and not rolbypassrls and not rolinherit)
 or pg_has_role('myeongha_api_executor','c09_original_review_writer','MEMBER')
 or has_function_privilege('myeongha_api_executor',
    'myeongha_internal.c09_issue_original_review_shadow_v1(uuid,uuid,text,text,text,text,text,text,timestamptz,timestamptz)',
    'EXECUTE')
 or has_function_privilege('anon',
    'myeongha_internal.c09_issue_original_review_shadow_v1(uuid,uuid,text,text,text,text,text,text,timestamptz,timestamptz)',
    'EXECUTE')
 or has_table_privilege('myeongha_api_executor',
    'myeongha_internal.character_learning_original_reviews_v1','INSERT')
 or has_table_privilege('c09_original_review_writer',
    'myeongha_internal.character_learning_original_reviews_v1','UPDATE')
 or has_table_privilege('c09_original_review_writer',
    'myeongha_internal.character_learning_original_reviews_v1','DELETE') then
  raise exception 'C09_REVIEW_WRITER_PRIVILEGE_FAILURE';
 end if;
end $$;

set role c09_original_review_writer;
do $$
declare
  r text;
  r2 text;
  t_learned timestamptz := now()-interval '1 day';
  t_valid timestamptz := now()-interval '12 hours';
  rejected boolean;
begin
  r := myeongha_internal.c09_issue_original_review_shadow_v1(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '11111111-1111-4111-8111-111111111111',
    'original-a','c09-review:issued:A','python.programming','basic',
    'synthetic:reviewer-attestation-1','synthetic:policy-1',
    t_learned,t_valid);
  if r<>'c09-review:issued:A' then
    raise exception 'C09_REVIEW_ISSUE_FAILURE';
  end if;
  r2 := myeongha_internal.c09_issue_original_review_shadow_v1(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '11111111-1111-4111-8111-111111111111',
    'original-a','c09-review:issued:A','python.programming','basic',
    'synthetic:reviewer-attestation-1','synthetic:policy-1',
    t_learned,t_valid);
  if r2<>r or (select count(*) from myeongha_internal.character_learning_original_reviews_v1)<>1 then
    raise exception 'C09_REVIEW_REPLAY_DEDUP_FAILURE';
  end if;

  rejected := false;
  begin
    perform myeongha_internal.c09_issue_original_review_shadow_v1(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '11111111-1111-4111-8111-111111111111',
      'original-a','c09-review:issued:A','python.programming','proficient',
      'synthetic:reviewer-attestation-1','synthetic:policy-1',
      t_learned,t_valid);
  exception when unique_violation then rejected := true;
  end;
  if not rejected then raise exception 'C09_REVIEW_CONFLICT_ACCEPTED'; end if;

  rejected := false;
  begin
    perform myeongha_internal.c09_issue_original_review_shadow_v1(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      '22222222-2222-4222-8222-222222222222',
      'original-b','c09-review:issued:B','python.programming','basic',
      'synthetic:reviewer-attestation-1','synthetic:policy-1',
      t_learned,t_valid);
  exception when insufficient_privilege then rejected := true;
  end;
  if not rejected then raise exception 'C09_CROSS_SUBJECT_REVIEW_ACCEPTED'; end if;

  rejected := false;
  begin
    perform myeongha_internal.c09_issue_original_review_shadow_v1(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '11111111-1111-4111-8111-111111111111',
      'forged-message-hash','c09-review:other','python.programming','basic',
      'synthetic:reviewer-attestation-1','synthetic:policy-1',
      t_learned,t_valid);
  exception when insufficient_privilege then rejected := true;
  end;
  if not rejected then raise exception 'C09_HASH_FORGERY_ACCEPTED'; end if;

  rejected := false;
  begin
    update public.conversation_messages set redacted_at=now()
    where id='11111111-1111-4111-8111-111111111111';
  exception when insufficient_privilege or with_check_option_violation then rejected := true;
  end;
  if not rejected then raise exception 'C09_DIRECT_MESSAGE_UPDATE_ACCEPTED'; end if;

  rejected := false;
  begin
    update myeongha_internal.character_knowledge_topics_v1 set revoked_at=now()
    where character_id='seyeon' and topic_key='python.programming';
  exception when insufficient_privilege or with_check_option_violation then rejected := true;
  end;
  if not rejected then raise exception 'C09_DIRECT_TOPIC_UPDATE_ACCEPTED'; end if;

  if (select count(*) from myeongha_internal.character_learning_original_reviews_v1)<>1 then
    raise exception 'C09_WRITER_UNEXPECTED_REVIEW_ROWS';
  end if;
end $$;
reset role;
select 'C09_REVIEW_WRITER_ISOLATED_PG17_PASS' as result;
