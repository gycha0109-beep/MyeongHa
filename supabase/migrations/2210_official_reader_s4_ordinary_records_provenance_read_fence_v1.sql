-- S4: restore-safe ordinary Memory/Life Fact read isolation.
--
-- A restored PostgreSQL snapshot can contain user/Reader Memory, Life Facts,
-- explicit Character access grants, or Se-yeon Search/Summary inputs derived
-- from an S5 protected-paid-answer Chat turn. S4 ciphertext/key tombstones
-- prevent paid body recovery, but ordinary derived rows must also be hidden
-- until the established Privacy Owner cleanup has completed.
--
-- Filter at the existing API NOBYPASSRLS row policies, NOT only the web
-- screen or a prompt builder. This automatically applies to the EXISTING
-- qry_memory_items_v1/v2, qry_life_record_ledger_v1/v2,
-- qry_character_record_context_v1, qry_reader_context_granted_life_facts_v1,
-- qry_seyeon_production_personal_record_context_v1 and their ordinary
-- Search/Summary/Memory readers executing through myeongha_api_executor.
-- None of these APIs get access to raw paid text or additional table columns.
--
-- The one narrow server-executor helper is a boolean ownership-scoped
-- provenance predicate, not an entitlement/new public RPC. No role creation,
-- new LLM call, new buyer rights, public API permission, Privacy deletion
-- authority or S8 release. Past derivations remain quarantined in storage
-- for the existing Privacy/DB Owner lifecycle to reconcile.
-- Watchtower-Track: db-authority-core

create index if not exists official_reader_s4_safe_marker_source_lookup_v1
  on public.conversation_messages(subject_id,turn_id,id)
  where sender_type='system'
    and content_hash=
      'sha256:v1:c04638eb883ebf25b14a9f8ce0c5bb0ae0e0bae7aaa69ea91f33f22172abbf63';

create or replace function public.internal_is_official_reader_s4_protected_derivation_v1(
  p_subject_id uuid,
  p_source_turn_id uuid,
  p_source_message_id uuid
)
returns boolean
language plpgsql stable security definer
set search_path=pg_catalog,public
set row_security=off
as $reader_paid_derivation_read_fence$
begin
  -- A NULL Subject cannot attest that a Memory/Fact is ordinary.
  if p_subject_id is null then
    return true;
  end if;
  -- Validate the canonical Subject before privileged marker comparison:
  -- the API cannot probe another account's stored paid Chat provenance.
  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  if p_source_turn_id is null and p_source_message_id is null then
    return false;
  end if;

  -- No private ciphertext, Content hash of the PAID ANSWER, DEK, Receipt,
  -- Grant, or summary is exposed. This is the immutable S5 safe SYSTEM
  -- marker hash, not a word search that suppresses a user's own statement.
  return exists (
    select 1
    from public.conversation_messages marker
    where marker.subject_id=p_subject_id
      and marker.sender_type='system'
      and marker.content_hash=
        'sha256:v1:c04638eb883ebf25b14a9f8ce0c5bb0ae0e0bae7aaa69ea91f33f22172abbf63'
      and (
        (p_source_message_id is not null
          and marker.id=p_source_message_id)
        or
        (p_source_turn_id is not null
          and marker.turn_id=p_source_turn_id)
      )
  );
end
$reader_paid_derivation_read_fence$;

revoke all on function public.internal_is_official_reader_s4_protected_derivation_v1(
  uuid,uuid,uuid
) from public;

do $reader_paid_derivation_helper_acl$
declare v_role text;
begin
  for v_role in select rolname from pg_catalog.pg_roles
    where rolname in ('anon','authenticated','service_role',
      'myeongha_commerce_internal_executor','myeongha_system_executor',
      'myeongha_seyeon_chat_runtime_owner','myeongha_seyeon_post_turn_owner')
  loop
    execute pg_catalog.format(
      'revoke all on function public.internal_is_official_reader_s4_protected_derivation_v1(uuid,uuid,uuid) from %I',
      v_role
    );
  end loop;
end
$reader_paid_derivation_helper_acl$;

-- The only caller is the already authorized, canonical-Subject API reader
-- through its existing Memory/Life Fact RLS predicates. Function returns
-- one non-sensitive boolean and never confers access to ciphertext/markers.
grant execute on function public.internal_is_official_reader_s4_protected_derivation_v1(
  uuid,uuid,uuid
) to myeongha_api_executor;

drop policy if exists memory_items_api_current_select_v1
  on public.memory_items;
create policy memory_items_api_current_select_v1
on public.memory_items
for select
to myeongha_api_executor
using (
  subject_id=public.current_myeongha_subject_id()
  and not public.internal_is_official_reader_s4_protected_derivation_v1(
    subject_id,source_turn_id,source_message_id
  )
);

drop policy if exists life_facts_api_current_select_v1
  on public.life_facts;
create policy life_facts_api_current_select_v1
on public.life_facts
for select
to myeongha_api_executor
using (
  subject_id=public.current_myeongha_subject_id()
  and not public.internal_is_official_reader_s4_protected_derivation_v1(
    subject_id,null::uuid,source_message_id
  )
);

comment on function public.internal_is_official_reader_s4_protected_derivation_v1(
  uuid,uuid,uuid
) is 'S4 owner-bound boolean guard for protected S5 Chat provenance. Existing Memory/Life Fact runtime RLS excludes resurrected paid Reader-derived rows from ordinary Records, Reader, Se-yeon, Search and Summary; no paid text/grants exposed. Restore remains quarantined until Privacy owner reconciliation.';
