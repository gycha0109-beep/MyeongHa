-- PROPOSAL ONLY. NOT A MIGRATION. DO NOT RUN ON PRODUCTION.
-- Explicit DB-migration, RLS/ACL, publication and source-verification gates pending.
-- The current C09 Shadow refuses to use this schema if it is absent.
-- This proposal does not grant any role SELECT/INSERT/UPDATE/DELETE rights.
begin;

create schema if not exists myeongha_internal;
revoke all on schema myeongha_internal from public;

create table myeongha_internal.character_knowledge_topics_v1 (
  character_id text not null references public.characters(character_id),
  topic_key text not null,
  policy_version text not null,
  authority_source_ref text not null,
  domain_policy text not null,
  baseline text not null,
  published_at timestamptz null,
  revoked_at timestamptz null,
  primary key (character_id, topic_key),
  constraint c09_topic_key_check check (topic_key ~ '^[a-z][a-z0-9_.-]{0,127}$'),
  constraint c09_topic_domain_check check (domain_policy in ('ambient','bounded','authority_only')),
  constraint c09_topic_baseline_check check (baseline in ('not_recorded','explicit_unaware','heard_of','basic','practiced','proficient')),
  constraint c09_topic_policy_version_check check (length(btrim(policy_version)) > 0),
  constraint c09_topic_published_range check (revoked_at is null or (published_at is not null and revoked_at >= published_at))
);

create table myeongha_internal.character_learning_evidence_v1 (
  id uuid primary key,
  character_id text not null,
  topic_key text not null,
  source_kind text not null,
  authority_ref text not null unique,
  awareness text not null,
  visibility text not null,
  subject_id uuid null,
  approved_for_character_sharing boolean not null default false,
  privacy_reviewed_at timestamptz null,
  privacy_review_ref text null,
  approval_ref text not null,
  verified_at timestamptz not null,
  learned_at timestamptz not null,
  valid_at timestamptz not null,
  superseded_at timestamptz null,
  revoked_at timestamptz null,
  constraint c09_learning_topic_fk foreign key (character_id, topic_key)
    references myeongha_internal.character_knowledge_topics_v1(character_id, topic_key),
  constraint c09_learning_source_kind_check check
    (source_kind in ('canon','approved_character_fact','user_taught_verified','public_verified','experience')),
  constraint c09_learning_awareness_check check (awareness in ('heard_of','basic','practiced','proficient')),
  constraint c09_learning_visibility_check check (visibility in ('character_shared','user_private')),
  constraint c09_learning_scope_check check (
    (visibility='character_shared' and subject_id is null
      and approved_for_character_sharing=true
      and privacy_reviewed_at is not null and privacy_review_ref is not null)
    or
    (visibility='user_private' and subject_id is not null
      and approved_for_character_sharing=false)
  ),
  constraint c09_learning_time_check check (
    verified_at >= learned_at
    and valid_at >= learned_at
    and (superseded_at is null or superseded_at > valid_at)
    and (revoked_at is null or revoked_at >= verified_at)
  ),
  constraint c09_learning_nonempty_source_check check (
    length(btrim(authority_ref)) > 0 and length(btrim(approval_ref)) > 0
  )
);

create index c09_learning_lookup_idx
  on myeongha_internal.character_learning_evidence_v1
  (character_id, topic_key, visibility, valid_at desc);
create index c09_learning_subject_idx
  on myeongha_internal.character_learning_evidence_v1
  (subject_id, character_id, topic_key)
  where visibility = 'user_private';

alter table myeongha_internal.character_knowledge_topics_v1 enable row level security;
alter table myeongha_internal.character_learning_evidence_v1 enable row level security;
alter table myeongha_internal.character_knowledge_topics_v1 force row level security;
alter table myeongha_internal.character_learning_evidence_v1 force row level security;

revoke all on myeongha_internal.character_knowledge_topics_v1 from public, anon, authenticated;
revoke all on myeongha_internal.character_learning_evidence_v1 from public, anon, authenticated;

-- Intentionally no policies and no executor ACL grants.
-- Separate authoritative source verification, de-identification and
-- publication/revocation workflow must be designed and authorized before use.
commit;
