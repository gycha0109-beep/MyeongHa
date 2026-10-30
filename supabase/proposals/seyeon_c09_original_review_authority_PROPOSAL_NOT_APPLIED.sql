-- C09 independent reviewed-original authority. PROPOSAL ONLY, NOT APPLIED.
-- Must be deployed only after separate owner approval of review issuance and ACL.
-- This review does not equal the user's independent explicit learning opt-in.
-- Requires existing myeongha_internal.character_knowledge_topics_v1.
begin;

create table myeongha_internal.character_learning_original_reviews_v1 (
  review_ref text primary key,
  owner_subject_id uuid not null,
  original_message_id uuid not null,
  original_content_hash text not null,
  character_id text not null default 'seyeon',
  topic_key text not null,
  awareness text not null,
  visibility text not null default 'user_private',
  state text not null,
  reviewer_ref text not null,
  review_policy_ref text not null,
  learned_at timestamptz not null,
  valid_at timestamptz not null,
  reviewed_at timestamptz not null,
  revoked_at timestamptz,
  unique (owner_subject_id, original_message_id),
  foreign key (original_message_id, owner_subject_id)
    references public.conversation_messages(id, subject_id),
  foreign key (character_id, topic_key)
    references myeongha_internal.character_knowledge_topics_v1(character_id, topic_key),
  constraint c09_original_review_private_only check
    (character_id='seyeon' and visibility='user_private'),
  constraint c09_original_review_state check
    (state in ('approved','rejected','revoked')),
  constraint c09_original_review_awareness check
    (awareness in ('heard_of','basic','practiced','proficient')),
  constraint c09_original_review_provenance check
    (length(btrim(review_ref))>0 and
     length(btrim(original_content_hash))>0 and
     length(btrim(reviewer_ref))>0 and
     length(btrim(review_policy_ref))>0),
  constraint c09_original_review_timeline check
    (learned_at<=valid_at and valid_at<=reviewed_at and
     ((state='revoked' and revoked_at is not null and revoked_at>=reviewed_at)
      or (state<>'revoked' and revoked_at is null)))
);

create index c09_original_review_subject_lookup_idx
  on myeongha_internal.character_learning_original_reviews_v1
  (owner_subject_id, original_message_id);

alter table myeongha_internal.character_learning_original_reviews_v1
  enable row level security;
alter table myeongha_internal.character_learning_original_reviews_v1
  force row level security;

revoke all on myeongha_internal.character_learning_original_reviews_v1
  from public, anon, authenticated;

-- Read-only within a server-established canonical Subject scope.
-- No client can elect itself an independent reviewer.
create policy c09_original_reviews_subject_read_v1
  on myeongha_internal.character_learning_original_reviews_v1
  for select to myeongha_api_executor
  using (
    owner_subject_id = public.current_myeongha_subject_id()
    and character_id='seyeon'
    and visibility='user_private'
  );

grant select on myeongha_internal.character_learning_original_reviews_v1
  to myeongha_api_executor;

-- Deliberately NO INSERT/UPDATE/DELETE privileges, trigger to manufacture
-- approved rows, reviewer/write role, or privilege elevation.
-- A separately authenticated, independently operated review-issuance pathway
-- must be verified and approved before applying this proposal.
commit;
