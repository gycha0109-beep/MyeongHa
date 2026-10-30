-- Disposable PostgreSQL only. Do not run against Production.
-- The prepared SQL command authorizer is not a production write authority.
insert into myeongha_internal.character_learning_evidence_v1 (
  id, character_id, topic_key, source_kind, authority_ref, awareness,
  visibility, subject_id, approved_for_character_sharing, privacy_reviewed_at,
  privacy_review_ref, sharing_consent_ref, approval_ref, verified_at, learned_at, valid_at
) values (
  '88888888-8888-4888-8888-888888888888', 'seyeon', 'python.programming',
  'user_taught_verified', 'fixture:consented:source', 'heard_of',
  'character_shared', null, true, now(),
  'fixture:privacy:approved', 'fixture:sharing:consented', 'fixture:operator:approved',
  now(), now() - interval '1 day', now() - interval '1 day'
);

do $$
begin
  if not exists (
    select 1 from myeongha_internal.character_learning_evidence_v1
    where id = '88888888-8888-4888-8888-888888888888'
      and sharing_consent_ref = 'fixture:sharing:consented'
  ) then
    raise exception 'C09_CONSENTED_ISSUE_MISSING';
  end if;
end $$;

do $$
begin
  begin
    insert into myeongha_internal.character_learning_evidence_v1 (
      id, character_id, topic_key, source_kind, authority_ref, awareness,
      visibility, subject_id, approved_for_character_sharing, privacy_reviewed_at,
      privacy_review_ref, sharing_consent_ref, approval_ref, verified_at, learned_at, valid_at
    ) values (
      '99999999-9999-4999-8999-999999999999', 'seyeon', 'python.programming',
      'user_taught_verified', 'fixture:without:consent', 'heard_of',
      'character_shared', null, true, now(),
      'fixture:privacy:approved', null, 'fixture:operator:approved',
      now(), now() - interval '1 day', now() - interval '1 day'
    );
    raise exception 'C09_UNCONSENTED_LEARNING_ADMITTED';
  exception
    when check_violation then null;
  end;
end $$;

update myeongha_internal.character_learning_evidence_v1
  set revoked_at = now()
  where id = '88888888-8888-4888-8888-888888888888'
    and character_id = 'seyeon'
    and authority_ref = 'fixture:consented:source'
    and revoked_at is null;

do $$
begin
  if exists (
    select 1 from myeongha_internal.character_learning_evidence_v1
    where id = '88888888-8888-4888-8888-888888888888'
      and revoked_at is null
  ) then
    raise exception 'C09_REVOKED_EVIDENCE_STILL_ACTIVE';
  end if;
end $$;

select 'C09_LEARNING_PUBLICATION_CONSENT_REVOCATION_ISOLATED_PASS' as result;
