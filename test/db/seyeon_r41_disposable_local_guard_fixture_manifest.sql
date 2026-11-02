-- Watchtower-Track: security
-- R41: deterministic authored PUBLIC fixture, NEVER actual Provider output or
-- user-facing Character Guard PASS. Named scratch DB ONLY; no operating grant.
\set ON_ERROR_STOP on
begin;
do $pre$
begin
  if current_database()<>'myeongha_seyeon_positive_pin_candidate_test'
    or current_setting('server_version_num')::integer<150000
    or to_regclass('seyeon_positive_candidate.unverified_transport_lineage_r40') is null
    or to_regclass('seyeon_positive_candidate.interpreter_static_authority_manifest_r36') is null
  then raise exception 'R41 requires scratch R36/R40 sealed fixtures';
  end if;
end $pre$;

create table seyeon_positive_candidate.local_guard_fixture_manifest_r41(
  manifest_id text primary key
    check(manifest_id='seyeon-r41-code-derived-public-guard-v1'),
  interpretation_output_digest text not null,
  renderer_output_digest text not null,
  semantic_review_output_digest text not null,
  renderer_utterance_hash text not null,
  guarded_envelope_digest text not null,
  installed_at timestamptz not null default clock_timestamp(),
  check(interpretation_output_digest ~ '^sha256:wire-utf8:v1:[a-f0-9]{64}$'),
  check(renderer_output_digest ~ '^sha256:wire-utf8:v1:[a-f0-9]{64}$'),
  check(semantic_review_output_digest ~ '^sha256:wire-utf8:v1:[a-f0-9]{64}$'),
  check(renderer_utterance_hash ~ '^sha256:v1:[a-f0-9]{64}$'),
  check(guarded_envelope_digest ~ '^sha256:v1:[a-f0-9]{64}$')
);
create trigger immutable_local_guard_fixture_manifest_r41
before update or delete on seyeon_positive_candidate.local_guard_fixture_manifest_r41
for each row execute function seyeon_positive_candidate.reject_r1_source_rewrite();

create function seyeon_positive_candidate.install_local_guard_fixture_manifest_r41(
  p_interpretation text,p_renderer text,p_review text,
  p_utterance text,p_envelope text
)
returns boolean language plpgsql security invoker
set search_path=pg_catalog,public,seyeon_positive_candidate
as $install$
begin
  if current_database()<>'myeongha_seyeon_positive_pin_candidate_test'
    or session_user<>'postgres' or current_user<>'postgres'
    or p_interpretation !~ '^sha256:wire-utf8:v1:[a-f0-9]{64}$'
    or p_renderer !~ '^sha256:wire-utf8:v1:[a-f0-9]{64}$'
    or p_review !~ '^sha256:wire-utf8:v1:[a-f0-9]{64}$'
    or p_utterance !~ '^sha256:v1:[a-f0-9]{64}$'
    or p_envelope !~ '^sha256:v1:[a-f0-9]{64}$'
    or (select count(*) from
       seyeon_positive_candidate.interpreter_static_authority_manifest_r36)<>1
  then
    raise exception using errcode='23514',
      constraint='seyeon_r41_untrusted_fixture_installer';
  end if;
  insert into seyeon_positive_candidate.local_guard_fixture_manifest_r41(
    manifest_id,interpretation_output_digest,renderer_output_digest,
    semantic_review_output_digest,renderer_utterance_hash,guarded_envelope_digest
  ) values (
    'seyeon-r41-code-derived-public-guard-v1',
    p_interpretation,p_renderer,p_review,p_utterance,p_envelope
  );
  return true;
end $install$;

create table seyeon_positive_candidate.local_guard_fixture_lineage_r41(
  attempt_id uuid primary key references public.chat_turn_attempts(id)
    on delete cascade,
  selected_sources_digest text not null
    check(selected_sources_digest ~ '^sha256:v1:[a-f0-9]{64}$'),
  interpretation_call_id uuid not null,
  renderer_call_id uuid not null,
  semantic_review_call_id uuid not null,
  guarded_envelope_digest text not null
    check(guarded_envelope_digest ~ '^sha256:v1:[a-f0-9]{64}$'),
  origin_kind text not null default 'code_authored_local_fixture_no_provider'
    check(origin_kind='code_authored_local_fixture_no_provider'),
  provider_dispatched boolean not null default false
    check(provider_dispatched=false),
  provider_output_verified boolean not null default false
    check(provider_output_verified=false),
  output_guard_verified boolean not null default false
    check(output_guard_verified=false),
  created_at timestamptz not null default clock_timestamp()
);
create trigger immutable_local_guard_fixture_lineage_r41
before update on seyeon_positive_candidate.local_guard_fixture_lineage_r41
for each row execute function seyeon_positive_candidate.reject_r1_source_rewrite();
