-- Watchtower-Track: security
-- R36: DB-owned, immutable code-derived PUBLIC Character/instruction manifest
-- for ONLY the two-original, zero-derived, no-network isolated Interpreter.
-- Not a production source grant, an approval signature, or Provider consent.
\set ON_ERROR_STOP on
begin;
do $pre$
begin
  if current_database()<>'myeongha_seyeon_positive_pin_candidate_test'
     or current_setting('server_version_num')::integer<150000
     or to_regprocedure(
       'seyeon_positive_candidate.claim_two_original_stage_wire_r30(uuid,uuid,uuid,uuid,text,uuid,text,text,text)'
     ) is null
  then
    raise exception 'R36 requires the named disposable DB and R30 original source owner';
  end if;
end $pre$;

create table seyeon_positive_candidate.interpreter_static_authority_manifest_r36(
  manifest_id text primary key
    check (manifest_id='seyeon-two-original-offline-interpreter-static-r36'),
  interpreter_instructions text not null check (length(interpreter_instructions)>1024),
  response_schema jsonb not null check (jsonb_typeof(response_schema)='object'),
  context_schema_version text not null check (length(context_schema_version)>1),
  character jsonb not null check (jsonb_typeof(character)='object'),
  authority_boundaries jsonb not null
    check (jsonb_typeof(authority_boundaries)='object'),
  bible_slices jsonb not null check (jsonb_typeof(bible_slices)='array'),
  action_policy jsonb not null check (jsonb_typeof(action_policy)='object'),
  allowed_interpretation_vocabulary jsonb not null
    check (jsonb_typeof(allowed_interpretation_vocabulary)='object'),
  reference_manifest_digest text not null
    check (reference_manifest_digest ~ '^sha256:pg-jsonb:v1:[a-f0-9]{64}$'),
  installed_at timestamptz not null default clock_timestamp()
);
create trigger immutable_interpreter_static_authority_manifest_r36
before update or delete
on seyeon_positive_candidate.interpreter_static_authority_manifest_r36
for each row execute function seyeon_positive_candidate.reject_r1_source_rewrite();

-- A single named role with local test-superuser rights installs exactly
-- one approved static snapshot derived from the actual runtime builder.
-- All API roles have no INSERT/SELECT/UPDATE/DELETE/EXECUTE on this table.
create function seyeon_positive_candidate.install_interpreter_static_authority_r36(
  p_instructions text,p_schema jsonb,p_context_schema text,
  p_character jsonb,p_boundaries jsonb,p_bible jsonb,
  p_action jsonb,p_vocabulary jsonb
)
returns text language plpgsql security invoker
set search_path=pg_catalog,public,seyeon_positive_candidate
as $install$
declare
  v_digest text;
  v_manifest jsonb;
begin
  if current_database()<>'myeongha_seyeon_positive_pin_candidate_test'
    or session_user<>'postgres' or current_user<>'postgres'
    or p_instructions is null or length(p_instructions)<=1024
    or p_schema is null or jsonb_typeof(p_schema)<>'object'
    or p_context_schema is null or p_context_schema=''
    or p_character->>'characterId' is distinct from 'seyeon'
    or jsonb_typeof(p_boundaries) is distinct from 'object'
    or jsonb_typeof(p_bible) is distinct from 'array'
    or jsonb_array_length(p_bible)<7
    or jsonb_typeof(p_action) is distinct from 'object'
    or jsonb_typeof(p_vocabulary) is distinct from 'object'
    or p_vocabulary->'revealLevels' is distinct from '["public"]'::jsonb
  then
    raise exception using errcode='23514',
      constraint='seyeon_r36_untrusted_manifest_installer';
  end if;
  v_manifest:=jsonb_build_object(
    'interpreterInstructions',p_instructions,
    'responseSchema',p_schema,'contextSchemaVersion',p_context_schema,
    'character',p_character,'authorityBoundaries',p_boundaries,
    'bibleSlices',p_bible,'actionPolicy',p_action,
    'allowedInterpretationVocabulary',p_vocabulary
  );
  v_digest:='sha256:pg-jsonb:v1:'||
    encode(sha256(convert_to(v_manifest::text,'UTF8')),'hex');
  insert into seyeon_positive_candidate.interpreter_static_authority_manifest_r36(
    manifest_id,interpreter_instructions,response_schema,
    context_schema_version,character,authority_boundaries,bible_slices,
    action_policy,allowed_interpretation_vocabulary,reference_manifest_digest
  ) values(
    'seyeon-two-original-offline-interpreter-static-r36',
    p_instructions,p_schema,p_context_schema,p_character,p_boundaries,p_bible,
    p_action,p_vocabulary,v_digest
  );
  return v_digest;
end $install$;
revoke all on seyeon_positive_candidate.interpreter_static_authority_manifest_r36
  from public,anon,authenticated,service_role,myeongha_api_executor;
revoke all on function
  seyeon_positive_candidate.install_interpreter_static_authority_r36(
    text,jsonb,text,jsonb,jsonb,jsonb,jsonb,jsonb
  ) from public,anon,authenticated,service_role,myeongha_api_executor;
do $acl$
begin
  if has_table_privilege('myeongha_api_executor',
       'seyeon_positive_candidate.interpreter_static_authority_manifest_r36','SELECT')
    or has_table_privilege('myeongha_api_executor',
       'seyeon_positive_candidate.interpreter_static_authority_manifest_r36','INSERT')
    or has_function_privilege('myeongha_api_executor',
       'seyeon_positive_candidate.install_interpreter_static_authority_r36(text,jsonb,text,jsonb,jsonb,jsonb,jsonb,jsonb)','EXECUTE')
    or has_function_privilege('public',
       'seyeon_positive_candidate.install_interpreter_static_authority_r36(text,jsonb,text,jsonb,jsonb,jsonb,jsonb,jsonb)','EXECUTE')
  then
    raise exception 'R36 static manifest leaked to API or anonymous role';
  end if;
end $acl$;
commit;
\echo 'PASS R36 isolated static authored-context manifest installed, empty pending trusted CI bootstrap'
