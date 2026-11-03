// Watchtower-Track: commerce-payment
// Private Reader staged production rollout metadata evidence ONLY; never launch.
const COUNT=59;
export const COMMERCE_READER_EXPECTED_STAGED_VERSIONS_V1=Object.freeze(
  Array.from({length:COUNT},(_,i)=>String(1740+i*10)));
const FUNCTIONS=Object.freeze([
  {key:'preparePaidDelivery',signature:'internal_prepare_official_reader_paid_delivery_v1(uuid,uuid,uuid,uuid,uuid,text)',version:'2140'},
  {key:'ackPaidDelivery',signature:'internal_ack_official_reader_paid_delivery_v1(uuid,uuid,uuid,uuid,uuid,text)',version:'2140'},
  {key:'reserveRefundDispatch',signature:'internal_reserve_reader_full_refund_dispatch_v1(uuid)',version:'2310'},
  {key:'recordRefundResponse',signature:'internal_record_reader_full_refund_response_v1(uuid,text,text)',version:'2310'},
  {key:'confirmRefundDispatch',signature:'internal_confirm_reader_full_refund_dispatch_v1(uuid,text)',version:'2310'},
]);
const TABLES=Object.freeze([
  {key:'protectedAnswerBody',table:'official_reader_paid_answer_bodies',version:'1950',force:true},
  {key:'verifiedSajuSource',table:'official_reader_s3_source_authority_receipts_v1',version:'2110',force:true},
  {key:'privateDeliveryAttempt',table:'official_reader_paid_delivery_attempts_v1',version:'2140',force:true},
  {key:'scopedRefundDispatch',table:'commerce_reader_full_refund_dispatches_v1',version:'2310',force:false},
  {key:'privateWithdrawalClaim',table:'digital_reading_withdrawal_claims_private_v1',version:'2320',force:false},
]);

// Four-digit reviewed versions only. This excludes all unrelated history.
export const COMMERCE_READER_STAGED_HISTORY_QUERY_V1=[
  'select version::text as "version"',
  'from supabase_migrations.schema_migrations',
  "where version between '1740' and '2320'",
  "and version ~ '^[0-9]{4}$'",
  'order by version',
].join('\n');

// PostgreSQL catalog metadata, not rows from customers or payments.
export const COMMERCE_READER_PRIVATE_ACL_QUERY_V1=[
 'with expected("schemaKey","tableName") as (',
 ' values',
 ...TABLES.map((x,i)=>" ('"+x.key+"','"+x.table+"')"+(i<TABLES.length-1?',':'')),
 ')',
 'select e."schemaKey",',
 ' c.oid is not null as "tablePresent",',
 ' coalesce(c.relkind='+ "'r'" +',false) as "ordinaryTable",',
 ' coalesce(c.relrowsecurity,false) as "rlsEnabled",',
 ' coalesce(c.relforcerowsecurity,false) as "rlsForced",',
 ' case when c.oid is null then null else (',
 "   has_table_privilege('anon',c.oid,'SELECT')",
 "   or has_table_privilege('anon',c.oid,'INSERT')",
 "   or has_table_privilege('anon',c.oid,'UPDATE')",
 "   or has_table_privilege('anon',c.oid,'DELETE'))",
 ' end as "anonDml",',
 ' case when c.oid is null then null else (',
 "   has_table_privilege('authenticated',c.oid,'SELECT')",
 "   or has_table_privilege('authenticated',c.oid,'INSERT')",
 "   or has_table_privilege('authenticated',c.oid,'UPDATE')",
 "   or has_table_privilege('authenticated',c.oid,'DELETE'))",
 ' end as "memberDml"',
 'from expected e',
 "left join pg_catalog.pg_class c on c.oid=to_regclass('public.'||e.\"tableName\")",
 'order by e."schemaKey"',
].join('\n');

// Internal transaction functions are NEVER public/Member direct RPCs.
export const COMMERCE_READER_PRIVATE_FUNCTION_ACL_QUERY_V1=[
 'with expected("functionKey","signature") as (',
 ' values',
 ...FUNCTIONS.map((x,i)=>" ('"+x.key+"','public."+x.signature+"')"+(i<FUNCTIONS.length-1?',':'')),
 ')',
 'select e."functionKey",',
 ' p.oid is not null as "functionPresent",',
 ' case when p.oid is null then null else',
 "   has_function_privilege('anon',p.oid,'EXECUTE') end as \"anonExecute\",",
 ' case when p.oid is null then null else',
 "   has_function_privilege('authenticated',p.oid,'EXECUTE') end as \"memberExecute\"",
 'from expected e',
 'left join pg_catalog.pg_proc p on p.oid=to_regprocedure(e."signature")',
 'order by e."functionKey"',
].join('\n');

