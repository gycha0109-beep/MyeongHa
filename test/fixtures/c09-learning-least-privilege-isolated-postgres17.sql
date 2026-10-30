-- Disposable PostgreSQL 17 ONLY; deliberately NOT an operational policy.
-- Roles are immutable named TEST fixtures, not client-editable session GUCs.
-- Run after prelude, ledger proposal, source-atomic proposal.
create role c09_isolated_subject_a nologin;
create role c09_isolated_subject_b nologin;
grant usage on schema myeongha_internal to c09_isolated_subject_a, c09_isolated_subject_b;
grant select on
  myeongha_internal.character_knowledge_topics_v1,
  myeongha_internal.character_learning_source_approvals_v1,
  myeongha_internal.character_learning_sharing_consents_v1,
  myeongha_internal.character_learning_revocation_approvals_v1,
  myeongha_internal.character_learning_evidence_v1
  to c09_isolated_subject_a,c09_isolated_subject_b;
-- FOR UPDATE/FOR SHARE under SECURITY INVOKER needs UPDATE privilege.
-- Grant only the columns the proposal's functions update or lock; no broad DML.
grant update(revoked_at) on myeongha_internal.character_knowledge_topics_v1 to c09_isolated_subject_a,c09_isolated_subject_b;
grant update(revoked_at) on myeongha_internal.character_learning_source_approvals_v1 to c09_isolated_subject_a,c09_isolated_subject_b;
grant update(state,revision,revoked_at) on myeongha_internal.character_learning_sharing_consents_v1 to c09_isolated_subject_a,c09_isolated_subject_b;
grant update(withdrawn_at) on myeongha_internal.character_learning_revocation_approvals_v1 to c09_isolated_subject_a,c09_isolated_subject_b;
grant insert on myeongha_internal.character_learning_evidence_v1 to c09_isolated_subject_a,c09_isolated_subject_b;
grant update(revoked_at) on myeongha_internal.character_learning_evidence_v1 to c09_isolated_subject_a,c09_isolated_subject_b;

grant execute on function myeongha_internal.c09_issue_learning_evidence_shadow_v1(uuid,uuid,text,text,text,bigint)
  to c09_isolated_subject_a,c09_isolated_subject_b;
grant execute on function myeongha_internal.c09_revoke_learning_evidence_shadow_v1(uuid,uuid,text,bigint)
  to c09_isolated_subject_a,c09_isolated_subject_b;
grant execute on function myeongha_internal.c09_revoke_sharing_consent_shadow_v1(uuid,text,text,bigint)
  to c09_isolated_subject_a,c09_isolated_subject_b;

-- Synthetic fixed per-role Subject mapping. Not a proposed production
-- auth system; there is no SET ROLE capability offered to real app clients.
create policy c09_isolated_topic_policy on myeongha_internal.character_knowledge_topics_v1
  for select to c09_isolated_subject_a,c09_isolated_subject_b
  using (character_id='seyeon' and published_at is not null and revoked_at is null);
create policy c09_isolated_topic_lock on myeongha_internal.character_knowledge_topics_v1
  for update to c09_isolated_subject_a,c09_isolated_subject_b
  using (character_id='seyeon' and published_at is not null and revoked_at is null);
create policy c09_isolated_source_select on myeongha_internal.character_learning_source_approvals_v1
  for select to c09_isolated_subject_a,c09_isolated_subject_b
  using (
    (current_user='c09_isolated_subject_a' and owner_subject_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid)
    or (current_user='c09_isolated_subject_b' and owner_subject_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid)
  );
create policy c09_isolated_source_update on myeongha_internal.character_learning_source_approvals_v1
  for update to c09_isolated_subject_a,c09_isolated_subject_b
  using (
    (current_user='c09_isolated_subject_a' and owner_subject_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid)
    or (current_user='c09_isolated_subject_b' and owner_subject_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid)
  );
