-- MyeongHa DDL draft: M03 birth records.
-- Exact birth input authority lives only in immutable birth_profile_revisions.

create table public.birth_profiles (
  id uuid primary key,
  subject_id uuid not null,
  profile_kind text not null,
  label text null,
  current_revision_id uuid null,
  archived_at timestamptz null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  constraint birth_profiles_id_subject_unique unique (id, subject_id),
  constraint birth_profiles_subject_fk
    foreign key (subject_id) references public.subjects(id),
  constraint birth_profiles_kind_check
    check (profile_kind in ('self', 'target'))
);

create unique index birth_profiles_one_active_self_idx
  on public.birth_profiles(subject_id)
  where profile_kind = 'self' and archived_at is null;

create table public.birth_profile_revisions (
  id uuid primary key,
  birth_profile_id uuid not null,
  subject_id uuid not null,
  revision_no integer not null,
  calendar_type text not null,
  birth_date date not null,
  birth_time time null,
  time_known boolean not null,
  is_leap_month boolean null,
  sex text null,
  input_hash text not null,
  created_at timestamptz not null,
  constraint birth_profile_revisions_profile_revision_unique
    unique (birth_profile_id, revision_no),
  constraint birth_profile_revisions_id_subject_unique
    unique (id, subject_id),
  constraint birth_profile_revisions_id_profile_unique
    unique (id, birth_profile_id),
  constraint birth_profile_revisions_profile_subject_fk
    foreign key (birth_profile_id, subject_id)
    references public.birth_profiles(id, subject_id),
  constraint birth_profile_revisions_revision_check
    check (revision_no > 0),
  constraint birth_profile_revisions_calendar_check
    check (calendar_type in ('solar', 'lunar')),
  constraint birth_profile_revisions_time_shape_check
    check ((time_known and birth_time is not null) or (not time_known and birth_time is null)),
  constraint birth_profile_revisions_solar_leap_check
    check (calendar_type <> 'solar' or is_leap_month is not true),
  constraint birth_profile_revisions_sex_check
    check (sex is null or sex in ('male', 'female', 'unspecified'))
);

create table public.target_person_profiles (
  id uuid primary key,
  subject_id uuid not null,
  birth_profile_id uuid not null,
  display_label text null,
  relationship_label text null,
  created_at timestamptz not null,
  deleted_at timestamptz null,
  constraint target_person_profiles_birth_profile_unique unique (birth_profile_id),
  constraint target_person_profiles_id_subject_unique unique (id, subject_id),
  constraint target_person_profiles_subject_fk
    foreign key (subject_id) references public.subjects(id),
  constraint target_person_profiles_birth_subject_fk
    foreign key (birth_profile_id, subject_id)
    references public.birth_profiles(id, subject_id)
);

create index birth_profiles_subject_kind_idx
  on public.birth_profiles(subject_id, profile_kind);
create index birth_profile_revisions_subject_profile_revision_idx
  on public.birth_profile_revisions(subject_id, birth_profile_id, revision_no desc);
create index target_person_profiles_subject_created_idx
  on public.target_person_profiles(subject_id, created_at desc);
