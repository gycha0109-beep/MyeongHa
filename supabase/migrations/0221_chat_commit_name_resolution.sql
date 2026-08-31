-- cmd_commit_chat_turn_v1 returns columns named turn_id/attempt_id/message_id/sequence_no.
-- Those OUT parameters are PL/pgSQL variables and collide with table column names in
-- internal SQL unless a resolution policy is explicit. All local/input variables in
-- this command use v_/p_ prefixes, so column-first resolution is deterministic and
-- preserves the intended SQL meaning without changing the public function signature.
--
-- Managed Supabase production roles cannot ALTER FUNCTION ... SET the superuser-only
-- plpgsql.variable_conflict GUC. Recompile the existing 0220 function body with the
-- equivalent PL/pgSQL compile directive instead. The body itself is preserved byte-for-byte
-- after the directive; ownership and existing EXECUTE grants remain attached to the same
-- function identity.

do $$
declare
  v_function_oid oid := to_regprocedure(
    'public.cmd_commit_chat_turn_v1(uuid,uuid,uuid,uuid,uuid,uuid,jsonb,jsonb,jsonb)'
  );
  v_source text;
begin
  if v_function_oid is null then
    raise exception using
      errcode = '42883',
      message = 'cmd_commit_chat_turn_v1 must exist before name-resolution hardening';
  end if;

  select p.prosrc
    into v_source
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where p.oid = v_function_oid
    and n.nspname = 'public';

  if v_source is null then
    raise exception using
      errcode = '42883',
      message = 'cmd_commit_chat_turn_v1 source could not be loaded';
  end if;

  if ltrim(v_source) like '#variable_conflict use_column%' then
    return;
  end if;

  execute format(
    $ddl$
create or replace function public.cmd_commit_chat_turn_v1(
  p_subject_id uuid,
  p_thread_id uuid,
  p_turn_id uuid,
  p_attempt_id uuid,
  p_message_id uuid,
  p_outbox_event_id uuid,
  p_relationship_effect_jsonb jsonb,
  p_world_event_jsonb jsonb,
  p_memory_accept_jsonb jsonb
)
returns table (
  turn_id uuid,
  attempt_id uuid,
  message_id uuid,
  sequence_no bigint,
  replayed boolean
)
language plpgsql
security invoker
set search_path = public, pg_temp
as %L
$ddl$,
    E'#variable_conflict use_column\n' || v_source
  );
end;
$$;
