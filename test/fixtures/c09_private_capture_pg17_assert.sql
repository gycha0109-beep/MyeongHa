-- Execute after bootstrap -> C09 ledger -> source atomic -> capture proposal.
-- Every UUID and opt-in here is a synthetic fixture only.
grant usage on schema myeongha_internal to c09_capture_subject_a,c09_capture_subject_b;
grant select on public.conversation_messages to c09_capture_subject_a,c09_capture_subject_b;
grant update(redacted_at) on public.conversation_messages to c09_capture_subject_a,c09_capture_subject_b;
grant select on myeongha_internal.character_knowledge_topics_v1,
  myeongha_internal.character_learning_private_optin_receipts_v1
  to c09_capture_subject_a,c09_capture_subject_b;
grant update(revoked_at) on myeongha_internal.character_knowledge_topics_v1
  to c09_capture_subject_a,c09_capture_subject_b;
grant update(state) on myeongha_internal.character_learning_private_optin_receipts_v1
  to c09_capture_subject_a,c09_capture_subject_b;
grant insert, select on
  myeongha_internal.character_learning_source_approvals_v1,
  myeongha_internal.character_learning_source_capture_audit_v1
  to c09_capture_subject_a,c09_capture_subject_b;
grant execute on function myeongha_internal.c09_capture_private_approved_source_shadow_v1(
  text,uuid,uuid,text,text,text,timestamptz,timestamptz)
  to c09_capture_subject_a,c09_capture_subject_b;
grant execute on function myeongha_internal.c09_verify_private_source_current_shadow_v1(uuid,text)
  to c09_capture_subject_a,c09_capture_subject_b;
grant execute on function public.assert_myeongha_subject_context_v1(uuid)
  to c09_capture_subject_a,c09_capture_subject_b;

create policy c09_capture_topic_read on myeongha_internal.character_knowledge_topics_v1
  for select to c09_capture_subject_a,c09_capture_subject_b using
  (character_id='seyeon' and revoked_at is null);
create policy c09_capture_topic_lock on myeongha_internal.character_knowledge_topics_v1
  for update to c09_capture_subject_a,c09_capture_subject_b using
  (character_id='seyeon' and revoked_at is null);
create policy c09_capture_action_a on myeongha_internal.character_learning_private_optin_receipts_v1
  for select to c09_capture_subject_a using
  (subject_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid);
create policy c09_capture_action_b on myeongha_internal.character_learning_private_optin_receipts_v1
  for select to c09_capture_subject_b using
  (subject_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid);
create policy c09_capture_action_lock_a on myeongha_internal.character_learning_private_optin_receipts_v1
  for update to c09_capture_subject_a using
  (subject_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid);
create policy c09_capture_action_lock_b on myeongha_internal.character_learning_private_optin_receipts_v1
  for update to c09_capture_subject_b using
  (subject_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid);
create policy c09_capture_source_a on myeongha_internal.character_learning_source_approvals_v1
  for insert to c09_capture_subject_a with check
  (owner_subject_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid and visibility='user_private');
create policy c09_capture_source_b on myeongha_internal.character_learning_source_approvals_v1
  for insert to c09_capture_subject_b with check
  (owner_subject_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid and visibility='user_private');
create policy c09_capture_source_read_a on myeongha_internal.character_learning_source_approvals_v1
  for select to c09_capture_subject_a using
  (owner_subject_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid);
create policy c09_capture_source_read_b on myeongha_internal.character_learning_source_approvals_v1
  for select to c09_capture_subject_b using
  (owner_subject_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid);
create policy c09_capture_audit_a on myeongha_internal.character_learning_source_capture_audit_v1
  for insert to c09_capture_subject_a with check
  (owner_subject_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid);
create policy c09_capture_audit_b on myeongha_internal.character_learning_source_capture_audit_v1
  for insert to c09_capture_subject_b with check
  (owner_subject_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid);
create policy c09_capture_audit_read_a on myeongha_internal.character_learning_source_capture_audit_v1
  for select to c09_capture_subject_a using
  (owner_subject_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid);
create policy c09_capture_audit_read_b on myeongha_internal.character_learning_source_capture_audit_v1
  for select to c09_capture_subject_b using
  (owner_subject_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid);

insert into myeongha_internal.character_knowledge_topics_v1
 (character_id,topic_key,policy_version,authority_source_ref,domain_policy,baseline,published_at)
