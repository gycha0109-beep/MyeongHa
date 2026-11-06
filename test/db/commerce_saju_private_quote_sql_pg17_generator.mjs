// Watchtower-Track: commerce
// Disposable PostgreSQL 17 only. Build the exact production-code SQL queries
// for one rolled-back synthetic schema execution; never use on hosted DB.
import {readFileSync} from 'node:fs';

if (process.env.GITHUB_ACTIONS!=='true'
 || process.env.DB_SUITE!=='postgres17'
 || process.env.PGHOST!=='localhost'
 || process.env.PGPORT!=='5432') {
  throw Error('SAJU_QUOTE_SQL_DISPOSABLE_PG17_ONLY');
}
function extract(path, exportName) {
  const s=readFileSync(path,'utf8');
  const tick=String.fromCharCode(96);
  const start=exportName+' = '+tick;
  const between=s.split(start)[1];
  const sql=between?.split(tick+'.trim();')[0]?.trim();
  if (!sql?.startsWith('select\n') || sql.includes('$'+'{') || sql.includes(';'))
    throw Error('SAJU_QUOTE_SQL_SOURCE_DRIFT_'+exportName);
  return sql;
}
const fields=extract(
 'apps/api/src/commerce-saju-current-grant-fields-v1.ts',
 'SAJU_CURRENT_GRANT_FIELDS_SQL_V1');
const ledgerFile='apps/api/src/commerce-saju-verified-ledger-source-v1.ts';
const ledger=extract(ledgerFile,'COMMERCE_SAJU_VERIFIED_LEDGER_SQL_V1');
const record=extract(ledgerFile,'COMMERCE_SAJU_VERIFIED_RECORD_SQL_V1');
const recordId="'1219c200-0000-4000-8000-000000000001'::uuid";
const subject='(select subject_id from public.commerce_saju_records_v1 where id='+recordId+')';
const natal='(select birth_revision_id from public.commerce_saju_records_v1 where id='+recordId+')';
function binds(sql,args) {
 return sql.replace(/\$(\d+)::uuid/gu,(ref,n)=>{
   const value=args[Number(n)-1];
   if (!value) throw Error('SAJU_QUOTE_SQL_UNEXPECTED_PARAM_'+ref);
   return value;
 });
}
const output=[
 '\\set ON_ERROR_STOP on',
 'begin;',
 "set local statement_timeout='40s';",
 '\\i docs/operations/candidates/commerce_saju_record_verified_purchase_ledger_v1.sql',
 '-- Existing synthetic B2 Reader Receipt is for SQL execution only,',
 '-- not an authorized Saju entitlement/Product or production Grant mapping.',
 'insert into public.commerce_saju_records_v1(id,subject_id,birth_revision_id)',
 'select '+recordId+',a.subject_id,b.source_birth_revision_id',
 'from public.standard_reading_reader_access_grants a',
 'join public.standard_reading_official_bindings b',
 ' on b.reading_id=a.official_reading_id and b.subject_id=a.subject_id',
 "where a.purchase_intent_id='12192300-0000-0000-0000-000000000002'::uuid;",
 'insert into public.commerce_saju_purchase_origins_v1',
 ' (purchase_intent_id,subject_id,saju_record_id,birth_revision_id,purchase_kind)',
 "select pi.id,pi.subject_id,r.id,r.birth_revision_id,'original'",
 'from public.commerce_saju_records_v1 r',
 'join public.purchase_intents pi on pi.subject_id=r.subject_id',
 " where pi.id='12192300-0000-0000-0000-000000000002'::uuid;",
 'create temporary table saju_probe_record on commit drop as',
 binds(record,[recordId,subject])+';',
 'create temporary table saju_probe_ledger on commit drop as',
 binds(ledger,[subject,recordId])+';',
 'create temporary table saju_probe_fields on commit drop as',
 binds(fields,[subject,recordId,natal])+';',
 'do $saju_pg17_quote$',
 'begin',
 ' if (select count(*) from saju_probe_record)<>1',
 '  or (select count(*) from saju_probe_ledger)<>1',
 '  or (select count(*) from saju_probe_fields)>32',
 '  or exists (select 1 from saju_probe_fields p',
 "      where p.\"receiptGrantedEventCount\" !~ '^[0-9]+$'",
 "       or p.\"validReceiptGrantedEventCount\" !~ '^[0-9]+$'",
 "       or p.\"providerRevocationEventCount\" !~ '^[0-9]+$') then",
 "  raise exception 'SAJU_REAL_PG17_PRIVATE_QUOTE_SQL_INVALID';",
 ' end if;',
 'end',
 '$saju_pg17_quote$;',
 "select 'SAJU_REAL_PG17_PRIVATE_QUOTE_SQL_ROLLBACK_PASS' as result;",
 'rollback;',
].join('\n')+'\n';
process.stdout.write(output);
