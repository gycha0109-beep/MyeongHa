-- Approved 2026-10-30: limited read-only authority, zero write activation.
-- The existing executor role is server-only; public Data API roles are not granted.
-- The source/consent/approval ledgers have no authoring privileges yet.
create policy c09_topics_api_current_read_v1
  on myeongha_internal.character_knowledge_topics_v1
  for select to myeongha_api_executor
  using (character_id = 'seyeon' and published_at is not null and revoked_at is null);

create policy c09_learning_evidence_api_current_read_v1
  on myeongha_internal.character_learning_evidence_v1
  for select to myeongha_api_executor
  using (
    revoked_at is null and
    superseded_at is null and
    ((visibility = 'user_private' and subject_id = public.current_myeongha_subject_id())
      or
     (visibility = 'character_shared' and approved_for_character_sharing
      and privacy_reviewed_at is not null and privacy_review_ref is not null))
  );

create policy c09_approved_sources_api_current_read_v1
  on myeongha_internal.character_learning_source_approvals_v1
  for select to myeongha_api_executor
  using (
    owner_subject_id = public.current_myeongha_subject_id()
    and revoked_at is null
    and approved_at <= clock_timestamp()
    and verified_at <= clock_timestamp()
    and valid_at <= clock_timestamp()
  );

create policy c09_sharing_consents_api_current_read_v1
  on myeongha_internal.character_learning_sharing_consents_v1
  for select to myeongha_api_executor
  using (owner_subject_id = public.current_myeongha_subject_id());

create policy c09_revocation_approvals_api_current_read_v1
  on myeongha_internal.character_learning_revocation_approvals_v1
  for select to myeongha_api_executor
  using (owner_subject_id = public.current_myeongha_subject_id());

grant usage on schema myeongha_internal to myeongha_api_executor;
grant select on
  myeongha_internal.character_knowledge_topics_v1,
  myeongha_internal.character_learning_evidence_v1,
  myeongha_internal.character_learning_source_approvals_v1,
  myeongha_internal.character_learning_sharing_consents_v1,
  myeongha_internal.character_learning_revocation_approvals_v1
to myeongha_api_executor;

-- Never grant INSERT, UPDATE, DELETE, owner privileges or RPC EXECUTE.
-- SECURITY INVOKER functions remain unusable by the normal API executor.