create policy c09_isolated_consent_select on myeongha_internal.character_learning_sharing_consents_v1
  for select to c09_isolated_subject_a,c09_isolated_subject_b
  using (
    (current_user='c09_isolated_subject_a' and owner_subject_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid)
    or (current_user='c09_isolated_subject_b' and owner_subject_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid)
  );
create policy c09_isolated_consent_update on myeongha_internal.character_learning_sharing_consents_v1
  for update to c09_isolated_subject_a,c09_isolated_subject_b
  using (
    (current_user='c09_isolated_subject_a' and owner_subject_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid)
    or (current_user='c09_isolated_subject_b' and owner_subject_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid)
  ) with check (
    (current_user='c09_isolated_subject_a' and owner_subject_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid)
    or (current_user='c09_isolated_subject_b' and owner_subject_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid)
  );
create policy c09_isolated_evidence_select on myeongha_internal.character_learning_evidence_v1
  for select to c09_isolated_subject_a,c09_isolated_subject_b
  using (
    visibility='character_shared' or
    (visibility='user_private' and
       ((current_user='c09_isolated_subject_a' and subject_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid)
       or (current_user='c09_isolated_subject_b' and subject_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid)))
  );
create policy c09_isolated_evidence_insert on myeongha_internal.character_learning_evidence_v1
  for insert to c09_isolated_subject_a,c09_isolated_subject_b
  with check (
    exists (select 1 from myeongha_internal.character_learning_source_approvals_v1 s
            where s.source_ref=authority_ref and
              ((current_user='c09_isolated_subject_a' and s.owner_subject_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid)
               or (current_user='c09_isolated_subject_b' and s.owner_subject_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid)))
  );
create policy c09_isolated_evidence_update on myeongha_internal.character_learning_evidence_v1
  for update to c09_isolated_subject_a,c09_isolated_subject_b
  using (
    exists (select 1 from myeongha_internal.character_learning_source_approvals_v1 s
            where s.source_ref=authority_ref and
              ((current_user='c09_isolated_subject_a' and s.owner_subject_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid)
               or (current_user='c09_isolated_subject_b' and s.owner_subject_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid)))
  );
create policy c09_isolated_revoke_select on myeongha_internal.character_learning_revocation_approvals_v1
  for select to c09_isolated_subject_a,c09_isolated_subject_b
  using (
    (current_user='c09_isolated_subject_a' and owner_subject_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid)
    or (current_user='c09_isolated_subject_b' and owner_subject_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid)
  );
create policy c09_isolated_revoke_update on myeongha_internal.character_learning_revocation_approvals_v1
  for update to c09_isolated_subject_a,c09_isolated_subject_b
  using (
    (current_user='c09_isolated_subject_a' and owner_subject_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid)
    or (current_user='c09_isolated_subject_b' and owner_subject_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid)
  );

insert into myeongha_internal.character_knowledge_topics_v1
(character_id,topic_key,policy_version,authority_source_ref,domain_policy,baseline,published_at)
values('seyeon','python.programming','fixture-v1','fixture:canon','bounded','explicit_unaware',now());

insert into myeongha_internal.character_learning_source_approvals_v1
(source_ref,owner_subject_id,character_id,topic_key,source_kind,awareness,visibility,
 approval_ref,approved_at,source_verification_ref,verified_at,learned_at,valid_at,
 privacy_review_ref,privacy_reviewed_at,sharing_consent_ref,deidentified_for_sharing)
values
('fixture:src:A','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','seyeon','python.programming',
 'user_taught_verified','heard_of','character_shared','fixture:approval:A',now(),
 'fixture:verified:A',now()-interval '1 hour',now()-interval '1 day',
 now()-interval '1 day','fixture:privacy:A',now(),'fixture:consent:A',true),
('fixture:src:B','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','seyeon','python.programming',
 'user_taught_verified','basic','user_private','fixture:approval:B',now(),
 'fixture:verified:B',now()-interval '1 hour',now()-interval '1 day',
 now()-interval '1 day',null,null,null,false);

