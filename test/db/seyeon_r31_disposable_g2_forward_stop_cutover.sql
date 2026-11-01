-- Watchtower-Track: security
-- R31 final disposable DB ACL cutover: the API executor cannot invoke any
-- legacy positive G2 wrapper without complete G0/G1/G3/G4 owner approvals.
-- Execute ONLY after earlier R3/R25 compatibility tests; no Production DDL.
\set ON_ERROR_STOP on
begin;
do $precondition$
begin
  if current_database()<>'myeongha_seyeon_positive_pin_candidate_test'
    or current_setting('server_version_num')::integer<150000
    or to_regprocedure(
      'seyeon_positive_candidate.commit_actual_v2_r3(uuid,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text,text)'
    ) is null
    or to_regprocedure(
      'seyeon_positive_candidate.claim_two_original_stage_wire_r30(uuid,uuid,uuid,uuid,text,uuid,text,text,text)'
    ) is null
  then
    raise exception 'R31 G2 cutover refuses non-disposable or missing reviewed owner';
  end if;
end $precondition$;

-- No replacement approved G2 RPC is intentionally granted. Source/wire
-- stage receipts, synthetic cost settlement and G1 pinning do not authorize
-- a Chat Commit. Leave first-once G3 read and zero-source BASELINE unchanged.
revoke all on function seyeon_positive_candidate.commit_actual_v2_r3(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text,text
) from myeongha_api_executor,public,anon,authenticated,service_role;
revoke execute on function public.cmd_commit_seyeon_chat_turn_runtime_v2(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text
) from myeongha_api_executor;
revoke execute on function public.cmd_commit_seyeon_chat_turn_runtime_v1(
  uuid,uuid,uuid,uuid,uuid,uuid
) from myeongha_api_executor;
do $assert$
declare
  v_fn constant text:=
    'seyeon_positive_candidate.commit_actual_v2_r3(uuid,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text,text)';
begin
  if has_function_privilege('myeongha_api_executor',v_fn,'EXECUTE')
    or has_function_privilege('public',v_fn,'EXECUTE')
    or has_function_privilege('authenticated',v_fn,'EXECUTE')
    or has_function_privilege('service_role',v_fn,'EXECUTE')
    or has_function_privilege('myeongha_api_executor',
      'public.cmd_commit_seyeon_chat_turn_runtime_v2(uuid,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text)',
      'EXECUTE')
    or has_function_privilege('myeongha_api_executor',
      'public.cmd_commit_seyeon_chat_turn_runtime_v1(uuid,uuid,uuid,uuid,uuid,uuid)',
      'EXECUTE')
    or has_table_privilege('myeongha_api_executor',
      'seyeon_positive_candidate.native_stage_lineage_r30','SELECT')
    or has_table_privilege('myeongha_api_executor',
      'seyeon_positive_candidate.governed_wire_reservations_r28','SELECT')
  then
    raise exception 'R31 G2 positive-path role permission still exposed';
  end if;
end $assert$;
commit;
\echo 'PASS R31: named-disposable positive G2 API executor hard stopped; no production ACL touched'
