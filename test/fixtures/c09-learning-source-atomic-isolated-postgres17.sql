-- Disposable PostgreSQL 17 only; never run on MyeongHa production.
-- Requires prelude -> learning ledger proposal -> atomic source proposal.
insert into myeongha_internal.character_knowledge_topics_v1 (
  character_id,topic_key,policy_version,authority_source_ref,domain_policy,baseline,published_at
) values ('seyeon','python.programming','synthetic-policy','fixture:canon','bounded','explicit_unaware',now());

insert into myeongha_internal.character_learning_source_approvals_v1 (
  source_ref,owner_subject_id,character_id,topic_key,source_kind,awareness,
  visibility,approval_ref,approved_at,source_verification_ref,
  verified_at,learned_at,valid_at,privacy_review_ref,privacy_reviewed_at,
  sharing_consent_ref,deidentified_for_sharing
) values (
  'fixture:shared:A','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','seyeon','python.programming',
  'user_taught_verified','heard_of','character_shared','fixture:approval:A',
  now(),'fixture:source-verified:A',now()-interval '1 hour',
  now()-interval '1 day',now()-interval '1 day',
  'fixture:privacy:A',now(),'fixture:consent:A',true
), (
  'fixture:private:A','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','seyeon','python.programming',
  'user_taught_verified','basic','user_private','fixture:approval:private:A',
  now(),'fixture:source-verified:private:A',now()-interval '1 hour',
  now()-interval '1 day',now()-interval '1 day',null,null,null,false
);

insert into myeongha_internal.character_learning_sharing_consents_v1 (
  consent_ref,source_ref,owner_subject_id,topic_key,state,revision,verified_at
) values (
  'fixture:consent:A','fixture:shared:A','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'python.programming','active',1,now()
);

do $$
declare
  result_id uuid;
  rejected boolean;
begin
  -- Reject a forged Subject and a stale or mismatched consent revision.
  rejected := false;
  begin
    perform myeongha_internal.c09_issue_learning_evidence_shadow_v1(
      '11111111-1111-4111-8111-111111111111',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'fixture:shared:A','fixture:approval:A','fixture:consent:A',1);
  exception when others then rejected := true;
  end;
  if not rejected then raise exception 'C09_FORGED_OWNER_ADMITTED'; end if;

  rejected := false;
  begin
    perform myeongha_internal.c09_issue_learning_evidence_shadow_v1(
      '11111111-1111-4111-8111-111111111111',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'fixture:shared:A','fixture:approval:A','fixture:consent:A',0);
  exception when others then rejected := true;
  end;
  if not rejected then raise exception 'C09_STALE_CONSENT_ADMITTED'; end if;

  -- The issue itself verifies source and consent under row locks.
  result_id := myeongha_internal.c09_issue_learning_evidence_shadow_v1(
    '11111111-1111-4111-8111-111111111111',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'fixture:shared:A','fixture:approval:A','fixture:consent:A',1);
  if result_id::text <> '11111111-1111-4111-8111-111111111111' or
     not exists (select 1 from myeongha_internal.character_learning_evidence_v1
                  where id = result_id and subject_id is null
                    and sharing_consent_ref='fixture:consent:A'
                    and revoked_at is null) then
    raise exception 'C09_ATOMIC_SHARED_ISSUE_FAILED';
  end if;

  result_id := myeongha_internal.c09_issue_learning_evidence_shadow_v1(
    '22222222-2222-4222-8222-222222222222',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'fixture:private:A','fixture:approval:private:A',null,null);
  if not exists (select 1 from myeongha_internal.character_learning_evidence_v1
                 where id=result_id and subject_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
                   and sharing_consent_ref is null and visibility='user_private') then
    raise exception 'C09_ATOMIC_PRIVATE_ISSUE_FAILED';
  end if;
end $$;

insert into myeongha_internal.character_learning_revocation_approvals_v1 (
  revocation_ref,evidence_id,source_ref,owner_subject_id,state,revision,approved_at
) values (
  'fixture:revoke:private:A','22222222-2222-4222-8222-222222222222',
  'fixture:private:A','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','approved',1,now()
);

do $$
declare
  rejected boolean;
  revoked_id uuid;
  count_changed bigint;
begin
  rejected := false;
  begin
    perform myeongha_internal.c09_revoke_learning_evidence_shadow_v1(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      '22222222-2222-4222-8222-222222222222',
      'fixture:revoke:private:A',1);
  exception when others then rejected := true;
  end;
  if not rejected then raise exception 'C09_FOREIGN_REVOCATION_ADMITTED'; end if;

  rejected := false;
  begin
    perform myeongha_internal.c09_revoke_learning_evidence_shadow_v1(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '22222222-2222-4222-8222-222222222222',
      'fixture:revoke:private:A',2);
  exception when others then rejected := true;
  end;
  if not rejected then raise exception 'C09_STALE_REVOCATION_ADMITTED'; end if;

  revoked_id := myeongha_internal.c09_revoke_learning_evidence_shadow_v1(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '22222222-2222-4222-8222-222222222222',
    'fixture:revoke:private:A',1);
  if not exists (select 1 from myeongha_internal.character_learning_evidence_v1
                 where id=revoked_id and revoked_at is not null) then
    raise exception 'C09_PRIVATE_REVOCATION_FAILED';
  end if;

  count_changed := myeongha_internal.c09_revoke_sharing_consent_shadow_v1(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'fixture:shared:A','fixture:consent:A',1);
  if count_changed <> 1 or
     not exists (select 1 from myeongha_internal.character_learning_sharing_consents_v1
                   where consent_ref='fixture:consent:A'
                     and state='revoked' and revision=2) or
     not exists (select 1 from myeongha_internal.character_learning_evidence_v1
                   where authority_ref='fixture:shared:A' and revoked_at is not null) then
    raise exception 'C09_ATOMIC_CONSENT_REVOKE_FAILED';
  end if;

  rejected := false;
  begin
    perform myeongha_internal.c09_issue_learning_evidence_shadow_v1(
      '33333333-3333-4333-8333-333333333333',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'fixture:shared:A','fixture:approval:A','fixture:consent:A',2);
  exception when others then rejected := true;
  end;
  if not rejected then raise exception 'C09_ISSUE_AFTER_REVOKE_ADMITTED'; end if;
end $$;

-- All permissions are deny by default, including new private functions.
do $$
begin
  if has_schema_privilege('anon','myeongha_internal','USAGE') or
     has_table_privilege('authenticated',
       'myeongha_internal.character_learning_source_approvals_v1','SELECT') or
     has_function_privilege('anon',
       'myeongha_internal.c09_issue_learning_evidence_shadow_v1(uuid,uuid,text,text,text,bigint)','EXECUTE') or
     has_function_privilege('authenticated',
       'myeongha_internal.c09_revoke_sharing_consent_shadow_v1(uuid,text,text,bigint)','EXECUTE') then
    raise exception 'C09_ATOMIC_SOURCE_PUBLIC_ACCESS';
  end if;
end $$;

select 'C09_ATOMIC_SOURCE_ISSUE_REVOKE_ISOLATED_PASS' as result;
