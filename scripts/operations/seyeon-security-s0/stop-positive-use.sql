-- Watchtower-Track: security
-- Forward-only emergency stop AFTER separately authorized installation.
-- No data deletion, history repair or consent-revoke capability removal.
begin;
set local lock_timeout='5s';
set local statement_timeout='10s';
update public.seyeon_positive_source_type_registry_v1
  set enabled=false,writable_enabled=false;
revoke all on function public.cmd_mark_seyeon_positive_context_ready_pinned_v1(
  uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,text),
  public.cmd_commit_seyeon_positive_chat_turn_v1(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text,text,text),
  public.qry_seyeon_positive_first_memory_locked_reveal_v3(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,text),
  public.cmd_accept_seyeon_private_conversation_recall_proposal_v1(uuid,uuid,uuid)
  from myeongha_api_executor;
-- Keep seyeon_private.cmd_revoke_seyeon_memory_grant_v1 available so an
-- incident stop cannot remove the user's ability to withdraw existing grants.
commit;
