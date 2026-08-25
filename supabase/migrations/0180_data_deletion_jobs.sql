-- MyeongHa DDL draft: user deletion/forgetting request state machine.
-- Destructive graph execution remains an idempotent server command; this table records request authority.

create table public.data_deletion_jobs (
  id uuid primary key,
  subject_id uuid not null,
  scope text not null,
  target_resource_type text null,
  target_resource_id text null,
  request_dedupe_key text not null,
  status text not null,
  retention_exceptions_jsonb jsonb null,
  requested_at timestamptz not null,
  started_at timestamptz null,
  completed_at timestamptz null,
  error_code text null,
  constraint data_deletion_jobs_subject_dedupe_unique
    unique (subject_id, request_dedupe_key),
  constraint data_deletion_jobs_subject_fk
    foreign key (subject_id) references public.subjects(id),
  constraint data_deletion_jobs_scope_check
    check (scope in ('account', 'conversation', 'memory', 'life_fact', 'target_person')),
  constraint data_deletion_jobs_status_check
    check (status in ('requested', 'running', 'completed', 'failed')),
  constraint data_deletion_jobs_target_shape_check
    check (
      (scope = 'account' and target_resource_id is null)
      or
      (scope <> 'account' and target_resource_id is not null and target_resource_type is not null)
    )
);

create index data_deletion_jobs_subject_status_idx
  on public.data_deletion_jobs(subject_id, status);
