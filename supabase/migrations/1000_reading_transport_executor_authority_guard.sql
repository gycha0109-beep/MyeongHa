-- Reading transport executor authority guard.
--
-- P0-AUTH-01 itself is resolved by the dedicated NOBYPASSRLS
-- myeongha_api_executor subject-execution model (0790) and the production login-principal
-- binding (0800). That generic execution identity does not admit Product Reading transport.
--
-- Production Interpretation Authority remains HOLD and the public Product Reading runtime
-- remains BLOCKED. Until source authority is explicitly admitted and a governed application
-- transport caller is introduced, the Reading transport prepare/finalize commands must stay
-- outside the ordinary API executor allowlist. ProductReadingResponse v2 structural/semantic
-- admission and DB persistence invariants do not by themselves authorize production transport.

revoke all on function public.cmd_prepare_reading_transport_attempt_v1(
  uuid, uuid, uuid, text, text, text
) from public;

revoke all on function public.cmd_prepare_reading_transport_attempt_v1(
  uuid, uuid, uuid, text, text, text
) from myeongha_api_executor;

revoke all on function public.cmd_finalize_reading_transport_failure_v1(
  uuid, uuid, uuid, boolean, text, text
) from public;

revoke all on function public.cmd_finalize_reading_transport_failure_v1(
  uuid, uuid, uuid, boolean, text, text
) from myeongha_api_executor;

revoke all on function public.cmd_finalize_reading_transport_success_v1(
  uuid, uuid, uuid, uuid, text, text, text, text, text, text, text,
  jsonb, jsonb, jsonb, jsonb, text
) from public;

revoke all on function public.cmd_finalize_reading_transport_success_v1(
  uuid, uuid, uuid, uuid, text, text, text, text, text, text, text,
  jsonb, jsonb, jsonb, jsonb, text
) from myeongha_api_executor;

do $$
begin
  if has_function_privilege(
       'myeongha_api_executor',
       'public.cmd_prepare_reading_transport_attempt_v1(uuid,uuid,uuid,text,text,text)',
       'EXECUTE'
     )
     or has_function_privilege(
       'myeongha_api_executor',
       'public.cmd_finalize_reading_transport_failure_v1(uuid,uuid,uuid,boolean,text,text)',
       'EXECUTE'
     )
     or has_function_privilege(
       'myeongha_api_executor',
       'public.cmd_finalize_reading_transport_success_v1(uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,jsonb,jsonb,jsonb,jsonb,text)',
       'EXECUTE'
     ) then
    raise exception 'myeongha_api_executor must not execute Reading transport prepare/finalize commands while Product Reading authority is blocked';
  end if;
end
$$;
