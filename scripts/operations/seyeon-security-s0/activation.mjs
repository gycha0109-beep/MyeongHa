// Watchtower-Track: security
// Pure reviewed activation projection. Caller owns the transaction; no network.
import{SEYEON_SECURITY_S0_PRODUCTION_V1,SEYEON_SECURITY_S0_GOVERNOR_APPROVAL_V1}from'../../../apps/api/src/seyeon-security-s0-production-policy-v1.ts';
import{createHash}from'node:crypto';import{pathToFileURL}from'node:url';
// Operator cost exposure only. No extra per-user product/credit allowance:
// the required legacy Subject ceiling equals the global ceiling, so it cannot
// deny a Subject before the global budget already denies the same admission.
export const SEYEON_S0_BOUNDED_BUDGET_V1=Object.freeze({days:7,globalDailyMicroUsd:1000000});
const quote=value=>"'"+String(value).replaceAll("'","''")+"'";
export function buildSeyeonS0ActivationV1(startUtcDate){
 if(typeof startUtcDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(startUtcDate)||new Date(startUtcDate+'T00:00:00Z').toISOString().slice(0,10)!==startUtcDate)throw Error('Explicit canonical UTC start date required');
 const all=Object.values(SEYEON_SECURITY_S0_GOVERNOR_APPROVAL_V1.policies),model=all[0];
 if(all.some(p=>JSON.stringify({...p,allowedPurposes:[]})!==JSON.stringify({...model,allowedPurposes:[]})))throw Error('Role policy quote mismatch');
 const purposes=[...new Set(all.flatMap(p=>p.allowedPurposes))];
 const dates=Array.from({length:SEYEON_S0_BOUNDED_BUDGET_V1.days},(_,i)=>new Date(Date.parse(startUtcDate+'T00:00:00Z')+i*86400000).toISOString().slice(0,10));
 const cfg=SEYEON_SECURITY_S0_PRODUCTION_V1,rate=model.priceQuote,budget=SEYEON_S0_BOUNDED_BUDGET_V1;
 const grants=[
 'public.cmd_mark_seyeon_positive_context_ready_pinned_v1(uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,text)',
 'public.cmd_commit_seyeon_positive_chat_turn_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text,text,text)',
 'public.cmd_issue_seyeon_positive_first_reply_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,bytea)',
 'seyeon_private.cmd_ack_seyeon_positive_reply_v1(uuid,text)',
 'seyeon_private.cmd_request_seyeon_memory_revoke_v1(uuid,uuid)'];
 const sql=`-- Watchtower-Track: security
-- Bounded S0 activation; apply atomically AFTER verified source installation.
set local lock_timeout='5s';
set local statement_timeout='30s';
select pg_advisory_xact_lock(hashtextextended('seyeon-s0-bounded-activation-v1',0));
do $preflight$
begin
 if current_user<>'postgres' or current_database()<>'postgres' or
    current_setting('server_version_num')::int not between 170000 and 179999 then
   raise exception 'S0 activation target mismatch';
 end if;
 if to_regprocedure('seyeon_private.lock_positive_source_registry_v1(text,text,text)') is null or
    to_regprocedure('seyeon_private.cmd_ack_seyeon_positive_reply_v1(uuid,text)') is null then
   raise exception 'Verified complete S0 source installation required';
 end if;
 if (select count(*) from pg_roles where rolname in('myeongha_seyeon_subject_login','myeongha_seyeon_governed_login')
     and rolcanlogin and not rolinherit and not rolsuper and not rolbypassrls and not rolcreaterole and not rolcreatedb and not rolreplication)<>2
    or not pg_has_role('myeongha_seyeon_subject_login','myeongha_api_executor','MEMBER')
    or not pg_has_role('myeongha_seyeon_governed_login','myeongha_seyeon_governed_executor','MEMBER')
    or pg_has_role('myeongha_seyeon_subject_login','myeongha_seyeon_governed_executor','MEMBER')
    or pg_has_role('myeongha_seyeon_governed_login','myeongha_api_executor','MEMBER') then
   raise exception 'Actual isolated LOGIN authority required';
 end if;
 if exists(select 1 from public.seyeon_ai_governor_model_policies_v1 where provider_key=${quote(model.providerKey)} and model_key=${quote(model.modelKey)})
    or exists(select 1 from public.seyeon_ai_governor_daily_budgets_v1 where bucket_utc_date between ${quote(dates[0])}::date and ${quote(dates.at(-1))}::date) then
   raise exception 'Existing policy/budget must be reconciled, never overwritten';
 end if;
end $preflight$;
grant myeongha_seyeon_chat_runtime_owner to current_user;
do $registry_preflight$
begin
 if exists(select 1 from public.seyeon_positive_source_type_registry_v1 where enabled or writable_enabled
    or (record_kind,record_type,schema_version,projector_version) is distinct from
      ('memory',${quote(cfg.recordType)},${quote(cfg.schemaVersion)},${quote(cfg.projectorVersion)})) then
   raise exception 'S0 registry must be closed and limited to its original codec';
 end if;
end $registry_preflight$;
insert into public.seyeon_positive_source_type_registry_v1(record_kind,record_type,schema_version,projector_version,enabled,writable_enabled)
 values('memory',${quote(cfg.recordType)},${quote(cfg.schemaVersion)},${quote(cfg.projectorVersion)},true,false)
 on conflict(record_kind,record_type,schema_version,projector_version) do update set enabled=true,writable_enabled=false;
insert into public.seyeon_ai_governor_model_policies_v1(provider_key,model_key,policy_version,price_version,allowed_purposes,
 context_window_tokens,maximum_input_tokens,maximum_output_tokens,maximum_serialized_request_bytes,
 input_micro_usd_per_million,cached_input_micro_usd_per_million,output_micro_usd_per_million,is_active)
 values(${quote(model.providerKey)},${quote(model.modelKey)},${quote(model.policyVersion)},${quote(rate.priceVersion)},
 array[${purposes.map(quote).join(',')}]::text[],${model.contextWindowTokens},${model.maximumInputTokens},${model.maximumOutputTokens},${model.maximumSerializedRequestBytes},
 ${rate.inputMicroUsdPerMillion},${rate.cachedInputMicroUsdPerMillion},${rate.outputMicroUsdPerMillion},true);
insert into public.seyeon_ai_governor_daily_budgets_v1(bucket_utc_date,global_limit_micro_usd,subject_limit_micro_usd)
 values ${dates.map(d=>`(${quote(d)}::date,${budget.globalDailyMicroUsd},${budget.globalDailyMicroUsd})`).join(',\n ')};
grant execute on function ${grants.join(',\n ')} to myeongha_api_executor;
revoke all on function public.qry_seyeon_positive_first_memory_locked_reveal_v3(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text),
 public.cmd_accept_seyeon_private_conversation_recall_proposal_v1(uuid,uuid,uuid) from myeongha_api_executor;
revoke myeongha_seyeon_chat_runtime_owner from current_user;
`;
 return Object.freeze({sql,sha256LfUtf8:createHash('sha256').update(sql).digest('hex'),startUtcDate,endUtcDate:dates.at(-1),budget,policyVersion:model.policyVersion,model:model.modelKey});
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){const {sql,...metadata}=buildSeyeonS0ActivationV1(process.argv[2]);console.log(JSON.stringify({...metadata,sql}));}
