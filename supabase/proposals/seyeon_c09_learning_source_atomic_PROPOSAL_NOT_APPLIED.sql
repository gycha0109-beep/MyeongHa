-- PROPOSAL ONLY. NEVER APPLY TO PRODUCTION WITHOUT SEPARATE DB/ACL/RLS APPROVAL.
-- Requires seyeon_c09_learning_ledger_schema_PROPOSAL_NOT_APPLIED.sql first.
-- No GRANT, no SECURITY DEFINER, no production routing.
begin;

create table myeongha_internal.character_learning_source_approvals_v1 (
  source_ref text primary key,
  owner_subject_id uuid not null,
  character_id text not null,
  topic_key text not null,
  source_kind text not null,
  awareness text not null,
  visibility text not null,
  approval_ref text not null,
  approved_at timestamptz not null,
  source_verification_ref text not null,
  verified_at timestamptz not null,
  learned_at timestamptz not null,
  valid_at timestamptz not null,
  privacy_review_ref text,
  privacy_reviewed_at timestamptz,
  sharing_consent_ref text,
  deidentified_for_sharing boolean not null default false,
  revoked_at timestamptz,
  constraint c09_source_topic_fk foreign key (character_id, topic_key)
    references myeongha_internal.character_knowledge_topics_v1(character_id, topic_key),
  constraint c09_source_kind check (source_kind in
    ('canon','approved_character_fact','user_taught_verified','public_verified','experience')),
  constraint c09_source_awareness check (awareness in ('heard_of','basic','practiced','proficient')),
  constraint c09_source_visibility check (visibility in ('user_private','character_shared')),
  constraint c09_source_time check
    (learned_at <= verified_at and learned_at <= valid_at and
     verified_at <= approved_at and (revoked_at is null or revoked_at >= approved_at)),
  constraint c09_source_scope check (
    (visibility='user_private' and sharing_consent_ref is null and
       privacy_review_ref is null and privacy_reviewed_at is null)
    or
    (visibility='character_shared' and sharing_consent_ref is not null and
       privacy_review_ref is not null and privacy_reviewed_at is not null and
       deidentified_for_sharing = true)
  ),
  constraint c09_source_nonempty check (
    length(btrim(source_ref)) > 0 and length(btrim(approval_ref)) > 0 and
    length(btrim(source_verification_ref)) > 0)
);

create table myeongha_internal.character_learning_sharing_consents_v1 (
  consent_ref text primary key,
  source_ref text not null references myeongha_internal.character_learning_source_approvals_v1(source_ref),
  owner_subject_id uuid not null,
  topic_key text not null,
  state text not null check (state in ('active','revoked')),
  revision bigint not null check (revision > 0),
  verified_at timestamptz not null,
  revoked_at timestamptz,
  constraint c09_consent_state check (
    (state='active' and revoked_at is null) or
    (state='revoked' and revoked_at is not null and revoked_at >= verified_at)
  )
);

create table myeongha_internal.character_learning_revocation_approvals_v1 (
  revocation_ref text primary key,
  evidence_id uuid not null unique references myeongha_internal.character_learning_evidence_v1(id),
  source_ref text not null references myeongha_internal.character_learning_source_approvals_v1(source_ref),
  owner_subject_id uuid not null,
  state text not null check (state in ('approved','withdrawn')),
  revision bigint not null check (revision > 0),
  approved_at timestamptz not null,
  withdrawn_at timestamptz,
  constraint c09_revocation_state check (
    (state='approved' and withdrawn_at is null) or
    (state='withdrawn' and withdrawn_at is not null and withdrawn_at >= approved_at)
  )
);

alter table myeongha_internal.character_learning_source_approvals_v1 enable row level security;
alter table myeongha_internal.character_learning_source_approvals_v1 force row level security;
alter table myeongha_internal.character_learning_sharing_consents_v1 enable row level security;
alter table myeongha_internal.character_learning_sharing_consents_v1 force row level security;
alter table myeongha_internal.character_learning_revocation_approvals_v1 enable row level security;
alter table myeongha_internal.character_learning_revocation_approvals_v1 force row level security;