values ('seyeon','python.programming','synthetic','synthetic:canon','bounded','explicit_unaware',
 clock_timestamp()-interval '1 day');

insert into public.conversation_messages
 (id,subject_id,thread_id,sender_type,content_hash,body_text,created_at,redacted_at)
values
 ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '99999999-9999-4999-8999-999999999999','user','hash-a','synthetic user fact',
  clock_timestamp()-interval '2 hours',null),
 ('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  '99999999-9999-4999-8999-999999999998','user','hash-b','different synthetic fact',
  clock_timestamp()-interval '2 hours',null),
 ('33333333-3333-4333-8333-333333333333','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '99999999-9999-4999-8999-999999999999','user','hash-redacted','secret',
  clock_timestamp()-interval '2 hours',clock_timestamp()-interval '1 hour'),
 ('44444444-4444-4444-8444-444444444444','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '99999999-9999-4999-8999-999999999999','character','hash-character','synthetic reply',
  clock_timestamp()-interval '2 hours',null),
 ('55555555-5555-4555-8555-555555555555','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '99999999-9999-4999-8999-999999999999','user','hash-has-no-action','synthetic',
  clock_timestamp()-interval '2 hours',null);

-- These are externally issued fake action receipts for DB tests, not claimed real opt-ins.
insert into myeongha_internal.character_learning_private_optin_receipts_v1
 (action_ref,subject_id,original_message_id,original_content_hash,state,verified_at,withdrawn_at)
