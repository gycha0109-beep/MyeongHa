-- Watchtower-Track: security
-- Follow-up to applied production-17: 12-key first-turn current-message provenance.
-- Only the original, DB-stored User message is admitted. Unpinned earlier chat
-- and derived sources remain HOLD; no source is promoted by a caller digest alone.
begin;
do $pre$
declare
  v oid;
  def text;
begin
  if current_user <> 'postgres' then raise exception 'Expected postgres operator'; end if;
  v:=to_regprocedure('public.cmd_mark_seyeon_chat_context_ready_pinned_v1(uuid,uuid,uuid,jsonb)')::oid;
  if v is null then raise exception 'Missing zero-source Pin function'; end if;
  select pg_get_functiondef(p.oid) into strict def from pg_proc p
  where p.oid=v and p.prosecdef
    and pg_get_userbyid(p.proowner)='myeongha_seyeon_chat_runtime_owner'
    and 'search_path=pg_catalog, public'=any(p.proconfig);
  if def is null
    or position('v_selection_keys <> 10' in def)=0
    or position('v_selection_keys <> 12' in def)>0
    or position('selectedUnpinnedRecentSources' in def)>0
    or position('v_selection ->> ''selectedModelSourceCensusDigest'' is distinct from ''sha256:v1:8d71521f43a0ddba0106549f2aace348b13a1b6055780aeaf6e09d3baa3c318b'' then' in def)=0
    or position('  v_thread_id uuid;' in def)=0
    or position('  select a.state,a.planner_version,a.seyeon_personal_source_pin_jsonb' in def)=0
    or not has_function_privilege('myeongha_api_executor',v,'EXECUTE')
    or has_function_privilege('anon',v,'EXECUTE')
    or has_function_privilege('authenticated',v,'EXECUTE')
    or has_function_privilege('service_role',v,'EXECUTE')
    or has_schema_privilege('myeongha_seyeon_chat_runtime_owner','public','CREATE')
    or not has_table_privilege('myeongha_seyeon_chat_runtime_owner','public.conversation_messages','SELECT')
    or not has_function_privilege('myeongha_seyeon_chat_runtime_owner','pg_catalog.sha256(bytea)','EXECUTE')
  then raise exception 'Current installed Pin authority or prerequisites drifted'; end if;

  if (select count(*) from pg_auth_members m
      join pg_roles target on target.oid=m.roleid
      join pg_roles member on member.oid=m.member
      join pg_roles grantor on grantor.oid=m.grantor
      where target.rolname='myeongha_seyeon_chat_runtime_owner'
        and member.rolname=current_user and grantor.rolname='supabase_admin'
        and m.admin_option and not m.inherit_option and not m.set_option)<>1
     or (select count(*) from pg_auth_members m
      join pg_roles target on target.oid=m.roleid
      join pg_roles member on member.oid=m.member
      where target.rolname='myeongha_seyeon_chat_runtime_owner'
        and member.rolname=current_user)<>1
  then raise exception 'Existing owner role membership drifted'; end if;
end
$pre$;

grant create on schema public to myeongha_seyeon_chat_runtime_owner;
grant myeongha_seyeon_chat_runtime_owner to current_user with set true;
set local role myeongha_seyeon_chat_runtime_owner;