revoke all on myeongha_internal.character_learning_source_approvals_v1 from public, anon, authenticated;
revoke all on myeongha_internal.character_learning_sharing_consents_v1 from public, anon, authenticated;
revoke all on myeongha_internal.character_learning_revocation_approvals_v1 from public, anon, authenticated;

-- No source publication function here: verification/approval authoring is separately gated.
-- This function assumes the caller's canonical Subject was resolved and pinned
-- by the server; p_subject_id is NOT safe as public/client input.
-- SECURITY INVOKER enforces the database caller's ACL and RLS.
create function myeongha_internal.c09_issue_learning_evidence_shadow_v1(
  p_evidence_id uuid,
  p_subject_id uuid,
  p_source_ref text,
  p_approval_ref text,
  p_consent_ref text,
  p_expected_consent_revision bigint
) returns uuid
language plpgsql security invoker
set search_path = pg_catalog, myeongha_internal
as $$
declare
  s myeongha_internal.character_learning_source_approvals_v1%rowtype;
  c myeongha_internal.character_learning_sharing_consents_v1%rowtype;
  t myeongha_internal.character_knowledge_topics_v1%rowtype;
  clock_time timestamptz := clock_timestamp();
begin
  select * into strict s
  from myeongha_internal.character_learning_source_approvals_v1
  where source_ref = p_source_ref and owner_subject_id = p_subject_id
  for update;

  if s.character_id <> 'seyeon' or s.approval_ref <> p_approval_ref or
     s.approved_at > clock_time or s.verified_at > clock_time or
     s.valid_at > clock_time or s.revoked_at is not null then
    raise exception 'C09_SOURCE_NOT_APPROVED' using errcode='P0001';
  end if;

  select * into strict t
  from myeongha_internal.character_knowledge_topics_v1
  where character_id = s.character_id and topic_key = s.topic_key
  for share;
  if t.published_at is null or t.published_at > clock_time or t.revoked_at is not null then
    raise exception 'C09_TOPIC_NOT_PUBLISHED' using errcode='P0001';
  end if;

  if s.visibility = 'character_shared' then
    if s.sharing_consent_ref is null or s.privacy_review_ref is null or
       s.privacy_reviewed_at is null or not s.deidentified_for_sharing or
       p_consent_ref is distinct from s.sharing_consent_ref or
       p_expected_consent_revision is null then
      raise exception 'C09_SHARE_NOT_APPROVED' using errcode='P0001';
    end if;
    select * into strict c
    from myeongha_internal.character_learning_sharing_consents_v1
    where consent_ref = p_consent_ref
    for update;
    if c.source_ref <> s.source_ref or c.owner_subject_id <> p_subject_id or
       c.topic_key <> s.topic_key or c.state <> 'active' or
       c.revoked_at is not null or c.verified_at > clock_time or
       c.revision <> p_expected_consent_revision then
      raise exception 'C09_CONSENT_NOT_ACTIVE' using errcode='P0001';
    end if;
  elsif p_consent_ref is not null or p_expected_consent_revision is not null then
    raise exception 'C09_PRIVATE_CANNOT_SHARE' using errcode='P0001';
  end if;

  insert into myeongha_internal.character_learning_evidence_v1 (
    id, character_id, topic_key, source_kind, authority_ref, awareness,
    visibility, subject_id, approved_for_character_sharing,
    privacy_reviewed_at, privacy_review_ref, sharing_consent_ref,
    approval_ref, verified_at, learned_at, valid_at
  ) values (
    p_evidence_id, s.character_id, s.topic_key, s.source_kind, s.source_ref, s.awareness,
    s.visibility, case when s.visibility = 'user_private' then p_subject_id else null end,
    s.visibility = 'character_shared',
    s.privacy_reviewed_at, s.privacy_review_ref, s.sharing_consent_ref,
    s.approval_ref, s.verified_at, s.learned_at, s.valid_at
  );
  return p_evidence_id;
end;
$$;

