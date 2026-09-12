-- Reading clarification executor authority guard.
--
-- P0-AUTH-01 generic PostgreSQL execution identity is resolved by the dedicated
-- NOBYPASSRLS myeongha_api_executor model (0790) and production login-principal binding
-- (0800). That generic execution identity does not admit Reading clarification append.
--
-- SRC-33 public ClarificationAnswerV1 positive admission remains unresolved. Until the
-- source-owned application boundary admits the full clarification contract, including
-- question/answer correlation, cardinality, canonicalization/hash, and pending-contract
-- version compatibility, cmd_append_reading_clarification_v1 remains only a lower-level
-- persistence primitive for trusted prevalidated canonical fixtures/boundaries.
--
-- Ordinary production API execution must therefore stay fail-closed even if the generic
-- executor role is otherwise active. A later authority-admission change must explicitly
-- replace this deny boundary together with the governed application validator/caller.

revoke all on function public.cmd_append_reading_clarification_v1(
  uuid, uuid, uuid, uuid, text, text, text, jsonb
) from public;

revoke all on function public.cmd_append_reading_clarification_v1(
  uuid, uuid, uuid, uuid, text, text, text, jsonb
) from myeongha_api_executor;

do $$
begin
  if has_function_privilege(
       'myeongha_api_executor',
       'public.cmd_append_reading_clarification_v1(uuid,uuid,uuid,uuid,text,text,text,jsonb)',
       'EXECUTE'
     ) then
    raise exception 'myeongha_api_executor must not execute Reading clarification append while SRC-33 clarification positive admission is unresolved';
  end if;
end
$$;