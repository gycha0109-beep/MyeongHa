-- S4 protected paid Reader answer storage: PRIVATE implementation only.
-- Development PR / Owner acceptance pending. Do not apply to Production or
-- activate an HTTP paid-read route until Saju, Privacy and DB owners approve.
-- This is an encrypted-body boundary, NOT a payment or content release.
-- Watchtower-Track: db-authority-core

create table public.official_reader_paid_answer_bodies (
  id uuid primary key,
  subject_id uuid not null,
  thread_id uuid not null,
  turn_id uuid not null,
  attempt_id uuid not null,
  safe_message_id uuid not null,
  thread_character_id uuid not null,
  official_reading_id uuid not null,
  reader_character_id text not null,
  reader_content_bundle_id uuid not null,
  content_release_id uuid not null,
  originating_entitlement_grant_id uuid not null,
  product_id uuid not null,
  product_spec_version text not null,
  official_artifact_response_hash text not null,
  source_attestation_ref text not null,
  source_response_hash text not null,
  semantic_guard_version text not null,
  output_guard_version text not null,
  -- The application encrypts a completed answer BEFORE crossing the DB
  -- boundary. No plaintext, plaintext hash or provider prompt is persisted.
  encryption_scheme_version text not null,
  encryption_key_ref text not null,
  encryption_iv bytea not null,
  encryption_auth_tag bytea not null,
  encrypted_body bytea not null,
  committed_at timestamptz not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint official_reader_paid_answer_subject_fk
    foreign key (subject_id) references public.subjects(id),
  constraint official_reader_paid_answer_official_fk
    foreign key (official_reading_id,subject_id)
    references public.standard_reading_official_bindings(reading_id,subject_id),
  constraint official_reader_paid_answer_interpretation_fk
    foreign key (official_reading_id,reader_character_id)
    references public.standard_reading_reader_interpretations(
      official_reading_id,reader_character_id),
  constraint official_reader_paid_answer_catalog_fk
    foreign key (reader_character_id,reader_content_bundle_id)
    references public.character_runtime_catalog(character_id,content_bundle_id),
  constraint official_reader_paid_answer_grant_fk
    foreign key (originating_entitlement_grant_id)
    references public.standard_reading_reader_access_grants(entitlement_grant_id)
    on delete cascade,
  constraint official_reader_paid_answer_thread_fk
    foreign key (thread_id,subject_id)
    references public.conversation_threads(id,subject_id) on delete cascade,
  constraint official_reader_paid_answer_turn_fk
    foreign key (turn_id,thread_id,subject_id)
    references public.chat_turns(id,thread_id,subject_id) on delete cascade,
  constraint official_reader_paid_answer_attempt_fk
    foreign key (attempt_id,turn_id,subject_id)
    references public.chat_turn_attempts(id,turn_id,subject_id) on delete cascade,
  constraint official_reader_paid_answer_marker_fk
    foreign key (safe_message_id,turn_id,subject_id)
    references public.conversation_messages(id,turn_id,subject_id) on delete cascade,
  constraint official_reader_paid_answer_participation_fk
    foreign key (thread_character_id,thread_id,reader_content_bundle_id)
    references public.conversation_thread_characters(
      id,thread_id,content_bundle_id) on delete cascade,
  constraint official_reader_paid_answer_release_fk
    foreign key (content_release_id,reader_content_bundle_id)
    references public.content_releases(id,content_bundle_id),
  constraint official_reader_paid_answer_product_fk
    foreign key (product_id)
    references public.standard_reading_product_specs(product_id),
  constraint official_reader_paid_answer_one_per_attempt
    unique (subject_id,turn_id,attempt_id),
  constraint official_reader_paid_answer_one_per_marker
    unique (safe_message_id),
  constraint official_reader_paid_answer_encryption_version
    check (encryption_scheme_version='aes-256-gcm-v1'),
  constraint official_reader_paid_answer_cipher_shape
    check (pg_catalog.octet_length(encryption_iv)=12
       and pg_catalog.octet_length(encryption_auth_tag)=16
       and pg_catalog.octet_length(encrypted_body)>0
       and pg_catalog.octet_length(encrypted_body)<=262144),
  constraint official_reader_paid_answer_source_required
    check (pg_catalog.btrim(source_attestation_ref)<>''
       and pg_catalog.btrim(source_response_hash)<>''
       and pg_catalog.btrim(official_artifact_response_hash)<>''
       and pg_catalog.btrim(semantic_guard_version)<>''
       and pg_catalog.btrim(output_guard_version)<>''
       and pg_catalog.btrim(product_spec_version)<>''
       and pg_catalog.btrim(encryption_key_ref)<>'')
);

create index official_reader_paid_answer_subject_thread_idx
  on public.official_reader_paid_answer_bodies(subject_id,thread_id,committed_at desc);
