// Watchtower-Track: commerce
// A real migrated PostgreSQL 17 shape/lineage probe for the two existing
// private customer-Claim evidence reads. Disposable CI only, BEGIN/ROLLBACK.
// This does not create a paid S5 body or assert statutory content delivery.
import {readFileSync} from 'node:fs';

if(process.env.GITHUB_ACTIONS!=='true'
 || process.env.DB_SUITE!=='postgres17'
 || process.env.PGHOST!=='localhost'
 || process.env.PGPORT!=='5432') {
 throw Error('COMMERCE_RECORDED_CLAIM_REAL_PG17_ONLY');
}

function exactSourceSql(path, name) {
 const source=readFileSync(path,'utf8');
 const tick=String.fromCharCode(96);
 const start=source.indexOf('export const '+name+'=');
 if(start<0)throw Error('COMMERCE_RECORDED_CLAIM_SQL_SOURCE_MISSING_'+name);
 const open=source.indexOf(tick,start);
 const close=source.indexOf(tick+'.trim();',open+1);
 if(open<0 || close<open)throw Error('COMMERCE_RECORDED_CLAIM_SQL_SOURCE_DRIFT_'+name);
 const sql=source.slice(open+1,close).trim();
 if(!sql.startsWith('select\n') || sql.includes('$'+'{')
    || sql.includes(';')) throw Error('COMMERCE_RECORDED_CLAIM_SQL_UNSAFE_'+name);
 return sql;
}
const cancelSql=exactSourceSql(
 'apps/api/src/commerce-recorded-reader-cancellation-evidence-v1.ts',
 'RECORDED_READER_CANCEL_EXACT_CLAIM_SQL_V1');
const s7Sql=exactSourceSql(
 'apps/api/src/commerce-recorded-reader-s7-evidence-v1.ts',
 'RECORDED_READER_S7_EXACT_PURCHASE_SQL_V1');

