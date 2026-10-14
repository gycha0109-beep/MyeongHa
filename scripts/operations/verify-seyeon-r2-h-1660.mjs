// Fail-closed R2-H 1660 independent reader-locator PG17 catalog verifier.
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const fail=s=>{throw Error('HOLD_R2_H_1660_'+s)};
const sha=/^[a-f0-9]{64}$/u;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const fields=['schemaVersion','pgMajor','subjectsPresent','threadCount','participantCount',
 'locatorCount','locatorInvoker','locatorStable','searchPathHardened',
 'apiExecutor','browserServiceExec','functionDdlSha','functionRawAclSha',
 'later1670Exists','reviewUnit','purchaseEntitlementVerified',
 'ambiguousTwoThreadRuntimeVerified','readerPublicationEnabled',
 'authorizedForProduction','drReady'];
const pinned='138eed0898a868c14200719e383f75302c379a26';
export function verify1660Source(text){
 if(typeof text!=='string'||text.length===0)fail('SOURCE_MISSING');
 const blob=createHash('sha1').update('blob '+Buffer.byteLength(text,'utf8')+'\0'+text).digest('hex');
 if(blob!==pinned)fail('SOURCE_BLOB_DRIFT');
 for(const snippet of [
  'security invoker','stable','limit 2;',
  "s.kind = 'member'","ct.thread_type = 'single_character'",
  "ct.status = 'active'",'ct.deleted_at is null',
  'ctc.left_at is null','order by ct.id',
  'assert_myeongha_subject_context_v1',
  'grant execute on function public.qry_member_single_character_thread_locator_v1'
 ]){
  if(!text.includes(snippet))fail('LOCATOR_SOURCE_BOUNDARY_MISSING');
 }
 return true;
}
export function check1660State(x,stage){
 if(!x||typeof x!=='object'||Array.isArray(x)
 ||!same(Object.keys(x).sort(),[...fields].sort())
 ||x.schemaVersion!=='seyeon-r2-h-1660-reader-locator-pg17-v1'
 ||x.pgMajor!==17||x.reviewUnit!=='reader-locator'
 ||x.purchaseEntitlementVerified!==false||x.ambiguousTwoThreadRuntimeVerified!==false
 ||x.readerPublicationEnabled!==false||x.authorizedForProduction!==false
 ||x.drReady!==false||x.later1670Exists!==false)fail('ENVELOPE');
 if(stage!=='absent'&&stage!=='applied')fail('INVALID_STAGE');
 if(x.subjectsPresent!==true||x.threadCount!==1||x.participantCount!==1)fail('BASELINE_AUTHORITY');
 const applied=stage==='applied';
 if(x.locatorCount!==(applied?1:0))fail('FUNCTION_COUNT');
 for(const name of ['locatorInvoker','locatorStable','searchPathHardened','apiExecutor']){
  if(x[name]!== (applied?true:null))fail('INVOKER_OR_GRANT_'+name);
 }
 if(x.browserServiceExec!==(applied?false:null))fail('CLIENT_EXEC');
 for(const k of ['functionDdlSha','functionRawAclSha']){
  if(applied?!sha.test(x[k]):x[k]!==null)fail('DIGEST_'+k);
 }
 return x;
}
export function verify1660Stages(before,applied,restored){
 const a=check1660State(before,'absent');
 check1660State(applied,'applied');
 const c=check1660State(restored,'absent');
 if(!same(a,c))fail('ROLLBACK_DRIFT');
 return {status:'PASS_R2_H_1660_READONLY_LOCATOR_ISOLATED_ROLLBACK',
  unit:'reader-locator',sourceBlobPinned:true,
  maxTwoCandidateSourceContractVerified:true,rlsSecurityInvoker:true,
  apiOnlyExecute:true,syntheticInvalidInputsBlocked:true,
  ambiguityRuntimeNotYetProven:true,
  noPurchaseEntitlementAuthority:true,publicReaderStillOff:true,
  rollbackClean:true,productionWrites:0,ownerApprovalEstablished:false,
  authorizedForProduction:false,drReady:false};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.length!==3)fail('USAGE');
  verify1660Source(readFileSync('supabase/migrations/1660_member_reader_existing_thread_locator_v1.sql','utf8'));
  const lines=readFileSync(process.argv[2],'utf8').trim().split(/\r?\n/u).filter(Boolean);
  if(lines.length!==3)fail('THREE_STAGES_REQUIRED');
  console.log(JSON.stringify(verify1660Stages(...lines.map(x=>JSON.parse(x)))));
 }catch(e){console.error(String(e.message).slice(0,210));process.exitCode=1;}
}