do $change$
declare
  def text;
  old_tail text := 'v_selection ->> ''selectedModelSourceCensusDigest'' is distinct from ''sha256:v1:8d71521f43a0ddba0106549f2aace348b13a1b6055780aeaf6e09d3baa3c318b'' then';
  new_tail text := $tail$
     v_selection -> 'selectedUnpinnedRecentSources' is distinct from '[]'::jsonb or
     jsonb_typeof(v_selection -> 'selectedCurrentUserSource') is distinct from 'object' or
     (select count(*) from pg_catalog.jsonb_object_keys(v_selection -> 'selectedCurrentUserSource')) <> 4 or
     v_selection #>> '{selectedCurrentUserSource,role}' is distinct from 'user' or
     v_selection #> '{selectedCurrentUserSource,persistedBeforeModel}' is distinct from 'false'::jsonb or
     coalesce(v_selection #>> '{selectedCurrentUserSource,messageId}','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' or
     coalesce(v_selection #>> '{selectedCurrentUserSource,selectedModelMessageDigest}','') !~ '^sha256:v1:[a-f0-9]{64}$' or
     coalesce(v_selection ->> 'selectedModelSourceCensusDigest','') !~ '^sha256:v1:[a-f0-9]{64}$' then$tail$;
  before_attempt text:='  select a.state,a.planner_version,a.seyeon_personal_source_pin_jsonb';
  verification text := $verify$
  -- Validate the current exact model text against its DB original, before any
  -- provider invocation. The provider/caller digest is never its own proof.
  v_current_id:=v_selection #>> '{selectedCurrentUserSource,messageId}';
  select m.body_text into v_current_text
  from public.conversation_messages m
  where m.id::text=v_current_id
    and m.thread_id=v_thread_id and m.turn_id=p_turn_id
    and m.subject_id=p_subject_id and m.sender_type='user'
    and m.redacted_at is null;
  if not found or v_current_text is null or length(btrim(v_current_text))=0
     or length(btrim(v_current_text))>8000 then
    raise exception using errcode='23514',
      constraint='seyeon_zero_source_pin_invalid',
      message='Se-yeon current model User source is not a DB-original message';
  end if;
  v_current_digest:='sha256:v1:'||encode(pg_catalog.sha256(pg_catalog.convert_to(
    '{"messageId":'||to_json(v_current_id)::text||
    ',"role":"user","text":'||to_json(btrim(v_current_text))::text||'}',
    'UTF8')),'hex');
  if v_selection #>> '{selectedCurrentUserSource,selectedModelMessageDigest}'
       is distinct from v_current_digest then
    raise exception using errcode='23514',
      constraint='seyeon_zero_source_pin_invalid',
      message='Se-yeon current model text differs from its original User message';
  end if;
  v_census_digest:='sha256:v1:'||encode(pg_catalog.sha256(pg_catalog.convert_to(
    '{"currentUserSource":{"messageId":'||to_json(v_current_id)::text||
    ',"persistedBeforeModel":false,"role":"user","selectedModelMessageDigest":'||
       to_json(v_current_digest)::text||
    '},"originalPersonalSources":[],"unpinnedDerivedSources":[],"unpinnedRecentSources":[]}',
    'UTF8')),'hex');
  if v_selection ->> 'selectedModelSourceCensusDigest'
       is distinct from v_census_digest then
    raise exception using errcode='23514',
      constraint='seyeon_zero_source_pin_invalid',
      message='Se-yeon model source census does not match DB-original User message';
  end if;

$verify$;
begin
  select pg_get_functiondef(to_regprocedure(
    'public.cmd_mark_seyeon_chat_context_ready_pinned_v1(uuid,uuid,uuid,jsonb)'
  )) into def;
  if def is null or position('v_selection_keys <> 10' in def)=0
    or position(old_tail in def)=0
    or position(before_attempt in def)=0
  then raise exception 'Installed first-turn Pin definition changed'; end if;
  def:=replace(def,'v_selection_keys <> 10','v_selection_keys <> 12');
  def:=replace(def,'  v_thread_id uuid;',
    '  v_thread_id uuid;'||chr(10)||
    '  v_current_id text;'||chr(10)||
    '  v_current_text text;'||chr(10)||
    '  v_current_digest text;'||chr(10)||
    '  v_census_digest text;');
  def:=replace(def,old_tail,new_tail);
  def:=replace(def,before_attempt,verification||before_attempt);
  execute def;
end
$change$;

reset role;
revoke myeongha_seyeon_chat_runtime_owner from current_user;
revoke create on schema public from myeongha_seyeon_chat_runtime_owner;

do $post$
declare v oid; def text;
begin
  v:=to_regprocedure('public.cmd_mark_seyeon_chat_context_ready_pinned_v1(uuid,uuid,uuid,jsonb)')::oid;
  select pg_get_functiondef(p.oid) into strict def from pg_proc p
  where p.oid=v and p.prosecdef
    and pg_get_userbyid(p.proowner)='myeongha_seyeon_chat_runtime_owner'
    and 'search_path=pg_catalog, public'=any(p.proconfig);
  if def is null or position('v_selection_keys <> 12' in def)=0
    or position('v_selection_keys <> 10' in def)>0
    or position('selectedUnpinnedRecentSources' in def)=0
    or position('Se-yeon current model text differs from its original User message' in def)=0
    or position('Se-yeon model source census does not match DB-original User message' in def)=0
    or not has_function_privilege('myeongha_api_executor',v,'EXECUTE')
    or has_function_privilege('anon',v,'EXECUTE')
    or has_function_privilege('authenticated',v,'EXECUTE')
    or has_function_privilege('service_role',v,'EXECUTE')
    or has_schema_privilege('myeongha_seyeon_chat_runtime_owner','public','CREATE')
  then raise exception 'Owner, security or twelve-source contract postcondition failed'; end if;

  if (select count(*) from pg_auth_members m
      join pg_roles target on target.oid=m.roleid
      join pg_roles member on member.oid=m.member
      join pg_roles grantor on grantor.oid=m.grantor
      where target.rolname='myeongha_seyeon_chat_runtime_owner'
        and member.rolname=current_user and grantor.rolname='supabase_admin'
        and m.admin_option and not m.inherit_option and not m.set_option)<>1
     or (select count(*) from pg_auth_members m
      join pg_roles target on target.oid=m.roleid
      join pg_roles member on member.oid=m.member
      where target.rolname='myeongha_seyeon_chat_runtime_owner'
        and member.rolname=current_user)<>1
  then raise exception 'Original operator membership was not restored'; end if;
end
$post$;
commit;
