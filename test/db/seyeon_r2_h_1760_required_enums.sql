-- Real cmd_store RPC guard probe; synthetic identifiers, no reserved ledger or Provider call.
-- Watchtower-Track: ops; CI-owned disposable PostgreSQL 17 ONLY.
-- psql -v expected_constraint=seyeon_provider_receipt_unreserved|seyeon_provider_receipt_malformed
\set ON_ERROR_STOP on
begin;
select set_config('myeongha.subject_id','00000000-0000-0000-0000-000000000002',true);
select set_config('myeongha.r2_expected_constraint', :'expected_constraint',true);
do $probe$
declare
 v_subject uuid:='00000000-0000-0000-0000-000000000002';
 v_turn uuid:='00000000-0000-0000-0000-000000000003';
 v_attempt uuid:='00000000-0000-0000-0000-000000000004';
 v_base jsonb:='{"schemaVersion":"seyeon-ai-cost-v1","callId":"00000000-0000-0000-0000-000000000001","purpose":"synthetic","providerKey":"synthetic","modelKey":"synthetic","priceVersion":"synthetic","outcome":"timeout","costStatus":"usage_unknown","elapsedMs":0,"invoiceReconciled":false}'::jsonb;
 v_event jsonb;
 v_variant text;
 v_constraint text;
 v_expected text:=current_setting('myeongha.r2_expected_constraint',true);
begin
 if v_expected not in ('seyeon_provider_receipt_unreserved','seyeon_provider_receipt_malformed') then
   raise exception 'HOLD_R2_H_1760_EXPECTATION_NOT_ALLOWLISTED';
 end if;
 for v_variant in select unnest(array['missing_outcome','missing_cost_status','null_outcome','null_cost_status']) loop
   v_event:=case v_variant
    when 'missing_outcome' then v_base-'outcome'
    when 'missing_cost_status' then v_base-'costStatus'
    when 'null_outcome' then jsonb_set(v_base,'{outcome}','null'::jsonb)
    when 'null_cost_status' then jsonb_set(v_base,'{costStatus}','null'::jsonb)
   end;
   begin
     perform 1 from public.cmd_store_seyeon_provider_receipt_v1(v_subject,v_turn,v_attempt,'chat',v_event);
     raise exception 'HOLD_R2_H_1760_MALFORMED_RECEIPT_ACCEPTED';
   exception when others then
     get stacked diagnostics v_constraint=constraint_name;
     if v_constraint is distinct from v_expected then
       raise exception 'HOLD_R2_H_1760_WRONG_FAILURE_%_GOT_%_EXPECTED_%',v_variant,v_constraint,v_expected;
     end if;
   end;
 end loop;
 -- Valid syntax must still reach the missing-reservation boundary, not be
 -- misclassified as malformed. This does NOT establish positive paid E2E.
 begin
   perform 1 from public.cmd_store_seyeon_provider_receipt_v1(v_subject,v_turn,v_attempt,'chat',v_base);
   raise exception 'HOLD_R2_H_1760_UNRESERVED_CALL_ACCEPTED';
 exception when others then
   get stacked diagnostics v_constraint=constraint_name;
   if v_constraint is distinct from 'seyeon_provider_receipt_unreserved' then
     raise exception 'HOLD_R2_H_1760_VALID_ENUM_DISPATCH_MISCLASSIFIED_%',v_constraint;
   end if;
 end;
 if (select count(*) from public.seyeon_ai_provider_receipt_queue_v1) <> 0 then
   raise exception 'HOLD_R2_H_1760_SYNTHETIC_QUEUE_MUTATED';
 end if;
end
$probe$;
rollback;
