-- cmd_commit_chat_turn_v1 returns columns named turn_id/attempt_id/message_id/sequence_no.
-- Those OUT parameters are PL/pgSQL variables and collide with table column names in
-- internal SQL unless a resolution policy is explicit. All local/input variables in
-- this command use v_/p_ prefixes, so column-first resolution is deterministic and
-- preserves the intended SQL meaning without changing the public function signature.

alter function public.cmd_commit_chat_turn_v1(
  uuid, uuid, uuid, uuid, uuid, uuid, jsonb, jsonb, jsonb
) set plpgsql.variable_conflict = 'use_column';
