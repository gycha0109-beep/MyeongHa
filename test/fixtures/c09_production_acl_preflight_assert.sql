-- Synthetic fixtures only.
do $$
begin
  if not has_column_privilege('myeongha_api_executor','public.conversation_messages','body_text','SELECT')
    or has_column_privilege('myeongha_api_executor','public.conversation_messages','message_payload_jsonb','SELECT')
    or has_table_privilege('anon','public.conversation_messages','SELECT')
    or has_table_privilege('myeongha_api_executor','myeongha_internal.character_learning_source_approvals_v1','INSERT')
    or has_table_privilege('myeongha_api_executor','myeongha_internal.character_learning_evidence_v1','UPDATE')
    or has_function_privilege('myeongha_api_executor',
      'myeongha_internal.c09_issue_learning_evidence_shadow_v1(uuid,uuid,text,text,text,bigint)','EXECUTE')
    or has_function_privilege('authenticated',
      'myeongha_internal.c09_revoke_sharing_consent_shadow_v1(uuid,text,text,bigint)','EXECUTE')
  then raise exception 'C09_ACL_PRELIGHT_FAILED'; end if;
end $$;
set role myeongha_api_executor;
set myeongha.subject_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
do $$
declare count_rows bigint;
begin
  select count(*) into count_rows from public.conversation_messages;
  if count_rows <> 1 then raise exception 'C09_A_READ_SCOPE_FAIL %',count_rows;end if;
  if (select count(*) from public.conversation_messages where subject_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') <> 0 then
     raise exception 'C09_CROSS_SUBJECT_READ';end if;
end $$;
set myeongha.subject_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
do $$
begin
 if (select count(*) from public.conversation_messages) <> 1 then
   raise exception 'C09_B_READ_SCOPE_FAIL';end if;
end $$;
reset role;
select 'C09_PRODUCTION_MIGRATION_ISOLATED_PREFLIGHT_PASS' as result;