const b2="'12192300-0000-0000-0000-000000000002'::uuid";
const b3="'12192300-0000-0000-0000-000000000003'::uuid";
const unit="'12192400-0000-4000-8000-000000000002'::uuid";
const subject="(select subject_id from public.purchase_intents where id="+b2+")";
function bind(sql,purchase) {
 const args=[purchase,subject,unit];
 return sql.replace(/\$(\d+)::uuid/gu,(all,num)=>{
  const value=args[Number(num)-1];
  if(!value)throw Error('COMMERCE_RECORDED_CLAIM_UNEXPECTED_SQL_PARAMETER_'+all);
  return value;
 });
}
const lines=[
 '\\set ON_ERROR_STOP on',
 'begin;',
 "set local statement_timeout='40s';",
 '\\i docs/operations/candidates/commerce_portone_cancellation_event_persistence_v1.sql',
 '-- Reuse the genuine synthetic original verified B2 Reader Receipt and',
 '-- its pre-payment checkout notice; B3 is an independent purchased Reader.',
 '-- One stored PortOne Event is evidence only, not a refund or rights change.',
 'do $recorded_claim_setup$',
 'declare',
 ' v_receipt public.commerce_receipts%rowtype;',
 ' v_event uuid;',
 ' v_replay boolean;',
 'begin',
 ' select * into strict v_receipt from public.commerce_receipts',
 " where purchase_intent_id="+b2,
 "  and environment='production' and verification_status='verified';",
 ' if v_receipt.verified_amount_minor is distinct from 1',
 '    or (select count(*) from public.digital_reading_checkout_notice_presentations_v1',
 "     where purchase_intent_id="+b2+" and unit_id="+unit+")<>1",
 ' then raise exception '+"'COMMERCE_RECORDED_CLAIM_ORIGINAL_NOTICE_INVALID';"+' end if;',
 ' select x.provider_event_id,x.replayed into strict v_event,v_replay',
 ' from public.internal_persist_portone_cancellation_event_v1(',
 "  'synthetic-hmac-b2-payment','recorded-claim-source-b2','Transaction.Cancelled',",
 "  v_receipt.external_transaction_id,'full_cancel_shape_observed',",
 "  'hmac-sha256:k1:'||repeat('a',64),",
 "  'hmac-sha256:k1:'||repeat('b',64),",
 "  'hmac-sha256:k1:'||repeat('c',64),1,1) x;",
 " if v_event is null or v_replay is distinct from false then",
 "  raise exception 'COMMERCE_RECORDED_CLAIM_CANCEL_SOURCE_NOT_CREATED';",
 ' end if;',
 ' select x.provider_event_id,x.replayed into strict v_event,v_replay',
 ' from public.internal_persist_portone_cancellation_event_v1(',
 "  'synthetic-hmac-b2-payment','recorded-claim-source-b2','Transaction.Cancelled',",
 "  v_receipt.external_transaction_id,'full_cancel_shape_observed',",
 "  'hmac-sha256:k1:'||repeat('a',64),",
 "  'hmac-sha256:k1:'||repeat('b',64),",
 "  'hmac-sha256:k1:'||repeat('c',64),1,1) x;",
 " if v_event is null or v_replay is distinct from true then",
 "  raise exception 'COMMERCE_RECORDED_CLAIM_CANCEL_SOURCE_REPLAY_CHANGED';",
 ' end if;',
 'end',
 '$recorded_claim_setup$;',
 'create temporary table recorded_claim_b2_cancel on commit drop as',
 bind(cancelSql,b2)+';',
 'create temporary table recorded_claim_b3_cancel on commit drop as',
 bind(cancelSql,b3)+';',
 'create temporary table recorded_claim_b2_s7 on commit drop as',
 bind(s7Sql,b2)+';',
 'create temporary table recorded_claim_b3_s7 on commit drop as',
 bind(s7Sql,b3)+';',
 'do $recorded_claim_assert$',
 'begin',
 ' if (select count(*) from recorded_claim_b2_cancel)<>1',
 '   or (select count(*) from recorded_claim_b3_cancel)<>1',
 '   or exists (select 1 from recorded_claim_b2_cancel',
 "      where \"eventType\" is distinct from 'Transaction.Cancelled'",
 "       or \"eventStatus\" is distinct from 'verified'",
 "       or \"eventProvider\" is distinct from 'portone_v2'",
 "       or \"sourceSchema\" is distinct from 'commerce-portone-cancellation-source-v2'",
 "       or \"cancellationStatus\" is distinct from 'SUCCEEDED'",
 "       or \"exactAmountMinor\" is distinct from '1'",
 "       or \"originalPaidMinor\" is distinct from '1'",
 "       or \"providerOrderingKey\" is not null",
 "       or \"orderingProven\" is distinct from 'false'",
 "       or \"refundExecutionAuthorized\" is distinct from 'false'",
 "       or \"entitlementRevocationAuthorized\" is distinct from 'false')",
 '   or exists (select 1 from recorded_claim_b3_cancel',
 '     where "eventId" is not null)',
 ' then',
 "   raise exception 'COMMERCE_RECORDED_CLAIM_CROSS_PURCHASE_CANCEL_MISMATCH';",
 ' end if;',
 ' -- There is no Saju Production-authorized paid S5 body in this fixture.',
 ' -- Therefore neither a prepared HTTP response nor an ACK is evidence here.',
 ' if (select count(*) from recorded_claim_b2_s7)<>0',
 '    or (select count(*) from recorded_claim_b3_s7)<>0',
 '    or (select count(*) from public.official_reader_paid_delivery_attempts_v1',
 "       where subject_id="+subject+")<>0 then",
 "   raise exception 'COMMERCE_RECORDED_CLAIM_S7_FALSE_DELIVERY_PROOF';",
 ' end if;',
 'end',
 '$recorded_claim_assert$;',
 "select 'COMMERCE_RECORDED_CLAIM_CANCEL_S7_REAL_PG17_HOLD_PASS' as result;",
 'rollback;',
].join('\n')+'\n';
process.stdout.write(lines);