insert into myeongha_internal.character_learning_sharing_consents_v1
(consent_ref,source_ref,owner_subject_id,topic_key,state,revision,verified_at)
values ('fixture:consent:A','fixture:src:A','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'python.programming','active',1,now()-interval '1 hour');

-- Role B cannot read the source approval of A, even if it supplies A's UUID.
set role c09_isolated_subject_b;
do $$
declare blocked boolean := false;
begin
  if exists (select 1 from myeongha_internal.character_learning_source_approvals_v1
             where source_ref='fixture:src:A') then raise exception 'C09_B_SEES_A_SOURCE'; end if;
  begin
    perform myeongha_internal.c09_issue_learning_evidence_shadow_v1(
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','fixture:src:A',
      'fixture:approval:A','fixture:consent:A',1);
  exception when others then blocked := true;
  end;
  if not blocked then raise exception 'C09_B_CAN_ISSUE_AS_A'; end if;
end $$;
reset role;

set role c09_isolated_subject_a;
do $$
begin
  perform myeongha_internal.c09_issue_learning_evidence_shadow_v1(
    '11111111-1111-4111-8111-111111111111',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','fixture:src:A',
    'fixture:approval:A','fixture:consent:A',1);
end $$;
reset role;

set role c09_isolated_subject_b;
do $$
begin
  perform myeongha_internal.c09_issue_learning_evidence_shadow_v1(
    '22222222-2222-4222-8222-222222222222',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','fixture:src:B',
    'fixture:approval:B',null,null);
end $$;
reset role;

insert into myeongha_internal.character_learning_revocation_approvals_v1
(revocation_ref,evidence_id,source_ref,owner_subject_id,state,revision,approved_at)
values ('fixture:revoke:B','22222222-2222-4222-8222-222222222222',
        'fixture:src:B','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','approved',1,now());

set role c09_isolated_subject_a;
do $$
declare blocked boolean := false;
begin
  if exists (select 1 from myeongha_internal.character_learning_evidence_v1
             where id='22222222-2222-4222-8222-222222222222') then
    raise exception 'C09_A_SEES_B_PRIVATE_EVIDENCE';
  end if;
  begin
    perform myeongha_internal.c09_revoke_learning_evidence_shadow_v1(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      '22222222-2222-4222-8222-222222222222',
      'fixture:revoke:B',1);
  exception when others then blocked := true;
  end;
  if not blocked then raise exception 'C09_A_CAN_REVOKE_B'; end if;
  if (select count(*) from myeongha_internal.character_learning_evidence_v1) <> 1 then
    raise exception 'C09_A_SHARED_COUNT_UNEXPECTED';
  end if;
end $$;
reset role;

set role c09_isolated_subject_b;
do $$
begin
  perform myeongha_internal.c09_revoke_learning_evidence_shadow_v1(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    '22222222-2222-4222-8222-222222222222','fixture:revoke:B',1);
end $$;
reset role;

set role c09_isolated_subject_a;
do $$
begin
  if myeongha_internal.c09_revoke_sharing_consent_shadow_v1(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'fixture:src:A','fixture:consent:A',1) <> 1 then
    raise exception 'C09_CONSENT_REVOCATION_COUNT';
  end if;
end $$;
reset role;

do $$
begin
  if exists (select 1 from myeongha_internal.character_learning_evidence_v1 where revoked_at is null)
  then raise exception 'C09_ISOLATED_REVOCATION_LEFT_ACTIVE_EVIDENCE'; end if;
  if has_function_privilege('anon','myeongha_internal.c09_issue_learning_evidence_shadow_v1(uuid,uuid,text,text,text,bigint)','EXECUTE')
  then raise exception 'C09_PUBLIC_FUNCTION_EXPOSED'; end if;
end $$;
select 'C09_ISOLATED_LEAST_PRIVILEGE_RLS_PASS' as result;
