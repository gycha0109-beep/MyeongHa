-- RR-03 / DB Authority: dormant immutable Official Reader Assistant Saju provenance.
-- Watchtower-Track: db-authority-core
--
-- This schema stores identities needed for a future SINGLE-TRANSACTION
-- validated Assistant Commit + source-provenance writer. It is NOT the writer.
-- RR-03 owner-approved personal data disposition: DELETE on account deletion.
-- Current DB finalizer cascades through conversation_messages/chat_turns.
-- Backup recovery must reconcile deletion before Reader serviceability.
-- No production role gets SELECT, INSERT, UPDATE or DELETE on this table.
-- No public/Reader follow-up query, Chat send, Offer, or disclosure is enabled.
--
-- Legacy chat_turn_attempts.grounding_refs_jsonb holds AI-execution UUIDs, NOT
-- official Saju grounding_unit_... refs. Face artifacts are a separate kind.
-- Never copy either source into this authority.

create or replace function public.internal_official_reader_source_refs_valid_v1(
  p_refs text[],
  p_kind text
)
returns boolean
language sql
immutable
security invoker
set search_path = pg_catalog
as $$
  select p_refs is not null
    and cardinality(p_refs) between
      (case when p_kind = 'unit' then 1 else 0 end)
      and (case when p_kind = 'unit' then 12 else 64 end)
    and (select count(*) from unnest(p_refs) as u(ref)
         where ref is not null
           and length(ref) between 1 and 256
           and btrim(ref) = ref
           and case when p_kind = 'unit'
             then ref ~ '^grounding_unit_[0-9a-f]{24}$'
             else ref !~ '[[:cntrl:]]'
           end) = cardinality(p_refs)
    and (select count(distinct u.ref) from unnest(p_refs) as u(ref))
        = cardinality(p_refs)
    and p_kind in ('unit','disclosure','ambiguity');
$$;

revoke all on function public.internal_official_reader_source_refs_valid_v1(
  text[], text
) from public;

create table public.official_reader_assistant_saju_provenance (
  assistant_message_id uuid primary key,
  subject_id uuid not null,
  thread_id uuid not null,
  turn_id uuid not null,
  attempt_id uuid not null,
  reading_ref uuid not null,
  reader_character_id text not null,
  content_release_id uuid not null,
  reader_content_bundle_id uuid not null,
  content_revision bigint not null,
  product_id uuid not null,
  product_spec_version text not null,
  product_rule_version text not null,
  approved_policy_revision text not null,
  official_artifact_response_hash text not null,
  grounding_hash text not null,
  scope_hash text not null,
  selection_hash text not null,
  source_identity_hash text not null,
  utterance_hash text not null,
  source_unit_refs text[] not null,
  focused_unit_ref text null,
  required_disclosure_refs text[] not null,
  required_ambiguity_refs text[] not null,
  semantic_guard_version text not null,
  output_guard_version text not null,
  provenance_state text not null,
  created_at timestamptz not null default clock_timestamp(),

  constraint official_reader_provenance_message_turn_subject_fk
    foreign key (assistant_message_id, turn_id, subject_id)
    references public.conversation_messages(id, turn_id, subject_id)
    on delete cascade,
  constraint official_reader_provenance_turn_thread_subject_fk
    foreign key (turn_id, thread_id, subject_id)
    references public.chat_turns(id, thread_id, subject_id)
    on delete cascade,
  constraint official_reader_provenance_attempt_turn_subject_fk
    foreign key (attempt_id, turn_id, subject_id)
    references public.chat_turn_attempts(id, turn_id, subject_id)
    on delete cascade,
  constraint official_reader_provenance_thread_subject_fk
    foreign key (thread_id, subject_id)
    references public.conversation_threads(id, subject_id)
    on delete cascade,
  constraint official_reader_provenance_reading_subject_fk
    foreign key (reading_ref, subject_id)
    references public.standard_reading_official_bindings(reading_id, subject_id)
    on delete cascade,
  constraint official_reader_provenance_interpretation_fk
    foreign key (reading_ref, reader_character_id)
    references public.standard_reading_reader_interpretations(
      official_reading_id, reader_character_id
    ),
  constraint official_reader_provenance_content_bundle_fk
    foreign key (reader_character_id, reader_content_bundle_id)
    references public.character_runtime_catalog(character_id, content_bundle_id),
  constraint official_reader_provenance_release_bundle_fk
    foreign key (content_release_id, reader_content_bundle_id)
    references public.content_releases(id, content_bundle_id),
  constraint official_reader_provenance_revision_nonnegative
    check (content_revision >= 0),
  constraint official_reader_provenance_policy_nonempty
    check (btrim(product_spec_version) <> ''
      and btrim(product_rule_version) <> ''
      and btrim(approved_policy_revision) <> ''
      and btrim(semantic_guard_version) <> ''
      and btrim(output_guard_version) <> ''),
  constraint official_reader_provenance_response_hash_format
    check (official_artifact_response_hash ~ '^sha256:v1:[0-9a-f]{64}$'),
  constraint official_reader_provenance_grounding_hash_format
    check (grounding_hash ~ '^[0-9a-f]{64}$'),
  constraint official_reader_provenance_scope_hash_format
    check (scope_hash ~ '^sha256:v1:[0-9a-f]{64}$'),
  constraint official_reader_provenance_selection_hash_format
    check (selection_hash ~ '^sha256:v1:[0-9a-f]{64}$'),
  constraint official_reader_provenance_source_identity_hash_format
    check (source_identity_hash ~ '^sha256:v1:[0-9a-f]{64}$'),
  constraint official_reader_provenance_utterance_hash_format
    check (utterance_hash ~ '^sha256:v1:[0-9a-f]{64}$'),
  constraint official_reader_provenance_source_units_valid
    check (public.internal_official_reader_source_refs_valid_v1(
      source_unit_refs, 'unit'
    )),
  constraint official_reader_provenance_focus_in_source
    check (focused_unit_ref is null or focused_unit_ref = any(source_unit_refs)),
  constraint official_reader_provenance_disclosure_refs_valid
    check (public.internal_official_reader_source_refs_valid_v1(
      required_disclosure_refs, 'disclosure'
    )),
  constraint official_reader_provenance_ambiguity_refs_valid
    check (public.internal_official_reader_source_refs_valid_v1(
      required_ambiguity_refs, 'ambiguity'
    )),
  constraint official_reader_provenance_guarded_state
    check (provenance_state = 'semantic_and_output_guard_pass')
);

