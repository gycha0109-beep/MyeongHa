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