values
 ('fixture:private-optin:A','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '11111111-1111-4111-8111-111111111111','hash-a','approved',clock_timestamp()-interval '1 hour',null),
 ('fixture:private-optin:B','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  '22222222-2222-4222-8222-222222222222','hash-b','approved',clock_timestamp()-interval '1 hour',null),
 ('fixture:private-optin:redacted','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '33333333-3333-4333-8333-333333333333','hash-redacted','approved',clock_timestamp()-interval '1 hour',null),
 ('fixture:private-optin:character','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '44444444-4444-4444-8444-444444444444','hash-character','approved',clock_timestamp()-interval '1 hour',null);

set role c09_capture_subject_a;
do $$
declare
  rejected boolean;
  src text;
begin
  rejected := false;
  begin
    perform myeongha_internal.c09_capture_private_approved_source_shadow_v1(
      'c09:conversation:22222222-2222-4222-8222-222222222222',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      '22222222-2222-4222-8222-222222222222',
      'fixture:private-optin:B','python.programming','heard_of',
      clock_timestamp()-interval '2 hours',clock_timestamp()-interval '1 hour');
  exception when others then rejected := true;
  end;
  if not rejected then raise exception 'C09_FORGED_SUBJECT_CAPTURED';end if;

  rejected := false;
  begin
    perform myeongha_internal.c09_capture_private_approved_source_shadow_v1(
      'c09:conversation:55555555-5555-4555-8555-555555555555',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '55555555-5555-4555-8555-555555555555',
      'fixture:missing-action','python.programming','heard_of',
      clock_timestamp()-interval '2 hours',clock_timestamp()-interval '1 hour');
  exception when others then rejected := true;
  end;
  if not rejected then raise exception 'C09_MISSING_USER_ACTION_CAPTURED';end if;

  rejected := false;
  begin
    perform myeongha_internal.c09_capture_private_approved_source_shadow_v1(
      'c09:conversation:33333333-3333-4333-8333-333333333333',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '33333333-3333-4333-8333-333333333333',
      'fixture:private-optin:redacted','python.programming','heard_of',
      clock_timestamp()-interval '2 hours',clock_timestamp()-interval '1 hour');
  exception when others then rejected := true;
  end;
  if not rejected then raise exception 'C09_REDACTED_SOURCE_CAPTURED';end if;

  rejected := false;
  begin
    perform myeongha_internal.c09_capture_private_approved_source_shadow_v1(
      'c09:conversation:44444444-4444-4444-8444-444444444444',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '44444444-4444-4444-8444-444444444444',
      'fixture:private-optin:character','python.programming','heard_of',
      clock_timestamp()-interval '2 hours',clock_timestamp()-interval '1 hour');
  exception when others then rejected := true;
  end;
  if not rejected then raise exception 'C09_CHARACTER_REPLY_AS_USER_SOURCE';end if;

  src := myeongha_internal.c09_capture_private_approved_source_shadow_v1(
    'c09:conversation:11111111-1111-4111-8111-111111111111',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '11111111-1111-4111-8111-111111111111',
    'fixture:private-optin:A','python.programming','heard_of',
    clock_timestamp()-interval '2 hours',clock_timestamp()-interval '1 hour');
  if src <> 'c09:conversation:11111111-1111-4111-8111-111111111111' then
    raise exception 'C09_CAPTURE_RETURN_MISMATCH';
  end if;
  if not myeongha_internal.c09_verify_private_source_current_shadow_v1(
       'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',src) then
    raise exception 'C09_APPROVED_SOURCE_CURRENT_VERIFICATION_FAILED';
  end if;

  if (select count(*) from myeongha_internal.character_learning_source_capture_audit_v1)<>1
     or (select count(*) from myeongha_internal.character_learning_source_approvals_v1)<>1 then
    raise exception 'C09_PRIVATE_CAPTURE_AUDIT_NOT_ATOMIC';
  end if;

  rejected := false;
  begin
    perform myeongha_internal.c09_capture_private_approved_source_shadow_v1(
      'c09:conversation:11111111-1111-4111-8111-111111111111',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '11111111-1111-4111-8111-111111111111',
      'fixture:private-optin:A','python.programming','heard_of',
      clock_timestamp()-interval '2 hours',clock_timestamp()-interval '1 hour');
  exception when others then rejected := true;
  end;
  if not rejected then raise exception 'C09_DUPLICATE_CAPTURE_ADMITTED';end if;
end $$;
reset role;

set role c09_capture_subject_b;
do $$
declare
  rejected boolean := false;
begin
  if exists(select 1 from myeongha_internal.character_learning_source_capture_audit_v1) then
    raise exception 'C09_OTHER_SUBJECT_AUDIT_VISIBLE';
  end if;
  begin
    perform myeongha_internal.c09_capture_private_approved_source_shadow_v1(
      'c09:conversation:11111111-1111-4111-8111-111111111111',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      '11111111-1111-4111-8111-111111111111',
      'fixture:private-optin:A','python.programming','heard_of',
      clock_timestamp()-interval '2 hours',clock_timestamp()-interval '1 hour');
  exception when others then rejected := true;
  end;
  if not rejected then raise exception 'C09_B_CAN_CAPTURE_A';end if;
end $$;
reset role;

-- A later explicit opt-in withdrawal MUST remove current authority even
-- if the historical source approval and audit rows remain unchanged.
update myeongha_internal.character_learning_private_optin_receipts_v1
set state='withdrawn', withdrawn_at=clock_timestamp()
where action_ref='fixture:private-optin:A';
set role c09_capture_subject_a;
do $$
begin
  if myeongha_internal.c09_verify_private_source_current_shadow_v1(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'c09:conversation:11111111-1111-4111-8111-111111111111') then
    raise exception 'C09_WITHDRAWN_OPTIN_STILL_VALID';
  end if;
end $$;
reset role;

-- Restoring synthetic action alone must not restore authority when the
-- original user message was subsequently redacted.
update myeongha_internal.character_learning_private_optin_receipts_v1
set state='approved', withdrawn_at=null
where action_ref='fixture:private-optin:A';
update public.conversation_messages set redacted_at=clock_timestamp()
where id='11111111-1111-4111-8111-111111111111';
set role c09_capture_subject_a;
do $$
begin
  if myeongha_internal.c09_verify_private_source_current_shadow_v1(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'c09:conversation:11111111-1111-4111-8111-111111111111') then
    raise exception 'C09_REDACTED_ORIGINAL_STILL_VALID';
  end if;
end $$;
reset role;

do $$
begin
  if has_schema_privilege('anon','myeongha_internal','USAGE') or
     has_table_privilege('authenticated',
       'myeongha_internal.character_learning_private_optin_receipts_v1','SELECT') or
     has_function_privilege('anon',
       'myeongha_internal.c09_capture_private_approved_source_shadow_v1(text,uuid,uuid,text,text,text,timestamptz,timestamptz)','EXECUTE') then
    raise exception 'C09_PRIVATE_CAPTURE_PUBLIC_ESCAPE';
  end if;
  if (select count(*) from myeongha_internal.character_learning_evidence_v1) <> 0 then
    raise exception 'C09_CAPTURE_ISSUED_LEARNING_WITHOUT_ACTIVATION';
  end if;
end $$;

select 'C09_APPROVED_PRIVATE_ORIGINAL_AUDIT_ISOLATED_PASS' as result;
