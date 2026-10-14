import {describe,it,expect} from 'vitest';
import {check1660State,verify1660Stages,verify1660Source} from '../scripts/operations/verify-seyeon-r2-h-1660.mjs';
const absent=()=>({
 schemaVersion:'seyeon-r2-h-1660-reader-locator-pg17-v1',pgMajor:17,
 subjectsPresent:true,threadCount:1,participantCount:1,locatorCount:0,
 locatorInvoker:null,locatorStable:null,searchPathHardened:null,
 apiExecutor:null,browserServiceExec:null,functionDdlSha:null,
 functionRawAclSha:null,later1670Exists:false,reviewUnit:'reader-locator',
 purchaseEntitlementVerified:false,ambiguousTwoThreadRuntimeVerified:false,
 readerPublicationEnabled:false,authorizedForProduction:false,drReady:false
});
const seq=()=>{
 const a=absent(),b=structuredClone(a);
 Object.assign(b,{locatorCount:1,locatorInvoker:true,locatorStable:true,
  searchPathHardened:true,apiExecutor:true,browserServiceExec:false,
  functionDdlSha:'a'.repeat(64),functionRawAclSha:'b'.repeat(64)});
 return [a,b,absent()];
};
describe('R2-H 1660 safe Member x Reader locator independent PG17',()=>{
 it('accepts exact RLS invoker/grant-only replay and rollback without public Reader launch',()=>{
  expect(verify1660Stages(...seq())).toMatchObject({
   status:'PASS_R2_H_1660_READONLY_LOCATOR_ISOLATED_ROLLBACK',
   publicReaderStillOff:true,rollbackClean:true,drReady:false});
 });
 it('rejects unverified source blob even with matching lexical snippets',()=>{
  expect(()=>verify1660Source('security invoker stable limit 2;')).toThrow('SOURCE_BLOB_DRIFT');
 });
 it('rejects missing Member/Thread/RLS underlying catalog',()=>{
  for(const [key,v] of [['subjectsPresent',false],['threadCount',0],['participantCount',0]]){
   const s=seq();s[0][key]=v;expect(()=>verify1660Stages(...s)).toThrow('BASELINE_AUTHORITY');
  }
 });
 it('rejects accidental SECURITY DEFINER, volatility, search path or API grant changes',()=>{
  for(const key of ['locatorInvoker','locatorStable','searchPathHardened','apiExecutor']){
   const s=seq();s[1][key]=false;expect(()=>verify1660Stages(...s)).toThrow('INVOKER_OR_GRANT_'+key);
  }
 });
 it('rejects browser or service direct function execution',()=>{
  const s=seq();s[1].browserServiceExec=true;
  expect(()=>verify1660Stages(...s)).toThrow('CLIENT_EXEC');
 });
 it('rejects preapplied 1670 or false purchase/public-release claims',()=>{
  for(const k of ['later1670Exists','purchaseEntitlementVerified','readerPublicationEnabled','ambiguousTwoThreadRuntimeVerified']){
   const s=seq();s[1][k]=true;expect(()=>verify1660Stages(...s)).toThrow('ENVELOPE');
  }
 });
 it('rejects failed restoration and invented raw result fields',()=>{
  const s=seq();s[2].locatorCount=1;
  expect(()=>verify1660Stages(...s)).toThrow('FUNCTION_COUNT');
  const b=seq();b[1].threadIds=['leak'];
  expect(()=>check1660State(b[1],'applied')).toThrow('ENVELOPE');
 });
});
