// Watchtower-Track: commerce-payment
// Emit assertion SQL for an ISOLATED disposable PostgreSQL 17 fixture only.
// Never pipe this to Production: the generated script includes fixture mutations.
import { COMMERCE_EXACT_READER_CANCELLATION_EVIDENCE_SQL_V1 as SQL }
 from '../../scripts/operations/commerce-exact-reader-cancellation-evidence-v1.mjs';

const EVENT_A='00000000-0000-4000-8000-000000000001';
const EVENT_B='00000000-0000-4000-8000-000000000007';
const GRANT_A='00000000-0000-4000-8000-000000000002';
const GRANT_B='00000000-0000-4000-8000-000000000006';
const SUBJECT='00000000-0000-4000-8000-000000000004';

function queryFor(event,grant){
 return SQL
  .replaceAll('$1::uuid',`'${event}'::uuid`)
  .replaceAll('$2::uuid',`'${grant}'::uuid`);
}
function assertRead({event=EVENT_A,grant=GRANT_A,status='active',effect=false}={}){
 return `
do $$
declare rec record; reader_b_count bigint;
begin
  select * into rec from (${queryFor(event,grant)}) as result;
  if rec."grantStatus" is distinct from '${status}'
    or rec."otherActiveReaderPurchaseGrants" is distinct from '1'
    or rec."exactRevokeEffectExists" is distinct from ${effect?'true':'false'} then
    raise exception 'exact Reader refund binding mismatch';
  end if;
  select count(*) into reader_b_count
  from public.entitlement_grants
  where id='${GRANT_B}'::uuid and subject_id='${SUBJECT}'::uuid and status='active';
  if reader_b_count<>1 then
    raise exception 'other Reader must retain an independent active Grant';
  end if;
end;
$$;
`;
}
const script=[
 assertRead(),
 `
update public.entitlement_grants
set status='revoked',revision=revision+1
where id='${GRANT_A}'::uuid;
insert into public.entitlement_events values(
 '${GRANT_A}'::uuid,'${SUBJECT}'::uuid,'provider_event',
 '${EVENT_A}'::uuid,'revoked','revoked');
`,
 assertRead({status:'revoked',effect:true}),
 `
do $$
declare rec record;
begin
  select * into rec from (${queryFor(EVENT_B,GRANT_B)}) as result;
  if rec."grantId" is not null then
    raise exception 'mismatched provider transaction lineage was admitted';
  end if;
end;
$$;
`,
 'select \'PRIVATE_READER_CANCELLATION_SQL_SMOKE_PASS\' as result;',
].join('\n');
process.stdout.write(script);