function fail(code){throw Error(code);}
export async function inspectCommerceReaderProductionRolloutEvidenceV1(client){
  if(!client||typeof client.query!=='function')
    fail('COMMERCE_READER_ROLLOUT_CLIENT_REQUIRED');
  let began=false;
  try{
    await client.query('begin isolation level repeatable read read only');
    began=true;
    await client.query("set local statement_timeout='10000ms'");
    const authority=await client.query([
      'select current_setting('+"'transaction_read_only'"+')='+ "'on'"+' as "readOnly",',
      ' (rolsuper or rolbypassrls) as "completeVisibility"',
      'from pg_catalog.pg_roles where rolname=current_user',
    ].join(' '));
    if(authority?.rows?.length!==1||authority.rows[0]?.readOnly!==true
      ||authority.rows[0]?.completeVisibility!==true)
      fail('COMMERCE_READER_ROLLOUT_DB_AUDIT_AUTHORITY_REQUIRED');

    const history=await client.query(COMMERCE_READER_STAGED_HISTORY_QUERY_V1);
    if(!Array.isArray(history?.rows)||history.rows.length>COUNT)
      fail('COMMERCE_READER_ROLLOUT_HISTORY_UNTRUSTED');
    const found=new Set();
    for(const row of history.rows){
      if(!row||typeof row.version!=='string'
        ||!/^[0-9]{4}$/.test(row.version)
        ||found.has(row.version)
        ||!COMMERCE_READER_EXPECTED_STAGED_VERSIONS_V1.includes(row.version))
        fail('COMMERCE_READER_ROLLOUT_HISTORY_UNTRUSTED');
      found.add(row.version);
    }

    const meta=await client.query(COMMERCE_READER_PRIVATE_ACL_QUERY_V1);
    if(!Array.isArray(meta?.rows)||meta.rows.length!==TABLES.length)
      fail('COMMERCE_READER_ROLLOUT_ACL_UNTRUSTED');
    const seen=new Set(),missingTables=[],presentTables=[],unsafeAclTables=[],schemaHistoryMismatch=[];
    for(const row of meta.rows){
      const spec=TABLES.find(x=>x.key===row?.schemaKey);
      if(!spec||seen.has(spec.key)
        ||!['tablePresent','ordinaryTable','rlsEnabled','rlsForced']
          .every(k=>typeof row[k]==='boolean')
        ||(row.tablePresent
          ? typeof row.anonDml!=='boolean'||typeof row.memberDml!=='boolean'
          : row.anonDml!==null||row.memberDml!==null))
        fail('COMMERCE_READER_ROLLOUT_ACL_UNTRUSTED');
      seen.add(spec.key);
      if(!row.tablePresent)missingTables.push(spec.key);
      else{
        presentTables.push(spec.key);
        if(!row.ordinaryTable||!row.rlsEnabled||(spec.force&&!row.rlsForced)
          ||row.anonDml||row.memberDml)
          unsafeAclTables.push(spec.key);
      }
      if(row.tablePresent!==found.has(spec.version))
        schemaHistoryMismatch.push(spec.key);
    }
    const functions=await client.query(COMMERCE_READER_PRIVATE_FUNCTION_ACL_QUERY_V1);
    if(!Array.isArray(functions?.rows)||functions.rows.length!==FUNCTIONS.length)
      fail('COMMERCE_READER_ROLLOUT_FUNCTION_ACL_UNTRUSTED');
    const seenFunctions=new Set(),missingFunctions=[],unsafeFunctions=[],functionHistoryMismatch=[];
    for(const row of functions.rows){
      const spec=FUNCTIONS.find(x=>x.key===row?.functionKey);
      if(!spec||seenFunctions.has(spec.key)
        ||typeof row.functionPresent!=='boolean'
        ||(row.functionPresent
          ? typeof row.anonExecute!=='boolean'||typeof row.memberExecute!=='boolean'
          : row.anonExecute!==null||row.memberExecute!==null))
        fail('COMMERCE_READER_ROLLOUT_FUNCTION_ACL_UNTRUSTED');
      seenFunctions.add(spec.key);
      if(!row.functionPresent)missingFunctions.push(spec.key);
      else if(row.anonExecute||row.memberExecute)unsafeFunctions.push(spec.key);
      if(row.functionPresent!==found.has(spec.version))
        functionHistoryMismatch.push(spec.key);
    }
    const missingVersions=Object.freeze(COMMERCE_READER_EXPECTED_STAGED_VERSIONS_V1
      .filter(v=>!found.has(v)));
    const state=missingTables.length===TABLES.length
      &&missingFunctions.length===FUNCTIONS.length&&found.size===0
      ? 'staged_unmounted_hold'
      : missingVersions.length===0&&missingTables.length===0
        &&unsafeAclTables.length===0&&schemaHistoryMismatch.length===0
        &&missingFunctions.length===0&&unsafeFunctions.length===0
        &&functionHistoryMismatch.length===0
        ? 'schema_present_unverified'
        : 'staged_partial_or_unsafe_hold';
    return Object.freeze({
      schemaVersion:'commerce-reader-production-rollout-evidence-v1',
      state,expectedStagedMigrations:COUNT,appliedStagedMigrations:found.size,
      missingVersions,
      missingTables:Object.freeze(missingTables),
      presentTables:Object.freeze(presentTables),
      unsafeAclTables:Object.freeze(unsafeAclTables),
      schemaHistoryMismatch:Object.freeze(schemaHistoryMismatch),
      missingFunctions:Object.freeze(missingFunctions),
      unsafeFunctionGrants:Object.freeze(unsafeFunctions),
      functionHistoryMismatch:Object.freeze(functionHistoryMismatch),
      sajuProductionAuthority:'NOT_EVALUATED',
      legalAndMerchantAuthority:'NOT_EVALUATED',
      ownerRolloutApproval:'NOT_EVALUATED',
      productSaleAuthorized:false,
      paidReaderDeliveryAuthorized:false,
      customerRefundAuthorized:false,
      productionMigrationAuthorized:false,
      liveAuthorized:false,writesPerformed:false,
    });
  } finally {
    if(began)await client.query('rollback');
  }
}
