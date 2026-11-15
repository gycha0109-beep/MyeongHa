-- Candidate only: T10 pair issuance HOLD / incident containment.
-- Never run by default. Stop the separate T10 worker before executing this
-- explicit issuer-only permission change on an independently approved DB.
-- This is not an activation, refund, account deletion or schema rollback.
-- Existing one-chart issuance, immutable signed proofs and paid Reader access
-- are intentionally NOT revoked or deleted.
--
-- Keep existing purchases/outbox jobs for owner-directed reconciliation; do
-- not re-dispatch a previous Saju source attempt as part of this procedure.
revoke execute on function
  public.qry_approved_saju_pair_issue_scope_v1(uuid,uuid),
  public.cmd_finalize_approved_saju_pair_reading_v1(
    uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,jsonb,text,jsonb
  ),
  public.qry_approved_saju_pair_recovery_record_v1(uuid,uuid)
  from myeongha_approved_saju_issuer_executor;
