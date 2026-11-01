-- Watchtower-Track: security
-- Disposable PostgreSQL authority rehearsal only. NEVER a Production migration.
-- Private RPCs remain unavailable to browser/Member/service_role.
begin;

grant execute on function public.internal_cmd_chat_credit_reserve_v1(uuid,uuid,uuid)
  to myeongha_commerce_internal_executor;
grant execute on function public.internal_cmd_chat_credit_ack_delivered_proven_v2(
  uuid,uuid,uuid,uuid,uuid,uuid
) to myeongha_commerce_internal_executor;

-- Do not grant direct wallet-table SELECT/UPDATE, finalize or signup here.
-- Release remains deliberately unmounted until a DB-owner-verified refund
-- interface can enforce its exact terminal-failure and reservation contract.
commit;