-- An atomic source consent revocation invalidates every derived shared
-- character evidence row *before the transaction commits*.
-- Caller must provide pinned canonical owner Subject from the server.
create function myeongha_internal.c09_revoke_sharing_consent_shadow_v1(
  p_subject_id uuid,
  p_source_ref text,
  p_consent_ref text,
  p_expected_revision bigint
) returns bigint
language plpgsql security invoker
set search_path = pg_catalog, myeongha_internal
as $$
declare
  c myeongha_internal.character_learning_sharing_consents_v1%rowtype;
  affected bigint;
  changed_at timestamptz := clock_timestamp();
begin
  select * into strict c
  from myeongha_internal.character_learning_sharing_consents_v1
  where consent_ref = p_consent_ref for update;
  if c.owner_subject_id <> p_subject_id or c.source_ref <> p_source_ref or
     c.state <> 'active' or c.revision <> p_expected_revision then
    raise exception 'C09_CONSENT_REVOCATION_UNAUTHORIZED' using errcode='P0001';
  end if;

  update myeongha_internal.character_learning_sharing_consents_v1
    set state='revoked', revoked_at=changed_at, revision=revision + 1
    where consent_ref = p_consent_ref;

  update myeongha_internal.character_learning_evidence_v1
    set revoked_at=changed_at
    where sharing_consent_ref = p_consent_ref and revoked_at is null;
  get diagnostics affected = row_count;
  return affected;
end;
$$;


-- Owner-approved revocation is different from consent revocation.
-- Lock the revocation receipt, source and evidence in a consistent order.
create function myeongha_internal.c09_revoke_learning_evidence_shadow_v1(
  p_subject_id uuid,
  p_evidence_id uuid,
  p_revocation_ref text,
  p_expected_revision bigint
) returns uuid
language plpgsql security invoker
set search_path = pg_catalog, myeongha_internal
as $$
declare
  a myeongha_internal.character_learning_revocation_approvals_v1%rowtype;
  s myeongha_internal.character_learning_source_approvals_v1%rowtype;
  e myeongha_internal.character_learning_evidence_v1%rowtype;
begin
  select * into strict a
  from myeongha_internal.character_learning_revocation_approvals_v1
  where revocation_ref = p_revocation_ref
  for update;
  if a.owner_subject_id <> p_subject_id or a.evidence_id <> p_evidence_id or
     a.state <> 'approved' or a.revision <> p_expected_revision or
     a.approved_at > clock_timestamp() then
    raise exception 'C09_REVOCATION_NOT_APPROVED' using errcode='P0001';
  end if;

  select * into strict s
  from myeongha_internal.character_learning_source_approvals_v1
  where source_ref = a.source_ref for update;
  if s.owner_subject_id <> p_subject_id or s.character_id <> 'seyeon' then
    raise exception 'C09_SOURCE_OWNER_MISMATCH' using errcode='P0001';
  end if;

  select * into strict e
  from myeongha_internal.character_learning_evidence_v1
  where id = p_evidence_id for update;
  if e.authority_ref <> s.source_ref or e.character_id <> s.character_id or
     e.topic_key <> s.topic_key or e.revoked_at is not null or
     e.verified_at > clock_timestamp() then
    raise exception 'C09_EVIDENCE_NOT_CURRENT' using errcode='P0001';
  end if;

  update myeongha_internal.character_learning_evidence_v1
  set revoked_at = clock_timestamp()
  where id = p_evidence_id and revoked_at is null;
  return p_evidence_id;
end;
$$;

revoke all on function myeongha_internal.c09_revoke_learning_evidence_shadow_v1(uuid,uuid,text,bigint)
  from public, anon, authenticated;

-- PRIVATE, NO PUBLIC API: functions remain ungranted to callers.
revoke all on function myeongha_internal.c09_issue_learning_evidence_shadow_v1(uuid,uuid,text,text,text,bigint)
  from public, anon, authenticated;
revoke all on function myeongha_internal.c09_revoke_sharing_consent_shadow_v1(uuid,text,text,bigint)
  from public, anon, authenticated;
commit;