create index official_reader_paid_answer_scope_idx
  on public.official_reader_paid_answer_bodies(
    subject_id,official_reading_id,reader_character_id,reader_content_bundle_id
  );

-- A standalone policy-less FORCE RLS table is deliberately inaccessible even
-- to ordinary login, Supabase service_role, or the generic API executor.
-- Future owner-approved read/write functions will be separate migrations.
alter table public.official_reader_paid_answer_bodies enable row level security;
alter table public.official_reader_paid_answer_bodies force row level security;
revoke all on table public.official_reader_paid_answer_bodies from public;

do $reader_protected_acl$
declare v_role text;
begin
  for v_role in
    select rolname from pg_catalog.pg_roles
    where rolname in (
      'anon','authenticated','service_role','myeongha_api_executor',
      'myeongha_commerce_internal_executor',
      'myeongha_seyeon_chat_runtime_owner','myeongha_system_executor'
    )
  loop
    execute pg_catalog.format(
      'revoke all on table public.official_reader_paid_answer_bodies from %I',
      v_role
    );
  end loop;
end
$reader_protected_acl$;

-- Any future private Writer must prove that the ciphertext's origin is
-- exactly one server-owned Reader/Reading/Thread/Attempt/Marker combination.
-- The trigger does not grant INSERT and cannot substitute for final S5 source
-- attestation, Output Guard or current Entitlement transaction locking.
create or replace function public.internal_assert_official_reader_paid_answer_origin_v1()
returns trigger
language plpgsql
volatile
security invoker
set search_path=pg_catalog,public
as $reader_paid_origin$
begin
  if not exists (
    select 1
    from public.standard_reading_reader_access_grants a
    join public.entitlement_grants eg
      on eg.id=a.entitlement_grant_id and eg.subject_id=a.subject_id
    join public.commerce_receipts cr
      on cr.id=eg.source_receipt_id and cr.subject_id=eg.subject_id
    where a.entitlement_grant_id=new.originating_entitlement_grant_id
      and a.subject_id=new.subject_id
      and a.official_reading_id=new.official_reading_id
      and a.reader_character_id=new.reader_character_id
      and a.reader_content_bundle_id=new.reader_content_bundle_id
      and eg.grant_source_type='purchase'
      and eg.status='active'
      and eg.valid_from<=pg_catalog.clock_timestamp()
      and (eg.valid_until is null
        or pg_catalog.clock_timestamp()<eg.valid_until)
      and cr.verification_status='verified'
      and cr.environment='production'
  ) then
    raise exception using errcode='23514',
      constraint='official_reader_paid_answer_origin_grant_invalid',
      message='Protected Reader content requires exact current purchase Grant';
  end if;

  if not exists (
    select 1
    from public.conversation_messages m
    join public.conversation_thread_characters c
      on c.id=new.thread_character_id
     and c.thread_id=new.thread_id
     and c.character_id=new.reader_character_id
     and c.content_bundle_id=new.reader_content_bundle_id
     and c.left_at is null
    join public.chat_turns t
      on t.id=new.turn_id and t.thread_id=new.thread_id
     and t.subject_id=new.subject_id
    join public.chat_turn_attempts attempt
      on attempt.id=new.attempt_id and attempt.turn_id=new.turn_id
     and attempt.subject_id=new.subject_id
    where m.id=new.safe_message_id
      and m.subject_id=new.subject_id
      and m.thread_id=new.thread_id
      and m.turn_id=new.turn_id
      and m.sender_type='system'
      and m.body_text='유료 해설 기록이 있습니다.'
      and m.message_payload_jsonb is null
      and m.redacted_at is null
      and t.resolved_content_release_id=new.content_release_id
      and t.resolved_content_bundle_id=new.reader_content_bundle_id
      and t.committed_attempt_id=new.attempt_id
      and t.state in ('committed','delivered')
      and attempt.state='committed'
  ) then
    raise exception using errcode='23514',
      constraint='official_reader_paid_answer_chat_marker_invalid',
      message='Protected Reader content must match the committed safe marker';
  end if;

  return new;
end
$reader_paid_origin$;

revoke all on function public.internal_assert_official_reader_paid_answer_origin_v1()
from public;

create trigger official_reader_paid_answer_origin_insert
before insert or update on public.official_reader_paid_answer_bodies
for each row execute function public.internal_assert_official_reader_paid_answer_origin_v1();

comment on table public.official_reader_paid_answer_bodies is
'PRIVATE unactivated S4 protected Reader paid-answer ciphertext, with exact Chat/Reading/Grant provenance. No SELECT or INSERT granted to runtime roles. Await source attestation, privacy deletion/recovery and key-lifecycle acceptance before any production use.';