create unique index official_reader_provenance_turn_unique_idx
  on public.official_reader_assistant_saju_provenance(turn_id);

create index official_reader_provenance_latest_anchor_idx
  on public.official_reader_assistant_saju_provenance(
    subject_id, thread_id, reader_character_id, reading_ref, created_at desc
  );

alter table public.official_reader_assistant_saju_provenance
  enable row level security;
alter table public.official_reader_assistant_saju_provenance
  force row level security;

-- Immutable during ordinary operation. Only the existing approved account
-- deletion finalizer may remove rows (including via FK cascade).
create or replace function public.tr_official_reader_provenance_immutable_v1()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE'
     and current_user = (
       select pg_catalog.pg_get_userbyid(p.proowner)
       from pg_catalog.pg_proc p
       where p.oid = pg_catalog.to_regprocedure(
         'public.internal_finalize_account_deletion_db_v1(uuid,uuid,text)'
       )
     )
     and coalesce(
       nullif(pg_catalog.current_setting(
         'myeongha.account_deletion_finalizer_subject_id', true
       ), '')::uuid = old.subject_id,
       false
     ) then
    return old;
  end if;

  raise exception using
    errcode = '23514',
    constraint = 'tr_official_reader_provenance_immutable_v1',
    message = 'Official Reader Assistant Saju provenance is immutable';
end
$$;

create trigger tr_official_reader_provenance_immutable_v1
  before update or delete on public.official_reader_assistant_saju_provenance
  for each row execute function public.tr_official_reader_provenance_immutable_v1();

revoke all on function public.tr_official_reader_provenance_immutable_v1()
  from public;

revoke all on public.official_reader_assistant_saju_provenance from public;

do $acl$
declare
  v_role text;
begin
  for v_role in
    select r.rolname from pg_catalog.pg_roles r
    where r.rolname in (
      'anon','authenticated','service_role','myeongha_api_executor'
    )
  loop
    execute pg_catalog.format(
      'revoke all on public.official_reader_assistant_saju_provenance from %I',
      v_role
    );
    execute pg_catalog.format(
      'revoke all on function public.internal_official_reader_source_refs_valid_v1(text[],text) from %I',
      v_role
    );
    execute pg_catalog.format(
      'revoke all on function public.tr_official_reader_provenance_immutable_v1() from %I',
      v_role
    );
  end loop;
end
$acl$;

comment on table public.official_reader_assistant_saju_provenance is
'RR-03 dormant source-provenance sidecar. DB Writer not yet authorized; no role can insert/select through API. The future source-verified Assistant Commit must write the exact committed message and this provenance within one transaction. This table alone does not validate Saju semantics or authorize any Reader Chat reveal. P0-PR-01 RR-03 additive classification DELETE; approved 2026-10-11; migration 1720.';
