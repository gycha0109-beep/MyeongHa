-- MyeongHa DDL draft: M01 auth/owner.
-- Authority: DB ERD v0.6. RLS remains intentionally deferred until P0-AUTH-01 is resolved.

create table public.subjects (
  id uuid primary key,
  kind text not null,
  auth_user_id uuid null,
  status text not null,
  merged_into_subject_id uuid null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  constraint subjects_auth_user_fk
    foreign key (auth_user_id) references auth.users(id) on delete set null,
  constraint subjects_merged_into_fk
    foreign key (merged_into_subject_id) references public.subjects(id),
  constraint subjects_kind_check
    check (kind in ('guest', 'member')),
  constraint subjects_status_check
    check (status in ('active', 'merged', 'deletion_pending', 'deleted')),
  constraint subjects_guest_has_no_auth_check
    check (kind <> 'guest' or auth_user_id is null),
  constraint subjects_active_member_has_auth_check
    check (kind <> 'member' or status not in ('active', 'deletion_pending') or auth_user_id is not null),
  constraint subjects_merged_shape_check
    check (status <> 'merged' or (kind = 'guest' and merged_into_subject_id is not null)),
  constraint subjects_nonmerged_has_no_target_check
    check (status = 'merged' or merged_into_subject_id is null),
  constraint subjects_no_self_merge_check
    check (merged_into_subject_id is null or merged_into_subject_id <> id)
);

create unique index subjects_auth_user_id_unique
  on public.subjects(auth_user_id)
  where auth_user_id is not null;

create table public.profiles (
  subject_id uuid primary key references public.subjects(id),
  display_name text null,
  locale text null,
  timezone text null,
  onboarding_state text null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table public.guest_sessions (
  id uuid primary key,
  subject_id uuid not null,
  token_hash text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz null,
  claimed_by_subject_id uuid null,
  created_at timestamptz not null,
  constraint guest_sessions_subject_unique unique (subject_id),
  constraint guest_sessions_token_hash_unique unique (token_hash),
  constraint guest_sessions_id_subject_unique unique (id, subject_id),
  constraint guest_sessions_subject_fk
    foreign key (subject_id) references public.subjects(id),
  constraint guest_sessions_claimed_by_fk
    foreign key (claimed_by_subject_id) references public.subjects(id),
  constraint guest_sessions_consumed_after_creation_check
    check (consumed_at is null or consumed_at >= created_at)
);

create index guest_sessions_expires_at_idx on public.guest_sessions(expires_at);

create table public.subject_merge_jobs (
  id uuid primary key,
  guest_subject_id uuid not null,
  member_subject_id uuid not null,
  guest_session_id uuid not null,
  policy_version text not null,
  status text not null,
  conflicts_jsonb jsonb not null,
  resolution_jsonb jsonb null,
  idempotency_key text not null,
  created_at timestamptz not null,
  completed_at timestamptz null,
  constraint subject_merge_jobs_guest_session_unique unique (guest_session_id),
  constraint subject_merge_jobs_retry_unique
    unique (guest_subject_id, member_subject_id, idempotency_key),
  constraint subject_merge_jobs_provenance_unique
    unique (id, guest_subject_id, member_subject_id),
  constraint subject_merge_jobs_guest_subject_fk
    foreign key (guest_subject_id) references public.subjects(id),
  constraint subject_merge_jobs_member_subject_fk
    foreign key (member_subject_id) references public.subjects(id),
  constraint subject_merge_jobs_session_guest_fk
    foreign key (guest_session_id, guest_subject_id)
    references public.guest_sessions(id, subject_id),
  constraint subject_merge_jobs_distinct_subjects_check
    check (guest_subject_id <> member_subject_id),
  constraint subject_merge_jobs_status_check
    check (status in ('detected', 'awaiting_resolution', 'running', 'completed', 'failed')),
  constraint subject_merge_jobs_completed_timestamp_check
    check (status <> 'completed' or completed_at is not null)
);

create table public.subject_merge_actions (
  id uuid primary key,
  merge_job_id uuid not null,
  action_dedupe_key text not null,
  domain_key text not null,
  resource_type text not null,
  source_resource_id text not null,
  action_type text not null,
  target_resource_id text null,
  status text not null,
  created_at timestamptz not null,
  completed_at timestamptz null,
  constraint subject_merge_actions_dedupe_unique
    unique (merge_job_id, action_dedupe_key),
  constraint subject_merge_actions_merge_job_fk
    foreign key (merge_job_id) references public.subject_merge_jobs(id),
  constraint subject_merge_actions_type_check
    check (action_type in ('retain_readonly', 'import_new', 'merge_projection', 'discard')),
  constraint subject_merge_actions_status_check
    check (status in ('planned', 'applied', 'skipped', 'failed')),
  constraint subject_merge_actions_applied_target_check
    check (
      status <> 'applied'
      or action_type not in ('import_new', 'merge_projection')
      or target_resource_id is not null
    )
);

create index subject_merge_jobs_status_created_idx
  on public.subject_merge_jobs(status, created_at);
create index subject_merge_actions_job_status_idx
  on public.subject_merge_actions(merge_job_id, status);
