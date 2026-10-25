-- Watchtower-Track: security
-- Forward-only emergency stop AFTER separately authorized installation.
-- No data deletion, history repair or consent-revoke capability removal.
begin;
set local lock_timeout='5s';
set local statement_timeout='10s';
-- Registry owner is a NOLOGIN role: shutdown must invoke its narrowly
-- scoped SECURITY DEFINER command, not assume raw UPDATE from postgres.
select seyeon_private.cmd_set_s0_positive_source_gate_v1(false);
-- Revoke NOLOGIN-owner function ACLs through the owner's sealed operation.
select seyeon_private.cmd_set_s0_owner_rpc_permissions_v1(false);
-- Metered use is also closed atomically, even if an old Worker continues
-- to receive requests while the edge emergency flag propagates.
update public.seyeon_ai_governor_model_policies_v1 set is_active=false
  where provider_key='openai-responses' and model_key='gpt-5.6-terra'
    and policy_version='seyeon-s0-receipt-production-20261025';
revoke all on function public.qry_seyeon_positive_first_memory_locked_reveal_v3(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,text) from myeongha_api_executor;
revoke all on function public.cmd_issue_seyeon_positive_first_reply_v1(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,bytea) from myeongha_api_executor;
-- Keep receipt ACK and request-revoke available: an incident stop must not
-- strand issued replies or remove an existing withdrawal request.
-- Keep seyeon_private.cmd_revoke_seyeon_memory_grant_v1 available so an
-- incident stop cannot remove the user's ability to withdraw existing grants.
commit;
